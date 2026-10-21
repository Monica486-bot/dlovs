// Why a land officer is transferring a parcel (FR11). Recorded with the
// ownership history, so the public record shows how land changed hands.
// "Other" needs a short description.
const TRANSFER_REASONS = [
  'Sale',
  'Inheritance',
  'Gift',
  'Court order',
  'Government allocation',
  'Correction of a registration error',
  'Other',
];

// { reason, details } or { error }
function transferReason(reason, details) {
  if (!TRANSFER_REASONS.includes(reason)) {
    return { error: `Choose the reason for the transfer: ${TRANSFER_REASONS.join(', ')}` };
  }
  const text = String(details || '').trim();
  if (reason === 'Other' && text.length < 3) {
    return { error: 'Describe the reason for the transfer' };
  }
  return { reason, details: text || null };
}

module.exports = { TRANSFER_REASONS, transferReason };
