// Shapes of the DLOVS API's responses, taken from backend/db/schema.sql and
// what backend/controllers return. Postgres DECIMAL columns (GPS, area) arrive
// as strings, and dates and timestamps as ISO strings.

export type Role = 'guest' | 'citizen' | 'land_officer' | 'administrator';

// authController's userPayload (login, /auth/me)
export interface User {
  user_id: number;
  full_name: string;
  role: Role;
  platform?: 'mobile' | 'web';
  phone_number: string;
  national_id: string | null;
  national_id_verified: boolean;
}

export interface Owner {
  owner_id: number;
  full_name: string;
  // only shown to land officers and administrators
  contact_number?: string | null;
  national_id?: string | null;
  document_type?: string | null;
  document_reference?: string | null;
}

export type ParcelStatus = 'active' | 'disputed' | 'deactivated';

export interface Parcel {
  parcel_id: number;
  gps_lat: string;
  gps_lng: string;
  neighbourhood: string;
  city: string;
  area_sqm: string | null;
  qr_version: number;
  registered_date: string;
  registered_by: number | null;
  current_owner_id: number | null;
  status: ParcelStatus;
}

// verifyParcel's parcel: the row joined with its owner's name. The QR and ID
// fields are left out for the public.
export interface VerifiedParcel extends Parcel {
  owner_name: string;
  national_id?: string | null;
  document_reference?: string | null;
  unique_qr_code?: string;
  qr_signature?: string;
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

export interface Dispute {
  dispute_id: number;
  parcel_id: number;
  reported_by: number | null;
  reported_via: 'mobile' | 'web';
  dispute_type: 'ownership' | 'boundary';
  description: string | null;
  status: 'open' | 'under_review' | 'resolved';
  created_at: string;
  resolved_at: string | null;
  resolved_by: number | null;
}

export type VerificationStatus = 'pending' | 'verified' | 'rejected';

// documentController's DOCUMENT_COLUMNS, as listParcelDocuments returns them
export interface ParcelDocument {
  document_id: number;
  parcel_id: number;
  document_type: string | null;
  original_name: string | null;
  file_type: string | null;
  size_bytes: number | null;
  upload_date: string;
  verification_status: VerificationStatus;
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
export interface ParcelVerification {
  parcel: VerifiedParcel;
  qr_check: 'valid' | 'superseded' | null;
  qr_issued_at?: string | null;
  ownership_history: OwnershipHistoryEntry[];
  disputes: Pick<Dispute, 'dispute_id' | 'dispute_type' | 'status' | 'created_at'>[];
  documents: Pick<ParcelDocument, 'document_id' | 'document_type' | 'file_type' | 'verification_status' | 'upload_date'>[];
  gps_check: { gps_match: boolean | null; distance_meters: number | null } | null;
}

// A verification saved on the phone for offline use (utils/cache)
export interface CachedRecord {
  parcelId: string;
  cachedAt: string;
  record: ParcelVerification;
}

// GET /parcels/search
export interface SearchResult {
  parcel_id: number;
  neighbourhood: string;
  city: string;
  status: ParcelStatus;
  registered_date: string;
  owner_id: number;
  owner_name: string;
  verified_documents: number;
  pending_documents: number;
  // only in a GPS ("near") search
  distance_m?: number;
}

// GET /parcels/mine
export interface OwnParcel {
  parcel_id: number;
  neighbourhood: string;
  status: ParcelStatus;
  registered_date: string;
  gps_lat: string;
  gps_lng: string;
  area_sqm: string | null;
  verified_documents: number;
  pending_documents: number;
  open_disputes: number;
  transfer_pending: boolean;
}

export interface OwnParcels {
  parcels: OwnParcel[];
  id_status: 'missing' | 'no_land' | 'pending' | 'verified';
  message?: string;
}

// GET /owners/:id
export interface OwnerPortfolio {
  owner: Owner;
  parcels: (Pick<Parcel, 'parcel_id' | 'neighbourhood' | 'gps_lat' | 'gps_lng' | 'area_sqm' | 'status' | 'registered_date'> & {
    verified_documents: number;
  })[];
  previously_owned: { parcel_id: number; transfer_date: string; transferred_to: string }[];
}

// GET /transfer-requests (the accept-code fields are never sent)
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
  status: 'pending' | 'completed' | 'rejected';
  created_at: string;
  handled_by: number | null;
  handled_at: string | null;
  response_notes: string | null;
  buyer_user_id: number | null;
  accept_code_sent_at: string | null;
  neighbourhood: string;
  parcel_status: ParcelStatus;
  owner_name: string;
  requested_by_name: string;
  requested_by_phone?: string;
  handled_by_name: string | null;
  buyer_can_accept: boolean;
  // a transfer an owner wants to make to this user
  incoming: boolean;
}

// POST /transfer-requests/:id/accept-code
export interface AcceptCodeSent {
  sent_to: string;
  dev_code?: string;
}

export interface Notification {
  notification_id: number;
  message: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

// GET /notifications
export interface NotificationList {
  unread: number;
  notifications: Notification[];
}

// POST /auth/register
export interface RegisteredUser {
  user_id: number;
  full_name: string;
  phone_number: string;
  role: Role;
  platform: 'mobile' | 'web';
  national_id: string | null;
  created_at: string;
  verification_required: boolean;
  dev_code?: string;
}

// POST /auth/forgot-password and /auth/resend-code
export interface CodeSent {
  message: string;
  // a land officer or administrator, whose password an administrator resets
  staff?: boolean;
  // the code itself, when SMS isn't configured (demo mode)
  dev_code?: string;
}
