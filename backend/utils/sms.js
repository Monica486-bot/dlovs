const USERNAME = process.env.AT_USERNAME || 'sandbox';
const API_KEY = process.env.AT_API_KEY;
const SENDER_ID = process.env.AT_SENDER_ID;
const ENDPOINT = USERNAME === 'sandbox'
  ? 'https://api.sandbox.africastalking.com/version1/messaging'
  : 'https://api.africastalking.com/version1/messaging';

function smsConfigured() {
  return Boolean(API_KEY);
}

// FR01 / FR15 / FR20: SMS through Africa's Talking; without AT_API_KEY the
// message is printed to the server log.
// Resolves to true when the message was accepted. Never throws: a failed SMS
// must not roll back the action that triggered it.
async function sendSms(to, message) {
  if (!smsConfigured()) {
    if (process.env.NODE_ENV !== 'test') console.log(`[SMS not configured] to ${to}: ${message}`);
    return false;
  }
  try {
    const body = new URLSearchParams({ username: USERNAME, to, message });
    if (SENDER_ID) body.set('from', SENDER_ID);
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        apiKey: API_KEY,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      signal: AbortSignal.timeout(10000),
    });
    const data = await response.json().catch(() => null);
    const recipient = data?.SMSMessageData?.Recipients?.[0];
    if (!response.ok || !recipient || recipient.status !== 'Success') {
      console.error(`SMS to ${to} failed:`, response.status, JSON.stringify(data));
      return false;
    }
    return true;
  } catch (err) {
    console.error(`SMS to ${to} failed:`, err.message);
    return false;
  }
}

module.exports = { sendSms, smsConfigured };
