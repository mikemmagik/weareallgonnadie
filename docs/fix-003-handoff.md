# FIX-003 — TikTok legacy identity conflict remediation

Prepared **13 October 2026, Asia/Bangkok**, on `fix/legacy-tiktok`, from
`qa/release-candidate` baseline `f14de95008ab918464b764118fe0af42d8b9c051`.
The implementation and this handoff are committed together; the delivery includes
the final commit SHA.

**RELEASE-QA-001-D07 passes local acceptance. Previous D06 behavior remains correct
in the retained regression and real Worker/D1 integration suites.**

## Root cause

The duplicate candidate check accepted `originalId === tikTokId || embedId`.
A matching canonical-shaped original therefore satisfied the check even when the
same legacy row contained another TikTok source ID or contradictory structured
embed ID/URL. The original-ID mismatch check did not examine those other claims.
All three retained D07 conflicts returned `200 duplicate` at the baseline.

## Exact correction

`worker/store.ts` independently extracts the candidate's supported original video
ID, source item ID in the existing case-insensitive TikTok namespace, structured
TikTok embed ID, and supported structured embed URL video ID. Before duplicate
success, every present recognized claim must equal the incoming verified identity.
A matching original cannot override contradictory embed or source metadata.

The existing positive verification requirement remains: a matching supported original
or a matching structured TikTok embed ID/URL pair must establish the candidate.
A source ID alone cannot verify an unresolved short original. Missing optional
metadata contributes no contradiction. IDs in other source namespaces and fallback
link metadata retain their existing meaning; they are not TikTok provider claims.

Contradictions return `400 VALIDATION_ERROR` with only
`Existing TikTok identity requires data review.` The error includes no row ID,
URL, title, metadata, SQL, or conflict-specific details.

Conditional insertion, legacy candidate selection, unique constraints and duplicate
lookup remain in the existing D1 batch transaction. Deleted rows still participate.
No migration, historical-row update, merge, backfill, or resurrection is performed.
Authentication, parameterized SQL, new-publication validation and other providers
retain their existing implementation. Shared contracts are unchanged.

## Changed files

- `worker/store.ts`: require independent agreement of all recognized candidate claims.
- `tests/backend.integration.test.ts`: add 12 legacy scenarios, each active and
  soft-deleted, using six concurrent canonical/vt/vm submissions per scenario
  (24 cases, 144 submissions). Assert exact sanitized failures or successful
  duplicates, one row, unchanged full row snapshots, original URL retention and
  public tombstone invisibility.
- `docs/fix-003-handoff.md`: this technical handoff.

The retained `tests/release-qa.mjs` and `tests/regression-001.mjs` are unchanged.
No frontend, public assets, automation, Telegram or OpenClaw configuration changed.

## Before/after acceptance

The exact mandatory command was executed before and after the correction:
`node --test tests/release-qa.mjs`.

| Seeded legacy record                   | Baseline             | Corrected                   |
| -------------------------------------- | -------------------- | --------------------------- |
| Original A, optional metadata absent   | 200 duplicate — PASS | 200 duplicate — PASS        |
| Original A, embed ID/URL B             | 200 duplicate — FAIL | 400 VALIDATION_ERROR — PASS |
| Original A, TikTok source item ID B    | 200 duplicate — FAIL | 400 VALIDATION_ERROR — PASS |
| Original A, embed ID A but embed URL B | 200 duplicate — FAIL | 400 VALIDATION_ERROR — PASS |

Before: exit 1, one passing control, three failing acceptance children and failing
parent (1 pass / 4 fail runner entries). After: exit 0, all four scenarios and parent
pass (5 pass / 0 fail). Each scenario retains one unchanged database row in both runs.
The corrected response JSON was also inspected to confirm the error code.

## Tests executed

Environment: macOS arm64, Node v24.15.0, npm 11.12.1, locked Astro 7.3.8 and
Wrangler 4.149.0. Fixtures used migrated temporary local D1 and real loopback Worker
HTTP, temporary test tokens, sentinel database IDs, disabled remote bindings and
environment-file loading. Builds/validation used isolated local tool preferences,
disabled telemetry and stripped Cloudflare credential variables. No deployment ran.
Counts overlap across commands and include parent tests where applicable.

| Command                                         | Result                                                                                                                              |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`                                        | PASS; 395 packages installed, zero reported vulnerabilities                                                                         |
| `npm run build` (baseline setup)                | PASS; static frontend and Worker dry-run bundle                                                                                     |
| `node --test tests/release-qa.mjs` (baseline)   | Expected FAIL; reproduced all three D07 conflicts                                                                                   |
| `node --test tests/release-qa.mjs` (corrected)  | PASS; 5 runner entries                                                                                                              |
| `node --test tests/backend.integration.test.ts` | PASS; 41 runner entries including 24 new legacy cases                                                                               |
| `node --test tests/regression-001.mjs`          | PASS; 6 runner entries, retained one-publication assertion                                                                          |
| `node --test automation/tests/*.test.ts`        | PASS; 56 tests                                                                                                                      |
| `npm run validate`                              | PASS; Astro 0 errors/warnings/hints, strict TypeScript, ESLint, formatting, 84 unit tests, 1 build smoke, 41 D1 integration entries |
| `npm run build` (corrected)                     | PASS; static frontend and Worker dry-run bundle                                                                                     |

Coverage includes fresh TikTok identity normalization, short/canonical/tracking URL
forms, forward/reverse submission order, the existing 18-request creation race,
distinct video IDs, exact other-provider namespaces, invalid new provider/source
metadata, consistent legacy records, independent embed-ID/embed-URL/source/original
conflicts, multiple historical matches, active/deleted rows, concurrent legacy
submissions and preservation of the first original URL. Existing authentication,
CRUD, pagination, immutable identity, idempotent deletion and retry behavior pass.

`npm run validate` does not include the independent release fixture; its separate
passing result above is required for D07 acceptance. This handoff was added after
the full validation run and checked separately for formatting and whitespace.

Logs and before/after acceptance JSON remain in ignored `output/fix-003/`.
Fixtures retain their normal evidence under `output/release-qa/` and
`output/regression-001/`; temporary runtime/database directories are cleaned up.

## Remaining limitations

- Contradictory historical data still requires explicit operator review. This fix
  rejects duplicate success and preserves those records; it does not repair them.
- Existing legacy scanning and candidate selection are unchanged. Their compatibility
  cost still needs assessment against production data volume before index/schema work.
- The Worker checks URL structure and authenticated writer metadata; it does not
  independently fetch/attest to live short-link redirects. Safe redirect verification
  remains the automation boundary.
- These results establish local backend acceptance. The release report's separate
  live Reddit rendering/media restriction, preview-policy decision and production
  edge/remote D1/live automation checks remain outside FIX-003. No production
  readiness claim, deployment, DNS change, main merge or live OpenClaw operation occurred.
