import twilio from 'twilio';

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const FROM_NUMBER = process.env.TWILIO_FROM_NUMBER;

export function smsConfigured(): boolean {
  return Boolean(ACCOUNT_SID && AUTH_TOKEN && FROM_NUMBER);
}

export async function sendSms(to: string, message: string): Promise<boolean> {
  if (!smsConfigured()) {
    if (process.env.NODE_ENV !== 'test') console.log(`[SMS not configured] to ${to}: ${message}`);
    return false;
  }
  try {
    await twilio(ACCOUNT_SID, AUTH_TOKEN).messages.create({ to, from: FROM_NUMBER, body: message });
    return true;
  } catch (err) {
    console.error(`SMS to ${to} failed:`, (err as Error).message);
    return false;
  }
}
