import type { Ctx } from '../app';
import type { VideoProgress } from '../types';
import { describeConfidence, describeSource } from '../progress/confidence';
import { remainingSec } from '../progress/percent';
import { formatDuration, formatPercent, formatRelative, truncate } from '../utils/format';
import { thumbnailUrlForId } from '../video/videoId';
import { el } from '../utils/dom';
import { openVideoEditor } from './editors';

const SOURCE_CLASS: Record<VideoProgress['confidence'], string> = {
  high: 'badge--high',
  medium: 'badge--medium',
  low: 'badge--low',
};

function renderThumb(video: VideoProgress): HTMLElement {
  const url = thumbnailUrlForId(video.id);
  if (!url) {
    return el('div', { class: 'thumb thumb--placeholder', attrs: { 'aria-hidden': 'true' } }, [
      el('span', { text: '▶' }),
    ]);
  }
  const img = el('img', {
    class: 'thumb__img',
    attrs: { src: url, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', decoding: 'async' },
  }) as HTMLImageElement;
  img.addEventListener('error', () => {
    const placeholder = el('div', { class: 'thumb thumb--placeholder', attrs: { 'aria-hidden': 'true' } }, [
      el('span', { text: '▶' }),
    ]);
    img.replaceWith(placeholder);
  });
  return el('div', { class: 'thumb' }, [img]);
}

export function renderCard(video: VideoProgress, ctx: Ctx): HTMLElement {
  const now = ctx.now();
  const rest = remainingSec(video.positionSec, video.durationSec);
  const percent = video.durationSec > 0 ? video.percent : 0;

  const progressBar = el(
    'div',
    {
      class: 'progress',
      attrs: {
        role: 'progressbar',
        'aria-valuenow': String(Math.round(percent)),
        'aria-valuemin': '0',
        'aria-valuemax': '100',
        'aria-label': `Tiến trình ${video.title}`,
      },
    },
    [el('div', { class: 'progress__fill', style: { width: `${percent}%` } })],
  );

  const titleLink = el('a', {
    class: 'card__title',
    text: truncate(video.title, 110),
    attrs: { href: `#/watch/${encodeURIComponent(video.id)}` },
  });

  const badges = el('div', { class: 'badges' }, [
    el('span', {
      class: `badge ${SOURCE_CLASS[video.confidence]}`,
      text: describeSource(video.source),
      attrs: { title: `Độ tin cậy: ${describeConfidence(video.confidence)}` },
    }),
    video.completed ? el('span', { class: 'badge badge--done', text: 'Đã xem xong' }) : null,
    video.needsReview ? el('span', { class: 'badge badge--warn', text: 'Cần rà lại' }) : null,
    video.resolvedBy === 'shortlink' ? el('span', { class: 'badge badge--warn', text: 'Link rút gọn' }) : null,
  ]);

  const meta = el('div', { class: 'card__meta' }, [
    el('span', {
      text:
        video.durationSec > 0
          ? `${formatDuration(video.positionSec)} / ${formatDuration(video.durationSec)}`
          : 'Chưa biết thời lượng',
    }),
    el('span', { class: 'dot', text: '•' }),
    el('span', { text: formatPercent(percent) }),
    rest > 0 ? el('span', { class: 'dot', text: '•' }) : null,
    rest > 0 ? el('span', { text: `còn ${formatDuration(rest)}` }) : null,
  ]);

  const actions = el('div', { class: 'card__actions' }, [
    el('button', {
      class: 'btn btn--primary',
      text: '▶ Xem tiếp',
      attrs: { type: 'button' },
      on: { click: () => ctx.startWatch(video) },
    }),
    el('button', {
      class: 'btn',
      text: '✎ Sửa',
      attrs: { type: 'button' },
      on: { click: () => openVideoEditor(video, ctx) },
    }),
    video.url
      ? el('a', {
          class: 'btn btn--ghost',
          text: 'Mở web',
          attrs: { href: video.url, target: '_blank', rel: 'noopener noreferrer' },
        })
      : null,
  ]);

  return el('article', { class: 'card', dataset: { id: video.id } }, [
    renderThumb(video),
    el('div', { class: 'card__body' }, [
      titleLink,
      badges,
      progressBar,
      meta,
      el('div', { class: 'card__foot' }, [
        el('span', { class: 'card__time', text: formatRelative(video.lastWatchedAt, now) }),
        actions,
      ]),
    ]),
  ]);
}
