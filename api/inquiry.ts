import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleInquiry } from '../server/inquiry/handler.js';

function clientIp(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0];
  return (first ?? req.socket?.remoteAddress ?? 'unknown').trim();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  let body: unknown = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  const result = await handleInquiry({
    method: req.method ?? 'GET',
    ip: clientIp(req),
    origin: typeof req.headers.origin === 'string' ? req.headers.origin : null,
    body,
  });

  res.setHeader('Cache-Control', 'no-store');
  if (result.status === 405) res.setHeader('Allow', 'POST');
  res.status(result.status).json(result.body);
}
