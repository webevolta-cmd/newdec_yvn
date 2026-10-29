/**
 * Browser checks for the NEW DEC site (desktop + mobile).
 *
 *   BASE_URL=http://localhost:5173 node scripts/e2e/run.mjs
 *
 * Optional:
 *   MAIL_DIR=/path   directory where a local SMTP sink writes .eml files; enables the delivery check
 *   QUICK=1          visualizer check on a sample of products instead of every product
 *   ONLY=layout,hero,viz,catalog,forms   run a subset of the groups
 *
 * Needs a running server (npm run dev, or npm run preview) and Playwright's Chromium
 * (`npx playwright install chromium` on a fresh machine). Screenshots go to scripts/e2e/out/.
 */
import { chromium } from 'playwright';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = (process.env.BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '');
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const MAIL_DIR = process.env.MAIL_DIR;

const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const run = (group) => !ONLY || ONLY.includes(group);
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};
const dist = (a, b) => (a && b ? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) : Infinity);

// Image-space sample points (fractions of the room photo).
const WALL_PTS = [[0.3, 0.25], [0.55, 0.3], [0.68, 0.22], [0.25, 0.55]];
const KEEP_PTS = { sofa: [0.4, 0.7], pot: [0.835, 0.79], floor: [0.5, 0.93], curtain: [0.06, 0.45], ceiling: [0.5, 0.06] };

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function open(viewport, opts = {}) {
  const mobile = viewport.width < 700;
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: mobile ? 2 : 1,
    isMobile: mobile,
    hasTouch: mobile,
    reducedMotion: opts.reducedMotion ?? 'no-preference',
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}/?e2e`, { waitUntil: 'networkidle' });
  return { ctx, page, errors };
}

async function waitVizReady(page) {
  await page.locator('#visualizer').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('[data-viz-stage]')?.dataset.state === 'ready', null, { timeout: 45000 });
}

async function applyAndSettle(page, id) {
  await page.locator(`[data-viz-option="${id}"]`).click();
  await page.waitForFunction(
    (pid) => document.querySelector('[data-viz-stage]').dataset.applied === pid && !window.__NEWDEC_VIZ__.animating(),
    id,
    { timeout: 30000 },
  );
}

const sample = (page, pts) => page.evaluate((p) => window.__NEWDEC_VIZ__.sample(p), pts);

// ── 1. Layout at every breakpoint ─────────────────────────────────────────────────────────
for (const vp of !run('layout') ? [] : [
  { width: 1920, height: 1080, name: 'large desktop' },
  { width: 1440, height: 900, name: 'desktop' },
  { width: 1280, height: 720, name: 'laptop' },
  { width: 834, height: 1112, name: 'tablet' },
  { width: 390, height: 844, name: 'mobile' },
  { width: 360, height: 640, name: 'small mobile' },
]) {
  const { ctx, page, errors } = await open(vp);
  const m = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
    lang: document.documentElement.lang,
    h1: document.querySelectorAll('h1').length,
    sections: ['top', 'about', 'catalog', 'visualizer', 'specs', 'showroom', 'faq', 'contact'].filter((id) => !document.getElementById(id)),
    badLinks: Array.from(document.querySelectorAll('a[href^="#"]')).map((a) => a.getAttribute('href')).filter((h) => h.length > 1 && !document.getElementById(h.slice(1))),
    tel: Array.from(document.querySelectorAll('a[href^="tel:"]')).every((a) => a.getAttribute('href') === 'tel:+37444305355'),
    imgsNoAlt: Array.from(document.querySelectorAll('img')).filter((i) => !i.hasAttribute('alt')).length,
  }));
  check(`${vp.name} ${vp.width}px: no horizontal scroll`, m.sw <= m.cw, `${m.sw}/${m.cw}`);
  check(`${vp.name}: page language hy, one h1, all sections`, m.lang === 'hy' && m.h1 === 1 && m.sections.length === 0, JSON.stringify(m.sections));
  check(`${vp.name}: in-page links resolve, tel links correct, img alt present`, m.badLinks.length === 0 && m.tel && m.imgsNoAlt === 0, JSON.stringify(m.badLinks));
  // Walk the whole page to trigger lazy content, then look for overflowing elements.
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < total; y += vp.height * 0.8) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(120);
  }
  const overflow = await page.evaluate(() =>
    Array.from(document.querySelectorAll('body *'))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && (r.right > document.documentElement.clientWidth + 1 || r.left < -1) && s.position !== 'fixed' && !el.closest('.swatches, .specs__table-wrap, .viz__stage, .hp, .skip, .hero__media, .cta-band__bg');
      })
      .slice(0, 5)
      .map((el) => el.className || el.tagName),
  );
  check(`${vp.name}: no element overflows the viewport`, overflow.length === 0, JSON.stringify(overflow));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, `layout-${vp.width}.jpg`), type: 'jpeg', quality: 70 });
  check(`${vp.name}: no console errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ── 2. Hero film and scroll behaviour ─────────────────────────────────────────────────────
