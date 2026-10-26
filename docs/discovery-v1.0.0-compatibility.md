# Discovery compatibility verification for site v1.0.0

## Verified site boundary

The site release accepts exactly one `PublicationIntent` v1 or v2 through:

```sh
node automation/cli.ts publish-import --intent-file ABSOLUTE_PATH --ingress-token-file ABSOLUTE_PATH
```

The importer uses the existing `Publisher`; it never calls the Worker directly.
It verifies the complete canonical intent hash, `origin: "auto"`, the separate
ingress secret, the persisted `auto_paused` policy, receipt identity, and the
Worker's atomic duplicate response. `RequestFailure` outcomes stay durable and are
reported as `uncertain`, never as a successful publication.

## Cross-repository evidence

This release was checked against Discovery commit `f1c7766`
(`codex/sprint6-autonomous-publishing`, Discovery tag `v0.6.0-rc.1`), which is the
pinned Site-contract commit recorded in the Discovery repository. Its
`editorial/publication.py` emits one v1 envelope with:

- `version: 1`, `origin: "auto"`, and `{kind:"discovery", approved:true}`;
- a stable `auto-<candidate-key>-r<revision>` intent identity;
- required editorial approval metadata and a fully populated news post;
- the same reconstructed compact UTF-8 SHA-256 document as the Site's
  `contentHashForPublicationIntent()` implementation.

The Discovery fixture runner invokes the Site validator and fails on a divergent
hash. Site v1.0.0 additionally has local fixtures and tests for both v1 and trusted
publisher v2 intents.

## Release coordination status

No Discovery tag named `v1.0.0` was present in the locally available Discovery
repository at release preparation time. Therefore this document verifies the pinned
contract commit above, not an unobserved Discovery release. Before Infrastructure
enables unattended production import, the Discovery orchestrator must provide the
immutable v1.0.0 commit/tag and confirm that its emitted intent is byte-compatible
with this v1 contract (or supply its v2 fixture). Do not change either protocol
unilaterally; a changed envelope, hash document, authorization shape, or duplicate
semantic requires coordinated release review.
