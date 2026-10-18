import type { Ctx } from '../app';
import type { VideoProgress } from '../types';
import { estimateFromSession } from '../progress/estimate';
import { applyEdit } from './editors';
import { el, openSheet, toast } from '../utils/dom';
import { formatClockSec, parseClockSec } from '../utils/time';
import { formatDuration } from '../utils/format';
import type { PendingSession } from '../progress/session';

/**
 * Sau khi người dùng quay lại từ app Facebook, xin xác nhận vị trí ước lượng.
 *
 * Đây là ước lượng, không phải dữ liệu đọc từ app Facebook. Người dùng luôn
 * có thể chỉnh lại hoặc bỏ qua.
 */
export function promptForSession(
  _session: PendingSession,
  video: VideoProgress,
  elapsed: number,
  ctx: Ctx,
): void {
  const estimate = estimateFromSession({
    positionSec: video.positionSec,
    durationSec: video.durationSec,
    elapsedMs: elapsed,
  });

  const elapsedLabel = formatDuration(Math.round(elapsed / 1000));
  const description = estimate.ok
    ? `Bạn rời webapp ${elapsedLabel}. Ước lượng đã xem thêm ${formatDuration(
        Math.round(estimate.addedSec),
      )} → vị trí khoảng ${formatClockSec(estimate.positionSec)} / ${formatDuration(video.durationSec)}.`
    : explainFailure(estimate.reason);

  const positionInput = el('input', {
    class: 'input',
    attrs: {
      type: 'text',
      inputmode: 'numeric',
      value: String(Math.round(estimate.positionSec)),
      'aria-label': 'Vị trí thực tế',
    },
  }) as HTMLInputElement;

  const durationInput = el('input', {
    class: 'input',
    attrs: {
      type: 'text',
      inputmode: 'numeric',
      placeholder: 'm:ss hoặc giây',
      value: video.durationSec > 0 ? String(Math.round(video.durationSec)) : '',
      'aria-label': 'Thời lượng',
    },
  }) as HTMLInputElement;

  const applyEstimate = async (close: () => void, positionSec: number): Promise<void> => {
    const next = applyEdit(video, { positionSec, durationSec: video.durationSec }, ctx.now());
    next.source = 'session_estimate';
    next.confidence = 'low';
    next.watchCount = video.watchCount + 1;
    next.needsReview = estimate.capped || video.durationSec <= 0;
    await ctx.repo.put(next);
    ctx.probe.log('session_estimate_applied', {
      id: video.id,
      elapsedMs: elapsed,
      addedSec: estimate.addedSec,
      capped: estimate.capped,
    });
    close();
    toast('Đã cập nhật tiến trình (ước lượng).', 'success');
    ctx.refresh();
  };

  const actions = [
    {
      label: estimate.ok ? 'Đúng, lưu lại' : 'Lưu vị trí',
      kind: 'primary' as const,
      onClick: (close: () => void) => {
        const parsed = parseClockSec(positionInput.value);
        void applyEstimate(close, parsed ?? estimate.positionSec);
      },
    },
    {
      label: 'Đã xem xong',
      kind: 'ghost' as const,
      onClick: (close: () => void) => {
        const duration = parseClockSec(durationInput.value) ?? video.durationSec;
        void (async () => {
          const marked = applyEdit(video, { completed: true, durationSec: duration }, ctx.now());
          await ctx.repo.put(marked);
          close();
          toast('Đã đánh dấu xem xong.', 'success');
          ctx.refresh();
        })();
      },
    },
    {
      label: 'Bỏ qua',
      kind: 'ghost' as const,
      onClick: (close: () => void) => {
        ctx.probe.log('session_estimate_dismissed', { id: video.id, elapsedMs: elapsed });
        close();
      },
    },
  ];

  openSheet({
    title: 'Xác nhận tiến trình',
    description,
    body: [
      el('p', { class: 'hint', text: video.title }),
      el('label', { class: 'field' }, [
        el('span', { class: 'field__label', text: 'Vị trí đang xem (giây)' }),
        positionInput,
      ]),
      el('label', { class: 'field' }, [
        el('span', { class: 'field__label', text: 'Thời lượng (giây) — bắt buộc nếu chưa biết' }),
        durationInput,
      ]),
      el('p', {
        class: 'hint',
        text: 'Webapp không đọc được tiến trình từ app Facebook. Con số trên là ước lượng theo thời gian bạn vừa rời đi.',
      }),
    ],
    actions,
  });
}

function explainFailure(reason: string | undefined): string {
  switch (reason) {
    case 'too_short':
      return 'Bạn quay lại quá nhanh (dưới 5 giây) nên không ước lượng được. Nhập tay nếu cần.';
    case 'no_duration':
      return 'Video chưa có thời lượng nên không tính được phần trăm. Nhập thời lượng giúp mình.';
    case 'already_done':
      return 'Video này đã được đánh dấu xem xong.';
    case 'negative':
    default:
      return 'Không xác định được thời gian đã rời đi. Nhập tay nếu cần.';
  }
}
