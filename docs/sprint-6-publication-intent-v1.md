# PublicationIntent v1 — Discovery ↔ Site Publisher

Статус: совместимый RC-контракт для staging. Это локальная граница между
проверенным Discovery ingress и Publisher, а не новый публичный HTTP API сайта.

## Обязательный envelope

```ts
type PublicationIntent = {
  version: 1;
  intent_id: string; // стабильный, повторяемый ID
  content_hash: string; // SHA-256 канонического документа
  origin: 'auto';
  authorization: { kind: 'discovery'; approved: true };
  editorial: {
    decision_id: string;
    source_event_id: string;
    source_attribution: string;
    approved_at: string; // ISO UTC с миллисекундами
    publication_policy: { version: string; outcome: 'approved' };
  };
  post: CreatePostInput & {
    type: 'news';
    origin: 'auto';
    body: string; // полный английский материал
    references: Array<{ url: string; title: string | null }>;
  };
};
```

`body` обязан быть непустым полным английским текстом, а `references` —
непустым списком подтверждённых источников. Publisher валидирует структуру и
содержимое через общий `CreatePostInput` до сетевого запроса. `type: "article"`
не является типом `CreatePostInput` и отклоняется; для Discovery допустим только
`type: "news"`.

`content_hash` вычисляется через
`withPublicationIntentContentHash()` из канонического набора полей, а не из
порядка ключей пришедшего JSON. Producer не должен вычислять собственную,
несовместимую сериализацию.

## Доверие и доставка

Поле `authorization` — редакционное свидетельство, но не доказательство
источника транспорта. Вызов `acceptDiscoveryPublicationIntent()` требует
отдельный `WAAGD_DISCOVERY_INGRESS_TOKEN`; это не Worker write token и не должен
попадать в AI, Git, логи или сообщение Telegram. Без настроенного совпадающего
секрета Publisher отвергает intent.

Первое состояние Publisher — `auto_paused: true`. Оператор должен явно включить
автопубликацию через подтверждённый owner-командный путь `/resume auto` либо на
хосте Publisher командой `policy auto resume`. Для возврата в безопасный режим:
`policy auto pause`.

Receipt содержит `intent_id`, `origin`, `content_hash` и семантическую
идентичность публикации. Повтор полностью идентичного intent возвращает старый
результат. Тот же `intent_id` с иным содержимым, URL/source identity или hash
приводит к явной ошибке конфликта. При неопределённом сетевом результате payload
остается в private outbox; после разрешённого replay receipt становится
`published` только после ответа Worker.

## Совместимость

Веб-API не меняется: Publisher передаёт валидный `intent.post` в существующий
`POST /api/posts`. Старый RSS/HN `daily` путь не образует этот envelope и остаётся
выключенным legacy-совместимым сценарием. Его нельзя включать параллельно с
Discovery ingress. Новые Discovery producers должны вызывать только
`automation/discovery/ingress.ts`.
