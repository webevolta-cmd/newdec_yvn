import { copy } from '../content/copy.ts';
import { categories, products, sheetArea } from '../content/products.ts';
import { validateInquiry, type InquiryInput } from '../../server/inquiry/validate.ts';

interface SiteConfig {
  inquiryEndpoint: string;
  turnstileSiteKey: string;
  preview: boolean;
}

declare global {
  interface Window {
    __SITE__?: SiteConfig;
    turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string; getResponse: (id: string) => string; reset: (id: string) => void };
  }
}

const site: SiteConfig = window.__SITE__ ?? { inquiryEndpoint: '/api/inquiry', turnstileSiteKey: '', preview: false };
const byId = new Map(products.map((p) => [p.id, p]));
const FIELDS = ['name', 'phone', 'email', 'area', 'message', 'productId'] as const;

function newKey(): string {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

let turnstileLoading: Promise<void> | null = null;
function loadTurnstile(): Promise<void> {
  if (!turnstileLoading) {
    turnstileLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('turnstile'));
      document.head.append(s);
    });
  }
  return turnstileLoading;
}

export class InquiryForm {
  readonly form: HTMLFormElement;
  private success: HTMLElement;
  private status: HTMLElement;
  private submit: HTMLButtonElement;
  private productSelect: HTMLSelectElement;
  private variantField: HTMLElement;
  private variantSelect: HTMLSelectElement;
  private preview: HTMLElement;
  private sheetsHint: HTMLElement;
  private startedAt = performance.now();
  private key = newKey();
  private inFlight = false;
  private source: string;
  private turnstileId: string | null = null;

