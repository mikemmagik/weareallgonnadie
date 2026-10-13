import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const evidence = join(root, 'output/release-qa');
const videoA = '6718335390845095173';
const videoB = '7420000000000000001';
const canonical = (id) => `https://www.tiktok.com/@releaseqa/video/${id}`;
const payload = {
  type: 'video',
  origin: 'telegram',
  url: canonical(videoA),
  canonical_url: null,
  source_item_id: null,
  title: 'Independent release QA',
  source: 'TikTok',
  preview: null,
  embed: null,
  body: null,
  references: [],
};

test(
  'RELEASE-QA independent legacy identity acceptance and optional live Reddit',
  { timeout: 180_000 },
  async (t) => {
    for (const key of Object.keys(process.env))
      if (/^(CLOUDFLARE_|CF_)/.test(key)) delete process.env[key];
    process.env.WRANGLER_SEND_METRICS = 'false';
    const directory = await mkdtemp(join(tmpdir(), 'waagd-release-qa-'));
    process.env.XDG_CONFIG_HOME = join(directory, 'config');
    process.env.WRANGLER_LOG_PATH = join(directory, 'logs');
    const persist = join(directory, 'state');
    const config = join(directory, 'wrangler.json');
    await mkdir(evidence, { recursive: true });
    await writeFile(
      config,
      JSON.stringify({
        name: 'waagd-release-qa-local',
        main: join(root, 'worker/index.ts'),
        compatibility_date: '2026-10-12',
        workers_dev: false,
        assets: {
          directory: join(root, 'dist'),
          binding: 'ASSETS',
          run_worker_first: ['/api', '/api/*', '/embed/reddit'],
        },
        d1_databases: [
          {
            binding: 'DB',
            database_name: 'waagd-local',
            database_id: '00000000-0000-0000-0000-000000000000',
            migrations_dir: join(root, 'db/migrations'),
            remote: false,
          },
        ],
        vars: { API_WRITE_TOKEN: 'release-qa-temporary-only' },
      }),
    );
    const { getPlatformProxy, unstable_dev } = await import('wrangler');
    let proxy;
    let server;
    const results = [];
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
        { cwd: root, env: { ...process.env, CI: 'true' }, encoding: 'utf8' },
      );
      proxy = await getPlatformProxy({
        configPath: config,
        persist: { path: join(persist, 'v3') },
        remoteBindings: false,
        envFiles: [],
      });
      const db = proxy.env.DB;
      server = await unstable_dev(join(root, 'worker/index.ts'), {
        config,
        local: true,
        persist: true,
        persistTo: persist,
        ip: '127.0.0.1',
        port: 0,
        inspectorPort: 0,
        logLevel: 'error',
        envFiles: [],
        experimental: {
          disableExperimentalWarning: true,
          disableDevRegistry: true,
          watch: false,
        },
      });
      const base = `http://${server.address}:${server.port}`;
      const create = async (input) => {
        const response = await fetch(`${base}/api/posts`, {
          method: 'POST',
          headers: {
            Authorization: 'Bearer release-qa-temporary-only',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(input),
        });
        return { status: response.status, body: await response.json() };
      };
      const seed = async ({
        source = 'www.tiktok.com',
        sourceId = null,
        original = canonical(videoA),
        embed = null,
      }) => {
        await db.prepare('DELETE FROM posts').run();
        const id = crypto.randomUUID();
        await db
          .prepare(
            'INSERT INTO posts (id,type,url,canonical_url,source_item_id,title,source,origin,preview,embed,body,"references",published_at,deleted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
          )
          .bind(
            id,
            'video',
            original,
            original,
            sourceId,
            'Legacy independent fixture',
            source,
            'telegram',
            null,
            embed ? JSON.stringify(embed) : null,
            null,
            '[]',
            new Date().toISOString(),
            null,
          )
          .run();
        return id;
      };
      const cases = [
        {
          name: 'consistent legacy canonical original returns unchanged duplicate',
          seed: {},
          expected: 200,
        },
        {
          name: 'legacy canonical A with embed B rejects contradictory identity',
          seed: {
            embed: {
              kind: 'provider',
              provider: 'tiktok',
              id: videoB,
              url: canonical(videoB),
            },
          },
          expected: 400,
        },
        {
          name: 'legacy canonical A with TikTok source_item_id B rejects contradictory identity',
          seed: { source: 'TikTok', sourceId: videoB },
          expected: 400,
        },
        {
          name: 'legacy canonical A with internally inconsistent embed rejects contradictory identity',
          seed: {
            embed: {
              kind: 'provider',
              provider: 'tiktok',
              id: videoA,
              url: canonical(videoB),
            },
          },
          expected: 400,
        },
      ];
      for (const scenario of cases)
        await t.test(scenario.name, async () => {
          const id = await seed(scenario.seed);
          const before = await db
            .prepare('SELECT * FROM posts WHERE id = ?')
            .bind(id)
            .first();
          const actual = await create(payload);
          const after = await db
            .prepare('SELECT * FROM posts WHERE id = ?')
            .bind(id)
            .first();
          const count = await db
            .prepare('SELECT COUNT(*) AS n FROM posts')
            .first('n');
          results.push({
            name: scenario.name,
            expected: scenario.expected,
            actual,
            count,
            before,
            after,
          });
          assert.equal(count, 1, 'No extra publication');
          assert.deepEqual(after, before, 'Legacy row immutable');
          assert.equal(
            actual.status,
            scenario.expected,
            'Contradictory legacy identities must fail closed',
          );
        });
      if (process.env.WAAGD_LIVE_REDDIT === '1')
        await t.test(
          'two real public Reddit posts: record provider outcomes independently of acceptance failures',
          async () => {
            await db.prepare('DELETE FROM posts').run();
            const posts = [
              {
                type: 'meme',
                url: 'https://www.reddit.com/r/aww/comments/crpjwk/every_year_this_mama_duck_brings_her_babies_to_my/',
                title:
                  'Public media example from Reddit embedding documentation',
                id: 'crpjwk',
                expectedType: 'media post',
              },
              {
                type: 'news',
                url: 'https://www.reddit.com/r/IAmA/comments/z1c9z/i_am_barack_obama_president_of_the_united_states/',
                title: 'Public text AMA',
                id: 'z1c9z',
                expectedType: 'text post',
              },
            ];
            for (const post of posts) {
              const created = await create({
                ...payload,
                type: post.type,
                url: post.url,
                title: post.title,
                source: 'Reddit',
                source_item_id: post.id,
                embed: {
                  kind: 'provider',
                  provider: 'reddit',
                  id: post.id,
                  url: post.url,
                },
              });
              assert.equal(created.status, 201);
              post.publicationId = created.body.data.post.id;
            }
            const output = execFileSync(
              process.execPath,
              [
                join(root, 'tests/release-qa.browser.mjs'),
                JSON.stringify({ base, posts }),
              ],
              {
                cwd: root,
                env: process.env,
                encoding: 'utf8',
                maxBuffer: 4_000_000,
              },
            );
            console.log(output);
          },
        );
    } finally {
      await writeFile(
        join(evidence, 'legacy-identities.json'),
        JSON.stringify(results, null, 2),
      );
      await server?.stop();
      await proxy?.dispose();
      await rm(directory, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
    }
  },
);
