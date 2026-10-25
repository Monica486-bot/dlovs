const USERNAME = process.env.AT_USERNAME || 'sandbox';
const API_KEY = process.env.AT_API_KEY;
const SENDER_ID = process.env.AT_SENDER_ID;
const ENDPOINT =
  USERNAME === 'sandbox'
    ? 'https://api.sandbox.africastalking.com/version1/messaging'
    : 'https://api.africastalking.com/version1/messaging';

export function smsConfigured(): boolean {
  return Boolean(API_KEY);
}

export async function sendSms(to: string, message: string): Promise<boolean> {
  if (!smsConfigured()) {
    if (process.env.NODE_ENV !== 'test') console.log(`[SMS not configured] to ${to}: ${message}`);
    return false;
  }
  try {
    const body = new URLSearchParams({ username: USERNAME, to, message });
    if (SENDER_ID) body.set('from', SENDER_ID);
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { apiKey: API_KEY as string, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(10000),
    });
    const data = await response.json().catch(() => null) as Record<string, unknown> | null;
    const recipients = (data?.SMSMessageData as Record<string, unknown>)?.Recipients as Array<{ status: string }> | undefined;
    const recipient = recipients?.[0];
    if (!response.ok || !recipient || recipient.status !== 'Success') {
      console.error(`SMS to ${to} failed:`, response.status, JSON.stringify(data));
      return false;
    }
    return true;
  } catch (err) {
    console.error(`SMS to ${to} failed:`, (err as Error).message);
    return false;
  }
}
