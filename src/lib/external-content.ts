/** One tab-session preference; media callbacks contain the existing URL/security policy. */
type Choice = 'allow' | 'decline';
interface Media {
  load: () => void;
  unload: () => void;
  loaded: boolean;
}
const STORAGE_KEY = 'waagd.external-content';
const media = new Map<HTMLElement, Media>();
let choice: Choice | null = null;
let initialized = false;
let observer: IntersectionObserver | undefined;
let dialog: HTMLDialogElement | null = null;
let returnFocus: HTMLElement | null = null;
let scheduled = false;

function load(node: HTMLElement): void {
  const item = media.get(node);
  if (choice !== 'allow' || !node.isConnected || !item || item.loaded) return;
  item.loaded = true;
  observer?.unobserve(node);
  item.load();
}
function checkViewport(): void {
  scheduled = false;
  if (choice !== 'allow') return;
  for (const [node, item] of media) {
    if (item.loaded || !node.isConnected) continue;
    const bounds = node.getBoundingClientRect();
    if (bounds.bottom >= -320 && bounds.top <= innerHeight + 320) load(node);
  }
}
function scheduleViewport(): void {
  if (!scheduled) {
    scheduled = true;
    requestAnimationFrame(checkViewport);
  }
}
function openSettings(): void {
  if (!dialog || dialog.open) return;
  returnFocus =
    document.activeElement instanceof HTMLElement &&
    document.activeElement !== document.body
      ? document.activeElement
      : null;
  const notice = dialog.querySelector<HTMLElement>('[data-storage-notice]');
  if (notice) {
    try {
      const storage = sessionStorage;
      storage.setItem(`${STORAGE_KEY}.probe`, '1');
      storage.removeItem(`${STORAGE_KEY}.probe`);
      notice.hidden = true;
    } catch {
      notice.hidden = false;
    }
  }
  dialog.showModal();
  // Focus the conservative action. Native modal dialog makes background content inert.
  dialog
    .querySelector<HTMLButtonElement>('[data-external-choice="decline"]')
    ?.focus();
}
function choose(value: Choice): void {
  choice = value;
  try {
    sessionStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Explicit choice works on this page only; the next document must ask again.
  }
  for (const [node, item] of media) {
    if (value === 'decline') {
      observer?.unobserve(node);
      if (item.loaded) item.unload();
      item.loaded = false;
    } else if (!item.loaded) observer?.observe(node);
  }
  if (!observer) scheduleViewport();
  dialog?.close();
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  else
    document
      .querySelector<HTMLElement>('#main')
      ?.focus({ preventScroll: true });
}
export function initializeExternalContent(): void {
  if (initialized) return;
  initialized = true;
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored === 'allow' || stored === 'decline') choice = stored;
  } catch {
    choice = null;
  }
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    let stored: Choice | null = null;
    try {
      const value = sessionStorage.getItem(STORAGE_KEY);
      if (value === 'allow' || value === 'decline') stored = value;
    } catch {
      /* Unavailable storage never restores consent implicitly. */
    }
    if (stored !== choice) {
      choose(stored ?? 'decline');
      if (stored === null) {
        choice = null;
        if (media.size) openSettings();
      }
    }
  });
  dialog = document.querySelector<HTMLDialogElement>(
    '#external-content-dialog',
  );
  const settings = document.querySelector<HTMLElement>(
    '[data-external-settings]',
  );
  let settingsPointerCancelled = false;
  settings?.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !event.isPrimary) return;
    settingsPointerCancelled = false;
    // Pagination can move the footer between down and up. Keep this gesture's
    // click on its original button, but retain drag-away/cancel behavior.
    const bounds = settings.getBoundingClientRect();
    const gesture = new AbortController();
    const options = { signal: gesture.signal };
    settings.setPointerCapture(event.pointerId);
    settings.addEventListener(
      'pointermove',
      (move) => {
        if (
          move.pointerId === event.pointerId &&
          (move.clientX < bounds.left ||
            move.clientX > bounds.right ||
            move.clientY < bounds.top ||
            move.clientY > bounds.bottom)
        ) {
          settingsPointerCancelled = true;
          settings.releasePointerCapture(event.pointerId);
        }
      },
      options,
    );
    settings.addEventListener(
      'lostpointercapture',
      () => gesture.abort(),
      options,
    );
  });
  settings?.addEventListener('click', (event) => {
    // WebKit can still target the capturing button after capture was released.
    // Only suppress the cancelled pointer click; keyboard clicks have detail=0.
    if (event.detail > 0 && settingsPointerCancelled) return;
    // Safari does not focus buttons on pointer clicks by default.
    settings.focus({ preventScroll: true });
    openSettings();
  });
  dialog
    ?.querySelectorAll<HTMLButtonElement>('[data-external-choice]')
    .forEach((button) => {
      button.addEventListener('click', () =>
        choose(button.dataset.externalChoice === 'allow' ? 'allow' : 'decline'),
      );
    });
  dialog?.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab' || !dialog) return;
    const controls = [
      ...dialog.querySelectorAll<HTMLElement>('button, a[href]'),
    ];
    const current = controls.findIndex(
      (control) => control === document.activeElement,
    );
    const next =
      (current + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
    event.preventDefault();
    controls[next]?.focus();
  });
  dialog?.addEventListener('cancel', (event) => {
    event.preventDefault();
    choose('decline');
  });
  if (typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) load(entry.target as HTMLElement);
      },
      { rootMargin: '320px' },
    );
  } else {
    window.addEventListener('scroll', scheduleViewport, { passive: true });
    window.addEventListener('resize', scheduleViewport);
  }
}
export function queueExternalMedia(
  node: HTMLElement,
  start: () => void,
  stop: () => void,
): void {
  initializeExternalContent();
  if (media.has(node)) return;
  media.set(node, { load: start, unload: stop, loaded: false });
  if (choice === null) openSettings();
  if (choice === 'allow') {
    observer?.observe(node);
    if (!observer) scheduleViewport();
  }
}
