// Reads .env values, normalizes them, and lists anything a beginner still needs to fix.
const E164 = /^\+[1-9]\d{6,14}$/;

function loadConfig(env = process.env) {
  const clean = (value) => (value || '').trim();
  const config = {
    accountSid: clean(env.TWILIO_ACCOUNT_SID),
    apiKey: clean(env.TWILIO_API_KEY),
    apiSecret: clean(env.TWILIO_API_SECRET),
    authToken: clean(env.TWILIO_AUTH_TOKEN),
    phoneNumber: clean(env.TWILIO_PHONE_NUMBER),
    whatsappNumber: clean(env.TWILIO_WHATSAPP_NUMBER).replace(/^whatsapp:/, ''),
    myPhoneNumber: clean(env.MY_PHONE_NUMBER),
    publicUrl: clean(env.PUBLIC_URL).replace(/\/+$/, ''),
    port: Number(env.PORT) || 3000,
  };

  const problems = [];
  const sidOk = /^AC[0-9a-f]{32}$/i.test(config.accountSid);
  const keyOk = /^SK[0-9a-f]{32}$/i.test(config.apiKey);
  if (!sidOk) problems.push('TWILIO_ACCOUNT_SID is missing or is not an AC… Account SID');
  if (!keyOk) problems.push('TWILIO_API_KEY is missing or is not an SK… API Key SID');
  if (!config.apiSecret) problems.push('TWILIO_API_SECRET is missing');
  if (!E164.test(config.phoneNumber)) problems.push('TWILIO_PHONE_NUMBER is missing or not in E.164 format (e.g. +15551234567)');
  if (!E164.test(config.myPhoneNumber)) problems.push('MY_PHONE_NUMBER is missing or not in E.164 format (e.g. +15551234567)');
  if (config.whatsappNumber && !E164.test(config.whatsappNumber)) problems.push('TWILIO_WHATSAPP_NUMBER is not in E.164 format');
  if (!/^https:\/\//.test(config.publicUrl)) problems.push('PUBLIC_URL is missing or not https:// (start ngrok and paste its URL)');

  config.problems = problems;
  config.hasCredentials = sidOk && keyOk && Boolean(config.apiSecret);
  config.channels = {
    sms: E164.test(config.phoneNumber),
    voice: E164.test(config.phoneNumber),
    whatsapp: E164.test(config.whatsappNumber),
  };
  return config;
}

// The subset of config that is safe to send to the browser.
function publicConfig(config) {
  const { accountSid, phoneNumber, whatsappNumber, myPhoneNumber, publicUrl, channels, problems, hasCredentials } = config;
  return { accountSid, phoneNumber, whatsappNumber, myPhoneNumber, publicUrl, channels, problems, hasCredentials };
}

module.exports = { loadConfig, publicConfig, E164 };
