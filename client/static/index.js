// Invia un JSON in POST e ritorna la risposta già convertita in oggetto/array
async function inviaJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error("Errore HTTP " + response.status);
  }
  return response.json();
}

// type "connessione" -> array di {chat_id, name, is_private}
function connessione() {
  return inviaJson("/api/connection", { type: "connessione" });
}

// type "crea" + name
function creaChat(name) {
  return inviaJson("/api/create", { type: "crea", name: name });
}

// type "messaggi" + content_message
function inviaMessaggio(testo) {
  return inviaJson("/api/message", { type: "messaggi", content_message: testo });
}

// type "chiusura"
function chiudi() {
  return inviaJson("/api/close", { type: "chiusura" });
}

const btn = document.getElementById("btn-continua");

btn.addEventListener("click", async () => {
  btn.disabled = true;
  try {
    const chat = await connessione();
    console.log(chat);

    chat.forEach((c) => {
      console.log(c.chat_id, c.name, c.is_private);
    });
  } catch (err) {
    console.error("Errore nella fetch:", err);
  } finally {
    btn.disabled = false;
  }
});