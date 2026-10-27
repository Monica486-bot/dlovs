// Shapes returned by the DLOVS API (backend/db/schema.sql plus the columns the
// controllers join in). Postgres DECIMAL values arrive as strings and
// timestamps as ISO strings.

export type Role = 'citizen' | 'land_officer' | 'administrator';
export type ParcelStatus = 'active' | 'disputed' | 'deactivated';
export type DisputeStatus = 'open' | 'under_review' | 'resolved';
export type DocumentStatus = 'pending' | 'verified' | 'rejected';
export type TransferRequestStatus = 'pending' | 'completed' | 'rejected';
export type ReportStatus = 'open' | 'registered' | 'dismissed';
export type PendingTransferStatus = 'awaiting_owner' | 'awaiting_approval' | 'completed' | 'rejected' | 'cancelled';
export type ConsentMethod = 'owner_code' | 'second_officer';

// GET /auth/me and the user returned by POST /auth/login
export interface SessionUser {
  user_id: number;
  full_name: string;
  role: Role;
  platform: string;
  phone_number: string;
  national_id: string | null;
  national_id_verified: boolean;
}

// GET /admin/users
export interface User {
  user_id: number;
  full_name: string;
  phone_number: string;
  role: Role;
  platform: 'mobile' | 'web';
  national_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Owner {
  owner_id: number;
  full_name: string;
  contact_number: string | null;
  document_type: string | null;
  document_reference: string | null;
  national_id: string | null;
}

// GET /parcels/:id/verify → parcel. National ID, document reference and the
// QR fields are only sent to staff.
export interface Parcel {
  parcel_id: number;
  gps_lat: string;
  gps_lng: string;
  neighbourhood: string;
  city: string;
  area_sqm: string | null;
  unique_qr_code?: string;
  qr_signature?: string;
  qr_version: number;
  registered_date: string;
  registered_by: number | null;
  current_owner_id: number;
  status: ParcelStatus;
  owner_name: string;
  national_id?: string | null;
  document_reference?: string | null;
}

// GET /parcels/search (distance_m only for a GPS search)
export interface ParcelSearchResult {
  parcel_id: number;
  neighbourhood: string;
  city: string;
  status: ParcelStatus;
  registered_date: string;
  owner_id: number;
  owner_name: string;
  verified_documents: number;
  pending_documents: number;
  distance_m?: number;
}

export interface OwnershipHistoryEntry {
  history_id: number;
  parcel_id: number;
  previous_owner_id: number | null;
  new_owner_id: number;
  transfer_date: string;
  processed_by: number | null;
  notes: string | null;
  transfer_reason: string | null;
  transfer_reason_details: string | null;
  previous_owner_name: string | null;
  new_owner_name: string;
}

// GET /disputes
export interface Dispute {
  dispute_id: number;
  parcel_id: number;
  reported_by: number | null;
  reported_via: 'mobile' | 'web';
  dispute_type: 'ownership' | 'boundary';
  description: string | null;
  status: DisputeStatus;
  created_at: string;
  resolved_at: string | null;
  resolved_by: number | null;
  neighbourhood: string;
  owner_name: string;
  reporter_name: string | null;
  reporter_phone: string | null;
}

// the disputes listed on a parcel record
export type DisputeSummary = Pick<Dispute, 'dispute_id' | 'dispute_type' | 'status' | 'created_at'>;

// the documents listed on a parcel record. Uploads always have a document type.
export interface DocumentSummary {
  document_id: number;
  document_type: string;
  file_type: string | null;
  verification_status: DocumentStatus;
  upload_date: string;
}

// GET /documents and GET /parcels/:id/documents
export interface ParcelDocument extends DocumentSummary {
  parcel_id: number;
  original_name: string | null;
  size_bytes: number | null;
  verification_date: string | null;
  rejection_reason: string | null;
  uploaded_by: number | null;
  verified_by: number | null;
  uploaded_by_name: string | null;
  uploaded_by_role: Role | null;
  verified_by_name: string | null;
  neighbourhood: string;
  owner_name: string;
  can_review: boolean;
  review_block: string | null;
}

// GET /parcels/:id/verify
export interface VerifyResult {
  parcel: Parcel;
  qr_check: 'valid' | 'superseded' | 'invalid' | null;
  qr_issued_at?: string | null;
  ownership_history: OwnershipHistoryEntry[];
  disputes: DisputeSummary[];
  documents: DocumentSummary[];
  gps_check: { gps_match: boolean | null; distance_meters: number | null } | null;
}

// GET /parcels/mine
export type MyParcelSummary = Pick<
  Parcel,
  'parcel_id' | 'neighbourhood' | 'status' | 'registered_date' | 'gps_lat' | 'gps_lng' | 'area_sqm'
> & {
  verified_documents: number;
  pending_documents: number;
  open_disputes: number;
  transfer_pending: boolean;
};

export interface MyParcelsResponse {
  parcels: MyParcelSummary[];
  id_status: 'missing' | 'no_land' | 'pending' | 'verified';
  message?: string;
}

// GET /owners/:id. National ID and contact number are staff-only.
export interface OwnerPortfolioData {
  owner: Pick<Owner, 'owner_id' | 'full_name'> & Partial<Pick<Owner, 'national_id' | 'contact_number'>>;
  parcels: (Pick<Parcel, 'parcel_id' | 'neighbourhood' | 'gps_lat' | 'gps_lng' | 'area_sqm' | 'status' | 'registered_date'> & {
    verified_documents: number;
  })[];
  previously_owned: { parcel_id: number; transfer_date: string; transferred_to: string }[];
}

export interface TransferRequest {
  request_id: number;
  parcel_id: number;
  requested_by: number;
  buyer_full_name: string;
  buyer_national_id: string;
  buyer_contact: string | null;
  notes: string | null;
  transfer_reason: string | null;
  transfer_reason_details: string | null;
  status: TransferRequestStatus;
  created_at: string;
  handled_by: number | null;
  handled_at: string | null;
  response_notes: string | null;
  buyer_user_id: number | null;
  accept_code_sent_at: string | null;
  requested_by_name: string;
}

// GET /transfer-requests
export interface TransferRequestListItem extends TransferRequest {
  neighbourhood: string;
  parcel_status: ParcelStatus;
  owner_name: string;
  requested_by_phone?: string;
  handled_by_name: string | null;
  buyer_can_accept: boolean;
  incoming: boolean;
}

// a direct transfer waiting for the owner's SMS code or a second officer
export interface PendingTransfer {
  transfer_id: number;
  parcel_id: number;
  expected_owner_id: number;
  new_owner_name: string;
  new_owner_national_id: string | null;
  new_owner_contact: string | null;
  new_owner_document: string | null;
  notes: string | null;
  consent_method: ConsentMethod;
  consent_document: string | null;
  code_expires_at: string | null;
  status: PendingTransferStatus;
  started_by: number;
  created_at: string;
  decided_by: number | null;
  decided_at: string | null;
  decision_notes: string | null;
  transfer_reason: string | null;
  transfer_reason_details: string | null;
  started_by_name: string;
  can_approve: boolean;
  can_confirm: boolean;
  can_cancel: boolean;
}

// GET /pending-transfers
export interface PendingTransferListItem extends PendingTransfer {
  decided_by_name: string | null;
  neighbourhood: string;
  owner_name: string;
}

// GET /parcels/:id/transfer-consent
export interface TransferConsent {
  method: ConsentMethod;
  owner_phones: string[];
  pending: PendingTransfer | null;
}

export interface TransferCompleted {
  status: 'completed';
  message: string;
  parcel_id: number;
  new_owner_id: number;
  new_owner_name: string;
  qr_version: number;
  qr_data_url: string;
}

export interface TransferAwaitingOwner {
  status: 'awaiting_owner';
  transfer_id: number;
  sent_to: string[];
  dev_code?: string;
}

export interface TransferAwaitingApproval {
  status: 'awaiting_approval';
  transfer_id: number;
}

// POST /parcels/:id/transfer
export type StartTransferResponse = TransferCompleted | TransferAwaitingOwner | TransferAwaitingApproval;

// POST /transfer-requests/:id/accept-code
export interface AcceptCodeSent {
  sent_to: string;
  dev_code?: string;
}

export interface UnregisteredReport {
  report_id: number;
  reported_by: number;
  neighbourhood: string;
  location_details: string;
  gps_lat: string | null;
  gps_lng: string | null;
  claimed_owner: string | null;
  status: ReportStatus;
  created_at: string;
  handled_by: number | null;
  handled_at: string | null;
  response_notes: string | null;
  parcel_id: number | null;
  reporter_name: string;
  reporter_phone?: string;
  handled_by_name: string | null;
}

export interface Notification {
  notification_id: number;
  message: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export interface NotificationsResponse {
  unread: number;
  notifications: Notification[];
}

export interface AuditLogEntry {
  log_id: number;
  officer_id: number | null;
  action_type: string;
  parcel_id: number | null;
  timestamp: string;
  details: string | null;
  officer_name: string | null;
}

// GET /id-checks
export interface IdCheck {
  user_id: number;
  full_name: string;
  phone_number: string;
  national_id: string;
  created_at: string;
  parcels_with_this_id: number;
  registered_owner_names: string | null;
}

// GET /parcels/stats
export interface DashboardStats {
  parcels: { total: number; active: number; disputed: number; deactivated: number };
  open_disputes: number;
  pending_documents: number;
  open_reports: number;
  pending_transfer_requests: number;
  pending_transfer_approvals: number;
  pending_id_checks: number;
  my_actions_7_days: number;
  recent_activity: Omit<AuditLogEntry, 'officer_id'>[];
  recent_parcels: (Pick<Parcel, 'parcel_id' | 'neighbourhood' | 'status' | 'owner_name'> & { updated_at: string })[];
}

// GET /admin/reports. Plain object types (not interfaces) so rows can be
// indexed by column key.
export type UsageTotals = {
  parcels_registered: number;
  transfers: number;
  parcel_edits: number;
  verifications: number;
  disputes_opened: number;
  disputes_resolved: number;
  avg_days_to_resolve: string | null;
  documents_uploaded: number;
  documents_verified: number;
  documents_rejected: number;
  unregistered_reports: number;
  citizen_signups: number;
};

export type MonthlyUsage = {
  month: string;
  parcels_registered: number;
  transfers: number;
  disputes_resolved: number;
  verifications: number;
};

export type OfficerUsage = {
  user_id: number;
  full_name: string;
  role: Role;
  registered: number;
  edited: number;
  transfers: number;
  disputes_resolved: number;
  documents_reviewed: number;
  total_actions: number;
};

export type NeighbourhoodUsage = {
  neighbourhood: string;
  parcels: number;
  disputed: number;
  deactivated: number;
};

export interface UsageReport {
  from: string;
  to: string;
  totals: UsageTotals;
  monthly: MonthlyUsage[];
  officers: OfficerUsage[];
  neighbourhoods: NeighbourhoodUsage[];
}

// GET /parcels/neighbourhoods
export interface NeighbourhoodList {
  city: string;
  neighbourhoods: string[];
}

// GET /parcels/:id/qr
export interface ParcelQr {
  parcel_id: string;
  qr_version: number;
  qr_data_url: string;
}

// POST /parcels
export interface CreatedParcel extends Omit<Parcel, 'national_id' | 'document_reference'> {
  qr_data_url: string;
}

// POST /auth/register
export interface RegisteredUser {
  user_id: number;
  full_name: string;
  phone_number: string;
  role: Role;
  platform: string;
  national_id: string | null;
  created_at: string;
  verification_required: boolean;
  dev_code?: string;
}

// POST /auth/forgot-password
export interface ForgotPasswordResponse {
  message: string;
  staff?: boolean;
  dev_code?: string;
}

// POST /auth/resend-code
export interface ResendCodeResponse {
  message: string;
  dev_code?: string;
}

// POST /pending-transfers/:id/resend
export interface ResendTransferCodeResponse {
  status: 'awaiting_owner';
  sent_to: string[];
  dev_code?: string;
}

// POST /parcels/:id/transfer-requests
export interface CreatedTransferRequest extends Pick<TransferRequest, 'request_id' | 'status' | 'created_at'> {
  buyer_can_accept: boolean;
}

// useParams() on the /…/:id routes (they only match with an id)
export interface IdParams {
  id: string;
}

// what a page passes to the parcel page in location.state
export interface ParcelFlashState {
  qrDataUrl?: string;
  flash?: string;
  flashTone?: string;
  newQr?: boolean;
}
