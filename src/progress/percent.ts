import { COMPLETE_THRESHOLD } from '../types';
import { round1 } from '../utils/time';

/** Tính phần trăm, luôn kẹp trong 0..100 và làm tròn 1 chữ số. */
export function computePercent(positionSec: number, durationSec: number): number {
  if (!Number.isFinite(positionSec) || !Number.isFinite(durationSec)) return 0;
  if (durationSec <= 0 || positionSec <= 0) return 0;
  return round1(Math.min(100, (positionSec / durationSec) * 100));
}

export function isCompleted(percent: number): boolean {
  return Number.isFinite(percent) && percent >= COMPLETE_THRESHOLD;
}

/** Số giây còn lại, 0 nếu không xác định được hoặc đã xem hết. */
export function remainingSec(positionSec: number, durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 0;
  if (!Number.isFinite(positionSec)) return durationSec;
  return Math.max(0, Math.round(durationSec - positionSec));
}
