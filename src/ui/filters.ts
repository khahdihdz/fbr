import type { SortKey, Tab, VideoProgress } from '../types';
import { isInProgress } from '../progress/stats';
import { remainingSec } from '../progress/percent';
import { el, clear } from '../utils/dom';

export interface FilterState {
  tab: Tab;
  search: string;
  sort: SortKey;
}

export const DEFAULT_FILTER_STATE: FilterState = { tab: 'in_progress', search: '', sort: 'recent' };

/** Chuẩn hoá để tìm kiếm không phân biệt dấu và chữ hoa. */
export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .trim();
}

export function matchesSearch(video: VideoProgress, query: string): boolean {
  const q = normalizeSearch(query);
  if (!q) return true;
  const haystack = normalizeSearch(`${video.title} ${video.url} ${(video.tags ?? []).join(' ')}`);
  return q.split(/\s+/).every((token) => haystack.includes(token));
}

export function inTab(video: VideoProgress, tab: Tab): boolean {
  switch (tab) {
    case 'completed':
      return video.completed;
    case 'review':
      return video.needsReview;
    case 'in_progress':
      return isInProgress(video);
    case 'all':
    default:
      return true;
  }
}

export function sortVideos(videos: VideoProgress[], sort: SortKey): VideoProgress[] {
  const copy = [...videos];
  const byRecent = (a: VideoProgress, b: VideoProgress): number =>
    b.lastWatchedAt - a.lastWatchedAt || a.id.localeCompare(b.id);

  switch (sort) {
    case 'progress':
      return copy.sort((a, b) => b.percent - a.percent || byRecent(a, b));
    case 'remaining': {
      const rest = (video: VideoProgress): number => {
        if (video.durationSec <= 0) return Number.POSITIVE_INFINITY;
        return remainingSec(video.positionSec, video.durationSec);
      };
      return copy.sort((a, b) => rest(a) - rest(b) || byRecent(a, b));
    }
    case 'title':
      return copy.sort((a, b) => a.title.localeCompare(b.title, 'vi') || byRecent(a, b));
    case 'recent':
    default:
      return copy.sort(byRecent);
  }
}

export function filterVideos(videos: VideoProgress[], state: FilterState): VideoProgress[] {
  return videos.filter((video) => inTab(video, state.tab) && matchesSearch(video, state.search));
}

export function filterAndSort(videos: VideoProgress[], state: FilterState): VideoProgress[] {
  return sortVideos(filterVideos(videos, state), state.sort);
}

export function tabCounts(videos: VideoProgress[]): Record<Tab, number> {
  const counts: Record<Tab, number> = { in_progress: 0, completed: 0, review: 0, all: videos.length };
  for (const video of videos) {
    if (isInProgress(video)) counts.in_progress += 1;
    if (video.completed) counts.completed += 1;
    if (video.needsReview) counts.review += 1;
  }
  return counts;
}

export const TAB_LABELS: Record<Tab, string> = {
  in_progress: 'Đang xem dở',
  completed: 'Đã xem xong',
  review: 'Cần rà lại',
  all: 'Tất cả',
};

export const SORT_LABELS: Record<SortKey, string> = {
  recent: 'Gần đây nhất',
  progress: 'Tiến trình',
  remaining: 'Còn lại ít nhất',
  title: 'Tên A → Z',
};

export interface FilterBarHandlers {
  onTabChange(tab: Tab): void;
  onSearchChange(value: string): void;
  onSortChange(sort: SortKey): void;
}

/** Vẽ thanh lọc. Trả về phần tử gốc để caller gắn vào DOM. */
export function renderFilterBar(
  container: HTMLElement,
  state: FilterState,
  videos: VideoProgress[],
  handlers: FilterBarHandlers,
): HTMLElement {
  const counts = tabCounts(videos);
  clear(container);

  const tabs = el(
    'div',
    { class: 'tabs', attrs: { role: 'tablist' } },
    (Object.keys(TAB_LABELS) as Tab[]).map((tab) =>
      el('button', {
        class: `tab${state.tab === tab ? ' tab--active' : ''}`,
        attrs: { type: 'button', role: 'tab', 'aria-selected': state.tab === tab },
        text: `${TAB_LABELS[tab]} (${counts[tab]})`,
        on: { click: () => handlers.onTabChange(tab) },
      }),
    ),
  );

  const search = el('input', {
    class: 'input input--search',
    attrs: {
      type: 'search',
      placeholder: 'Tìm theo tiêu đề, link hoặc tag…',
      'aria-label': 'Tìm kiếm video',
      value: state.search,
    },
    on: {
      input: (event) => handlers.onSearchChange((event.target as HTMLInputElement).value),
    },
  }) as HTMLInputElement;
  search.value = state.search;

  const sort = el('select', {
    class: 'input input--sort',
    attrs: { 'aria-label': 'Sắp xếp' },
    on: { change: (event) => handlers.onSortChange((event.target as HTMLSelectElement).value as SortKey) },
  });
  for (const [value, label] of Object.entries(SORT_LABELS)) {
    const option = el('option', { text: label, attrs: { value } });
    if (value === state.sort) option.setAttribute('selected', '');
    sort.appendChild(option);
  }

  const wrapper = el('div', { class: 'filterbar' }, [
    tabs,
    el('div', { class: 'filterbar__row' }, [search, sort]),
  ]);
  container.appendChild(wrapper);
  return wrapper;
}
