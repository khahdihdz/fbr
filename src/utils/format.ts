import { formatClockSec } from './time';

/** Thời lượng hiển thị; trả về '—' khi chưa biết. */
export function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '—';
  return formatClockSec(sec);
}

/** Phần trăm với tối đa 1 chữ số thập phân, bỏ đuôi '.0'. */
export function formatPercent(percent: number): string {
  if (!Number.isFinite(percent)) return '0%';
  const clamped = Math.min(100, Math.max(0, percent));
  const rounded = Math.round(clamped * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}

/** Số nguyên có dấu phân cách nghìn kiểu Việt Nam. */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const negative = value < 0;
  const digits = Math.abs(Math.round(value)).toString();
  let out = '';
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += '.';
    out += digits[i];
  }
  return negative ? `-${out}` : out;
}

/** Chuỗi thời gian tương đối, ví dụ "3 phút trước". */
export function formatRelative(ts: number, now: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return 'chưa rõ';
  const diff = now - ts;
  if (diff < 0) return 'vừa xong';
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'vừa xong';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} phút trước`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} giờ trước`;
  const day = Math.floor(hour / 24);
  if (day < 30) return `${day} ngày trước`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month} tháng trước`;
  return `${Math.floor(month / 12)} năm trước`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Ngày giờ dạng dd/mm/yyyy hh:mm. */
export function formatDateTime(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return '—';
  const d = new Date(ts);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(
    d.getHours(),
  )}:${pad2(d.getMinutes())}`;
}

/** Ngày dạng dd/mm. */
export function formatShortDay(key: string): string {
  const parts = key.split('-');
  const m = parts[1] ?? '01';
  const d = parts[2] ?? '01';
  return `${d}/${m}`;
}

/** Rút gọn tiêu đề dài. */
export function truncate(text: string, max = 90): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}
