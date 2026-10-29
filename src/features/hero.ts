/**
 * Cinematic hero: the Higgsfield showroom film is scrubbed by scroll while the section is pinned.
 * - The film is fetched once into memory so seeking never waits on the network.
 * - On load the camera drifts a little on its own, so the first view already feels alive.
 * - Text states, scale and shade are tied to the same progress value, so nothing jumps.
 * - Reduced motion: the poster stays, no pinning and no scrubbing.
 */

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function pickSource(video: HTMLVideoElement): string {
  const mobile = window.matchMedia('(max-width: 760px)').matches;
  if (mobile) return video.dataset.srcMobile!;
  const px = window.innerWidth * Math.min(window.devicePixelRatio || 1, 2);
  const slow = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (slow?.saveData || slow?.effectiveType === '2g' || slow?.effectiveType === '3g' || px <= 1440) return video.dataset.srcCompact!;
  return video.dataset.srcDesktop!;
}

export function initHero(reducedMotion: MediaQueryList): void {
  const hero = document.querySelector<HTMLElement>('.hero');
  if (!hero) return;
  const video = hero.querySelector<HTMLVideoElement>('.hero__video')!;
  const media = hero.querySelector<HTMLElement>('.hero__media')!;
  const copyEl = hero.querySelector<HTMLElement>('.hero__copy')!;
  const chapter = hero.querySelector<HTMLElement>('.hero__chapter')!;
  const vignette = hero.querySelector<HTMLElement>('.hero__vignette')!;
  const bar = hero.querySelector<HTMLElement>('.hero__progress i');
  const cue = hero.querySelector<HTMLElement>('.hero__cue');

  let duration = 0;
  let ready = false;
  let target = 0;
  let shown = 0;
  let intro = 0;
  let introStart = 0;
  let raf = 0;
  let objectUrl = '';
  let seeking = false;
  let seekAt = 0;

  const progress = () => {
    const rect = hero.getBoundingClientRect();
    const span = hero.offsetHeight - window.innerHeight;
    return span > 0 ? clamp(-rect.top / span) : 0;
  };

  const applyText = (p: number) => {
    // State 1: headline and actions, released early with a soft blur.
    const out = smooth(0.08, 0.34, p);
    copyEl.style.opacity = String(1 - out);
    copyEl.style.transform = `translate3d(0, ${(-out * 48).toFixed(1)}px, 0)`;
    copyEl.style.filter = out > 0.01 ? `blur(${(out * 6).toFixed(2)}px)` : '';
    copyEl.style.pointerEvents = out > 0.6 ? 'none' : '';
    // State 2: the renovation message rises in the middle of the move.
    const inC = smooth(0.4, 0.56, p);
    const outC = smooth(0.8, 0.95, p);
    chapter.style.opacity = String(inC * (1 - outC));
    chapter.style.transform = `translate3d(0, ${((1 - inC) * 36 - outC * 30).toFixed(1)}px, 0)`;
    // Depth: a slow scale and a final fade that hands over to the next section.
    media.style.transform = `scale(${(1.0 + p * 0.06).toFixed(4)})`;
    vignette.style.opacity = String(smooth(0.86, 1, p) * 0.55);
    if (bar) bar.style.transform = `scaleY(${p.toFixed(4)})`;
    if (cue) cue.style.opacity = String(1 - smooth(0.02, 0.12, p));
  };

  const tick = (now: number) => {
    raf = 0;
    const p = progress();
    if (introStart && intro < 1) intro = clamp((now - introStart) / 2600);
    // The automatic drift covers the first 12% of the film; scrolling continues from there.
    const introTime = 0.12 * (1 - Math.pow(1 - intro, 3));
    target = Math.max(p, introTime);
    shown += (target - shown) * 0.14;
    if (Math.abs(target - shown) < 0.0005) shown = target;
    applyText(p);
    // A seek that never reports back (rare on some mobile browsers) must not freeze the film.
    if (seeking && now - seekAt > 300) seeking = false;
    if (ready && duration && !seeking) {
      const t = shown * (duration - 0.05);
      if (Math.abs(video.currentTime - t) > 1 / 60) {
        seeking = true;
        seekAt = now;
        video.currentTime = t;
      }
    }
    if (shown !== target || (introStart && intro < 1) || seeking) raf = requestAnimationFrame(tick);
  };
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(tick);
  };

  video.addEventListener('seeked', () => {
    seeking = false;
    schedule();
  });

  const attach = (src: string) =>
    new Promise<void>((resolve, reject) => {
      const ok = () => {
        video.removeEventListener('error', bad);
        resolve();
      };
      const bad = () => {
        video.removeEventListener('loadeddata', ok);
        reject(new Error('video'));
      };
      video.addEventListener('loadeddata', ok, { once: true });
      video.addEventListener('error', bad, { once: true });
      video.src = src;
      video.load();
    });

  const load = async () => {
    const src = pickSource(video);
    try {
      // In memory, every seek is instant; this is what makes scrubbing smooth.
      const res = await fetch(src);
      if (!res.ok) throw new Error(String(res.status));
      objectUrl = URL.createObjectURL(await res.blob());
      await attach(objectUrl);
    } catch {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = '';
      await attach(src); // stream the file directly instead
    }
    duration = video.duration || 10;
    video.pause();
    video.currentTime = 0.001;
    ready = true;
    hero.dataset.video = 'ready';
    introStart = performance.now();
    schedule();
  };

  const enable = () => {
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    schedule();
    if (!ready && !video.src) {
      // Let the poster paint first; start fetching the film right after.
      const start = () => load().catch(() => {
        hero.dataset.video = 'failed';
      });
      if ('requestIdleCallback' in window) (window as Window & typeof globalThis).requestIdleCallback(start, { timeout: 1200 });
      else setTimeout(start, 300);
    }
  };

  const disable = () => {
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    cancelAnimationFrame(raf);
    raf = 0;
    copyEl.style.cssText = '';
    chapter.style.cssText = '';
    media.style.transform = '';
    vignette.style.opacity = '';
  };

  const apply = () => (reducedMotion.matches ? disable() : enable());
  apply();
  reducedMotion.addEventListener('change', apply);
  window.addEventListener('pagehide', () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  });
}
