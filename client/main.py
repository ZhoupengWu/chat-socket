import json
import os
import queue
import socket
import threading

from dotenv import load_dotenv
from flask import Flask, Response, jsonify, render_template, request

load_dotenv()  # Carica le variabili d'ambiente dal file .env

IP_ADDRESS = os.getenv("IP_ADDRESS", "127.0.0.1")
IP_ADDRESS_PORT = int(os.getenv("IP_ADDRESS_PORT", "5000"))  # porta del server C#
FLASK_PORT = int(os.getenv("FLASK_PORT", "8000"))            # porta di Flask (diversa da quella del server C#)

TERMINATORE = b"\n\n\n"  # fine di ogni messaggio, uguale a quello del server C#

app = Flask(__name__)

# Un solo utente per client: basta una socket globale
client = None
client_lock = threading.Lock()


class SocketCommunication:
    def __init__(self):
        self.client = socket.create_connection((IP_ADDRESS, IP_ADDRESS_PORT), timeout=5)
        self.client.settimeout(None)
        self.client.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
        self.queue = queue.Queue()
        self.active = True
        self.send_lock = threading.Lock()
        threading.Thread(target=self._receive, daemon=True).start()

    def _receive(self):
        buffer = b""

        while self.active:
            try:
                data = self.client.recv(2048)
            except OSError:
                break

            if not data:
                break

            buffer += data

            while TERMINATORE in buffer:
                row, buffer = buffer.split(TERMINATORE, 1)
                testo = row.decode("utf-8", errors="replace").strip()
                if testo:
                    self.queue.put(testo)

        # La socket e' chiusa: None avvisa lo stream, che manda l'evento "chiuso" al browser
        self.active = False
        self.queue.put(None)

    def send(self, text):
        with self.send_lock:
            self.client.sendall(text.encode("utf-8") + TERMINATORE)

    def close(self):
        self.active = False

        try:
            self.client.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass

        self.client.close()


def readJson(type_atteso, campi_richiesti=()):
    """Legge il JSON della richiesta e controlla type e campi.
    Ritorna (dati, None) se tutto ok, altrimenti (None, risposta_errore)."""

    dati = request.get_json(silent=True)

    if not isinstance(dati, dict):
        return None, (jsonify({"errore": "JSON non valido"}), 400)

    if dati.get("type") != type_atteso:
        return None, (jsonify({"errore": f"type deve essere '{type_atteso}'"}), 400)

    for campo in campi_richiesti:
        if not dati.get(campo):
            return None, (jsonify({"errore": f"manca il campo '{campo}'"}), 400)

    return dati, None


def inoltra(payload):
    """Manda il JSON al server C#. La risposta del server arriva dallo /stream,
    quindi qui si ritorna solo l'esito dell'invio."""

    with client_lock:
        c = client

    if c is None or not c.active:
        return jsonify({"errore": "Non sei connesso al server"}), 409

    try:
        c.send(json.dumps(payload))
    except OSError:
        return jsonify({"errore": "Connessione con il server persa"}), 502

    return jsonify({"status": "ok"})


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/stream")
def stream():
    # Lo stream usa la socket creata da /api/connection
    with client_lock:
        c = client

    def generate():
        if c is None:
            yield "event: chiuso\ndata: -\n\n"
            return

        try:
            while True:
                try:
                    msg = c.queue.get(timeout=15)
                except queue.Empty:
                    yield ": ping\n\n"
                    continue

                if msg is None:
                    yield "event: chiuso\ndata: -\n\n"
                    break

                yield f"data: {msg}\n\n"
        finally:
            # Il browser ha chiuso lo stream oppure la socket e' caduta
            c.close()

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no"
        }
    )


@app.route("/api/connection", methods=["POST"])
def connection():
    # riceve: {"type": "connessione", "sender": "nome utente"}
    # La lista delle chat arriva dallo /stream
    global client

    dati, errore = readJson("connessione", ["sender"])
    if errore:
        return errore

    with client_lock:
        if client is not None:
            client.close()
            client = None

        try:
            client = SocketCommunication()
        except OSError:
            return jsonify({"errore": "Server non raggiungibile"}), 502

    return inoltra({"type": "connessione", "sender": dati["sender"]})


@app.route("/api/create", methods=["POST"])
def create():
    # riceve: {"type": "crea", "name": "nome della chat", "is_private": true/false}
    dati, errore = readJson("crea", ["name"])
    if errore:
        return errore

    return inoltra({
        "type": "crea",
        "name": dati["name"],
        "is_private": bool(dati.get("is_private", False))
    })


@app.route("/api/message", methods=["POST"])
def message():
    # riceve: {"type": "messaggi", "name": "nome della chat", "content_message": "testo"}
    # Senza content_message apre la chat: il server manda lo storico sullo /stream
    dati, errore = readJson("messaggi", ["name"])
    if errore:
        return errore

    payload = {"type": "messaggi", "name": dati["name"]}

    if dati.get("content_message"):
        payload["content_message"] = dati["content_message"]

    return inoltra(payload)


@app.route("/api/close", methods=["POST"])
def close():
    # riceve: {"type": "chiusura"}
    # Il server risponde e chiude la socket: lo /stream manda poi l'evento "chiuso"
    dati, errore = readJson("chiusura")
    if errore:
        return errore

    return inoltra({"type": "chiusura"})


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=FLASK_PORT,
        debug=False,
        threaded=True,
        use_reloader=False
    )
