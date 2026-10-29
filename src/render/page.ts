import { business } from '../content/business.ts';
import { copy } from '../content/copy.ts';
import { gallery, reels, tiktokStats } from '../content/gallery.ts';
import { categories, products, type Product } from '../content/products.ts';
import { attrs, escapeHtml, html, raw, type Raw } from './html.ts';
import { icons } from './icons.ts';

export interface RenderOptions {
  siteUrl: string;
  preview: boolean;
  inquiryEndpoint: string;
  turnstileSiteKey: string;
  showMapEmbed: boolean;
}

const tel = `tel:${business.phoneE164}`;

function absolute(siteUrl: string, path: string): string {
  return siteUrl ? `${siteUrl}/${path.replace(/^\//, '')}` : path;
}

export function renderHead(o: RenderOptions): string {
  const title = copy.meta.title;
  const description = copy.meta.description;
  const ogImage = absolute(o.siteUrl, 'media/hero/og-1200.jpg');
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'HomeAndConstructionBusiness',
    name: business.name,
    alternateName: [business.nameHy, 'NewDec'],
    description,
    telephone: business.phoneE164,
    image: ogImage,
    logo: absolute(o.siteUrl, 'media/brand/logo-full.svg'),
    ...(o.siteUrl ? { url: `${o.siteUrl}/` } : {}),
    address: {
      '@type': 'PostalAddress',
      streetAddress: business.address.street,
      addressLocality: business.address.city,
      addressRegion: business.address.district,
      postalCode: business.address.postalCode,
      addressCountry: business.address.country,
    },
    geo: { '@type': 'GeoCoordinates', latitude: business.geo.lat, longitude: business.geo.lng },
    openingHoursSpecification: [
      { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '11:00', closes: '19:00' },
      { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Saturday'], opens: '11:00', closes: '18:00' },
    ],
    sameAs: [business.social.instagram, business.social.tiktok, business.maps.yandex],
    areaServed: { '@type': 'City', name: 'Երևան' },
  };

  return html`
    <title>${title}</title>
    <meta name="description" content="${description}" />
    ${o.preview ? raw('<meta name="robots" content="noindex, nofollow, noarchive" />') : ''}
    ${o.siteUrl ? html`<link rel="canonical" href="${o.siteUrl}/" />` : ''}
    <meta name="theme-color" content="#0c1018" />
    <meta name="format-detection" content="telephone=no" />
    <link rel="icon" href="favicon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="media/brand/apple-touch-icon.png" />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="hy_AM" />
    <meta property="og:site_name" content="${business.name}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${ogImage}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${copy.meta.ogAlt}" />
    ${o.siteUrl ? html`<meta property="og:url" content="${o.siteUrl}/" />` : ''}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${ogImage}" />
    <link rel="preload" as="image" href="media/hero/hero-poster-1920.webp" media="(min-width: 761px)" fetchpriority="high" />
    <link rel="preload" as="image" href="media/hero/hero-poster-mobile.webp" media="(max-width: 760px)" fetchpriority="high" />
    <script type="application/ld+json">${raw(JSON.stringify(jsonLd).replace(/</g, '\\u003c'))}</script>
    <script>${raw(`document.documentElement.classList.add('js');window.__SITE__=${JSON.stringify({ inquiryEndpoint: o.inquiryEndpoint, turnstileSiteKey: o.turnstileSiteKey, preview: o.preview }).replace(/</g, '\\u003c')};`)}</script>
  `.value;
}

function header(): Raw {
  const links = copy.nav.map((n) => html`<li><a href="#${n.id}">${n.label}</a></li>`);
  return html`
    <a class="skip" href="#main">${copy.skip}</a>
    <header class="site-header" data-solid="false">
      <div class="wrap site-header__bar">
        <a class="brand" href="#top" aria-label="${business.name} — ${copy.homeLabel}">
          <img src="media/brand/logo-wordmark.svg" alt="${business.name}" width="132" height="26" />
        </a>
        <nav class="nav" id="site-nav" aria-label="${copy.navLabel}">
          <ul>${links}</ul>
          <div class="nav-mobile-cta">
            <button class="btn btn--primary" type="button" data-quote data-source="contact">${copy.cta.quote}</button>
            <a class="btn btn--ghost" href="${tel}">${icons.phone}${business.phoneDisplay}</a>
          </div>
        </nav>
        <div class="header-cta">
          <a class="header-phone" href="${tel}">${business.phoneDisplay}</a>
          <button class="btn btn--primary" type="button" data-quote data-source="contact">${copy.cta.quote}</button>
        </div>
        <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="${copy.menuOpen}" data-label-open="${copy.menuOpen}" data-label-close="${copy.menuClose}"><span></span></button>
      </div>
    </header>`;
}

