using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;

public class SynchronousSocketListener {

    public static void StartListening() {
        IPAddress ipAddress = IPAddress.Any;
        IPEndPoint localEndPoint = new IPEndPoint(ipAddress, 5000);

        Socket listener = new Socket(ipAddress.AddressFamily,
            SocketType.Stream, ProtocolType.Tcp);

        Console.WriteLine("Timeout : {0}", listener.ReceiveTimeout);

        ClientManager.CaricaChat();

        try {
            listener.Bind(localEndPoint);
            listener.Listen(10);

            while (true) {
                Console.WriteLine("Waiting for a connection...");
                Socket handler = listener.Accept();
                ClientManager clientThread = new ClientManager(handler);
                Thread t = new Thread(new ThreadStart(clientThread.DoClient));
                t.Start();
            }
        }
        catch (Exception e) {
            Console.WriteLine(e.ToString());
        }

        Console.WriteLine("\nPress ENTER to continue...");
        Console.Read();
    }

    public static int Main(String[] args) {
        StartListening();

        return 0;
    }
}

public class ClientManager {

    const string Terminatore = "\n\n\n";
    const string FileChat = "chats.json";
    const int MaxPrivata = 2;
    const int MaxPubblica = 5;

    static readonly JsonSerializerOptions jsonOptions = new JsonSerializerOptions {
        AllowTrailingCommas = true, // accetta la virgola finale nel json
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull // non scrive i campi null nelle risposte
    };

    static readonly JsonSerializerOptions fileOptions = new JsonSerializerOptions {
        WriteIndented = true
    };

    // Stato condiviso tra tutti i client, protetto da lockStato
    static readonly object lockStato = new object();
    static List<Chat> chats = new List<Chat>();
    static readonly List<ClientManager> clients = new List<ClientManager>();
    static int prossimoId = 1;

    readonly Socket clientSocket;
    readonly object lockInvio = new object(); // più thread possono scrivere sullo stesso socket
    readonly Decoder decoder = Encoding.UTF8.GetDecoder();
    readonly byte[] bytes = new byte[1024];
    readonly char[] chars = new char[1024];
    string data = "";

    // Questi tre campi si leggono e si scrivono solo dentro lock (lockStato)
    bool connesso = false;
    string sender = "";
    Chat? chatAperta = null;

    public ClientManager(Socket clientSocket) {
        this.clientSocket = clientSocket;
    }

    public static void CaricaChat() {
        lock (lockStato) {
            if (!File.Exists(FileChat)) return;

            try {
                List<Chat>? lette = JsonSerializer.Deserialize<List<Chat>>(File.ReadAllText(FileChat));

                if (lette != null) chats = lette;

                foreach (Chat chat in chats) {
                    if (int.TryParse(chat.chat_id, out int id) && id >= prossimoId) {
                        prossimoId = id + 1;
                    }
                }

                Console.WriteLine("Chat caricate dal file: {0}", chats.Count);
            }
            catch (Exception e) when (e is JsonException || e is IOException) {
                Console.WriteLine("Impossibile leggere {0}: {1}", FileChat, e.Message);
            }
        }
    }

    private static void SalvaChat() {
        try {
            string temporaneo = FileChat + ".tmp";
            File.WriteAllText(temporaneo, JsonSerializer.Serialize(chats, fileOptions));
            File.Move(temporaneo, FileChat, true);
        }
        catch (IOException e) {
            Console.WriteLine("Impossibile salvare {0}: {1}", FileChat, e.Message);
        }
    }

    public void DoClient() {
        try {
            bool aperto = true;

            while (aperto) {
                string? testo = RiceviMessaggio();

                if (testo == null) break; // il client ha chiuso il socket

                Console.WriteLine("Protocollo di messaggio: {0}", testo);

                Messaggio? messaggio;

                try {
                    messaggio = JsonSerializer.Deserialize<Messaggio>(testo, jsonOptions);
                }
                catch (JsonException) {
                    InviaErrore("Json non valido");

                    continue;
                }

                if (messaggio == null || string.IsNullOrEmpty(messaggio.type)) {
                    InviaErrore("Campo type mancante");

                    continue;
                }

                aperto = Gestisci(messaggio);
            }
        }
        catch (SocketException e) {
            Console.WriteLine("Errore socket: {0}", e.Message);
        }
        catch (ObjectDisposedException) { }
        finally {
            Chiudi();
        }
    }

