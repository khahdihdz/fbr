import type { Ctx } from '../app';
import { el, clear } from '../utils/dom';
import { formatDuration, formatNumber, formatShortDay } from '../utils/format';
import { computeStats } from '../progress/stats';

function barChart(byDay: Array<{ key: string; count: number }>): HTMLElement {
  const max = Math.max(1, ...byDay.map((day) => day.count));
  const width = 620;
  const height = 160;
  const gap = 3;
  const barWidth = Math.max(2, (width - gap * (byDay.length - 1)) / byDay.length);

  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height + 22}`);
  svg.setAttribute('class', 'chart');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Số video xem theo ngày');

  byDay.forEach((day, index) => {
    const x = index * (barWidth + gap);
    const barHeight = day.count === 0 ? 0 : Math.max(3, (day.count / max) * height);
    const rect = document.createElementNS(svgNs, 'rect');
    rect.setAttribute('x', x.toFixed(2));
    rect.setAttribute('y', (height - barHeight).toFixed(2));
    rect.setAttribute('width', barWidth.toFixed(2));
    rect.setAttribute('height', barHeight.toFixed(2));
    rect.setAttribute('rx', '2');
    rect.setAttribute('class', day.count > 0 ? 'chart__bar' : 'chart__bar chart__bar--empty');
    const title = document.createElementNS(svgNs, 'title');
    title.textContent = `${day.key}: ${day.count} video`;
    rect.appendChild(title);
    svg.appendChild(rect);
  });

  const axis = document.createElementNS(svgNs, 'line');
  axis.setAttribute('x1', '0');
  axis.setAttribute('x2', String(width));
  axis.setAttribute('y1', String(height));
  axis.setAttribute('y2', String(height));
  axis.setAttribute('class', 'chart__axis');
  svg.appendChild(axis);

  const labelEvery = Math.max(1, Math.ceil(byDay.length / 8));
  byDay.forEach((day, index) => {
    if (index % labelEvery !== 0 && index !== byDay.length - 1) return;
    const text = document.createElementNS(svgNs, 'text');
    text.setAttribute('x', (index * (barWidth + gap) + barWidth / 2).toFixed(2));
    text.setAttribute('y', String(height + 16));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('class', 'chart__label');
    text.textContent = formatShortDay(day.key);
    svg.appendChild(text);
  });

  return el('div', { class: 'chart-wrap' }, [svg]);
}

export async function renderStats(container: HTMLElement, ctx: Ctx): Promise<void> {
  const videos = await ctx.repo.all();
  const now = ctx.now();
  const stats = computeStats(videos, now, 30);
  clear(container);

  if (videos.length === 0) {
    container.appendChild(el('p', { class: 'empty', text: 'Chưa có dữ liệu để thống kê.' }));
    return;
  }

  const cards = el('div', { class: 'statgrid' }, [
    el('div', { class: 'stat' }, [
      el('span', { class: 'stat__value', text: formatNumber(stats.totalVideos) }),
      el('span', { class: 'stat__label', text: 'Video đã theo dõi' }),
    ]),
    el('div', { class: 'stat' }, [
      el('span', { class: 'stat__value', text: formatDuration(stats.totalWatchedSec) }),
      el('span', { class: 'stat__label', text: 'Tổng thời gian đã xem' }),
    ]),
    el('div', { class: 'stat' }, [
      el('span', { class: 'stat__value', text: formatNumber(stats.completedVideos) }),
      el('span', { class: 'stat__label', text: 'Đã xem xong' }),
    ]),
    el('div', { class: 'stat' }, [
      el('span', { class: 'stat__value', text: formatNumber(stats.inProgressVideos) }),
      el('span', { class: 'stat__label', text: 'Đang xem dở' }),
    ]),
    el('div', { class: 'stat' }, [
      el('span', { class: 'stat__value', text: formatNumber(stats.needsReviewVideos) }),
      el('span', { class: 'stat__label', text: 'Cần rà lại' }),
    ]),
    el('div', { class: 'stat' }, [
      el('span', { class: 'stat__value', text: formatNumber(stats.streakDays) }),
      el('span', { class: 'stat__label', text: 'Chuỗi ngày liên tiếp' }),
    ]),
  ]);

  const tags = stats.topTags.length
    ? el(
        'div',
        { class: 'tags' },
        stats.topTags.map((tag) =>
          el('span', { class: 'tag', text: `${tag.tag} · ${tag.count}` }),
        ),
      )
    : el('p', { class: 'empty', text: 'Chưa có tag nào.' });

  container.appendChild(el('h2', { class: 'section-title', text: 'Tổng quan' }));
  container.appendChild(cards);
  container.appendChild(el('h2', { class: 'section-title', text: '30 ngày gần nhất' }));
  container.appendChild(barChart(stats.byDay));
  container.appendChild(el('h2', { class: 'section-title', text: 'Tag dùng nhiều' }));
  container.appendChild(tags);
  container.appendChild(
    el('p', {
      class: 'hint',
      text:
        'Biểu đồ đếm số video có hoạt động trong ngày, dựa trên thời điểm ghi nhận gần nhất của mỗi video. ' +
        'Con số này không phải thời lượng xem thực tế.',
    }),
  );
}
