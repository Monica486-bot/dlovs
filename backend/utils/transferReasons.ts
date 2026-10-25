export const TRANSFER_REASONS: string[] = [
  'Sale', 'Inheritance', 'Gift', 'Court order',
  'Government allocation', 'Correction of a registration error', 'Other',
];

export interface TransferReason {
  reason: string;
  details: string | null;
}

type TransferReasonResult = TransferReason | { error: string };

export function isTransferReasonError(r: TransferReasonResult): r is { error: string } {
  return 'error' in r;
}

export function transferReason(reason: string | undefined, details: string | undefined): TransferReasonResult {
  if (!reason || !TRANSFER_REASONS.includes(reason)) {
    return { error: `Choose the reason for the transfer: ${TRANSFER_REASONS.join(', ')}` };
  }
  const text = String(details || '').trim();
  if (reason === 'Other' && text.length < 3) {
    return { error: 'Describe the reason for the transfer' };
  }
  return { reason, details: text || null };
}
