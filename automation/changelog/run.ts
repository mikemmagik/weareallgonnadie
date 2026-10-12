import type { AI } from '../openclaw/ai.ts';
import type { Publisher } from '../core/state.ts';
import { payloadKey } from '../core/state.ts';
import { record } from '../core/api.ts';
import type { CreatePostInput } from '../../shared/contracts.ts';
import { validateCreatePostInput } from '../../shared/contracts.ts';

export function previousMonth(now: Date, timezone = 'Asia/Bangkok'): string {
  const parts = new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: '2-digit',
    timeZone: timezone,
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === 'year')!.value);
  const month = Number(parts.find((p) => p.type === 'month')!.value);
  return new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
}
/** Calendar membership uses the scheduler timezone; storage timestamps remain UTC. */
export function calendarMonth(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: '2-digit',
    timeZone: timezone,
  }).formatToParts(date);
  return `${parts.find((p) => p.type === 'year')!.value}-${parts.find((p) => p.type === 'month')!.value}`;
}
export function monthStart(month: string, timezone: string): Date {
  const utc = Date.parse(`${month}-01T00:00:00.000Z`);
  let instant = utc;
  // Resolve the wall-clock boundary, including ordinary DST offsets, without a timezone dependency.
  const formatter = new Intl.DateTimeFormat('en', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(instant)).map((p) => [p.type, p.value]),
    );
    const wall = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    const next = instant + utc - wall;
    if (next === instant) return new Date(instant);
    instant = next;
  }
  throw new Error('Calendar boundary could not be resolved.');
}
export async function runChangelog(
  publisher: Publisher,
  ai: AI,
  month: string,
  timezone = 'Asia/Bangkok',
) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Invalid month.');
  return publisher.state.locked(`changelog-${month}`, async () => {
    const id = `humanity-changelog:${month}`;
    const draftName = `changelog-${month}.json`;
    const start = monthStart(month, timezone);
    const feed = await publisher.api.posts(start);
    if (
      feed.some(
        (p) => p.source === 'We Are All Gonna Die' && p.source_item_id === id,
      ) ||
      (await publisher.processed()).some(
        (p) => p.source === 'We Are All Gonna Die' && p.source_item_id === id,
      )
    )
      return { outcome: 'already_exists' };
    // Deleted publications never enter generation. Previous changelogs are not source events.
    const posts = feed.filter(
      (p) =>
        p.deleted_at === null &&
        calendarMonth(new Date(p.published_at), timezone) === month &&
        p.type !== 'changelog',
    );
    if (!posts.length) return { outcome: 'empty_month' };
    const saved = await publisher.state.read(draftName);
    let payload: CreatePostInput;
    if (saved !== null) {
      const validated = validateCreatePostInput(record(saved).payload);
      if (
        !validated.valid ||
        validated.value.type !== 'changelog' ||
        validated.value.source_item_id !== id ||
        validated.value.source !== 'We Are All Gonna Die'
      )
        throw new Error('Invalid saved monthly draft.');
      payload = validated.value;
      // Refuse a retry draft if any cited publication was deleted since generation.
      if (
        !Array.isArray(payload.references) ||
        payload.references.some(
          (r) => !posts.some((p) => r.url === publisher.api.siteUrl(p.id)),
        )
      ) {
        await publisher.state.remove(draftName);
        await publisher.state.remove(`outgoing-${payloadKey(payload)}.json`);
        throw new Error(
          'Changelog references changed; regenerate on next run.',
        );
      }
    } else {
      const output = record(
        await ai.run('changelog', {
          month,
          timezone,
          posts: posts.map((p) => ({
            id: p.id,
            title: p.title,
            source: p.source,
            url: p.url,
            body: p.body?.slice(0, 2000) ?? null,
          })),
        }),
      );
      if (
        typeof output.body !== 'string' ||
        !Array.isArray(output.publication_ids) ||
        !output.publication_ids.length ||
        output.publication_ids.length > 100
      )
        throw new Error('Invalid changelog output.');
      const count = output.body.trim().split(/\s+/).length;
      if (count < 150 || count > 250 || /<\/?[a-z][^>]*>/i.test(output.body))
        throw new Error('Changelog must contain 150–250 words without HTML.');
      const ids = new Set(output.publication_ids);
      if (
        ids.size !== output.publication_ids.length ||
        [...ids].some((id) => !posts.some((p) => p.id === id))
      )
        throw new Error('Changelog cites an unknown publication.');
      const inline = new Set(
        [...output.body.matchAll(/\[post:([^\]]+)\]/g)].map((m) => m[1]!),
      );
      if (inline.size !== ids.size || [...inline].some((id) => !ids.has(id)))
        throw new Error('Inline changelog citations do not match references.');
      payload = {
        type: 'changelog',
        url: null,
        canonical_url: null,
        source_item_id: id,
        title: `HUMANITY v${month.replace('-', '.')} — MONTHLY RELEASE NOTES`,
        source: 'We Are All Gonna Die',
        origin: 'auto',
        preview: null,
        embed: null,
        body: output.body.trim(),
        references: posts
          .filter((p) => ids.has(p.id))
          .map((p) => ({
            url: publisher.api.siteUrl(p.id),
            title: `${p.id}: ${p.title}`.slice(0, 300),
          })),
      };
      await publisher.state.write(draftName, { payload });
    }
    return publisher.submit(payload);
  });
}
