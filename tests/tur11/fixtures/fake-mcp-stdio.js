'use strict';

/* T-119 — gerçek stdio JSON-RPC 2.0 fixture (harici ag YOK). */

const readline = require('node:readline');

const send = (msg) => {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
};

const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
const rpcError = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

const TOOLS = [
  {
    name: 'echo',
    description: 'Girdiyi geri verir',
    inputSchema: { type: 'object', properties: { text: { type: 'string' } } }
  },
  {
    name: 'boom',
    description: 'isError yaniti dondurur',
    inputSchema: { type: 'object' }
  }
];

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on('line', async (line) => {
  if (!line.trim()) return;

  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (!msg || typeof msg !== 'object') return;

  const { id, method, params } = msg;

  if (method === 'initialize') {
    reply(id, {
      protocolVersion: '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'fake-mcp-stdio', version: '1.0.0' }
    });
    return;
  }

  /* Id'siz bildirim: yanit YOK (istemci beklemez). */
  if (method === 'notifications/initialized') return;

  if (method === 'tools/list') {
    reply(id, { tools: TOOLS });
    return;
  }

  /* Zaman asimi testi: 5 sn uyur, bu arada istemci 300 ms'de E_TIMEOUT verir. */
  if (method === 'sleep' || (method === 'tools/call' && params && params.name === 'sleep')) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    reply(id, { content: [{ type: 'text', text: 'slept' }] });
    return;
  }

  if (method === 'tools/call') {
    const name = params && params.name;
    if (name === 'boom') {
      reply(id, { isError: true, content: [{ type: 'text', text: 'boom' }] });
      return;
    }
    if (name === 'echo') {
      const text = params && params.arguments && params.arguments.text;
      reply(id, { content: [{ type: 'text', text: String(text === undefined ? '' : text) }] });
      return;
    }
    rpcError(id, -32602, `Bilinmeyen araç: ${String(name)}`);
    return;
  }

  rpcError(id, -32601, `Method not found: ${String(method)}`);
});
