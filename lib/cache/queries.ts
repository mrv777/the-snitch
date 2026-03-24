import { getDb } from "./db";

const TTL_SECONDS = 86400; // 24 hours

// --- API Response Cache ---

export function getCachedApiResponse(key: string): unknown | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT response_json FROM api_cache
       WHERE cache_key = ? AND (unixepoch() - created_at) < ttl_seconds`
    )
    .get(key) as { response_json: string } | undefined;
  return row ? JSON.parse(row.response_json) : null;
}

export function setCachedApiResponse(
  key: string,
  data: unknown,
  ttl: number = TTL_SECONDS
): void {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO api_cache (cache_key, response_json, created_at, ttl_seconds)
     VALUES (?, ?, unixepoch(), ?)`
  ).run(key, JSON.stringify(data), ttl);
}

// --- Investigations ---

export interface SavedInvestigation {
  id: string;
  mode: string;
  subject_id: string;
  chain: string | null;
  suspicion_score: number | null;
  verdict: string | null;
  report_json: string;
  card_path: string | null;
  timeline_card_path: string | null;
  created_at: number;
}

export function saveInvestigation(investigation: {
  id: string;
  mode: string;
  subjectId: string;
  chain?: string;
  suspicionScore?: number;
  verdict?: string;
  reportJson: string;
  cardPath?: string;
  timelineCardPath?: string;
}): void {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO investigations
     (id, mode, subject_id, chain, suspicion_score, verdict, report_json, card_path, timeline_card_path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    investigation.id,
    investigation.mode,
    investigation.subjectId.toLowerCase(),
    investigation.chain ?? null,
    investigation.suspicionScore ?? null,
    investigation.verdict ?? null,
    investigation.reportJson,
    investigation.cardPath ?? null,
    investigation.timelineCardPath ?? null
  );
}

export function getInvestigationById(id: string): SavedInvestigation | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM investigations WHERE id = ?`)
    .get(id) as SavedInvestigation | undefined;
  return row ?? null;
}

export function getInvestigationBySubject(
  subjectId: string,
  mode: string
): SavedInvestigation | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT * FROM investigations
       WHERE subject_id = ? AND mode = ?
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(subjectId.toLowerCase(), mode) as SavedInvestigation | undefined;
  return row ?? null;
}

export function getRecentInvestigations(limit = 20): SavedInvestigation[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM investigations
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(limit) as SavedInvestigation[];
}

// --- Monitor Events ---

export interface SavedMonitorEvent {
  id: number;
  event_type: string;
  subject_id: string;
  summary: string;
  data_json: string;
  investigated: number;
  created_at: number;
}

export function saveMonitorEvent(event: {
  eventType: string;
  subjectId: string;
  summary: string;
  dataJson: string;
}): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO monitor_events (event_type, subject_id, summary, data_json)
     VALUES (?, ?, ?, ?)`
  ).run(event.eventType, event.subjectId, event.summary, event.dataJson);
}

export function getRecentMonitorEvents(limit = 50): SavedMonitorEvent[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM monitor_events
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(limit) as SavedMonitorEvent[];
}

export function markEventInvestigated(eventId: number): void {
  const db = getDb();
  db.prepare(
    `UPDATE monitor_events SET investigated = 1 WHERE id = ?`
  ).run(eventId);
}

// --- Cleanup ---

export function cleanExpiredCache(): void {
  const db = getDb();
  db.prepare(
    `DELETE FROM api_cache WHERE (unixepoch() - created_at) >= ttl_seconds`
  ).run();
}
