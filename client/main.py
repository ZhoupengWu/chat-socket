import os
from flask import Flask, render_template, request, jsonify, Response
import socket
import threading
import queue
from dotenv import load_dotenv

load_dotenv() # Carica le variabili d'ambiente dal file .env

client = None
IP_ADDRESS = os.getenv("IP_ADDRESS")
IP_ADDRESS_PORT = os.getenv("IP_ADDRESS_PORT")

app = Flask(__name__)

class SocketCommunication:
    def __init__(self):
        self.client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.client.connect((IP_ADDRESS, IP_ADDRESS_PORT))
        self.client.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
        self.queue = queue.Queue()
        self.active = True
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

            while b"\n" in buffer:
                row, buffer = buffer.split(b"\n", 1)
                self.queue.put(row.decode("utf-8"))

    def send(self, text):
        self.client.sendall((text + "\n").encode("utf-8"))

    def close(self):
        self.active = False

        try:
            self.client.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass

        self.client.close()

def createSocket() -> socket.socket:
    """
        Crea un socket client
    """

    return socket.socket(socket.AF_INET, socket.SOCK_STREAM)

def connectionTCP(message: str):
    client = createSocket()
    client.connect((IP_ADDRESS, IP_ADDRESS_PORT))
    client.sendall(message.encode())
    response = client.recv(2048)
    client.close()

    return response.decode()

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


@app.route("/")
def index():
    return render_template("index.html")

@app.route("/stream")
def stream():
    global client

    client = SocketCommunication()

    def generate():
        while True:
            try:
                msg = client.queue.get(timeout=15)
            except queue.Empty:
                yield ": ping\n\n"

                continue

            if msg is None:
                yield "event: chiuso\ndata: -\n\n"

                break

            yield f"data: {msg}\n\n"

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
    # riceve: {"type": "connessione"}
    dati, errore = readJson("connessione")
    if errore:
        return errore

    # TODO: creare la socket col server C# e chiedere la lista delle chat.
    # Per ora dati di prova (lista vuota = nessuna chat disponibile).
    chat = [
        {"chat_id": 1, "name": "generale", "is_private": False},
        {"chat_id": 2, "name": "amici", "is_private": True},
    ]

    return jsonify(chat)

@app.route("/api/create", methods=["POST"])
def create():
    # riceve: {"type": "crea", "name": "nome della chat"}
    dati, errore = readJson("crea", ["name"])
    if errore:
        return errore

    # TODO: inoltrare al server C# il nome della chat da creare
    return jsonify({"status": "ok", "name": dati["name"]})

@app.route("/api/message", methods=["POST"])
def message():
    # riceve: {"type": "messaggi", "content_message": "testo"}
    dati, errore = readJson("messaggi", ["content_message"])
    if errore:
        return errore

    # TODO: inoltrare il messaggio al server C#
    return jsonify({"status": "ok"})

@app.route("/api/close", methods=["POST"])
def close():
    # riceve: {"type": "chiusura"}
    dati, errore = readJson("chiusura")
    if errore:
        return errore

    # TODO: chiudere la socket tra client e server
    return jsonify({"status": "ok"})

app.run(
    host="127.0.0.1",
    port=5000,
    debug=False
)
