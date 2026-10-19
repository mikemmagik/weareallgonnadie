import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import dns from 'node:dns/promises';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { syncBuiltinESMExports } from 'node:module';
import { Api } from '../automation/core/api.ts';
import { State, Publisher, payloadKey } from '../automation/core/state.ts';
import { prepareUrl, linkPayload } from '../automation/core/metadata.ts';
import { publicHttp } from '../automation/core/http.ts';
import { handleUpdate } from '../automation/telegram/handler.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const evidence = join(root, 'output/regression-001');

test(
  'independent local D1 acceptance challenges',
  { timeout: 120_000 },
  async (t) => {
    for (const key of Object.keys(process.env))
      if (/^(CLOUDFLARE_|CF_)/.test(key)) delete process.env[key];
    const dir = await mkdtemp(join(tmpdir(), 'waagd-regression-'));
    await mkdir(evidence, { recursive: true });
    const config = join(dir, 'wrangler.json');
    const persist = join(dir, 'd1');
    const token = `regression-only-${randomUUID()}`;
    process.env.XDG_CONFIG_HOME = join(dir, 'config');
    process.env.WRANGLER_LOG_PATH = join(dir, 'logs');
    process.env.WRANGLER_SEND_METRICS = 'false';
    process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = 'false';
    await writeFile(
      config,
      JSON.stringify({
        name: 'waagd-regression-isolated',
        main: join(root, 'worker/index.ts'),
        compatibility_date: '2026-10-12',
        workers_dev: false,
        assets: {
          directory: join(root, 'dist'),
          binding: 'ASSETS',
          run_worker_first: ['/api', '/api/*'],
        },
        d1_databases: [
          {
            binding: 'DB',
            database_name: 'regression-local',
            database_id: '00000000-0000-0000-0000-000000000000',
            migrations_dir: join(root, 'db/migrations'),
            remote: false,
          },
        ],
        vars: { API_WRITE_TOKEN: token },
      }),
    );
    let server, proxy;
    try {
      execFileSync(
        process.execPath,
        [
          join(root, 'node_modules/wrangler/bin/wrangler.js'),
          'd1',
          'migrations',
          'apply',
          'DB',
          '--local',
          '--persist-to',
          persist,
          '--config',
          config,
        ],
        { env: { ...process.env, CI: 'true' }, stdio: 'pipe' },
      );
      const { unstable_dev, getPlatformProxy } = await import('wrangler');
      proxy = await getPlatformProxy({
        configPath: config,
        persist: { path: join(persist, 'v3') },
        remoteBindings: false,
        envFiles: [],
      });
      server = await unstable_dev(join(root, 'worker/index.ts'), {
        config,
        local: true,
        persist: true,
        persistTo: persist,
        ip: '127.0.0.1',
        port: 0,
        inspectorPort: 0,
        envFiles: [],
        logLevel: 'error',
        experimental: {
          disableExperimentalWarning: true,
          disableDevRegistry: true,
          watch: false,
        },
      });
      const base = `http://${server.address}:${server.port}`;
      await writeFile(
        join(evidence, 'runtime.json'),
        JSON.stringify({ base, local: true, remoteBindings: false }, null, 2),
      );
      const api = new Api(base, token, fetch, async () => {});
      const db = proxy.env.DB;
      const reset = () => db.prepare('DELETE FROM posts').run();
      const update = (url) => ({
        message: {
          from: { id: 123 },
          chat: { id: 123, type: 'private' },
          text: url,
        },
      });

      await t.test(
        'D01 original absence has no D1 row or saved payload; metadata-free original publishes',
        async () => {
          const state = new State(join(dir, 'd01'));
          const publisher = new Publisher(api, state);
          for (const status of [404, 410]) {
            const reply = await handleUpdate(
              update(`https://example.com/${status}`),
              new Set(['123']),
              publisher,
              async () => new Response('', { status }),
            );
            assert.match(
              reply.text,
              new RegExp(
                `Original publication is missing \\(HTTP ${status}\\)`,
              ),
            );
            assert.match(reply.text, /No publication payload was saved/);
            assert.equal((await api.posts()).length, 0);
            assert.equal(
              (await state.names()).filter((n) => n.startsWith('outgoing-'))
                .length,
              0,
            );
          }
          assert.match(
            (
              await handleUpdate(
                update('https://example.com/available'),
                new Set(['123']),
                publisher,
                async () =>
                  new Response('', {
                    headers: { 'content-type': 'text/html' },
                  }),
              )
            ).text,
            /^PUBLISHED/,
          );
          assert.equal((await api.posts())[0].title, 'example.com');
        },
      );
      await reset();

      if (process.env.WAAGD_BROWSER_TESTS === '1') {
        await t.test(
          'independent Chromium supported providers and CSP enforcement',
          async () => {
            const ids = {};
            for (const [provider, url] of [
              ['youtube', 'https://youtu.be/abcdefghijk'],
              [
                'tiktok',
                'https://www.tiktok.com/@regression/video/6718335390845095173',
              ],
              ['instagram', 'https://www.instagram.com/reel/abcde12345/'],
              [
                'reddit',
                'https://www.reddit.com/r/test/comments/abc123/title/',
              ],
            ]) {
              const payload = linkPayload(
                url,
                `Independent ${provider}`,
                provider === 'reddit' ? 'Reddit' : provider,
                'telegram',
              );
              ids[provider] = (await api.publish(payload)).post.id;
            }
            const result = execFileSync(
              process.execPath,
              [
                join(root, 'tests/regression-001.browser.mjs'),
                JSON.stringify({ base, ids }),
              ],
              { cwd: root, encoding: 'utf8', maxBuffer: 2_000_000 },
            );
            console.log(result.trim());
            await writeFile(join(evidence, 'independent-browser.log'), result);
          },
        );
        await reset();
      }

      await t.test(
        'D02 acceptance: vt, vm and canonical URL of one video must yield one feed entry',
        async (s) => {
          const final =
            'https://www.tiktok.com/@regression/video/6718335390845095173';
          const urls = [
            'https://vt.tiktok.com/regression001/',
            'https://vm.tiktok.com/regression001/',
            final,
          ];
          const connections = [];
          s.mock.method(dns, 'lookup', async () => [
            { address: '8.8.8.8', family: 4 },
          ]);
          s.mock.method(https, 'request', (url, options, callback) => {
            connections.push(url.toString());
            assert.equal(options.family, 4);
            const req = new EventEmitter();
            req.end = () =>
              queueMicrotask(() => {
                const res = new EventEmitter();
                res.statusCode = url.toString() === final ? 200 : 302;
                res.headers = {
                  'content-type': 'text/html',
                  ...(res.statusCode === 302 ? { location: final } : {}),
                };
                res.destroy = () => {};
                callback(res);
                res.emit(
                  'data',
                  Buffer.from('<title>Same TikTok video</title>'),
                );
                res.emit('end');
              });
            return req;
          });
          syncBuiltinESMExports();
          s.after(() => {
            s.mock.restoreAll();
            syncBuiltinESMExports();
          });
          const publisher = new Publisher(
            api,
            new State(join(dir, 'cross-url')),
          );
          const replies = [];
          for (const url of urls) {
            const prepared = await prepareUrl(url);
            assert.equal(prepared.url, url);
            assert.equal(prepared.type, 'video');
            assert.equal(prepared.embed.id, '6718335390845095173');
            replies.push(
              await handleUpdate(update(url), new Set(['123']), publisher),
            );
          }
          const posts = await api.posts();
          const rows = await db
            .prepare(
              'SELECT id,url,canonical_url,source,source_item_id,embed FROM posts ORDER BY url',
            )
            .all();
          await writeFile(
            join(evidence, 'cross-url.json'),
            JSON.stringify(
              {
                urls,
                replies,
                connections,
                feedCount: posts.length,
                rows: rows.results,
              },
              null,
              2,
            ),
          );
          assert.equal(
            posts.length,
            1,
            'same underlying video must not create multiple feed entries',
          );
        },
      );
      await reset();

      await t.test(
        'D05 every temporary status and network failure recovers committed writes without duplicates',
        async () => {
          const results = [];
          for (const status of [408, 429, 500, 502, 503, 504, 0]) {
            await reset();
            let failed = true,
              calls = 0;
            const state = new State(join(dir, `retry-${status}`));
            const publisher = new Publisher(
              new Api(
                base,
                token,
                async (url, init) => {
                  calls++;
                  const response = await fetch(url, init);
                  if (!failed) return response;
                  await response.body.cancel();
                  if (!status)
                    throw new Error('simulated response loss after commit');
                  return new Response('', {
                    status,
                    headers: { 'retry-after': '0' },
                  });
                },
                async () => {},
              ),
              state,
            );
            const payload = linkPayload(
              `https://example.com/retry-${status}`,
              'Committed then lost',
              'Regression',
              'telegram',
            );
            await assert.rejects(publisher.submit(payload));
            assert.equal(calls, 3);
            assert.equal((await api.posts()).length, 1);
            const name = `outgoing-${payloadKey(payload)}.json`;
            const saved = await state.read(name);
            assert.deepEqual(saved.payload, payload);
            assert.equal(saved.last_status, status);
            failed = false;
            const replay = await new Publisher(
              new Api(base, token),
              new State(state.dir),
            ).replay();
            assert.deepEqual(replay, { sent: 1, failed: 0 });
            assert.equal((await api.posts()).length, 1);
            assert.equal(await state.read(name), null);
            results.push({
              status,
              immediateAttempts: 3,
              rowsBeforeReplay: 1,
              rowsAfterReplay: 1,
              replay,
            });
          }
          await writeFile(
            join(evidence, 'retry-commit.json'),
            JSON.stringify(results, null, 2),
          );
        },
      );
    } finally {
      await server?.stop();
      await proxy?.dispose();
      await rm(dir, { recursive: true, force: true });
    }
  },
);

