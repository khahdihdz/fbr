import { el, clear } from '../utils/dom';

export interface Shell {
  root: HTMLElement;
  headerActions: HTMLElement;
  main: HTMLElement;
  nav: HTMLElement;
  setTitle(title: string): void;
  setActions(nodes: Node[]): void;
  setActive(route: string): void;
}

const NAV_ITEMS: Array<{ route: string; label: string; icon: string }> = [
  { route: '/', label: 'Tổng quan', icon: '▤' },
  { route: '/stats', label: 'Thống kê', icon: '▦' },
  { route: '/import', label: 'Nhập', icon: '⇪' },
  { route: '/settings', label: 'Cài đặt', icon: '⚙' },
];

export function createShell(root: HTMLElement): Shell {
  clear(root);

  const title = el('h1', { class: 'topbar__title', text: 'FB Watch Progress' });
  const headerActions = el('div', { class: 'topbar__actions' });
  const topbar = el('header', { class: 'topbar' }, [title, headerActions]);

  const main = el('main', { class: 'main', attrs: { id: 'main' } });

  const links = NAV_ITEMS.map((item) =>
    el('a', {
      class: 'navlink',
      attrs: { href: `#${item.route}` },
      dataset: { route: item.route },
    }, [
      el('span', { class: 'navlink__icon', text: item.icon, attrs: { 'aria-hidden': 'true' } }),
      el('span', { class: 'navlink__label', text: item.label }),
    ]),
  );
  const nav = el('nav', { class: 'nav', attrs: { 'aria-label': 'Điều hướng chính' } }, links);

  root.appendChild(topbar);
  root.appendChild(main);
  root.appendChild(nav);

  return {
    root,
    headerActions,
    main,
    nav,
    setTitle(value: string): void {
      title.textContent = value;
    },
    setActions(nodes: Node[]): void {
      clear(headerActions);
      for (const node of nodes) headerActions.appendChild(node);
    },
    setActive(route: string): void {
      for (const link of links) {
        const target = link.dataset['route'] ?? '';
        const active = target === route || (target !== '/' && route.startsWith(target));
        link.classList.toggle('navlink--active', active);
        if (active) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      }
    },
  };
}
