// Step 0: check that credentials, the phone number, its webhooks and the public URL are ready.
const express = require('express');
const { record, respond } = require('../lib/recorder');
const { requireClient, requireValue } = require('../lib/errors');
const { publicConfig } = require('../lib/config');
const { call } = require('../lib/snippets');
const { uiDefaults, isTesterWebhook } = require('../lib/builders');

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

function setupRoutes({ client, config, state, backup, fetchImpl }) {
  const router = express.Router();
  const yesNo = (value) => (value ? 'yes' : 'no');
  const webhookUrls = {
    smsUrl: `${config.publicUrl}/channels/sms`,
    smsMethod: 'POST',
    voiceUrl: `${config.publicUrl}/channels/voice`,
    voiceMethod: 'POST',
  };

  const numberQuery = config.phoneNumber ? { phoneNumber: config.phoneNumber, limit: 1 } : { limit: 1 };

  router.get('/config', (req, res) => res.json({ config: publicConfig(config), state: state.get(), defaults: uiDefaults(config) }));

  router.post('/check', respond(() => record({
    step: 'setup.check',
    state,
    // Listing numbers doubles as the "API key works" check: a Standard API key can do it,
    // while fetching the Account itself would need a Main key.
    code: [`const [number] = await ${call('client.incomingPhoneNumbers.list', numberQuery)};`],
  }, async () => {
    const checks = [{ id: 'env', label: '.env values', ok: config.problems.length === 0, detail: config.problems.join(' · ') || 'All required values are set' }];
    requireClient(client);

    const numbers = await client.incomingPhoneNumbers.list(numberQuery);
    checks.push({ id: 'credentials', label: 'API key works', ok: true, detail: "The API key could list this account's phone numbers" });

    const number = config.phoneNumber ? numbers[0] : undefined;
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
      '// Save number.smsUrl, smsMethod, voiceUrl and voiceMethod first, so you can put them back later (Step 10).',
      `await ${call('client.incomingPhoneNumbers(number.sid).update', webhookUrls)};`,
    ],
  }, async () => {
    requireClient(client);
    requireValue(config.phoneNumber, 'Set TWILIO_PHONE_NUMBER in .env first.');
    requireValue(config.publicUrl, 'Set PUBLIC_URL in .env first (run `ngrok http 3000`).');
    const [number] = await client.incomingPhoneNumbers.list({ phoneNumber: config.phoneNumber, limit: 1 });
    requireValue(number, `${config.phoneNumber} was not found on this account.`);
    // Back up the current webhooks before changing them (only the first time), for Step 10.
    const original = backup.saveOnce('phoneNumber', {
      sid: number.sid,
      phoneNumber: number.phoneNumber,
      smsUrl: number.smsUrl || '',
      smsMethod: number.smsMethod || 'POST',
      voiceUrl: number.voiceUrl || '',
      voiceMethod: number.voiceMethod || 'POST',
      pointedAtTester: isTesterWebhook(number.smsUrl) || isTesterWebhook(number.voiceUrl),
    });
    const updated = await client.incomingPhoneNumbers(number.sid).update(webhookUrls);
    return { sid: updated.sid, smsUrl: updated.smsUrl, voiceUrl: updated.voiceUrl, backup: original };
  })));

  return router;
}

module.exports = { setupRoutes };
