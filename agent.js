#!/usr/bin/env node
const WebSocket = require('ws');
const pty = require('node-pty');
const crypto = require('crypto');
const os = require('os');

const RELAY = process.argv[2] || 'ws://localhost:3100';
const token = crypto.randomBytes(16).toString('hex');

// Spawn a real terminal
const shell = process.env.SHELL || (os.platform() === 'win32' ? 'powershell.exe' : 'bash');
const ptyProcess = pty.spawn(shell, [], {
  name: 'xterm-256color',
  cols: 80,
  rows: 24,
  cwd: process.env.HOME || process.cwd(),
  env: process.env,
});

// Connect to relay as agent
const ws = new WebSocket(`${RELAY}?type=agent&token=${token}`);

ws.on('open', () => {
  const httpUrl = RELAY.replace('ws://', 'http://').replace('wss://', 'https://');
  const fullUrl = `${httpUrl}?token=${token}`;
  console.log('\n  ========================================');
  console.log('    Open Tunnel — Remote Terminal Active');
  console.log('  ========================================\n');
  console.log(`  Open this URL on your phone:\n`);
  console.log(`  ${fullUrl}\n`);
  console.log('  Waiting for connections...\n');
});

ws.on('message', (data) => {
  try {
    const msg = JSON.parse(data.toString());
    if (msg.type === 'input') {
      ptyProcess.write(msg.data);
    } else if (msg.type === 'resize') {
      ptyProcess.resize(msg.cols, msg.rows);
    }
  } catch (e) {
    // Raw data fallback
    ptyProcess.write(data.toString());
  }
});

// PTY output → relay → browser clients
ptyProcess.onData((data) => {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify({ type: 'output', data }));
  }
});

ptyProcess.onExit(() => {
  console.log('\n  Shell exited. Closing tunnel.');
  ws.close();
  process.exit(0);
});

ws.on('close', () => {
  console.log('\n  Disconnected from relay.');
  ptyProcess.kill();
  process.exit(0);
});

ws.on('error', (err) => {
  console.error(`\n  Connection error: ${err.message}`);
  console.error('  Make sure the relay server is running.');
  ptyProcess.kill();
  process.exit(1);
});

// Clean shutdown
process.on('SIGINT', () => {
  ptyProcess.kill();
  ws.close();
  process.exit(0);
});
