export const DAY_MS = 24 * 60 * 60 * 1000;

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Chuỗi khoá ngày theo giờ địa phương: YYYY-MM-DD. */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Dịch một khoá ngày đi `delta` ngày (dùng UTC để tránh ảnh hưởng DST). */
export function shiftDayKey(key: string, delta: number): string {
  const parts = key.split('-').map((p) => Number(p));
  const y = parts[0] ?? 1970;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Danh sách `n` khoá ngày gần nhất, cũ nhất đứng trước. */
export function lastNKeys(now: number, n: number): string[] {
  const keys: string[] = [];
  let cursor = dayKey(now);
  for (let i = 0; i < n; i += 1) {
    keys.unshift(cursor);
    cursor = shiftDayKey(cursor, -1);
  }
  return keys;
}

/**
 * Phân tích chuỗi thời lượng thành số giây.
 * Chấp nhận "90", "12:34", "1:05:03". Trả về null nếu không hợp lệ.
 */
export function parseClockSec(input: string): number | null {
  const raw = input.trim();
  if (!raw) return null;
  if (!/^\d{1,3}(:\d{1,2}){0,2}$/.test(raw)) return null;
  const parts = raw.split(':').map((p) => Number(p));
  if (parts.some((p) => !Number.isFinite(p))) return null;
  let seconds = 0;
  for (const part of parts) {
    seconds = seconds * 60 + part;
  }
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return seconds;
}

/** Định dạng số giây thành h:mm:ss hoặc m:ss. */
export function formatClockSec(totalSec: number): string {
  if (!Number.isFinite(totalSec)) return '0:00';
  const sec = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  return `${m}:${ss}`;
}
