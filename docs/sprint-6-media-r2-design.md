# Telegram media — минимальный проект R2 (не реализован)

Статус: дизайн для отдельного одобрения. В этом RC Telegram photo/video/document
по-прежнему получает честный unsupported-media ответ; R2 bucket, binding, ключи,
public domain и upload не создавались.

## Предлагаемый безопасный поток

1. Existing OpenClaw Telegram ingress проверяет direct owner event и numeric
   allowlist до запроса файла.
2. Из Telegram API используется только short-lived file retrieval через runtime
   владельца. URL с bot token никогда не попадает в `Post`, D1, R2 metadata,
   логи, ответы владельцу или frontend.
3. Staging worker скачивает поток с лимитами размера и времени, сверяет declared
   MIME с magic bytes, разрешает только утверждённые image/video типы, вычисляет
   SHA-256 и удаляет временный объект при любой ошибке.
4. Объект кладётся private в R2 по opaque ключу
   `media/sha256/<digest>`; D1 хранит только ключ, hash, MIME, bytes и owner
   event identity. Дубликат same hash/event не создаёт второй объект.
5. Frontend получает медиа только через контролируемый Worker route с
   allowlisted response headers; никакого public bucket listing и token URL.

## До реализации нужны решения

- лимиты bytes/duration и список разрешённых MIME/codec;
- retention, удаление публикации и orphan-object reconciliation;
- access model для private R2 и preview delivery;
- migration, Worker binding, quota/cost и incident/rollback procedure;
- отдельный security review с real staging attachment samples.

Ни один из этих шагов не авторизует создание реального Cloudflare R2 ресурса.
