import { readFile } from 'node:fs/promises';
import { isAbsolute, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { record } from './core/api.ts';
import type { Source } from './discovery/sources.ts';

export function configuration(env: NodeJS.ProcessEnv = process.env) {
  const required = (key: string) => {
    const value = env[key]?.trim();
    if (!value) throw new Error(`Missing ${key}.`);
    return value;
  };
  const stateDir = required('WAAGD_STATE_DIR');
  if (!isAbsolute(stateDir))
    throw new Error(
      'WAAGD_STATE_DIR must be absolute and outside the repository.',
    );
  const repository = fileURLToPath(new URL('../', import.meta.url));
  const inside = relative(repository, stateDir);
  if (!inside || (!inside.startsWith('../') && !isAbsolute(inside)))
    throw new Error('State must be outside the repository.');
  const allowedIds = new Set(
    (env.WAAGD_TELEGRAM_ALLOWED_IDS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  if ([...allowedIds].some((id) => !/^[1-9]\d*$/.test(id)))
    throw new Error('Telegram IDs must be numeric user IDs.');
  const accessClientId = env.WAAGD_CF_ACCESS_CLIENT_ID?.trim() || '';
  const accessClientSecret = env.WAAGD_CF_ACCESS_CLIENT_SECRET?.trim() || '';
  if (Boolean(accessClientId) !== Boolean(accessClientSecret))
    throw new Error(
      'Cloudflare Access requires both WAAGD_CF_ACCESS_CLIENT_ID and WAAGD_CF_ACCESS_CLIENT_SECRET.',
    );
  const timezone = env.WAAGD_TIMEZONE ?? 'Asia/Bangkok';
  new Intl.DateTimeFormat('en', { timeZone: timezone });
  return {
    apiOrigin: required('WAAGD_API_ORIGIN'),
    token: required('WAAGD_API_WRITE_TOKEN'),
    access:
      accessClientId && accessClientSecret
        ? { clientId: accessClientId, clientSecret: accessClientSecret }
        : undefined,
    discoveryIngressToken: env.WAAGD_DISCOVERY_INGRESS_TOKEN?.trim() || '',
    stateDir,
    allowedIds,
    botToken: env.WAAGD_TELEGRAM_BOT_TOKEN ?? '',
    agent: env.WAAGD_OPENCLAW_AGENT ?? 'waagd',
    openclaw: env.WAAGD_OPENCLAW_BIN ?? 'openclaw',
    timezone,
    legacyDailyEnabled: env.WAAGD_ENABLE_LEGACY_DAILY === 'true',
    legacyTelegramPollerEnabled:
      env.WAAGD_ENABLE_LEGACY_TELEGRAM_POLLER === 'true',
  };
}
export async function loadSources(path?: string): Promise<Source[]> {
  const value: unknown = JSON.parse(
    await readFile(
      path ?? new URL('./discovery/sources.example.json', import.meta.url),
      'utf8',
    ),
  );
  if (!Array.isArray(value) || value.length > 20)
    throw new Error('Invalid sources configuration.');
  const names = new Set<string>();
  return value.map((raw: unknown) => {
    const source = record(raw);
    if (
      typeof source.name !== 'string' ||
      !source.name.trim() ||
      source.name.length > 100 ||
      names.has(source.name) ||
      typeof source.url !== 'string' ||
      typeof source.enabled !== 'boolean' ||
      !['feed', 'hn', 'usgs'].includes(String(source.format))
    )
      throw new Error('Invalid or duplicate source.');
    names.add(source.name);
    return {
      name: source.name,
      url: source.url,
      enabled: source.enabled,
      format: source.format as Source['format'],
    };
  });
}
