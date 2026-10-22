# Security audit fixes (2026-10-22)

Base: `1d90f4b` (main after pull request #45). Scope: batch 8 of the
2026-10-22 audit, covering findings F-4 to F-8, F-10 and F-11, the prior
audits' GATE-1 and GATE-22, and DOC-1, which the owner had deferred under
D-97 item 17. Decision: D-100 in [DECISIONS](DECISIONS.md). The audit
evidence folders stay out of the repository.

This change made no paid provider or model calls and no new reports. It
changes no deterministic figure. The only provider traffic was the data-only
control run below, served from cached data.

## Disposition

| Finding | Disposition | Commit | Tests |
|---|---|---|---|
| F-4 Clickjacking | Fixed. Every response the request-wide proxy passes or rejects carries `Content-Security-Policy: frame-ancestors 'none'` and `X-Frame-Options: DENY`. The print view opens in a new window, never a frame, so nothing in the app frames itself. | `a4be826` | `tests/api.routes.sameOrigin.test.ts` |
| F-5 Flags and gap reasons outside the envelope | Fixed. The Stage A data-quality flags and the missing-data manifest are rendered through the untrusted-data envelope, JSON-encoded with `<`, `>` and `&` escaped, and with each entry's line breaks folded to one line. A forged closing marker or `developer:` line in a provider error stays inside the envelope, and the Gemini flattening gets no forged role line. | `0710dc3` | `tests/stageC.untrustedEnvelopes.test.ts`, `tests/stageC.payload.passes.test.ts` |
| F-6 Judge reads raw analyst cases | Fixed. Each analyst case the judge receives is enveloped and labelled model-authored and untrusted, and the shared rule tells the judge to weigh the cases as arguments, never instructions. | `281462e` | `tests/stageC.untrustedEnvelopes.test.ts` |
| F-7 Web-search results | Fixed. The shared rule now says web-search results and fetched pages are untrusted, to be used only as quoted evidence, and that instructions in them are never followed or repeated. | `dff2d6a` | `tests/stageC.untrustedEnvelopes.test.ts` |
| F-8 Heavy GET guard on a plain-HTTP LAN host | Fixed. Browsers send Fetch Metadata only to HTTPS or loopback origins, so a cross-site image aimed at a plain-HTTP `METIS_ALLOWED_HOST` arrived header-free and passed as a script. On a non-loopback host a header-free company landing now needs `X-Metis-Token` or a same-origin `Referer`. Loopback is unchanged. PRIVACY.md and `.env.example` state the caveat. | `cdedaa3` | `tests/api.routes.sameOrigin.test.ts` |
| F-11 Stray `.gitignore` line | Fixed. The lone `=` line is gone, and every non-comment line must now be a real pattern. | `4397e44` | `tests/repository.release.test.ts` |
| F-10 Node engines range | Fixed. `engines.node` is `>=24` in `package.json` and the lockfile, the version CI tests and the suite is known to pass on. README, OPERATIONS and the DECISIONS crosswalk say so. No Node 22 CI lane is added. | `4761628` | `tests/repository.release.test.ts` |
| GATE-1 Ambient `METIS_` settings | Fixed. A new shared setup file clears every `METIS_` and `THESIS_` variable (any case) before each test file and restores them afterwards. With ambient overrides aimed at a sentinel directory, the 15 tests in 5 files that failed now pass and nothing is written to the sentinel. | `f33da76` | `tests/setup.hermeticEnv.test.ts` |
| GATE-22 Incremental typecheck | Not changed; it cannot make a stale typecheck pass in CI. `*.tsbuildinfo` is gitignored and untracked, CI starts from a fresh checkout, and its only cache is npm's (the workflow parity test pins the exact step list, so a build-info cache cannot be added silently). Locally, a warm `tsconfig.tsbuildinfo` still reported a new type error in an edited file and, after an exported return type changed, 8 errors in its unedited dependents. | — | — |
| DOC-1 Live inference claim | Fixed. PRIVACY.md and the README said no live ChatGPT or Gemini inference had been verified, but complete reports have run live through a ChatGPT connection since October 2026 (reports #40 to #45). Both now say so, and that live Gemini inference has not been verified. | `751bdd3` | `tests/repository.release.test.ts` |

Every new test failed before its fix. GATE-22 has no test because nothing
changed.

## Version stamps

The envelopes change the serialized prompt, so the payload fingerprint moves
(`tests/stageC.payload.passes.test.ts` re-pins it, dated). No calculation or
payload field changes meaning, so payload 1.40.0 and report spec 1.35.0 stay.
A partial report whose analyst passes ran before this change cannot resume
after it: the resume stops on the fingerprint mismatch and asks for a fresh job.

## Not changed

- Text the audit's demonstration showed outside the envelopes, the
  institutional-holdings title quarter and the FRED attribution, is built by
  code from dates and a constant, not from provider text.
- The Gemini transport still flattens messages as `role:` lines. All provider
  and model-authored text now reaches it JSON-encoded inside an envelope, so no
  entry can start a line; per-message JSON framing was not adopted.
