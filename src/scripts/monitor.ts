import { FeedSession, fetchPage } from '../lib/feed.ts';
import { renderPost } from '../lib/render.ts';

async function start(): Promise<void> {
  const feed = document.querySelector<HTMLElement>('#feed');
  const message = document.querySelector<HTMLElement>('#feed-message');
  const button = document.querySelector<HTMLButtonElement>('#load-more');
  const sentinel = document.querySelector<HTMLElement>('#feed-sentinel');
  const count = document.querySelector<HTMLElement>('#transmission-count');
  const connection = document.querySelector<HTMLElement>('#connection-status');
  if (!feed || !message || !button || !sentinel || !count || !connection)
    return;
  let request = fetchPage;
  if (
    import.meta.env.DEV &&
    new URLSearchParams(location.search).get('demo') === '1'
  ) {
    const mock = await import('../dev/mock-feed.ts');
    request = mock.mockPage;
    document
      .querySelector<HTMLElement>('#demo-notice')
      ?.removeAttribute('hidden');
  }
  const session = new FeedSession(request);
  const rendered = new Map<string, HTMLElement>();
  let observer: IntersectionObserver | undefined;
  const update = () => {
    feed.setAttribute('aria-busy', String(session.status === 'loading'));
    for (const [index, post] of session.posts.entries()) {
      if (!rendered.has(post.id))
        rendered.set(post.id, renderPost(post, index));
      // Moving existing nodes preserves loaded players and establishes exact order.
      const card = rendered.get(post.id);
      if (card && feed.children[index] !== card)
        feed.insertBefore(card, feed.children[index] ?? null);
    }
    count.textContent = `${String(session.posts.length).padStart(3, '0')} transmissions`;
    connection.textContent =
      session.status === 'error'
        ? 'Signal interrupted'
        : session.status === 'loading'
          ? 'Establishing signal'
          : 'Signal acquired';
    const messages = {
      idle: 'Establishing contact with a questionable civilization…',
      loading: 'Searching for additional reasons to panic…',
      ready: 'More evidence below. Proceed at your own risk.',
      empty: 'No evidence yet. Enjoy this suspicious moment of peace.',
      end: "Congratulations. You've survived all available news.",
      error:
        session.errorCode === 'NOT_IMPLEMENTED'
          ? 'The monitor is ready. The transmission is not. Check back soon.'
          : session.errorCode === 'CURSOR_STALLED'
            ? 'The signal is repeating itself. Try again later.'
            : 'Signal lost. Even the bad news needs a moment.',
    };
    message.textContent = messages[session.status];
    button.hidden = !['ready', 'error'].includes(session.status);
    button.textContent =
      session.status === 'error'
        ? 'Retry connection ↻'
        : 'Load older transmissions ↓';
    sentinel.dataset.state = session.status;
  };
  const load = async () => {
    observer?.disconnect();
    const pending = session.load();
    update();
    await pending;
    update();
    if (session.status === 'ready')
      requestAnimationFrame(() => observer?.observe(sentinel));
  };
  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver(
      (entries) => {
        if (
          entries.some((entry) => entry.isIntersecting) &&
          session.status === 'ready'
        )
          void load();
      },
      { rootMargin: '240px' },
    );
  }
  button.addEventListener('click', () => void load());
  const clock = document.querySelector<HTMLElement>('#system-date');
  if (clock)
    clock.textContent = new Date()
      .toISOString()
      .slice(0, 10)
      .replaceAll('-', '.');
  window.addEventListener('pagehide', () => observer?.disconnect(), {
    once: true,
  });
  await load();
}
void start();
