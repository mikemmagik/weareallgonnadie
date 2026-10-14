import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

export async function verifyLegal(page, base) {
  await page.unrouteAll({ behavior: 'wait' });
  await page.goto(`${base}/privacy`);
  await page.evaluate(() => sessionStorage.clear());
  const checks = [];
  const check = (ok, label) => {
    if (!ok) throw new Error(label);
    checks.push(label);
  };
  const approved =
    'This is not a news outlet. This website is a satirical collection of third-party content, memes, and commentary. Refer to original sources for factual information.';
  const post = (n, changes = {}) => ({
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    published_at: '2026-10-12T15:00:00.000Z',
    deleted_at: null,
    type: 'video',
    origin: 'auto',
    url: 'https://example.com/original',
    canonical_url: null,
    source_item_id: null,
    title: `Legal fixture ${n}`,
    source: 'Original publisher',
    body: null,
    preview: null,
    embed: null,
    references: [],
    ...changes,
  });
  const posts = [
    post(1, {
      type: 'news',
      preview: {
        image_url: 'https://images.example/public.svg',
        alt_text: 'External preview',
      },
    }),
    post(2, {
      type: 'meme',
      preview: {
        image_url: 'https://images.example/broken.svg',
        alt_text: null,
      },
    }),
    ...[
      ['youtube', 'abcdefghijk', 'https://youtu.be/abcdefghijk'],
      [
        'tiktok',
        '7420000000000000001',
        'https://www.tiktok.com/@test/video/7420000000000000001',
      ],
      [
        'instagram',
        'DemoEarth26',
        'https://www.instagram.com/reel/DemoEarth26/',
      ],
    ].map(([provider, id, url], i) =>
      post(i + 3, {
        url,
        embed: { kind: 'provider', provider, id, url },
        preview: {
          image_url: 'https://images.example/unused.svg',
          alt_text: null,
        },
      }),
    ),
    post(6, {
      type: 'news',
      url: 'https://www.reddit.com/r/test/comments/abc123/title/',
    }),
    post(7),
    post(8, {
      type: 'news',
      preview: { image_url: 'https://127.0.0.1/private.svg', alt_text: null },
    }),
    post(9, {
      type: 'news',
      preview: {
        image_url: `${base}/earth.svg`,
        alt_text: 'First-party asset',
      },
    }),
    post(10, { type: 'news' }),
  ];
  await page.route('**/api/posts?*', (route) =>
    route.fulfill({ json: { ok: true, data: { posts, next_cursor: null } } }),
  );
  const requests = [];
  const listener = (request) => requests.push(request.url());
  page.on('request', listener);
  await page.route('https://images.example/**', (route) =>
    route.fulfill({
      status: route.request().url().endsWith('broken.svg') ? 404 : 200,
      contentType: 'image/svg+xml',
      body: route.request().url().endsWith('broken.svg')
        ? ''
        : '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="#234"/></svg>',
    }),
  );
  for (const host of [
    'www.youtube-nocookie.com',
    'www.tiktok.com',
    'www.instagram.com',
    'embed.reddit.com',
  ])
    await page.route(`https://${host}/**`, (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<p>Provider fixture</p>',
      }),
    );
  await page.route('**/embed/reddit?*', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<p>Adapter fixture</p>' }),
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base);
  await page.locator('.post').nth(9).waitFor();
  const disclaimer = page.locator('.site-disclaimer');
  check(
    (await disclaimer.locator('h2').innerText()) ===
      'DISCLAIMER — NOT A NEWS OUTLET',
    'Exact approved disclaimer heading',
  );
  check(
    (await disclaimer.locator('p').innerText()) === approved,
    'Exact approved disclaimer body',
  );
  check(
    (await disclaimer.locator('a').getAttribute('href')) === '/legal',
    'Full disclaimer is discoverable',
  );
  check(
    await disclaimer.evaluate(
      (node) =>
        node.previousElementSibling.tagName === 'HEADER' &&
        node.nextElementSibling.tagName === 'MAIN',
    ),
    'Disclaimer appears after header and before feed',
  );
  check(
    (await disclaimer.locator('button').count()) === 0,
    'Disclaimer is persistent',
  );
  check(
    await disclaimer.evaluate(
      (node) => getComputedStyle(node).animationName === 'none',
    ),
    'Disclaimer has no animation',
  );
  check(
    !requests.some((url) => new URL(url).origin !== base),
    'No external requests before media consent',
  );
  check(
    !requests.some((url) => url.includes('/embed/reddit?')),
    'Reddit adapter waits for consent',
  );
  check(
    (await page.locator('iframe').count()) === 0,
    'No frames before consent',
  );
  const card = (n) => page.locator(`[data-post-id="${post(n).id}"]`);
  check(
    (await card(9).locator('img').getAttribute('src')) === `${base}/earth.svg`,
    'First-party assets load normally',
  );
  check(
    (await card(8).locator('img, .media-consent').count()) === 0,
    'Unsafe stored preview suppressed',
  );
  check(
    await card(7).locator('.fallback-player').isVisible(),
    'Missing provider metadata retains fallback',
  );
  check(
    (await card(10).locator('.media').count()) === 0 &&
      (await card(10).locator('.post-preview').innerText()).includes(
        'Preview unavailable.',
      ) &&
      (await card(10).locator('.post-source a').isVisible()),
    'Missing news preview keeps compact source fallback',
  );
  check(
    (await card(6).locator('.media').getAttribute('data-provider')) ===
      'Reddit',
    'Validated original identifies Reddit without provider metadata',
  );
  for (const [n, provider] of [
    [1, 'images.example'],
    [3, 'YouTube'],
    [4, 'TikTok'],
    [5, 'Instagram'],
  ]) {
    check(
      await page.getByRole('dialog').isVisible(),
      `${provider}: covered by one session-wide notice`,
    );
    check(
      await card(n).locator('.post-source a').isVisible(),
      `${provider}: original available before consent`,
    );
  }
  check(
    await page
      .locator('#feed a')
      .evaluateAll((links) =>
        links.every(
          (a) =>
            /^https?:/.test(a.href) &&
            a.rel.includes('noopener') &&
            a.rel.includes('noreferrer'),
        ),
      ),
    'All source and consent links are safe',
  );
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    check(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Legal homepage fits ${width}px`,
    );
    check(
      await page
        .getByRole('dialog')
        .evaluate((node) => node.scrollWidth <= node.clientWidth),
      `Session notice fits ${width}px`,
    );
    check(
      await disclaimer.evaluate(
        (node) => getComputedStyle(node).fontSize === '14px',
      ),
      `Disclaimer readable at ${width}px`,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'output/playwright/legal-home-mobile.png' });
  const before = await card(1).locator('.media').boundingBox();
  const imageRequest = page.waitForRequest('https://images.example/public.svg');
  await page
    .getByRole('button', { name: 'ALLOW EXTERNAL CONTENT', exact: true })
    .click();
  await card(1).scrollIntoViewIfNeeded();
  await imageRequest;
  await card(1).locator('img').waitFor();
  check(
    (await card(1).locator('img').getAttribute('referrerpolicy')) ===
      'no-referrer',
    'Image referrer restricted',
  );
  check(
    (await card(1).locator('.media').boundingBox()).height === before.height,
    'Image consent preserves reserved mobile space',
  );
  check(
    (await card(2).locator('img').count()) === 1,
    'Session consent covers nearby cards without another item action',
  );
  await card(2).scrollIntoViewIfNeeded();
  await card(2).locator('.image-unavailable').waitFor();
  check(
    await card(2).locator('.image-fallback a').isVisible(),
    'Failed preview has readable original fallback',
  );
  for (const [n, host] of [
    [3, 'www.youtube-nocookie.com'],
    [4, 'www.tiktok.com'],
    [5, 'www.instagram.com'],
  ]) {
    await card(n).scrollIntoViewIfNeeded();
    await card(n).locator('iframe').waitFor();
    check(
      (await card(n).locator('iframe').getAttribute('allow')).includes(
        "autoplay 'none'",
      ),
      `${host}: autoplay remains denied`,
    );
    check(
      await card(n).locator('.embed-hint a').isVisible(),
      `${host}: original survives loading`,
    );
  }
  await card(6).scrollIntoViewIfNeeded();
  await card(6).locator('iframe').waitFor();
  check(
    (await card(6).locator('iframe').getAttribute('sandbox')) ===
      'allow-scripts allow-same-origin allow-popups',
    'Reddit retains sandbox at its isolated external origin',
  );
  check(
    !requests.some((url) => url.endsWith('/unused.svg')),
    'Embed consent does not fetch a separate preview',
  );
  await page.reload();
  await page.locator('.post').nth(9).waitFor();
  check(
    !(await page.getByRole('dialog').isVisible()) &&
      (await page.evaluate(() =>
        sessionStorage.getItem('waagd.external-content'),
      )) === 'allow',
    'Reload preserves session consent',
  );
  for (const [href, label] of [
    ['/legal', 'LEGAL'],
    ['/privacy', 'PRIVACY'],
    ['/legal#contact', 'CONTACT'],
  ])
    check(
      (await page
        .getByRole('navigation', { name: 'Legal information' })
        .getByRole('link', { name: label, exact: true })
        .getAttribute('href')) === href,
      `${label}: footer destination`,
    );
  for (const route of ['legal', 'privacy']) {
    const response = await page.goto(`${base}/${route}`);
    if (route === 'privacy') {
      const notice = await page.locator('#media').locator('..').innerText();
      check(
        notice.includes('sandboxed cross-origin iframe') &&
          notice.includes("Reddit's origin"),
        'Privacy accurately describes the direct Reddit origin',
      );
      check(
        notice.includes('legacy Reddit adapter retains an opaque sandbox'),
        'Privacy scopes the opaque sandbox to the legacy adapter',
      );
      check(
        notice.includes('may immediately play video') &&
          notice.includes('same action'),
        'Privacy describes deliberate Reddit activation and image/text limitations',
      );
      check(
        notice.includes('sessionStorage') &&
          !notice.includes('Videos do not automatically play'),
        'Session storage remains disclosed without the contradicted blanket promise',
      );
    }
    check(response.status() === 200, `/${route} static route exists`);
    check(
      (await page.locator('a[href^="mailto:"]').count()) === 0,
      `/${route}: no unverified email`,
    );
    check(
      (await page.locator('.configuration-notice').innerText()).includes(
        'before public launch',
      ),
      `/${route}: missing contact disclosed`,
    );
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      check(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `/${route} fits ${width}px`,
      );
    }
    await page.screenshot({
      path: `output/playwright/legal-${route}-desktop.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: `output/playwright/legal-${route}-mobile.png`,
      fullPage: true,
    });
  }
  page.off('request', listener);
  return { passed: checks.length, checks };
}

if (import.meta.main) {
  const base = process.argv[2] ?? 'http://127.0.0.1:4321';
  const output = execFileSync(
    'npx',
    [
      '--yes',
      '--package',
      '@playwright/cli',
      'playwright-cli',
      `-s=${process.env.WAAGD_BROWSER_SESSION ?? 'legal001'}`,
      'run-code',
      `async page => (${verifyLegal.toString()})(page, ${JSON.stringify(base)})`,
    ],
    { encoding: 'utf8', maxBuffer: 2_000_000 },
  );
  assert.doesNotMatch(output, /### Error/);
  assert.match(output, /"passed":\d+/);
  console.log(output.slice(0, output.indexOf('### Ran Playwright code')));
}
