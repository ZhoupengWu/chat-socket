/*
  Pagina di accesso: si inserisce solo il nome utente.
  POST /api/connect {nick} -> {ok:true} | {ok:false, error}, poi si passa a /home.
*/
const form = document.getElementById("entry-form");
const nick = document.getElementById("nick");
const button = document.getElementById("enter-btn");
const errorBox = document.getElementById("entry-error");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = nick.value.trim();
  if (!name) {
    errorBox.textContent = "Scrivi un nome utente.";
    return;
  }
  errorBox.textContent = "";
  button.disabled = true;
  button.textContent = "Connessione…";
  try {
    const res = await fetch("/api/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nick: name }),
    });
    const r = await res.json();
    if (!r.ok) throw new Error(r.error || "Connessione al server rifiutata.");
    window.location.href = "/home";
  } catch (err) {
    errorBox.textContent = err.message;
    button.disabled = false;
    button.textContent = "Entra";
  }
});
