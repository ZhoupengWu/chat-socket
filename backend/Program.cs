using System;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Globalization;

public class SynchronousSocketListener {

    public static string data = null;

    public static void StartListening() {
        IPAddress ipAddress = IPAddress.Any;
        IPEndPoint localEndPoint = new IPEndPoint(ipAddress, 5000);

        Socket listener = new Socket(ipAddress.AddressFamily,
            SocketType.Stream, ProtocolType.Tcp);

        Console.WriteLine("Timeout : {0}", listener.ReceiveTimeout);

        try {
            listener.Bind(localEndPoint);
            listener.Listen(10);

            while (true) {
                Console.WriteLine("Waiting for a connection...");
                Socket handler = listener.Accept();
                ClientManager clientThread = new ClientManager(handler);
                Thread t = new Thread(new ThreadStart(clientThread.doClient));
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

    Socket clientSocket;
    byte[] bytes = new Byte[1024];
    String data = "";

    public ClientManager(Socket clientSocket) {
        this.clientSocket = clientSocket;
    }

    public void doClient() {
        data = "";

        do {
            int bytesRec = clientSocket.Receive(bytes);
            data += Encoding.ASCII.GetString(bytes, 0, bytesRec);
        } while (data.IndexOf("$") == -1);

        data = data.Substring(0, data.IndexOf('$'));
        Console.WriteLine("Kelvin ricevuti: {0}", data);
        string response_data;

        if (float.TryParse(data, NumberStyles.Float, CultureInfo.InvariantCulture, out float kelvin)) {
            float celsius = kelvin - 273.15f;
            response_data = celsius.ToString("F2", CultureInfo.InvariantCulture) + '$';
        }
        else {
            response_data = "Valore non valido$";
        }
        
        byte[] msg = Encoding.ASCII.GetBytes(response_data);
        clientSocket.Send(msg);
        clientSocket.Shutdown(SocketShutdown.Both);
        clientSocket.Close();
        data = "";
    }
}