    // Legge dal socket finchè non c'è un messaggio completo (terminato da \n\n\n).
    // Quello che arriva dopo il terminatore resta in "data" per il messaggio successivo.
    private string? RiceviMessaggio() {
        int indice;

        while ((indice = data.IndexOf(Terminatore)) < 0) {
            int bytesRec = clientSocket.Receive(bytes);

            if (bytesRec == 0) return null;

            int numChars = decoder.GetChars(bytes, 0, bytesRec, chars, 0);
            data += new string(chars, 0, numChars);
        }

        string testo = data[..indice];
        data = data[(indice + Terminatore.Length)..];

        return testo;
    }

    private bool Gestisci(Messaggio messaggio) {
        bool giaConnesso;
        lock (lockStato) {
            giaConnesso = connesso;
        }

        if (!giaConnesso && messaggio.type != "connessione" && messaggio.type != "chiusura") {
            InviaErrore("Prima bisogna mandare il messaggio di connessione");

            return true;
        }

        switch (messaggio.type) {
            case "connessione":
                Connessione(messaggio.sender);

                return true;
            case "crea":
                CreaChat(messaggio.name, messaggio.is_private ?? false);

                return true;
            case "messaggi":
                Messaggi(messaggio.name, messaggio.content_message);

                return true;
            case "chiusura":
                Invia(new Risposta { type = "chiusura" });

                return false;
            default:
                InviaErrore("Type sconosciuto: " + messaggio.type);

                return true;
        }
    }

    private void Connessione(string? nome) {
        string? errore = null;

        lock (lockStato) {
            if (!connesso) {
                if (string.IsNullOrWhiteSpace(nome)) {
                    errore = "Campo sender mancante";
                }
                else if (clients.Any(c => c.sender == nome)) {
                    errore = "Nome già in uso da un altro client connesso";
                }
                else {
                    sender = nome;
                    connesso = true;
                    clients.Add(this);
                }
            }
        }

        if (errore != null) {
            InviaErrore(errore);
            return;
        }

        Invia(new Risposta { type = "connessione", chats = ShowListChat() });
    }

    private void CreaChat(string? name, bool isPrivate) {
        if (string.IsNullOrWhiteSpace(name)) {
            InviaErrore("Nome della chat mancante");

            return;
        }

        string? errore = null;

        lock (lockStato) {
            if (TrovaChat(name) != null) {
                errore = "Esiste già una chat con questo nome";
            }
            else {
                Chat chat = new Chat {
                    chat_id = (prossimoId++).ToString(),
                    name = name,
                    is_private = isPrivate
                };

                if (isPrivate) chat.members.Add(sender);

                chats.Add(chat);
                SalvaChat();
            }
        }

        if (errore != null) {
            InviaErrore(errore);

            return;
        }

        InviaATutti(new Risposta { type = "crea", name = name, chats = ShowListChat() });
    }

    private void Messaggi(string? name, string? contentMessage) {
        if (string.IsNullOrWhiteSpace(name)) {
            InviaErrore("Nome della chat mancante");

            return;
        }

        string? errore = null;
        Risposta? risposta = null;
        List<ClientManager>? destinatari = null;

        lock (lockStato) {
            Chat? chat = TrovaChat(name);

            if (chat == null) {
                errore = "Chat inesistente";
            }
            else if (string.IsNullOrEmpty(contentMessage)) {
                // Apertura della chat
                errore = ControllaAccesso(chat);

                if (errore == null) {
                    chatAperta = chat;
                    risposta = new Risposta {
                        type = "messaggi",
                        name = chat.name,
                        messages = new List<MessaggioChat>(chat.messaggi)
                    };
                }
            }
            else if (chatAperta != chat) {
                errore = "Prima bisogna aprire la chat";
            }
            else {
                // Nuovo messaggio
                chat.messaggi.Add(new MessaggioChat { sender = sender, content_message = contentMessage });
                SalvaChat();

                risposta = new Risposta {
                    type = "messaggi",
                    name = chat.name,
                    sender = sender,
                    content_message = contentMessage
                };
                destinatari = clients.Where(c => c.chatAperta == chat).ToList();
            }
        }

        if (errore != null) {
            InviaErrore(errore);
        }
        else if (destinatari != null) {
            InviaA(destinatari, risposta!);
        }
        else {
            Invia(risposta!);
        }
    }

