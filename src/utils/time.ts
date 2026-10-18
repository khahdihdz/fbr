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
 * Chấp nhận "90", "12:34", "1:05:03".
 *
 * Phút và giây phải nhỏ hơn 60; "1:99" bị coi là không hợp lệ thay vì
 * âm thầm hiểu thành 159 giây.
 */
export function parseClockSec(input: string): number | null {
  const raw = input.trim();
  if (!raw) return null;
  if (!/^\d{1,3}(:\d{1,2}){0,2}$/.test(raw)) return null;
  const parts = raw.split(':').map((p) => Number(p));
  if (parts.some((p) => !Number.isFinite(p))) return null;
  for (let i = 1; i < parts.length; i += 1) {
    const part = parts[i];
    if (part === undefined || part > 59) return null;
  }
  let seconds = 0;
  for (const part of parts) {
    seconds = seconds * 60 + part;
  }
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return seconds;
}

/**
 * Phân tích chuỗi thời lượng "dễ tính" mà người dùng hay gõ:
 * "90", "3:42", "1:05:03", "1h5m3s", "1h 5m", "45m", "30s".
 * Trả về null nếu không hiểu được.
 */
export function parseLooseDuration(input: string): number | null {
  const raw = input.trim().toLowerCase();
  if (!raw) return null;

  if (/^\d{1,3}(:\d{1,2}){0,2}$/.test(raw)) return parseClockSec(raw);

  const match = /^(?:(\d{1,4})\s*h)?\s*(?:(\d{1,3})\s*m)?\s*(?:(\d{1,3})\s*s)?$/.exec(raw);
  if (!match) return null;
  const hours = match[1] !== undefined ? Number(match[1]) : null;
  const minutes = match[2] !== undefined ? Number(match[2]) : null;
  const seconds = match[3] !== undefined ? Number(match[3]) : null;
  if (hours === null && minutes === null && seconds === null) return null;
  if ((minutes ?? 0) > 59 || (seconds ?? 0) > 59) return null;
  return (hours ?? 0) * 3600 + (minutes ?? 0) * 60 + (seconds ?? 0);
}

export interface TimeParts {
  hours: number;
  minutes: number;
  seconds: number;
}

/** Tách tổng số giây thành giờ/phút/giây để hiển thị trong ô nhập. */
export function splitSeconds(totalSec: number): TimeParts {
  const safe = Number.isFinite(totalSec) && totalSec > 0 ? Math.floor(totalSec) : 0;
  return {
    hours: Math.floor(safe / 3600),
    minutes: Math.floor((safe % 3600) / 60),
    seconds: safe % 60,
  };
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
