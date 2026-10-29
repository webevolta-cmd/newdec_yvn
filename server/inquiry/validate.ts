import { findProduct } from './catalog.js';

export type InquirySource = 'contact' | 'catalog' | 'visualizer' | 'hero' | 'product';

export interface InquiryInput {
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  productId?: unknown;
  variant?: unknown;
  area?: unknown;
  message?: unknown;
  source?: unknown;
  pageUrl?: unknown;
}

export interface Inquiry {
  name: string;
  phone: string;
  email: string | null;
  product: { id: string; name: string; category: string } | null;
  variant: string | null;
  area: number | null;
  message: string | null;
  source: InquirySource;
  pageUrl: string | null;
}

/** Error codes are mapped to Armenian messages on the client (src/features/form.ts). */
export type FieldError = 'required' | 'too_short' | 'too_long' | 'invalid';

export type ValidationResult =
  | { ok: true; data: Inquiry }
  | { ok: false; errors: Partial<Record<keyof InquiryInput, FieldError>> };

const SOURCES: InquirySource[] = ['contact', 'catalog', 'visualizer', 'hero', 'product'];

function text(value: unknown): string {
  if (typeof value !== 'string') return '';
  // Collapse control characters (keeps newlines for the message field).
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
}

export function normalizePhone(raw: string): string | null {
  const cleaned = raw.replace(/[\s().-]/g, '');
  if (!/^\+?\d{6,15}$/.test(cleaned)) return null;
  // Armenian local formats: 0XX XXXXXX → +374 XX XXXXXX
  if (/^0\d{8}$/.test(cleaned)) return `+374${cleaned.slice(1)}`;
  if (/^374\d{8}$/.test(cleaned)) return `+${cleaned}`;
  if (/^\d{8}$/.test(cleaned)) return `+374${cleaned}`;
  return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
}

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

export function validateInquiry(input: InquiryInput): ValidationResult {
  const errors: Partial<Record<keyof InquiryInput, FieldError>> = {};

  const name = text(input.name).replace(/\s+/g, ' ');
  if (!name) errors.name = 'required';
  else if (name.length < 2) errors.name = 'too_short';
  else if (name.length > 80) errors.name = 'too_long';

  const phoneRaw = text(input.phone);
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  if (!phoneRaw) errors.phone = 'required';
  else if (!phone) errors.phone = 'invalid';

  const emailRaw = text(input.email);
  if (emailRaw && (emailRaw.length > 160 || !EMAIL_RE.test(emailRaw))) errors.email = 'invalid';

  const productId = text(input.productId);
  const product = productId ? findProduct(productId) : null;
  if (productId && !product) errors.productId = 'invalid';

  const variant = text(input.variant).slice(0, 120) || null;

  let area: number | null = null;
  const areaRaw = typeof input.area === 'number' ? String(input.area) : text(input.area);
  if (areaRaw) {
    const parsed = Number(areaRaw.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 10000) errors.area = 'invalid';
    else area = Math.round(parsed * 10) / 10;
  }

  const message = text(input.message);
  if (message.length > 2000) errors.message = 'too_long';

  const sourceRaw = text(input.source) as InquirySource;
  const source = SOURCES.includes(sourceRaw) ? sourceRaw : 'contact';

  let pageUrl: string | null = null;
  const pageRaw = text(input.pageUrl);
  if (pageRaw) {
    try {
      const u = new URL(pageRaw);
      if (u.protocol === 'https:' || u.protocol === 'http:') pageUrl = u.toString().slice(0, 300);
    } catch {
      pageUrl = null;
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      name,
      phone: phone as string,
      email: emailRaw || null,
      product: product ? { id: product.id, name: product.name, category: product.category } : null,
      variant,
      area,
      message: message || null,
      source,
      pageUrl,
    },
  };
}
