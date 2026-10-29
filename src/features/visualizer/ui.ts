import { copy } from '../../content/copy.ts';
import { categories, products, type Product } from '../../content/products.ts';
import { WallVisualizer, type RoomMeta } from './engine.ts';
import roomMeta from '../../content/room.json';

const v = copy.visualizer;
const byId = new Map(products.map((p) => [p.id, p]));

export interface VisualizerApi {
  select(id: string | null, opts?: { scroll?: boolean }): void;
  current(): Product | null;
}

export function initVisualizer(reducedMotion: MediaQueryList): VisualizerApi | null {
  const section = document.getElementById('visualizer');
  const stage = section?.querySelector<HTMLElement>('[data-viz-stage]');
  if (!section || !stage) return null;

  const canvas = stage.querySelector<HTMLCanvasElement>('[data-viz-canvas]')!;
  const fallback = stage.querySelector<HTMLImageElement>('[data-viz-fallback]')!;
  const status = stage.querySelector<HTMLElement>('[data-viz-status]')!;
  const statusText = stage.querySelector<HTMLElement>('[data-viz-status-text]')!;
  const now = stage.querySelector<HTMLElement>('[data-viz-now]')!;
  const compareBtn = stage.querySelector<HTMLButtonElement>('[data-viz-compare]')!;
  const panHint = stage.querySelector<HTMLElement>('[data-viz-pan-hint]')!;
  const group = section.querySelector<HTMLElement>('[data-viz-swatches]')!;
  const options = Array.from(group.querySelectorAll<HTMLButtonElement>('[data-viz-option]'));
  const filters = Array.from(section.querySelectorAll<HTMLButtonElement>('[data-viz-filters] [data-filter]'));
  const errorBox = section.querySelector<HTMLElement>('[data-viz-error]')!;
  const errorText = section.querySelector<HTMLElement>('[data-viz-error-text]')!;
  const retryBtn = section.querySelector<HTMLButtonElement>('[data-viz-retry]')!;
  const infoCat = section.querySelector<HTMLElement>('[data-viz-info-cat]')!;
  const infoName = section.querySelector<HTMLElement>('[data-viz-info-name]')!;
  const infoSpecs = section.querySelector<HTMLElement>('[data-viz-info-specs]')!;
  const quoteBtn = section.querySelector<HTMLButtonElement>('[data-viz-quote]')!;

  let engine: WallVisualizer | null = null;
  let engineReady: Promise<void> | null = null;
  let selected: Product | null = null;
  let pending: string | null = null;
  let token = 0;
  let spinnerTimer = 0;

  const showStatus = (text: string | null) => {
    window.clearTimeout(spinnerTimer);
    if (!text) {
      status.hidden = true;
      return;
    }
    statusText.textContent = text;
    status.hidden = false;
  };

  const fatal = (message: string) => {
    stage.dataset.state = 'error';
    status.hidden = true;
    errorText.textContent = message;
    retryBtn.hidden = true;
    errorBox.hidden = false;
  };

  const updateInfo = (p: Product | null) => {
    infoCat.textContent = p ? categories[p.category].name : v.originalCat;
    infoName.textContent = p ? p.name : v.originalName;
    const rows: Array<[string, string]> = p
      ? ([
          [v.sizeLabel, p.size ?? ''],
          [v.thicknessLabel, p.thickness ?? ''],
          [v.finishLabel, p.finish],
        ].filter(([, val]) => val) as Array<[string, string]>)
      : [];
    infoSpecs.replaceChildren(
      ...rows.flatMap(([k, val]) => {
        const dt = document.createElement('dt');
        dt.textContent = k;
        const dd = document.createElement('dd');
        dd.textContent = val;
        return [dt, dd];
      }),
    );
    quoteBtn.textContent = p ? v.quoteCta : v.quoteCtaOriginal;
    quoteBtn.dataset.product = p?.id ?? '';
    now.replaceChildren();
    const b = document.createElement('b');
    b.textContent = p ? p.name : v.originalName;
    const s = document.createElement('span');
    s.textContent = p ? [categories[p.category].short, p.size].filter(Boolean).join(' · ') : v.originalHint;
    now.append(b, s);
  };

  const markChecked = (id: string) => {
    for (const o of options) {
      const on = o.dataset.vizOption === id;
      o.setAttribute('aria-checked', String(on));
      o.tabIndex = on ? 0 : -1;
    }
  };

  const ensureEngine = (): Promise<void> => {
    if (engineReady) return engineReady;
    try {
      engine = new WallVisualizer(canvas, roomMeta as unknown as RoomMeta, () => reducedMotion.matches);
    } catch {
      fatal(v.webglError);
      engineReady = Promise.reject(new Error('webgl'));
      engineReady.catch(() => undefined);
      return engineReady;
    }
    showStatus(v.loadingRoom);
    const wide = Math.min(window.devicePixelRatio || 1, 2) * stage.clientWidth > 1700;
    const size = wide ? 2560 : 1600;
    engineReady = engine
      .init(`media/visualizer/room-${size}.webp`, `media/visualizer/wall-${size}.png`)
      .then(() => {
        stage.dataset.state = 'ready';
        showStatus(null);
        updatePan();
      })
      .catch(() => {
        fatal(v.roomError);
        throw new Error('room');
      });
    return engineReady;
  };

  const apply = async (id: string | null) => {
    const myToken = ++token;
    const p = id ? byId.get(id) ?? null : null;
    pending = p?.id ?? null;
    delete stage.dataset.applied;
    errorBox.hidden = true;
    markChecked(p?.id ?? 'original');
    updateInfo(p);
    try {
      await ensureEngine();
    } catch {
      return;
    }
    if (myToken !== token || !engine) return;
    // Only show the spinner if the texture takes a moment; quick loads never flash.
    window.clearTimeout(spinnerTimer);
    spinnerTimer = window.setTimeout(() => {
      if (myToken === token) showStatus(v.loadingPanel);
    }, 160);
    try {
      const result = await engine.show(p ? p.surface : null);
      if (result === 'superseded' || myToken !== token) return;
      showStatus(null);
      selected = p;
      pending = null;
      stage.dataset.applied = p?.id ?? 'original';
      if (p) now.setAttribute('aria-label', v.applied(p.name));
      else now.removeAttribute('aria-label');
    } catch {
      if (myToken !== token) return;
      showStatus(null);
      errorText.textContent = v.textureError;
      retryBtn.hidden = false;
      errorBox.hidden = false;
    }
  };

  // Roving tabindex radiogroup.
  group.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-viz-option]');
    if (!btn) return;
    const id = btn.dataset.vizOption!;
    void apply(id === 'original' ? null : id);
  });
  group.addEventListener('keydown', (e) => {
    const visible = options.filter((o) => !o.hidden);
    const idx = visible.indexOf(document.activeElement as HTMLButtonElement);
    if (idx < 0) return;
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % visible.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + visible.length) % visible.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = visible.length - 1;
    if (next < 0) return;
    e.preventDefault();
    visible[next].focus();
    visible[next].click();
  });
  for (const o of options) {
    const warm = () => {
      const p = byId.get(o.dataset.vizOption!);
      if (p && engine) engine.prefetch(p.surface);
    };
    o.addEventListener('pointerenter', warm);
    o.addEventListener('focus', warm);
  }

  for (const f of filters) {
    f.addEventListener('click', () => {
      const cat = f.dataset.filter!;
      for (const x of filters) x.setAttribute('aria-pressed', String(x === f));
      for (const o of options) o.hidden = !(cat === 'all' || o.dataset.category === cat || o.dataset.vizOption === 'original');
      const checked = options.find((o) => o.getAttribute('aria-checked') === 'true');
      if (checked?.hidden) {
        checked.tabIndex = -1;
        options[0].tabIndex = 0;
      }
    });
  }

  retryBtn.addEventListener('click', () => void apply(pending));

  // Press and hold to compare with the untouched room; keyboard users toggle it.
  const setCompare = (on: boolean) => {
    compareBtn.setAttribute('aria-pressed', String(on));
    engine?.setCompare(on);
  };
  compareBtn.addEventListener('pointerdown', (e) => {
    compareBtn.setPointerCapture(e.pointerId);
    setCompare(true);
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) compareBtn.addEventListener(ev, () => setCompare(false));
  compareBtn.addEventListener('click', (e) => {
    if (e.detail === 0) setCompare(compareBtn.getAttribute('aria-pressed') !== 'true');
  });
  compareBtn.addEventListener('blur', () => setCompare(false));

  // Drag to pan when the stage shows only part of the room (phones).
  let drag: { x: number; focus: number; id: number } | null = null;
  const updatePan = () => {
    const vis = engine ? engine.visibleWidth() : 1;
    panHint.hidden = vis >= 0.98;
    if (engine) fallback.style.objectPosition = `${(engine.focus * 100).toFixed(1)}% 50%`;
  };
  stage.addEventListener('pointerdown', (e) => {
    if (!engine || engine.visibleWidth() >= 0.98 || (e.target as HTMLElement).closest('button')) return;
    drag = { x: e.clientX, focus: engine.focus, id: e.pointerId };
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag || !engine || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) < 4) return;
    const vis = engine.visibleWidth();
    engine.setFocus(drag.focus - (dx / stage.clientWidth) * vis);
    panHint.hidden = true;
    fallback.style.objectPosition = `${(engine.focus * 100).toFixed(1)}% 50%`;
  });
  const endDrag = () => {
    drag = null;
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  const ro = new ResizeObserver(() => {
    engine?.resize();
    updatePan();
  });
  ro.observe(stage);

  // Start loading the room shortly before the section scrolls into view.
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((en) => en.isIntersecting)) {
        io.disconnect();
        void ensureEngine();
      }
    },
    { rootMargin: '800px 0px' },
  );
  io.observe(section);

  updateInfo(null);

  if (location.search.includes('e2e')) {
    // Automated browser checks read rendered pixels through this hook; it is absent otherwise.
    (window as Window & { __NEWDEC_VIZ__?: unknown }).__NEWDEC_VIZ__ = {
      sample: (pts: Array<[number, number]>) => engine?.sample(pts) ?? null,
      focus: () => engine?.focus ?? null,
      animating: () => engine?.animating ?? false,
    };
  }

  return {
    select(id, opts) {
      if (opts?.scroll) {
        const filterAll = filters.find((f) => f.dataset.filter === 'all');
        filterAll?.click();
        section.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
      }
      void apply(id);
    },
    current: () => selected ?? (pending ? byId.get(pending) ?? null : null),
  };
}
