import type { Ctx } from '../app';
import type { VideoProgress } from '../types';
import { estimateFromSession } from '../progress/estimate';
import { applyEdit } from './editors';
import { el, openSheet, toast } from '../utils/dom';
import { formatClockSec } from '../utils/time';
import { formatDuration } from '../utils/format';
import { createTimeField } from './timeField';
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

  const positionField = createTimeField({
    legend: 'Vị trí đang xem',
    value: estimate.positionSec,
    maxSeconds: video.durationSec > 0 ? video.durationSec : undefined,
    showSlider: video.durationSec > 0,
    hint: 'Nhập giờ / phút / giây. Có thể dán thẳng "1:05:03" vào bất kỳ ô nào.',
  });

  const durationField = createTimeField({
    legend: 'Thời lượng video',
    value: video.durationSec,
    hint: 'Nếu chưa biết, bản ghi sẽ nằm trong tab "Cần rà lại".',
    onChange: (seconds) => {
      positionField.setMaxSeconds(seconds > 0 ? seconds : undefined);
    },
  });

  const applyEstimate = async (close: () => void, positionSec: number, durationSec: number): Promise<void> => {
    const next = applyEdit(video, { positionSec, durationSec }, ctx.now());
    next.source = 'session_estimate';
    next.confidence = 'low';
    next.watchCount = video.watchCount + 1;
    next.needsReview = estimate.capped || durationSec <= 0;
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

  const guard = (): boolean => {
    const invalid = [positionField, durationField].find((field) => !field.isValid());
    if (invalid) {
      toast(invalid.message() ?? 'Thời gian không hợp lệ.', 'error');
      return false;
    }
    return true;
  };

  const actions = [
    {
      label: estimate.ok ? 'Đúng, lưu lại' : 'Lưu vị trí',
      kind: 'primary' as const,
      onClick: (close: () => void) => {
        if (!guard()) return;
        void applyEstimate(close, positionField.getSeconds(), durationField.getSeconds());
      },
    },
    {
      label: 'Đã xem xong',
      kind: 'ghost' as const,
      onClick: (close: () => void) => {
        if (!guard()) return;
        const duration = durationField.getSeconds() > 0 ? durationField.getSeconds() : video.durationSec;
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
      positionField.node,
      durationField.node,
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
