/**
 * Packages the review preview for hosts that serve one HTML page plus static files and do not
 * allow external or separate script/style files (e.g. a claude.ai Artifact).
 *
 *   npm run build:preview          → dist-preview/ (Vite build with DEPLOY_ENV=preview)
 *   node scripts/build-preview.mjs → dist-preview/page.html + dist-preview/files.json
 *
 * page.html has the CSS and JS inlined and no <html>/<head>/<body> wrapper (the host adds its own),
 * and keeps <title>, meta tags and noindex. files.json lists every static file the page references.
 * The production build (dist/) is not affected.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const dir = new URL('../dist-preview/', import.meta.url).pathname;
let html = readFileSync(join(dir, 'index.html'), 'utf8');

// Inline the stylesheet(s).
html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"[^>]*>/g, (_, file) => {
  const css = readFileSync(join(dir, file), 'utf8');
  return `<style>${css}</style>`;
});
// Inline the module script(s); </script> inside strings is escaped by the bundler output.
html = html.replace(/<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"><\/script>/g, (_, file) => {
  const js = readFileSync(join(dir, file), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script type="module">${js}</script>`;
});
html = html.replace(/<link rel="modulepreload"[^>]*>/g, '');

const head = /<head>([\s\S]*?)<\/head>/.exec(html)[1];
const body = /<body>([\s\S]*?)<\/body>/.exec(html)[1];
const headClean = head
  .replace(/<meta charset[^>]*>/, '')
  .replace(/<meta name="viewport"[^>]*>/, '')
  .trim();
const titleMatch = /<title>[\s\S]*?<\/title>/.exec(headClean);
const restHead = headClean.replace(titleMatch[0], '');

const page = [
  titleMatch[0],
  '<meta name="claude:viewport-fit-sides" content="cover">',
  restHead,
  // The host provides the <html> element; restore the page language for assistive tech and fonts.
  "<script>document.documentElement.lang='hy';</script>",
  body.trim(),
].join('\n');
writeFileSync(join(dir, 'page.html'), page);

// Collect static files referenced relatively (media, favicon) for the host's file list.
const files = {};
const walk = (p) => {
  for (const name of readdirSync(p)) {
    const full = join(p, name);
    if (statSync(full).isDirectory()) walk(full);
    else {
      const rel = relative(dir, full);
      if (rel === 'index.html' || rel === 'page.html' || rel === 'files.json' || rel.startsWith('assets/')) continue;
      if (page.includes(rel) || rel.startsWith('media/')) files[rel] = full;
    }
  }
};
walk(dir);
writeFileSync(join(dir, 'files.json'), JSON.stringify(files, null, 1));
const size = Buffer.byteLength(page);
const total = Object.values(files).reduce((n, f) => n + statSync(f).size, 0);
console.log(`page.html ${(size / 1024).toFixed(0)} KB, ${Object.keys(files).length} files, ${(total / 1048576).toFixed(1)} MB`);
