import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isHttpUrl } from '../../shared/contracts.ts';

export type Http = (url: string, init?: RequestInit) => Promise<Response>;
export class RequestFailure extends Error {
  retryable: boolean;
  status: number;
  retryAt: number | undefined;
  constructor(status: number, retryable: boolean, retryAt?: number) {
    super(`HTTP request failed (${status || 'transport'}).`);
    this.status = status;
    this.retryable = retryable;
    this.retryAt = retryAt;
  }
}
export const pause = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
export async function retryRequest(
  http: Http,
  url: string,
  init: RequestInit = {},
  sleep: (ms: number) => Promise<void> = pause,
): Promise<Response> {
  for (let attempt = 0; attempt < 3; attempt++) {
    init.signal?.throwIfAborted();
    let response: Response;
    try {
      response = await http(url, {
        ...init,
        signal: init.signal
          ? AbortSignal.any([init.signal, AbortSignal.timeout(35_000)])
          : AbortSignal.timeout(35_000),
      });
    } catch {
      init.signal?.throwIfAborted();
      if (attempt === 2) throw new RequestFailure(0, true);
      await sleep(500 * 2 ** attempt + Math.random() * 200);
      continue;
    }
    if (response.ok) return response;
    const retryable = [429, 500, 503].includes(response.status);
    const header = response.headers.get('retry-after');
    const delay =
      header === null
        ? 500 * 2 ** attempt + Math.random() * 200
        : /^\d+$/.test(header)
          ? Number(header) * 1000
          : Math.max(0, Date.parse(header) - Date.now());
    await response.body?.cancel();
    // Long Retry-After is deferred to the next run rather than retried too early.
    if (!retryable || attempt === 2 || delay > 30_000)
      throw new RequestFailure(
        response.status,
        retryable,
        header !== null && Number.isFinite(delay)
          ? Date.now() + delay
          : undefined,
      );
    await sleep(Number.isFinite(delay) ? delay : 1000);
  }
  throw new RequestFailure(0, true);
}
export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a = 0, b = 0, c = 0] = address.split('.').map(Number);
    return !(
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
    );
  }
  // Conservatively accept global-unicast IPv6 only; mapped/local addresses fail closed.
  return (
    isIP(address) === 6 &&
    /^[23][0-9a-f]{3}:/i.test(address) &&
    !/^2001:/i.test(address) &&
    !/^2002:/i.test(address) &&
    !/^3fff:/i.test(address)
  );
}
export function normalizeUrl(value: string): string {
  if (!isHttpUrl(value)) throw new Error('Invalid HTTP(S) URL.');
  const url = new URL(value);
  url.hash = '';
  return url.toString();
}
/** DNS pinned per request; every redirect is independently checked, no cookies or auth. */
export const publicHttp: Http = async (input, init = {}) => {
  let url = normalizeUrl(input);
  for (let redirects = 0; redirects <= 4; redirects++) {
    const target = new URL(url);
    if (!['', '80', '443'].includes(target.port))
      throw new Error('Nonstandard port.');
    const host = target.hostname.replace(/^\[|\]$/g, '');
    const addresses = isIP(host)
      ? [{ address: host, family: isIP(host) }]
      : await lookup(host, { all: true });
    if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address)))
      throw new Error('Nonpublic address.');
    const pinned = addresses[0]!;
    const response = await new Promise<Response>((resolve, reject) => {
      const req = (target.protocol === 'https:' ? httpsRequest : httpRequest)(
        target,
        {
          method: 'GET',
          headers: {
            'User-Agent': 'WAAGD/1.0 public-metadata',
            Accept: 'text/html,application/xml,application/json,text/xml',
          },
          family: pinned.family,
          signal: init.signal ?? AbortSignal.timeout(15_000),
          lookup: (_host, _options, callback) =>
            callback(null, pinned.address, pinned.family),
        },
        (res) => {
          const contentType = res.headers['content-type'] ?? '';
          if (
            !/(?:text\/|xml|json)/i.test(contentType) &&
            (res.statusCode ?? 500) >= 200 &&
            (res.statusCode ?? 500) < 300
          ) {
            // Only metadata documents are read. Never buffer third-party media.
            const headers = new Headers({ 'Content-Type': contentType });
            resolve(
              new Response(null, { status: res.statusCode ?? 200, headers }),
            );
            res.destroy();
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          res.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > 2_000_000) {
              res.destroy();
              reject(new Error('Response too large.'));
            } else chunks.push(chunk);
          });
          res.on('error', reject);
          res.on('end', () => {
            const headers = new Headers();
            for (const [key, value] of Object.entries(res.headers))
              if (value)
                headers.set(
                  key,
                  Array.isArray(value) ? value.join(', ') : value,
                );
            const status = res.statusCode ?? 502;
            resolve(
              new Response(
                [204, 304].includes(status) ? null : Buffer.concat(chunks),
                { status, headers },
              ),
            );
          });
        },
      );
      req.on('error', reject);
      req.end();
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Redirect missing location.');
      url = normalizeUrl(new URL(location, url).toString());
      continue;
    }
    return response;
  }
  throw new Error('Too many redirects.');
};