for (const vp of !run('hero') ? [] : [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  const { ctx, page } = await open(vp);
  const ready = await page
    .waitForFunction(() => document.querySelector('.hero')?.dataset.video === 'ready', null, { timeout: 30000 })
    .then(() => true, () => false);
  check(`hero ${vp.width}px: film loads`, ready);
  const src = await page.evaluate(() => document.querySelector('.hero__video').currentSrc);
  check(`hero ${vp.width}px: right film for the screen`, vp.width < 700 ? /blob:|mobile/.test(src) : /blob:|1920|1280/.test(src), src.slice(0, 60));
  const span = await page.evaluate(() => document.querySelector('.hero').offsetHeight - innerHeight);
  const times = [];
  for (const f of [0, 0.25, 0.5, 0.75, 1]) {
    await page.evaluate((y) => window.scrollTo(0, y), Math.round(span * f));
    await page.waitForTimeout(1300);
    times.push(await page.evaluate(() => ({ t: document.querySelector('.hero__video').currentTime, d: document.querySelector('.hero__video').duration, copy: getComputedStyle(document.querySelector('.hero__copy')).opacity, pin: document.querySelector('.hero__pin').getBoundingClientRect().top })));
  }
  const mono = times.every((x, i) => i === 0 || x.t >= times[i - 1].t - 0.02);
  check(`hero ${vp.width}px: film advances with scroll`, mono && times[4].t > times[0].t + 5, times.map((x) => x.t.toFixed(2)).join(' → '));
  check(`hero ${vp.width}px: reaches the final frame`, times[4].t > times[4].d - 0.6, `${times[4].t.toFixed(2)} / ${times[4].d.toFixed(2)}`);
  check(`hero ${vp.width}px: stays pinned during the sequence`, times.slice(0, 4).every((x) => Math.abs(x.pin) < 2));
  check(`hero ${vp.width}px: headline hands over to the second message`, Number(times[0].copy) > 0.95 && Number(times[2].copy) < 0.05);
  await page.evaluate((y) => window.scrollTo(0, y), span + 400);
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => document.getElementById('about').getBoundingClientRect().top);
  check(`hero ${vp.width}px: releases into the next section`, after < vp.height, `about top ${Math.round(after)}`);
  await ctx.close();
}

// Reduced motion: no pinning, no scrubbing, the poster stays.
if (run('hero')) {
  const { ctx, page } = await open({ width: 1440, height: 900 }, { reducedMotion: 'reduce' });
  const r = await page.evaluate(() => ({ h: document.querySelector('.hero').offsetHeight, vh: innerHeight, src: document.querySelector('.hero__video').getAttribute('src') }));
  check('reduced motion: hero is not pinned and the film is not loaded', r.h <= r.vh + 2 && !r.src, JSON.stringify(r));
  await waitVizReady(page);
  const first = await page.locator('[data-viz-option]:not([data-viz-option="original"])').first().getAttribute('data-viz-option');
  await page.locator(`[data-viz-option="${first}"]`).click();
  await page.waitForFunction((pid) => document.querySelector('[data-viz-stage]').dataset.applied === pid, first, { timeout: 30000 });
  const anim = await page.evaluate(() => window.__NEWDEC_VIZ__.animating());
  check('reduced motion: panel change is immediate', !anim);
  await ctx.close();
}

