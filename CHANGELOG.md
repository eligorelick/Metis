# Changelog

Entries record dated development batches. “Now”, migration advice, model
defaults, prices, version stamps and validation describe the batch they appear
in; later entries supersede earlier choices. `Unreleased` records merged work
not yet identified here as a new tagged/package release. Use
[README](README.md) and the [methodology](docs/METHODOLOGY.md) for present guidance.

Current source declares application **0.1.0**, report spec **1.47.0** and
payload **1.49.0** (claim verifier period and number rules and payload-record fixes from the 2026-10-27 audit, batches B1, B2 and B3). The
checked-in
Claude registry prefers Opus 5.5 for `auto` and Sonnet 5.5 as Haiku's judge floor;
ChatGPT/Gemini account connections have their own model selection. These are
repository settings, not confirmation of live provider entitlement. The
[October audit](docs/audit/2026-10-03-repository-audit.md) and later
[recommendations ledger](docs/audit/2026-10-04-recommendations.md) record
verification and the replacement of the stale-PID credential-lock protocol.
Stored reports retain their
original versions and bytes; source merge does not deploy or publish a release.

## Unreleased - Retry of a data-only report now runs (2026-10-29)

When a report ended data-only because the judge failed, its Retry button did nothing: the job was closed as done without running anything, the same data-only report stayed linked, and Retry was offered again every time. A queued Retry is now closed before it runs only when the report it points to is a full report that blocks a resume. A data-only report no longer closes it, so the Retry runs the judge and verify passes on the analyst passes already settled. Only the judge and verify are billed again; the analyst passes already paid for are reused. If the Retry fails again, the job links a new data-only report and stays resumable; if it cannot be dispatched, the job ends in error with its fixed message and keeps the data-only report linked.

Pipeline stage-c-1.6.13 (D-next). Report spec, payload and Stage B are unchanged. Stored reports keep their bytes.

## Unreleased - claim verifier reads signs, scales, units and each figure's own description (2026-10-28)

The independent audit of 2026-10-27 found that the deterministic, no-model verify pass of Stage C could mark a claim `[validated]` or `contradicted` because it misread a figure in the filing excerpt it cites: a minus before the currency, a word that only began like a scale or a unit, a table scale applied to the wrong cell, a hedge or a comparison base read as the value, or another metric's figure in the same sentence. This batch fixes the excerpt path for the seven High findings and their Medium and Low siblings. No payload, prompt, Stage B figure or stored report changes. The record-path, registry, entity and rating-gate findings of the same audit (AI-407, AI-408, AI-116, AI-103, AI-104, AI-111, AI-501, AI-502, AI-504) are deferred to a follow-up batch, not dropped.

