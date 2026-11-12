// ---------- Elementi della pagina ----------

const vistaLogin = document.getElementById("vista-login");
const vistaChat = document.getElementById("vista-chat");
const boxErrore = document.getElementById("errore");

const formConnessione = document.getElementById("form-connessione");
const inputSender = document.getElementById("input-sender");
const btnContinua = document.getElementById("btn-continua");

const listaChat = document.getElementById("lista-chat");
const formCrea = document.getElementById("form-crea");
const inputNomeChat = document.getElementById("input-nome-chat");
const checkPrivata = document.getElementById("check-privata");
const btnEsci = document.getElementById("btn-esci");

const titoloChat = document.getElementById("titolo-chat");
const listaMessaggi = document.getElementById("messaggi");
const formMessaggio = document.getElementById("form-messaggio");
const inputMessaggio = document.getElementById("input-messaggio");
const btnInvia = document.getElementById("btn-invia");

// ---------- Stato ----------

let stream = null;        // EventSource aperto su /stream
let mioNome = "";         // il sender scelto alla connessione
let chatCorrente = null;  // nome della chat aperta

// ---------- Chiamate al client Flask ----------

// Invia un JSON in POST. Le risposte del server C# non arrivano da qui ma dallo stream.
async function inviaJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  let dati = null;
  try {
    dati = await response.json();
  } catch (err) {
    // risposta senza JSON
  }

  if (!response.ok) {
    throw new Error((dati && dati.errore) || "Errore HTTP " + response.status);
  }
  return dati;
}

// type "connessione" + sender
function connessione(sender) {
  return inviaJson("/api/connection", { type: "connessione", sender: sender });
}

// type "crea" + name + is_private
function creaChat(name, isPrivate) {
  return inviaJson("/api/create", { type: "crea", name: name, is_private: isPrivate });
}

// type "messaggi" + name, senza content_message: apre la chat e chiede lo storico
function apriChat(name) {
  return inviaJson("/api/message", { type: "messaggi", name: name });
}

// type "messaggi" + name + content_message
function inviaMessaggio(name, testo) {
  return inviaJson("/api/message", { type: "messaggi", name: name, content_message: testo });
}

// type "chiusura"
function chiudi() {
  return inviaJson("/api/close", { type: "chiusura" });
}

// ---------- Stream: quello che manda il server C# ----------

function apriStream() {
  const sorgente = new EventSource("/stream");
  stream = sorgente;

  sorgente.onmessage = (evento) => {
    let msg;
    try {
      msg = JSON.parse(evento.data);
    } catch (err) {
      console.error("Messaggio non valido:", evento.data);
      return;
    }
    gestisciMessaggio(msg);
  };

  // La socket col server C# e' stata chiusa
  sorgente.addEventListener("chiuso", () => {
    sorgente.close();
    if (stream === sorgente) {
      stream = null;
      tornaAlLogin();
    }
  });

  sorgente.onerror = () => {
    sorgente.close();
    if (stream === sorgente) {
      stream = null;
      tornaAlLogin();
      mostraErrore("Connessione persa");
    }
  };
}

function chiudiStream() {
  if (stream) {
    stream.close();
    stream = null;
  }
}

function gestisciMessaggio(msg) {
  switch (msg.type) {
    case "connessione":
      // Connessione accettata: arriva la lista delle chat
      nascondiErrore();
      vistaLogin.hidden = true;
      vistaChat.hidden = false;
      mostraListaChat(msg.chats || []);
      break;

    case "crea":
      // Qualcuno ha creato una chat: arriva la lista aggiornata
      mostraListaChat(msg.chats || []);
      break;

    case "messaggi":
      if (Array.isArray(msg.messages)) {
        // Chat aperta: arriva lo storico
        nascondiErrore();
        chatCorrente = msg.name;
        titoloChat.textContent = msg.name;
        listaMessaggi.replaceChildren();
        msg.messages.forEach((m) => aggiungiMessaggio(m.sender, m.content_message));
        inputMessaggio.disabled = false;
        btnInvia.disabled = false;
        evidenziaChatCorrente();
        inputMessaggio.focus();
      } else if (msg.name === chatCorrente) {
        // Nuovo messaggio nella chat aperta
        aggiungiMessaggio(msg.sender, msg.content_message);
      }
      break;

    case "errore":
      mostraErrore(msg.content_message);
      break;

    case "chiusura":
      // Subito dopo arriva l'evento "chiuso"
      break;

    default:
      console.warn("Type sconosciuto:", msg);
  }
}

// ---------- Aggiornamento della pagina ----------

function mostraListaChat(chats) {
  listaChat.replaceChildren();

  if (chats.length === 0) {
    const vuoto = document.createElement("li");
    vuoto.className = "vuoto";
    vuoto.textContent = "Nessuna chat";
    listaChat.appendChild(vuoto);
    return;
  }

  chats.forEach((c) => {
    const voce = document.createElement("li");
    const bottone = document.createElement("button");
    bottone.type = "button";
    bottone.dataset.name = c.name;
    bottone.textContent = c.is_private ? c.name + " (privata)" : c.name;
    bottone.addEventListener("click", async () => {
      try {
        await apriChat(c.name);
      } catch (err) {
        mostraErrore(err.message);
      }
    });
    voce.appendChild(bottone);
    listaChat.appendChild(voce);
  });

  evidenziaChatCorrente();
}

function evidenziaChatCorrente() {
  listaChat.querySelectorAll("button").forEach((b) => {
    b.classList.toggle("attiva", b.dataset.name === chatCorrente);
  });
}

function aggiungiMessaggio(sender, testo) {
  const voce = document.createElement("li");
  if (sender === mioNome) {
    voce.className = "mio";
  }

  const autore = document.createElement("strong");
  autore.textContent = sender;

  const contenuto = document.createElement("span");
  contenuto.textContent = testo;

  voce.append(autore, contenuto);
  listaMessaggi.appendChild(voce);
  listaMessaggi.scrollTop = listaMessaggi.scrollHeight;
}

function tornaAlLogin() {
  chatCorrente = null;
  vistaChat.hidden = true;
  vistaLogin.hidden = false;
  listaChat.replaceChildren();
  listaMessaggi.replaceChildren();
  titoloChat.textContent = "Scegli una chat";
  inputMessaggio.disabled = true;
  btnInvia.disabled = true;
}

function mostraErrore(testo) {
  boxErrore.textContent = testo;
  boxErrore.hidden = false;
}

function nascondiErrore() {
  boxErrore.hidden = true;
}

// ---------- Eventi ----------

formConnessione.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  const sender = inputSender.value.trim();
  if (!sender) return;

  btnContinua.disabled = true;
  nascondiErrore();
  chiudiStream();

  try {
    await connessione(sender);
    mioNome = sender;
    apriStream();
  } catch (err) {
    mostraErrore(err.message);
  } finally {
    btnContinua.disabled = false;
  }
});

formCrea.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  const name = inputNomeChat.value.trim();
  if (!name) return;

  try {
    await creaChat(name, checkPrivata.checked);
    inputNomeChat.value = "";
    checkPrivata.checked = false;
  } catch (err) {
    mostraErrore(err.message);
  }
});

formMessaggio.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  const testo = inputMessaggio.value.trim();
  if (!testo || !chatCorrente) return;

  try {
    await inviaMessaggio(chatCorrente, testo);
    inputMessaggio.value = "";
  } catch (err) {
    mostraErrore(err.message);
  }
});

btnEsci.addEventListener("click", async () => {
  try {
    await chiudi();
  } catch (err) {
    // Se il server non risponde si esce comunque
    chiudiStream();
    tornaAlLogin();
  }
});