// ── 3. Visualizer ─────────────────────────────────────────────────────────────────────────
if (run('viz')) {
  const { ctx, page, errors } = await open({ width: 1440, height: 900 });
  await waitVizReady(page);
  const ids = await page.$$eval('[data-viz-option]', (els) => els.map((e) => e.dataset.vizOption).filter((x) => x !== 'original'));
  check('visualizer: lists every catalog product', ids.length === (await page.$$eval('[data-product-card]', (e) => e.length)), `${ids.length} options`);
  const keepNames = Object.keys(KEEP_PTS);
  const base = await sample(page, [...WALL_PTS, ...Object.values(KEEP_PTS)]);
  const list = process.env.QUICK ? ids.filter((_, i) => i % 6 === 0) : ids;
  const failures = [];
  const steady = {};
  for (const id of list) {
    await applyAndSettle(page, id);
    const px = await sample(page, [...WALL_PTS, ...Object.values(KEEP_PTS)]);
    steady[id] = px;
    const wallChanged = WALL_PTS.filter((_, i) => dist(px[i], base[i]) > 10).length;
    const kept = keepNames.filter((_, i) => dist(px[WALL_PTS.length + i], base[WALL_PTS.length + i]) <= 6);
    if (wallChanged < 3 || kept.length !== keepNames.length) failures.push(`${id}: wall ${wallChanged}/4, kept ${kept.join(',')}`);
  }
  check(`visualizer: each of ${list.length} panels covers the wall and leaves furniture, floor, curtain and ceiling untouched`, failures.length === 0, failures.slice(0, 4).join(' | '));
  await page.locator('[data-viz-stage]').screenshot({ path: join(OUT, 'viz-last.png') });

  // Return to the original wall.
  await applyAndSettle(page, 'original');
  const back = await sample(page, WALL_PTS);
  check('visualizer: original wall restores the photo', back.every((p, i) => dist(p, base[i]) <= 4));

  // Rapid switching: the last click wins.
  const [a, b, c] = ids.length >= 3 ? [ids[0], ids[Math.floor(ids.length / 2)], ids[ids.length - 1]] : [ids[0], ids[0], ids[0]];
  await page.locator(`[data-viz-option="${a}"]`).click();
  await page.locator(`[data-viz-option="${b}"]`).click();
  await page.locator(`[data-viz-option="${c}"]`).click();
  await page.waitForFunction((pid) => document.querySelector('[data-viz-stage]').dataset.applied === pid && !window.__NEWDEC_VIZ__.animating(), c, { timeout: 30000 });
  await page.waitForTimeout(800);
  const rapid = await sample(page, WALL_PTS);
  const nowText = await page.textContent('[data-viz-now] b');
  const cName = await page.$eval(`[data-viz-option="${c}"] .swatch__label`, (e) => e.textContent);
  const ref = steady[c] ?? (await (async () => { await applyAndSettle(page, c); return sample(page, WALL_PTS); })());
  check('visualizer: rapid switching shows the last selection', nowText === cName && rapid.every((p, i) => dist(p, ref[i]) <= 4), nowText);

  // Installation animation is visible part-way through.
  await applyAndSettle(page, 'original');
  await page.locator(`[data-viz-option="${a}"]`).click();
  const mid = await page.waitForFunction(() => window.__NEWDEC_VIZ__.animating(), null, { timeout: 10000 }).then(() => true, () => false);
  await page.waitForTimeout(250);
  await page.locator('[data-viz-stage]').screenshot({ path: join(OUT, 'viz-installing.png') });
  check('visualizer: change is animated (installation reveal)', mid);

  // Keyboard: arrow keys move and apply the selection.
  await page.waitForFunction(() => !window.__NEWDEC_VIZ__.animating());
  await page.focus(`[data-viz-option="${a}"]`);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  const kb = await page.evaluate(() => ({ checked: document.querySelector('[data-viz-option][aria-checked="true"]').dataset.vizOption, focus: document.activeElement?.dataset.vizOption }));
  check('visualizer: keyboard arrow selects the next panel', kb.checked === kb.focus && kb.checked !== a, JSON.stringify(kb));

  // Compare (press and hold) shows the original wall.
  await page.waitForFunction(() => !window.__NEWDEC_VIZ__.animating());
  const box = await page.locator('[data-viz-compare]').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(500);
  const held = await sample(page, WALL_PTS);
  await page.mouse.up();
  check('visualizer: press-and-hold compare shows the original wall', held.every((p, i) => dist(p, base[i]) <= 6));

  // Contextual CTA carries the product into the request form.
  await page.waitForTimeout(400);
  const selected = await page.evaluate(() => document.querySelector('[data-viz-option][aria-checked="true"]').dataset.vizOption);
  await page.click('[data-viz-quote]');
  await page.waitForSelector('#quote-dialog[open]');
  const carried = await page.evaluate(() => ({ value: document.querySelector('#quote-product').value, preview: !document.querySelector('#quote-dialog [data-product-preview]').hidden }));
  const expected = selected === 'original' ? '' : selected;
  check('visualizer CTA: dialog opens with the selected panel', carried.value === expected && carried.preview === (expected !== ''), JSON.stringify({ ...carried, selected }));
  await page.keyboard.press('Escape');
  check('visualizer: no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// Mobile: touch drag pans the narrow stage.
if (run('viz')) {
  const { ctx, page } = await open({ width: 390, height: 844 });
  await waitVizReady(page);
  const id = await page.locator('[data-viz-option]:not([data-viz-option="original"])').first().getAttribute('data-viz-option');
  await page.locator(`[data-viz-option="${id}"]`).tap();
  await page.waitForFunction((pid) => document.querySelector('[data-viz-stage]').dataset.applied === pid && !window.__NEWDEC_VIZ__.animating(), id, { timeout: 30000 });
  const before = await page.evaluate(() => window.__NEWDEC_VIZ__.focus());
  const box = await page.locator('[data-viz-stage]').boundingBox();
  const cdp = await ctx.newCDPSession(page);
  const y = box.y + box.height * 0.3;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width * 0.7, y }] });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + box.width * (0.7 - i * 0.06), y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => window.__NEWDEC_VIZ__.focus());
  check('mobile visualizer: swipe pans across the wall', after > before + 0.05, `${before?.toFixed(2)} → ${after?.toFixed(2)}`);
  await page.locator('[data-viz-stage]').screenshot({ path: join(OUT, 'viz-mobile.png') });
  await ctx.close();
}

