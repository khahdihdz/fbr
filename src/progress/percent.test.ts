import { describe, expect, it } from 'vitest';
import { computePercent, isCompleted, remainingSec } from './percent';
import { COMPLETE_THRESHOLD } from '../types';

describe('computePercent', () => {
  it('tính đúng phần trăm cơ bản', () => {
    expect(computePercent(30, 120)).toBe(25);
  });

  it('làm tròn 1 chữ số thập phân', () => {
    expect(computePercent(1, 3)).toBe(33.3);
  });

  it('kẹp ở 100 khi vượt thời lượng', () => {
    expect(computePercent(200, 100)).toBe(100);
  });

  it('trả 0 khi thiếu thời lượng', () => {
    expect(computePercent(50, 0)).toBe(0);
  });

  it('trả 0 khi vị trí âm', () => {
    expect(computePercent(-5, 100)).toBe(0);
  });

  it('trả 0 với NaN', () => {
    expect(computePercent(Number.NaN, 100)).toBe(0);
    expect(computePercent(10, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('isCompleted', () => {
  it('đúng tại ngưỡng', () => {
    expect(isCompleted(COMPLETE_THRESHOLD)).toBe(true);
    expect(isCompleted(COMPLETE_THRESHOLD - 0.1)).toBe(false);
  });

  it('sai với NaN', () => {
    expect(isCompleted(Number.NaN)).toBe(false);
  });
});

describe('remainingSec', () => {
  it('tính số giây còn lại', () => {
    expect(remainingSec(30, 120)).toBe(90);
  });

  it('không âm khi đã xem quá', () => {
    expect(remainingSec(200, 120)).toBe(0);
  });

  it('trả 0 khi không biết thời lượng', () => {
    expect(remainingSec(30, 0)).toBe(0);
  });

  it('trả toàn bộ thời lượng khi vị trí không hợp lệ', () => {
    expect(remainingSec(Number.NaN, 120)).toBe(120);
  });
});
