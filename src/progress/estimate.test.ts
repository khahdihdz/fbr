import { describe, expect, it } from 'vitest';
import { estimateFromSession } from './estimate';
import { MAX_SESSION_MS, MIN_SESSION_MS } from '../types';

describe('estimateFromSession', () => {
  it('cộng thêm thời gian đã trôi qua', () => {
    const result = estimateFromSession({ positionSec: 10, durationSec: 100, elapsedMs: 30_000 });
    expect(result.ok).toBe(true);
    expect(result.positionSec).toBe(40);
    expect(result.addedSec).toBe(30);
    expect(result.percent).toBe(40);
    expect(result.completed).toBe(false);
  });

  it('kẹp ở thời lượng video khi trôi qua quá lâu', () => {
    const result = estimateFromSession({ positionSec: 90, durationSec: 100, elapsedMs: 600_000 });
    expect(result.ok).toBe(true);
    expect(result.positionSec).toBe(100);
    expect(result.percent).toBe(100);
    expect(result.completed).toBe(true);
    expect(result.addedSec).toBe(10);
  });

  it('đánh dấu capped khi vượt 4 giờ', () => {
    const result = estimateFromSession({
      positionSec: 0,
      durationSec: MAX_SESSION_MS / 1000 + 10_000,
      elapsedMs: MAX_SESSION_MS + 60_000,
    });
    expect(result.ok).toBe(true);
    expect(result.capped).toBe(true);
    expect(result.needsReview).toBe(true);
    expect(result.addedSec).toBe(MAX_SESSION_MS / 1000);
  });

  it('bỏ qua khi quay lại quá nhanh', () => {
    const result = estimateFromSession({ positionSec: 10, durationSec: 100, elapsedMs: MIN_SESSION_MS - 1 });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('too_short');
    expect(result.positionSec).toBe(10);
  });

  it('bỏ qua khi elapsed âm', () => {
    const result = estimateFromSession({ positionSec: 10, durationSec: 100, elapsedMs: -1 });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('negative');
  });

  it('bỏ qua khi elapsed là 0', () => {
    const result = estimateFromSession({ positionSec: 10, durationSec: 100, elapsedMs: 0 });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('negative');
  });

  it('yêu cầu thời lượng khi chưa biết', () => {
    const result = estimateFromSession({ positionSec: 10, durationSec: 0, elapsedMs: 60_000 });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no_duration');
    expect(result.needsReview).toBe(true);
  });

  it('không làm gì khi đã xem xong', () => {
    const result = estimateFromSession({ positionSec: 99, durationSec: 100, elapsedMs: 60_000 });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('already_done');
    expect(result.percent).toBe(99);
  });

  it('coi vị trí đầu vào không hợp lệ là 0', () => {
    const result = estimateFromSession({
      positionSec: Number.NaN,
      durationSec: 60,
      elapsedMs: 10_000,
    });
    expect(result.ok).toBe(true);
    expect(result.positionSec).toBe(10);
  });

  it('chấp nhận vừa đúng ngưỡng tối thiểu', () => {
    const result = estimateFromSession({ positionSec: 0, durationSec: 100, elapsedMs: MIN_SESSION_MS });
    expect(result.ok).toBe(true);
    expect(result.addedSec).toBe(5);
  });
});