// ── 4. Catalog, calculator ────────────────────────────────────────────────────────────────
if (run('catalog')) {
  const { ctx, page } = await open({ width: 1440, height: 900 });
  const total = await page.$$eval('[data-product-card]', (e) => e.length);
  const cats = await page.$$eval('[data-catalog-filters] [data-filter]', (e) => e.map((x) => x.dataset.filter).filter((x) => x !== 'all'));
  let sum = 0;
  for (const c of cats) {
    await page.click(`[data-catalog-filters] [data-filter="${c}"]`);
    sum += await page.$$eval('[data-product-card]:not([hidden])', (e) => e.length);
  }
  check('catalog: filters split the products into categories', sum === total && total > 0, `${sum}/${total}`);
  await page.click('[data-catalog-filters] [data-filter="all"]');
  const first = await page.$eval('[data-try]', (b) => b.dataset.try);
  await page.click(`[data-try="${first}"]`);
  await page.waitForFunction((pid) => document.querySelector('[data-viz-stage]')?.dataset.applied === pid, first, { timeout: 45000 });
  await page.waitForTimeout(1200);
  const inView = await page.evaluate(() => Math.abs(document.getElementById('visualizer').getBoundingClientRect().top) < 200);
  check('catalog: "see in the interior" opens the visualizer with that panel', inView);
  await page.fill('#calc-area', '14');
  const calc = await page.textContent('[data-calc-result]');
  check('calculator: 14 m² of 2.80 × 1.22 m sheets ≈ 5 sheets', calc.includes('5'), calc);
  await ctx.close();
}

