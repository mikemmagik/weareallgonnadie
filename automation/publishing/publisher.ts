import { createHash, randomUUID } from 'node:crypto';
import {
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import {
  CONTENT_LIMITS,
  normalizePublicationUrl,
  validateCreatePostInput,
} from '../../shared/contracts.ts';
import type { CreatePostInput, Post } from '../../shared/contracts.ts';
import { parsePost, record, UUID } from '../core/api.ts';
import type { Api } from '../core/api.ts';
import type { State } from '../core/state.ts';

export type PublicationMode = 'verified_auto' | 'owner_command';

/** Construct only in a trusted process; no field in this object grants authority. */
export interface PublicationProvenance {
  origin: 'waagd-discovery';
  deliveryId: string;
  verificationStatus: 'VERIFIED';
  editorialStatus: 'READY_FOR_REVIEW';
  publisher: string;
  publishedAtSource: string;
  risks: Array<{ code: string; severity: 'low' | 'medium' }>;
  publicationPolicyVersion: string;
}

export interface PublicationIntent {
  identity: string;
  mode: PublicationMode;
  candidateKey: string;
  decisionRevision: number;
  evidenceIds: string[];
  sourceUrl: string | null;
  contentDigest: string;
  payload: CreatePostInput;
  /** Persisted audit metadata for data-only Discovery hand-offs. */
  provenance?: PublicationProvenance;
}

export interface PublicationReceipt {
  identity: string;
  outcome: 'created' | 'duplicate';
  postId: string;
  url: string | null;
  visible: boolean;
  reconciled: boolean;
}

export interface PublicationLimits {
  requestsPerCycle: number;
  requestsPerDay: number;
  maxPostAttempts: number;
  reconcilePages: number;
}

export interface JournalPublisherOptions {
  api: Api;
  state: State;
  /** Must consult trusted editorial state or authenticated owner-command state. */
  authorize: (intent: PublicationIntent) => Promise<boolean>;
  /** Operator-owned switch. Absence is off; untrusted content cannot select it. */
  enabled?: () => boolean | Promise<boolean>;
  limits?: Partial<PublicationLimits>;
  now?: () => Date;
}

export class PublicationError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(`Publication held: ${code}.`);
    this.code = code;
  }
}

interface Journal {
  version: 1;
  intent: PublicationIntent;
  attempts: number;
  status: 'pending' | 'uncertain' | 'held' | 'published';
  nextAttemptAt: number;
  receipt: PublicationReceipt | null;
}

