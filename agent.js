#!/usr/bin/env node
const WebSocket = require('ws');
const pty = require('node-pty');
const crypto = require('crypto');
const os = require('os');
const qrcode = require('qrcode-terminal');

const RELAY = process.argv[2] || 'ws://localhost:3100';
const token = crypto.randomBytes(16).toString('hex');
const httpUrl = RELAY.replace('ws://', 'http://').replace('wss://', 'https://');
const fullUrl = `${httpUrl}?token=${token}`;

// Spawn a real terminal
const shell = process.env.SHELL || (os.platform() === 'win32' ? 'powershell.exe' : 'bash');
const ptyProcess = pty.spawn(shell, [], {
  name: 'xterm-256color',
  cols: 80,
  rows: 24,
  cwd: process.env.HOME || process.cwd(),
  env: process.env,
});

let ws = null;
let reconnectAttempts = 0;
const MAX_RECONNECT = 20;
let shown = false;

function connectToRelay() {
  ws = new WebSocket(`${RELAY}?type=agent&token=${token}`);

  ws.on('open', () => {
    reconnectAttempts = 0;

    if (!shown) {
      shown = true;
      console.log('\n  ========================================');
      console.log('    Open Tunnel — Remote Terminal Active');
      console.log('  ========================================\n');
      console.log('  Scan this QR code with your phone:\n');
      qrcode.generate(fullUrl, { small: true }, (qr) => {
        console.log(qr);
        console.log(`  Or open this URL:\n`);
        console.log(`  ${fullUrl}\n`);
        console.log('  Waiting for connections...\n');
      });
    } else {
      console.log('  [*] Reconnected to relay.\n');
    }
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'input') {
        ptyProcess.write(msg.data);
      } else if (msg.type === 'resize') {
        ptyProcess.resize(msg.cols, msg.rows);
      } else if (msg.type === 'client-joined') {
        console.log('  [+] Client connected to your session');
        ptyProcess.write('\n');
      }
    } catch (e) {
      ptyProcess.write(data.toString());
    }
  });

  ws.on('close', (code) => {
    if (code === 1000) {
      // Normal close
      console.log('\n  Session ended.');
      ptyProcess.kill();
      process.exit(0);
    }
    // Unexpected close — try to reconnect
    reconnect();
  });

  ws.on('error', (err) => {
    // Don't log every error, reconnect handles it
  });

  // Respond to pings from relay to keep connection alive
  ws.on('ping', () => {
    ws.pong();
  });
}

function reconnect() {
  if (reconnectAttempts >= MAX_RECONNECT) {
    console.error('\n  Failed to reconnect after 20 attempts. Exiting.');
    ptyProcess.kill();
    process.exit(1);
  }

  reconnectAttempts++;
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 30000);
  console.log(`  [*] Reconnecting in ${Math.round(delay / 1000)}s (attempt ${reconnectAttempts}/${MAX_RECONNECT})...`);

  setTimeout(connectToRelay, delay);
}

// PTY output → relay → browser clients
ptyProcess.onData((data) => {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: 'output', data }));
  }
});

ptyProcess.onExit(() => {
  console.log('\n  Shell exited. Closing tunnel.');
  if (ws) ws.close(1000);
  process.exit(0);
});

// Clean shutdown
process.on('SIGINT', () => {
  ptyProcess.kill();
  if (ws) ws.close(1000);
  process.exit(0);
});

// Start
connectToRelay();
