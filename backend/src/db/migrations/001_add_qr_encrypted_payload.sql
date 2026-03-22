-- Migration: Add qr_encrypted_payload column to passes table
-- Run on Neon: psql $DATABASE_URL -f src/db/migrations/001_add_qr_encrypted_payload.sql

ALTER TABLE passes
ADD COLUMN IF NOT EXISTS qr_encrypted_payload TEXT;
