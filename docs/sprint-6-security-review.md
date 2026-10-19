# Sprint 6 security review — publication authority

Дата: 19 October 2026 (Asia/Bangkok). Независимый review границы Publisher;
никаких удалённых ресурсов, секретов или runtime-конфигураций не менялось.

## Решение

`PublicationAuthority` и публичная фабрика capability удалены. JSON вида
`{ authorization: { approved: true } }` больше не способен сам по себе получить
право на публикацию.

| Вход                                | Доказательство доверия                                              | Дополнительные проверки                                                | Решение       |
| ----------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------- |
| Discovery                           | отдельный `WAAGD_DISCOVERY_INGRESS_TOKEN`, сравнённый constant-time | PublicationIntent v1, auto origin, редакционная policy, hash, pause    | допускается   |
| Telegram owner                      | существующий OpenClaw ingress передаёт direct Telegram event        | numeric allowlist, private owner chat, non-bot, stable update identity | допускается   |
| Произвольный JSON / AI output       | отсутствует                                                         | даже `approved: true` недостаточно                                     | отклоняется   |
| Legacy poller / second `getUpdates` | не используется                                                     | флаг legacy выключен                                                   | не подключать |

Секрет Discovery намеренно отличается от `WAAGD_API_WRITE_TOKEN`: только
Publisher знает Worker token. Отправитель intent не получает его из API и не
получает publish-capability через экспортируемую фабрику.

## Idempotency и аварии

До первого POST сохраняется receipt с hash и semantic identity. Новый payload с
тем же `intent_id`, но иным содержимым, отвергается как conflict; старая квитанция
не возвращается молча. Неопределённый результат после фактической записи в Worker
оставляет private outbox. Повтор использует прежний identity, Worker duplicate
семантику и затем завершает receipt.

Пауза авто-потока проверяется перед submit и перед replay. Поэтому queued auto
payload не создаёт POST во время `/pause auto`; только явный resume разрешает
доставку. Telegram origin не разделяет этот kill switch.

## Остаточные риски и условия допуска

- `submitTelegramIntent()` допустим только за проверенным adapter; не следует
  экспортировать его как HTTP endpoint или передавать `Publisher` произвольному
  plugin-коду.
- `Publisher.submit()` — сохраняемый legacy retry primitive внутри репозитория,
  не ingress и не поддерживаемый внешний API. До production он должен быть
  недоступен из OpenClaw/HTTP plugin surface; staging review проверяет это
  процессное ограничение.
- Старые receipts без hash не считаются идентичными v1. Они требуют ручной
  проверки, а не автоматического восстановления доверия.
- Защита local state зависит от существующих 0700/0600 ownership checks и
  выделенного пути вне репозитория.

Этот review не заменяет проверку установленного OpenClaw runtime и staging
credentials владельцем инфраструктуры.