    // Controlla se questo client può aprire la chat. Ritorna l'errore, oppure null se può.
    // Va chiamato dentro lock (lockStato).
    private string? ControllaAccesso(Chat chat) {
        if (chat.is_private) {
            if (chat.members.Contains(sender)) return null;

            if (chat.members.Count >= MaxPrivata) {
                return "Chat privata: i due partecipanti ci sono gia'";
            }

            // Il primo che apre la chat diventa il secondo (e ultimo) partecipante
            chat.members.Add(sender);
            SalvaChat();

            return null;
        }

        if (chatAperta != chat && clients.Count(c => c.chatAperta == chat) >= MaxPubblica) {
            return "Chat piena: ci sono gia' " + MaxPubblica + " client";
        }

        return null;
    }

    private List<ChatInfo> ShowListChat() {
        lock (lockStato) {
            return chats.Select(c => new ChatInfo {
                chat_id = c.chat_id,
                name = c.name,
                is_private = c.is_private
            }).ToList();
        }
    }

    // Cerca per nome oppure per id. Va chiamato dentro lock (lockStato).
    private static Chat? TrovaChat(string name) {
        return chats.FirstOrDefault(c => c.name == name || c.chat_id == name);
    }

    private void Invia(Risposta risposta) {
        string json = JsonSerializer.Serialize(risposta, jsonOptions);
        byte[] msg = Encoding.UTF8.GetBytes(json + Terminatore);

        lock (lockInvio) {
            int inviati = 0;

            while (inviati < msg.Length) {
                inviati += clientSocket.Send(msg, inviati, msg.Length - inviati, SocketFlags.None);
            }
        }
    }

    private void InviaErrore(string descrizione) {
        Invia(new Risposta { type = "errore", content_message = descrizione });
    }

    private static void InviaA(List<ClientManager> destinatari, Risposta risposta) {
        foreach (ClientManager client in destinatari) {
            try {
                client.Invia(risposta);
            }
            catch (SocketException) { } // quel client è caduto: se ne accorge il suo thread
            catch (ObjectDisposedException) { }
        }
    }

    private static void InviaATutti(Risposta risposta) {
        List<ClientManager> destinatari;
        lock (lockStato) {
            destinatari = new List<ClientManager>(clients);
        }

        InviaA(destinatari, risposta);
    }

    private void Chiudi() {
        lock (lockStato) {
            clients.Remove(this);
            connesso = false;
            chatAperta = null;
        }

        try {
            clientSocket.Shutdown(SocketShutdown.Both);
        }
        catch (SocketException) { }
        catch (ObjectDisposedException) { }

        clientSocket.Close();
        Console.WriteLine("Connessione chiusa");
    }
}

public class Messaggio {

    public string? type { get; set; }
    public string? name { get; set; }
    public string? content_message { get; set; }
    public string? sender { get; set; }
    public bool? is_private { get; set; }
}

// Messaggio che il server manda al client (i campi null non vengono scritti)
public class Risposta {

    public string? type { get; set; }
    public string? name { get; set; }
    public string? sender { get; set; }
    public string? content_message { get; set; }
    public List<ChatInfo>? chats { get; set; }
    public List<MessaggioChat>? messages { get; set; }
}

public class ChatInfo {

    public string chat_id { get; set; } = "";
    public string name { get; set; } = "";
    public bool is_private { get; set; }
}

public class Chat {

    public string chat_id { get; set; } = "";
    public string name { get; set; } = "";
    public bool is_private { get; set; }
    public List<string> members { get; set; } = new List<string>();
    public List<MessaggioChat> messaggi { get; set; } = new List<MessaggioChat>();
}

public class MessaggioChat {

    public string sender { get; set; } = "";
    public string content_message { get; set; } = "";
}
