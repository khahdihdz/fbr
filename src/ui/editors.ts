import type { Ctx } from '../app';
import { HISTORY_LIMIT, type HistoryEntry, type VideoProgress } from '../types';
import { computePercent, isCompleted } from '../progress/percent';
import { isPlaceholderTitle } from '../progress/confidence';
import { round1 } from '../utils/time';
import { el, openSheet, toast, confirmAction } from '../utils/dom';
import { createTimeField } from './timeField';

export interface EditChanges {
  title?: string;
  positionSec?: number;
  durationSec?: number;
  note?: string | null;
  tags?: string[];
  completed?: boolean;
}

function pushHistory(
  video: VideoProgress,
  changes: EditChanges,
  at: number,
): HistoryEntry[] {
  const entries = [...(video.history ?? [])];
  const record = (field: string, from: string | number | null, to: string | number | null): void => {
    if (from === to) return;
    entries.push({ at, field, from, to, source: 'manual' });
  };
  if (changes.title !== undefined) record('title', video.title, changes.title);
  if (changes.positionSec !== undefined) record('positionSec', video.positionSec, changes.positionSec);
  if (changes.durationSec !== undefined) record('durationSec', video.durationSec, changes.durationSec);
  if (changes.note !== undefined) record('note', video.note ?? null, changes.note);
  return entries.slice(-HISTORY_LIMIT);
}

/** Áp dụng thay đổi thủ công và trả về bản ghi mới (không ghi vào DB). */
export function applyEdit(
  video: VideoProgress,
  changes: EditChanges,
  now: number,
): VideoProgress {
  const durationSec = Math.max(
    0,
    changes.durationSec !== undefined ? changes.durationSec : video.durationSec,
  );
  let positionSec = Math.max(
    0,
    changes.positionSec !== undefined ? changes.positionSec : video.positionSec,
  );
  if (durationSec > 0) positionSec = Math.min(positionSec, durationSec);

  let completed: boolean;
  if (changes.completed === true) {
    completed = true;
    if (durationSec > 0) positionSec = durationSec;
  } else if (changes.completed === false) {
    completed = false;
    if (durationSec > 0 && positionSec >= durationSec) positionSec = round1(durationSec * 0.9);
  } else {
    completed = durationSec > 0 ? isCompleted(computePercent(positionSec, durationSec)) : video.completed;
  }

  const percent = completed ? 100 : computePercent(positionSec, durationSec);
  const title = changes.title !== undefined ? changes.title : video.title;

  const next: VideoProgress = {
    ...video,
    title,
    durationSec,
    positionSec,
    percent,
    completed,
    source: 'manual',
    confidence: 'medium',
    // Sau khi sửa tay, chỉ còn đáng rà lại khi thiếu thời lượng, tiêu đề vẫn là
    // tiêu đề tạm, hoặc không suy ra được ID thật.
    needsReview: durationSec <= 0 || isPlaceholderTitle(title) || video.resolvedBy === 'unknown',
    lastWatchedAt: now,
    totalWatchedSec: Math.max(video.totalWatchedSec, positionSec),
    history: pushHistory(video, changes, now),
  };

  if (changes.note !== undefined) {
    if (changes.note === null || changes.note.trim() === '') delete next.note;
    else next.note = changes.note.trim();
  }
  if (changes.tags !== undefined) {
    const tags = changes.tags.map((t) => t.trim()).filter(Boolean);
    if (tags.length === 0) delete next.tags;
    else next.tags = tags;
  }
  return next;
}

/** Sheet chỉnh sửa đầy đủ cho một video. */
export function openVideoEditor(video: VideoProgress, ctx: Ctx): void {
  const state: EditChanges = {};

  const titleInput = el('input', {
    class: 'input',
    attrs: { type: 'text', value: video.title, 'aria-label': 'Tiêu đề' },
    on: { input: (e) => { state.title = (e.target as HTMLInputElement).value; } },
  }) as HTMLInputElement;

  const positionField = createTimeField({
    legend: 'Vị trí đang xem',
    value: video.positionSec,
    maxSeconds: video.durationSec > 0 ? video.durationSec : undefined,
    showSlider: video.durationSec > 0,
    hint: 'Nhập giờ / phút / giây. Có thể dán thẳng "1:05:03" vào bất kỳ ô nào.',
    onChange: (seconds) => {
      state.positionSec = seconds;
    },
  });

  const durationField = createTimeField({
    legend: 'Thời lượng video',
    value: video.durationSec,
    hint: 'Bỏ trống nếu chưa biết — bản ghi sẽ nằm trong tab "Cần rà lại".',
    onChange: (seconds) => {
      state.durationSec = seconds;
      positionField.setMaxSeconds(seconds > 0 ? seconds : undefined);
    },
  });

  const noteInput = el('textarea', {
    class: 'input input--area',
    attrs: { rows: '2', placeholder: 'Ghi chú riêng…', 'aria-label': 'Ghi chú' },
    text: video.note ?? '',
  }) as HTMLTextAreaElement;
  noteInput.value = video.note ?? '';
  noteInput.addEventListener('input', () => {
    state.note = noteInput.value;
  });

  const tagsInput = el('input', {
    class: 'input',
    attrs: {
      type: 'text',
      placeholder: 'tag1, tag2',
      value: (video.tags ?? []).join(', '),
      'aria-label': 'Tag',
    },
    on: {
      input: (e) => {
        state.tags = (e.target as HTMLInputElement).value.split(',').map((t) => t.trim()).filter(Boolean);
      },
    },
  }) as HTMLInputElement;

  const save = async (close: () => void): Promise<void> => {
    const fields = [positionField, durationField];
    const invalid = fields.find((field) => !field.isValid());
    if (invalid) {
      toast(invalid.message() ?? 'Thời gian không hợp lệ.', 'error');
      return;
    }
    const next = applyEdit(video, state, ctx.now());
    await ctx.repo.put(next);
    ctx.probe.log('manual_edit', {
      id: video.id,
      fields: Object.keys(state),
      durationSec: next.durationSec,
      positionSec: next.positionSec,
    });
    close();
    toast('Đã lưu thay đổi.', 'success');
    ctx.refresh();
  };

  openSheet({
    title: 'Sửa tiến trình',
    description: video.url || video.id,
    body: [
      el('label', { class: 'field' }, [el('span', { class: 'field__label', text: 'Tiêu đề' }), titleInput]),
      durationField.node,
      positionField.node,
      el('label', { class: 'field' }, [el('span', { class: 'field__label', text: 'Ghi chú' }), noteInput]),
      el('label', { class: 'field' }, [el('span', { class: 'field__label', text: 'Tag' }), tagsInput]),
    ],
    actions: [
      { label: 'Lưu', kind: 'primary', onClick: (close) => void save(close) },
      {
        label: 'Đã xem xong',
        kind: 'ghost',
        onClick: (close) => {
          state.completed = true;
          state.durationSec = durationField.getSeconds();
          state.positionSec = positionField.getSeconds();
          void save(close);
        },
      },
      {
        label: 'Xoá',
        kind: 'danger',
        onClick: (close) => {
          void (async () => {
            const ok = await confirmAction(`Xoá "${video.title}"? Thao tác này không hoàn tác được.`, 'Xoá');
            if (!ok) return;
            await ctx.repo.remove(video.id);
            ctx.probe.log('delete', { id: video.id });
            close();
            toast('Đã xoá.', 'success');
            ctx.refresh();
          })();
        },
      },
    ],
  });
}
