// ============================================================
// Domain types — mirror the database schema enums and shapes
// ============================================================

export type EventStatus =
  | 'DRAFT'
  | 'REGISTRATION_OPEN'
  | 'REGISTRATION_CLOSED'
  | 'LIVE'
  | 'CLOSED'
  | 'ARCHIVED';

export type UserRole = 'SUPER_ADMIN' | 'GATE_OFFICER';

export type GateType = 'PEDESTRIAN' | 'VEHICLE' | 'GRADUATE';

export type PassType = 'GUEST' | 'VEHICLE';

export type PassStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'REVOKED';

export type ScanResult =
  | 'VALID'
  | 'ALREADY_USED'
  | 'WRONG_GATE'
  | 'INVALID'
  | 'EXPIRED'
  | 'REVOKED'
  | 'NOT_APPROVED';

export type ConflictStatus = 'NONE' | 'DUPLICATE' | 'RESOLVED';

export type EmailType =
  | 'CREDENTIALS'
  | 'GUEST_PASS'
  | 'VEHICLE_PASS_ISSUED'
  | 'VEHICLE_APPROVED'
  | 'VEHICLE_REJECTED'
  | 'CREDENTIALS_RESEND'
  | 'RECEIPT_RESET';

export type AuditAction =
  | 'CREATE_EVENT'
  | 'UPDATE_EVENT'
  | 'CHANGE_EVENT_STATUS'
  | 'IMPORT_GRADUATES'
  | 'DELETE_GRADUATE'
  | 'RESEND_CREDENTIALS'
  | 'APPROVE_PASS'
  | 'REJECT_PASS'
  | 'REVOKE_PASS'
  | 'UPDATE_QUOTA'
  | 'GATE_ASSIGNMENT_CHANGE'
  | 'CREATE_USER'
  | 'DEACTIVATE_USER'
  | 'RESET_RECEIPT'
  | 'RESET_USER_PASSWORD'
  | 'RESET_PIN'
  | 'BULK_RESET_PINS'
  | 'BANK_ISSUE_PIN';

// ============================================================
// Row types (what comes back from the DB)
// ============================================================

export interface EventRow {
  id: string;
  name: string;
  event_date: string;
  event_start_time: Date;
  event_end_time: Date;
  gate_open_time: Date;
  venue: string | null;
  parking_quota: number;
  guest_limit_per_grad: number;
  vehicle_auto_threshold: string;  // DECIMAL comes back as string from pg
  status: EventStatus;
  created_at: Date;
  updated_at: Date;
}

export interface GateRow {
  id: string;
  event_id: string;
  code: string;
  type: GateType;
  label: string | null;
  created_at: Date;
}

export interface FacultyRow {
  id: string;
  event_id: string;
  name: string;
  code: string;
  gate_id: string;
  created_at: Date;
}

export interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  role: UserRole;
  assigned_gate_id: string | null;
  is_active: boolean;
  created_at: Date;
  last_login_at: Date | null;
}

export interface GraduateRow {
  id: string;
  event_id: string;
  full_name: string;
  student_id: string;
  receipt_number_hash: string;
  email: string;
  faculty_id: string;
  department: string | null;
  phone: string | null;
  login_attempt_count: number;
  locked_at: Date | null;
  last_login_at: Date | null;
  credentials_sent_at: Date | null;
  created_at: Date;
}

export interface PassRow {
  id: string;
  graduate_id: string;
  event_id: string;
  pass_type: PassType;
  status: PassStatus;
  qr_code_hash: string;
  qr_encrypted_payload: string | null;
  guest_name: string | null;
  gate_id: string;
  is_checked_in: boolean;
  checked_in_at: Date | null;
  expires_at: Date;
  approved_by: string | null;
  revoked_at: Date | null;
  revoked_by: string | null;
  requested_at: Date;
  created_at: Date;
}

export interface ValidationLogRow {
  id: string;
  pass_id: string | null;
  event_id: string;
  device_id: string;
  gate_id: string | null;
  scanned_at: Date;
  result: ScanResult;
  raw_code_prefix: string | null;
  conflict_status: ConflictStatus;
  synced: boolean;
  synced_at: Date | null;
}

// ============================================================
// JWT Payload types
// ============================================================

export interface AdminJwtPayload {
  sub: string;        // users.id
  username: string;
  role: UserRole;
  gateId?: string;    // only for GATE_OFFICER
  eventId?: string;   // only for GATE_OFFICER (their active event)
  iat?: number;
  exp?: number;
}

export interface GraduateJwtPayload {
  sub: string;        // graduates.id
  studentId: string;
  eventId: string;
  role: 'GRADUATE';
  iat?: number;
  exp?: number;
}

// ============================================================
// Express augmentation
// ============================================================

declare global {
  namespace Express {
    interface Request {
      admin?: AdminJwtPayload;
      graduate?: GraduateJwtPayload;
    }
  }
}

// ============================================================
// API response shapes
// ============================================================

export interface ApiSuccess<T = unknown> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: string;
  details?: unknown;
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError;

// ============================================================
// Gate validation response
// ============================================================

export interface ValidScanResponse {
  result: 'VALID';
  guestName: string;
  passType: PassType;
  faculty: string;
  gate: string;
  passId: string;
}

export interface InvalidScanResponse {
  result: Exclude<ScanResult, 'VALID'>;
  reason?: string;
  correctGate?: string;
  checkedInAt?: Date;
}

// ============================================================
// Sync dataset (what gate devices download pre-event)
// ============================================================

export interface SyncPassRecord {
  passId: string;
  qrCodeHash: string;
  passType: PassType;
  status: PassStatus;
  gateCode: string;
  gateType: GateType;
  facultyCode: string;
  guestName: string | null;
  graduateName: string;
  isCheckedIn: boolean;
  checkedInAt: string | null;
  expiresAt: string;
}

export interface SyncDataset {
  eventId: string;
  eventName: string;
  gateCode: string;
  gateType: GateType;
  allowedFaculties: string[];
  gateOpenTime?: string;   // ISO timestamp — gate device enforces this locally when offline (optional)
  eventEndTime: string;    // ISO timestamp — pass expiry boundary
  passes: SyncPassRecord[];
  generatedAt: string;
  totalCount: number;
  // Crypto keys for offline QR verification (distributed at sync time)
  signingPublicKey: string;   // Ed25519 public key, SPKI DER, base64
  encryptionKey: string;      // AES-256 key, raw, base64
}

// ============================================================
// CSV import
// ============================================================

export interface GraduateCsvRow {
  full_name: string;
  student_id: string;
  receipt_number?: string;  // optional — system auto-generates an access PIN if omitted
  email: string;
  faculty_code: string;
  department?: string;
  phone?: string;
}

export interface ImportSummary {
  totalRows: number;
  imported: number;
  duplicates: number;
  failed: number;
  errors: Array<{ row: number; reason: string }>;
  // Plaintext PINs for rows where the system auto-generated one.
  // Returned only once in the import response — admin must download immediately.
  generatedPins: Array<{ student_id: string; full_name: string; pin: string }>;
}
