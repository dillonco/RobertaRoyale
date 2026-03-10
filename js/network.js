/**
 * network.js — WebSocket client for private game multiplayer.
 * Must be loaded before app.js.
 */

'use strict';

const Network = (() => {
  let ws       = null;
  const handlers = {};

  function wsUrl() {
    if (window.WS_URL) return window.WS_URL;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}`;
  }

  function connect() {
    return new Promise((resolve, reject) => {
      if (ws && ws.readyState === WebSocket.OPEN) { resolve(); return; }
      try {
        ws = new WebSocket(wsUrl());
      } catch (e) {
        reject(new Error('WebSocket not supported or connection refused.'));
        return;
      }
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Connection timed out.'));
      }, 8000);

      ws.onopen  = () => { clearTimeout(timeout); resolve(); };
      ws.onerror = () => { clearTimeout(timeout); reject(new Error('Could not connect to server.')); };
      ws.onmessage = e => {
        try {
          const msg = JSON.parse(e.data);
          if (handlers[msg.type]) handlers[msg.type](msg);
        } catch (err) {
          console.error('Network parse error:', err);
        }
      };
      ws.onclose = () => {
        if (handlers.disconnect) handlers.disconnect();
      };
    });
  }

  function on(type, fn)  { handlers[type] = fn; }
  function off(type)     { delete handlers[type]; }

  function send(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    } else {
      console.warn('Network.send: socket not open', msg);
    }
  }

  function disconnect() {
    if (ws) { ws.close(); ws = null; }
    Object.keys(handlers).forEach(k => delete handlers[k]);
  }

  function isConnected() {
    return !!ws && ws.readyState === WebSocket.OPEN;
  }

  return { connect, disconnect, on, off, send, isConnected };
})();
