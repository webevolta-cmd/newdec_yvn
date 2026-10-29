import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { renderHead, renderPage } from './src/render/page.ts';

/**
 * DEPLOY_ENV=preview builds the review copy: search engines are told not to index it.
 * Production (the default, used by Vercel) never carries the noindex flag.
 */
function sitePages(env: Record<string, string>): Plugin {
  const preview = env.DEPLOY_ENV === 'preview';
  return {
    name: 'newdec-site-pages',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const options = {
          siteUrl: (env.SITE_URL ?? '').replace(/\/$/, ''),
          preview,
          inquiryEndpoint: env.VITE_INQUIRY_ENDPOINT ?? '/api/inquiry',
          turnstileSiteKey: env.VITE_TURNSTILE_SITE_KEY ?? '',
          showMapEmbed: !preview,
        };
        return html.replace('<!--head-->', renderHead(options)).replace('<!--app-->', renderPage(options));
      },
    },
  };
}

/** Serves /api/inquiry during `npm run dev` with the same handler Vercel runs. */
function devInquiryApi(env: Record<string, string>): Plugin {
  return {
    name: 'newdec-dev-inquiry-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/inquiry', async (req: IncomingMessage, res: ServerResponse) => {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        let body: unknown = {};
        try {
          body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        } catch {
          body = {};
        }
        const mod = await server.ssrLoadModule('/server/inquiry/handler.ts');
        const result = await mod.handleInquiry(
          {
            method: req.method ?? 'GET',
            ip: req.socket.remoteAddress ?? 'unknown',
            origin: typeof req.headers.origin === 'string' ? req.headers.origin : null,
            body,
          },
          { ...process.env, ...env },
        );
        res.statusCode = result.status;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(result.body));
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env } as Record<string, string>;
  const preview = env.DEPLOY_ENV === 'preview';

  return {
    // Relative asset URLs work both at the domain root (Vercel) and inside the review preview.
    base: './',
    plugins: [sitePages(env), devInquiryApi(env)],
    build: {
      target: 'es2020',
      cssCodeSplit: false,
      // The preview host only loads same-page fonts, so fonts are embedded there.
      assetsInlineLimit: (file: string) => (preview && file.endsWith('.woff2') ? true : undefined),
      modulePreload: { polyfill: false },
    },
  };
});
