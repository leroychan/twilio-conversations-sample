// Twilio calls these when someone texts, WhatsApps or calls your number. The replies are
// deliberately simple: the point is that Orchestrator captures both sides of the conversation
// through the capture rules from Step 5, without changing this code.
const express = require('express');
const twilio = require('twilio');

const { MessagingResponse, VoiceResponse } = twilio.twiml;
const MAX_VOICE_TURNS = 3;

// Only accept requests signed by Twilio (when TWILIO_AUTH_TOKEN is set). The URL must be the
// public one Twilio called (ngrok), not localhost.
function twilioSignature(config) {
  return (req, res, next) => {
    if (!config.authToken) return next();
    const url = `${config.publicUrl}${req.originalUrl}`;
    const valid = twilio.validateRequest(config.authToken, req.header('X-Twilio-Signature') || '', url, req.body || {});
    if (valid) return next();
    res.status(403).type('text/plain').send('Invalid Twilio signature');
  };
}

const truncate = (text = '', max = 80) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

function channelRoutes({ config, events }) {
  const router = express.Router();
  router.use(express.urlencoded({ extended: false }));
  router.use(twilioSignature(config));

  const messagingReply = (channel) => (req, res) => {
    const { From: from, To: to, Body: body = '', MessageSid: messageSid } = req.body;
    events.publish('channels', `${channel}_INBOUND`, { from, to, body, messageSid });
    const twiml = new MessagingResponse();
    twiml.message(`Auto-reply from the Conversations Tester: got "${truncate(body)}". Keep chatting, then open Step 7 to see this conversation.`);
    res.type('text/xml').send(twiml.toString());
  };

  const gatherTurn = (twiml, turn) => {
    twiml.gather({ input: 'speech', speechTimeout: 'auto', action: `/channels/voice/turn?turn=${turn}`, method: 'POST' });
    twiml.say("I didn't hear anything. Goodbye!");
  };

  router.post('/sms', messagingReply('SMS'));
  router.post('/whatsapp', messagingReply('WHATSAPP'));

  router.post('/voice', (req, res) => {
    events.publish('channels', 'VOICE_CALL', { from: req.body.From, to: req.body.To, callSid: req.body.CallSid });
    const twiml = new VoiceResponse();
    twiml.say('Hi! You reached the Twilio Conversations Tester. Tell me how I can help you today.');
    gatherTurn(twiml, 1);
    res.type('text/xml').send(twiml.toString());
  });

  router.post('/voice/turn', (req, res) => {
    const turn = Number(req.query.turn) || 1;
    const speech = (req.body.SpeechResult || '').trim();
    events.publish('channels', 'VOICE_TURN', { turn, speech, callSid: req.body.CallSid });
    const twiml = new VoiceResponse();
    if (!speech) {
      twiml.say("Sorry, I didn't catch that. Goodbye!");
      twiml.hangup();
    } else if (turn >= MAX_VOICE_TURNS) {
      twiml.say('Thanks! Your conversation has been captured. Check the tester to see what Memory and Intelligence learned. Goodbye!');
      twiml.hangup();
    } else {
      twiml.say(`Got it. You said: ${speech}. Tell me more.`);
      gatherTurn(twiml, turn + 1);
    }
    res.type('text/xml').send(twiml.toString());
  });

  return router;
}

module.exports = { channelRoutes, MAX_VOICE_TURNS };
