// Builds the Express app. server.js starts it; tests boot it with a fake Twilio client.
const path = require('node:path');
const express = require('express');
const { webhookRoutes } = require('../routes/webhooks');
const { channelRoutes } = require('../routes/channels');
const { setupRoutes } = require('../routes/setup');
const { memoryRoutes } = require('../routes/memory');
const { intelligenceRoutes } = require('../routes/intelligence');
const { orchestratorRoutes } = require('../routes/orchestrator');
const { resetRoutes } = require('../routes/reset');

function sse(events) {
  return (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.flushHeaders();
    const send = (event) => res.write(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`);
    events.recent().forEach(send);
    const unsubscribe = events.subscribe(send);
    const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), 25000);
    req.on('close', () => {
      clearInterval(keepAlive);
      unsubscribe();
    });
  };
}

function createApp({ config, client, state, events, sleep, fetchImpl = fetch }) {
  const deps = { config, client, state, events, sleep, fetchImpl };
  const app = express();

  app.get('/health', (req, res) => res.json({ ok: true, app: 'conversations-tester' }));
  app.get('/events', sse(events));
  app.use('/webhooks', webhookRoutes(deps));
  app.use('/channels', channelRoutes(deps));

  app.use('/api', express.json({ limit: '1mb' }));
  app.get('/api/state', (req, res) => res.json(state.get()));
  app.use('/api/setup', setupRoutes(deps));
  app.use('/api/memory', memoryRoutes(deps));
  app.use('/api/intelligence', intelligenceRoutes(deps));
  app.use('/api/orchestrator', orchestratorRoutes(deps));
  app.use('/api/reset', resetRoutes(deps));
  app.use('/api', (req, res) => res.status(404).json({ ok: false, error: { message: `No route ${req.method} /api${req.path}` } }));

  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ ok: false, error: { message: err.message } });
  });
  return app;
}

module.exports = { createApp };
