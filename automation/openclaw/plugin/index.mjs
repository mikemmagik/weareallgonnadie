import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';
import register from './service.ts';

export default definePluginEntry({
  id: 'waagd-telegram',
  name: 'WAAGD deterministic Telegram publishing',
  description:
    'Separate project bot with deterministic authorization and API publishing.',
  register,
});
