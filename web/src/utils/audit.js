// Readable names for audit_log.action_type values (translated with t()).
export const ACTION_LABELS = {
  CREATE_PARCEL: 'Registered parcel',
  UPDATE_PARCEL: 'Edited parcel',
  PROCESS_TRANSFER: 'Transferred ownership',
  RESOLVE_DISPUTE: 'Resolved dispute',
  DEACTIVATE_PARCEL: 'Deactivated parcel',
  UPLOAD_DOCUMENT: 'Uploaded document',
  VERIFY_DOCUMENT: 'Verified document',
  REJECT_DOCUMENT: 'Rejected document',
  REJECT_TRANSFER_REQUEST: 'Rejected transfer request',
  CLOSE_REPORT: 'Closed plot report',
  VERIFY_NATIONAL_ID: 'Confirmed national ID',
  REJECT_NATIONAL_ID: 'Rejected national ID',
  VERIFY_PARCEL: 'Viewed record',
  CREATE_USER: 'Created account',
  CHANGE_ROLE: 'Changed role',
  CHANGE_NATIONAL_ID: 'Changed national ID',
  RESET_PASSWORD: 'Reset password',
  DEACTIVATE_USER: 'Deactivated account',
  REACTIVATE_USER: 'Reactivated account',
};

export function actionLabel(type) {
  return ACTION_LABELS[type] || type.replaceAll('_', ' ').toLowerCase();
}
