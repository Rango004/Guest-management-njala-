-- ============================================================
-- Congregation Guest Access & Vehicle Management System
-- Database Schema v1.0
-- ============================================================
-- NOTE: Run with psql $DATABASE_URL -f src/db/schema.sql
-- Requires PostgreSQL 14+

BEGIN;

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- gen_random_uuid()

-- ============================================================
-- ENUMS
-- ============================================================

-- Event lifecycle. Controls which operations are permitted at each stage.
-- DRAFT              → event is being configured; no pass requests allowed
-- REGISTRATION_OPEN  → graduates may log in and request passes
-- REGISTRATION_CLOSED→ pass requests are frozen; pre-event sync may begin
-- LIVE               → ceremony is in progress; gate scanning is active
-- CLOSED             → ceremony ended; post-event reconciliation runs
-- ARCHIVED           → read-only historical record
CREATE TYPE event_status AS ENUM (
  'DRAFT',
  'REGISTRATION_OPEN',
  'REGISTRATION_CLOSED',
  'LIVE',
  'CLOSED',
  'ARCHIVED'
);

CREATE TYPE user_role AS ENUM ('SUPER_ADMIN', 'GATE_OFFICER');

CREATE TYPE gate_type AS ENUM ('PEDESTRIAN', 'VEHICLE', 'GRADUATE');

CREATE TYPE pass_type AS ENUM ('GUEST', 'VEHICLE');

-- PENDING_REVIEW → vehicle passes above the auto-approve threshold
-- APPROVED       → pass is valid and can be scanned
-- REJECTED       → admin explicitly rejected a vehicle pass request
-- REVOKED        → previously approved pass cancelled by admin or graduate
CREATE TYPE pass_status AS ENUM (
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
  'REVOKED'
);

-- All possible outcomes of a gate scan attempt
CREATE TYPE scan_result AS ENUM (
  'VALID',
  'ALREADY_USED',
  'WRONG_GATE',
  'INVALID',
  'EXPIRED',
  'REVOKED',
  'NOT_APPROVED'
);

-- Used post-event sync reconciliation to flag concurrent offline scans
CREATE TYPE conflict_status AS ENUM ('NONE', 'DUPLICATE', 'RESOLVED');

CREATE TYPE email_type AS ENUM (
  'CREDENTIALS',
  'GUEST_PASS',
  'VEHICLE_PASS_ISSUED',
  'VEHICLE_APPROVED',
  'VEHICLE_REJECTED',
  'CREDENTIALS_RESEND',
  'RECEIPT_RESET'
);

CREATE TYPE email_status AS ENUM ('PENDING', 'SENT', 'FAILED');

CREATE TYPE audit_action AS ENUM (
  'CREATE_EVENT',
  'UPDATE_EVENT',
  'CHANGE_EVENT_STATUS',
  'IMPORT_GRADUATES',
  'DELETE_GRADUATE',
  'RESEND_CREDENTIALS',
  'APPROVE_PASS',
  'REJECT_PASS',
  'REVOKE_PASS',
  'UPDATE_QUOTA',
  'GATE_ASSIGNMENT_CHANGE',
  'CREATE_USER',
  'DEACTIVATE_USER',
  'RESET_RECEIPT',
  'RESET_USER_PASSWORD',
  'RESET_PIN',
  'BULK_RESET_PINS',
  'BANK_ISSUE_PIN'
);

-- ============================================================
-- EVENTS
-- ============================================================
CREATE TABLE events (
  id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    VARCHAR(255)  NOT NULL,
  event_date              DATE          NOT NULL,
  -- TIMESTAMPTZ bounds used for time-window validation on passes.expires_at
  -- (fixes the spec issue where DATE-only allowed all-day pass use)
  event_start_time        TIMESTAMPTZ   NOT NULL,
  event_end_time          TIMESTAMPTZ   NOT NULL,
  -- Gate scanning is only permitted between gate_open_time and event_end_time.
  -- Prevents stolen static QR codes from being used before the event.
  -- Typically set 30-60 minutes before event_start_time.
  gate_open_time          TIMESTAMPTZ   NOT NULL,
  venue                   VARCHAR(255),
  parking_quota           INTEGER       NOT NULL DEFAULT 200 CHECK (parking_quota > 0),
  guest_limit_per_grad    INTEGER       NOT NULL DEFAULT 2   CHECK (guest_limit_per_grad > 0),
  -- Fraction of parking_quota below which vehicle passes auto-approve (e.g. 0.90 = 90%)
  vehicle_auto_threshold  DECIMAL(4,3)  NOT NULL DEFAULT 0.900
                          CHECK (vehicle_auto_threshold BETWEEN 0 AND 1),
  status                  event_status  NOT NULL DEFAULT 'DRAFT',
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT event_times_valid CHECK (event_end_time > event_start_time),
  CONSTRAINT gate_open_before_end CHECK (gate_open_time < event_end_time),
  CONSTRAINT event_date_matches_times CHECK (
    event_date = (event_start_time AT TIME ZONE 'UTC')::DATE
  )
);