function hero(): Raw {
  const h = copy.hero;
  return html`
    <section class="hero" id="top" aria-labelledby="hero-title" data-video="idle">
      <div class="hero__pin">
        <div class="hero__media">
          <picture>
            <source media="(max-width: 760px)" srcset="media/hero/hero-poster-mobile.webp" width="1080" height="1920" />
            <img class="hero__poster" src="media/hero/hero-poster-1920.webp" alt="${h.posterAlt}" width="1920" height="1080" fetchpriority="high" decoding="async" />
          </picture>
          <video class="hero__video" muted playsinline preload="none" aria-hidden="true" tabindex="-1" disablepictureinpicture
            data-src-desktop="media/hero/hero-1920.mp4" data-src-compact="media/hero/hero-1280.mp4" data-src-mobile="media/hero/hero-mobile-1080.mp4"></video>
        </div>
        <div class="hero__shade"></div>
        <div class="hero__vignette"></div>
        <div class="hero__content wrap">
          <div class="hero__copy">
            <p class="eyebrow">${h.eyebrow}</p>
            <h1 id="hero-title"><span class="visually-hidden">${business.name} — </span>${h.titleLines.map((l, i) => (i === h.titleLines.length - 1 ? html`<span class="line"><em>${l}</em></span>` : html`<span class="line">${l}</span> `))}</h1>
            <p class="lede">${h.lede}</p>
            <div class="actions">
              <a class="btn btn--primary" href="#visualizer">${copy.cta.tryIt}${icons.arrow}</a>
              <button class="btn btn--ghost" type="button" data-quote data-source="hero">${copy.cta.quote}</button>
            </div>
          </div>
        </div>
        <div class="hero__chapter" aria-hidden="true">
          <div class="wrap">
            <p class="eyebrow">${h.chapterEyebrow}</p>
            <p>${h.chapterTitle}</p>
            <div class="hero__facts">${h.chapterFacts.map((f) => html`<span>${f}</span>`)}</div>
          </div>
        </div>
        <div class="hero__progress" aria-hidden="true"><i></i></div>
        <div class="hero__cue" aria-hidden="true"><span>${h.cue}</span><i></i></div>
      </div>
    </section>`;
}

function intro(): Raw {
  const c = copy.intro;
  return html`
    <section class="band intro" id="about" aria-labelledby="about-title">
      <div class="wrap">
        <div class="intro__grid">
          <h2 id="about-title" class="intro__statement" data-reveal>${raw(c.statementHtml)}</h2>
          <div class="intro__text" data-reveal>${c.paragraphs.map((p) => html`<p>${p}</p>`)}</div>
        </div>
        <dl class="facts" data-reveal>
          ${c.facts.map((f) => html`<div class="fact"><dt class="fact__label">${f.label}</dt><dd class="fact__value">${f.value}</dd></div>`)}
        </dl>
      </div>
    </section>`;
}

function specLine(p: Product): string {
  return [p.size, p.thickness].filter(Boolean).join(' · ');
}

