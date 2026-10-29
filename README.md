# Chat Socket

A multi-language TCP socket chat application featuring a **C# Server** and **Python Clients**, with support for dynamic channel visibility and privacy controls.

## 🚀 Features

* **Multi-Client Communication:** Enables multiple Python client instances to connect concurrently to a central C# TCP server.

* **Public vs. Private Chat Modes:**

  * **Group ON (Public):** Any client can discover, join, participate in, and read messages within the active group chat.

  * **Group OFF (Private):** Represents a private 1-on-1 chat between two clients. Third-party clients can see that the chat exists, but cannot view or access its message contents.

## 🛠️ System Architecture

1. **TCP Server (C# / .NET):**

   * Manages incoming socket connections, client authentication, and message routing.

   * Maintains state for active chats (`Group ON` / `Group OFF`).

   * Enforces security rules: hides message content for private groups while broadcasting existence metadata.

2. **TCP Client (Python):**

   * Uses native Python `socket` and threading modules to communicate with the server.

   * Renders the chat interface for sending/receiving messages and toggling group modes.

## 🏎️ Getting Started

### 1. Clone the repository

```
git clone https://github.com/your-username/chat-socket.git
cd chat-socket

```

### 2. Run the C# TCP Server

```
cd Server
dotnet run

```

### 3. Run the Python TCP Client(s)

Open a new terminal window for each client:

```
cd Client
python client.py

```