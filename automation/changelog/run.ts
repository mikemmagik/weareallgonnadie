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
// Archive months use UTC insertion times (the API's immutable clock).
export async function runChangelog(
  publisher: Publisher,
  ai: AI,
  month: string,
) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Invalid month.');
  return publisher.state.locked(`changelog-${month}`, async () => {
    const id = `humanity-changelog:${month}`;
    const draftName = `changelog-${month}.json`;
    const start = new Date(`${month}-01T00:00:00.000Z`);
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
    const posts = feed
      .filter((p) => p.published_at.startsWith(month) && p.type !== 'changelog')
      .slice(0, 100);
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
          (r) =>
            !posts.some(
              (p) => r.url === `${publisher.api.base}/api/posts/${p.id}`,
            ),
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
            url: `${publisher.api.base}/api/posts/${p.id}`,
            title: `${p.id}: ${p.title}`.slice(0, 300),
          })),
      };
      await publisher.state.write(draftName, { payload });
    }
    return publisher.submit(payload);
  });
}
