# Open Tunnel

**Access your terminal from any device, anywhere.**

Open Tunnel is an open-source remote terminal tool that lets you share your local shell session over the web. Run one command on your machine, scan the QR code with your phone, and you have a full terminal in your browser — no subscriptions, no accounts, no VPN.

---

## How It Works

```
Your Machine                    Cloud Relay                    Your Phone
+-----------+     WebSocket     +------------+    WebSocket    +------------+
|  agent.js | ───────────────>  |  relay.js  | <───────────── | Browser UI |
|  (shell)  |                   | (Render)   |                | (xterm.js) |
+-----------+                   +------------+                +------------+
```

1. **Agent** runs on your local machine, spawns a shell, and connects to the relay
2. **Relay** bridges connections between the agent and browser clients
3. **Web UI** renders a terminal in your phone's browser with a mobile-friendly input bar

All communication is tunneled over WebSocket (WSS/TLS when deployed).

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- A free [Render](https://render.com) account (or any cloud host) for remote access

### 1. Clone and Install

```bash
git clone https://github.com/RagavRida/open-tunnel.git
cd open-tunnel
npm install
```

### 2. Deploy the Relay

Deploy `relay.js` to a cloud service so you can connect from anywhere.

**Render (recommended, free tier):**

1. Push the repo to GitHub
2. Go to [render.com](https://render.com) > **New** > **Web Service**
3. Connect your `open-tunnel` repo
4. Set:
   - **Build Command:** `npm install`
   - **Start Command:** `node relay.js`
   - **Instance Type:** Free
5. Deploy — you'll get a URL like `https://open-tunnel.onrender.com`

No environment variables needed.

### 3. Start the Agent

```bash
node agent.js wss://your-relay-url.onrender.com
```

You'll see:

```
  ========================================
    Open Tunnel — Remote Terminal Active
  ========================================

  Scan this QR code with your phone:

  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
  █ ▄▄▄▄▄ █ ▀▄▀█ ▄▄▄▄▄ █
  █ █   █ █▀▄ ██ █   █ █
  ...

  Or open this URL:

  https://open-tunnel.onrender.com?token=abc123...

  Waiting for connections...
```

### 4. Connect from Your Phone

- **Scan the QR code** with your phone camera, or
- **Open the URL** in your phone's browser

You'll get a full terminal with:
- Command input bar at the bottom
- Shortcut buttons: Tab, Ctrl+C, Ctrl+D, Up, Down, Esc, Clear
- Real-time terminal output

---

## Local Development

For testing on the same network (no cloud deploy needed):

```bash
# Terminal 1: Start the relay
node relay.js

# Terminal 2: Start the agent
node agent.js

# Phone: Open http://<your-local-ip>:3100?token=<token>
```

---

## Architecture

```
open-tunnel/
├── relay.js          # WebSocket relay server + static file server
├── agent.js          # Local agent — spawns PTY, connects to relay
├── public/
│   └── index.html    # Mobile-friendly web terminal UI
└── package.json
```

### Relay (`relay.js`)

- Express serves the web UI from `public/`
- WebSocket server manages sessions
- Session map: `token -> { agent, clients }`
- Handles explicit HTTP upgrade for cloud host compatibility
- Health check endpoint at `/health`

### Agent (`agent.js`)

- Spawns a real PTY shell via `node-pty` (full color, cursor, tab completion)
- Generates a cryptographically random 256-bit session token
- Connects to relay as `type=agent`
- Displays QR code and URL for easy phone connection
- Forwards terminal I/O over WebSocket

### Web UI (`public/index.html`)

- [xterm.js](https://xtermjs.org/) terminal emulator with fit addon
- Visible command input bar for reliable mobile keyboard input
- Shortcut buttons for special keys (Tab, Ctrl+C, Ctrl+D, arrows)
- Auto-connects when token is in URL
- Responsive — works on phone and desktop browsers

### Message Protocol

```
Agent → Relay → Client:  { "type": "output", "data": "<terminal output>" }
Client → Relay → Agent:  { "type": "input",  "data": "<keystrokes>" }
Client → Relay → Agent:  { "type": "resize", "cols": 80, "rows": 24 }
```

---

## Security

| Measure | Detail |
|---|---|
| **Session tokens** | 256-bit cryptographically random (32 hex bytes) |
| **Transport encryption** | WSS (TLS) when deployed behind HTTPS |
| **No persistence** | Sessions exist only in memory, cleaned up on disconnect |
| **No authentication stored** | No passwords, no cookies, no accounts |
| **Scoped access** | Each token grants access to one shell session only |

**Recommendations for production use:**

- Restrict relay access with a reverse proxy or IP allowlist
- Use HTTPS-only deployment (Render provides this by default)
- Don't share session URLs on public channels
- Stop the agent when you're done — the session terminates immediately

---

## Deployment Options

| Platform | Free Tier | Setup |
|---|---|---|
| [Render](https://render.com) | Yes | Connect repo, deploy as Web Service |
| [Fly.io](https://fly.io) | Yes | `fly launch` then `fly deploy` |
| [Railway](https://railway.app) | Trial credits | Connect repo, auto-deploy |
| Self-hosted | N/A | `node relay.js` on any server with Node.js |

The relay is stateless and lightweight — it only forwards WebSocket messages.

---

## Tech Stack

| Component | Technology |
|---|---|
| Relay server | Express + ws |
| Terminal emulation | node-pty |
| Web terminal | xterm.js + xterm-addon-fit |
| QR code | qrcode-terminal |
| Runtime | Node.js |

---

## Troubleshooting

**Agent shows "Connection error: Unexpected server response: 404"**
- The relay hasn't finished deploying. Wait 1-2 minutes and retry.

**Phone shows "No active session found"**
- The agent isn't running. Start it with `node agent.js wss://your-relay-url`.

**Terminal connects but no prompt appears**
- The agent may have crashed. Check the agent terminal for errors and restart.

**Keyboard types but nothing shows on screen**
- Use the command input bar at the bottom of the screen instead of tapping the terminal directly.

**QR code doesn't scan**
- Make the terminal window larger, or copy the URL printed below the QR code.

---

## Contributing

Contributions are welcome! Areas that could use help:

- [ ] Authentication (optional password protection for sessions)
- [ ] Multiple concurrent sessions
- [ ] Session reconnection on network drop
- [ ] File upload/download between devices
- [ ] End-to-end encryption (beyond TLS)
- [ ] Desktop Electron app
- [ ] Native mobile app (React Native)

---

## License

MIT

---

Built with the belief that accessing your own terminal shouldn't require a subscription.
