/*
  Pagina home: scelta tra creare una chat o entrare in una esistente.
  Parla con Flask; Flask usa il client Python (socket) per parlare col server C#.
  Il nome utente è già stato inviato dalla pagina di accesso (index).

  Rotte che Flask deve esporre:
    GET  /                          -> render_template("index.html")
    GET  /home                      -> render_template("home.html")   (se non connesso: redirect a /)
    POST /api/connect               JSON {nick}                 -> {ok:true} | {ok:false, error}
    GET  /api/me                                                -> {ok:true, nick} | {ok:false}
    POST /api/disconnect                                        -> {ok:true}
    GET  /api/chats                                             -> {ok:true, chats:[{id, name, group, members:[...]}]}
    POST /api/chats                 JSON {name}                 -> {ok, id}   crea una chat (Group ON)
    POST /api/chats/<id>/join                                   -> {ok}       solo se la chat è Group ON
    POST /api/chats/<id>/leave                                  -> {ok}
    POST /api/chats/<id>/mode       JSON {group: true|false}    -> {ok}       Group ON / OFF
    POST /api/chats/<id>/send       JSON {text}                 -> {ok}
    GET  /api/stream                Server-Sent Events, ogni evento è JSON:
        {type:"chats", chats:[...]}
        {type:"message", chat_id, sender, text, ts}
        {type:"system", chat_id, text}
        {type:"closed"}

  Privacy: per una chat Group OFF si vedono solo nome e membri; il server non invia
  i messaggi a chi non è uno dei due partecipanti.
*/
const $ = (id) => document.getElementById(id);
const VIEWS = ["home", "create-view", "list-view", "chat-view"];
let stream = null;
let myNick = "";
let chats = [];
let activeId = null;
const history = new Map(); // chat_id -> [{kind, sender, text, ts}]

function show(id) {
  VIEWS.forEach((v) => ($(v).hidden = v !== id));
}

async function api(url, method, payload) {
  const opts = { method: method || "POST", headers: { "Content-Type": "application/json" } };
  if (payload) opts.body = JSON.stringify(payload);
  const res = await fetch(url, opts);
  return res.json();
}

const enc = encodeURIComponent;
const isMember = (c) => c.members.includes(myNick);
const activeChat = () => chats.find((c) => c.id === activeId) || null;
const clock = (ts) => (ts ? new Date(ts) : new Date()).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

function openStream() {
  stream = new EventSource("/api/stream");
  stream.onmessage = (e) => {
    const ev = JSON.parse(e.data);
    if (ev.type === "chats") {
      chats = ev.chats;
      renderList();
      if (activeId && !activeChat()) { leaveLocal("La chat è stata chiusa."); return; }
      if (activeId) renderChatHeader();
    } else if (ev.type === "message") {
      pushLine(ev.chat_id, { kind: ev.sender === myNick ? "me" : "other", sender: ev.sender, text: ev.text, ts: ev.ts });
    } else if (ev.type === "system") {
      pushLine(ev.chat_id, { kind: "sys", text: ev.text });
    } else if (ev.type === "closed") {
      goOffline();
    }
  };
  stream.onerror = () => goOffline();
}

function goOffline() {
  if (stream) { stream.close(); stream = null; }
  window.location.href = "/"; // connessione persa: si riparte dalla pagina del nome
}

/* ---------- home ---------- */
$("btn-create").addEventListener("click", () => {
  $("create-error").textContent = "";
  show("create-view");
  $("chat-name").focus();
});

$("btn-list").addEventListener("click", async () => {
  show("list-view");
  await refreshList();
});

$("logout-btn").addEventListener("click", async () => {
  await api("/api/disconnect");
  goOffline();
});

document.querySelectorAll("[data-back]").forEach((b) => b.addEventListener("click", () => show("home")));

/* ---------- crea chat ---------- */
$("create-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("chat-name").value.trim();
  if (!name) return;
  const r = await api("/api/chats", "POST", { name });
  if (!r.ok) { $("create-error").textContent = r.error || "Impossibile creare la chat."; return; }
  $("chat-name").value = "";
  // la chat compare in `chats` con il prossimo evento del server: la apro appena c'è
  enterChat(r.id, name);
});

/* ---------- lista chat ---------- */
async function refreshList() {
  $("list-error").textContent = "";
  const r = await api("/api/chats", "GET");
  if (!r.ok) { $("list-error").textContent = r.error || "Impossibile caricare l'elenco."; return; }
  chats = r.chats;
  renderList();
}
$("refresh-btn").addEventListener("click", refreshList);

