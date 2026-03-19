import Dexie, { Table } from 'dexie';

// ── Schema — mirrors the SyncPassRecord type from the backend types ────────────

export interface LocalPass {
  passId:       string;      // PK
  qrCodeHash:   string;      // indexed — the lookup key for gate validation
  passType:     'GUEST' | 'VEHICLE';
  status:       'APPROVED' | 'PENDING_REVIEW' | 'REJECTED' | 'REVOKED';
  gateCode:     string;
  gateType:     'PEDESTRIAN' | 'VEHICLE' | 'GRADUATE';
  facultyCode:  string;
  guestName:    string | null;
  graduateName: string;
  isCheckedIn:  boolean;
  checkedInAt:  string | null;
  expiresAt:    string;
}

export interface LocalScanLog {
  id?:           number;     // auto-increment PK
  passId:        string | null;
  deviceId:      string;
  gateId:        string;
  scannedAt:     string;     // ISO timestamp
  result:        string;
  rawCodePrefix: string | null;
  synced:        boolean;
}

export interface GateMeta {
  key:   string;            // singleton row
  eventId:   string;
  eventName: string;
  gateCode:  string;
  gateType:  string;
  gateId:    string;
  allowedFaculties: string[];
  gateOpenTime: string;
  eventEndTime: string;
  syncedAt: string;
  // Crypto keys for offline QR verification (received from sync endpoint)
  signingPublicKey?: string;   // Ed25519 SPKI DER, base64
  encryptionKey?: string;      // AES-256 raw key, base64
}

export class GateDatabase extends Dexie {
  passes!:   Table<LocalPass>;
  scanLogs!: Table<LocalScanLog>;
  meta!:     Table<GateMeta>;

  constructor() {
    super('CongregationGateDB');
    this.version(1).stores({
      passes:   'passId, qrCodeHash, isCheckedIn, gateCode, status',
      scanLogs: '++id, passId, synced, scannedAt',
      meta:     'key',
    });
  }
}

export const db = new GateDatabase();

// ── Lookup helper used by the scanner (O(1) indexed lookup) ──────────────────

export async function lookupByHash(hash: string): Promise<LocalPass | undefined> {
  return db.passes.where('qrCodeHash').equals(hash).first();
}

// ── Mark pass as checked in locally ──────────────────────────────────────────

export async function markCheckedIn(passId: string): Promise<void> {
  await db.passes.update(passId, {
    isCheckedIn: true,
    checkedInAt: new Date().toISOString(),
  });
}

// ── Get unsynced logs for live sync push ──────────────────────────────────────

export async function getUnsyncedLogs(): Promise<LocalScanLog[]> {
  return db.scanLogs.where('synced').equals(0).toArray();
}

export async function markLogsAsSynced(ids: number[]): Promise<void> {
  await db.scanLogs.where(':id').anyOf(ids).modify({ synced: true });
}
