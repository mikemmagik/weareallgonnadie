# Automation boundary

Reserved for OpenClaw clients; there is no running automation here.

- `discovery/`: future daily selection of existing public content.
- `telegram/`: future manually submitted, already approved URLs; use `origin: "telegram"`.
- `changelog/`: future monthly Humanity Changelog with its own body and references.

All clients use the HTTP contract in `docs/api.md`. Never import Worker business logic,
access D1 directly, share frontend secrets, or modify the user's existing OpenClaw
installation. A duplicate is successful processing; failed requests follow the
retry rules in the API documentation. Authentication values belong in local secret
storage. No bot, scheduler, subscription, or integration is configured by this scaffold.
