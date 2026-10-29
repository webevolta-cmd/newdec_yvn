# NEW DEC — website

Armenian-language website for **NEW DEC (ՆՅՈՒ ԴԵԿ)**, the decorative wall-panel showroom at
Հրաչյա Քոչար 1, Yerevan (Instagram/TikTok `@newdec_yvn`).

What is inside:

- **Cinematic hero** — a Higgsfield-generated film of the showroom, scrubbed by scroll while the
  section is pinned (`src/features/hero.ts`, media in `public/media/hero/`).
- **Catalog** of the panels NEW DEC shows in its own videos (`src/content/products.ts`).
- **Same-interior visualizer** — choose any panel and it is laid onto the wall of one fixed
  interior with real-scale sheets, joints, the room's light and shadows, and correct occlusion
  behind the sofa, lamp and plant (WebGL, `src/features/visualizer/`).
- **Request forms** (quote dialog and contact form) that carry the selected panel into an e-mail
  sent by a Vercel serverless function (`api/inquiry.ts`, logic in `server/inquiry/`).
- Verified business facts in `src/content/business.ts`; sources in [`RESEARCH.md`](RESEARCH.md).

Stack: Vite 8 + TypeScript (no UI framework), static HTML rendered at build time from the content
modules, one Node serverless function. Node ≥ 20.19.

## Local development

```bash
npm install
```

```bash
cp .env.example .env
```

```bash
npm run dev
```

`npm run dev` serves the site on http://localhost:5173 and also answers `POST /api/inquiry` with the
same handler Vercel runs, so the forms work locally once `.env` has mail settings.

Other commands:

| Command | What it does |
| --- | --- |
| `npm run build` | Type-checks and builds the production site into `dist/` |
| `npm run build:preview` | Builds a review copy into `dist-preview/` with `noindex` and embedded fonts |
| `npm run preview` | Serves the last production build locally |
| `npm run typecheck` | TypeScript check only |
| `npm run test:e2e` | Browser checks (desktop + mobile) against a running server, see `scripts/e2e/` |

## Environment variables

All variables are documented in [`.env.example`](.env.example). The forms need:

| Variable | Required | Purpose |
| --- | --- | --- |
| `INQUIRY_TO_EMAIL` | yes | Where requests are delivered (comma-separated list allowed) |
| `INQUIRY_FROM_EMAIL` | yes | Sender address (must be on a domain verified with the provider) |
| `RESEND_API_KEY` | one of | [Resend](https://resend.com) API key (recommended) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE` | one of | Any SMTP mailbox, e.g. Gmail with an app password |
| `INQUIRY_SUBJECT_PREFIX` | no | Text before the subject, e.g. `[TEST]` for preview deployments |
| `ALLOWED_ORIGINS` | no | Comma-separated origins allowed to post the form |
| `TURNSTILE_SECRET_KEY` + `VITE_TURNSTILE_SITE_KEY` | no | Cloudflare Turnstile anti-spam check |
| `SITE_URL` | recommended | Production URL for canonical, Open Graph and structured data |

If mail is not configured the endpoint answers `503 not_configured` and the visitor sees the
Armenian failure message with the phone number; no success is ever shown without delivery.

### How a request is processed

1. The browser validates the fields with the same rules the server uses
   (`server/inquiry/validate.ts`) and shows errors in Armenian.
2. `api/inquiry.ts` checks the honeypot field, the minimum fill time, a per-IP rate limit, the
   number of links in the message and (optionally) Turnstile.
3. The selected panel id is checked against the catalog, then the e-mail is composed in Armenian
   with the panel, variant, approximate area and message, and sent through Resend or SMTP.
4. An idempotency key stops a double click or a retry from sending the same request twice.
5. Only after the provider accepts the message does the visitor see the success state.

## Deploying to Vercel (when you are ready)

1. Push this repository to GitHub (already done for this project).
2. In Vercel: **Add New → Project → Import** the repository. The framework preset is detected as
   **Vite**; `vercel.json` sets the build command (`npm run build`) and output directory (`dist`).
3. In **Settings → Environment Variables** add `INQUIRY_TO_EMAIL`, `INQUIRY_FROM_EMAIL`,
   `RESEND_API_KEY` (or the `SMTP_*` set) and `SITE_URL`. Add `INQUIRY_SUBJECT_PREFIX=[TEST]` to the
   Preview environment only, if you want preview submissions labelled.
4. Deploy. The function `api/inquiry.ts` becomes `https://<your-domain>/api/inquiry`.
5. Send a test request from the live site and confirm it arrives in the inbox (and in the Resend
   logs, if you use Resend).

Vercel marks preview deployments `noindex` on its own; the production build has no `noindex`.

## Project layout

```
api/inquiry.ts                 Vercel serverless function (POST only)
server/inquiry/                validation, spam checks, e-mail composition and delivery
src/content/                   business facts, Armenian copy, products, gallery, room geometry
src/render/                    build-time HTML (rendered into index.html by vite.config.ts)
src/features/                  hero, visualizer (WebGL), forms
src/styles/main.css            design system and layout
public/media/                  optimized hero video, posters, panel textures, gallery, brand
assets-src/                    masters: hero keyframes and Higgsfield films, visualizer room, raw textures
scripts/assets/                asset pipeline (room masks, texture extraction and packing)
scripts/e2e/                   Playwright checks
```

### Regenerating assets

```bash
python3 -I scripts/assets/build_room_masks.py
```

```bash
python3 -I scripts/assets/build_textures.py
```

Requires Python 3 with `opencv-python-headless` and `numpy`. The outputs are committed, so this is
only needed when the masters change.

## Content rules

Everything on the site is either verified (see `RESEARCH.md`) or clearly presented as an
illustration. Prices, warranties, delivery terms and installation services are not published
because NEW DEC has not stated them publicly; add them only after the owner confirms.
