import { isHttpUrl } from './contracts.ts';

/** Public HTTPS preview policy, usable at ingestion and browser boundaries.
 * URL checks cannot attest to future DNS answers or redirects made by a browser.
 */
export function publicPreviewUrl(value: unknown): string | null {
  if (!isHttpUrl(value)) return null;
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.port) return null;
  const host = url.hostname
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
    .toLowerCase();
  if (host.includes(':')) {
    if (!/^[23][0-9a-f]{3}:/i.test(host) || /^(?:2001|2002|3fff):/i.test(host))
      return null;
  } else if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const [a = 0, b = 0, c = 0] = host.split('.').map(Number);
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    )
      return null;
  } else if (
    !host.includes('.') ||
    /(?:^|\.)(?:localhost|localdomain|local|internal|intranet|corp|lan|home|home\.arpa|invalid|test)$/.test(
      host,
    )
  )
    return null;
  return url.toString();
}