function catalog(): Raw {
  const c = copy.catalog;
  const used = Object.entries(categories).filter(([id]) => products.some((p) => p.category === id));
  return html`
    <section class="band band--light catalog" id="catalog" aria-labelledby="catalog-title">
      <div class="wrap">
        <div class="section-head" data-reveal>
          <p class="eyebrow">${c.eyebrow}</p>
          <h2 id="catalog-title">${c.title}</h2>
          <p class="lede">${c.lede}</p>
        </div>
        <div class="catalog__bar">
          <div class="chips" role="group" aria-label="${c.filterLabel}" data-catalog-filters>
            <button class="chip" type="button" aria-pressed="true" data-filter="all">${c.all}<span class="count">${products.length}</span></button>
            ${used.map(([id, cat]) => html`<button class="chip" type="button" aria-pressed="false" data-filter="${id}">${cat.name}<span class="count">${products.filter((p) => p.category === id).length}</span></button>`)}
          </div>
          <p class="catalog__count" aria-live="polite" data-catalog-count>${c.countLabel(products.length)}</p>
        </div>
        <ul class="catalog__grid" data-catalog-grid>
          ${products.map(
            (p) => html`
            <li class="card" data-category="${p.category}" data-product-card="${p.id}">
              <div class="card__media">
                <img src="${p.image}" alt="${p.alt}" width="600" height="750" loading="lazy" decoding="async" />
                <span class="card__badge">${p.finish}</span>
              </div>
              <div class="card__body">
                <p class="card__cat">${categories[p.category].name}</p>
                <h3 class="card__name">${p.name}</h3>
                <p class="card__spec">${specLine(p) || c.specFallback}</p>
                <div class="card__actions">
                  <button class="btn btn--primary" type="button" data-try="${p.id}">${c.tryIt}</button>
                  <button class="btn btn--ghost" type="button" data-quote data-product="${p.id}" data-source="catalog">${c.quote}</button>
                </div>
              </div>
            </li>`,
          )}
        </ul>
        <p class="catalog__note">${c.note}</p>
      </div>
    </section>`;
}

function visualizer(): Raw {
  const v = copy.visualizer;
  const used = Object.entries(categories).filter(([id]) => products.some((p) => p.category === id));
  return html`
    <section class="band viz" id="visualizer" aria-labelledby="viz-title">
      <div class="wrap">
        <div class="section-head" data-reveal>
          <p class="eyebrow">${v.eyebrow}</p>
          <h2 id="viz-title">${v.title}</h2>
          <p class="lede">${v.lede}</p>
        </div>
        <div class="viz__layout">
          <div class="viz__stage" data-viz-stage data-state="loading" role="img" aria-label="${v.stageLabel}">
            <img src="media/visualizer/room-1600.webp" srcset="media/visualizer/room-1600.webp 1600w, media/visualizer/room-2560.webp 2560w" sizes="(max-width: 1100px) 100vw, 900px" alt="" width="2560" height="1429" loading="lazy" decoding="async" data-viz-fallback />
            <canvas data-viz-canvas aria-hidden="true"></canvas>
            <p class="viz__pan-hint" data-viz-pan-hint>${v.panHint}</p>
            <div class="viz__status" data-viz-status><div><span class="spinner" aria-hidden="true"></span><span data-viz-status-text>${v.loadingRoom}</span></div></div>
            <div class="viz__hud">
              <p class="viz__now" aria-live="polite" data-viz-now><b>${v.originalName}</b><span>${v.originalHint}</span></p>
              <div class="viz__tools">
                <button class="viz__tool" type="button" data-viz-compare aria-pressed="false" title="${v.compareHint}" aria-describedby="viz-compare-hint">${v.compare}</button><span class="visually-hidden" id="viz-compare-hint">${v.compareHint}</span>
              </div>
            </div>
          </div>
          <div class="viz__panel">
            <div class="chips viz__filters" role="group" aria-label="${v.filterLabel}" data-viz-filters>
              <button class="chip" type="button" aria-pressed="true" data-filter="all">${copy.catalog.all}</button>
              ${used.map(([id, cat]) => html`<button class="chip" type="button" aria-pressed="false" data-filter="${id}">${cat.short}</button>`)}
            </div>
            <div class="swatches" role="radiogroup" aria-label="${v.pickLabel}" data-viz-swatches>
              <button class="swatch swatch--original" type="button" role="radio" aria-checked="true" data-viz-option="original" data-category="all" tabindex="0">
                <span class="swatch__img">${v.originalShort}</span>
                <span class="swatch__label">${v.originalName}</span>
              </button>
              ${products.map(
                (p) => html`
                <button class="swatch" type="button" role="radio" aria-checked="false" data-viz-option="${p.id}" data-category="${p.category}" tabindex="-1">
                  <span class="swatch__img"><img src="${p.thumb}" alt="" width="180" height="240" loading="lazy" decoding="async" /></span>
                  <span class="swatch__label">${p.name}</span>
                </button>`,
              )}
            </div>
            <div class="viz__error" role="alert" data-viz-error hidden><span data-viz-error-text>${v.textureError}</span><button class="btn btn--ghost" type="button" data-viz-retry>${v.retry}</button></div>
            <div class="viz__info" data-viz-info>
              <p class="eyebrow" data-viz-info-cat>${v.originalCat}</p>
              <h3 data-viz-info-name>${v.originalName}</h3>
              <dl data-viz-info-specs></dl>
              <button class="btn btn--primary" type="button" data-viz-quote data-quote data-source="visualizer">${v.quoteCta}</button>
              <p class="viz__note">${v.note}</p>
            </div>
          </div>
        </div>
      </div>
    </section>`;
}

