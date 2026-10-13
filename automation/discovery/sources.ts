import { decode, linkPayload } from '../core/metadata.ts';
import { normalizeUrl, publicHttp, retryRequest } from '../core/http.ts';
import type { Http } from '../core/http.ts';
import { record } from '../core/api.ts';
import type { CreatePostInput } from '../../shared/contracts.ts';

export interface Source {
  name: string;
  url: string;
  format: 'feed' | 'hn' | 'usgs';
  enabled: boolean;
}
export interface Candidate {
  key: string;
  payload: CreatePostInput;
  summary: string;
  date: string;
}
export function parseFeed(xml: string, source: Source, now: Date): Candidate[] {
  if (!/<(?:rss|feed|rdf:RDF)\b/i.test(xml) || /<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new Error('Unsupported or unsafe feed.');
  const result: Candidate[] = [];
  for (const match of xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const body = match[2]!;
    const field = (name: string) =>
      decode(
        body.match(
          new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'),
        )?.[1] ?? '',
      );
    const date =
      field('pubDate') ||
      field('published') ||
      field('updated') ||
      field('dc:date');
    const parsed = Date.parse(date);
    if (
      !Number.isFinite(parsed) ||
      parsed < now.getTime() - 48 * 3600_000 ||
      parsed > now.getTime() + 3600_000
    )
      continue;
    const url =
      field('link') ||
      body.match(
        /<link\b(?=[^>]*(?:rel=["']alternate["']|\/>))[^>]*href=["']([^"']+)["']/i,
      )?.[1];
    if (!url || !field('title')) continue;
    try {
      const payload = linkPayload(
        decode(url),
        field('title'),
        source.name,
        'auto',
        (field('guid') || field('id') || normalizeUrl(url)).slice(0, 256),
      );
      result.push({
        key: `${source.name}:${result.length}`,
        payload,
        summary: (
          field('description') ||
          field('summary') ||
          field('content')
        ).slice(0, 1500),
        date: new Date(parsed).toISOString(),
      });
    } catch {
      /* Malformed entries do not lose the rest of a feed. */
    }
    if (result.length >= 40) break;
  }
  return result;
}
export async function collectSource(
  source: Source,
  now: Date,
  http: Http = publicHttp,
): Promise<Candidate[]> {
  const response = await retryRequest(http, source.url);
  if (source.format === 'feed')
    return parseFeed(await response.text(), source, now);
  const value: unknown = await response.json();
  const candidates: Candidate[] = [];
  const root = record(value);
  const entries = source.format === 'hn' ? root.hits : root.features;
  if (!Array.isArray(entries)) throw new Error('Invalid source API response.');
  for (const raw of entries.slice(0, 40)) {
    try {
      const row = record(raw);
      const properties =
        source.format === 'usgs' ? record(row.properties) : row;
      const date =
        source.format === 'usgs'
          ? Number(properties.time)
          : Date.parse(String(properties.created_at));
      if (
        !Number.isFinite(date) ||
        date < now.getTime() - 48 * 3600_000 ||
        date > now.getTime() + 3600_000
      )
        continue;
      const url = properties.url;
      const title = properties.title;
      const id = source.format === 'usgs' ? row.id : row.objectID;
      if (
        typeof url !== 'string' ||
        typeof title !== 'string' ||
        typeof id !== 'string'
      )
        continue;
      candidates.push({
        key: `${source.name}:${id}`,
        payload: linkPayload(url, title, source.name, 'auto', id.slice(0, 256)),
        summary:
          source.format === 'usgs'
            ? `USGS reported magnitude ${String(properties.mag)}; earthquake event metadata only.`
            : '',
        date: new Date(date).toISOString(),
      });
    } catch {
      /* Invalid items are isolated. */
    }
  }
  return candidates;
}
export async function collect(
  sources: Source[],
  now: Date,
  http: Http = publicHttp,
): Promise<{ candidates: Candidate[]; failed: string[] }> {
  const candidates: Candidate[] = [];
  const failed: string[] = [];
  for (const source of sources.filter((s) => s.enabled)) {
    try {
      candidates.push(...(await collectSource(source, now, http)));
    } catch {
      failed.push(source.name);
    }
  }
  return { candidates: candidates.slice(0, 150), failed };
}
