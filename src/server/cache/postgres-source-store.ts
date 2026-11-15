import "server-only";
import { query } from "../workspace/db";
import type { SharedSourceStore, SourceRecord } from "./source-store";
import type { SunsetSourceRecord, SunsetSourceStore } from "./sunset-store";

type CachedRecord = SourceRecord | SunsetSourceRecord;

async function getRecord(key: string): Promise<unknown | null> {
  const result = await query<{ record: unknown }>(`
    WITH expired AS (
      SELECT cache_key FROM source_cache_entries
      WHERE expires_at <= now()
      ORDER BY expires_at
      LIMIT 100
    ), removed AS (
      DELETE FROM source_cache_entries AS cache
      USING expired
      WHERE cache.cache_key = expired.cache_key
      RETURNING cache.cache_key
    )
    SELECT cache.record
    FROM source_cache_entries AS cache
    CROSS JOIN (SELECT count(*) FROM removed) AS sweep
    WHERE cache.cache_key = $1 AND cache.expires_at > now()
  `, [key]);
  return result.rows[0]?.record ?? null;
}

async function setRecord(key: string, record: CachedRecord, ttlSeconds: number): Promise<void> {
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) throw new Error("INVALID_SOURCE_CACHE_TTL");
  await query(`
    INSERT INTO source_cache_entries (cache_key, record, expires_at)
    VALUES ($1, $2::jsonb, now() + ($3::double precision * interval '1 second'))
    ON CONFLICT (cache_key) DO UPDATE
      SET record = EXCLUDED.record, expires_at = EXCLUDED.expires_at
  `, [key, JSON.stringify(record), ttlSeconds]);
}

/** Durable cache shared by local app processes using the same PostgreSQL database. */
export function createPostgresSourceStore(): SharedSourceStore {
  return { get: getRecord, set: setRecord };
}

/** Separate type boundary; keys and Zod record versions isolate sunset data. */
export function createPostgresSunsetStore(): SunsetSourceStore {
  return { get: getRecord, set: setRecord };
}
