export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy':
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' https:; connect-src 'self'; frame-src 'self' https://embed.reddit.com https://www.youtube-nocookie.com https://www.tiktok.com https://www.instagram.com; base-uri 'none'; object-src 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy':
    'autoplay=(), camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self "https://www.youtube-nocookie.com" "https://www.tiktok.com" "https://www.instagram.com")',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000',
};

export function secureResponse(response: Response): Response {
  const secured = new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS))
    secured.headers.set(name, value);
  return secured;
}
