# Sprint 6 combined staging acceptance and rollback

Статус: подготовлено, **не выполнено**. Production не является целью этой
процедуры. Перед началом оператор предоставляет только staging origin, staging
Worker write token, private Publisher state directory, separate Discovery ingress
secret и доступ владельца к существующему `@waagd_bot` OpenClaw ingress. Их нельзя
включать в Git, shell history, логи, тестовые fixtures или LLM context.

## Предусловия

1. Проверить commit RC и выполнить `npm run validate` без production bindings.
2. Применить текущие migrations к изолированному staging D1; новая forward-only
   migration — `db/migrations/0002_url_less_news.sql`. Повторное применение должно
   быть idempotent.
3. Оставить legacy `daily` и Telegram poller выключенными. Убедиться, что нет
   второго `getUpdates` consumer.
4. В установленном OpenClaw добавить **один** `before_dispatch` handoff:
   из принятого existing Telegram channel event передать `channel`, direct status,
   numeric sender ID, stable message ID, provider update ID, text и presence media
   в `handleOpenClawTelegramInbound()`. Handler возвращает owner reply через
   поддерживаемый reply путь host-а. Не включать handler, пока field mapping не
   подтверждён live staging event.

Официальный OpenClaw hook `before_dispatch` предназначен для interception
inbound message до model dispatch; adapter намеренно не создаёт poller и не хранит
bot token. Формат в этом репозитории подготовлен и unit-tested, но фактический
installed event ещё не наблюдался, поэтому Telegram не считается интегрированным.

## Одна совмещённая acceptance

### A. Discovery → Website

1. Начать с auto paused, отправить полностью валидный v1 intent — ожидать zero
   POST и paused error.
2. Явно resume auto, отправить approved Discovery intent c `type: news`, полным
   English body и verified references. Проверить D1 row, feed/permalink и длинный
   escaped body.
3. Повторить byte-identical intent — один post и прежний receipt. Повторить тот
   же `intent_id` с изменённым body/hash — explicit conflict.
4. Имитировать gateway loss после write, убедиться в outbox. Выполнить `/pause
auto`, `retry`: zero POST. Выполнить `/resume auto`, `retry`: одна безопасная
   доставка/duplicate, receipt `published`.

### B. Existing Telegram bot → Website → owner reply

1. Отправить owner direct text в существующий `@waagd_bot`. Existing OpenClaw
   ingress должен передать его adapter; проверить `PUBLISHED`/`ALREADY EXISTS`
   ответ владельцу и D1/feed/permalink.
2. Redeliver тот же provider update: один пост и idempotent owner reply.
3. Проверить non-owner, group, bot sender, edited/non-message и file upload:
   ни одного POST; file upload только explicit unsupported response.
4. Пока auto paused, повторить owner text: Telegram продолжает работать. После
   resume подтвердить queued Discovery delivery.

Acceptance считается успешной только если оба пути проходят в одной staging
сессии с сохранёнными приватными evidence у оператора. Без B нельзя объявлять
Telegram интегрированным.

## Rollback

1. Немедленно `/pause auto`; сохранить state directory и receipt/outbox для
   forensic review, не удалять очередь.
2. Отключить новый OpenClaw handoff и вернуть прежний routing existing bot; не
   запускать второй poller.
3. Вернуть совместимую Worker/assets revision. Не откатывать D1 migration:
   `0002` forward-compatible. Существующие posts/tombstones не удалять.
4. Отдельно решить судьбу queued intents после review; resume только после
   подтверждения исправленной staging конфигурации.

## Production blockers

- Нет подтверждённого Discovery ingress integration с отдельным секретом.
- Нет observed real OpenClaw Telegram event и owner end-to-end reply.
- Нет staging acceptance/evidence и operator sign-off.
- R2 media design не одобрен/не реализован.
- Нет отдельной авторизации на production Worker/D1/deploy/DNS изменения.
