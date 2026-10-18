import { describe, expect, it } from 'vitest';
import {
  buildFbrExport,
  parseFbrExport,
  parseFbrExportObject,
  serializeCsv,
  serializeFbrExport,
} from './fbrJson';
import { createVideoProgress } from '../progress/merge';
import { normalizeVideoId } from '../video/videoId';
import { APP_ID, SCHEMA_ID } from '../types';

const NOW = 1_700_000_000_000;

function sample() {
  return createVideoProgress({
    ref: normalizeVideoId('https://www.facebook.com/watch/?v=1234567890123456'),
    source: 'manual',
    now: NOW,
    title: 'Tiêu đề, có dấu phẩy',
    durationSec: 120,
    positionSec: 30,
    tags: ['a'],
  });
}

describe('buildFbrExport', () => {
  it('đúng schema và app id', () => {
    const payload = buildFbrExport([sample()], NOW);
    expect(payload.schema).toBe(SCHEMA_ID);
    expect(payload.app).toBe(APP_ID);
    expect(payload.exportedAt).toBe(NOW);
    expect(payload.videos).toHaveLength(1);
  });

  it('không chia sẻ tham chiếu với mảng gốc', () => {
    const videos = [sample()];
    const payload = buildFbrExport(videos, NOW);
    payload.videos[0]!.title = 'đã đổi';
    expect(videos[0]!.title).not.toBe('đã đổi');
  });
});

describe('serializeFbrExport', () => {
  it('kết thúc bằng newline và parse lại được', () => {
    const text = serializeFbrExport([sample()], NOW);
    expect(text.endsWith('\n')).toBe(true);
    const result = parseFbrExport(text);
    expect(result.ok).toBe(true);
    expect(result.value[0]?.title).toBe('Tiêu đề, có dấu phẩy');
  });
});

describe('parseFbrExport', () => {
  it('từ chối JSON lỗi', () => {
    const result = parseFbrExport('{ không phải json');
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('JSON không hợp lệ');
  });

  it('từ chối schema sai', () => {
    const result = parseFbrExport(JSON.stringify({ schema: 'khác', videos: [] }));
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('Schema không hỗ trợ');
  });

  it('từ chối khi videos không phải mảng', () => {
    const result = parseFbrExport(JSON.stringify({ schema: SCHEMA_ID, videos: {} }));
    expect(result.ok).toBe(false);
  });

  it('từ chối mảng ở cấp gốc', () => {
    const result = parseFbrExport(JSON.stringify([]));
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('không phải object');
  });

  it('bỏ qua bản ghi hỏng và cảnh báo', () => {
    const result = parseFbrExportObject({
      schema: SCHEMA_ID,
      videos: [{ id: 'a', title: 'ok' }, null, 'chuỗi'],
    });
    expect(result.ok).toBe(true);
    expect(result.value).toHaveLength(1);
    expect(result.warnings[0]).toContain('Bỏ qua 2');
  });

  it('cảnh báo khi không có bản ghi nào', () => {
    const result = parseFbrExportObject({ schema: SCHEMA_ID, videos: [] });
    expect(result.ok).toBe(true);
    expect(result.warnings).toContain('Không có bản ghi nào đọc được.');
  });
});

describe('serializeCsv', () => {
  it('escape dấu phẩy và dấu ngoặc kép', () => {
    const video = sample();
    video.note = 'nói "xin chào"';
    const csv = serializeCsv([video]);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('id,title,url');
    expect(lines[1]).toContain('"Tiêu đề, có dấu phẩy"');
    expect(lines[1]).toContain('""xin chào""');
  });

  it('luôn kết thúc bằng newline', () => {
    expect(serializeCsv([]).endsWith('\n')).toBe(true);
  });
});
