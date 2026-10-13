import type { AI } from '../openclaw/ai.ts';
import type { Source } from './sources.ts';
import { collect } from './sources.ts';
import type { Http } from '../core/http.ts';
import { normalizeUrl } from '../core/http.ts';
import { record } from '../core/api.ts';
import type { Publisher } from '../core/state.ts';
import type { CreatePostInput } from '../../shared/contracts.ts';

function identity(payload: CreatePostInput): string[] {
  return [
    (payload.canonical_url ?? payload.url)
      ? `url:${normalizeUrl((payload.canonical_url ?? payload.url)!)}`
      : '',
    payload.source_item_id
      ? `id:${payload.source}:${payload.source_item_id}`
      : '',
  ].filter(Boolean);
}
export async function runDiscovery(
  publisher: Publisher,
  ai: AI,
  sources: Source[],
  now = new Date(),
  http?: Http,
) {
  return publisher.state.locked('discovery', async () => {
    const day = now.toISOString().slice(0, 10);
    const journalName = `discovery-${day}.json`;
    const existingJournal = await publisher.state.read(journalName);
    const journal =
      existingJournal === null ? { selected: 0 } : record(existingJournal);
    const selectedToday = Number(journal.selected);
    if (
      !Number.isInteger(selectedToday) ||
      selectedToday < 0 ||
      selectedToday > 5
    )
      throw new Error('Invalid daily journal.');
    const budget = 5 - selectedToday;
    if (!budget)
      return { published: 0, duplicates: 0, failed: [], candidates: 0 };
    const feed = await publisher.api.posts();
    const known = new Set(
      [...feed, ...(await publisher.processed())].flatMap(identity),
    );
    const collected = await collect(sources, now, http);
    const candidates = collected.candidates.filter((candidate) => {
      const keys = identity(candidate.payload);
      if (keys.some((key) => known.has(key))) return false;
      keys.forEach((key) => known.add(key));
      return true;
    });
    if (!candidates.length)
      return {
        published: 0,
        duplicates: 0,
        failed: collected.failed,
        candidates: 0,
      };
    const output = record(
      await ai.run('discovery', { maximum: budget, candidates }),
    );
    if (!Array.isArray(output.selected) || output.selected.length > budget)
      throw new Error('Invalid AI selection.');
    const used = new Set<string>();
    // Validate every selection before submitting any candidate.
    const payloads = output.selected.map((raw: unknown) => {
      const selected = record(raw);
      const candidate = candidates.find((c) => c.key === selected.key);
      if (
        !candidate ||
        used.has(candidate.key) ||
        typeof selected.english_title !== 'string' ||
        !selected.english_title.trim() ||
        selected.english_title.length > 300
      )
        throw new Error('Invalid AI candidate or English headline.');
      used.add(candidate.key);
      return { ...candidate.payload, title: selected.english_title.trim() };
    });
    // Reserve budget before network writes so uncertain writes/retries cannot exceed it.
    await publisher.state.write(journalName, {
      selected: selectedToday + payloads.length,
    });
    let published = 0;
    let duplicates = 0;
    const failed = [...collected.failed];
    for (const payload of payloads) {
      try {
        const result = await publisher.submit(payload);
        if (result.outcome === 'created') published++;
        else duplicates++;
      } catch {
        failed.push(`publication:${payload.source}`);
      }
    }
    return { published, duplicates, failed, candidates: candidates.length };
  });
}
