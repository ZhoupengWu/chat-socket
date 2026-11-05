from flask import Flask, jsonify, request, render_template

app = Flask(__name__)

# TODO: qui verrà aperta la socket TCP verso il server C#


def leggi_json(type_atteso, campi_richiesti=()):
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


@app.route("/api/connection", methods=["POST"])
def connection():
    # riceve: {"type": "connessione"}
    dati, errore = leggi_json("connessione")
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
    dati, errore = leggi_json("crea", ["name"])
    if errore:
        return errore

    # TODO: inoltrare al server C# il nome della chat da creare
    return jsonify({"status": "ok", "name": dati["name"]})


@app.route("/api/message", methods=["POST"])
def message():
    # riceve: {"type": "messaggi", "content_message": "testo"}
    dati, errore = leggi_json("messaggi", ["content_message"])
    if errore:
        return errore

    # TODO: inoltrare il messaggio al server C#
    return jsonify({"status": "ok"})


@app.route("/api/close", methods=["POST"])
def close():
    # riceve: {"type": "chiusura"}
    dati, errore = leggi_json("chiusura")
    if errore:
        return errore

    # TODO: chiudere la socket tra client e server
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(debug=True)