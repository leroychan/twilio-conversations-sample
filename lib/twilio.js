// The one Twilio client the whole app shares. It authenticates with an API Key + Secret
// (recommended over the Auth Token) and records HTTP traffic for the UI.
const twilio = require('twilio');
const { CapturingRequestClient } = require('./capture');

function createTwilioClient(config) {
  if (!config.hasCredentials) return null;
  return twilio(config.apiKey, config.apiSecret, {
    accountSid: config.accountSid,
    httpClient: new CapturingRequestClient(),
  });
}

module.exports = { createTwilioClient };