  constructor(host: HTMLElement) {
    this.form = host.querySelector<HTMLFormElement>('[data-form]')!;
    this.success = host.querySelector<HTMLElement>('[data-success]')!;
    this.status = this.form.querySelector<HTMLElement>('[data-form-status]')!;
    this.submit = this.form.querySelector<HTMLButtonElement>('[data-submit]')!;
    this.productSelect = this.form.elements.namedItem('productId') as HTMLSelectElement;
    this.variantField = this.form.querySelector<HTMLElement>('[data-variant-field]')!;
    this.variantSelect = this.form.elements.namedItem('variant') as HTMLSelectElement;
    this.preview = this.form.querySelector<HTMLElement>('[data-product-preview]')!;
    this.sheetsHint = this.form.querySelector<HTMLElement>('[data-sheets-hint]')!;
    this.source = this.form.dataset.source ?? 'contact';

    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.send();
    });
    this.productSelect.addEventListener('change', () => this.setProduct(this.productSelect.value, null, false));
    this.input('area').addEventListener('input', () => this.updateSheets());
    for (const name of FIELDS) {
      const el = this.input(name);
      el?.addEventListener('blur', () => this.validateField(name));
      el?.addEventListener('input', () => {
        if (el.getAttribute('aria-invalid') === 'true') this.validateField(name);
      });
    }
    host.querySelector('[data-reset]')?.addEventListener('click', () => this.reset());
    if (site.turnstileSiteKey) void this.mountTurnstile();
    if (site.preview) {
      const note = document.createElement('p');
      note.className = 'form__preview-note';
      note.textContent = copy.form.previewNote;
      this.form.querySelector('.form__foot')?.before(note);
    }
  }

  private input(name: string): HTMLInputElement {
    return this.form.elements.namedItem(name) as HTMLInputElement;
  }

  private async mountTurnstile() {
    try {
      await loadTurnstile();
      const el = this.form.querySelector<HTMLElement>('[data-turnstile]');
      if (el && window.turnstile) this.turnstileId = window.turnstile.render(el, { sitekey: site.turnstileSiteKey, language: 'hy', appearance: 'interaction-only' });
    } catch {
      /* The server rejects the request without a token and the visitor sees the error state. */
    }
  }

  /** Pre-selects a product (and optional variant) so it travels into the request. */
  setProduct(id: string | null, variant: string | null = null, syncSelect = true): void {
    const p = id ? byId.get(id) : undefined;
    if (syncSelect) this.productSelect.value = p ? p.id : '';
    if (p) {
      const img = this.preview.querySelector('img')!;
      img.src = p.thumb;
      this.preview.querySelector('b')!.textContent = p.name;
      this.preview.querySelector('span')!.textContent = [categories[p.category].name, p.size].filter(Boolean).join(' · ');
      this.preview.hidden = false;
    } else {
      this.preview.hidden = true;
    }
    const variants = p?.variants ?? [];
    const option = (value: string, label: string) => {
      const o = document.createElement('option');
      o.value = value;
      o.textContent = label;
      return o;
    };
    this.variantSelect.replaceChildren(option('', copy.form.variantNone), ...variants.map((v) => option(v, v)));
    if (variant && variants.includes(variant)) this.variantSelect.value = variant;
    this.variantField.hidden = variants.length === 0;
    this.updateSheets();
  }

  setSource(source: string): void {
    this.source = source;
  }

  setArea(area: string): void {
    this.input('area').value = area;
    this.updateSheets();
  }

  private updateSheets(): void {
    const area = Number(this.input('area').value.replace(',', '.'));
    const p = byId.get(this.productSelect.value);
    const per = p ? sheetArea(p) : null;
    if (!p || !per || !Number.isFinite(area) || area <= 0) {
      this.sheetsHint.textContent = '';
      return;
    }
    this.sheetsHint.textContent = copy.form.sheets(Math.ceil(area / per.area), per.label);
  }

  private values(): InquiryInput {
    const v = (n: string) => (this.form.elements.namedItem(n) as HTMLInputElement | null)?.value ?? '';
    return {
      name: v('name'),
      phone: v('phone'),
      email: v('email'),
      productId: v('productId'),
      variant: this.variantField.hidden ? '' : v('variant'),
      area: v('area'),
      message: v('message'),
      source: this.source,
      pageUrl: location.href.startsWith('http') ? location.href.split('#')[0] : '',
    };
  }

  private setError(name: string, code: string | null): void {
    const el = this.input(name);
    const err = this.form.querySelector<HTMLElement>(`#${el?.id}-error`);
    if (!el) return;
    if (code) {
      el.setAttribute('aria-invalid', 'true');
      if (err) err.textContent = copy.form.errors[name]?.[code] ?? copy.form.errors[name]?.invalid ?? copy.form.status.fix;
    } else {
      el.removeAttribute('aria-invalid');
      if (err) err.textContent = '';
    }
  }

  private validateField(name: string): void {
    const result = validateInquiry(this.values());
    const code = result.ok ? null : (result.errors as Record<string, string | undefined>)[name] ?? null;
    this.setError(name, code);
  }

  private showStatus(text: string | null): void {
    this.status.hidden = !text;
    this.status.textContent = text ?? '';
    if (text) this.status.dataset.kind = 'error';
  }

  private setPending(on: boolean): void {
    this.inFlight = on;
    this.submit.disabled = on;
    this.submit.textContent = on ? copy.form.pending : copy.form.submit;
    this.form.setAttribute('aria-busy', String(on));
  }

  async send(): Promise<void> {
    if (this.inFlight) return;
    this.showStatus(null);
    const values = this.values();
    const check = validateInquiry(values);
    for (const name of FIELDS) this.setError(name, check.ok ? null : ((check.errors as Record<string, string | undefined>)[name] ?? null));
    if (!check.ok) {
      this.showStatus(copy.form.status.fix);
      const first = FIELDS.find((n) => (check.errors as Record<string, string | undefined>)[n]);
      if (first) this.input(first).focus();
      return;
    }

    this.setPending(true);
    const payload = {
      ...values,
      website: (this.form.elements.namedItem('website') as HTMLInputElement).value,
      elapsedMs: Math.round(performance.now() - this.startedAt),
      idempotencyKey: this.key,
      turnstileToken: this.turnstileId && window.turnstile ? window.turnstile.getResponse(this.turnstileId) : undefined,
    };

    let res: Response;
    try {
      res = await fetch(site.inquiryEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      this.setPending(false);
      this.showStatus(navigator.onLine === false ? copy.form.status.offline : site.preview ? copy.form.status.preview : copy.form.status.failed);
      return;
    }

    let body: { ok?: boolean; code?: string; errors?: Record<string, string> } = {};
    try {
      body = await res.json();
    } catch {
      body = {};
    }
    this.setPending(false);
    if (this.turnstileId && window.turnstile) window.turnstile.reset(this.turnstileId);

    if (res.ok && body.ok) {
      this.showSuccess(check.data.name, check.data.phone);
      return;
    }
    if (body.code === 'validation' && body.errors) {
      for (const [name, code] of Object.entries(body.errors)) this.setError(name, code);
      this.showStatus(copy.form.status.fix);
      return;
    }
    const map: Record<string, string> = copy.form.status;
    this.showStatus(map[body.code ?? ''] ?? (site.preview ? copy.form.status.preview : copy.form.status.failed));
  }

  private showSuccess(name: string, phone: string): void {
    this.form.hidden = true;
    this.success.hidden = false;
    this.success.querySelector('[data-success-text]')!.textContent = copy.form.success(name, phone);
    this.success.focus();
    this.key = newKey();
  }

  reset(): void {
    const product = this.productSelect.value;
    this.form.reset();
    for (const name of FIELDS) this.setError(name, null);
    this.showStatus(null);
    this.setProduct(product || null);
    this.form.hidden = false;
    this.success.hidden = true;
    this.startedAt = performance.now();
    this.key = newKey();
    this.input('name').focus();
  }

  /** Returns to the editable form if the success panel is showing. */
  ensureEditable(): void {
    if (!this.form.hidden) return;
    this.form.hidden = false;
    this.success.hidden = true;
    this.form.reset();
    this.startedAt = performance.now();
  }
}