function renderList() {
  const ul = $("chat-list");
  ul.replaceChildren();
  $("list-empty").hidden = chats.length > 0;

  chats.forEach((c) => {
    const member = isMember(c);
    const locked = !c.group && !member; // privata e non sono tra i due: non posso aprirla
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chat-item " + (c.group ? "public" : "private") + (locked ? " locked" : "");
    btn.setAttribute("aria-disabled", String(locked));

    const top = document.createElement("span");
    top.className = "top";
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = c.name;
    const tag = document.createElement("span");
    tag.className = "tag " + (c.group ? "public" : "private");
    tag.textContent = c.group ? "Group ON" : "Group OFF";
    top.append(name, tag);

    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = locked
      ? "Chat privata tra " + c.members.join(" e ") + ". Contenuto nascosto."
      : c.members.length + (c.members.length === 1 ? " partecipante: " : " partecipanti: ") + c.members.join(", ");

    btn.append(top, meta);
    if (!locked) btn.addEventListener("click", () => joinAndEnter(c));
    const li = document.createElement("li");
    li.appendChild(btn);
    ul.appendChild(li);
  });
}

async function joinAndEnter(c) {
  if (!isMember(c)) {
    const r = await api(`/api/chats/${enc(c.id)}/join`);
    if (!r.ok) { $("list-error").textContent = r.error || "Impossibile entrare nella chat."; return; }
  }
  enterChat(c.id, c.name);
}

/* ---------- chat ---------- */
function enterChat(id, fallbackName) {
  activeId = id;
  if (!chats.find((c) => c.id === id)) {
    // chat appena creata, non ancora nell'elenco: la mostro con i dati noti
    chats.push({ id, name: fallbackName, group: true, members: [myNick] });
  }
  show("chat-view");
  renderChatHeader();
  const log = $("log");
  log.replaceChildren();
  const lines = history.get(id) || [];
  if (!lines.length) log.appendChild(emptyItem("Ancora nessun messaggio. Scrivi per primo."));
  lines.forEach(drawLine);
  log.scrollTop = log.scrollHeight;
  $("text").focus();
}

function renderChatHeader() {
  const c = activeChat();
  if (!c) return;
  $("chat-title").textContent = c.name;
  $("chat-sub").textContent = c.group
    ? "Chat pubblica: chiunque può entrare e leggere."
    : "Chat privata 1 a 1: gli altri vedono solo che esiste.";
  $("group-switch").checked = c.group;
  $("group-label").textContent = c.group ? "Group ON" : "Group OFF";
}

function emptyItem(text) {
  const li = document.createElement("li");
  li.className = "empty";
  li.textContent = text;
  return li;
}

function drawLine(m) {
  const log = $("log");
  const empty = log.querySelector(".empty");
  if (empty) empty.remove();
  const li = document.createElement("li");
  li.className = "msg " + m.kind;
  if (m.kind === "sys") {
    li.textContent = m.text;
  } else {
    const who = document.createElement("span");
    who.className = "who";
    who.textContent = m.sender;
    const time = document.createElement("time");
    time.textContent = clock(m.ts);
    who.appendChild(time);
    const body = document.createElement("span");
    body.textContent = m.text; // textContent: nessun HTML iniettato dai messaggi
    li.append(who, body);
  }
  log.appendChild(li);
  log.scrollTop = log.scrollHeight;
}

function pushLine(chatId, m) {
  if (!history.has(chatId)) history.set(chatId, []);
  history.get(chatId).push(m);
  if (chatId === activeId && !$("chat-view").hidden) drawLine(m);
}

function leaveLocal(message) {
  history.delete(activeId);
  activeId = null;
  show("list-view");
  renderList();
  $("list-error").textContent = message || "";
}

$("leave-btn").addEventListener("click", async () => {
  const c = activeChat();
  if (!c) return;
  await api(`/api/chats/${enc(c.id)}/leave`);
  leaveLocal("");
});

$("group-switch").addEventListener("change", async (e) => {
  const c = activeChat();
  if (!c) return;
  const r = await api(`/api/chats/${enc(c.id)}/mode`, "POST", { group: e.target.checked });
  if (!r.ok) {
    e.target.checked = c.group; // il server ha rifiutato: ripristino l'interruttore
    pushLine(c.id, { kind: "sys", text: r.error || "Cambio modalità non riuscito (Group OFF richiede esattamente 2 partecipanti)." });
  }
});

$("send-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const c = activeChat();
  const text = $("text").value.trim();
  if (!c || !text) return;
  $("text").value = "";
  const r = await api(`/api/chats/${enc(c.id)}/send`, "POST", { text });
  if (!r.ok) pushLine(c.id, { kind: "sys", text: "Messaggio non inviato: " + (r.error || "errore") });
});

/* ---------- avvio ---------- */
async function init() {
  try {
    const r = await api("/api/me", "GET");
    if (!r.ok) { window.location.href = "/"; return; }
    myNick = r.nick;
    $("hello").textContent = "Ciao, " + myNick;
    openStream();
    show("home");
  } catch (err) {
    window.location.href = "/";
  }
}
init();