function specs(): Raw {
  const s = copy.specs;
  return html`
    <section class="band band--light specs" id="specs" aria-labelledby="specs-title">
      <div class="wrap">
        <div class="section-head" data-reveal>
          <p class="eyebrow">${s.eyebrow}</p>
          <h2 id="specs-title">${s.title}</h2>
          <p class="lede">${s.lede}</p>
        </div>
        <div class="specs__grid">
          <div class="specs__table-wrap" data-reveal>
            <table>
              <caption class="visually-hidden">${s.caption}</caption>
              <thead><tr>${s.columns.map((c) => html`<th scope="col">${c}</th>`)}</tr></thead>
              <tbody>
                ${s.rows.map((r) => html`<tr><th scope="row">${r.type}</th><td>${r.size}</td><td>${r.thickness}</td><td>${r.note}</td></tr>`)}
              </tbody>
            </table>
          </div>
          <form class="calc" data-calc novalidate aria-labelledby="calc-title">
            <h3 id="calc-title">${s.calc.title}</h3>
            <div class="field">
              <label for="calc-area">${s.calc.areaLabel}</label>
              <input id="calc-area" name="area" inputmode="decimal" autocomplete="off" placeholder="${s.calc.areaPlaceholder}" />
            </div>
            <div class="field">
              <label for="calc-format">${s.calc.formatLabel}</label>
              <select id="calc-format" name="format">
                ${s.calc.formats.map((f, i) => html`<option value="${f.areaM2}"${attrs({ selected: i === 0 })}>${f.label}</option>`)}
              </select>
            </div>
            <p class="calc__result" aria-live="polite" data-calc-result>—</p>
            <p class="calc__hint">${s.calc.hint}</p>
            <button class="btn btn--primary" type="button" data-calc-quote>${s.calc.cta}</button>
          </form>
        </div>
        <div class="install" id="install">
          <figure class="install__media" data-reveal>
            <img src="${copy.install.image}" alt="${copy.install.imageAlt}" width="720" height="900" loading="lazy" decoding="async" />
            <figcaption>${copy.install.imageCaption}</figcaption>
          </figure>
          <div data-reveal>
            <p class="eyebrow">${copy.install.eyebrow}</p>
            <h2 style="font-size: var(--step-3); margin-top: 1rem">${copy.install.title}</h2>
            <ul class="install__list">
              ${copy.install.points.map((pt) => html`<li>${icons[pt.icon]}<div><strong>${pt.title}</strong><p>${pt.text}</p></div></li>`)}
            </ul>
          </div>
        </div>
        <div style="margin-top: clamp(3rem, 2rem + 4vw, 6rem)">
          <div class="section-head" data-reveal>
            <p class="eyebrow">${copy.steps.eyebrow}</p>
            <h2>${copy.steps.title}</h2>
          </div>
          <ol class="steps">
            ${copy.steps.items.map((it) => html`<li class="step" data-reveal><h3>${it.title}</h3><p>${it.text}</p></li>`)}
          </ol>
        </div>
      </div>
    </section>`;
}

