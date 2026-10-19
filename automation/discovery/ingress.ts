import { validatePublicationIntent } from '../core/intent.ts';
import type { PublicationIntent } from '../core/intent.ts';
import type { Publisher } from '../core/state.ts';
import type { CreatePostResult } from '../../shared/contracts.ts';

/**
 * The only Discovery-to-site handoff. The transport that invokes this function
 * must supply its separately provisioned ingress secret; JSON authorization is
 * editorial evidence, not transport authentication.
 */
export async function acceptDiscoveryPublicationIntent(
  publisher: Publisher,
  rawIntent: unknown,
  ingressToken: string,
): Promise<CreatePostResult> {
  const intent = validatePublicationIntent(rawIntent);
  if (!intent.valid)
    throw new Error(
      `Invalid Discovery PublicationIntent: ${intent.issues
        .map((entry) => entry.path)
        .join(', ')}`,
    );
  if (intent.value.origin !== 'auto')
    throw new Error('Discovery ingress accepts only automatic intents.');
  return publisher.submitDiscoveryIntent(intent.value, ingressToken);
}

/** Compile-time boundary for Discovery producers; do not mint credentials here. */
export type DiscoveryPublicationIntent = PublicationIntent & { origin: 'auto' };
