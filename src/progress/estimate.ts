import { MAX_SESSION_MS, MIN_SESSION_MS } from '../types';
import { computePercent, isCompleted } from './percent';

export type EstimateReason = 'negative' | 'too_short' | 'no_duration' | 'already_done';

export interface EstimateInput {
  positionSec: number;
  durationSec: number;
  elapsedMs: number;
}

export interface EstimateResult {
  ok: boolean;
  reason?: EstimateReason;
  /** Vị trí mới theo giây. Không đổi nếu ok = false. */
  positionSec: number;
  percent: number;
  completed: boolean;
  /** Số giây thực sự được cộng thêm (đã kẹp). */
  addedSec: number;
  /** true khi elapsed ban đầu vượt ngưỡng an toàn 4 giờ. */
  capped: boolean;
  needsReview: boolean;
}

/**
 * Ước lượng vị trí mới dựa trên thời gian người dùng rời khỏi webapp.
 *
 * Đây là ước lượng thô, KHÔNG phải dữ liệu đọc từ app Facebook. Hàm thuần,
 * không phụ thuộc DOM, để có thể kiểm thử đầy đủ.
 */
export function estimateFromSession(input: EstimateInput): EstimateResult {
  const { positionSec, durationSec, elapsedMs } = input;

  const base = {
    positionSec: Number.isFinite(positionSec) && positionSec > 0 ? positionSec : 0,
    percent: 0,
    completed: false,
    addedSec: 0,
    capped: false,
    needsReview: false,
  };

  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return { ...base, ok: false, reason: 'negative', percent: computePercent(base.positionSec, durationSec) };
  }

  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return { ...base, ok: false, reason: 'no_duration', percent: 0, needsReview: true };
  }

  const currentPercent = computePercent(base.positionSec, durationSec);
  if (currentPercent >= 100 || isCompleted(currentPercent)) {
    return { ...base, ok: false, reason: 'already_done', percent: currentPercent };
  }

  if (elapsedMs < MIN_SESSION_MS) {
    return { ...base, ok: false, reason: 'too_short', percent: currentPercent };
  }

  const capped = elapsedMs > MAX_SESSION_MS;
  const effectiveMs = capped ? MAX_SESSION_MS : elapsedMs;
  const remaining = Math.max(0, durationSec - base.positionSec);
  const addedSec = Math.min(effectiveMs / 1000, remaining);
  const newPosition = Math.min(durationSec, base.positionSec + addedSec);
  const percent = computePercent(newPosition, durationSec);

  return {
    ok: true,
    positionSec: newPosition,
    percent,
    completed: isCompleted(percent),
    addedSec,
    capped,
    needsReview: capped,
  };
}
