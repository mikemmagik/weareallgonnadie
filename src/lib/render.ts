import type { Post } from '../../shared/contracts.ts';
import { redditPost } from '../../shared/media.ts';
import {
  changelogBlocks,
  playerFor,
  previewFor,
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
/** Neutral notice built with text nodes; provider labels never become markup. */
function mediaConsent(
  provider: string,
  original: string | null,
  label: string,
  load: () => void,
): HTMLElement {
  const notice = element('div', 'media-consent');
  notice.append(
    element('h3', 'consent-heading', 'LOAD EXTERNAL CONTENT'),
    element(
      'p',
      'consent-description',
      `This content is hosted by ${provider}. Loading it may share your IP address with the provider and allow third-party cookies.`,
    ),
  );
  const actions = element('div', 'consent-actions');
  const button = element('button', 'load-player', 'LOAD CONTENT');
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.addEventListener('click', load, { once: true });
  actions.append(button);
  if (original) actions.append(externalLink(original, 'OPEN ORIGINAL'));
  notice.append(actions);
  return notice;
}

function mediaFor(post: Post): HTMLElement | null {
  const preview = previewFor(post.preview?.image_url, location.origin);
  const original = safeUrl(post.url) ?? safeUrl(post.embed?.url);
  const reddit = redditPost(post.url);
  const player =
    playerFor(post.embed) ??
    (post.embed?.kind !== 'provider' && reddit
      ? playerFor({
          kind: 'provider',
          provider: 'reddit',
          id: reddit.id,
          url: reddit.url,
        })
      : null);
  if (player && (post.type !== 'news' || player.provider === 'Reddit')) {
    const media = element('div', `media embed-media ${player.shape}`);
    media.append(
      mediaConsent(
        player.provider,
        original,
        `Load ${player.provider} embed: ${post.title}`,
        () => {
          const frame = element('iframe', 'player-frame');
          frame.title = `${player.provider}: ${post.title}`;
          frame.src = player.src;
          frame.loading = 'lazy';
          frame.referrerPolicy = 'no-referrer';
          frame.setAttribute(
            'sandbox',
            player.provider === 'Reddit'
              ? 'allow-scripts allow-popups'
              : 'allow-scripts allow-same-origin allow-presentation allow-popups',
          );
          frame.allow =
            player.provider === 'Reddit'
              ? "autoplay 'none'; camera 'none'; microphone 'none'; fullscreen 'none'; clipboard-read 'none'; clipboard-write 'none'"
              : "autoplay 'none'; fullscreen; picture-in-picture";
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
      ),
    );
    return media;
  }
  if (preview) {
    const media = element(
      'div',
      `media ${post.type === 'news' ? 'news-media' : 'meme-media'}`,
    );
    const load = () => {
      const image = element('img', 'preview-image');
      image.alt = post.preview?.alt_text ?? '';
      image.loading = 'lazy';
      image.decoding = 'async';
      image.width = 800;
      image.height = 450;
      image.referrerPolicy = 'no-referrer';
      const fallback = element('p', 'image-fallback', 'Preview unavailable. ');
      fallback.setAttribute('role', 'status');
      if (original) fallback.append(externalLink(original, 'Open original ↗'));
      image.addEventListener(
        'error',
        () => {
          image.hidden = true;
          media.classList.add('image-unavailable');
        },
        { once: true },
      );
      // Assign src only inside this action (or for a validated same-origin asset).
      image.src = preview.url;
      const destination = original
        ? externalLink(original, '', 'preview-link')
        : element('div', 'preview-link');
      if (original)
        destination.setAttribute('aria-label', `View original: ${post.title}`);
      destination.append(image);
      media.replaceChildren(destination, fallback);
    };
    if (preview.external)
      media.append(
        mediaConsent(
          preview.provider,
          original,
          `Load external image: ${post.title}`,
          load,
        ),
      );
    else load();
    return media;
  }
  if (post.type === 'news') return null;
  if (!original) return null;
  const media = element('div', 'media embed-media wide');
  const link = externalLink(original, '', 'load-player fallback-player');
  link.append(
    element('span', 'play-icon', '↗'),
    element('span', 'player-label', 'Open original'),
    element('span', 'player-privacy', 'Preview unavailable.'),
  );
  media.append(link);
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
    else {
      article.classList.add('text-only');
      content.append(
        element(
          'p',
          'post-preview',
          'Preview unavailable. Use the original source link.',
        ),
      );
    }
  }
  return article;
}
