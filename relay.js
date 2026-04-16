const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const url = require('url');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Handle WebSocket upgrade explicitly (needed for Render/cloud hosts)
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// Health check for Render
app.get('/health', (req, res) => res.send('ok'));

// Debug: show active sessions count
app.get('/status', (req, res) => {
  const info = [];
  for (const [token, session] of sessions) {
    info.push({
      token: token.slice(0, 8) + '...',
      agentConnected: session.agent?.readyState === 1,
      clients: session.clients.size,
    });
  }
  res.json({ sessions: info.length, details: info });
});

// Serve web terminal UI
app.use(express.static(path.join(__dirname, 'public')));

// Sessions: token -> { agent: WebSocket, clients: Set<WebSocket> }
const sessions = new Map();

wss.on('connection', (ws, req) => {
  const params = new URL(req.url, 'http://localhost').searchParams;
  const type = params.get('type');
  const token = params.get('token');

  if (!type || !token) {
    ws.close(4000, 'Missing type or token');
    return;
  }

  if (type === 'agent') {
    // Local agent connecting — create session
    sessions.set(token, { agent: ws, clients: new Set() });
    console.log(`[+] Agent connected (token: ${token.slice(0, 8)}...)`);

    ws.on('message', (data) => {
      const session = sessions.get(token);
      if (!session) return;
      // Forward agent output to all browser clients (ensure string)
      const msg = typeof data === 'string' ? data : data.toString('utf8');
      for (const client of session.clients) {
        if (client.readyState === 1) client.send(msg);
      }
    });

    ws.on('close', () => {
      const session = sessions.get(token);
      if (session) {
        for (const client of session.clients) client.close(4002, 'Agent disconnected');
        sessions.delete(token);
      }
      console.log(`[-] Agent disconnected (token: ${token.slice(0, 8)}...)`);
    });

  } else if (type === 'client') {
    // Browser client connecting — join existing session
    const session = sessions.get(token);
    if (!session || !session.agent || session.agent.readyState !== 1) {
      ws.close(4001, 'No active agent for this token');
      return;
    }

    session.clients.add(ws);
    console.log(`[+] Client joined (token: ${token.slice(0, 8)}..., clients: ${session.clients.size})`);

    ws.on('message', (data) => {
      // Forward client input to agent (ensure string)
      const msg = typeof data === 'string' ? data : data.toString('utf8');
      if (session.agent.readyState === 1) {
        session.agent.send(msg);
      }
    });

    // Notify agent a client joined so it can send fresh prompt
    if (session.agent.readyState === 1) {
      session.agent.send(JSON.stringify({ type: 'client-joined' }));
    }

    ws.on('close', () => {
      session.clients.delete(ws);
      console.log(`[-] Client left (token: ${token.slice(0, 8)}..., clients: ${session.clients.size})`);
    });

  } else {
    ws.close(4000, 'Invalid type — use "agent" or "client"');
  }
});

// Ping all connections every 30s to keep alive (Render drops idle connections)
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
});

const PORT = process.env.PORT || 3100;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  Open Tunnel relay running on port ${PORT}`);
  console.log(`  Web UI: http://localhost:${PORT}\n`);
});
