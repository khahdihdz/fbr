import { describe, expect, it } from 'vitest';
import {
  formatDateTime,
  formatDuration,
  formatNumber,
  formatPercent,
  formatRelative,
  formatShortDay,
  truncate,
} from './format';

describe('formatDuration', () => {
  it('trả dấu gạch khi chưa biết', () => {
    expect(formatDuration(0)).toBe('—');
    expect(formatDuration(-5)).toBe('—');
    expect(formatDuration(Number.NaN)).toBe('—');
  });

  it('định dạng phút:giây', () => {
    expect(formatDuration(222)).toBe('3:42');
  });

  it('định dạng giờ:phút:giây', () => {
    expect(formatDuration(3903)).toBe('1:05:03');
  });
});

describe('formatPercent', () => {
  it('bỏ đuôi .0', () => {
    expect(formatPercent(25)).toBe('25%');
  });

  it('giữ một chữ số thập phân', () => {
    expect(formatPercent(33.34)).toBe('33.3%');
  });

  it('kẹp trong 0..100', () => {
    expect(formatPercent(150)).toBe('100%');
    expect(formatPercent(-10)).toBe('0%');
  });

  it('xử lý NaN', () => {
    expect(formatPercent(Number.NaN)).toBe('0%');
  });
});

describe('formatNumber', () => {
  it('thêm dấu chấm phân cách nghìn', () => {
    expect(formatNumber(1234567)).toBe('1.234.567');
  });

  it('không thêm dấu với số nhỏ', () => {
    expect(formatNumber(999)).toBe('999');
  });

  it('xử lý 0 và số âm', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(-1234)).toBe('-1.234');
  });

  it('xử lý NaN', () => {
    expect(formatNumber(Number.NaN)).toBe('0');
  });
});

describe('formatRelative', () => {
  const now = 1_700_000_000_000;

  it('vừa xong trong vòng một phút', () => {
    expect(formatRelative(now - 30_000, now)).toBe('vừa xong');
  });

  it('phút', () => {
    expect(formatRelative(now - 5 * 60_000, now)).toBe('5 phút trước');
  });

  it('giờ', () => {
    expect(formatRelative(now - 3 * 3600_000, now)).toBe('3 giờ trước');
  });

  it('ngày', () => {
    expect(formatRelative(now - 5 * 86_400_000, now)).toBe('5 ngày trước');
  });

  it('tháng', () => {
    expect(formatRelative(now - 70 * 86_400_000, now)).toBe('2 tháng trước');
  });

  it('năm', () => {
    expect(formatRelative(now - 800 * 86_400_000, now)).toBe('2 năm trước');
  });

  it('xử lý mốc thời gian không hợp lệ', () => {
    expect(formatRelative(0, now)).toBe('chưa rõ');
  });

  it('xử lý thời điểm trong tương lai', () => {
    expect(formatRelative(now + 10_000, now)).toBe('vừa xong');
  });
});

describe('formatDateTime', () => {
  it('định dạng dd/mm/yyyy hh:mm', () => {
    const ts = new Date(2026, 2, 15, 9, 5).getTime();
    expect(formatDateTime(ts)).toBe('15/03/2026 09:05');
  });

  it('trả gạch khi giá trị không hợp lệ', () => {
    expect(formatDateTime(0)).toBe('—');
  });
});

describe('formatShortDay', () => {
  it('định dạng dd/mm', () => {
    expect(formatShortDay('2026-03-15')).toBe('15/03');
  });

  it('chịu được chuỗi thiếu', () => {
    expect(formatShortDay('2026')).toBe('01/01');
  });
});

describe('truncate', () => {
  it('không cắt khi ngắn', () => {
    expect(truncate('abc', 10)).toBe('abc');
  });

  it('cắt và thêm dấu ba chấm', () => {
    expect(truncate('a'.repeat(20), 10)).toBe(`${'a'.repeat(9)}…`);
  });

  it('gộp khoảng trắng thừa', () => {
    expect(truncate('a   b\n\nc')).toBe('a b c');
  });
});
