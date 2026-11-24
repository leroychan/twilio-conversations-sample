// The tester UI and /api can create and delete Twilio resources, so they only answer on this
// machine. ngrok forwards requests with its own Host header (e.g. abc.ngrok.app), which gets a
// 403 here; the tunnel is only for Twilio's webhooks (/webhooks/*, /channels/*) and /health.
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function localOnly(req, res, next) {
  if (LOCAL_HOSTNAMES.has(req.hostname)) return next();
  res.status(403).json({ ok: false, error: { message: `The tester UI and API only answer on localhost. Open http://localhost:${req.socket.localPort} on this machine.` } });
}

module.exports = { localOnly };
