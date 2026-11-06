# Optional APIs and public evidence implementation plan

> For agentic workers: use superpowers:executing-plans for integration and verification. Independent provider modules are assigned through the dispatching-parallel-agents workflow.

**Goal:** Make financial-data subscriptions optional while preserving accurate source, scope and freshness disclosures.

**Architecture:** Retain existing FMP entitlement detection and SEC/Yahoo keyless fundamentals. Add bounded issuer-document and SEC proxy recovery when optional feeds cannot supply useful evidence. Enable supported ChatGPT plan web research without changing accounts or billing paths. Public research never silently overwrites calculated financial inputs.

**Tech stack:** Existing TypeScript, SEC client/cache, DNS-pinned issuer HTTP reader, Responses streaming transport and Vitest; Node 24. No new paid data service or dependency.

**Spec and authority:** The user's November 6 request authorizes implementation and delegates design decisions. This document records the implementation choice; it does not claim the user separately approved its particulars.

## Design

Existing APIs remain preferred when they produce usable data. Entitlements are learned from actual responses with the existing key/endpoint-scoped cooldown, not inferred from marketing plan names. Missing keys, restrictions and empty responses may trigger public evidence recovery.

Official-site discovery needs a confirmed issuer and website. It follows bounded public HTTPS links using DNS-pinned requests, date/subject checks and byte/time/request limits. Dated releases and genuine call transcripts remain distinct; unsupported formats and incomplete discovery remain explicit. An issuer release is neither a SEC filing nor a normalized FMP row.

SEC governance recovery reads the latest eligible definitive proxy and retains source-owned compensation and beneficial-ownership excerpts. An appointment package or say-on-pay vote is not annual compensation. Beneficial ownership in a proxy is not a complete 13F aggregation. No holder totals are fabricated from a partial search.

ChatGPT plan usage supports web search subject to account/model policy. Research and writing remain separate; writing and judging have no tools. Only provider-observed source URLs enter research provenance. Plan usage is never converted to paid API usage. Local action, byte and time limits are not represented as provider-side spending caps.

General web search is useful for discovering evidence and dated qualitative research. Financial statement admission still requires exact issuer, filing, period, currency, units and ownership scope. Conflicts and inherently undefined metrics remain unavailable.

## Alternatives considered

- Require FMP Ultimate: convenient coverage, but contrary to the user's subscription requirement and unable to resolve accounting conflicts.
- Let model output replace missing numbers: broad apparent coverage but insufficient evidence and reproducibility.
- Optional APIs plus retained public evidence: selected because it supports existing users, keeps provenance testable and makes access limits honest.

## Constraints and review focus

- No network access for reserved synthetic symbols or injected-provider tests unless explicitly enabled.
- Wrong-issuer links, DNS rebinding, future/stale/ambiguous dates and caption-only tables must fail closed.
- A partial discovery must not erase the unavailable vendor dataset or imply exhaustive coverage.
- Aborts, deadlines, malformed documents and capability refusals must settle without paid fallback.
- Stored reports lacking new fields remain readable; new runs disclose actual web research, not an assumption based on model family.

## Tasks

- [x] Add test-first bounded official HTML release/transcript discovery in `src/providers/companyIrDocuments.ts`, reusing the existing secure reader.
- [x] Add test-first SEC proxy evidence recovery in `src/providers/publicGovernance.ts`.
- [x] Add test-first ChatGPT plan search translation, observed source collection and limits in `src/ai/transport.ts`; enable research in `src/pipeline/stageC/index.ts`.
- [x] Integrate optional public evidence in `src/pipeline/dataBundle.ts` and `types.ts`, with API-success bypass and source-manifest coverage tests.
- [x] Carry public evidence into budgeted payload excerpts and issuer-source checks without altering numeric financial admission.
- [x] Record web research in execution schemas/disclosures; preserve older stored-report behavior.
- [x] Update docs, audit decision, version identities and the fictional sample through its build script.
- [x] Verify targeted regressions, full `npm run verify`, independent review and preparation of GitHub publication.

## Verification

Provider fixtures use synthetic documents and injected transports. Focused tests must demonstrate absent/restricted API recovery, successful API bypass, source/date refusal and no-search writer behavior. Run full verification under Node 24 after integration. Public live probes may validate acquisition but must not invoke paid/model calls or publish raw provider responses.


## Review record

Independent review reproduced six important defects: cached-proxy timestamp ordering, internal-caption preface qualifiers, ambiguous numeric dates, unrelated publication dates, nonempty API placeholders, and zero-result research checkpoint provenance. Each was corrected with a regression that failed before the fix. The reviewer reported no remaining critical, important or minor findings in the reviewed candidate. Live search entitlement and exhaustive issuer coverage were not established by offline review; the documented capability and coverage limits remain explicit.

The first integrated fixture checks exposed a test-only sixty-request mock quota, an incorrect source-manifest assertion and two old version regex pins. The mock limiter was disabled only for injected synthetic responses, and the assertions updated to the actual manifest/version contract. Full verification remains the final publication gate.

Preliminary full verification runs were intentionally interrupted for a live-source date correction and explicit primary-source research instructions. Regression tests demonstrated a proxy meeting date being mistaken for publication and a calendar-window mismatch; both passed after correction. The actual retained EXPE compensation excerpt then reached the payload with its source date/hash intact. Primary-source preference and underlying-document instructions also passed their regression. Restart the full gate on this corrected tree before publication.

The first completed product run passed 16,694 tests and failed five: the README length limit and four subscription-sibling mocks that still returned writer JSON for the new research request. The README was shortened; mocks now perform separate completed research/writer requests and assert combined usage plus the observed action count. All five focused regressions passed. Full verification is rerun before publication.

Final verification: `npm run verify` passed on Node 24.11.1. Each overlapping core/risk run passed 16,699 tests across 720 files with three existing skips; four integration tests, type/lint, dependency shape, production build and security audit passed. Security audit reported zero known vulnerabilities. The source diff hash matched the completed build before commit. GitHub publication continues on PR #111.
