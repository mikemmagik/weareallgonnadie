import type { Post } from '../../shared/contracts.ts';
import {
  changelogBlocks,
  playerFor,
  relativeDate,
  safeUrl,
} from './presentation.ts';

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function externalLink(
  url: string,
  label: string,
  className = 'source-link',
): HTMLAnchorElement {
  const link = element('a', className, label);
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}
function imageFor(post: Post): HTMLImageElement | null {
  const url = safeUrl(post.preview?.image_url);
  if (!url) return null;
  const image = element('img', 'preview-image');
  image.src = url;
  image.alt = post.preview?.alt_text ?? '';
  image.loading = 'lazy';
  image.decoding = 'async';
  image.width = 800;
  image.height = 450;
  image.referrerPolicy = 'no-referrer';
  image.addEventListener(
    'error',
    () => {
      image.hidden = true;
      image.parentElement?.classList.add('image-unavailable');
    },
    { once: true },
  );
  return image;
}
function mediaFor(post: Post): HTMLElement | null {
  const image = imageFor(post);
  const original = safeUrl(post.url) ?? safeUrl(post.embed?.url);
  const player = playerFor(post.embed);
  if (post.type === 'news') {
    if (!image || !original) return null;
    const media = externalLink(original, '', 'media news-media');
    media.setAttribute('aria-label', `Read original: ${post.title}`);
    media.append(image);
    media.append(
      element(
        'span',
        'image-fallback',
        'Preview unavailable · open original ↗',
      ),
    );
    return media;
  }
  if (post.type === 'meme' && image && !player) {
    const media = original
      ? externalLink(original, '', 'media meme-media')
      : element('div', 'media meme-media');
    media.setAttribute('aria-label', `View original: ${post.title}`);
    media.append(
      image,
      element('span', 'image-fallback', 'Image unavailable · open original ↗'),
    );
    return media;
  }
  const media = element('div', `media embed-media ${player?.shape ?? 'wide'}`);
  if (image) media.append(image);
  if (player) {
    const button = element('button', 'load-player');
    button.type = 'button';
    button.setAttribute(
      'aria-label',
      `Load ${player.provider} embed: ${post.title}`,
    );
    button.append(
      element('span', 'play-icon', '▶'),
      element('span', 'player-label', `Load ${player.provider}`),
      element('span', 'player-privacy', 'External player · loads on click'),
    );
    button.addEventListener(
      'click',
      () => {
        const frame = element('iframe', 'player-frame');
        frame.title = `${player.provider}: ${post.title}`;
        frame.src = player.src;
        frame.loading = 'lazy';
        frame.referrerPolicy = 'no-referrer';
        frame.setAttribute(
          'sandbox',
          'allow-scripts allow-same-origin allow-presentation allow-popups',
        );
        frame.allow = "autoplay 'none'; fullscreen; picture-in-picture";
        // Keep a source escape hatch visible even when the provider blocks playback.
        media.replaceChildren(frame);
        const hint = element(
          'p',
          'embed-hint',
          'Player blocked or unavailable? ',
        );
        if (original) hint.append(externalLink(original, 'Open original ↗'));
        media.after(hint);
        frame.addEventListener(
          'error',
          () =>
            media.replaceChildren(
              element(
                'p',
                'media-fallback',
                'Player unavailable. Open the original below.',
              ),
            ),
          { once: true },
        );
      },
      { once: true },
    );
    media.append(button);
  } else if (original) {
    const link = externalLink(original, '', 'load-player fallback-player');
    link.append(
      element('span', 'play-icon', post.type === 'video' ? '↗' : '▧'),
      element('span', 'player-label', 'Open original'),
      element(
        'span',
        'player-privacy',
        'Preview unavailable. Reality persists.',
      ),
    );
    media.append(link);
  } else return null;
  return media;
}

export function renderPost(post: Post, index: number): HTMLElement {
  const article = element(
    'article',
    `post post-${post.type}${index % 2 && post.type !== 'changelog' ? ' media-first' : ''}`,
  );
  article.dataset.postId = post.id;
  article.setAttribute('aria-labelledby', `post-${post.id}`);
  const meta = element('div', 'post-meta');
  const time = element('time', 'post-time', relativeDate(post.published_at));
  time.dateTime = post.published_at;
  time.title = `Published to this feed: ${new Date(post.published_at).toLocaleString()}`;
  meta.append(
    time,
    element(
      'span',
      'post-kind',
      post.type === 'changelog' ? 'Release notes' : post.type,
    ),
  );
  article.append(meta);
  const content = element('div', 'post-content');
  const title = element('h2', 'post-title');
  title.id = `post-${post.id}`;
  const original = safeUrl(post.url);
  const label = post.title?.trim() || 'Untitled transmission';
  title.append(
    original
      ? externalLink(original, label, 'headline-link')
      : document.createTextNode(label),
  );
  content.append(title);
  if (post.type === 'changelog') {
    content.append(
      element('p', 'release-label', 'Monthly release notes // humanity'),
    );
    const log = element('div', 'changelog-body');
    for (const block of changelogBlocks(post.body)) {
      const className =
        block.kind === 'heading'
          ? `log-heading ${/known|deprecated|removed/i.test(block.text) ? 'log-warning' : ''}`
          : `log-${block.kind}`;
      log.append(
        element(
          block.kind === 'heading' ? 'h3' : 'p',
          className,
          block.kind === 'heading'
            ? `[${block.text}]`
            : block.kind === 'item'
              ? `+ ${block.text}`
              : block.text,
        ),
      );
    }
    content.append(log);
  } else if (post.body?.trim())
    content.append(element('p', 'post-preview', post.body));
  const source = element('div', 'post-source');
  source.append(
    element(
      'span',
      'source-mark',
      post.type === 'changelog'
        ? '>_'
        : post.source.trim().slice(0, 1).toUpperCase(),
    ),
  );
  source.append(
    original
      ? externalLink(original, `${post.source || 'Original source'} ↗`)
      : element('span', '', post.source),
  );
  content.append(source);
  if (post.references.length) {
    const references = element('div', 'post-references');
    references.append(element('span', 'reference-label', 'References: '));
    for (const reference of post.references) {
      const url = safeUrl(reference.url);
      if (url)
        references.append(
          externalLink(url, `${reference.title ?? new URL(url).hostname} ↗`),
        );
    }
    content.append(references);
  }
  article.append(content);
  if (post.type !== 'changelog') {
    const media = mediaFor(post);
    if (media) article.append(media);
    else article.classList.add('text-only');
  }
  return article;
}
