export const TELEGRAM_INGRESS_TARGETS = {
  staging: 'https://waagd-staging.waagd.workers.dev',
  production: 'https://weareallgonnadie.com',
} as const;

export type TelegramIngressEnvironment = keyof typeof TELEGRAM_INGRESS_TARGETS;

export interface TelegramIngressTarget {
  environment: TelegramIngressEnvironment;
  origin: (typeof TELEGRAM_INGRESS_TARGETS)[TelegramIngressEnvironment];
}

/**
 * The existing OpenClaw receiver can be configured for exactly one approved
 * Website environment. Do not turn this into a suffix/hostname allowlist:
 * credentials are selected by this target and must never follow arbitrary URLs.
 */
export function telegramIngressTarget(
  apiOrigin: string,
  declaredEnvironment: string,
): TelegramIngressTarget {
  let parsed: URL;
  try {
    parsed = new URL(apiOrigin);
  } catch {
    throw new Error('WAAGD_API_ORIGIN must be an approved HTTPS origin.');
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  )
    throw new Error('WAAGD_API_ORIGIN must be an approved HTTPS origin.');

  if (declaredEnvironment !== 'staging' && declaredEnvironment !== 'production')
    throw new Error(
      'WAAGD_TELEGRAM_INGRESS_ENVIRONMENT must be staging or production.',
    );

  const target: TelegramIngressTarget = {
    environment: declaredEnvironment,
    origin: TELEGRAM_INGRESS_TARGETS[declaredEnvironment],
  };
  if (parsed.origin !== target.origin)
    throw new Error(
      `WAAGD_API_ORIGIN is not authorized for ${target.environment} Telegram ingress.`,
    );
  return target;
}
