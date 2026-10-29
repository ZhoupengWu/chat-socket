using System;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Globalization;

public class SynchronousSocketListener {

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

    Socket clientSocket;
    byte[] bytes = new Byte[1024];
    String data = "";

    public ClientManager(Socket clientSocket) {
        this.clientSocket = clientSocket;
    }

    public void DoClient() {
        while (true) {
            data = "";

            do {
                int bytesRec = clientSocket.Receive(bytes);
                data += Encoding.ASCII.GetString(bytes, 0, bytesRec);
            } while (!data.Contains("\n\n\n"));

            data = data[..data.IndexOf('\n')];
            Console.WriteLine("Protocollo di messaggio: {0}", data);

            byte[] msg = Encoding.ASCII.GetBytes("Test");
            clientSocket.Send(msg);
            clientSocket.Shutdown(SocketShutdown.Both);
            clientSocket.Close();
            data = "";
        }
    }
}
