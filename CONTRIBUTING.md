# Contributing to Metis

Metis is a local-first research app for US-listed companies. Contributions should preserve source tracing, explicit data gaps and reproducible calculations. Start with a small issue describing the affected research workflow; for a wrong figure, use the data issue form. Report vulnerabilities privately through [SECURITY.md](SECURITY.md).

## Development setup

Use **Node.js 24** and its bundled npm. Windows is the primary development platform; macOS/Linux use the same npm commands. CI runs the full gate on Linux and product/integration smoke checks on Windows, both with Node 24.

```sh
git clone https://github.com/eligorelick/Metis.git
cd Metis
npm ci
```

Install from the lockfile with `npm ci`. Do not regenerate `package-lock.json` with `npm install` on Windows: npm skips the optional wasm32 builds there and can drop their entries from the lock, and CI's `npm ci` then fails. `npm run check:dependencies` (part of `verify`) detects a lock with missing entries.

Copy [`.env.example`](.env.example) to `.env` (`Copy-Item .env.example .env` in PowerShell, `cp .env.example .env` on macOS/Linux). Keep credentials private. No API key is needed for offline tests or the synthetic sample at `/report/sample`. For real keyless SEC research, configure a truthful `EDGAR_CONTACT`; see the [README](README.md#quick-start).

Run `npm run dev` and open http://127.0.0.1:3000. For production locally, run `npm run build` then `npm start`. Normal startup initializes the database; do not run `db:push` as a setup prerequisite. See [operations](docs/OPERATIONS.md) for configuration and recovery.

## Tests and the full gate

Write the failing regression test first for a behavior change, then implement the smallest general fix. Use Vitest and existing neighboring test conventions. `npm run test:watch` supports iteration; `npm run test -- tests/repository.release.test.ts` targets a file.

Tests must not use the live network. The guards in [`tests/setup/`](tests/setup) block live requests and isolate environment/credentials; do not bypass them. Use offline fixtures, mocks and synthetic inputs, including unsupported and missing-data cases. Keep real provider responses, paid report exports and keys out of commits: [data rights](docs/DATA-RIGHTS.md) limit redistribution. Fix general source/period/unit/sector rules, never add ticker-specific code. Code comments cite a `docs/METHODOLOGY.md` heading by name, a decision id (`D-nn`) or an audit finding id, never a retired section number.

Before submitting, run:

```sh
npm run verify
```

This runs, in order: dependency-shape checks (`check:dependencies`), TypeScript (`typecheck`), ESLint (`lint`), isolated database CLI integration tests (`test:integration`), both core and risk coverage contracts (`test:coverage`, collected in one offline product-suite run), the production build (`build`), and the production/development dependency security audit (`audit:security`). Installation and the dependency audit contact package services; product tests remain offline. Timings vary with host load. ESLint caches by file content under `node_modules/.cache/eslint`; TypeScript already uses incremental checking, and neither cache is committed. The single `test:coverage` command reports both coverage contracts from `coverage/product/coverage-summary.json`. CI runs static checks and tests in parallel, with `full` requiring both lanes to pass. While you work, `npm run typecheck`, `npm run lint` and `npm run test:changed` are usually enough, because CI runs the full gate on every pull request; run `verify` yourself after wide changes such as build or test configuration. CI's [workflow](.github/workflows/ci.yml) defines the Linux full gate and Windows smoke checks. Record any failure and rerun result rather than claiming a partial gate passed.

## Decisions, documentation and version stamps

Record consequential research or architecture decisions with rationale in [docs/audit/DECISIONS.md](docs/audit/DECISIONS.md), and describe changes under an Unreleased heading in [CHANGELOG.md](CHANGELOG.md). Keep [methodology](docs/METHODOLOGY.md), [operations](docs/OPERATIONS.md) and privacy guidance consistent with the implementation. Working plans belong in `docs/internal/`; the explicit release allowlist in `tests/repository.release.test.ts` must include new tracked documentation and community files.

Report spec, payload, Stage B implementation and score-band stamps identify calculation/report meaning, independently of the application package version. When meaning changes, update the relevant owning constants and regressions (see [`tests/report.versionStamps.test.ts`](tests/report.versionStamps.test.ts)), methodology and changelog together. Frozen historical cutoffs stay frozen; stored reports retain their original stamps and bytes. Do not bump stamps for documentation-only changes. See [replay compatibility](docs/OPERATIONS.md#immutable-run-inputs-and-offline-stage-b-replay).

## Pull request checklist

- Explain the problem, scope and resulting behavior; link the issue and decisions where applicable.
- Add the failing regression first for behavior changes; cover missing inputs and refusal paths with offline fixtures.
- Preserve source/period/unit tracing, explicit gaps and historical stored-report compatibility; avoid ticker-specific branches.
- Update documentation, CHANGELOG and relevant version stamps, or state why a stamp change is unnecessary.
- Run `npm run verify` and report its result, including any reruns.
- Check relative links and the release allowlist when moving or adding docs.
- Include no keys, local databases, real provider data or report exports; retain license and attribution notices.

Contributions remain subject to the [Metis No-Sale Attribution License 1.0](LICENSE). It is source-available with attribution and paid-access restrictions; submitting a contribution does not change those terms.

Please follow the [Code of conduct](CODE_OF_CONDUCT.md) in all project spaces.
