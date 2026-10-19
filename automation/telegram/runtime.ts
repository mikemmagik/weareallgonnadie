/** Compose owner review with the journaled publisher; no agent receives API credentials. */
import type { CreatePostInput } from '../../shared/contracts.ts';
import {
  digestPayload,
  JournalPublisher,
  stableSourceItemId,
} from '../publishing/publisher.ts';
import type { Publisher } from '../core/state.ts';
import { GatewayOwnerReviewer } from '../openclaw/owner-review.ts';
import { TelegramSubmissionWorkflow } from './workflow.ts';

export function ownerWorkflow(
  publisher: Publisher,
  options: { executable: string; agent: string; enabled: boolean },
): TelegramSubmissionWorkflow {
  const reviewer = new GatewayOwnerReviewer({
    executable: options.executable,
    agent: options.agent,
  });
  const journal = new JournalPublisher({
    api: publisher.api,
    state: publisher.state,
    // This callback is reached only after the owner workflow validates a saved
    // review result and explicit /publish command; never from Gateway output alone.
    authorize: async () => true,
    enabled: () => options.enabled,
  });
  return new TelegramSubmissionWorkflow(
    publisher.state,
    (submission) => reviewer.review(submission),
    async (payload, identity) => {
      const intent = {
        identity,
        mode: 'owner_command' as const,
        candidateKey: identity,
        decisionRevision: 1,
        evidenceIds: [],
        sourceUrl: payload.url,
        contentDigest: digestPayload(payload),
        payload: {
          ...payload,
          source_item_id:
            payload.source_item_id ?? stableSourceItemId(identity),
        } as CreatePostInput,
      };
      intent.contentDigest = digestPayload(intent.payload);
      const receipt = await journal.publish(intent);
      if (!receipt.visible || receipt.url === null)
        throw new Error('Publication is unavailable.');
      return { url: receipt.url, postId: receipt.postId };
    },
  );
}
