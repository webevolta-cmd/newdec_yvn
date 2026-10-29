import { composeMail, DeliveryError, readMailConfig, sendMail } from './email.js';
import {
  filledTooFast,
  honeypotTripped,
  isRateLimited,
  recallAccepted,
  rememberAccepted,
  tooManyLinks,
  verifyTurnstile,
} from './spam.js';
import { validateInquiry, type InquiryInput } from './validate.js';

export interface InquiryRequest {
  method: string;
  ip: string;
  origin: string | null;
  body: unknown;
}

export interface InquiryResponse {
  status: number;
  body: Record<string, unknown>;
}

interface Payload extends InquiryInput {
  website?: unknown; // honeypot
  elapsedMs?: unknown;
  idempotencyKey?: unknown;
  turnstileToken?: unknown;
}

const json = (status: number, body: Record<string, unknown>): InquiryResponse => ({ status, body });

function originAllowed(origin: string | null, env: NodeJS.ProcessEnv): boolean {
  const allowed = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowed.length === 0 || !origin) return true;
  return allowed.includes(origin);
}

export async function handleInquiry(req: InquiryRequest, env: NodeJS.ProcessEnv = process.env): Promise<InquiryResponse> {
  if (req.method !== 'POST') return json(405, { ok: false, code: 'method_not_allowed' });
  if (!originAllowed(req.origin, env)) return json(403, { ok: false, code: 'forbidden_origin' });

  const payload = (req.body && typeof req.body === 'object' ? req.body : {}) as Payload;

  // Bots that fill the hidden field get a neutral answer and no e-mail.
  if (honeypotTripped(payload.website)) return json(200, { ok: true, id: 'filtered' });
  if (filledTooFast(payload.elapsedMs)) return json(400, { ok: false, code: 'too_fast' });

  const result = validateInquiry(payload);
  if (!result.ok) return json(400, { ok: false, code: 'validation', errors: result.errors });
  if (tooManyLinks(result.data.message)) return json(400, { ok: false, code: 'validation', errors: { message: 'invalid' } });

  if (env.TURNSTILE_SECRET_KEY) {
    const human = await verifyTurnstile(payload.turnstileToken, req.ip, env.TURNSTILE_SECRET_KEY);
    if (!human) return json(403, { ok: false, code: 'captcha_failed' });
  }

  const key =
    typeof payload.idempotencyKey === 'string' && /^[\w-]{8,80}$/.test(payload.idempotencyKey)
      ? payload.idempotencyKey
      : `${result.data.phone}-${result.data.product?.id ?? 'general'}-${Math.floor(Date.now() / 60000)}`;

  const previous = recallAccepted(key);
  if (previous) return json(200, { ok: true, id: previous, duplicate: true });
  // Only requests that would actually be sent count toward the per-visitor limit.
  const limit = env.INQUIRY_RATE_LIMIT === undefined || env.INQUIRY_RATE_LIMIT === '' ? undefined : Number(env.INQUIRY_RATE_LIMIT);
  if (isRateLimited(req.ip, Number.isFinite(limit) ? limit : undefined)) return json(429, { ok: false, code: 'rate_limited' });

  const config = readMailConfig(env);
  if (!config) {
    console.error('[inquiry] delivery is not configured: set INQUIRY_TO_EMAIL, INQUIRY_FROM_EMAIL and RESEND_API_KEY or SMTP_*');
    return json(503, { ok: false, code: 'not_configured' });
  }

  try {
    const id = await sendMail(config, composeMail(result.data, config.subjectPrefix), key);
    rememberAccepted(key, id);
    return json(200, { ok: true, id });
  } catch (err) {
    console.error('[inquiry] delivery failed', err instanceof DeliveryError ? err.message : err);
    return json(502, { ok: false, code: 'delivery_failed' });
  }
}
