import type {
  ListPostsResponse,
  Post,
  PostsPage,
} from '../../shared/contracts.ts';
import { parsePage } from '../lib/feed.ts';

const images: Record<string, string> = {
  robot: '/src/dev/robot.svg',
  ice: '/src/dev/ice.svg',
  meme: '/src/dev/meme.svg',
  missile: '/src/dev/missile.svg',
};

export const mockPosts: Post[] = [
  {
    type: 'news',
    title: 'The machines are getting very good at our jobs.',
    source: 'The Daily Signal',
    url: 'https://example.com/robot-work',
    body: 'Autonomous agents can now work for days without human input. Your out-of-office reply may become permanent.',
    preview: {
      image_url: 'https://example.com/demo/robot.svg',
      alt_text: 'Illustrated robots working at computer terminals',
    },
  },
  {
    type: 'video',
    title: 'One small step for a robot. One giant fall down the stairs.',
    source: '@futurefails',
    url: 'https://www.tiktok.com/@futurefails/video/7420000000000000001',
    body: 'The future has arrived. It could use a handrail.',
    embed: {
      kind: 'provider',
      provider: 'tiktok',
      id: '7420000000000000001',
      url: 'https://www.tiktok.com/@futurefails/video/7420000000000000001',
    },
    preview: {
      image_url: 'https://example.com/demo/robot.svg',
      alt_text: 'A robot before its questionable next move',
    },
  },
  {
    type: 'news',
    title: 'The permafrost is melting. Its contents would like a word.',
    source: 'Planet Report',
    url: 'https://example.com/permafrost',
    body: 'Ancient pathogens are waking up from a very long nap. Some things really should stay in the freezer.',
    preview: {
      image_url: 'https://example.com/demo/ice.svg',
      alt_text: 'Illustrated researcher in an Arctic landscape',
    },
  },
  {
    type: 'meme',
    title: 'Meanwhile, at humanity HQ.',
    source: 'r/collapse',
    url: 'https://www.reddit.com/r/collapse/',
    body: null,
    preview: {
      image_url: 'https://example.com/demo/meme.svg',
      alt_text: 'An illustrated dog in a burning room says: This is fine.',
    },
  },
  {
    type: 'news',
    title: 'World leaders announce another perfectly normal missile test.',
    source: 'Global Dispatch',
    url: 'https://example.com/missile-test',
    body: 'An exciting new chapter in the ongoing international competition to make everyone nervous.',
    preview: {
      image_url: 'https://example.com/demo/missile.svg',
      alt_text: 'Illustrated missiles rising through clouds',
    },
  },
  {
    type: 'changelog',
    title: 'HUMANITY v2026.10',
    source: 'We Are All Gonna Die',
    url: null,
    body: '[ADDED]\n- More autonomous agents\n- New existential risks\n[DEPRECATED]\n- Another layer of privacy\n[KNOWN ISSUES]\n- Humans still make decisions\n- Global stability: degraded\n[FIXED]\n- Nothing. Thanks for asking.',
  },
  {
    type: 'video',
    title: 'Just a normal day on Earth.',
    source: '@ourplanet',
    url: 'https://www.instagram.com/reel/DemoEarth26/',
    body: 'Because there is still time.',
    embed: {
      kind: 'provider',
      provider: 'instagram',
      id: 'DemoEarth26',
      url: 'https://www.instagram.com/reel/DemoEarth26/',
    },
    preview: {
      image_url: 'https://example.com/demo/ice.svg',
      alt_text: 'Illustrated Arctic landscape',
    },
  },
  {
    type: 'news',
    title: 'A transmission with no preview. The suspense is free.',
    source: 'The Daily Signal',
    url: 'https://example.com/no-preview',
    body: null,
  },
  {
    type: 'video',
    title: 'This footage has left the building.',
    source: 'Archive',
    url: 'https://example.com/unavailable',
    embed: {
      kind: 'link',
      url: 'https://example.com/unavailable',
      label: null,
    },
    body: null,
  },
].map(
  (content, index) =>
    ({
      canonical_url: null,
      source_item_id: null,
      origin: 'auto',
      preview: null,
      embed: null,
      references: [],
      ...content,
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      published_at: new Date(Date.now() - (index + 1) * 3600000).toISOString(),
      deleted_at: null,
    }) as Post,
);

export async function mockPage(cursor: string | null): Promise<PostsPage> {
  await new Promise((resolve) => setTimeout(resolve, 350));
  const start = cursor === null ? 0 : 6;
  const response: ListPostsResponse = {
    ok: true,
    data: {
      posts: mockPosts.slice(start, start + 6),
      next_cursor: start === 0 ? 'dev-page-two' : null,
    },
  };
  const page = parsePage(response);
  for (const post of page.posts) {
    if (post.preview) {
      const kind = new URL(post.preview.image_url).pathname
        .split('/')
        .pop()
        ?.replace('.svg', '') as 'robot' | 'ice' | 'meme' | 'missile';
      post.preview.image_url = new URL(
        images[kind] ?? images.robot!,
        location.origin,
      ).href;
    }
  }
  return page;
}
