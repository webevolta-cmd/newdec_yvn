import './styles/main.css';
import { copy } from './content/copy.ts';
import { InquiryForm } from './features/form.ts';
import { initHero } from './features/hero.ts';
import { initVisualizer } from './features/visualizer/ui.ts';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function initHeader(): void {
  const header = document.querySelector<HTMLElement>('.site-header');
  const toggle = header?.querySelector<HTMLButtonElement>('.menu-toggle');
  if (!header || !toggle) return;
  const setSolid = () => {
    header.dataset.solid = String(window.scrollY > 40 || header.dataset.menu === 'open');
  };
  const setMenu = (open: boolean) => {
    header.dataset.menu = open ? 'open' : 'closed';
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? toggle.dataset.labelClose! : toggle.dataset.labelOpen!);
    document.documentElement.style.overflow = open ? 'hidden' : '';
    setSolid();
  };
  toggle.addEventListener('click', () => setMenu(header.dataset.menu !== 'open'));
  header.querySelectorAll('.nav a, .nav button').forEach((el) => el.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && header.dataset.menu === 'open') {
      setMenu(false);
      toggle.focus();
    }
  });
  window.matchMedia('(min-width: 901px)').addEventListener('change', (m) => m.matches && setMenu(false));
  window.addEventListener('scroll', setSolid, { passive: true });
  setSolid();

  // Highlight the section currently in view.
  const links = new Map(Array.from(header.querySelectorAll<HTMLAnchorElement>('.nav a[href^="#"]')).map((a) => [a.hash.slice(1), a]));
  const spy = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        links.forEach((a, id) => (id === en.target.id ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')));
      }
    },
    { rootMargin: '-45% 0px -50% 0px' },
  );
  links.forEach((_, id) => {
    const el = document.getElementById(id);
    if (el) spy.observe(el);
  });
}

function initReveal(): void {
  const items = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
  if (reducedMotion.matches || !('IntersectionObserver' in window)) return;
  // Only elements below the first screen animate in; everything already visible stays put.
  const fold = window.innerHeight * 1.05;
  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        (en.target as HTMLElement).dataset.reveal = 'done';
        io.unobserve(en.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px' },
  );
  for (const el of items) {
    if (el.getBoundingClientRect().top > fold) {
      el.dataset.reveal = 'pending';
      io.observe(el);
    }
  }
}

const INITIAL_CARDS = 12;

function initCatalog(onTry: (id: string) => void): void {
  const grid = document.querySelector<HTMLElement>('[data-catalog-grid]');
  const count = document.querySelector<HTMLElement>('[data-catalog-count]');
  const filters = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-catalog-filters] [data-filter]'));
  if (!grid) return;
  const cards = Array.from(grid.querySelectorAll<HTMLElement>('[data-product-card]'));
  const more = document.querySelector<HTMLButtonElement>('[data-catalog-more]');

  // The "all" view starts with a short selection, taken round-robin across categories so it shows
  // the whole range; "show all" (or any category filter) lists everything.
  const byCat = new Map<string, HTMLElement[]>();
  for (const c of cards) byCat.set(c.dataset.category!, [...(byCat.get(c.dataset.category!) ?? []), c]);
  const featured = new Set<HTMLElement>();
  for (let i = 0; featured.size < Math.min(INITIAL_CARDS, cards.length); i++) {
    for (const list of byCat.values()) if (list[i] && featured.size < INITIAL_CARDS) featured.add(list[i]);
  }
  let expanded = cards.length <= INITIAL_CARDS;

  const apply = (cat: string) => {
    let n = 0;
    for (const c of cards) {
      const show = cat === 'all' ? expanded || featured.has(c) : c.dataset.category === cat;
      c.hidden = !show;
      if (show) n++;
    }
    const collapsed = cat === 'all' && !expanded;
    if (more) more.hidden = !collapsed;
    if (count) count.textContent = collapsed ? copy.catalog.countOf(n, cards.length) : copy.catalog.countLabel(n);
  };
  for (const f of filters) {
    f.addEventListener('click', () => {
      for (const x of filters) x.setAttribute('aria-pressed', String(x === f));
      apply(f.dataset.filter!);
    });
  }
  more?.addEventListener('click', () => {
    const firstHidden = cards.find((c) => c.hidden);
    expanded = true;
    apply('all');
    firstHidden?.querySelector<HTMLElement>('[data-try]')?.focus({ preventScroll: true });
  });
  apply('all');
  grid.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-try]');
    if (btn) onTry(btn.dataset.try!);
  });
}