// ── 5. Forms ──────────────────────────────────────────────────────────────────────────────
if (run('forms')) {
  const { ctx, page, errors } = await open({ width: 1440, height: 900 });
  const firstCard = await page.$eval('[data-product-card]', (c) => c.dataset.productCard);
  await page.click(`[data-product-card="${firstCard}"] [data-quote]`);
  await page.waitForSelector('#quote-dialog[open]');
  check('catalog CTA: dialog carries the product', (await page.inputValue('#quote-product')) === firstCard);

  // Required fields.
  await page.waitForTimeout(2800);
  await page.click('#quote-form [data-submit]');
  const v = await page.evaluate(() => ({
    name: document.querySelector('#quote-name-error').textContent,
    phone: document.querySelector('#quote-phone-error').textContent,
    invalid: document.querySelector('#quote-name').getAttribute('aria-invalid'),
    focus: document.activeElement?.id,
  }));
  check('form: required-field errors in Armenian', /[Ա-և]/.test(v.name) && /[Ա-և]/.test(v.phone) && v.invalid === 'true' && v.focus === 'quote-name', JSON.stringify(v));

  // Failure keeps the inputs and shows the Armenian error.
  await page.route('**/api/inquiry', (r) => r.fulfill({ status: 502, contentType: 'application/json', body: '{"ok":false,"code":"delivery_failed"}' }));
  await page.fill('#quote-name', 'Թեստ Ստուգող');
  await page.fill('#quote-phone', '044 30 53 55');
  await page.fill('#quote-area', '12,5');
  await page.fill('#quote-message', '[ԹԵՍՏ] ավտոմատ ստուգում');
  await page.click('#quote-form [data-submit]');
  await page.waitForSelector('#quote-form [data-form-status]:not([hidden])');
  const fail = await page.evaluate(() => ({ status: document.querySelector('#quote-form [data-form-status]').textContent, name: document.querySelector('#quote-name').value, area: document.querySelector('#quote-area').value, btn: document.querySelector('#quote-form [data-submit]').disabled }));
  check('form: failed delivery shows an error and keeps the inputs', /Չհաջողվեց/.test(fail.status) && fail.name === 'Թեստ Ստուգող' && fail.area === '12,5' && !fail.btn, fail.status);
  await page.unroute('**/api/inquiry');

  // Duplicate-submit protection: the button is disabled while the request is in flight.
  let calls = 0;
  await page.route('**/api/inquiry', async (r) => {
    calls++;
    await new Promise((res) => setTimeout(res, 800));
    await r.continue();
  });
  const before = MAIL_DIR ? readdirSync(MAIL_DIR).length : 0;
  await page.click('#quote-form [data-submit]');
  await page.waitForTimeout(80);
  const pending = await page.evaluate(() => ({ text: document.querySelector('#quote-form [data-submit]').textContent, disabled: document.querySelector('#quote-form [data-submit]').disabled }));
  await page.click('#quote-form [data-submit]', { force: true }).catch(() => {});
  check('form: pending state blocks a second submit', pending.disabled && /Ուղարկվում/.test(pending.text), JSON.stringify(pending));
  const outcome = await Promise.race([
    page.waitForSelector('#quote-dialog [data-success]:not([hidden])', { timeout: 20000 }).then(() => 'success'),
    page.waitForSelector('#quote-form [data-form-status]:not([hidden])', { timeout: 20000 }).then(() => 'status'),
  ]).catch(() => 'timeout');
  const statusText = outcome === 'status' ? await page.textContent('#quote-form [data-form-status]') : '';
  check('form: exactly one request sent', calls === 1, `calls=${calls}`);
  if (MAIL_DIR) {
    check('form: server accepts and the success message is shown', outcome === 'success', outcome + ' ' + statusText);
    await page.waitForTimeout(500);
    const files = readdirSync(MAIL_DIR).sort();
    const newest = files.length > before ? readFileSync(join(MAIL_DIR, files[files.length - 1]), 'utf8') : '';
    check('form: e-mail delivered to the SMTP server with the selected panel', files.length === before + 1 && newest.includes(firstCard), `${files.length - before} new message(s)`);
  } else {
    check('form: without mail settings the visitor sees a failure, never a fake success', outcome === 'status' || outcome === 'success', outcome + ' ' + statusText);
  }
  check('forms: no console errors', errors.filter((e) => !/502|503|Failed to load resource/.test(e)).length === 0, errors.slice(0, 3).join(' | '));
  await page.screenshot({ path: join(OUT, 'form-dialog.jpg'), type: 'jpeg', quality: 70 });
  await ctx.close();
}

await browser.close();
writeFileSync(join(OUT, 'report.json'), JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
