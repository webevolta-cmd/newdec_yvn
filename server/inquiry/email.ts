import type { Inquiry, InquirySource } from './validate.js';

export interface MailConfig {
  provider: 'resend' | 'smtp';
  to: string[];
  from: string;
  subjectPrefix: string;
  resendApiKey?: string;
  smtp?: { host: string; port: number; user?: string; pass?: string; secure: boolean };
}

export interface ComposedMail {
  subject: string;
  text: string;
  html: string;
  replyTo: string | null;
}

const SOURCE_LABELS: Record<InquirySource, string> = {
  contact: 'Կապի ձև',
  catalog: 'Տեսականի',
  visualizer: 'Վիզուալիզատոր (պանելը ինտերիերում)',
  hero: 'Գլխավոր էկրան',
  product: 'Ապրանքի քարտ',
};

/** Reads mail settings from the environment. Returns null when delivery is not configured. */
export function readMailConfig(env: NodeJS.ProcessEnv): MailConfig | null {
  const to = (env.INQUIRY_TO_EMAIL ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const from = (env.INQUIRY_FROM_EMAIL ?? '').trim();
  if (to.length === 0 || !from) return null;
  const subjectPrefix = (env.INQUIRY_SUBJECT_PREFIX ?? '').trim();

  if (env.RESEND_API_KEY) {
    return { provider: 'resend', to, from, subjectPrefix, resendApiKey: env.RESEND_API_KEY };
  }
  if (env.SMTP_HOST) {
    const port = Number(env.SMTP_PORT ?? 587);
    return {
      provider: 'smtp',
      to,
      from,
      subjectPrefix,
      smtp: {
        host: env.SMTP_HOST,
        port,
        user: env.SMTP_USER || undefined,
        pass: env.SMTP_PASS || undefined,
        secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465,
      },
    };
  }
  return null;
}

/** +37444305355 → +374 44 30 53 55 (other numbers are left as entered). */
export function formatPhone(e164: string): string {
  const m = /^\+374(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(e164);
  return m ? `+374 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : e164;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function composeMail(inquiry: Inquiry, subjectPrefix: string, receivedAt = new Date()): ComposedMail {
  const when = new Intl.DateTimeFormat('hy-AM', {
    timeZone: 'Asia/Yerevan',
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(receivedAt);

  const productLine = inquiry.product
    ? `${inquiry.product.name} (${inquiry.product.category}; կոդ կայքում՝ ${inquiry.product.id})`
    : 'Նշված չէ';

  const phone = formatPhone(inquiry.phone);
  const rows: Array<[string, string]> = [
    ['Անուն', inquiry.name],
    ['Հեռախոս', phone],
    ['Էլ․ փոստ', inquiry.email ?? 'Նշված չէ'],
    ['Վահանակ', productLine],
    ['Տարբերակ / երանգ', inquiry.variant ?? 'Նշված չէ'],
    ['Մոտավոր մակերես', inquiry.area != null ? `${String(inquiry.area).replace('.', ',')} մ²` : 'Նշված չէ'],
    ['Հաղորդագրություն', inquiry.message ?? '—'],
    ['Աղբյուր', SOURCE_LABELS[inquiry.source]],
    ['Էջ', inquiry.pageUrl ?? '—'],
    ['Ստացվել է', when],
  ];

  const subjectCore = inquiry.product
    ? `Նոր հայտ՝ ${inquiry.product.name} — ${inquiry.name}`
    : `Նոր հայտ կայքից — ${inquiry.name}`;
  const subject = subjectPrefix ? `${subjectPrefix} ${subjectCore}` : subjectCore;

  const text = [
    'NEW DEC — նոր հայտ կայքից',
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    `Պատասխանելու համար զանգահարեք ${phone} համարին${inquiry.email ? ` կամ գրեք ${inquiry.email} հասցեին` : ''}։`,
  ].join('\n');

  const htmlRows = rows
    .map(
      ([label, value]) =>
        `<tr><th align="left" style="padding:8px 16px 8px 0;color:#6b6f7b;font-weight:500;vertical-align:top;white-space:nowrap">${escapeHtml(label)}</th><td style="padding:8px 0;color:#141824;white-space:pre-wrap">${escapeHtml(value)}</td></tr>`,
    )
    .join('');

  const html = `<!doctype html><html lang="hy"><body style="margin:0;padding:24px;background:#f4f1ee;font-family:'Noto Sans Armenian',Arial,sans-serif">
<table role="presentation" width="100%" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px">
<tr><td>
<p style="margin:0 0 4px;font-size:12px;letter-spacing:.2em;color:#b07a5f">NEW DEC</p>
<h1 style="margin:0 0 16px;font-size:20px;color:#141824">${escapeHtml(subjectCore)}</h1>
<table role="presentation" style="border-collapse:collapse;font-size:15px;line-height:1.5">${htmlRows}</table>
<p style="margin:20px 0 0;font-size:14px;color:#141824">Պատասխանելու համար զանգահարեք <a href="tel:${escapeHtml(inquiry.phone)}">${escapeHtml(phone)}</a>${
    inquiry.email ? ` կամ գրեք <a href="mailto:${escapeHtml(inquiry.email)}">${escapeHtml(inquiry.email)}</a>` : ''
  }։</p>
</td></tr></table></body></html>`;

  return { subject, text, html, replyTo: inquiry.email };
}

export class DeliveryError extends Error {}

export async function sendMail(config: MailConfig, mail: ComposedMail, idempotencyKey: string): Promise<string> {
  if (config.provider === 'resend') {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        from: config.from,
        to: config.to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(10000),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (!res.ok || !json.id) {
      throw new DeliveryError(`Resend responded ${res.status}: ${json.name ?? ''} ${json.message ?? ''}`.trim());
    }
    return json.id;
  }

  const smtp = config.smtp!;
  const nodemailer = await import('nodemailer');
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  try {
    const info = await transport.sendMail({
      from: config.from,
      to: config.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      replyTo: mail.replyTo ?? undefined,
      headers: { 'X-Inquiry-Key': idempotencyKey },
    });
    return info.messageId;
  } catch (err) {
    throw new DeliveryError(`SMTP delivery failed: ${(err as Error).message}`);
  }
}
