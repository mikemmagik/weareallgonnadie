import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { acceptDiscoveryPublicationIntent } from './ingress.ts';
import { RequestFailure } from '../core/http.ts';
import type { Publisher } from '../core/state.ts';

const MAX_INTENT_BYTES = 256 * 1024;
const MAX_INGRESS_TOKEN_BYTES = 4096;
const STAGING_ORIGIN = 'https://waagd-staging.waagd.workers.dev';

export class PublicationImportInputError extends Error {
  constructor() {
    super('Invalid private import input.');
  }
}

export interface PublishImportArguments {
  intentFile: string;
  ingressTokenFile: string;
}

export type PublishImportOutcome =
  | { outcome: 'created' }
  | { outcome: 'duplicate' }
  | { outcome: 'held' }
  | { outcome: 'failed' }
  | { outcome: 'uncertain' };

function isPrivateRegularFile(
  info: Awaited<ReturnType<typeof lstat>>,
  exactMode: number,
): boolean {
  return (
    info.isFile() &&
    info.uid === process.getuid?.() &&
    (Number(info.mode) & 0o7777) === exactMode &&
    info.nlink === 1
  );
}

/**
 * Read a bounded input without following a symlink. The pre-open lstat and
 * descriptor stat must identify the same private regular file, so a path swap
 * cannot replace the checked file between validation and reading.
 */
async function readPrivateFile(
  path: string,
  maximumBytes: number,
): Promise<Buffer> {
  if (!isAbsolute(path)) throw new PublicationImportInputError();
  let before: Awaited<ReturnType<typeof lstat>>;
  try {
    before = await lstat(path);
  } catch {
    throw new PublicationImportInputError();
  }
  if (!isPrivateRegularFile(before, 0o600) || before.size > maximumBytes)
    throw new PublicationImportInputError();

  let file;
  try {
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch {
    throw new PublicationImportInputError();
  }
  try {
    const opened = await file.stat();
    if (
      !isPrivateRegularFile(opened, 0o600) ||
      opened.size > maximumBytes ||
      opened.dev !== before.dev ||
      opened.ino !== before.ino
    )
      throw new PublicationImportInputError();
    const value = await file.readFile();
    const final = await file.stat();
    if (
      value.byteLength > maximumBytes ||
      !isPrivateRegularFile(final, 0o600) ||
      final.dev !== opened.dev ||
      final.ino !== opened.ino
    )
      throw new PublicationImportInputError();
    return value;
  } catch (error) {
    if (error instanceof PublicationImportInputError) throw error;
    throw new PublicationImportInputError();
  } finally {
    await file.close();
  }
}

export function parsePublishImportArguments(
  argv: readonly string[],
): PublishImportArguments {
  if (
    argv.length !== 4 ||
    argv[0] !== '--intent-file' ||
    argv[2] !== '--ingress-token-file' ||
    !argv[1] ||
    !argv[3]
  )
    throw new PublicationImportInputError();
  return { intentFile: argv[1], ingressTokenFile: argv[3] };
}

export async function readIngressTokenFile(path: string): Promise<string> {
  const token = (await readPrivateFile(path, MAX_INGRESS_TOKEN_BYTES))
    .toString('utf8')
    .trim();
  if (!token || Buffer.byteLength(token, 'utf8') > MAX_INGRESS_TOKEN_BYTES)
    throw new PublicationImportInputError();
  return token;
}

async function readPublicationIntentFile(path: string): Promise<unknown> {
  let value: unknown;
  try {
    value = JSON.parse(
      (await readPrivateFile(path, MAX_INTENT_BYTES)).toString('utf8'),
    );
  } catch {
    throw new PublicationImportInputError();
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new PublicationImportInputError();
  return value;
}

/** Production requires a separate, explicit operator activation. */
export function assertPublishImportOrigin(
  apiOrigin: string,
  productionEnabled: boolean,
): void {
  const origin = new URL(apiOrigin).origin;
  if (
    origin === STAGING_ORIGIN ||
    ['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname)
  )
    return;
  if (!productionEnabled) throw new PublicationImportInputError();
}

export async function publishImport(
  publisher: Publisher,
  args: PublishImportArguments,
  ingressToken: string,
): Promise<PublishImportOutcome> {
  try {
    const result = await acceptDiscoveryPublicationIntent(
      publisher,
      await readPublicationIntentFile(args.intentFile),
      ingressToken,
    );
    return { outcome: result.outcome };
  } catch (error) {
    if (error instanceof RequestFailure) {
      if (error.status === 429) return { outcome: 'held' };
      if (error.retryable) return { outcome: 'uncertain' };
    }
    if (
      error instanceof Error &&
      error.message === 'Automatic publication is paused.'
    )
      return { outcome: 'held' };
    return { outcome: 'failed' };
  }
}

export function publishImportExitCode(outcome: PublishImportOutcome): number {
  switch (outcome.outcome) {
    case 'created':
    case 'duplicate':
      return 0;
    case 'held':
      return 2;
    case 'uncertain':
      return 3;
    case 'failed':
      return 1;
  }
}