function showroom(): Raw {
  const s = copy.showroom;
  return html`
    <section class="band showroom" id="showroom" aria-labelledby="showroom-title">
      <div class="wrap">
        <div class="section-head" data-reveal>
          <p class="eyebrow">${s.eyebrow}</p>
          <h2 id="showroom-title">${s.title}</h2>
          <p class="lede">${s.lede}</p>
        </div>
        <ul class="gallery">
          ${gallery.map(
            (g) => html`<li class="g-${g.layout}" data-reveal><figure><img src="${g.src}" alt="${g.alt}" width="${g.width}" height="${g.height}" loading="lazy" decoding="async" /><figcaption>${g.caption}</figcaption></figure></li>`,
          )}
        </ul>
        <p class="gallery__source">${s.source}</p>
        <div class="proof__grid" style="margin-top: clamp(3.5rem, 2.5rem + 4vw, 7rem)" id="social">
          <div data-reveal>
            <p class="eyebrow">${copy.proof.eyebrow}</p>
            <h2 style="font-size: var(--step-3); margin-top: 1rem">${copy.proof.title}</h2>
            <div class="proof__stats">
              <div><b>${tiktokStats.followers}</b><span>${copy.proof.followers}</span></div>
              <div><b>${tiktokStats.likes}</b><span>${copy.proof.likes}</span></div>
              <div><b>${tiktokStats.videos}</b><span>${copy.proof.videos}</span></div>
            </div>
            <p class="proof__asof">${copy.proof.asOf(tiktokStats.asOf)}</p>
            <div class="contact__links" style="margin-top: 1.4rem">
              <a class="btn btn--ghost" href="${business.social.tiktok}" target="_blank" rel="noopener">${icons.tiktok}TikTok</a>
              <a class="btn btn--ghost" href="${business.social.instagram}" target="_blank" rel="noopener">${icons.instagram}Instagram</a>
            </div>
          </div>
          <ul class="reels" data-reveal>
            ${reels.map(
              (r) => html`<li><a class="reel" href="${r.href}" target="_blank" rel="noopener"><img src="${r.src}" alt="${r.alt}" width="360" height="640" loading="lazy" decoding="async" /><span><b>${r.views}</b>${r.title}</span></a></li>`,
            )}
          </ul>
        </div>
      </div>
    </section>`;
}

function faq(): Raw {
  const f = copy.faq;
  return html`
    <section class="band band--light faq" id="faq" aria-labelledby="faq-title">
      <div class="wrap">
        <div class="section-head" data-reveal>
          <p class="eyebrow">${f.eyebrow}</p>
          <h2 id="faq-title">${f.title}</h2>
        </div>
        <div class="faq__list">
          ${f.items.map(
            (it, i) => html`<details class="faq__item"${attrs({ open: i === 0 })}><summary>${it.q}</summary><div class="faq__answer">${it.a.map((p) => html`<p>${raw(p)}</p>`)}</div></details>`,
          )}
        </div>
      </div>
    </section>`;
}

function ctaBand(): Raw {
  const c = copy.finalCta;
  return html`
    <section class="cta-band" aria-labelledby="cta-title">
      <div class="cta-band__bg" style="background-image: url('${c.image}')" data-parallax></div>
      <div class="wrap">
        <p class="eyebrow">${c.eyebrow}</p>
        <h2 id="cta-title" style="margin-top: 1rem">${c.title}</h2>
        <p class="lede" style="margin-top: 1.2rem; color: rgba(241,234,227,.82)">${c.text}</p>
        <div class="actions">
          <button class="btn btn--primary" type="button" data-quote data-source="contact">${copy.cta.quote}</button>
          <a class="btn btn--ghost" href="${tel}">${icons.phone}${business.phoneDisplay}</a>
          <a class="btn btn--ghost" href="${business.maps.directions}" target="_blank" rel="noopener">${icons.pin}${copy.cta.directions}</a>
        </div>
      </div>
    </section>`;
}

