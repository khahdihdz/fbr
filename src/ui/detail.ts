import type { Ctx } from '../app';
import { describeSource } from '../progress/confidence';
import { remainingSec } from '../progress/percent';
import { formatDateTime, formatDuration, formatPercent, formatRelative } from '../utils/format';
import { thumbnailUrlForId } from '../video/videoId';
import { el, clear, copyText, toast } from '../utils/dom';
import { openVideoEditor } from './editors';

export async function renderDetail(
  container: HTMLElement,
  ctx: Ctx,
  id: string,
): Promise<void> {
  const decoded = decodeURIComponent(id);
  const video = await ctx.repo.get(decoded);
  clear(container);

  if (!video) {
    container.appendChild(
      el('div', { class: 'empty-state' }, [
        el('p', { text: 'Không tìm thấy video này.' }),
        el('a', { class: 'btn', text: 'Về tổng quan', attrs: { href: '#/' } }),
      ]),
    );
    return;
  }

  const now = ctx.now();
  const rest = remainingSec(video.positionSec, video.durationSec);
  const thumbUrl = thumbnailUrlForId(video.id);

  const header = el('div', { class: 'detail__head' }, [
    thumbUrl
      ? el('img', {
          class: 'detail__thumb',
          attrs: { src: thumbUrl, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' },
        })
      : el('div', { class: 'detail__thumb detail__thumb--placeholder', text: '▶' }),
    el('div', { class: 'detail__meta' }, [
      el('h2', { class: 'detail__title', text: video.title }),
      el('p', { class: 'hint', text: `Nguồn: ${describeSource(video.source)} · độ tin cậy ${video.confidence}` }),
      el('p', {
        class: 'hint',
        text: `Ghi nhận lần cuối ${formatRelative(video.lastWatchedAt, now)} (${formatDateTime(video.lastWatchedAt)})`,
      }),
    ]),
  ]);

  const progress = el(
    'div',
    {
      class: 'progress progress--lg',
      attrs: {
        role: 'progressbar',
        'aria-valuenow': String(Math.round(video.percent)),
        'aria-valuemin': '0',
        'aria-valuemax': '100',
      },
    },
    [el('div', { class: 'progress__fill', style: { width: `${video.percent}%` } })],
  );

  const numbers = el('div', { class: 'statgrid statgrid--compact' }, [
    el('div', { class: 'stat' }, [
      el('span', { class: 'stat__value', text: formatDuration(video.positionSec) }),
      el('span', { class: 'stat__label', text: 'Đang ở' }),
    ]),
    el('div', { class: 'stat' }, [
      el('span', { class: 'stat__value', text: formatDuration(video.durationSec) }),
      el('span', { class: 'stat__label', text: 'Thời lượng' }),
    ]),
    el('div', { class: 'stat' }, [
      el('span', { class: 'stat__value', text: formatPercent(video.percent) }),
      el('span', { class: 'stat__label', text: 'Hoàn thành' }),
    ]),
    el('div', { class: 'stat' }, [
      el('span', { class: 'stat__value', text: rest > 0 ? formatDuration(rest) : '—' }),
      el('span', { class: 'stat__label', text: 'Còn lại' }),
    ]),
  ]);

  const actions = el('div', { class: 'detail__actions' }, [
    el('button', {
      class: 'btn btn--primary',
      text: '▶ Xem trong Facebook',
      attrs: { type: 'button' },
      on: { click: () => ctx.startWatch(video) },
    }),
    video.url
      ? el('button', {
          class: 'btn',
          text: 'Mở bằng trình duyệt',
          attrs: { type: 'button' },
          on: { click: () => ctx.startWatch(video, 'http') },
        })
      : null,
    el('button', {
      class: 'btn',
      text: '✎ Sửa',
      attrs: { type: 'button' },
      on: { click: () => openVideoEditor(video, ctx) },
    }),
    video.url
      ? el('button', {
          class: 'btn btn--ghost',
          text: 'Sao chép link',
          attrs: { type: 'button' },
          on: {
            click: () =>
              void copyText(video.url).then((ok) =>
                toast(ok ? 'Đã sao chép link.' : 'Không sao chép được.', ok ? 'success' : 'error'),
              ),
          },
        })
      : null,
  ]);

  container.appendChild(el('a', { class: 'backlink', text: '← Về tổng quan', attrs: { href: '#/' } }));
  container.appendChild(header);
  container.appendChild(progress);
  container.appendChild(numbers);
  container.appendChild(actions);

  if (video.note) {
    container.appendChild(el('h3', { class: 'section-title', text: 'Ghi chú' }));
    container.appendChild(el('p', { class: 'note', text: video.note }));
  }

  if (video.tags && video.tags.length > 0) {
    container.appendChild(el('h3', { class: 'section-title', text: 'Tag' }));
    container.appendChild(
      el('div', { class: 'tags' }, video.tags.map((tag) => el('span', { class: 'tag', text: tag }))),
    );
  }

  container.appendChild(el('h3', { class: 'section-title', text: 'Lịch sử thay đổi' }));
  const history = video.history ?? [];
  if (history.length === 0) {
    container.appendChild(el('p', { class: 'hint', text: 'Chưa có thay đổi nào được ghi lại.' }));
  } else {
    container.appendChild(
      el(
        'ul',
        { class: 'history' },
        [...history]
          .reverse()
          .map((entry) =>
            el('li', {
              text: `${formatDateTime(entry.at)} · ${entry.field}: ${String(entry.from ?? '—')} → ${String(
                entry.to ?? '—',
              )} (${describeSource(entry.source)})`,
            }),
          ),
      ),
    );
  }
}
