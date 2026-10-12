import { ApiError } from './errors.ts';

export async function authenticate(
  request: Request,
  token: string | undefined,
): Promise<void> {
  if (!token || !token.trim())
    throw new ApiError(
      'SERVICE_UNAVAILABLE',
      'Write authentication is not configured.',
      503,
    );
  const match = /^Bearer ([^\s]+)$/i.exec(
    request.headers.get('Authorization') ?? '',
  );
  if (!match) throw unauthorized();
  // Native HMAC verification compares credentials without a JS string comparison.
  const key = await crypto.subtle.importKey(
    'raw',
    crypto.getRandomValues(new Uint8Array(32)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(token),
  );
  if (
    !(await crypto.subtle.verify(
      'HMAC',
      key,
      signature,
      encoder.encode(match[1]),
    ))
  )
    throw unauthorized();
}

function unauthorized(): ApiError {
  return new ApiError(
    'UNAUTHORIZED',
    'A valid bearer credential is required.',
    401,
    undefined,
    { 'WWW-Authenticate': 'Bearer' },
  );
}
