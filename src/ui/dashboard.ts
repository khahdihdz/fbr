import type { Ctx } from '../app';
import type { VideoProgress } from '../types';
import { el, clear } from '../utils/dom';
import { formatDuration, formatNumber } from '../utils/format';
import { computeStats } from '../progress/stats';
import { renderCard } from './card';
import {
  DEFAULT_FILTER_STATE,
  type FilterState,
  renderFilterBar,
  filterAndSort,
} from './filters';
import { renderOnboarding } from './onboarding';

const STATE_KEY = 'fbr:filter';

function loadState(): FilterState {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return { ...DEFAULT_FILTER_STATE };
    const parsed = JSON.parse(raw) as Partial<FilterState>;
    return {
      tab: parsed.tab ?? DEFAULT_FILTER_STATE.tab,
      search: parsed.search ?? DEFAULT_FILTER_STATE.search,
      sort: parsed.sort ?? DEFAULT_FILTER_STATE.sort,
    };
  } catch {
    return { ...DEFAULT_FILTER_STATE };
  }
}

function saveState(state: FilterState): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    /* bỏ qua */
  }
}

export async function renderDashboard(container: HTMLElement, ctx: Ctx): Promise<void> {
  const videos = await ctx.repo.all();
  const state = loadState();
  const now = ctx.now();

  clear(container);

  if (videos.length === 0) {
    renderOnboarding(container, ctx);
    return;
  }

  const stats = computeStats(videos, now);
  const summary = el('section', { class: 'summary' }, [
    el('div', { class: 'summary__item' }, [
      el('span', { class: 'summary__value', text: formatNumber(stats.totalVideos) }),
      el('span', { class: 'summary__label', text: 'video' }),
    ]),
    el('div', { class: 'summary__item' }, [
      el('span', { class: 'summary__value', text: formatDuration(stats.totalWatchedSec) }),
      el('span', { class: 'summary__label', text: 'tổng thời gian' }),
    ]),
    el('div', { class: 'summary__item' }, [
      el('span', { class: 'summary__value', text: formatNumber(stats.completedVideos) }),
      el('span', { class: 'summary__label', text: 'đã xem xong' }),
    ]),
    el('div', { class: 'summary__item' }, [
      el('span', { class: 'summary__value', text: formatNumber(stats.streakDays) }),
      el('span', { class: 'summary__label', text: 'ngày liên tiếp' }),
    ]),
  ]);

  const filterHost = el('div', { class: 'filterbar-host' });
  const listHost = el('div', { class: 'grid' });

  const paint = (all: VideoProgress[]): void => {
    renderFilterBar(filterHost, state, all, {
      onTabChange(tab) {
        state.tab = tab;
        saveState(state);
        paint(all);
      },
      onSearchChange(value) {
        state.search = value;
        saveState(state);
        const caret = document.activeElement;
        paint(all);
        if (caret instanceof HTMLInputElement) {
          const next = filterHost.querySelector('input[type="search"]');
          if (next instanceof HTMLInputElement) {
            next.focus();
            next.setSelectionRange(next.value.length, next.value.length);
          }
        }
      },
      onSortChange(sort) {
        state.sort = sort;
        saveState(state);
        paint(all);
      },
    });

    const filtered = filterAndSort(all, state);
    clear(listHost);
    if (filtered.length === 0) {
      listHost.appendChild(
        el('p', { class: 'empty', text: 'Không có video nào khớp bộ lọc hiện tại.' }),
      );
      return;
    }
    for (const video of filtered) listHost.appendChild(renderCard(video, ctx));
  };

  paint(videos);

  container.appendChild(summary);
  container.appendChild(filterHost);
  container.appendChild(listHost);
}