function initCalculator(openQuote: (opts: { area?: string }) => void): void {
  const form = document.querySelector<HTMLFormElement>('[data-calc]');
  if (!form) return;
  const area = form.elements.namedItem('area') as HTMLInputElement;
  const format = form.elements.namedItem('format') as HTMLSelectElement;
  const out = form.querySelector<HTMLElement>('[data-calc-result]')!;
  const update = () => {
    const a = Number(area.value.replace(',', '.'));
    const per = Number(format.value);
    out.textContent = Number.isFinite(a) && a > 0 && per > 0 ? copy.specs.calc.result(Math.ceil(a / per)) : '—';
  };
  area.addEventListener('input', update);
  format.addEventListener('change', update);
  form.addEventListener('submit', (e) => e.preventDefault());
  form.querySelector('[data-calc-quote]')?.addEventListener('click', () => openQuote({ area: area.value }));
}

function initDialog() {
  const dialog = document.getElementById('quote-dialog') as HTMLDialogElement | null;
  const host = dialog?.querySelector<HTMLElement>('[data-form-host]');
  if (!dialog || !host) return null;
  const form = new InquiryForm(host);
  let opener: HTMLElement | null = null;

  const open = (opts: { product?: string | null; source?: string; area?: string; variant?: string | null }) => {
    opener = document.activeElement as HTMLElement | null;
    form.ensureEditable();
    form.setProduct(opts.product ?? null, opts.variant ?? null);
    form.setSource(opts.source ?? 'contact');
    if (opts.area) form.setArea(opts.area);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    document.documentElement.style.overflow = 'hidden';
    const first = dialog.querySelector<HTMLElement>(opts.product ? 'input[name="name"]' : 'select[name="productId"]');
    first?.focus();
  };
  const close = () => {
    if (dialog.open) dialog.close();
  };
  dialog.addEventListener('close', () => {
    document.documentElement.style.overflow = '';
    opener?.focus();
  });
  dialog.querySelector('[data-close]')?.addEventListener('click', close);
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) close();
  });
  return { open };
}

function initMapEmbed(): void {
  const frame = document.querySelector<HTMLElement>('[data-map-embed]');
  if (!frame) return;
  const io = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      const iframe = document.createElement('iframe');
      iframe.src = frame.dataset.src!;
      iframe.title = frame.dataset.title!;
      iframe.loading = 'lazy';
      iframe.referrerPolicy = 'no-referrer-when-downgrade';
      frame.append(iframe);
    },
    { rootMargin: '300px 0px' },
  );
  io.observe(frame);
}

function initParallax(): void {
  const bg = document.querySelector<HTMLElement>('[data-parallax]');
  if (!bg) return;
  let raf = 0;
  const update = () => {
    raf = 0;
    if (reducedMotion.matches) {
      bg.style.transform = '';
      return;
    }
    const r = bg.parentElement!.getBoundingClientRect();
    const p = (r.top + r.height / 2 - window.innerHeight / 2) / window.innerHeight;
    bg.style.transform = `translate3d(0, ${(p * -40).toFixed(1)}px, 0)`;
  };
  window.addEventListener('scroll', () => (raf ||= requestAnimationFrame(update)), { passive: true });
  update();
}

function boot(): void {
  initHeader();
  initHero(reducedMotion);
  initReveal();

  const contactHost = document.querySelector<HTMLElement>('#contact [data-form-host]');
  const contactForm = contactHost ? new InquiryForm(contactHost) : null;
  const dialog = initDialog();
  const openQuote = (opts: { product?: string | null; source?: string; area?: string }) => {
    if (dialog) dialog.open(opts);
    else if (contactForm) {
      contactForm.setProduct(opts.product ?? null);
      if (opts.area) contactForm.setArea(opts.area);
      document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const viz = initVisualizer(reducedMotion);
  initCatalog((id) => viz?.select(id, { scroll: true }));
  initCalculator((opts) => openQuote({ ...opts, source: 'contact' }));

  document.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-quote]');
    if (!btn) return;
    e.preventDefault();
    openQuote({ product: btn.dataset.product || null, source: btn.dataset.source });
  });

  initMapEmbed();
  initParallax();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
