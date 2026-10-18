import { describe, expect, it } from 'vitest';
import { clamp, dayKey, formatClockSec, lastNKeys, parseClockSec, parseLooseDuration, round1, shiftDayKey, splitSeconds } from './time';

describe('clamp', () => {
  it('kẹp trong khoảng', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(50, 0, 10)).toBe(10);
  });

  it('trả min với NaN', () => {
    expect(clamp(Number.NaN, 3, 9)).toBe(3);
  });
});

describe('round1', () => {
  it('làm tròn một chữ số', () => {
    expect(round1(1.24)).toBe(1.2);
    expect(round1(1.25)).toBe(1.3);
    expect(round1(10)).toBe(10);
  });
});

describe('parseClockSec', () => {
  it('đọc số giây trần', () => {
    expect(parseClockSec('90')).toBe(90);
  });

  it('đọc phút:giây', () => {
    expect(parseClockSec('3:42')).toBe(222);
  });

  it('đọc giờ:phút:giây', () => {
    expect(parseClockSec('1:05:03')).toBe(3903);
  });

  it('bỏ khoảng trắng hai đầu', () => {
    expect(parseClockSec('  12:00  ')).toBe(720);
  });

  it('trả null với chuỗi rỗng', () => {
    expect(parseClockSec('')).toBeNull();
    expect(parseClockSec('   ')).toBeNull();
  });

  it('trả null với định dạng lạ', () => {
    expect(parseClockSec('abc')).toBeNull();
    expect(parseClockSec('1:2:3:4')).toBeNull();
    expect(parseClockSec('-5')).toBeNull();
    expect(parseClockSec('1:')).toBeNull();
  });

  it('xử lý 0', () => {
    expect(parseClockSec('0')).toBe(0);
  });

  it('từ chối phút hoặc giây vượt 59 thay vì hiểu nhầm', () => {
    expect(parseClockSec('1:99')).toBeNull();
    expect(parseClockSec('1:60')).toBeNull();
    expect(parseClockSec('0:99:00')).toBeNull();
    expect(parseClockSec('1:59')).toBe(119);
    expect(parseClockSec('1:59:59')).toBe(7199);
  });
});

describe('parseLooseDuration', () => {
  it('đọc số giây trần', () => {
    expect(parseLooseDuration('90')).toBe(90);
  });

  it('đọc dạng phút:giây và giờ:phút:giây', () => {
    expect(parseLooseDuration('3:42')).toBe(222);
    expect(parseLooseDuration('1:05:03')).toBe(3903);
  });

  it('đọc dạng có đơn vị h/m/s', () => {
    expect(parseLooseDuration('1h5m3s')).toBe(3903);
    expect(parseLooseDuration('1h 5m')).toBe(3900);
    expect(parseLooseDuration('45m')).toBe(2700);
    expect(parseLooseDuration('30s')).toBe(30);
    expect(parseLooseDuration('2 h')).toBe(7200);
  });

  it('trả null với chuỗi không hiểu được', () => {
    expect(parseLooseDuration('')).toBeNull();
    expect(parseLooseDuration('abc')).toBeNull();
    expect(parseLooseDuration('1h99m')).toBeNull();
  });
});

describe('splitSeconds', () => {
  it('tách đúng giờ/phút/giây', () => {
    expect(splitSeconds(3903)).toEqual({ hours: 1, minutes: 5, seconds: 3 });
    expect(splitSeconds(59)).toEqual({ hours: 0, minutes: 0, seconds: 59 });
    expect(splitSeconds(3600)).toEqual({ hours: 1, minutes: 0, seconds: 0 });
  });

  it('an toàn với giá trị 0, âm và NaN', () => {
    expect(splitSeconds(0)).toEqual({ hours: 0, minutes: 0, seconds: 0 });
    expect(splitSeconds(-10)).toEqual({ hours: 0, minutes: 0, seconds: 0 });
    expect(splitSeconds(Number.NaN)).toEqual({ hours: 0, minutes: 0, seconds: 0 });
  });
});

describe('formatClockSec', () => {
  it('không có giờ', () => {
    expect(formatClockSec(222)).toBe('3:42');
  });

  it('có giờ', () => {
    expect(formatClockSec(3903)).toBe('1:05:03');
  });

  it('làm tròn xuống giây nguyên', () => {
    expect(formatClockSec(59.9)).toBe('0:59');
  });

  it('không âm', () => {
    expect(formatClockSec(-10)).toBe('0:00');
  });

  it('xử lý NaN', () => {
    expect(formatClockSec(Number.NaN)).toBe('0:00');
  });
});

describe('dayKey', () => {
  it('trả đúng định dạng YYYY-MM-DD', () => {
    expect(dayKey(new Date(2026, 2, 5, 23, 59).getTime())).toBe('2026-03-05');
  });

  it('đệm 0 cho tháng và ngày', () => {
    expect(dayKey(new Date(2026, 0, 1, 0, 1).getTime())).toBe('2026-01-01');
  });
});

describe('shiftDayKey', () => {
  it('lùi một ngày', () => {
    expect(shiftDayKey('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('tiến một ngày', () => {
    expect(shiftDayKey('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('bắc qua năm nhuận', () => {
    expect(shiftDayKey('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('bắc qua cuối năm', () => {
    expect(shiftDayKey('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('lùi nhiều ngày', () => {
    expect(shiftDayKey('2026-03-15', -30)).toBe('2026-02-13');
  });
});

describe('lastNKeys', () => {
  it('trả đủ số phần tử, cũ nhất trước', () => {
    const now = new Date(2026, 2, 15, 12, 0).getTime();
    const keys = lastNKeys(now, 3);
    expect(keys).toEqual(['2026-03-13', '2026-03-14', '2026-03-15']);
  });

  it('trả mảng rỗng khi n = 0', () => {
    expect(lastNKeys(Date.now(), 0)).toEqual([]);
  });

  it('phần tử cuối luôn là hôm nay', () => {
    const now = new Date(2026, 6, 4, 8, 0).getTime();
    const keys = lastNKeys(now, 5);
    expect(keys[keys.length - 1]).toBe(dayKey(now));
  });
});
