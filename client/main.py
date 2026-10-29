import os
from flask import Flask, render_template
import socket
from dotenv import load_dotenv

load_dotenv() # Carica le variabili d'ambiente dal file .env

IP_ADDRESS = os.getenv("IP_ADDRESS")
IP_ADDRESS_PORT = os.getenv("IP_ADDRESS_PORT")

app = Flask(__name__)

def __createSocket() -> socket.socket:
    """
        Crea un socket client
    """

    return socket.socket(socket.AF_INET, socket.SOCK_STREAM)

def connectionTCP(message: str):
    client = __createSocket()
    client.connect((IP_ADDRESS, IP_ADDRESS_PORT))
    client.sendall(message.encode())

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/connection")
def connection():
    pass
