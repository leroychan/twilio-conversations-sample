// Step 0: check that credentials, the phone number, its webhooks and the public URL are ready.
const express = require('express');
const { record, respond } = require('../lib/recorder');
const { requireClient, requireValue } = require('../lib/errors');
const { publicConfig } = require('../lib/config');
const { call } = require('../lib/snippets');

let defaultsProvider = () => ({});
try {
  defaultsProvider = require('../lib/builders').uiDefaults;
} catch {
  // lib/builders.js arrives in Task 8.
}

async function checkPublicUrl(publicUrl, fetchImpl) {
  const base = { id: 'publicUrl', label: 'Public URL reaches this app' };
  if (!publicUrl) return { ...base, ok: false, detail: 'PUBLIC_URL is not set. Run `ngrok http 3000` and paste the https URL into .env.' };
  try {
    const res = await fetchImpl(`${publicUrl}/health`, { signal: AbortSignal.timeout(5000), headers: { 'ngrok-skip-browser-warning': '1' } });
    const body = await res.json().catch(() => null);
    const ok = res.ok && body?.app === 'conversations-tester';
    return { ...base, ok, detail: ok ? `${publicUrl} reaches this app` : `${publicUrl}/health answered ${res.status}, but not from this app` };
  } catch (err) {
    return { ...base, ok: false, detail: `Could not reach ${publicUrl}/health (${err.message}). Is ngrok running and pointing at this port?` };
  }
}

function setupRoutes({ client, config, state, fetchImpl }) {
  const router = express.Router();
  const yesNo = (value) => (value ? 'yes' : 'no');
  const webhookUrls = {
    smsUrl: `${config.publicUrl}/channels/sms`,
    smsMethod: 'POST',
    voiceUrl: `${config.publicUrl}/channels/voice`,
    voiceMethod: 'POST',
  };

  router.get('/config', (req, res) => res.json({ config: publicConfig(config), state: state.get(), defaults: defaultsProvider(config) }));

  router.post('/check', respond(() => record({
    step: 'setup.check',
    state,
    code: [
      `const account = await ${call(`client.api.v2010.accounts('${config.accountSid}').fetch`)};`,
      `const [number] = await ${call('client.incomingPhoneNumbers.list', { phoneNumber: config.phoneNumber, limit: 1 })};`,
    ],
  }, async () => {
    const checks = [{ id: 'env', label: '.env values', ok: config.problems.length === 0, detail: config.problems.join(' · ') || 'All required values are set' }];
    requireClient(client);

    const account = await client.api.v2010.accounts(config.accountSid).fetch();
    checks.push({ id: 'credentials', label: 'API key works', ok: true, detail: `Account "${account.friendlyName}" (${account.status})` });

    const [number] = config.phoneNumber ? await client.incomingPhoneNumbers.list({ phoneNumber: config.phoneNumber, limit: 1 }) : [];
    const caps = number?.capabilities || {};
    checks.push({
      id: 'number',
      label: 'Twilio phone number (SMS + Voice)',
      ok: Boolean(number && caps.sms && caps.voice),
      detail: number ? `${number.phoneNumber}: SMS ${yesNo(caps.sms)}, Voice ${yesNo(caps.voice)}` : `${config.phoneNumber || 'TWILIO_PHONE_NUMBER'} was not found on this account`,
    });
    checks.push({
      id: 'webhooks',
      label: "Number's webhooks point at this app",
      ok: Boolean(number && number.smsUrl === webhookUrls.smsUrl && number.voiceUrl === webhookUrls.voiceUrl),
      detail: number ? `SMS → ${number.smsUrl || '(none)'} · Voice → ${number.voiceUrl || '(none)'}` : 'Number not found',
      fix: 'point-number',
    });
    checks.push({
      id: 'whatsapp',
      label: 'WhatsApp sender (optional)',
      ok: config.channels.whatsapp,
      optional: true,
      detail: config.channels.whatsapp
        ? `${config.whatsappNumber}. In the Console, set this sender's incoming-message webhook to ${config.publicUrl}/channels/whatsapp`
        : 'TWILIO_WHATSAPP_NUMBER is not set, so the WhatsApp tab is disabled. Register a WhatsApp sender to enable it.',
    });
    checks.push(await checkPublicUrl(config.publicUrl, fetchImpl));

    return {
      checks,
      number: number ? { sid: number.sid, phoneNumber: number.phoneNumber, capabilities: caps, smsUrl: number.smsUrl, voiceUrl: number.voiceUrl } : null,
    };
  })));

  router.post('/point-number', respond(() => record({
    step: 'setup.pointNumber',
    state,
    code: [
      `const [number] = await ${call('client.incomingPhoneNumbers.list', { phoneNumber: config.phoneNumber, limit: 1 })};`,
      `await ${call('client.incomingPhoneNumbers(number.sid).update', webhookUrls)};`,
    ],
  }, async () => {
    requireClient(client);
    requireValue(config.publicUrl, 'Set PUBLIC_URL in .env first (run `ngrok http 3000`).');
    const [number] = await client.incomingPhoneNumbers.list({ phoneNumber: config.phoneNumber, limit: 1 });
    requireValue(number, `${config.phoneNumber} was not found on this account.`);
    const updated = await client.incomingPhoneNumbers(number.sid).update(webhookUrls);
    return { sid: updated.sid, smsUrl: updated.smsUrl, voiceUrl: updated.voiceUrl };
  })));

  return router;
}

module.exports = { setupRoutes };