-- ============================================================
-- GATES
-- ============================================================
-- Extracted from the faculties table to be a first-class entity.
-- This is the single source of truth for gate assignments.
-- passes.gate_id references this table directly, removing the
-- ambiguity in the original spec where both faculties and passes
-- each held a gate_assignment string.
CREATE TABLE gates (
  id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id  UUID        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  code      VARCHAR(10) NOT NULL,   -- e.g. 'A', 'B', 'C', 'D'
  type      gate_type   NOT NULL,
  label     VARCHAR(100),           -- e.g. 'Main North Gate'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (event_id, code)
);

-- ============================================================
-- FACULTIES
-- ============================================================
CREATE TABLE faculties (
  id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id  UUID        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name      VARCHAR(255) NOT NULL,
  code      VARCHAR(10) NOT NULL,   -- e.g. 'ENG', 'MED'
  -- FK to gates table is the single source of truth for gate routing.
  -- The original spec had gate_assignment as a string on both faculties
  -- and passes; this collapses it to a single FK here.
  gate_id   UUID        NOT NULL REFERENCES gates(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (event_id, code)
);

-- ============================================================
-- USERS  (admins and gate officers)
-- ============================================================
CREATE TABLE users (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  username         VARCHAR(100) NOT NULL UNIQUE,
  password_hash    VARCHAR(255) NOT NULL,    -- bcrypt
  role             user_role   NOT NULL,
  -- NULL for SUPER_ADMIN; required for GATE_OFFICER
  assigned_gate_id UUID        REFERENCES gates(id) ON DELETE SET NULL,
  is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at    TIMESTAMPTZ
);

-- ============================================================
-- GRADUATES
-- ============================================================
CREATE TABLE graduates (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id             UUID        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  full_name            VARCHAR(255) NOT NULL,
  student_id           VARCHAR(100) NOT NULL,
  -- Stored as bcrypt hash. Raw receipt number never persisted.
  -- Fixes spec issue: receipt_number was listed but storage strategy was unspecified.
  receipt_number_hash  VARCHAR(255) NOT NULL,
  email                VARCHAR(255) NOT NULL,
  faculty_id           UUID        NOT NULL REFERENCES faculties(id),
  department           VARCHAR(255),
  phone                VARCHAR(50),
  -- Brute-force protection (fixes spec gap: no lockout policy described)
  login_attempt_count  INTEGER     NOT NULL DEFAULT 0,
  locked_at            TIMESTAMPTZ,          -- set after N consecutive failures
  last_login_at        TIMESTAMPTZ,
  credentials_sent_at  TIMESTAMPTZ,          -- last time credentials email was sent
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- A student_id is unique within a given event
  UNIQUE (event_id, student_id)
);

-- ============================================================
-- PASSES
-- ============================================================
CREATE TABLE passes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  graduate_id     UUID        NOT NULL REFERENCES graduates(id) ON DELETE CASCADE,
  -- Denormalised for fast queries without joining through graduates
  event_id        UUID        NOT NULL REFERENCES events(id),
  pass_type       pass_type   NOT NULL,
  status          pass_status NOT NULL DEFAULT 'APPROVED',
  -- SHA-256 hex digest of the raw 17-char base62 code.
  -- Raw code exists only in the generated QR image and in the
  -- gate device's local validation cache. Never stored here.
  qr_code_hash    VARCHAR(64) NOT NULL UNIQUE,
  guest_name      VARCHAR(255),              -- optional; graduate may leave anonymous
  -- Single source of truth for which gate this pass is valid at.
  -- Inherited from graduate→faculty→gate at pass creation time.
  gate_id         UUID        NOT NULL REFERENCES gates(id),
  is_checked_in   BOOLEAN     NOT NULL DEFAULT FALSE,
  checked_in_at   TIMESTAMPTZ,
  -- TIMESTAMPTZ (not DATE) so validation enforces a precise time window.
  -- Fixes spec issue: DATE type allowed all-day use of passes.
  -- Set to event.event_end_time at pass creation.
  expires_at      TIMESTAMPTZ NOT NULL,
  -- Approval tracking
  approved_by     UUID        REFERENCES users(id),  -- NULL = auto-approved
  -- Revocation tracking
  revoked_at      TIMESTAMPTZ,
  revoked_by      UUID        REFERENCES users(id),
  -- Audit
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- VALIDATION LOGS
-- ============================================================
CREATE TABLE validation_logs (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL when QR code was not found in the system (INVALID result)
  pass_id         UUID          REFERENCES passes(id) ON DELETE SET NULL,
  event_id        UUID          NOT NULL REFERENCES events(id),
  device_id       VARCHAR(100)  NOT NULL,
  gate_id         UUID          REFERENCES gates(id),
  scanned_at      TIMESTAMPTZ   NOT NULL,             -- device-local time
  result          scan_result   NOT NULL,
  -- First 4 chars of scanned raw code stored for debugging unknown QRs.
  -- Not enough to reconstruct the full code (security).
  raw_code_prefix VARCHAR(4),
  -- Post-sync conflict detection: DUPLICATE = same pass admitted at two
  -- offline devices; RESOLVED = admin acknowledged the duplicate.
  conflict_status conflict_status NOT NULL DEFAULT 'NONE',
  synced          BOOLEAN       NOT NULL DEFAULT FALSE,
  synced_at       TIMESTAMPTZ
);

-- ============================================================
-- ADMIN AUDIT LOGS
-- ============================================================
-- Full accountability trail for all administrative actions.
-- Fixes spec gap: no admin audit trail was described.
CREATE TABLE admin_audit_logs (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID          REFERENCES users(id) ON DELETE SET NULL,
  event_id     UUID          REFERENCES events(id) ON DELETE SET NULL,
  action       audit_action  NOT NULL,
  -- ID of the entity affected (graduate_id, pass_id, event_id, etc.)
  target_id    UUID,
  target_type  VARCHAR(50),  -- 'graduate' | 'pass' | 'event' | 'user'
  -- JSONB for flexible before/after values or action metadata
  details      JSONB,
  ip_address   INET,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================
-- EMAIL LOGS
-- ============================================================
-- Records every email send attempt.
-- Fixes spec gap: email delivery was described but no log table existed.
CREATE TABLE email_logs (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  graduate_id         UUID          REFERENCES graduates(id) ON DELETE SET NULL,
  -- NULL for credential emails (no specific pass attached)
  pass_id             UUID          REFERENCES passes(id) ON DELETE SET NULL,
  email_type          email_type    NOT NULL,
  recipient_email     VARCHAR(255)  NOT NULL,
  status              email_status  NOT NULL DEFAULT 'PENDING',
  provider_message_id VARCHAR(255),
  error_message       TEXT,
  sent_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

-- Critical path: gate QR lookup — must be O(1)
CREATE UNIQUE INDEX idx_passes_qr_code_hash    ON passes (qr_code_hash);

-- Pass queries filtered by event
CREATE INDEX idx_passes_event_id               ON passes (event_id);
CREATE INDEX idx_passes_graduate_id            ON passes (graduate_id);
CREATE INDEX idx_passes_status                 ON passes (status);
-- Vehicle quota count: COUNT(*) WHERE pass_type='VEHICLE' AND status='APPROVED'
CREATE INDEX idx_passes_vehicle_quota          ON passes (event_id, pass_type, status)
  WHERE pass_type = 'VEHICLE' AND status = 'APPROVED';

-- Graduate lookup by student_id on login
CREATE INDEX idx_graduates_event_student       ON graduates (event_id, student_id);
CREATE INDEX idx_graduates_event_id            ON graduates (event_id);

-- Validation log queries
CREATE INDEX idx_validation_logs_pass_id       ON validation_logs (pass_id);
CREATE INDEX idx_validation_logs_event_id      ON validation_logs (event_id);
-- Sync job: only pull un-synced rows
CREATE INDEX idx_validation_logs_unsynced      ON validation_logs (event_id, synced)
  WHERE synced = FALSE;

-- Idempotency for live sync upserts: a device cannot produce two scans at exactly the same time
CREATE UNIQUE INDEX idx_validation_logs_device_scan
  ON validation_logs (device_id, scanned_at);
-- Conflict detection: find duplicate scans for the same pass
CREATE INDEX idx_validation_logs_pass_result   ON validation_logs (pass_id, result);

-- Faculty lookup for gate assignment
CREATE INDEX idx_faculties_event_gate          ON faculties (event_id, gate_id);

-- Admin audit log queries
CREATE INDEX idx_audit_event_id                ON admin_audit_logs (event_id);
CREATE INDEX idx_audit_user_id                 ON admin_audit_logs (user_id);
CREATE INDEX idx_audit_created_at              ON admin_audit_logs (created_at DESC);

-- Email log queries
CREATE INDEX idx_email_logs_graduate_id        ON email_logs (graduate_id);

COMMIT;
