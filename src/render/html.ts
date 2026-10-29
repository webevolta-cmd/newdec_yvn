/** Minimal build-time templating: interpolated values are escaped unless wrapped in raw(). */
const RAW = Symbol('raw');

export interface Raw {
  [RAW]: true;
  value: string;
}

export function raw(value: string): Raw {
  return { [RAW]: true, value };
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

type Value = string | number | boolean | null | undefined | Raw | Value[];

function render(value: Value): string {
  if (value === null || value === undefined || value === false) return '';
  if (Array.isArray(value)) return value.map(render).join('');
  if (typeof value === 'object' && RAW in value) return value.value;
  return escapeHtml(String(value));
}

export function html(strings: TemplateStringsArray, ...values: Value[]): Raw {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < values.length) out += render(values[i]);
  });
  return raw(out);
}

export function attrs(map: Record<string, string | number | boolean | null | undefined>): Raw {
  return raw(
    Object.entries(map)
      .filter(([, v]) => v !== null && v !== undefined && v !== false)
      .map(([k, v]) => (v === true ? ` ${k}` : ` ${k}="${escapeHtml(String(v))}"`))
      .join(''),
  );
}
