import {
  mkdir,
  open,
  lstat,
  realpath,
  rename,
  readdir,
  unlink,
  rmdir,
} from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, isAbsolute, parse, resolve } from 'node:path';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import type {
  CreatePostInput,
  CreatePostResult,
} from '../../shared/contracts.ts';
import { validateCreatePostInput } from '../../shared/contracts.ts';
import {
  contentHashForPublicationIntent,
  mapPublicationIntent,
  publicationSemanticIdentity,
  validatePublicationIntent,
} from './intent.ts';
import type { PublicationIntent } from './intent.ts';
import { parsePost, record } from './api.ts';
import type { Api } from './api.ts';
import { RequestFailure } from './http.ts';

export class StateError extends Error {}
export class State {
  dir: string;
  constructor(dir: string) {
    if (!isAbsolute(dir))
      throw new StateError('State directory must be an absolute private path.');
    this.dir = dir;
  }
  /** Check every component before creating anything; never repair arbitrary folders. */
  async ensure(): Promise<void> {
    const absolute = resolve(this.dir);
    let current = parse(absolute).root;
    for (const part of absolute
      .slice(current.length)
      .split('/')
      .filter(Boolean)) {
      current = join(current, part);
      let info;
      try {
        info = await lstat(current);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        await mkdir(current, { mode: 0o700 }).catch(
          (failure: NodeJS.ErrnoException) => {
            if (failure.code !== 'EEXIST') throw failure;
          },
        );
        info = await lstat(current);
      }
      // macOS provides these root aliases; user-created symlinks are never accepted.
      const systemAlias =
        process.platform === 'darwin' &&
        ['/var', '/tmp', '/etc'].includes(current) &&
        info.isSymbolicLink() &&
        (await realpath(current)) === `/private${current}`;
      if (
        (!info.isDirectory() && !systemAlias) ||
        (info.isSymbolicLink() && !systemAlias)
      )
        throw new StateError(
          `Unsafe state path: ${current}. Use a real private directory without symlinks.`,
        );
    }
    const info = await lstat(absolute);
    if (info.uid !== process.getuid?.() || (info.mode & 0o7777) !== 0o700)
      throw new StateError(
        `Unsafe state directory: ${absolute}. Require ownership by the current user and mode 0700; review this dedicated folder before correcting it.`,
      );
  }
  path(name: string): string {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name))
      throw new StateError('Invalid state filename.');
    return join(this.dir, name);
  }
  privateFile(info: {
    isFile(): boolean;
    uid: number;
    mode: number;
    nlink: number;
  }): void {
    if (
      !info.isFile() ||
      info.uid !== process.getuid?.() ||
      (info.mode & 0o7777) !== 0o600 ||
      info.nlink !== 1
    )
      throw new StateError(
        'Unsafe state file. Require a regular file owned by the current user with mode 0600 and no links.',
      );
  }
  async checkFile(name: string): Promise<void> {
    try {
      this.privateFile(await lstat(this.path(name)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  async names(): Promise<string[]> {
    await this.ensure();
    return readdir(this.dir);
  }
  async read(name: string): Promise<unknown> {
    await this.ensure();
    await this.checkFile(name);
    try {
      const file = await open(
        this.path(name),
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
      try {
        this.privateFile(await file.stat());
        return JSON.parse(await file.readFile('utf8')) as unknown;
      } finally {
        await file.close();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
  async write(name: string, value: unknown): Promise<void> {
    await this.ensure();
    await this.checkFile(name);
    const temporary = this.path(`${name}.${randomUUID()}.tmp`);
    const file = await open(
      temporary,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await file.writeFile(JSON.stringify(value));
      await file.close();
      await this.ensure();
      await this.checkFile(name);
      await rename(temporary, this.path(name));
    } finally {
      await file.close();
      await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
  }
  async remove(name: string): Promise<void> {
    await this.ensure();
    await this.checkFile(name);
    await unlink(this.path(name)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
  async locked<T>(name: string, action: () => Promise<T>): Promise<T> {
    await this.ensure();
    const lock = this.path(`${name}.lock`);
    try {
      await mkdir(lock, { mode: 0o700 });
    } catch {
      throw new Error(
        `Another ${name} run is active, or a stale lock needs review.`,
      );
    }
    try {
      return await action();
    } finally {
      await rmdir(lock);
    }
  }
}
export function payloadKey(payload: CreatePostInput): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
export class Publisher {
  api: Api;
  state: State;
  private readonly discoveryIngressToken: string | null;
  constructor(
    api: Api,
    state: State,
    options: { discoveryIngressToken?: string } = {},
  ) {
    this.api = api;
    this.state = state;
    this.discoveryIngressToken = options.discoveryIngressToken?.trim() || null;
  }
  private async publicationPolicy(): Promise<{
    auto_paused: boolean;
    telegram_paused: boolean;
  }> {
    const saved = await this.state.read('publication-policy.json');
    // Fail closed: automatic publication needs one explicit operator resume.
    if (saved === null) return { auto_paused: true, telegram_paused: false };
    const value = record(saved);
    if (
      Object.keys(value).some(
        (key) => key !== 'auto_paused' && key !== 'telegram_paused',
      ) ||
      typeof value.auto_paused !== 'boolean' ||
      typeof value.telegram_paused !== 'boolean'
    )
      throw new StateError('Invalid publication policy state.');
    return {
      auto_paused: value.auto_paused,
      telegram_paused: value.telegram_paused,
    };
  }
  async isPaused(origin: 'auto' | 'telegram'): Promise<boolean> {
    const policy = await this.publicationPolicy();
    return origin === 'auto' ? policy.auto_paused : policy.telegram_paused;
  }
  async setPaused(origin: 'auto' | 'telegram', paused: boolean): Promise<void> {
    await this.state.locked('publication-policy', async () => {
      const policy = await this.publicationPolicy();
      await this.state.write('publication-policy.json', {
        ...policy,
        ...(origin === 'auto'
          ? { auto_paused: paused }
          : { telegram_paused: paused }),
      });
    });
  }
  /** Discovery has a separate ingress token, never the website write token. */
  async submitDiscoveryIntent(
    intent: PublicationIntent,
    ingressToken: string,
  ): Promise<CreatePostResult> {
    if (
      !this.discoveryIngressToken ||
      ingressToken.length !== this.discoveryIngressToken.length ||
      !timingSafeEqual(
        Buffer.from(ingressToken),
        Buffer.from(this.discoveryIngressToken),
      )
    )
      throw new Error('Untrusted Discovery ingress.');
    return this.submitTrustedIntent(intent, 'auto');
  }
  /** Called only after TelegramSubmissionAdapter has checked a private owner event. */
  async submitTelegramIntent(
    intent: PublicationIntent,
  ): Promise<CreatePostResult> {
    return this.submitTrustedIntent(intent, 'telegram');
  }
  private async submitTrustedIntent(
    intent: PublicationIntent,
    expectedOrigin: 'auto' | 'telegram',
  ): Promise<CreatePostResult> {
    const checked = validatePublicationIntent(intent);
    if (!checked.valid) throw new Error('Invalid publication intent.');
    if (checked.value.origin !== expectedOrigin)
      throw new Error('Publication ingress origin mismatch.');
    if (await this.isPaused(checked.value.origin))
      throw new Error(
        checked.value.origin === 'auto'
          ? 'Automatic publication is paused.'
          : 'Telegram publication is paused.',
      );
    const receiptName = `receipt-${checked.value.intent_id}.json`;
    const contentHash = contentHashForPublicationIntent({
      version: checked.value.version,
      intent_id: checked.value.intent_id,
      origin: checked.value.origin,
      authorization: checked.value.authorization,
      editorial: checked.value.editorial,
      post: checked.value.post,
    });
    const identity = publicationSemanticIdentity(checked.value);
    return this.state.locked(`intent-${checked.value.intent_id}`, async () => {
      const prior = await this.state.read(receiptName);
      if (prior !== null) {
        const saved = record(prior);
        if (
          saved.intent_id !== checked.value.intent_id ||
          saved.origin !== checked.value.origin ||
          saved.content_hash !== contentHash ||
          saved.semantic_identity !== identity
        )
          throw new StateError(
            'Publication intent conflict: intent_id was already accepted with different content or identity.',
          );
        if (saved.result !== undefined) {
          const result = record(saved.result);
          const post = parsePost(result.post);
          if (result.outcome === 'created') return { outcome: 'created', post };
          if (
            result.outcome === 'duplicate' &&
            (result.matched_by === 'canonical_url' ||
              result.matched_by === 'source_item_id')
          )
            return {
              outcome: 'duplicate',
              matched_by: result.matched_by,
              post,
            };
          throw new StateError('Invalid completed publication receipt.');
        }
      }
      const payload = mapPublicationIntent(checked.value);
      await this.state.write(receiptName, {
        intent_id: checked.value.intent_id,
        origin: checked.value.origin,
        content_hash: contentHash,
        semantic_identity: identity,
        status: 'accepted',
        accepted_at: new Date().toISOString(),
      });
      try {
        const result = await this.submit(payload, {
          origin: checked.value.origin,
          intent_id: checked.value.intent_id,
          content_hash: contentHash,
          semantic_identity: identity,
        });
        await this.state.write(receiptName, {
          intent_id: checked.value.intent_id,
          origin: checked.value.origin,
          content_hash: contentHash,
          semantic_identity: identity,
          status: 'published',
          published_at: new Date().toISOString(),
          result,
        });
        return result;
      } catch (error) {
        const queued =
          (await this.state.read(`outgoing-${payloadKey(payload)}.json`)) !==
          null;
        await this.state.write(receiptName, {
          intent_id: checked.value.intent_id,
          origin: checked.value.origin,
          content_hash: contentHash,
          semantic_identity: identity,
          status: queued ? 'queued' : 'failed',
          updated_at: new Date().toISOString(),
          failure:
            error instanceof RequestFailure
              ? `HTTP_${error.status}`
              : 'UNKNOWN',
        });
        throw error;
      }
    });
  }
  private async markReplayReceipt(
    provenance: {
      origin: 'auto' | 'telegram';
      intent_id?: string;
      content_hash?: string;
      semantic_identity?: string;
    },
    result: CreatePostResult,
  ): Promise<void> {
    if (
      !provenance.intent_id ||
      !provenance.content_hash ||
      !provenance.semantic_identity
    )
      return;
    const receiptName = `receipt-${provenance.intent_id}.json`;
    const receipt = await this.state.read(receiptName);
    if (receipt === null) return;
    const saved = record(receipt);
    if (
      saved.intent_id !== provenance.intent_id ||
      saved.origin !== provenance.origin ||
      saved.content_hash !== provenance.content_hash ||
      saved.semantic_identity !== provenance.semantic_identity
    )
      throw new StateError(
        'Replay receipt conflict: queued payload does not match its accepted intent.',
      );
    await this.state.write(receiptName, {
      intent_id: provenance.intent_id,
      origin: provenance.origin,
      content_hash: provenance.content_hash,
      semantic_identity: provenance.semantic_identity,
      status: 'published',
      published_at: new Date().toISOString(),
      result,
    });
  }
  async submit(
    payload: CreatePostInput,
    provenance: {
      origin: 'auto' | 'telegram';
      intent_id?: string;
      content_hash?: string;
      semantic_identity?: string;
    } = { origin: payload.origin },
  ): Promise<CreatePostResult> {
    return this.state.locked(`outgoing-${payloadKey(payload)}`, async () => {
      const name = `outgoing-${payloadKey(payload)}.json`;
      if (!validateCreatePostInput(payload).valid)
        throw new Error('Invalid payload.');
      if (payload.origin === 'auto' && (await this.isPaused('auto')))
        throw new Error('Automatic publication is paused.');
      const prior = await this.state.read(name);
      const saved = prior === null ? {} : record(prior);
      if (
        typeof saved.next_attempt_at === 'number' &&
        saved.next_attempt_at > Date.now()
      )
        throw new RequestFailure(429, true, saved.next_attempt_at);
      const attempts = Number(saved.attempts ?? 0) + 1;
      if (attempts > 10)
        throw new Error(
          'Outgoing retry limit reached; manual review required.',
        );
      await this.state.write(name, {
        payload,
        provenance,
        saved_at: new Date().toISOString(),
        attempts,
      });
      try {
        const result = await this.api.publish(payload);
        await this.state.write(`processed-${payloadKey(payload)}.json`, {
          id: result.post.id,
          payload,
        });
        await this.state.remove(name);
        return result;
      } catch (error) {
        if (error instanceof RequestFailure && !error.retryable)
          await this.state.remove(name);
        else if (error instanceof RequestFailure)
          await this.state.write(name, {
            payload,
            provenance,
            saved_at: new Date().toISOString(),
            attempts,
            last_status: error.status,
            next_attempt_at: error.retryAt ?? Date.now(),
          });
        throw error;
      }
    });
  }
  async processed(): Promise<CreatePostInput[]> {
    const result: CreatePostInput[] = [];
    for (const name of await this.state.names())
      if (/^processed-[a-f0-9]+\.json$/.test(name)) {
        const input = validateCreatePostInput(
          record(await this.state.read(name)).payload,
        );
        if (input.valid) result.push(input.value);
      }
    return result;
  }
  async replay(): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;
    let attempted = 0;
    for (const name of (await this.state.names()).filter((n) =>
      /^outgoing-[a-f0-9]+\.json$/.test(n),
    )) {
      if (attempted >= 50) break;
      try {
        const saved = record(await this.state.read(name));
        if (
          Number(saved.attempts ?? 0) >= 10 ||
          (typeof saved.next_attempt_at === 'number' &&
            saved.next_attempt_at > Date.now())
        )
          continue;
        const payload = validateCreatePostInput(saved.payload);
        if (!payload.valid) throw new Error('Invalid saved payload.');
        if (payload.value.origin === 'auto' && (await this.isPaused('auto')))
          continue;
        // Monthly retries recheck current visible references through runChangelog.
        if (payload.value.type === 'changelog') continue;
        attempted++;
        const provenance = record(saved.provenance);
        const replayProvenance: {
          origin: 'auto' | 'telegram';
          intent_id?: string;
          content_hash?: string;
          semantic_identity?: string;
        } = {
          origin: provenance.origin === 'telegram' ? 'telegram' : 'auto',
          ...(typeof provenance.intent_id === 'string'
            ? { intent_id: provenance.intent_id }
            : {}),
          ...(typeof provenance.content_hash === 'string'
            ? { content_hash: provenance.content_hash }
            : {}),
          ...(typeof provenance.semantic_identity === 'string'
            ? { semantic_identity: provenance.semantic_identity }
            : {}),
        };
        const result = await this.submit(payload.value, replayProvenance);
        await this.markReplayReceipt(replayProvenance, result);
        sent++;
      } catch {
        failed++;
      }
    }
    return { sent, failed };
  }
}