test('SEC-003 late DNS completion and successive redirects obey one deadline', async (t) => {
  await mkdir(evidence, { recursive: true });
  let sockets = 0,
    resolveDns;
  t.mock.method(
    dns,
    'lookup',
    () =>
      new Promise((resolve) => {
        resolveDns = resolve;
      }),
  );
  t.mock.method(https, 'request', () => {
    sockets++;
    throw new Error('must not connect');
  });
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  const controller = new AbortController();
  const start = Date.now();
  const pending = publicHttp('https://example.com/delayed', {
    signal: controller.signal,
  });
  setTimeout(() => controller.abort(new Error('independent deadline')), 25);
  await assert.rejects(pending, /independent deadline/);
  resolveDns([{ address: '8.8.8.8', family: 4 }]);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(sockets, 0);
  const lateLookupMs = Date.now() - start;
  t.mock.restoreAll();
  const hosts = [];
  t.mock.method(dns, 'lookup', async (host) => {
    hosts.push(host);
    await new Promise((resolve) => setTimeout(resolve, 20));
    return [{ address: '8.8.8.8', family: 4 }];
  });
  t.mock.method(https, 'request', (url, options, callback) => {
    sockets++;
    const req = new EventEmitter();
    req.end = () =>
      queueMicrotask(() => {
        const res = new EventEmitter();
        res.statusCode = 302;
        res.headers = {
          location: 'https://redirect.example.com/next',
          'content-type': 'text/html',
        };
        res.destroy = () => {};
        callback(res);
        res.emit('end');
      });
    return req;
  });
  syncBuiltinESMExports();
  const redirectStart = Date.now();
  await assert.rejects(
    publicHttp('https://example.com/start', {
      signal: AbortSignal.timeout(30),
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(
    sockets,
    1,
    'no second connection after total redirect deadline',
  );
  await writeFile(
    join(evidence, 'deadline.json'),
    JSON.stringify(
      {
        lateLookupMs,
        socketsAfterLateLookup: 0,
        redirectElapsedMs: Date.now() - redirectStart,
        redirectSockets: sockets,
        hosts,
      },
      null,
      2,
    ),
  );
});

test('D04 atomic replacement remains readable and unrelated permissions stay unchanged', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'waagd-regression-state-'));
  try {
    const unrelated = join(dir, 'unrelated');
    await mkdir(unrelated, { mode: 0o755 });
    const before = (await stat(unrelated)).mode;
    await assert.rejects(new State(unrelated).write('record.json', {}), /0700/);
    assert.equal((await stat(unrelated)).mode, before);
    const state = new State(join(dir, 'private'));
    await state.write('record.json', { version: 0 });
    const original = (await stat(join(state.dir, 'record.json'))).ino;
    for (let version = 1; version <= 20; version++) {
      await state.write('record.json', { version });
      assert.deepEqual(await new State(state.dir).read('record.json'), {
        version,
      });
      assert.equal(
        (await stat(join(state.dir, 'record.json'))).mode & 0o777,
        0o600,
      );
    }
    assert.notEqual((await stat(join(state.dir, 'record.json'))).ino, original);
    assert.deepEqual(await state.names(), ['record.json']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
