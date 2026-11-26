'use strict';

const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000];

/**
 * Tur 2 abone olunan olay alt kumesi (API-74 / sozlesme §8.7).
 * v1 adlari (`session.updated`, `message.updated`, `session.error`,
 * `message.removed`) bu sunucuda YOKTUR ve burada da YOKTUR.
 */
const EVENT_TYPES = Object.freeze([
  'server.connected',
  'session.created', 'session.archived', 'session.unarchived', 'session.deleted',
  'session.renamed', 'session.model.selected', 'session.agent.selected', 'session.moved',
  'session.usage.updated', 'session.status', 'session.idle',
  'session.execution.started', 'session.execution.succeeded',
  'session.execution.failed', 'session.execution.interrupted',
  'session.text.started', 'session.text.delta', 'session.text.ended',
  'session.reasoning.started', 'session.reasoning.delta', 'session.reasoning.ended',
  'session.tool.called', 'session.tool.progress', 'session.tool.success', 'session.tool.failed',
  'session.inbox.enqueued', 'session.inbox.delivered', 'session.inbox.cancelled',
  'permission.asked', 'permission.replied',
  'model.updated', 'provider.updated', 'agent.updated', 'config.updated',
  'project.updated', 'filesystem.changed'
]);

/** v1 adlari — kullanilmamali (API-74). Denetim/test icin disa acilir. */
const LEGACY_EVENT_TYPES = Object.freeze([
  'session.updated', 'message.updated', 'session.error', 'message.removed'
]);

function isKnownType(type) {
  return EVENT_TYPES.includes(type);
}

/**
 * Olay govdesinden YALNIZ seans kimligini cikarir (API-21: ham govde gecmez).
 * Renderer `evt.data.sessionID` bekler.
 * @param {unknown} data
 * @returns {{sessionID: string|null}}
 */
function pickEventRef(data) {
  if (!data || typeof data !== 'object') return { sessionID: null };

  const direct = data.sessionID || data.sessionId;
  if (typeof direct === 'string' && direct) return { sessionID: direct };

  const nested = data.session && (data.session.id || data.session.sessionID);
  if (typeof nested === 'string' && nested) return { sessionID: nested };

  const props = data.properties && (data.properties.sessionID || data.properties.sessionId);
  if (typeof props === 'string' && props) return { sessionID: props };

  return { sessionID: null };
}

/**
 * SSE istemcisi: GET /api/event.
 * - Kopmada 1-2-4-8-16-30 sn (+%20 jitter) geri cekilme.
 * - Her baglantida TAM uzlastirma (SSE replay yok — API-37).
 *
 * @param {{
 *   http: object,
 *   onConnection: (state: 'connecting'|'connected'|'offline'|'unauthorized') => void,
 *   onEvent: (payload: {type: string, at: string, data: unknown}) => void,
 *   onResync: () => Promise<void>|void
 * }} deps
 */
function createEventsService(deps) {
  const http = deps.http;
  const onConnection = deps.onConnection || (() => {});
  const onEvent = deps.onEvent || (() => {});
  const onResync = deps.onResync || (() => {});

  let running = false;
  let attempt = 0;
  let controller = null;
  let reconnectTimer = null;
  let seq = 0;

  function backoffDelay() {
    const base = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
    const jitter = base * 0.2 * Math.random();
    return Math.round(base + jitter);
  }

  function emit(type, data) {
    seq += 1;
    onEvent({ type, at: new Date().toISOString(), seq, data });
  }

  function scheduleReconnect() {
    if (!running) return;
    const delay = backoffDelay();
    attempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  /** SSE blogunu alanlara ayirir. */
  function parseBlock(block) {
    const lines = block.split(/\r?\n/);
    let eventName = null;
    const dataLines = [];
    for (const line of lines) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length === 0) return null;

    const raw = dataLines.join('\n');
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    return {
      eventName,
      type: eventName || (parsed && typeof parsed.type === 'string' ? parsed.type : 'unknown'),
      payload: parsed
    };
  }

  async function consume(response) {
    const reader = response.body && response.body.getReader
      ? response.body.getReader()
      : null;
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const parsed = parseBlock(block);
        if (parsed) emit(parsed.type, parsed.payload);
        boundary = buffer.indexOf('\n\n');
      }
    }
  }

  async function connect() {
    if (!running) return;

    onConnection(attempt === 0 ? 'connecting' : 'offline');
    controller = new AbortController();

    const res = await http.openStream(
      `/api/event?types=${encodeURIComponent(EVENT_TYPES.join(','))}`,
      { signal: controller.signal }
    );
    if (!running) return;

    if (!res.ok) {
      onConnection(res.error && res.error.code === 'E_UNAUTHORIZED' ? 'unauthorized' : 'offline');
      scheduleReconnect();
      return;
    }

    attempt = 0;
    onConnection('connected');

    // SSE replay yok: baglandiktan sonra tam uzlastirma zorunlu (API-32).
    try {
      await onResync();
    } catch {
      // Uzlastirma hatasi akisi durdurmaz.
    }
    emit('server.connected', null);

    try {
      await consume(res.data.response);
    } catch {
      // Akis koptu.
    }

    if (!running) return;
    onConnection('offline');
    scheduleReconnect();
  }

  function start() {
    if (running) return;
    running = true;
    attempt = 0;
    connect();
  }

  function stop() {
    running = false;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (controller) {
      controller.abort();
      controller = null;
    }
  }

  function isRunning() {
    return running;
  }

  return { start, stop, isRunning, BACKOFF_MS };
}

module.exports = {
  createEventsService,
  BACKOFF_MS,
  EVENT_TYPES,
  LEGACY_EVENT_TYPES,
  isKnownType,
  pickEventRef
};