export function productOptions(selected = ''): Raw {
  const groups = Object.entries(categories)
    .map(([id, cat]) => ({ id, cat, items: products.filter((p) => p.category === id) }))
    .filter((g) => g.items.length > 0);
  return html`<option value="">${copy.form.productNone}</option>${groups.map(
    (g) => html`<optgroup label="${g.cat.name}">${g.items.map((p) => html`<option value="${p.id}"${attrs({ selected: p.id === selected })}>${p.name}</option>`)}</optgroup>`,
  )}`;
}

function form(prefix: string, source: string, title?: string): Raw {
  const f = copy.form;
  const id = (name: string) => `${prefix}-${name}`;
  return html`
    <form class="form" novalidate data-form data-source="${source}" id="${id('form')}">
      ${title ? html`<h3 class="form__title">${title}</h3>` : ''}
      <div class="form__product" data-product-preview hidden><img alt="" width="54" height="66" /><div><b></b><span></span></div></div>
      <div class="field">
        <label for="${id('product')}">${f.product}</label>
        <select id="${id('product')}" name="productId">${productOptions()}</select>
      </div>
      <div class="field" data-variant-field hidden>
        <label for="${id('variant')}">${f.variant}</label>
        <select id="${id('variant')}" name="variant"></select>
      </div>
      <div class="form__row">
        <div class="field">
          <label for="${id('name')}">${f.name}</label>
          <input id="${id('name')}" name="name" autocomplete="name" required maxlength="80" aria-describedby="${id('name-error')}" />
          <p class="field__error" id="${id('name-error')}"></p>
        </div>
        <div class="field">
          <label for="${id('phone')}">${f.phone}</label>
          <input id="${id('phone')}" name="phone" type="tel" inputmode="tel" autocomplete="tel" required maxlength="24" placeholder="${f.phonePlaceholder}" aria-describedby="${id('phone-error')}" />
          <p class="field__error" id="${id('phone-error')}"></p>
        </div>
      </div>
      <div class="form__row">
        <div class="field">
          <label for="${id('email')}">${f.email} <span class="opt">${f.optional}</span></label>
          <input id="${id('email')}" name="email" type="email" inputmode="email" autocomplete="email" maxlength="160" aria-describedby="${id('email-error')}" />
          <p class="field__error" id="${id('email-error')}"></p>
        </div>
        <div class="field">
          <label for="${id('area')}">${f.area} <span class="opt">${f.optional}</span></label>
          <input id="${id('area')}" name="area" inputmode="decimal" autocomplete="off" maxlength="8" placeholder="${f.areaPlaceholder}" aria-describedby="${id('area-error')} ${id('area-hint')}" />
          <p class="field__error" id="${id('area-error')}"></p>
          <p class="field__hint" id="${id('area-hint')}" data-sheets-hint></p>
        </div>
      </div>
      <div class="field">
        <label for="${id('message')}">${f.message} <span class="opt">${f.optional}</span></label>
        <textarea id="${id('message')}" name="message" maxlength="2000" placeholder="${f.messagePlaceholder}" aria-describedby="${id('message-error')}"></textarea>
        <p class="field__error" id="${id('message-error')}"></p>
      </div>
      <div class="hp" aria-hidden="true">
        <label for="${id('website')}">${f.honeypot}</label>
        <input id="${id('website')}" name="website" tabindex="-1" autocomplete="off" />
      </div>
      <div data-turnstile></div>
      <p class="form__status" role="alert" data-form-status hidden></p>
      <div class="form__foot">
        <p class="form__legal">${f.legal}</p>
        <button class="btn btn--primary" type="submit" data-submit>${f.submit}</button>
      </div>
    </form>
    <div class="form__success" data-success hidden tabindex="-1">
      ${icons.check}
      <h3 data-success-title>${f.successTitle}</h3>
      <p data-success-text></p>
      <button class="btn btn--ghost" type="button" data-reset>${f.another}</button>
    </div>`;
}

