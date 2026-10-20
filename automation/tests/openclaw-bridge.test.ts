import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OpenClawTelegramBridge,
  type OpenClawTelegramBridgeOptions,
} from '../telegram/openclaw.ts';
import type { OpenClawTelegramInbound } from '../telegram/handler.ts';

function fixture(submit: OpenClawTelegramBridgeOptions['submit']) {
  return new OpenClawTelegramBridge({
    allowedIds: new Set(['123']),
    submit,
  });
}

test('OpenClaw v2026.10.3 bridge projects observed owner text into a stable intent identity', async () => {
  const submitted: OpenClawTelegramInbound[] = [];
  const bridge = fixture(async (event) => {
    submitted.push(event);
    return { chatId: 123, text: 'PUBLISHED' };
  });
  bridge.observe(
    { senderId: '123', messageId: '456', media: [] },
    { channelId: 'telegram' },
  );
  assert.deepEqual(
    await bridge.handle({
      channel: 'telegram',
      isGroup: false,
      senderId: '123',
      messageId: '456',
      content: 'https://example.com/story',
    }),
    { chatId: 123, text: 'PUBLISHED' },
  );
  assert.deepEqual(submitted, [
    {
      channel: 'telegram',
      direct: true,
      senderId: '123',
      messageId: '456',
      providerUpdate: '456',
      content: 'https://example.com/story',
    },
  ]);
});

test('OpenClaw bridge fails closed when attachment evidence was not observed', async () => {
  let calls = 0;
  const bridge = fixture(async () => {
    calls++;
    return null;
  });
  const reply = await bridge.handle({
    channel: 'telegram',
    isGroup: false,
    senderId: '123',
    messageId: '456',
    content: 'https://example.com/story',
  });
  assert.match(String(reply?.text), /nothing was published/);
  assert.equal(calls, 0);
});

test('OpenClaw bridge carries any staged or pending attachment only to the adapter rejection path', async () => {
  const submitted: OpenClawTelegramInbound[] = [];
  const bridge = fixture(async (event) => {
    submitted.push(event);
    return { chatId: 123, text: 'UNSUPPORTED MEDIA' };
  });
  bridge.observe(
    { senderId: '123', messageId: '456', mediaStagingPending: true },
    { channelId: 'telegram' },
  );
  await bridge.handle({
    channel: 'telegram',
    isGroup: false,
    senderId: '123',
    messageId: '456',
    content: 'https://example.com/story',
  });
  assert.equal(submitted.length, 1);
  assert.equal(submitted[0]?.media?.length, 1);
});

test('OpenClaw bridge never forwards non-owner, group, or ambiguous direct events', async () => {
  let calls = 0;
  const bridge = fixture(async () => {
    calls++;
    return { chatId: 123, text: 'unexpected' };
  });
  for (const event of [
    {
      channel: 'telegram',
      isGroup: false,
      senderId: '999',
      messageId: '456',
      content: 'https://example.com/story',
    },
    {
      channel: 'telegram',
      isGroup: true,
      senderId: '123',
      messageId: '456',
      content: 'https://example.com/story',
    },
    {
      channel: 'telegram',
      senderId: '123',
      messageId: '456',
      content: 'https://example.com/story',
    },
  ])
    assert.equal(await bridge.handle(event), null);
  assert.equal(calls, 0);
});
