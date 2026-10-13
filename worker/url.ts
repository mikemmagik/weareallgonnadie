import { normalizePublicationUrl } from '../shared/contracts.ts';
export function canonicalizeUrl(value: string | null): string | null {
  return value === null ? null : normalizePublicationUrl(value);
}