function contact(o: RenderOptions): Raw {
  const c = copy.contact;
  return html`
    <section class="band band--light contact" id="contact" aria-labelledby="contact-title">
      <div class="wrap">
        <div class="section-head" data-reveal>
          <p class="eyebrow">${c.eyebrow}</p>
          <h2 id="contact-title">${c.title}</h2>
        </div>
        <div class="contact__grid">
          <div class="contact__card">
            <div class="contact__row">
              <span class="contact__label">${c.address}</span>
              <p class="contact__value">${business.address.street}, ${business.address.city}</p>
              <p style="color: var(--muted)">${business.address.district}, ${business.address.landmark}</p>
              <div class="contact__links">
                <a class="btn btn--ghost" href="${business.maps.directions}" target="_blank" rel="noopener">${icons.pin}${copy.cta.directions}</a>
                <a class="btn btn--ghost" href="${business.maps.yandex}" target="_blank" rel="noopener">${c.yandex}</a>
              </div>
              ${o.showMapEmbed
                ? html`<div class="map-frame" data-map-embed data-src="https://www.google.com/maps?q=${business.geo.lat},${business.geo.lng}&amp;z=17&amp;output=embed" data-title="${c.mapTitle}"></div>`
                : ''}
            </div>
            <div class="contact__row">
              <span class="contact__label">${c.phone}</span>
              <p class="contact__value"><a href="${tel}" style="font-variant-numeric: tabular-nums">${business.phoneDisplay}</a></p>
            </div>
            <div class="contact__row">
              <span class="contact__label">${c.hours}</span>
              <dl class="contact__hours">${business.hours.map((h) => html`<dt>${h.days}</dt><dd>${h.open}–${h.close}</dd>`)}</dl>
            </div>
            <div class="contact__row">
              <span class="contact__label">${c.social}</span>
              <div class="contact__links">
                <a class="btn btn--ghost" href="${business.social.instagram}" target="_blank" rel="noopener">${icons.instagram}Instagram</a>
                <a class="btn btn--ghost" href="${business.social.tiktok}" target="_blank" rel="noopener">${icons.tiktok}TikTok</a>
              </div>
            </div>
          </div>
          <div data-form-host>${form('contact', 'contact', c.formTitle)}</div>
        </div>
      </div>
    </section>`;
}

function footer(): Raw {
  const f = copy.footer;
  return html`
    <footer class="footer">
      <div class="wrap">
        <div class="footer__grid">
          <div class="footer__logo"><img src="media/brand/logo-full.svg" alt="${business.name} — Interior Design" width="140" height="106" loading="lazy" /></div>
          <div>
            <h3>${f.showroom}</h3>
            <ul>
              <li>${business.address.street}, ${business.address.city}</li>
              ${business.hours.map((h) => html`<li>${h.short} ${h.open}–${h.close}</li>`)}
            </ul>
          </div>
          <div>
            <h3>${f.contact}</h3>
            <ul>
              <li><a href="${tel}">${business.phoneDisplay}</a></li>
              <li><a href="${business.social.instagram}" target="_blank" rel="noopener">Instagram</a></li>
              <li><a href="${business.social.tiktok}" target="_blank" rel="noopener">TikTok</a></li>
            </ul>
          </div>
          <div>
            <h3>${f.sections}</h3>
            <ul>${copy.nav.map((n) => html`<li><a href="#${n.id}">${n.label}</a></li>`)}</ul>
          </div>
        </div>
        <div class="footer__fine">
          <p>${f.copyright}</p>
          <p>${f.disclosure}</p>
        </div>
      </div>
    </footer>`;
}

function dialog(): Raw {
  return html`
    <dialog class="dialog" id="quote-dialog" aria-labelledby="quote-title">
      <div class="dialog__head">
        <h2 id="quote-title" class="form__title">${copy.form.dialogTitle}</h2>
        <button class="dialog__close" type="button" data-close aria-label="${copy.form.close}">${icons.close}</button>
      </div>
      <div data-form-host style="padding: 0 0.25rem 0.5rem">${form('quote', 'catalog')}</div>
    </dialog>
    <div class="toast" role="status" aria-live="polite" hidden data-toast></div>`;
}

export function renderPage(o: RenderOptions): string {
  return [
    header(),
    html`<main id="main">`,
    hero(),
    intro(),
    catalog(),
    visualizer(),
    specs(),
    showroom(),
    faq(),
    ctaBand(),
    contact(o),
    html`</main>`,
    footer(),
    dialog(),
  ]
    .map((r) => r.value)
    .join('\n');
}

export { escapeHtml };
