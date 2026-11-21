import 'server-only';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

interface RateLimitEntry {
  timestamps: number[];
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
}

const store = new Map<string, RateLimitEntry>();
let lastCleanupAt = Date.now();
const CLEANUP_INTERVAL_MS = 60_000;

function pruneStore(now: number): void {
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;

  for (const [key, entry] of store.entries()) {
    const active = entry.timestamps.filter((ts) => now - ts < entry.windowMs);
    if (active.length === 0) {
      store.delete(key);
    } else {
      entry.timestamps = active;
    }
  }
}

export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  pruneStore(now);

  const existing = store.get(key);
  const active = existing ? existing.timestamps.filter((ts) => now - ts < windowMs) : [];

  if (active.length >= limit) {
    const oldest = active[0];
    const retryAfterMs = Math.max(1000, windowMs - (now - oldest));
    return {
      allowed: false,
      retryAfterSec: Math.ceil(retryAfterMs / 1000),
    };
  }

  active.push(now);
  store.set(key, { timestamps: active, windowMs });
  return { allowed: true, retryAfterSec: 0 };
}

export async function checkRateLimitPersistent(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  try {
    const admin = createAdminSupabaseClient();
    const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
    const { data, error } = await admin.rpc('check_rate_limit', {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });

    if (!error && Array.isArray(data) && data.length > 0) {
      const row = data[0] as { allowed?: unknown; retry_after_sec?: unknown };
      if (typeof row.allowed === 'boolean') {
        return {
          allowed: row.allowed,
          retryAfterSec: Number(row.retry_after_sec) || 0,
        };
      }
    }
  } catch {
    // Fallback automatico in-memory se la migrazione 02 non è stata ancora applicata
  }

  return checkRateLimit(key, limit, windowMs);
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }

  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  return 'unknown';
}