- The number scanners no longer slow down on a long run of spaces or line breaks: verifying a claim with 2,000 padded characters took about 2.9 seconds and takes about 5 milliseconds (SEC-203). Proved on synthetic text.
- A minus written directly before the currency ("-$23.22 billion") is read as a negative figure, so a correct negative claim is no longer marked contradicted against its negative record, and a range such as "$1.0-$1.2 billion" or a dashed year does not turn its upper bound negative (AI-202). No stored report spells a negative this way; proved on synthetic text. "USD 1.0 - 1.2 billion" is still read with a minus (a recorded residual).
- A word that only begins like a scale or a unit ("months", "5 key products", "marketable", "crude oils", "fraud", "1,234 Share-based") is no longer read as millions, billions, a ratio or a share count, and "8 basis points", "0.08 percentage points", "mn", "mln", "mil", "mio" and "bln" are read as what they are (AI-304, AI-304-V1, AI-304-V3). Proved on committed tests (a Micron table's Percentages and Ratios rows, NVIDIA balance-sheet rows); no stored claim changed status.
- A currency code or symbol before "share repurchase", "shareholder return" or "share price" is no longer flagged as a unit-word mismatch, and "$15.2 billion shares" is (AI-304-V2). Proved on synthetic text.
- A table's "(In millions)" or "($ in millions, except per share data)" declaration scales money amounts, share counts and unit-less cells only. A percentage (NVIDIA's 71.1% gross margin) and a per-share cell (the Basic row of NVIDIA's Note 3) are no longer multiplied by it, so "USD 2.47 million" no longer validates a per-share figure and the correct figure is no longer marked contradicted (AI-403, AI-203). Under "except per share data" a decimal cell is per share only when its own row names a per-share basis ("per share", "per basic share", "per diluted share", "per common share", "per ordinary share" or "EPS"): decimal precision alone made "Revenue $ 5.0" under "($ in millions, except per share data)" a per-share figure, which validated "USD 5.0 per share" and left the true "USD 5.0 million" unchecked (found by the pull-request review; main read both correctly).
- A hedge ("about", "around", "more than", "less than", "fewer than") or "an increase of" before a figure keeps a change a change, and "a gain of" is read as unknown, so a level claim is no longer validated by a change sentence (AMZN's "had an increase of") or the reverse (AI-401, AI-401-V2).
- "Revenue was $5.0 billion, up sequentially" is a level, not a change: a figure before an apposition comma, semicolon, colon, dash or parenthesis is not read with the direction word that follows (AI-401-V1). Proved on sentences of NVIDIA's Q2 FY2027 press release fixture.
- "More than $25 billion", "at least 40 billion" and "at most 5%" in a source are read as bounds, not as the figure, so an exact claim never validates against them (AI-409). A bound claim at another figure is unverified, not contradicted: "over USD 70 billion" is implied by NVIDIA's "over $76.7 billion" and was marked contradicted (found by the final review). Proved on synthetic text and NVIDIA fixtures; no stored claim changed.
- A figure binds a claim only when the claim names the figure's own description. "NVIDIA returned nearly $26.0 billion to shareholders" no longer validates a free-cash-flow claim, and a Micron EPS benefit and an AMZN revenue run rate bind the metric the sentence gives them (AI-305, AI-305-V1). The check can only leave a claim unverified, so it moves nothing toward validated ("Current assets: Cash and cash equivalents" was already validated before it). Measured on reports #43, #46 and #50. The cost is recall: five stored traced numbers (two key numbers and three balance-sheet table numbers) now stay unverified because the claim leaves out nouns of the figure's own sentence (#43: the $15.9 billion net discrete tax expense in two key numbers, the $17.5 billion delayed draw term loan facility and the $21.3 billion commitment amount; #50: the $25 billion senior unsecured notes), and a short label such as NVIDIA's $105 billion obligation needs its full description.
- A figure after "from", "compared with", "versus", "vs." or "against" is a comparison base and binds only a comparison-base claim, and the end of "increased from $A to $B" takes the move's metric (AI-503, AI-503-V1, AI-503-V2). "Commitments increased to USD 279 billion", which NVIDIA's CFO commentary states, is no longer marked contradicted by the $119 billion the commitments started from, and "increased to USD 119 billion" is no longer validated by it. A period, window or fiscal year-end written between the two figures is the start's, not the end's, so "Total debt decreased to USD 8.5 billion at fiscal year-end" is not validated by a quarterly filing's "decreased from $10.0 billion at fiscal year-end to $8.5 billion". NVIDIA's 10-Q sentence "significantly increased our supply and capacity commitments from $119 billion" is no longer contradicted for a true $279 billion claim; it stays unverified. Measured on the CFO commentary and 10-Q MD&A sentences that reports #48 to #50 carry.
- Deferred to the follow-up batch (B2b), not built here: AI-407 and AI-408 (a registry figure's printed description and column period), AI-116 (insider roles), AI-103 (issuer disclosures as primary entity sources), AI-104 (the return-path fade), AI-111 (the rating-gate name exception), and AI-501, AI-502 and AI-504 (record labels, percentage-point records and operand order).
- Report 1.47.0 (D-129, D-130); pipeline stage-c-1.6.12, payload 1.49.0, Stage B ACCOUNTING_EVIDENCE_28 and the score bands are unchanged. Stored reports keep their bytes and statuses (D-67).

## Unreleased - the claim verifier compares periods and windows (2026-10-28)

The independent audit of 2026-10-27 found that a factual claim could be marked `[validated]` while the period, window, comparison base or recency word it states was never compared with what it cites, and that the period check could fail a sentence the citation check had correctly accepted. This batch fixes the deterministic, no-model verify pass of Stage C. No payload, prompt, Stage B figure or stored report changes. The decision is D-128 in [DECISIONS](docs/audit/DECISIONS.md), and the [disposition record](docs/audit/2026-10-27-audit-fix-01-claim-verifier-periods.md) lists each finding, its commits and the replay over the stored run inputs.

- A figure with no reporting period of its own (a ratio, a share count, a fair value) is no longer confirmed for a fiscal year or a date it does not carry (AI-106). Since B3, a figure that Stage B takes from one fiscal year (the latest ROIC, margins and accrual ratios) carries that year's label, so a sentence naming that year, or "the latest fiscal year", is still confirmed (C-11).
- "From 2025-07-27" is not confirmed against a trailing-twelve-month figure unless the sentence also states the end date (AI-302).
- "Annual revenue", "per year", "this quarter", "at fiscal year-end" and "the latest quarter" are now read and checked, on cited figures and on filing excerpts (AI-303 and its variants). A claim's prior/last year-end is established only by the same phrase in the source figure's own clause, stated as that figure's own instant, and never by a cited record: "at the end of the prior year" is never read as a 10-K's own year-end (found by the final review of B1 and B2). A year-end after a comparison word ("up from $25.8 billion at the end of the prior fiscal year", "compared with $25.8 billion at fiscal year-end") is the base figure's, never the other figure's, and one after "from" or "since" is where a change starts, so "Inventory was USD 31.6 billion at fiscal year-end." no longer validates against a 10-Q's "Inventory was $31.6 billion, compared with $25.8 billion at fiscal year-end." (found on re-review; it validated at main). A period inside a parenthetical that holds another figure is that figure's, so against "Inventory was $31.6 billion (at the end of the prior fiscal year, $25.8 billion)." the false "USD 31.6 billion at the end of the prior fiscal year" no longer validates and the true "USD 25.8 billion" claim is no longer contradicted (main did both). A figure that loses a period that way is unverified rather than read under the excerpt's own period, so "Inventory was USD 25.8 billion in Q2 FY2027." no longer validates against a 10-Q's "Inventory was $25.8 billion (at the end of the prior fiscal year, up from $20.0 billion a year earlier)." (main validated it), and nested parentheses are matched by depth.
- A figure before "compared with ... second quarter 2025" is no longer read as a second-quarter-2025 figure, a correct year-ago figure is no longer marked contradicted, and a correct year-over-year sentence naming its base no longer gets a period finding (AI-402 and variants). A base that names an exact date, a month or a quarter must name the base period itself, not just its year: "compared with 2025-01-01" no longer validates a growth rate measured against 2025-06-30 (found by the pull-request review; main left it unchecked).
- The comparison-base reader no longer slows down on comma-grouped table rows: about 1,000 characters of such rows took 33.6 seconds to verify and now take milliseconds, because each amount is read one way (AI-402, found by the final review of B1 and B2). Proved on synthetic rows; it reads every committed fixture and test text as before.
- A period stated in another clause of a one-figure claim is checked (AI-404).
- A company outlook or guidance ("gross margins are expected to be 74.0%", "our guidance for third-quarter revenue is $108.0 billion") no longer confirms a reported result (AI-302-V1). A source clause that reads as forward-looking (including "is expected to be paid within one year") now confirms only a claim that is itself forward-looking, which costs recall in the fail-closed direction.
- The period check no longer fails "fiscal 2025" against a 52/53-week year that ends in January 2026, or "the second quarter of fiscal 2027" against NVIDIA's quarter ended 2026-07-26, and compares "compared with Q2 FY2026" with the growth figure's own base quarter (AI-405, AI-402-V2).
- Report 1.46.0 and pipeline stage-c-1.6.12 (D-128); payload 1.49.0, Stage B ACCOUNTING_EVIDENCE_28 and score bands unchanged; stored reports keep their bytes and statuses (D-67).

## Unreleased - payload records carry the right label, unit, currency and period (2026-10-28)

The independent audit of 2026-10-27 found records the AI context and the data-only report named wrongly: a peer's market cap in the subject's currency, insider counts shown as shares, spans and periods labelled for more than they covered. This batch fixes them where each record is built. Every rule is class-wide; none names a ticker. The decisions are D-124 to D-127 in [DECISIONS](docs/audit/DECISIONS.md), and the [disposition record](docs/audit/2026-10-27-audit-fix-03-payload-records.md) lists every finding.

- A peer's market cap is money only in a currency that peer's own data establishes (AI-301, AI-301-V1). It was given the subject's currency, so a Taiwan, Hong Kong or Tokyo listing read as US dollars and a claim of that size in dollars verified. A peer cap now takes its row's own currency, or the listing currency of a profile the peer collection already read for it. Otherwise it reads "(currency unknown)" and is not registered. On an entry-tier FMP key most peer profiles are refused, so many US peer caps will read "(currency unknown)": an honest unknown is better than a cap in the wrong currency.
  - The size screen compares caps only in an established equal currency, or between listings on the same market. A name on another market is "size not compared" and goes to the profile read inside the existing candidate budget, instead of being excluded on a ratio of local currency to dollars.
- Peer exclusion reasons and collection notes travel in their own untrusted block (AI-102). They could quote a provider's error text outside every envelope.
- Insider statistics are transaction counts and share volumes over a named window (AI-117, AI-117-V1). "Total purchases" and "total sales" are counts of open-market transactions, and they were registered as shares for FMP's newest calendar quarter alone, which may have been the quarter in progress. The AI context now sums the trailing four complete calendar quarters, says "four calendar quarters ended <date>", and registers the open-market purchase and sale counts, the shares acquired and disposed (every reported acquisition or disposition, awards and withholding included) and the acquired/disposed transaction ratio.
- The diluted share-count change names the span it measured (AI-306): "(4y total)" for four years, with a capital note when the history fell short of the requested five. The capex/D&A average names how many years it averages (AI-410): "capex / D&A, 3y average".
- Segment growth is computed only against the quarter its label names (AI-406). A quarter-over-quarter rate needs a column 80 to 100 days earlier and a year-over-year rate one 350 to 380 days earlier. A series with only a year-ago column no longer reports a QoQ rate, and the classic table prints a dash.
- FRED series name their transform and basis (AI-310): payrolls as the monthly change, electricity in dollars per kilowatt-hour, and PCE, PCEND and PCEDG as billions at a seasonally adjusted annual rate.
- An 8-K amount keeps the sentence that names whose it is, and an award of shares ranks with the dollar amounts (AI-101). A salary sentence could survive the cut without the sentence naming the person.
- Round 4:
  - A restated year no longer shows twice in the AI's statement tables: each fiscal period has one column, the row Stage B uses, and a period served twice with no provable order is left out and said so (AI-505).
  - The analysts are told to prefer the later of the 10-Q and 10-K notes by reporting period, and a 10-Q older than the 10-K says so in its title (AI-507).
  - A provider's "geographic" rows that name the issuer's business segments, or that use region names the issuer's own XBRL does not, are no longer passed off as company geography. The report carries an info gap; the issuer's own quarterly geography stays (AI-509).
  - "The graded ratio" now names the figure the balance-sheet score actually graded: the fiscal-year FCF conversion row is called "latest fiscal year", and the current-capital section names the graded window (AI-511).
- Integration:
  - A latest-year ratio or margin now carries the fiscal-year label the statement data carries (the provider's or the keyless builder's), attached only when it is plausible for the period end (the end's own calendar year, or the year before for an end in January to March), and the year end, so a sentence naming that fiscal year can be checked against it and one naming another year is no longer passed (audit residual (a)).
  - An excerpt is no longer titled with a fiscal quarter the company's own statements contradict, and a wrong-quarter claim can no longer pass through such a title (AI-512).
  - Older reports can still show an 8-K amount whose recipient the cut excerpt did not name. This cannot be detected from a stored report, so the limitation is recorded and the figure is shown as stored (AI-101).
- Stored reports are shown under the corrections at display time, never rewritten: a report saved before spec 1.45.0 shows foreign peer caps without a currency or check mark, insider counts as unverified counts, the capex/D&A label as "average of up to 5 fiscal years", the data-only FRED unit sentences, provider geography the report's own XBRL contradicts as unverified, and "the graded ratio" without those words. A fixed note in the missing-data manifest discloses it.
- Report 1.45.0, payload 1.49.0, Stage B ACCOUNTING_EVIDENCE_28 and pipeline stage-c-1.6.11 mark these conventions. No stored report is rewritten and no snapshot changes.

## Unreleased - every paid request settled and shown at its real cost (2026-10-28)

- Record a paid request that fails after it started generating at its reported usage plus what it could still have generated (the request maximum when it carries web search or a server fallback), marked presumed, whatever ended it: the idle guard, the caller, a server error event or a dropped connection (AI-113). A request the provider had answered but that was cancelled before any usage arrived is presumed at the request maximum instead of dropped (AI-113-V1).
- Do not charge a request whose connection never opened (AI-307). One network blip used to book $315.84 presumed on an Opus 5.5 bull pass (six attempts at the $52.64 request maximum) for requests Anthropic never received.
- Make a pass's recorded cost and tokens equal the sum of its requests' settlements, failed pause resumptions included (AI-114).
- Keep a finished response when the database writer lock delays its cost record: the write is retried three times, then the response is kept and the lease is presumed at expiry (AI-308). The runner stops renewing that lease, so it expires on schedule and frees its capacity slot instead of holding it while the pass runs.
- Report a caller abort after a request's final usage event as the actual charge it settled, not as a presumed remainder; settle an idle stream with no usage at the permit's maximum, like the other no-usage charge.
- Date a presumed cost row on the day its request was authorized, so `costs:reconcile` compares it with the right day (JOB-203).
- Admit paid work against the lower of the job's recorded cap and the cap configured now (JOB-209).
- Run Claude Haiku 4.5 on current payloads: the context check now estimates input tokens per tokenizer instead of counting bytes as tokens (AI-309).
- Compare section grades only when `METIS_JUDGE_ORDER=both` (AI-109), and skip and disclose the mirrored judge pass on a retry that keeps sections (AI-108).
- Mark a judge attempt whose output could not be assembled into a report as discarded, and stop the judge retries when an identical second assembly failure repeats (AI-112). State a step's whole cost in its detail, the presumed part named (JOB-204). Print the discarded mark in the audit export's charge breakdown and keep the marks durable recovery can read (RPT-210).
- Pipeline stage-c-1.6.10 (D-117..D-123). Report 1.44.0, payload 1.48.0 and Stage B ACCOUNTING_EVIDENCE_27 are unchanged. Stored reports keep their bytes; #48's and #49's audit exports now print their stored discarded marks.

## Unreleased - a resumed plan pass names its model (2026-10-27)

- Name the model, reasoning effort and speed of a plan pass whose retry kept sections a cut-off attempt wrote. NVDA report #50's judge kept the verdict from a first attempt whose stream the ChatGPT plan endpoint closed at 15 minutes. Both attempts reported GPT-6.1 Sol at max reasoning, yet the run details named synthesis's model "unknown" and said the provider had reported no model and no usage.
  - The section checkpoint now saves the evidence of the request that wrote each section, bound to its text by a digest. The pass's evidence includes it.
  - A kept section without saved evidence still leaves the model unestablished. The note now says so instead of blaming the provider.
- Say what a resumed pass's tokens cover: this attempt's requests only, with the kept sections named. With the judge's model known again, the same-family judge sentence (D-20) and the cost-breakdown model return.
- Stop calling a failed attempt thrown away when its sections were kept. Its missing-data entry names the kept sections, and its cost row is not marked discarded.
- Give a dropped connection a reason that is not circular: "the provider request failed before a usable response arrived".
- Pipeline stage-c-1.6.9 (D-116). Report 1.44.0, payload 1.48.0 and Stage B ACCOUNTING_EVIDENCE_27 are unchanged. Stored reports keep their bytes, #50's included.

## Unreleased - repair note follow-ups (2026-10-27)

- Give a rejected output's issues in words even when the stored failure detail was cut at 4,096 characters: a rejection with about 15 or more issues printed raw JSON on the run panel. The note now reads "N or more fields failed the schema: …".
- Close a repair that is rejected again in words ("bull attempt 2/2 rejected (…)"), where the row named no field. The judge's retry and final rows name its failing fields the same way.
- Keep the Zod issue array out of a data-only report: the missing-data reason for a failed bull, bear or judge pass keeps the pass and failure kind and gives the issues in words, without a rule's own message (which can quote the rejected value).
- Queue only a received-and-rejected output for repair; a dropped plan connection was labelled "rejected …; repair queued" with the wrong attempt count. Drop a null `sourceId` like a blank one, and stop printing an empty "(kept: )" on a retry that kept no sections.
- Pipeline stage-c-1.6.8 (D-115). Report 1.44.0, payload 1.48.0 and Stage B ACCOUNTING_EVIDENCE_27 are unchanged.

## Unreleased - phone layout and a warning-free build (2026-10-27)

- Fit the report history page's compare picker on a phone: each select sized itself to its longest option ("#49 · 2026-10-27 · Requested: …") and widened a 375 px page to 505 px.
- Build without warnings: the request-token read in `src/app/api/sameOrigin.ts` uses a runtime path, so Turbopack traced the whole project into the server output; it now carries the same `turbopackIgnore` hint as the other runtime-path reads.
- Move a test's `server-only` mock to the top level, where Vitest hoists it anyway; a nested call is slated to become an error. No report, payload, pipeline or Stage B stamp moves.

## Unreleased - blank source IDs and the repair note (2026-10-26)

- Read a blank `sourceId` in a bull, bear or judge output as absent, so the claim cites its `source`. Claude wrote `sourceId: ""` wherever it had no registry ID, and all four first attempts of NVDA reports #48 and #49 failed the schema on that and paid for a repair. A claim whose `source` is also blank is still rejected.
- Keep a side whose rejected output waits for its repair running in the run panel, under a plain note such as "bear attempt 1/2 rejected (1 field failed the schema: thesis[0].sourceId is empty or too short); repair queued". NVDA run #49 showed that side as ERROR and printed the raw Zod issue array on the side being repaired. A run that gives up closes the waiting side as an error that says why.
- Pipeline stage-c-1.6.7 (D-114). Report 1.44.0, payload 1.48.0 and Stage B ACCOUNTING_EVIDENCE_27 are unchanged.

## Unreleased - fixes from the NVDA report review (2026-10-26)

- Repair an empty bull or bear case. A case with an empty `thesis`, `keyDrivers` or `risksToCase`, or a price target without a positive value and a horizon, now fails like a schema error and gets the one repair attempt, with a reason naming each gap. NVDA report #48's bull was one thesis claim, no drivers, risks or catalysts, and a price target of 0 with no horizon; it was stored as a success, so every debate card read "Not addressed by the bull case". A kept section that is empty the same way is asked for again. Pipeline stage-c-1.6.6.
- Draw the Weighted Projections fan in time order, history ("FY2023") before the forecast ("12M ending 2027-07-26"): a string sort put every 12-month period first, so history sat to the right of the forecast. Ticks are short ("FY23", "Jul ’27"; the tooltip keeps the full period) and thinned to what fits a two-column or phone chart, since Recharts measured them without their font and let them overlap; the value axis steps by 1, 2, 2.5 or 5 × 10ⁿ instead of Recharts' 0.55T, and each tick label is exact ("1.5T" and "2T", not "2T" twice).
- State a repaired step's cost over all its attempts in the run panel: "model claude-opus-5-5, $0.5784 over 2 attempts" beside the step total, where the detail named only the repair's $0.2817.
- Keep a quote fetched after the close fresh until the next open. Quote-priced FMP rows (quote, batch quote, market cap) and Yahoo's quote keep the 15-minute TTL during the US regular session; between sessions a row fetched at least 30 minutes after the 16:00 New York close stays fresh. NVDA report #48 reused its 22:44 UTC quotes at 23:06 and marked the 20:00 UTC closing quote "stale". Exchange holidays are not modelled, so on those days the plain TTL applies.
- Count only warn and critical EDGAR entries as an EDGAR outage. An info note about one derived reading ("No unique matched annual geography revenue table") recorded EDGAR missing and forensics provisional beside 15 retained EDGAR sources, and the page read "EDGAR partial". Stored reports keep their metadata and are confirmed against the rule they were written under.
- Report 1.44.0 and pipeline stage-c-1.6.6 (D-113); payload 1.48.0 and Stage B ACCOUNTING_EVIDENCE_27 are unchanged. No figure changes.

## Unreleased - ChatGPT plan usage and speed per OpenAI's documentation (2026-10-26)

- Give each documented ChatGPT plan-usage error its documented recovery (Sign in with ChatGPT, "Errors and recovery"): a usage limit names Manage usage (`https://chatgpt.com/settings/usage`); `subscription_sharing_usage_unavailable` / `user_unavailable` and HTTP 503 keep the connection as a temporary outage instead of reading as an exhausted plan; `user_not_eligible`, `invalid_user`, `unsupported_capability` (naming the rejected option), `route_not_supported` and the `chatpass_v2_*` authorization codes each say what to do. None suggests a paid fallback.
- Clear an account's tokens when its refresh token is unusable (`invalid_grant`, `refresh_token_expired`, `refresh_token_reused` and the other documented codes), keeping the issued client ID and identity for the reconnect; a temporary token-service failure keeps the credentials.
- Send ChatGPT Fast as the Responses `service_tier` "priority", as Codex does. The plan-usage endpoint rejects "fast" ("Unsupported service_tier: fast"), so every Fast pass failed with "ChatGPT could not start the report pass" (live NVDA run, 2026-10-26). A rejected speed now says so, and any other refusal names its HTTP status.
- Offer ChatGPT Fast only for the models OpenAI's speed page lists (GPT-6.1 Sol, GPT-6.1 Terra, GPT-6 Astra, GPT-6 Sol, GPT-6 Luna); saving Fast for any other model is refused, and Settings shows Standard. The Fast option reads "uses your plan or credits faster", the account row says "ChatGPT plan usage is enabled", and the usage link is OpenAI's Manage usage page.
- Claude stays at standard API speed: Settings and the Claude usage guide say Metis does not request Anthropic's premium-priced fast mode (Opus 5.5). Metis's Gemini CLI connection has no speed control, so nothing changes there. No report, payload or Stage B stamp moves.

## Proposed audit batch 4: freshness and the earnings window (2026-10-26)

- Order a results release that states no period by its filing date, before the first dated release filed no later than it, and rank results releases above operational updates for the four releases kept (B-26: PEP's newest release is kept; Freeport-McMoRan's 2026-10-02 third-quarter operational update is no longer among the four kept, so its newest 8-K read is a 2026-09-08 material-event filing).
- Bind a newer release's dollars to the statements' currency when every income row since before its period is in that one currency, so the earnings-window guidance and the DCF guidance anchor return; the withheld note says the currency is not established rather than claiming a mismatch (B-27).
- Merge a newer 10-Q's own XBRL facts into the companyfacts payload when companyfacts lags the filed 10-Qs, consolidated undimensioned facts only, each cited to the 10-Q's accession and filing date; where a newer periodic filing's facts could not be read, show a "Newer filing not reflected" banner and a warn gap naming it (B-23: Visa, Duke Energy, NextEra, Coca-Cola and Prologis now end at their newest 10-Q, matching the oracle's TTM figures; owner decision).
- Withhold a bull/bear scenario fan that does not bracket its base value, naming both values (Duke Energy after its merged quarter).
- Label P/E and EV/EBITDA with the period their earnings cover ("P/E (FY2025)" when the TTM was not available) in the multiples table, Key data, both exports and the AI payload's label, and name only the P/E formula that ran, with the reason when it is market cap over common income (B-9, B-20; owner decision).
- Read EPS from continuing operations as EPS when no net-income EPS is tagged and no discontinued result is filed for the period, disclosed as a substitution (FCX-4: Freeport's EPS CAGR runs 2020 to 2025 instead of ending at 2021).
- Let a trailing twelve months span a reorganisation when the successor's own filing re-presents the predecessor's net income and per-share figures unchanged, and name a resolved predecessor in the successor's no-annual-report gaps (B-36: ExxonMobil Holdings regains its P/E, 22.4x). Reading the predecessor's 10-K sections is left for later.
- B-24 and C-16 were already fixed by batch 3a.
- Review of this change: judge a successor's own history without the facts merged from newer filings, read every discontinued-operations element on its own (and one withheld from the row) before continuing-operations EPS stands in, add cash-flow D&A to operating income only on the same period (the fiscal year's own cash-flow D&A beside a fiscal-year operating income), label a fiscal-year P/E "P/E (current, FY2025)" in the AI payload, judge a scenario fan on the values the report shows, and compare a successor's EPS with its predecessor's by role (basic, diluted), requiring at least one matched per-share figure before a TTM spans the reorganisation.
- Report 1.43.0, payload 1.48.0 and Stage B ACCOUNTING_EVIDENCE_27 (D-112); pipeline stage-c-1.6.5 is unchanged. See the [disposition record](docs/audit/2026-10-22-audit-batch4-freshness.md).

## Proposed audit batch 6: degrade visibly when providers fail (2026-10-26)

- Treat FRED answering HTTP 200 with an HTML page (its site-maintenance page or any outage page) as an outage on both endpoints: the request is retried with backoff, the keyed API then tries `fredgraph.csv`, and the gap reads "returned a maintenance/HTML page (HTTP 200)" instead of an unrecognized payload or an unknown series id. The body decides (it opens with `<`), not the content type, so a good CSV an edge labels `text/html` is still read (B-1).
- Keep the WACC when FRED `DGS10` and FMP treasury rates both fail: the current WACC takes the last good cached `DGS10` observation if it is at most 10 business days old, else the 10 Yr point of the U.S. Treasury daily par yield curve (`home.treasury.gov`, no key or identity sent; the previous year's file only in January, when the current one can still be missing or empty). The WACC line names the source and its observation date, a `riskFree.substitution` entry says which source stood in and why, the AI context cites the series actually used, and with every source down the WACC is withheld as before (B-4; owner order). Stage B ACCOUNTING_EVIDENCE_26 (D-111).
- Name every substituted input beside the headline fair value. When the risk-free rate is not FRED `DGS10`, when a DCF's ROIC-vs-WACC history had no `DGS10` observation at all (so the terminal ROIC rule compared every fiscal year to the current WACC), when the keyless layer served a statement, the quote or prices the value reads after an FMP refusal (not the sector ETF prices or the shares float), or when the analyst-consensus growth method was dropped because the estimates were refused, `fairValue.reasons` carries a "Degraded inputs: …" entry. It prints under the headline in both layouts, in the Key data note, the Markdown and print exports, the data-only verdict and the AI context. A keyless-by-configuration run carries none, and neither does a member the key's subscription never serves, whose stand-in is now `expected` like FMP's own refusal. The DEMO control gains the entry for its FMP treasury rate and its current-WACC-only history, and no figure moves (F-13; owner decision).
- Say on the first screen when providers fell back. One "Provider fallback · …" line names the FMP members that SEC EDGAR, Yahoo or filed-fact computation served after an FMP refusal, and the risk-free rate's stand-in with its observation date. It appears in the saved-snapshot header in both layouts, under the classic header, at the head of the Markdown, audit and print exports, and in the AI context. A keyless-by-configuration run shows none (F-1; owner decision). Report spec 1.42.0 and payload 1.47.0 (D-111).
- Stop a plan-connection job at once when another Metis server owns the AI connection. The runtime is now claimed at the start of the fetch step, so the job ends in one attempt before any data is fetched. A pass refused mid-run gives the same reason and is not retried. A signed-out connection runs no pass, so it claims nothing and still ends in a data-only report. Both name the OPERATIONS troubleshooting row "AI store is held by another server". Pipeline stage-c-1.6.5 (F-12).
- Check each section kept from a cut-off bull, bear or judge response against its own part of the schema before keeping it. A section that fails is dropped and the retry is asked to write it again, so one malformed kept section no longer makes the retry fail whatever it returns (RIVN judge, 2026-10-22: `fundamentals.graded` held the four tables). The retry's step detail names each dropped section, and on a plan connection that writes in parts a section reloaded from the section checkpoint is checked the same way (D-3).

## Proposed audit batch 5: make the trust signals mean what they say (2026-10-26)

- Count a claim or figure as contradicted only for a value conflict: an amount outside its cited figure's rounding interval, or a direction word against the sign of its cited change. A period, unit or currency the cited record does not establish now reads "unverified (period or unit not established)", and a direction conflict stays contradicted when the period or unit word also fails; stored reports are read the same way, including the audit export's support and outcome columns, where a contradicted claim now reads cited, not uncited (F-22).
- Lead the verification line with numeric claims matched to a cited figure, for example "40/109 (36.7%) numeric claims numerically matched to a cited figure (not whole-claim validation)", and move figures traced to a source and claims carrying a citation to a separate Provenance line in the report, print and page headers (B-10).
- Mark each logged factual claim `[validated]`, `[unverified]`, `[contradicted]` or `[qualitative]` after its citation, in both page layouts, the Markdown and the print report; the header counts equal the marked claims, grade-strip reasoning that no surface prints is left out of them, as the audit export says, and a removed log entry (an earnings-reference guard row, a legacy claim withheld on read) marks and counts nothing (F-21).
- Print "computed" in place of ✓ for a data-only report's figures, with a legend under the first table that has a Cited column (a checked report gets none); the page's figure detail and the audit export say "computed (no citation check ran)" (F-23).
- Label the capital grading basis, the debt-bridge convention, the HEURISTIC capex and buyback notes, the repurchase-price proxy comparison, score-to-band sentences and data-gap notes JUDGMENT, not FACT; computed-figure sentences stay FACT (F-20).
- Report 1.41.0 and pipeline stage-c-1.6.4 (D-110); payload 1.46.0 and Stage B ACCOUNTING_EVIDENCE_25 (D-108) are unchanged by this batch. No figure changes.

## Unreleased - a per-share basis named in claim words (2026-10-26)

- Read a claim's figure in the cited record's per-share unit when the record is per share and the claim's metric words say "per share" ("Our DCF per share as of 2026-10-26 is USD 320.63"); the live MSFT report counted that correct claim as contradicted. The value is still checked, so a wrong figure or a total stays contradicted.
- Report 1.40.3 and pipeline stage-c-1.6.3 (D-109).

## Unreleased - parent net income without a NetIncomeLoss tag (2026-10-26)

- Derive net income attributable to the parent as `ProfitLoss` less the noncontrolling interests' share when a filer tags no `NetIncomeLoss` for the period, and disclose it; consolidated profit had been taken instead (FCX FY2025 4,152 million against 2,204 million; DuPont ROE 22.8% against about 12%; audit B-18).
- Read that figure as parent income in Stage B, so the NCI share is not deducted twice and a TTM window mixing it with `NetIncomeLoss` quarters is no longer refused as mixed.
- Stage B ACCOUNTING_EVIDENCE_25 (D-108); report 1.40.2 and payload 1.46.0 are unchanged.

## Unreleased - readable figures in the reader notes (2026-10-26)

- Print the EV bridge note's amounts and the issuer-common equity headline's share count and capitalization with grouped digits ("42,783,000,000", "119,996,000"), at unchanged precision; they printed raw source units.
- Say that sensitivity-grid cells failing the Gordon guard are "withheld and shown as —", not "rendered null".
- Report 1.40.2, payload 1.46.0 and Stage B ACCOUNTING_EVIDENCE_24 (D-107); no value moves.

## Unreleased - fixes from the live five-company check (2026-10-26)

- Read current debt securities tagged `DebtSecuritiesCurrent` as short-term investments in the keyless statements, so a filer that moved its marketable securities there keeps them in cash and short-term investments when FMP is unavailable (NVDA: 34,143 million at 2026-07-26; keyless sales-to-capital 1.53 → 1.85, against 2.58 on the vendor path, whose combined total also lets D-60 carry marketable equity as non-operating).
- Check a dated interval claim that cites a filing fact against the fact's whole-span period, so a correct "START to END" claim is no longer counted as contradicted (NVDA report #1: the receivables cash-flow contribution for 2026-01-26 to 2026-07-26).
- Print the multiples table's own-history percentile label ("empirical percentile 2/100 (n = 17 quarters)") whole under its bar; in the bar's 3rem caption slot it broke into one- and two-letter lines in both layouts.
- Report 1.40.1, pipeline stage-c-1.6.2 and Stage B ACCOUNTING_EVIDENCE_23 (D-106); payload 1.45.0 is unchanged.

## Unreleased - opt-in dossier reading layout (2026-10-25 to 2026-10-26)

- `METIS_UI_REDESIGN=1` opts into the dossier layout for saved reports and the workspace; `0`, the default, keeps the classic layout. It adds a dossier cover with the composite and the seven aspects, an evidence inspector, report-local notes kept in this browser, a capital bridge, recorded sensitivity cells, factor attribution, a command palette, a coverage desk and a revision digest. It presents the same saved snapshot, figures, gaps and disclosures as the classic layout; see the [preservation ledger](docs/ui-redesign-parity.md).
- Dossier tables wrap long cells instead of clipping them; a quote observation reads as its date (or to the minute in UTC) and the generation time to the millisecond in UTC, with the raw value kept in `<time dateTime>`; a report blocked only by an analysis-process disclosure states its data as complete or degraded and says that the disclosure blocks it (#51).
- The dossier's sticky grade shortcuts take their own row when they do not fit beside the report identity, so all seven grades show from 1440px; where they still scroll, a shadow marks each edge with shortcuts beyond it (#52).

## Proposed audit batch 3: stop withholding where the filed evidence is complete (2026-10-26)

- Read the combined basic-and-diluted share and EPS elements for both bases, and let the basic weighted count stand in for an untagged diluted count when the filer's basic and diluted EPS are equal for the same interval, disclosed per period, and in a loss from continuing operations as antidilution (B-35: XOM regains diluted shares and a per-share value).
- Carry batch 3a's lower-bound D&A caveat onto the EV/EBITDA row and its Key data line, naming the periods composed from `Depreciation` and `AmortizationOfIntangibleAssets` (B-7).
- Mark a multi-class issuer's filed diluted count issuer-economic when its class scope is resolved and the same row's basic count matches the all-class economic total on one class's unit basis, so its per-share value returns; otherwise the warning names the test that failed (B-37: EXPE, META). The AI context's quote section now carries the report's one-class market-cap caveat when the scope is unresolved (B-8).
- Read a quarter's noncontrolling interest from the 10-Q's own equity statement when companyfacts holds it only dimensionally, admitted only when the filing's consolidated total ties to the row, with a nil fact read as no value; the critical DCF gap names the ownership gate instead of a missing caller input (C-15).
- Keep the clean average debt when a lease-scope refusal falls only on a balance outside the averaged pair, fall back to the fiscal-year-end pair when it falls on the TTM pair and both fiscal-year balances carry clean total debt, and name the balance date and cause when no average is established (C-1: AT&T regains its WACC; owner decision).
- Derive operating income as pretax income less the filed non-operating total when the interest tag is nested inside it, with the interest not added back (B-39: LLY FY2025 EBIT 26,302 million and its WACC).
- Read `RestrictedCashCurrent` and `RestrictedCashNoncurrent` as the restrictions on a combined cash total (B-43: CVX), and use a filing's cash plus short-term investments when its combined total is the narrower figure by more than display rounding (B-34: CSCO).
- Net bank write-offs against the same filing's cash-flow recoveries when no roll-forward recovery is tagged (C-13: COF).
- Route managed-care issuers (SIC 6324) to the general map with a sector note (E-6: UNH; owner decision).
- Score Piotroski leverage on a composed long-term debt when both years compose it from the same tags, and name both tag sets when they differ (E-8: O).
- Report 1.40.0, payload 1.45.0 and Stage B ACCOUNTING_EVIDENCE_22 (D-105). See the [disposition record](docs/audit/2026-10-22-audit-batch3-complete-evidence.md).

## Proposed audit batch 2b: deferred valuation items (2026-10-22)

- Deduct filed asset-retirement obligations and environmental remediation accruals in the DCF equity bridge when they are tagged (the filed total, else noncurrent plus current, at the bridge's balance date or else the latest date in the year before it, named on the bridge line, never a current portion alone, and never past a balance filed as zero or an annual balance sheet that no longer tags it), before tax, net of funds legally restricted to settle the retirement obligations beyond the investments already added; untagged issuers are unchanged (E-7: FCX, SO, BA).
- Add a regulated-utility overlay on the general route for SIC 4911, 4924, 4931, 4932 or 4941 with filed rate-regulated revenue or regulatory assets: its balance sheet is scored on Moody's "Regulated Electric and Gas Utilities" (6 August 2024) Standard Grid ranges for CFO before working capital / debt and debt / book capitalization, and Altman Z is withheld from quality and the forensic table; the score evidence names both ratios and traces them to their operands (B-13, A-3: DUK, NEE, SO).
- Apply the 0.5 sales-to-capital floor only when the issuer's own history does not establish a lower ratio: with at least three fiscal years of filed revenue and operating invested capital, the median of the newest five is the lower bound when below 0.5 and at least 0.1 (lower is read as a scale error), and the basis lists the years (A-2: DUK, NEE, SO).
- Withhold the WACC and the pre-tax cost of debt on the bank, insurer and mortgage-REIT routes, which value equity at the cost of equity: the cost of equity is kept, no per-year WACC history is computed, the Returns table's cost-of-equity row says why the other two are absent, and neither reaches the LLM payload or the company page, whose WACC build also shows its weights and tax rate as not used (B-31: BAC printed 22.7% and 13.5%).
- KO's DCF 57% below price is diagnosed as the house calibration batch 2's base-rate line already states, not a defect, and is left unchanged (B-3); the composite's band distribution over the 45-company panel is reported and a recalibration is proposed to the owner, not applied (B-33).
- Report 1.39.0, payload 1.44.0, Stage B ACCOUNTING_EVIDENCE_21 and score bands SCORE_BANDS_2026_10_REGULATED_UTILITY (D-104). See the [disposition record](docs/audit/2026-10-22-audit-batch2b-valuation-mediums.md).

## Proposed audit batch 3a: the remaining high-severity findings (2026-10-22)

- When no trailing tax rate exists, the WACC uses the latest annual effective rate, or a 0% shield on a pre-tax loss, with the basis stated; pre-tax income on the SEC path is the sum of its domestic and foreign components when no total is tagged (B-32: PG, COST, INTC, SNOW, ORCL).
- Read a filed debt aggregate within 2% or 50 million (capped at 10% of the financing debt) above the carrying components as unamortized discount and admit the components; beyond that, total and net debt are withheld with both figures named (B-5: META, MCD).
- Treat a vendor figure as agreeing with the filed one within one reporting unit (on figures of at least 100 units) or 0.01%, so $1M display rounding is no longer a conflict (A-11: META).
- Compose D&A from `Depreciation` and `AmortizationOfIntangibleAssets` when no combined tag is filed, disclosed as a lower bound, so EBITDA and EV/EBITDA return (B-7: MSFT, GOOGL, ORCL, INTC, TSLA).
- Value a class-tagged multi-class cover, every class counted at one date and no unparsed relative entitlement stated, on its stated class economics: market cap is the sum over classes of count x economic weight x the quoted price, and P/E, EV/EBITDA, P/B and the WACC weights follow; when the scope stays unresolved across share classes in force on the price day, issuer-common capitalization is shown as withheld, not as the quote's one-class market cap (B-8: META, BRK.B).
- Show a banner and a warn gap when a results 8-K reports a later quarter than the statements, with its headline revenue (the quarter's total, never a segment's or a full year's) and GAAP diluted EPS (never a loss or a non-GAAP figure) as an unaudited Key data row only when both parse with an established currency; never merged into statements, TTM or valuation. Compact release titles ("3Q26", "Q3 2026 Update") and hyphenated ones ("second-quarter 2026") now date a release; a year-ago quarter end stated first no longer dates it, and the notice cites the exhibit that states the results (B-24, part of B-26).
- Keep the newer 10-Q MD&A passages that restate an operating figure the 10-K excerpts state (gigawatts, megawatts, backlog, customers, subscribers, units) within 15% of the unchanged budget (C-16: SO).
- Report 1.38.0, payload 1.43.0 and Stage B ACCOUNTING_EVIDENCE_20 (D-103). See the [disposition record](docs/audit/2026-10-22-audit-batch3a-priority-highs.md).

## Unreleased - security audit fixes (2026-10-22)

- Forbid framing on every response (`frame-ancestors 'none'`, `X-Frame-Options: DENY`) so another site cannot clickjack Metis pages (F-4).
- Envelope the Stage A data-quality flags and gap reasons, each analyst case the judge reads, and the model's own output shown back on a repair, continuation or part request, as untrusted JSON; tell every pass that web-search results are untrusted evidence (F-5, F-6, F-7). Outside the envelopes, the analyst grades consensus is stated only as one of FMP's five rating words, and statement periods and FINRA and FRED observation dates must be ISO days. The payload fingerprint moves, so a partial report from before this change cannot resume and needs a fresh job; no figure, payload or report version changes.
- On a non-loopback `METIS_ALLOWED_HOST`, a company page request with no Fetch Metadata needs `X-Metis-Token` or a same-origin `Referer`, so a script there should send the token. Browsers send no Fetch Metadata over plain HTTP to a LAN address, so there a typed or bookmarked company URL, a link from another site, or a browser that strips the Referer is refused; open company pages from the app's own links, or serve Metis over HTTPS (F-8).
- **Migration:** Node 24 or newer is now required (`engines.node >=24`), the version CI tests (F-10).
- Tests clear `METIS_`/`THESIS_` settings inherited from the shell (GATE-1); remove a stray `.gitignore` line (F-11); the docs now say ChatGPT inference has run live and Gemini's has not (DOC-1).
- See the [disposition record](docs/audit/2026-10-22-security-audit-fixes.md) and D-101.

## Proposed audit batch 2: valuation in and out of its domain (2026-10-22)

- Publish no fair value from a DCF outside its domain: equity value at or below zero, or a terminal value above 100% of enterprise value. Withhold its grids, reverse DCF and scenario targets, and keep its signals out of the valuation grade (B-29: NEE $0.00, TSLA $10.19 → "Model outside its domain").
- Start the excess-return fade from the trailing four-quarter ROTE or common ROE, print the fiscal-year value beside it when the starts differ by more than 5pp, evidence the terminal carry on 4 of the last 5 years, and set aside one business-combination year below the cost of equity (C-10: COF $81.38 → $155.43 on the audit snapshot).
- Fade the excess-return payout from the three-year average to the steady state 1 − g / terminal ROE by year 10, so book grows at the continuing value's g (C-10 follow-through: PGR $390.23 → $293.09 before merge).
- Show the trailing return as a row and payload figure, add a start-return × cost-of-equity grid, and warn when base-case text has returns recovering toward the cost of equity from above the terminal target (C-11).
- Deduct noncontrolling interest at its share of trailing consolidated profit (the latest fiscal year when the trailing window cannot size it) when that exceeds 10% and the book deduction, and withhold the per-share value when the share cannot be established (E-5: FCX $22.27 → $19.67). The key also applies when book NCI is zero but NCI earns a profit, a trailing sum with an unfiled zero quarter falls back to the fiscal year, and NCI income with no book balance withholds the per-share value.
- Withhold the bull/bear scenario targets when either run is outside the DCF's domain, as the base DCF is, instead of flooring that run at 0 (BA's bear run, −$2.24B of equity, had published $0); the excess-return floor's basis names book value plus the excess returns, not an enterprise-value bridge; the 4-of-5 window keeps a year whose return is not established, so an older year cannot fill it; the return-path check flags a rise only in returns; and NCI income with no book balance withholds the per-share value whether it is a profit or a loss. A sensitivity or growth × margin cell whose own rerun is outside the domain is withheld too (47 growth × margin cells across nine panel issuers), the excess-return grid's cells print the headline's currency instead of "(currency unknown)", and the fair-value and scenario-target method stamps move to FAIR_VALUE_2026_10_D102 and SCENARIO_TARGETS_2026_10_D102.
- State the house DCF base rate from the 2026-10-22 census (16 of 18 below price, median −53%) beside the general-route DCF headline (B-30).
- Report 1.37.0, payload 1.42.0 and Stage B ACCOUNTING_EVIDENCE_19 (D-102). See the [disposition record](docs/audit/2026-10-22-audit-batch2-valuation-domain.md).

## Proposed audit batch 1: headline numbers (2026-10-22)

- Read hyphenated outlook ranges ("$73-76 billion", "15-17%") with their scale and sign, label named-year outlooks as fiscal years (a quarter named only as a comparison base does not make one quarterly), and leave a revenue guide outside 0.2–5× the latest quarter out of the DCF anchor and the outlook table (B-25).
- Withhold a 20-F filer's depositary-share market cap the filings cannot scale, instead of multiplying the ADS price by the ordinary-share count (TSM $11.2T), and label a market cap Métis computes as derived (B-19).
- Read `LongTermNotesAndLoans` and `LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities` into long-term debt without counting current debt twice, and withhold total debt that a same-period tagged total shows to be partial, on vendor statement rows too (B-14, B-15, B-17: ORCL, CVX).
- Test debt plausibility on the average of the year's balances and withhold an unexplained collapse, reading repayments alone when no net issuance is disclosed (B-16).
- Keep an inclusive `LongTermDebt` total when only its current/noncurrent split is refused (B-40: PLD), and refuse a maturity bucket the balance sheet does not carry as current debt (A-10: META).
- Withhold the composite letter below evidence for 50% of the route-applicable signal weight, and mark a band letter for a score that rounds to 45–55 "neutral"; never print a score rounded across its band's threshold (54.6, not 55, beside D) (F-19).
- Report 1.36.0, payload 1.41.0 and Stage B ACCOUNTING_EVIDENCE_18 (D-100). See the [disposition record](docs/audit/2026-10-22-audit-batch1-headline-numbers.md).

## Unreleased - dependency security patches (2026-10-22)

- Patch Next, `@next/env` and `eslint-config-next` 16.3.8 -> 16.4.2 for the
  image-optimization remote code execution and Server Actions denial-of-service
  advisories ([GHSA-2464-fhr4-w9xw](https://github.com/advisories/GHSA-2464-fhr4-w9xw),
  [GHSA-p3m5-59mp-jv5r](https://github.com/advisories/GHSA-p3m5-59mp-jv5r)). The
  dependency-shape gate now approves the 16.4.2 family.
- Patch Vitest and `@vitest/coverage-v8` 4.1.11 -> 4.1.12 for
  [GHSA-qxg6-89mg-rqv8](https://github.com/advisories/GHSA-qxg6-89mg-rqv8) and
  [GHSA-xp26-3454-mjgp](https://github.com/advisories/GHSA-xp26-3454-mjgp).
- The audited fixture comparison reproduces with no financial deltas; only its
  comparison-lock pin moved. No report, payload or methodology version changes.

## Unreleased - license and attribution (2026-10-21)

- Offer current Metis source under the Metis No-Sale Attribution License 1.0,
  with visible credit to Eli Gorelick on distribution/download pages and
  software interfaces. Internal business use with attribution is allowed;
  charging for copies, downloads or access requires separate written permission.
- Update first-party package metadata and the application footer. Third-party
  licenses and notices remain in force. Earlier MIT-licensed copies retain
  their prior rights; the historical v0.1.0 tag is unchanged.

## Proposed deferred AMZN audit fixes (2026-10-20)

- Score SBC at its band floor when it exceeds all free cash flow, instead of dropping the signal (AMZN finding 8).
- Tax a pre-tax-loss year's operating income at the marginal-rate floor in ROIC, so the moat's ROIC floor keeps the year, and name any year still missing (AMZN finding 9).
- State the buyback-timing sign in its label, grade timing only when a priced year is among the last three, and date the payload figure by that year (AMZN finding 15).
- Grade a reverse DCF whose price lies beyond the growth range at that end of the range, and point its thesis triggers away from the base case (AMZN finding 10).
- Keep a scenario's correlated margin shift from moving against the scenario (AMZN finding 11).
- Calendarize consensus by the issuer's own quarterly revenue shape when its last complete fiscal year supplies one (AMZN finding 19).
- Put net debt/EBITDA on the enterprise value's lease basis (AMZN finding 20b).
- Nest a segment row only where its sum holds in every jointly tagged quarter (AMZN finding 13).
- Say what a failed Piotroski signal's figures did, label the accrual scaler correctly, read the remaining repurchase authorization from the 10-Q notes, keep withheld officer assessments out from under "not assessed", and state the EV bridge once without the environment-variable name (AMZN finding 20).
- Keep remaining performance obligations, government antitrust cases, their relief, regulators' fines and dated trials in the filing evidence the passes see (AMZN findings 6 and 16).
- Count peers the data provider never served apart from those the screen excluded (AMZN finding 7).
- Ask the judge for a stance on the price, and state and require reconciling a material gap between the consensus target and the model's value (AMZN finding 18).
- Advance report/payload/Stage B conventions to 1.35.0/1.40.0/ACCOUNTING_EVIDENCE_17. Stored reports remain immutable. See the [disposition record](docs/audit/2026-10-20-amzn-deferred-fixes.md) and D-99.

## Proposed AMZN audit fixes (2026-10-20)

- Wait out a short FMP rate limit (HTTP 429) on analyst estimates and the income, balance-sheet and cash-flow statements, at most 90 seconds per request. A request still refused marks the valuation degraded and names the rate limit as the cause (AMZN finding 2).
- Fill long-term investments on the SEC statements from the filed non-current investment tags, and subtract an estimated tax on non-operating investments in the equity bridge (AMZN finding 1).
- Label a guided or reported quarter by its own year, not by the year-ago quarter it is compared with, and carry guided revenue at the guided year-over-year pace instead of the seasonal sequential pace (AMZN findings 3 and 14).
- Fade an improving operating margin up to a bounded target, and state the per-share value with the margin held flat (AMZN finding 4).
- Stop ranking a P/E that rests on gains outside operating income (more than 25% of pre-tax income), caveat it in Key data, and keep tagged one-off items out of the DCF margin seed (AMZN finding 5, recommendation 15).
- Say on the report itself when passes used only the supplied evidence with no web search, and count contradicted cited figures in the header's contradicted count (AMZN findings 12 and 17, recommendation 7).
- Close the four gaps the Codex review found: withhold a one-off item the filings don't place inside the TTM window, show no own-history rank beside a P/E the caveat says is not ranked, hold a rate-limited request to 90 seconds of wall-clock time with its retry, leave failed or never-sent passes out of the Evidence line, and never read a quarter an outlook heading introduces ("Outlook for Second Quarter 2026") as the reported quarter. The owner accepted the D-98 choices as recorded.
- Advance report/payload/Stage B conventions to 1.34.0/1.39.0/ACCOUNTING_EVIDENCE_16. Stored reports remain immutable. See the [disposition record](docs/audit/2026-10-20-amzn-audit-fixes.md) and D-98.

## Proposed independent audit fixes (2026-10-20)

- Stamp the analysis cutoff after source acquisition, so facts a build has just fetched are not refused as unavailable (PGR-1, PGR-2).
- Compose financing debt from instrument-class tags when a filer tags no long-term-debt aggregate, and withhold a possible double count. Withhold debt whose interest implies more than 25% (O-1, O-2, SNOW-1, SNOW-10).
- Keep total debt when only an operating-lease maturity is missing. Remove the operating portion only when total debt is shown to contain it (FCX-1, FCX-14, CODE-1).
- Mark EV/EBITDA "withheld" in Key data when debt was withheld (O-3).
- Infer zero NCI only from the filing's own pattern, and add a 1% NCI materiality floor for parent P/FCF (SNOW-2, DOC-1).
- Count inferred parent equity as parent equity in P/B, returns and DCF inputs, and withhold composed debt when two instrument classes lie within 2% of each other (review of this change).
- Keep composed long-term debt that holds current notes out of the forensic leverage tests, require a known NCI earnings figure before the 1% NCI floor applies, and keep each lease slice's own tags so a partial operating maturity stays visible beside a finance lease (second review of this change).
- Let a zero current-debt figure compose debt, read zero interest as undisclosed in the debt plausibility check, count quarterly balances in the annual check, join interest across ±5 days of fiscal-date drift, and state the single-signal grade floor in the data-only report (third review of this change).
- Withhold the limited valuation letter from the price-attractiveness summary, stop a debt-recovery info entry from refusing historical EV, require zero NCI earnings to cover the span since the last zero balance, stop counting finance leases twice in the plausibility basis, and keep a proven finance lease in debt on the lease-excluded basis (fourth review of this change).
- Withhold a grade letter that rests on one partial signal, and name P/B fallbacks (PGR-4).
- Commit trimmed SEC companyfacts fixtures for FCX, PGR, O, SNOW and NNN (GATE-21).
- Advance report/payload/Stage B conventions to 1.33.0/1.38.0/ACCOUNTING_EVIDENCE_15. Stored reports remain immutable. See the [disposition record](docs/audit/2026-10-20-independent-audit-fixes.md) and D-97.

## Proposed company eligibility and AFFO comparability (2026-10-19)

- Withhold company analysis for missing classification and explicit non-equity instruments; preserve source instrument types, terminal reasons and narrowly sourced public-metadata enrichment of a confirmed issuer's incomplete profile. Preserve the all-empty source-only fallback.
- Withhold route-dependent valuation, industrial debt metrics and scenarios when strong financial-business evidence conflicts with the route. Retain source observations and require consolidated-scope reconciliation rather than automatically assigning a bank model.
- Gate REIT historical P/AFFO independently from FFO; retain approximate current values without presenting incomparable historical ranks.
- Advance report/payload/Stage B conventions to 1.32.0/1.37.0/ACCOUNTING_EVIDENCE_14. Existing stored reports remain immutable. No model bands, rating quotas or new valuation models are introduced. See the [bounded implementation record](docs/audit/2026-10-19-company-eligibility-affo.md); independent review and full gates precede handoff.

## Proposed source-bound issuer reconciliation (2026-10-19)

PR37 review follow-up expands ingestion to retain source/value-distinct parsed reconciliation and issuer FCF observations from both release and commentary (`current-reports-1.2.1`). Conflicting quarterly selections and non-common FCF definitions are withheld; source-scoped reader keys stay stable through reorder/replacement. This is more than the original presentation-only scope: newly collected facts and context can differ. Saved reports/inputs and scoring/valuation formulas remain unchanged. Independent re-review precedes updating the PR or resolving its discussions.

- Keep reconciliation observations with their exact supplying document, period and unit. Withhold derived EPS differences for ambiguous, unknown or nonfinite operands; retain the underlying observations and issuer basis note.
- Label the rounded per-share arithmetic as a reported EPS difference, without implying independently normalized earnings or an item-level tax allocation. Join issuer FCF only within the exact source and period, without implying available funding or discretionary cash.
- Report spec advances to 1.30.2; payload, pipeline and Stage B analytical conventions are unchanged. The broader normalized-earnings, funding/reinvestment and longitudinal-thesis contracts remain separate. See the [research and bounded implementation record](docs/audit/2026-10-19-phase-two-evidence-foundations.md). Full gates and independent review precede publication.

## Proposed independent-review corrections (2026-10-19)

- Guard canonical EDGAR gross-profit construction and admission, preserving directly filed subtotals and serializing partial-cost refusals. Propagation requires compatible vendor/source scope and preserves existing refusals.
- Use immutable refusal-aware disclosure reads for guidance and quarterly trends, including CFO aliases; restore Unicode dateline separators.
- Advance report1.29.1/payload1.34.1/pipeline stage-c-1.5.1/Stage B ACCOUNTING_EVIDENCE_10. Full gates and fresh independent review remain required. See [correction record](docs/audit/2026-10-19-phase-one-review-corrections.md).

## Proposed phase-one evidence completion (2026-10-19)

- Preserve exact quarter, cash, repurchase and income-classification refusals through payout, liquidity, buyback coverage and forensic consumers; keep raw observations.
- Bind the reviewed Adobe completion alias and actual publication shape, retain bounded official news discovery and exact uppercase compensation-title boundaries.
- Advance Stage B implementation to ACCOUNTING_EVIDENCE_9, report 1.29.0, payload 1.34.0 and pipeline stage-c-1.5.0. Earlier engine snapshots require their original method; saved reports retain bytes.
- PR32 SQLite diagnostics remain a separate commit. Full gates and final independent review are required before push/merge; original FMP 402 cause and private report migration remain unresolved. See [evidence record](docs/audit/2026-10-19-phase-one-evidence-completion.md).

## Unreleased - exact final evidence and interval presentation (2026-10-18)

- Retain failed acquisition attempts as audit history while marking only exact,
  independently admitted final fields resolved. Missing lease or temporary-equity
  categories remain unknown; recovered aggregate debt does not establish funding capacity.
- Preserve an explicitly sourced duration in the filing-fact registry. Wrong
  intervals, signs, currencies and filing dates still fail verification.
- Show separately bound structured accrual measures beside rounded model prose
  across web and exports. Preserve raw prose and strict claim matching.
- Advance report, payload and pipeline versions; saved reports are not rewritten.

See the [bounded follow-up record](docs/audit/2026-10-18-accounting-evidence-remediation.md#bounded-final-evidence-follow-up)
for source scope, deterministic replay and limitations.

## Unreleased - accounting and filing evidence (2026-10-18)

- Separate sourced temporary equity from permanent equity and liabilities;
  preserve unknown components and reject conflicting accounting inputs.
- Reconcile current and noncurrent restricted cash without making restrictions
  available cash. Admit debt carrying values only from a compatible dated note
  and principal reconciliation; preserve incompatible claims and lease scope.
- Use existing actual-observation and window guards for recent-IPO technical
  indicators, and qualify sparse-window drawdowns as observed partial samples.
  Financial-history restrictions, score bands and weights remain.
- Preserve original ratio prose and compare only tightly bound typed measures.
  Label the leadership capital-stewardship proxy and weighted-average share
  measures according to what they calculate.
- Retain bounded source-matched controls, litigation and officer evidence, and
  distinguish completed-financing proceeds and costs from current liquidity.

See the [implementation and verification record](docs/audit/2026-10-18-accounting-evidence-remediation.md)
for evidence, admission limits and review findings. Historical saved reports
retain their original contents; these changes do not establish better returns.

## Unreleased - common-earnings admission (2026-10-18)

- Stop treating preferred cash payments as current-period earnings allocations.
  Preserve admitted common numerators, including zero/losses, and label the
  existing filed-Basic return convention without reconstructing allocations.
- Preserve actual field flow intervals, currency and ownership through annual
  and TTM admission. Refuse known incompatible or incomplete earnings bridges;
  retain unknown-start vendor and compatible nearby-date controls.
- Preserve signed NCI allocations on coherent consolidated TTM flows. Supported
  capital, returns and payout controls remain unchanged; no TCE redefinition or
  investment-scoring recalibration is introduced.

## Unreleased - reported commitment timing (2026-10-18)

- Retain optional source-bound fiscal payment buckets with printed operands,
  scale/currency, exact reconciliation, coverage and supplying exhibit.
- Keep incomplete or unsupported timing explicit across reports, model context
  and exports. Preserve independently supported totals and legacy absence.
- Fiscal labels are not maturity dates. This adds no funding-capacity conclusion,
  net-debt adjustment, DCF deduction or change to investment-scoring defaults.

## Unreleased - common-cash admission (2026-10-18)

- Recognize APIC-inclusive and within-period preferred exposure before using
  aggregate dividend cash as a common-holder proxy. Preserve direct common cash
  and compatible total-minus-preferred cash; reject contradictory components.
- Carry explicit common-cash refusals into serialized statement rows and payout
  admission, including aggregate zero. Unsupported payout history can now withhold
  bank equity valuation; supported TCE and returns remain separately available.
- Preserve source totals, refusal reasons and historical report bytes. This does
  not repair the separate preferred earnings-allocation or flow-period questions.

## Unreleased - research safeguard contracts (2026-10-17)

- Enforce the existing one-band grade contract on ordinary generation, verification,
  fallback assembly and immutable saved-report views. Preserve raw proposals and
  withhold rejected headlines; citation admission does not establish semantic truth.
- Bind ordinary normalized-input snapshots to production build artifacts when
  retained build evidence is available. Missing identity remains unverified.
- Label the existing sum-of-quarterly diluted EPS convention in P/E explanations;
  preserve financial arithmetic and refusal behavior.
- Reconcile the book-derived recommendations and historical decisions with current
  implementations and explicit gates for further analytical models. No calibrated
  scores, case probabilities or return claims are introduced.

See the [disposition](docs/audit/2026-10-17-book-to-code-disposition.md) and
[verification record](docs/audit/2026-10-17-safeguard-verification.md).

## Unreleased - source periods and reporting evidence (2026-10-15)

- Carry optional exact source period contexts, reject supplied contradictions,
  and preserve legacy matching and model-request complexity budgets.
- Assemble exact reported earnings facts and a compatible arithmetic identity
  across live/Markdown/print. Keep these separate from AI opinion and prose
  validation; withhold or normalize unsupported positional bridge references
  with the original text retained in the audit trail.
- Review corrections preserve the actual statement envelope/row/field provider
  origin, retain intervening factual qualifiers when normalizing references,
  use the same payload-backed destination on standalone judge verification,
  and reconcile report-generation timing with the runner's final metadata.
- Distinguish quote observation, financial periods, established filing,
  publication, acquisition, calculation basis and report generation. Reject
  demonstrably future live FMP quote observations before and after cache access.
- Scoring weights, grade rules and scenario priors are unchanged. No new
  predictive-calibration or professional-readiness claim is established.

## Unreleased - financial and evidence integrity (2026-10-15)

- Apply the shared cash/debt/lease reconciliation boundary to current and
  historical EV, leverage, ROIC, REIT equity bridges and WACC debt inputs.
  Preserve explicit zero and valid missing-input fallbacks; reject supplied
  contradictory liabilities instead of treating them as missing.
- Recover current cash-flow quarters when a quarterly filing also includes
  rolling annual net-income contexts; retain annual and non-calendar controls.
  Carry signed equity-method income separately, without assuming tax treatment.
- Retain material earnings-quality and subsequent-liquidity filing context
  within existing excerpt budgets; distinguish filing dates from report periods.
- Check explicitly declared monetary scales once and display the same scale;
  ambiguous units remain unchecked. Export per-value citation status and keep
  numeric provenance separate from whole-prose validation.
- Display supplied numeric periods separately from as-of dates, mark missing
  periods explicitly, and distinguish an untraced figure from a missing citation.
  Keep the remaining generated bridge/citation defects documented in the audit.
- Advance report/payload and replay implementation identities. Stored report
  bytes remain unchanged; see the [audit record](docs/audit/2026-10-15-amzn-integrity.md)
  for reproductions, verification and reliance limits.

## Unreleased - Metis identity (2026-10-14)

- Rename product and repository presentation to Metis, inspired by wisdom and planning; add original vector assets and a [brand guide](docs/BRAND.md).
- Document canonical `METIS_*` configuration and `X-Metis-Token`; retain legacy aliases, local data discovery, credentials and browser preferences.
- Preserve research methods, report schemas, stored report bytes and historical audit identifiers. Earlier entries retain the names used at the time.

## Unreleased — research reliability (2026-10-13)

- Add immutable evaluation snapshots and explicit comparable-outcome checks;
  distinguish operating forecast errors from realized benchmark-relative returns.
- Show model-derived thesis review conditions, actual model-period dates,
  deterministic scenario assumptions, uncalibrated display weights and
  grid-based sensitivity conclusions across app, Markdown and print.
- Add bounded peer collection with issuer/currency/filing/denominator checks,
  metric-specific counts and named exclusions; preserve grading and base DCF.
- Align scenario labels and effective shocks between targets and charts.
  Correct the degenerate-dispersion margin mismatch with a disclosed change
  to affected perturbed/weighted operating paths.
- Preserve legacy reports; separate model-authored scenario commentary from
  computed inputs. Fix mobile table and print text overflow.
- Patch Next/env/ESLint to 16.3.8 and source-map-js to 1.2.2 to clear the
  dependency audit without additional financial-output deltas.
- Prospective forecasting accuracy remains unproven; evaluation infrastructure
  makes future measurement possible without treating current DCF values as
  future-price forecasts.

## Unreleased — growth-anchor span and scenario horizon (2026-10-05)

- The DCF growth anchor uses a 3y or 5y revenue CAGR only when its measured
  span is that window (±0.25 years, grading's rule, now one shared helper). A
  degraded window is listed as unavailable with its span instead of entering
  the median under a label it does not measure (D-39). DEMO's anchor falls from
  three methods to the regression alone; its fair value moves 152.09 → 152.06.
  The displayed CAGR series is unchanged.
- AI reports label each computed scenario target's horizon in code ("explicit
  DCF horizon", or "n/a" without a target), as data-only reports already did,
  instead of keeping the judge's free text such as "12 months" (D-40).
- Report spec **1.10.0** and payload **1.11.0**; saved reports keep their
  stamps, and partial AI passes from 1.10.0 do not resume.

## Unreleased — documentation reconciliation (2026-10-05)

- Reconcile all maintained Markdown with the current source; add detailed
  [application operations and API contracts](docs/OPERATIONS.md).
- Correct keyless coverage, fixture/AI traffic, per-row source provenance and
  the implemented `fmp` policy's missing-member fallback. Document currency and
  temporal eligibility, valuation arithmetic, projections, scores and indicators.
- Explain AI selection, actual/presumed costs, retry/cancel behavior, plaintext
  research storage, export formats and provider-rights limitations.
- Preserve historical findings while mapping their current implementation and
  unresolved limits. Regenerate README configuration/commands/pricing and keep
  the documentation release contract aligned with the new guide.
- Reconcile the final branch against PR #6's permanent credential mutex,
  completed-session beta/calendar FRED rules, current version stamps and
  expandable evidence/chart-data controls before integration.

## Unreleased — evidence-qualified recommendations (2026-10-04)

- Replace stale-PID credential-lock deletion with a permanent, marker-only
  SQLite mutex using native process ownership. Preserve credential envelopes;
  upgrades/downgrades require stopped servers and the documented legacy-lock
  migration in [Privacy](docs/PRIVACY.md).
- Use completed regular US month-end sessions for beta and calendar lag periods
  for monthly, quarterly and annual keyless FRED transformations. Missing periods
  withhold affected changes; holiday and sparse-frequency limits are disclosed.
- Withhold current-day and future beta bars until the next UTC day, since daily
  history can contain an unfinished final-session bar; quote/chart bars remain.
- Add independent normalized statement references for six issuers across twelve
  annual periods, with source/basis notes, absolute-unit anchors and sector-policy
  checks. These strengthen regression detection, not forecasts or parser coverage.
- Add keyboard-accessible recorded grade/DCF provenance and optional 30-row
  price/relative-strength tables in both designs. Tables and canvases share exact
  prepared values; zero, missing observations and individual baselines stay distinct.
- Stamp report 1.9.0 / payload 1.10.0 to separate the financial conventions while
  preserving saved reports and their original values.
- Record the critical review of all seven recommendations, evidence, alternatives
  and justified deferrals in the [recommendations ledger](docs/audit/2026-10-04-recommendations.md).

## Unreleased — audit follow-up (2026-10-04)

- Withhold three-year revenue acceleration when the observed history spans a
  different horizon; preserve the separately disclosed degraded CAGR series.
- Reject invalid freshness dates and prevent future/invalid IPO dates from
  triggering recent-IPO treatment. Report 1.8.0 and payload 1.9.0 distinguish
  these conventions; saved reports retain their original bytes.
- Validate consumed credential-store fields before mutation and clean owned
  locks/descriptors after acquisition I/O failures. Preserve historical valid
  selections and unknown metadata. Concurrent stale-lock recovery remained open
  in this batch; the later recommendations batch replaces that locking protocol.
- Report exact judge-case excess and actual shortening, including escaped text
  and partially recorded historical metadata. Protected citations remain intact.
- Expose scenario target provenance and clearer catalyst/risk dates, direction,
  severity, probability and source labels in both existing designs.
- Full evidence and remaining limits are recorded in the
  [audit follow-up](docs/audit/2026-10-03-repository-audit.md#follow-up--2026-10-04).

## Unreleased — repository audit (2026-10-03)

- Count only adjacent monthly observations within five calendar years for beta;
  recognize reverse-DCF solutions at the inclusive search bounds.
- Preserve missing FRED periods before lagging; include parsing in the shared
  filing-extraction budget. Reserved demo reports no longer claim EDGAR evidence.
- Require adjacent fiscal years when averaging capital for ROIC, ROTE and
  DuPont; disclose the existing single-period fallback for gaps and short stubs.
- Withhold saved report content whose issuer disagrees with its database row.
- Corrected CLI exports now refuse existing HTML/JSON destinations. Choose new
  filenames; the source database, linked files and existing exports are preserved.
- Preserve billing evidence when a paused continuation is refused; update job
  revisions after cost reconciliation; preserve UTF-8 across Gemini stream chunks.
- Preserve financial punctuation in verdict comparisons. Surface watchlist
  failures, improve secondary-text contrast, and retain chart gaps and isolated
  observations. Remove the unused direct legacy ESLint compatibility dependency.
- Report spec 1.7.0 and payload 1.8.0 distinguish corrected calculations while
  preserving historical report bytes. Retain the current UI by default and add
  the owner-selected Research workspace in Settings → Appearance, with a saved
  browser preference, lighter responsive layout and report evidence sidebar.
  Keep the offline comparison lab for the design rationale.
- Reconcile methodology, provider-rights guidance and historical-document status.
  See the [audit evidence and limits](docs/audit/2026-10-03-repository-audit.md).

## Unreleased — AI execution, current Claude models and limited FMP access

- Refresh ChatGPT account models automatically, preserve saved selections, and
  offer GPT-6.1 Sol explicitly with an access-unconfirmed label when absent.
- Add separate ChatGPT reasoning and Standard/Fast controls. Preserve requested
  and provider-reported settings, model IDs and tokens through saved reports,
  recovery, history and exports; do not infer missing provider evidence.
- Keep Gemini multi-model usage explicit, include reported cached input and
  reasoning tokens, and reject missing or invalid usage records.
- Learn explicit FMP endpoint/symbol subscription refusals for 15 minutes to
  avoid repeated unavailable requests, while preserving cached successes and
  keeping other keys, endpoints and symbols eligible.
- Show SEC contact readiness and explain why unconfirmed issuer identity blocks
  fallback data. An FMP key alone does not establish paid endpoint access.
- Add Claude Opus 5.5 and Sonnet 5.5 with current prices, cache rates and request
  capabilities. Auto prefers Opus 5.5; Haiku's judge floor is Sonnet 5.5.
  Preserve explicit saved selections and update model/effort usage guidance.
- Account for Claude fallback attempts separately, include server-tool sampling
  inputs and configured fallback exposure in spending limits, and label incomplete billing evidence as presumed.
  Preserve model changes in streams and valid content during continuation.
- Stop retrying an enforced Claude spend cap and respect Retry-After during
  temporary throttling.
- Recover completed ChatGPT output items when the terminal event omits them;
  retain failed-pass usage and distinguish unknown model/usage from zero.
- Display missing and sparse assessments honestly across AI and data-only
  reports, watchlists, history and exports; distinguish routing evidence from
  XBRL validation and retain the actual provider in judge disclosures.
- Use configured Finnhub news and upcoming-earnings fallbacks when FMP cannot
  provide them, retaining provenance and genuine subscription limitations.
- Preserve presumed billing and original model requests through pass settlement
  and recovery; match Claude refusal billing to actual model transitions.
- Disable redundant local HTTP compression that accumulated drain listeners.
- Refine broad financial classifications using strong filing evidence, pair
  common earnings with common equity, and withhold industrial cash-flow/EV
  signals on financial routes. Report spec 1.6.0 and payload 1.7.0 preserve
  historical reports while invalidating incompatible partial analysis.

## 0.1.0 — 2026-10-03

First tagged open-source release of the local, single-user application. The
sections below record the earlier development batches included in this release.

- AI connections support official ChatGPT plan OAuth and Google sign-in through
  the installed Gemini CLI. The selected connection runs bull, bear and judge
  passes; calculations and citation verification remain deterministic.
- Account/model changes invalidate incompatible partial work. Connection or
  quota failures never switch to API billing. Claude API remains optional.
- Subscription passes use supplied evidence without extra web search and
  disclose that `$0` API charges do not measure subscription allowance.
- Credentials remain in protected per-user storage; disconnect stops local
  requests. ChatGPT revocation failures are disclosed. Live OAuth sign-in and
  inference remain unverified; see D-33 and the release review.

- Historical valuation bands stop at a quarter whose currency is missing or
  incompatible; annual vendor ROE no longer masquerades as TTM ROE.
- Operating margins, projections, returns and debt coverage use operating
  income. Broader vendor EBIT cannot substitute for missing operating income.
- Computed REIT FFO and AFFO disclose unreconciled affiliate and ownership
  adjustments. Neither is claimed to bound the issuer's reported figure.
- Data-only fair-value prose uses the figure's established currency.
- Maintenance commands load the application's environment files before using
  keys or database paths. The pricing refresh reads explicit table headers
  and refuses incomplete or ambiguous updates.
- Remove the vulnerable lint-only glob dependency through a scoped directory
  adapter; unsupported custom root patterns fail explicitly (D-32).
- Setup includes clone and production instructions; private environment-file
  variants are ignored while the placeholder example remains tracked.
- Report spec **1.5.0**, payload **1.6.0**: earlier reports retain their saved
  values and incompatible analysis passes cannot be resumed.

Validation and remaining limits are recorded in the
[release review](docs/audit/REMEDIATION-REPORT.md#release-review-2026-10-02).

## Included development batch — stock-split correctness (2026-09-30 to 2026-10-02)

Share counts and prices are combined only on one established split basis. The
convention is D-30 in [`docs/audit/DECISIONS.md`](docs/audit/DECISIONS.md); the
provider conventions are tabled in
[`docs/METHODOLOGY.md`](docs/METHODOLOGY.md#stock-splits-and-the-share-basis).

### Version stamps

- **`REPORT_SPEC_VERSION` 1.3.0 → 1.4.0** and **`PAYLOAD_VERSION` 1.4.0 →
  1.5.0.** Reports saved under 1.3.0 are read, rendered and exported as stored;
  the history diff marks a 1.3.0 → 1.4.0 comparison "spec-version-mismatch". An
  analyst or judge pass stored under payload 1.4.0 is not resumed under 1.5.0.

### What a reader notices

- **A split changes the share basis on its first split-adjusted trading
  session**, taken from the price vendor's split events — not on an XBRL
  context date, which may be an approval, record or legal-effective date. A
  board approval tagged weeks before trading no longer multiplies the share
  count while the market still prices the old shares.
- **A split the market has priced but SEC companyfacts does not carry yet** is
  applied from the vendor's event; one both describe is applied once.
- **No split list, no share figure.** When the vendor's split list could not be
  retrieved, does not cover every day a share count must be carried across
  (no weekend or holiday allowance), or lists an event that is not a split
  ratio, the count is withheld rather than read as "no splits".
- **Disagreeing split descriptions are not multiplied.** Two vendor events
  within a week that differ in ratio or session leave the split unresolved and
  its figures withheld. Each retrieved answer also retains its own coverage:
  an answer that omits an event another lists within that coverage makes it
  unresolved even when their reported dates differ by more than a week.
  Warnings name the answers that disagree.
- **Small EPS cannot hide a split error behind cent rounding.** Vendor EPS
  must match the filer's same field within 3% of its magnitude, and zero must
  match exactly. A fourfold error from $0.0025 to $0.01 is withheld. Ordinary
  rounding inside 3% still passes; greater rounding uncertainty withholds the
  field instead of approving its basis.
- **Uncertain share basis empties the figure at its source**: EPS and share
  counts on the affected statement rows, the market cap, market-cap history,
  enterprise values and free float. EPS growth, P/E, DCF and excess-return per
  share, the reverse DCF, REIT P/FFO, the share-count trend, dilution, the
  grades and the AI payload therefore read "n/a" for it; revenue, margins and
  free cash flow are unaffected.
- **Nothing is adjusted twice.** A count filed after a split, and each vendor
  EPS or share-count field that matches the filer's restated value for the same
  field, are used as they are; a field the filer does not state is withheld.

## Included development batch — currency integrity (2026-09-28 to 2026-09-30)

Money figures now carry only a currency their own evidence establishes, and
nothing combines figures across currencies. The conventions are D-28 and D-29
in [`docs/audit/DECISIONS.md`](docs/audit/DECISIONS.md).

### Version stamps

- **`REPORT_SPEC_VERSION` 1.2.0 → 1.3.0** and **`PAYLOAD_VERSION` 1.3.0 →
  1.4.0.** Reports saved under 1.2.0 are read, rendered and exported exactly
  as stored — never restamped or rewritten — and the history diff marks a
  1.2.0 → 1.3.0 comparison "spec-version-mismatch" instead of setting the two
  side by side. The checked-in sample report stays a 1.2.0 report.

### What a reader notices

- **No figure is shown in dollars by default.** An unestablished currency
  reads "currency unknown"; the quote is in the trading currency, model values
  in the model's (statement) currency.
- **Figures that combine statements or years need one established
  currency.** Interest over debt, ROIC, DuPont, net debt, the DCF, forensic
  scores, growth rates and projections use only rows established in the model
  currency, back to the first that is not; a row with no currency label is not
  assumed compatible. Where that leaves too little, the figure is withheld with
  the reason (`compute.<statement>.currency`). Margins stay per row.
- **No comparison with the price across currencies.** Upside, price
  multiples, reverse valuations, market-value weights and the grades built on
  them need the model and the quote in one known currency. No FX conversion is
  ever applied.
- **Analyst estimates count as money only in their own currency.** FMP's
  estimate and price-target rows carry none, so they are shown as "currency
  unknown", are not citable evidence, and no longer feed the DCF growth
  anchor; the DEMO sample's DCF per share moves from 146.23 to 152.09.
- **The report built without AI states each year's free cash flow in its own
  cash-flow row's currency**, and never shows a history across a currency
  change.

## Included development batch — full codebase audit of 2026-09-06

Every source file, test and document was read against the others; 232
findings from independent reviewers were verified one by one, and the slices
no reviewer reached were audited directly. The record is
[`docs/superpowers/audits/2026-09-06-full-codebase-audit.md`](docs/superpowers/audits/2026-09-06-full-codebase-audit.md);
the conventions it changed are D-24 to D-27 in
[`docs/audit/DECISIONS.md`](docs/audit/DECISIONS.md). What follows is what a
reader of the previous release notices.

### You may need to act

- **`npm run costs:reconcile` now works.** It targeted a Cost API path that
  does not exist and read amounts in cents as dollars, so it had never lowered
  a presumed row. If you carry presumed spend from an earlier crash, run it
  again with `ANTHROPIC_ADMIN_KEY` set.
- **`.env.example` gained `NEXT_TELEMETRY_DISABLED=1`.** The Next.js CLI that
  `npm run dev` and `npm run build` invoke sends anonymous usage telemetry
  unless opted out; the app itself still sends nothing. Copy the line into an
  existing `.env`, or run `npx next telemetry disable` once for the machine.
- **`npm run audit:deltas -- --write` now needs `--group` for a leaf that
  moved again**, not only for a new one: a value that changed since it was
  blessed is a new change and the old reason does not describe it.
- **`AGENTS.md` and `CLAUDE.md` are gitignored.** `next dev` regenerates them
  and the release allowlist forbids tracking them.
- **Every run's report changes shape slightly.** New disclosures print on the
  page (the stored disclaimer beside the grades; the ROIC lease basis; the
  WACC's debt and coverage basis; the grid's held excess; the news-section
  truncation note; N beside every own-history rank as "rank X/100 of N
  quarters"), one score band moved (a partially evidenced Piotroski signal
  now enters the quality aspect at the weight its evidence supports), and the
  audited-fixture comparison carries dated groups for every leaf that moved.

### Fixed — money and the provider

- A mid-stream connection failure surfaced as a bare SDK error that the retry
  classifier rejected, so the pass rejected instead of retrying; a signal
  abort during a retry backoff could hang the analyst orchestration forever;
  a `pause_turn` resumption ran without the idle guard on a hard 600 s client
  timeout; a fallback-served message was priced at the serving model's rate
  for every token; the reported `max_tokens` was the pass constant rather
  than the limit sent. All repaired, each with a test.
- A deliberately aborted stream settled at the `message_start` snapshot as an
  `actual` row; it now settles what was reported plus the presumed remainder,
  flagged presumed, like a dead stream.
- The scheduler: presumed rows are stamped with the lease's own acquisition
  time (an overnight sweep zeroed real spend against the wrong day); a late
  settlement on an expired, unswept lease is accepted; `settleRequestCost`
  versions the snapshot so the SSE stream delivers the change; an
  over-reservation records the measured cost before raising; the reconciler
  counts already-reconciled presumptions as accounted; bucket bounds are
  normalised.
- The runner: the presumed-spend disclosure and discarded-attempt marking
  read every generation; a Stage B exception is filed as a critical
  `pipeline.compute` gap instead of vanishing; the admission lease is dropped
  only after the durable write commits; the verify checkpoint's admission is
  registered.

### Fixed — the analysis

- Stage B: the three fundamentals-dependent bases now agree — invested
  capital, the WACC's debt leg and the enterprise-value bridge remove the
  same operating-lease slice; interest expense and EBIT come from one
  statement basis; one Blume constant serves the WACC and the keyless beta.
  Every DCF re-run (bull, base, bear, the projection fan) bridges on the
  bridge the base case used, and the sensitivity grid holds the terminal
  excess rather than the terminal level. The EBIT-margin ceiling never binds
  below a margin the issuer has earned. Graded signals carry an evidence
  fraction. Restatement double-rows collapse in the returns and capital
  series. The REIT cap rate uses the house enterprise value; the own-history
  P/FFO band is withheld when the current FFO is a different construction.
- Stage C: the judge is no longer told it may search the web; the
  named-individual rule admits the payload's own executive and insider rows
  and states both sides of the rule; the per-claim case cap is measured on
  the serialised text and tightened from the originals; a truncation never
  overruns its budget and the news section discloses clipped rows; the
  data-only report prints FRED units and scales, net segment shares, an exact
  coverage figure and "placeholder" wherever a letter is not a grade; the
  consistency checks read the id's final segment, admit bare magnitude
  words, and skip capitalised direction words inside proper nouns; a job
  cancel no longer relabels both analyst sides as sibling-abandoned.
- EDGAR: `Revenues` precedes the ASC-606 elements in every chain; Form 40-F
  is a core form; a split re-tag is measured from the previous one; the
  successor's own-history test is an annual core-form fact.
- Providers and cache: an object body on an array endpoint is refused before
  admission; the plan-limit gate records only a limit the vendor answered in
  full; the keyless quote's previous close comes from the chart's own
  penultimate bar; HOUST and TOTALSA name their annual-rate basis; response
  bodies are capped at 64 MiB and never re-downloaded on retry; concurrent
  cache misses share one fetch.
- Found by the one paid run made after the audit (AAPL on Haiku at low
  effort, $0.60): the WACC row printed the Blume weights as raw floats, and
  the named-individual manifest sentence described the rule before the audit
  widened it. Both fixed.

### Fixed — the app

The in-app report prints the stored disclaimer; share-count bars start at
zero; the projection fan's bridge row shows only the historical value; the
page refreshes when a job completes; the own-history label matches the
exports; the sidebar's remove control is no longer nested in the link; the
report tabs have tab semantics and arrow-key switching; the returns panel
shows the module's spread or "n/a" rather than a fabricated one; the
home and settings banners say what a keyless run actually serves.

### Tooling and tests

Every script's "am I the entry point?" test resolves symlinks, so a release
gate cannot silently no-op on a linked checkout. The live-smoke opt-in
narrows the offline guard to `sec.gov` only. Six risk-bearing modules joined
the per-file coverage contract and a walk of src/ fails the build when a
module is in neither contract. The runner's analyst admission is asserted on
the real pass runner. The audited-fixture helper's label and hash are
corrected.

### Documentation

README, METHODOLOGY, RESEARCH, PRIVACY, DECISIONS (Revised notes on D-09,
D-20, D-22), the remediation report and the pricing generator were corrected
where they had drifted; 130+ code comments and twenty user-visible strings
that cited section numbers of retired design documents now cite a living
heading or none. Retired audit records and notes were removed; the 2026-09-06
audit document is the record that supersedes them. `docs/RESEARCH.md` §8
weighs the candidate improvements the audit left open against the published
evidence and ranks them.

## Unreleased — per-request admission restored, effort-aware idle guard

Found by a live run on 2026-09-03: AMZN on `claude-fable-5-1` at effort `max`.
The bull pass reported five output tokens, went quiet while the model reasoned,
was abandoned by the 120-second idle guard, and settled at $6.86 — of which
$6.40 was a presumed remainder of 127,995 output tokens the run has no evidence
were ever generated. The job produced no report. Three defects, one chain:

- **Per-request cost admission was silently off for both analyst passes.**
  `runBullThenBear` built each request's arguments BEFORE the `beforePass` hook
  the runner registers that pass's admission in, so the arguments captured
  `undefined`. Every provider request in the streaming path — the production
  path — therefore ran outside the per-request reserve/settle machinery
  introduced with `THESIS_RESERVATION_MODE=request`. The mocked pipeline tests
  called the hook in the right order, so nothing caught it. The judge pass was
  never affected. Arguments are now built after the hook, as the non-streaming
  fallback always did.
- **A presumed cost was recorded as an actual one.** With no per-request
  admission, `settleIdleRequest` returned early and the pass settlement wrote
  the figure with `settlementKind: "actual"`, which `npm run costs:reconcile`
  will not lower. Restoring admission restores the `presumed` marking the
  reconciler needs.
- **The stream idle guard was blind to the signal that proves a request is
  alive.** Anthropic keeps a long stream warm with SSE `ping` events, and the
  Anthropic SDK discards them before any listener runs
  (`core/streaming.js`: `if (sse.event === 'ping') continue;`) — while undici's
  ~300-second idle body timeout counts them as socket traffic and does not. The
  guard also cannot see that the model is working: Metis never asks for
  thinking summaries, so reasoning produces no stream events on any model. At a
  flat 120 seconds it therefore pre-empted a working detector with a blind one
  and killed healthy paid passes mid-reasoning.

  `THESIS_STREAM_IDLE_SECONDS` now defaults to **300** — at undici's window, so
  a dead connection is caught by the layer that can see pings and retried,
  leaving this guard as the backstop for a socket kept warm by pings that never
  produces anything. Effort scales the base (×1 low/medium, ×2 high, ×3 xhigh,
  ×4 max), bounded by the model stage deadline rather than by
  `ANTHROPIC_REQUEST_TIMEOUT_MS`: that timeout is armed around the fetch, which
  for a streaming request resolves when the response headers arrive, so it
  bounds how long the provider may take to answer and not how long the stream
  may run. Zero still disables the guard. At the settings that produced the
  loss — Fable 5.1 at effort `max` — the limit is now 20 minutes of application
  silence rather than two.

- **A doomed run kept paying for its second analyst pass.** Once one side fails
  unrepairably the runner's `recoverable` test is false and the job degrades to
  a data-only report whatever the sibling does — but `runBullThenBear` awaited
  both sides regardless. On 2026-09-03 bull was abandoned at 19:05:00 and bear
  billed on until the user cancelled it by hand at 19:13:12: eight minutes of
  paid output for a report that could no longer be written. A side that ends the
  run now stops its sibling at once — the sibling is not launched at all if it
  had not started, and is aborted mid-stream if it had, settling only what it
  actually billed. A schema-invalid output is still repairable, so it never
  stops the sibling. The provider now flags a caller abort (`error.aborted`) so
  a pass we stopped on purpose is reported as abandoned rather than as a
  provider fault, and a side that failed on its own in the same instant keeps
  its own message.

The README cost table also published one estimate for all five effort levels
while the ceiling a pass bills against doubles at `high`. It now carries an
**analyst output ceiling** column showing that step per model (Fable 5.1:
$3.20 → $6.40), and says plainly that the estimated run is measured at effort
`high` and does not scale above it.

## Unreleased — 2026-09-02 audit remediation

The 2026-09-02 README audit found stale documentation, unusable spend caps, gaps
in the keyless data path, valuation conventions that were not disclosed as
conventions, an AI judge with a fixed reading order, and no statement of what
leaves the machine. This release is the remediation. Nine workstreams, each
reviewed afterwards by a reader with no history with it;
[`docs/audit/REMEDIATION-REPORT.md`](docs/audit/REMEDIATION-REPORT.md) walks
every acceptance criterion and
[`docs/audit/DECISIONS.md`](docs/audit/DECISIONS.md) records why each choice was
made.

The remediation ran from 2026-09-02 to 2026-09-03 and closed with a live
measurement: one paid Opus 5 run, whose findings are in this changelog.

### You may need to act

- **`ANALYSIS_MODEL` no longer accepts a dated snapshot** for any model but
  Haiku 4.5. From Claude 4.6 onward the dateless id *is* the pinned snapshot, so
  `claude-opus-5-20260115` never existed; it is now rejected at model resolution
  with the id to use instead, and the run degrades to a data-only report rather
  than failing silently. Set `ANALYSIS_MODEL=claude-opus-5`.
- **Spend caps changed meaning, in your favour.** A reservation is now one
  provider request's maximum rather than a whole pass's worst case, so
  `THESIS_MAX_JOB_COST_USD` can sit near real spend — a few dollars — where
  before any workable value rejected every job. `THESIS_RESERVATION_MODE=pass`
  restores the old behaviour for one release.
- **Lease minimums are enforced at startup.** `THESIS_PAID_PASS_LEASE_SECONDS`
  must exceed 660 (the 600-second provider timeout plus the margin an abandoned
  stream needs) and must not exceed `THESIS_JOB_LEASE_SECONDS`. A process whose
  configuration violates either refuses to start rather than losing a healthy
  job mid-run. The defaults, 900 and 900, satisfy both.
- **Scripts and non-browser clients need a token.** State-changing routes reject
  a request carrying neither browser Fetch Metadata nor a matching `Origin`.
  Browsers are unaffected; curl must send `X-Thesis-Token` with the contents of
  the `csrf-token` file the server writes at startup and names on stdout.
- **`DEMO` and `DBNK` are reserved.** They are served from fixtures whatever
  keys are configured, and reach no provider at all. Previously a configured FMP
  key sent them to the vendor as ordinary symbols.
- **`THESIS_JUDGE_ORDER=both` reserves twice as much in pass mode.** It issues a
  second, mirrored judge request per attempt, and only the default
  `THESIS_RESERVATION_MODE=request` admits and settles each one on its own. In
  pass mode the judge reservation now doubles to cover both, because nothing
  admits them separately — a `THESIS_MAX_JOB_COST_USD` sized against the old
  single-order bound will reject those jobs. The default mode is unaffected.
- **Node 22.18 is the floor** (`engines.node`). CI tests Node 24.

### Added

- `config/models.json`: a checked-in model registry — ids, prices, context and
  output limits, effort support, thinking rules, the web-search tool variant and
  the judge floor — that drives request shaping, pricing, the allow-list and
  `auto`. `npm run models:refresh` diffs it against the published list without
  sending a model request.
- Presumed spend: a paid reservation whose lease expires without settling is
  recorded at its reserved maximum rather than vanishing, and lowered only by
  evidence — a late settlement, or `npm run costs:reconcile` against the Usage
  and Cost API. It reaches the report and the missing-data manifest.
- `THESIS_STATEMENT_SOURCE`, backfilling statement history from SEC EDGAR when
  an FMP plan truncates it, with per-period provenance.
- Successor registrants reach their predecessor's history: the 8-K12B says the
  registrant is a successor, and the predecessor is found in the co-registrant
  list of the filings the two entities made jointly. Multi-class share counts
  are summed; public float carries its own measurement date; restatements are
  flagged against the value they replaced.
- Sector routing reads XBRL tag evidence, not only the SIC code and industry
  label. Financial routes withhold the models whose assumptions they break and
  value the company on excess returns to equity instead.
- `THESIS_JUDGE_ORDER`: the judge's reading order is drawn from the job id
  rather than fixed at bull-first, and `both` runs it twice and reconciles.
- Deterministic consistency checks in the verification pass: direction, period
  and unit words are checked against the figure the sentence cites, reported
  separately from citation coverage.
- `THESIS_RESUME_ON_START=0` holds queued paid work until an explicit resume.
- [`docs/METHODOLOGY.md`](docs/METHODOLOGY.md),
  [`docs/PRIVACY.md`](docs/PRIVACY.md) and
  [`docs/DATA-RIGHTS.md`](docs/DATA-RIGHTS.md).

### Changed

- Every paid pass streams, behind an idle guard (`THESIS_STREAM_IDLE_SECONDS`)
  that abandons a provider which accepts a request and then goes silent.
- Near-term growth is the median of the available methods, not the lower of two
  CAGRs; the sign-disagreement rule is retired.
- Free cash flow is reported after stock-based compensation, with the before
  figure beside it.
- Enterprise value excludes the operating-lease liability only — the finance
  slice is debt in a frame that measures EBIT before finance-lease cost — and
  the own-history rank is built on the same basis as the current multiple.
- The own-history multiple figure is a rank among N quarters, not a percentile,
  and N is printed beside it.
- The disclaimer names what the report emits: letter grades and scenario price
  targets, neither a recommendation.
- The README is generated where it can be: its configuration, commands and cost
  tables come from `.env.example`, `package.json` and the model registry, and a
  doc-lint test fails if the checked-in file drifts from them.

### Fixed

- A crash or retry no longer re-bills a whole run: per-request cost rows are
  paired with their pass artifact, so durable resume works again.
- `THESIS_MAX_ACTIVE_LLM_CALLS=1` can now send a request at all, and the default
  of 2 no longer serialises the bull and bear passes into a lost prompt cache.
- Ordinary industrials with a treasury portfolio are no longer routed to the
  mortgage-REIT map.
- Short-term debt keeps the current maturities of long-term debt.
- The declared SEC contact identity no longer travels in Yahoo requests.
- `npm test` and `npm run test:integration` no longer spawn a package manager
  that can reach the network.
- EBIT is the issuer's operating income. It was pre-tax income plus interest
  expense whenever both were filed, which reintroduced every non-operating item
  the operating-income derivation removes and published a figure that
  derivation had refused outright for a bank or a double-counted interest
  add-back. Where operating income cannot be derived, EBIT is withheld and
  named in the missing-data manifest.
- The shared-model-family disclosure now fires on the production path. It was
  computed from a list that is empty there, so a run whose judge and analyst
  shared a model family never said so.
- Disclosing a failed consistency check no longer invalidates the completeness
  metadata computed from the same manifest. The same repair closes a run with
  presumed spend reporting itself inconsistent.
- A mirrored judge request that throws no longer discards the already-billed
  primary; the primary stands, settles once, and the failure is disclosed.
- Four consistency checks stopped flagging correct prose: a lower-is-better
  metric described correctly, a percentage coinciding with a scaled figure, a
  bare quarter read as a two-digit year, and person claims accepting any
  citation in the payload.
- A pass that was rejected and re-run now says so. The report billed twice for
  one result and showed two rows for the same step with nothing to distinguish
  them; the wasted row is marked `discarded` and the manifest names what it
  cost. The failure itself — a zod error that quotes the model's own rejected
  output — is recorded against the run rather than copied into the report.
- A schema rejection is diagnosable after the fact. The validation error naming
  the field and the rejected value was dropped when the failure was written to
  the pass artifact, leaving only the category behind.
- A successor registrant's predecessor is found again. The lookup read the
  8-K12B's submission header and stopped, on the premise that it co-registers
  the predecessor. The recorded SEC response for the case this was built for
  names one filer, itself — so nothing resolved, and the only fixture was
  hand-built in the shape the code expected. The predecessor is now found by
  reading a short ranked list of the registrant's submission headers, capped at
  four requests, and the disclosure names the filing that actually co-registered
  rather than assuming it was the 8-K12B.
