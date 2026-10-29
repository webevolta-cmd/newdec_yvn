import { raw } from './html.ts';

const svg = (body: string, extra = '') =>
  raw(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"${extra}>${body}</svg>`);

export const icons = {
  phone: svg('<path d="M5 3.5h3l1.6 4-2 1.3a11 11 0 0 0 5.6 5.6l1.3-2 4 1.6v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 3 5.7 2 2 0 0 1 5 3.5Z"/>'),
  arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  check: svg('<circle cx="12" cy="12" r="9.5"/><path d="m7.5 12.3 3 3 6-6.3"/>'),
  pin: svg('<path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>'),
  glue: svg('<path d="M9 3h6v4H9zM8 7h8l-1 4H9z"/><path d="M12 11v4"/><path d="M5 21c2-3 4-3 7-3s5 0 7 3"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  drop: svg('<path d="M12 3.5s6 6.4 6 10.5a6 6 0 0 1-12 0c0-4.1 6-10.5 6-10.5Z"/>'),
  layers: svg('<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>'),
  ruler: svg('<path d="M3 17 17 3l4 4L7 21z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/>'),
  instagram: svg('<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r=".8" fill="currentColor"/>'),
  tiktok: svg('<path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 3c.5 2.7 2.3 4.5 5 5"/>'),
};