const DEFAULT_LIMITS: PublicationLimits = {
  requestsPerCycle: 20,
  requestsPerDay: 100,
  maxPostAttempts: 5,
  reconcilePages: 5,
};
const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);
const SHA256 = /^[a-f0-9]{64}$/;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const data = value as Record<string, unknown>;
    return `{${Object.keys(data)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(data[key])}`)
      .join(',')}}`;
  }
  if (value === undefined) throw new PublicationError('undefined_content');
  if (
    typeof value === 'string' &&
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
      value,
    )
  )
    throw new PublicationError('invalid_unicode');
  if (typeof value === 'number' && !Number.isFinite(value))
    throw new PublicationError('nonfinite_content');
  return JSON.stringify(value);
}

/**
 * Cross-language JSON: sort every object's ASCII schema keys, retain array order,
 * use compact JSON with UTF-8 Unicode (no ASCII escaping), then SHA-256 the bytes.
 * Python equivalent: json.dumps(value, sort_keys=True, ensure_ascii=False,
 * separators=(',', ':'), allow_nan=False).encode('utf-8').
 */
export function canonicalPayloadJson(payload: CreatePostInput): string {
  if (!validateCreatePostInput(payload).valid)
    throw new PublicationError('invalid_payload');
  return canonical(payload);
}

export function digestPayload(payload: CreatePostInput): string {
  return createHash('sha256')
    .update(canonicalPayloadJson(payload), 'utf8')
    .digest('hex');
}

export function stableSourceItemId(identity: string): string {
  return `waagd:${createHash('sha256').update(identity).digest('hex')}`;
}

function checkProvenance(value: PublicationProvenance | undefined): boolean {
  if (value === undefined) return true;
  return (
    value.origin === 'waagd-discovery' &&
    UUID.test(value.deliveryId) &&
    value.verificationStatus === 'VERIFIED' &&
    value.editorialStatus === 'READY_FOR_REVIEW' &&
    typeof value.publisher === 'string' &&
    value.publisher.length > 0 &&
    value.publisher.length <= 100 &&
    typeof value.publishedAtSource === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(
      value.publishedAtSource,
    ) &&
    Number.isFinite(new Date(value.publishedAtSource).getTime()) &&
    /^[A-Za-z0-9._:-]{1,128}$/.test(value.publicationPolicyVersion) &&
    Array.isArray(value.risks) &&
    value.risks.length <= 32 &&
    value.risks.every(
      (risk) =>
        risk &&
        typeof risk.code === 'string' &&
        risk.code.length > 0 &&
        risk.code.length <= 128 &&
        ['low', 'medium'].includes(risk.severity),
    ) &&
    new Set(value.risks.map((risk) => risk.code)).size === value.risks.length
  );
}

/** Delivery metadata is deliberately excluded: a redelivery is not new content. */
function samePublicationContent(
  left: PublicationIntent,
  right: PublicationIntent,
): boolean {
  return (
    left.identity === right.identity &&
    left.mode === right.mode &&
    left.candidateKey === right.candidateKey &&
    left.decisionRevision === right.decisionRevision &&
    canonical(left.evidenceIds) === canonical(right.evidenceIds) &&
    left.sourceUrl === right.sourceUrl &&
    left.contentDigest === right.contentDigest &&
    canonical(left.payload) === canonical(right.payload)
  );
}

function checkIntent(intent: PublicationIntent): void {
  if (
    !intent ||
    typeof intent.identity !== 'string' ||
    !/^[a-zA-Z0-9:_-]{1,256}$/.test(intent.identity) ||
    typeof intent.candidateKey !== 'string' ||
    !intent.candidateKey.trim() ||
    intent.candidateKey.length > 256 ||
    !Number.isSafeInteger(intent.decisionRevision) ||
    intent.decisionRevision < 1 ||
    !Array.isArray(intent.evidenceIds) ||
    intent.evidenceIds.length > 100 ||
    intent.evidenceIds.some(
      (id) => typeof id !== 'string' || !SHA256.test(id),
    ) ||
    !SHA256.test(intent.contentDigest) ||
    !checkProvenance(intent.provenance) ||
    !validateCreatePostInput(intent.payload).valid ||
    Buffer.byteLength(JSON.stringify(intent.payload), 'utf8') >
      CONTENT_LIMITS.request_bytes ||
    intent.contentDigest !== digestPayload(intent.payload) ||
    intent.sourceUrl !== intent.payload.url ||
    (intent.payload.url === null &&
      intent.payload.source_item_id !== stableSourceItemId(intent.identity))
  )
    throw new PublicationError('invalid_intent');
  if (intent.mode === 'verified_auto') {
    if (
      intent.identity !==
        `auto:${intent.candidateKey}:${intent.decisionRevision}` ||
      intent.payload.origin !== 'auto' ||
      intent.sourceUrl === null ||
      intent.evidenceIds.length === 0
    )
      throw new PublicationError('invalid_auto_identity');
  } else if (
    intent.mode !== 'owner_command' ||
    !/^telegram-[a-f0-9]{24}$/.test(intent.identity) ||
    intent.payload.origin !== 'telegram' ||
    intent.evidenceIds.length !== 0 ||
    (intent.sourceUrl === null && String(intent.payload.type) !== 'article')
  )
    throw new PublicationError('invalid_owner_identity');
}

function filename(identity: string): string {
  return `publication-${createHash('sha256').update(identity).digest('hex')}.json`;
}

function readJournal(value: unknown): Journal {
  const data = record(value);
  const intent = record(data.intent) as unknown as PublicationIntent;
  checkIntent(intent);
  if (
    data.version !== 1 ||
    !Number.isSafeInteger(data.attempts) ||
    (data.attempts as number) < 0 ||
    !['pending', 'uncertain', 'held', 'published'].includes(
      String(data.status),
    ) ||
    typeof data.nextAttemptAt !== 'number' ||
    !Number.isFinite(data.nextAttemptAt) ||
    !(data.receipt === null || typeof data.receipt === 'object') ||
    (data.status !== 'published' && data.receipt !== null)
  )
    throw new PublicationError('invalid_journal');
  const journal = data as unknown as Journal;
  if (journal.status === 'published') {
    const receipt = record(journal.receipt);
    if (
      receipt.identity !== intent.identity ||
      !['created', 'duplicate'].includes(String(receipt.outcome)) ||
      typeof receipt.postId !== 'string' ||
      !UUID.test(receipt.postId) ||
      !(receipt.url === null || typeof receipt.url === 'string') ||
      typeof receipt.visible !== 'boolean' ||
      typeof receipt.reconciled !== 'boolean' ||
      (receipt.url === null) !== !receipt.visible
    )
      throw new PublicationError('invalid_journal');
  }
  return journal;
}

/** Exactly one process may own the state lock. A dead process's lock is recoverable. */
async function withLock<T>(state: State, action: () => Promise<T>): Promise<T> {
  await state.ensure();
  const lock = state.path('publication-journal.lock');
  const owner = join(lock, 'owner.json');
  let acquired = false;
  for (let attempt = 0; attempt < 3 && !acquired; attempt++) {
    try {
      await mkdir(lock, { mode: 0o700 });
      acquired = true;
      await writeFile(owner, JSON.stringify({ pid: process.pid }), {
        flag: 'wx',
        mode: 0o600,
      });
    } catch (error) {
      if (acquired) {
        await rm(lock, { recursive: true, force: true });
        throw error;
      }
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const info = await lstat(lock);
      if (
        !info.isDirectory() ||
        info.uid !== process.getuid?.() ||
        (info.mode & 0o7777) !== 0o700
      )
        throw new PublicationError('unsafe_lock');
      let pid: number | null = null;
      try {
        const data = record(
          JSON.parse(await readFile(owner, 'utf8')) as unknown,
        );
        if (Number.isSafeInteger(data.pid) && (data.pid as number) > 0)
          pid = data.pid as number;
      } catch {
        // A just-created lock may not have its owner file yet.
      }
      if (pid !== null) {
        try {
          process.kill(pid, 0);
          throw new PublicationError('busy');
        } catch (failure) {
          if ((failure as NodeJS.ErrnoException).code !== 'ESRCH')
            throw failure;
        }
      } else if (Date.now() - info.mtimeMs < 120_000)
        throw new PublicationError('busy');
      const stale = state.path(`publication-stale-${randomUUID()}.lock`);
      try {
        await rename(lock, stale);
      } catch (failure) {
        if ((failure as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw failure;
      }
      await rm(stale, { recursive: true, force: true });
    }
  }
  if (!acquired) throw new PublicationError('busy');
  try {
    return await action();
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}

export class JournalPublisher {
  private readonly options: JournalPublisherOptions;
  private readonly limits: PublicationLimits;
  private readonly now: () => Date;
  private cycleRequests = 0;

  constructor(options: JournalPublisherOptions) {
    this.options = options;
    this.limits = { ...DEFAULT_LIMITS, ...options.limits };
    this.now = options.now ?? (() => new Date());
    if (
      Object.values(this.limits).some(
        (value) => !Number.isSafeInteger(value) || value < 1,
      )
    )
      throw new PublicationError('invalid_limits');
  }

  async publish(intent: PublicationIntent): Promise<PublicationReceipt> {
    checkIntent(intent);
    return withLock(this.options.state, async () => {
      if (!(await this.options.authorize(intent)))
        throw new PublicationError('not_authorized');
      const name = filename(intent.identity);
      const prior = await this.options.state.read(name);
      let journal: Journal =
        prior === null
          ? {
              version: 1,
              intent,
              attempts: 0,
              status: 'pending',
              nextAttemptAt: 0,
              receipt: null,
            }
          : readJournal(prior);
      if (!samePublicationContent(journal.intent, intent))
        throw new PublicationError('identity_conflict');
      if (journal.status === 'published') {
        const receipt = journal.receipt!;
        return {
          ...receipt,
          url: receipt.visible
            ? this.options.api.siteUrl(receipt.postId)
            : null,
        };
      }
      if (!(await this.options.enabled?.()))
        throw new PublicationError('kill_switch_off');
      if (prior === null) await this.options.state.write(name, journal);
      if (journal.status === 'held') throw new PublicationError('held');

      if (journal.attempts > 0) {
        const found = await this.reconcile(intent);
        if (found) {
          const receipt = this.receipt(
            intent.identity,
            'duplicate',
            found,
            true,
          );
          journal = { ...journal, status: 'published', receipt };
          await this.options.state.write(name, journal);
          return receipt;
        }
      }
      if (journal.nextAttemptAt > this.now().getTime())
        throw new PublicationError('retry_not_due');
      if (journal.attempts >= this.limits.maxPostAttempts)
        throw new PublicationError('attempts_exhausted');

      await this.reserveRequest();
      journal = {
        ...journal,
        attempts: journal.attempts + 1,
        status: 'uncertain',
      };
      await this.options.state.write(name, journal);
      let response: Response;
      try {
        response = await this.options.api.http(
          `${this.options.api.base}/api/posts`,
          {
            method: 'POST',
            redirect: 'error',
            headers: {
              Authorization: `Bearer ${this.options.api.token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(intent.payload),
            signal: AbortSignal.timeout(35_000),
          },
        );
      } catch {
        await this.defer(name, journal, 0);
        throw new PublicationError('uncertain_post');
      }
      if (![200, 201].includes(response.status)) {
        const status = response.status;
        const retryAt = this.retryAt(response, journal.attempts);
        await response.body?.cancel();
        if (RETRYABLE.has(status)) {
          await this.defer(name, journal, status, retryAt);
          throw new PublicationError('retryable_post');
        }
        await this.options.state.write(name, {
          ...journal,
          status: 'held',
        });
        throw new PublicationError(`terminal_post_${status}`);
      }
      let receipt: PublicationReceipt;
      try {
        const envelope = record(await response.json());
        const result = record(envelope.data);
        const post = parsePost(result.post);
        if (
          envelope.ok !== true ||
          !['created', 'duplicate'].includes(String(result.outcome)) ||
          (result.outcome === 'created' && response.status !== 201) ||
          (result.outcome === 'duplicate' && response.status !== 200) ||
          !this.matches(intent.payload, post) ||
          (result.outcome === 'created' &&
            (post.title !== intent.payload.title ||
              post.body !== intent.payload.body ||
              post.origin !== intent.payload.origin))
        )
          throw new PublicationError('invalid_post_response');
        receipt = this.receipt(
          intent.identity,
          result.outcome as 'created' | 'duplicate',
          post,
          false,
        );
      } catch {
        await this.defer(name, journal, response.status);
        throw new PublicationError('uncertain_response');
      }
      await this.options.state.write(name, {
        ...journal,
        status: 'published',
        receipt,
      });
      return receipt;
    });
  }

  async replay(): Promise<{ published: number; held: number }> {
    let published = 0;
    let held = 0;
    for (const name of (await this.options.state.names()).filter((value) =>
      /^publication-[a-f0-9]{64}\.json$/.test(value),
    )) {
      const journal = readJournal(await this.options.state.read(name));
      if (journal.status === 'published' || journal.status === 'held') continue;
      try {
        await this.publish(journal.intent);
        published++;
      } catch {
        held++;
      }
    }
    return { published, held };
  }

  private receipt(
    identity: string,
    outcome: 'created' | 'duplicate',
    post: Post,
    reconciled: boolean,
  ): PublicationReceipt {
    return {
      identity,
      outcome,
      postId: post.id,
      url: post.deleted_at === null ? this.options.api.siteUrl(post.id) : null,
      visible: post.deleted_at === null,
      reconciled,
    };
  }

  private matches(payload: CreatePostInput, post: Post): boolean {
    const bySource =
      payload.source_item_id !== null &&
      post.source === payload.source &&
      post.source_item_id === payload.source_item_id;
    const suppliedUrl = payload.canonical_url ?? payload.url;
    const byUrl =
      suppliedUrl !== null &&
      post.canonical_url === normalizePublicationUrl(suppliedUrl);
    return bySource || byUrl;
  }

  private async reconcile(intent: PublicationIntent): Promise<Post | null> {
    let cursor: string | null = null;
    const seen = new Set<string>();
    for (let page = 0; page < this.limits.reconcilePages; page++) {
      await this.reserveRequest();
      let response: Response;
      try {
        response = await this.options.api.http(
          `${this.options.api.base}/api/posts?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
          {
            method: 'GET',
            redirect: 'error',
            signal: AbortSignal.timeout(35_000),
          },
        );
      } catch {
        throw new PublicationError('reconcile_unavailable');
      }
      if (response.status !== 200) {
        await response.body?.cancel();
        throw new PublicationError('reconcile_unavailable');
      }
      let data: Record<string, unknown>;
      try {
        const envelope = record(await response.json());
        if (envelope.ok !== true) throw new Error();
        data = record(envelope.data);
      } catch {
        throw new PublicationError('reconcile_invalid');
      }
      if (
        !Array.isArray(data.posts) ||
        !(data.next_cursor === null || typeof data.next_cursor === 'string')
      )
        throw new PublicationError('reconcile_invalid');
      for (const raw of data.posts) {
        const post = parsePost(raw);
        if (this.matches(intent.payload, post)) return post;
      }
      if (data.next_cursor === null) return null;
      if (!data.next_cursor || seen.has(data.next_cursor))
        throw new PublicationError('reconcile_invalid');
      cursor = data.next_cursor;
      seen.add(cursor);
    }
    return null;
  }

  private async reserveRequest(): Promise<void> {
    if (this.cycleRequests >= this.limits.requestsPerCycle)
      throw new PublicationError('cycle_budget_exhausted');
    const day = this.now().toISOString().slice(0, 10);
    const name = `publication-budget-${day}.json`;
    const old = await this.options.state.read(name);
    let requests = 0;
    if (old !== null) {
      const value = record(old);
      if (
        value.version !== 1 ||
        value.day !== day ||
        !Number.isSafeInteger(value.requests) ||
        (value.requests as number) < 0
      )
        throw new PublicationError('invalid_budget');
      requests = value.requests as number;
    }
    if (requests >= this.limits.requestsPerDay)
      throw new PublicationError('daily_budget_exhausted');
    await this.options.state.write(name, {
      version: 1,
      day,
      requests: requests + 1,
    });
    this.cycleRequests++;
  }

  private retryAt(response: Response, attempts: number): number {
    const header = response.headers.get('retry-after');
    const parsed = header
      ? /^\d+$/.test(header)
        ? this.now().getTime() + Number(header) * 1000
        : Date.parse(header)
      : NaN;
    return Number.isFinite(parsed)
      ? Math.max(parsed, this.now().getTime())
      : this.now().getTime() + Math.min(60_000, 1000 * 2 ** attempts);
  }

  private async defer(
    name: string,
    journal: Journal,
    _status: number,
    nextAttemptAt = this.now().getTime() +
      Math.min(60_000, 1000 * 2 ** journal.attempts),
  ): Promise<void> {
    await this.options.state.write(name, {
      ...journal,
      status: 'uncertain',
      nextAttemptAt,
    });
  }
}
