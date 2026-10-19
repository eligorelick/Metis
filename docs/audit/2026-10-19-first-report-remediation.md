# First ADBE report audit remediation

The immutable acceptance run on `2e256bd` completed as report 1, job
`9d9f454c-326b-4a9e-bc0f-f251d2783273`. Its source snapshot, report, pass
artifacts and original exports remain unchanged. The independent review found
four P2 issues and three P3 issues. This change addresses the reusable source
and presentation paths; it does not edit that report or substitute a ticker
specific financial value.

## Source admission and dependent calculations

* **IR-01, investment classification:** FY2025 vendor purchases and
  sales/maturities do not reconcile to the same-period filed short-term
  components. Complete compatible filed components now cause unreconciled
  generic investment buckets and their unclassified residual to be refused.
  Raw observations remain in the source envelope. No mixed long-term
  investment/intangible/other payment is classified as a financial asset.
  Financial-asset-adjusted accruals become unavailable; the separately named
  operating-only definition uses net income less CFO and feeds the score.
  The regression also independently checks the filed-component construction:
  financial investment cash flow -860 million, operating CFI -327 million,
  and accruals -2,574 million under the previously displayed convention.
  [FY2025 filing](https://www.sec.gov/Archives/edgar/data/796343/000079634326000003/adbe-20251128.htm).
* **IR-04 / AUD-003, cash:** The prior check required an absent vendor start
  date and identical filing IDs at both cash instants. It also required the
  vendor amounts to agree before comparing cash movement. The new comparison
  derives the exact quarter from filed FX-inclusive cash flow and requires
  filed unrestricted and restricted-inclusive cash scopes to agree at each
  instant. Compatible adjacent filings are allowed; wrong issuer, currency,
  interval, filing, future, ambiguous or different restricted-cash scope does
  not manufacture a comparison. A contradicted instant and dependent movement
  are refused; prior refusals and serialized aliases remain closed.
  [Q2 filing](https://www.sec.gov/Archives/edgar/data/796343/000079634326000112/adbe-20260529.htm).

## Corporate-event discovery

**IR-02 / AUD-004:** Earlier tests supplied convenient homepage anchors and
a compact article. The actual static homepage lacks those investor/blog
anchors. The current production transport additionally observes HTTP 403 at
the homepage; the old loop stopped there. The official blog index embeds
featured article URLs in bounded gzip/base64 CaaS configuration, rather than
ordinary article anchors. Generic filing extraction also duplicated normalized
headings ahead of the issuer statement, so removing a raw heading prefix failed.

A reviewed Adobe index adapter is bound to the exact confirmed CIK, legal name
and official website. It reads the public blog index even when the homepage is
unavailable, without retrying the denied page. Its authority chain starts at
the index and carries an explicit reviewed-index basis and index hash; it does
not claim a homepage link. Compressed configuration is parsed only as bounded
data (six configurations, 128 KiB decompressed each); it cannot supply event
facts or trigger scripts. Article URLs remain on the confirmed issuer domain.
The fetched article must still pass public DNS pinning, URL/redirect, date,
issuer subject, negation and full-sentence checks. The existing six-request,
twelve-second and page/excerpt limits remain. Unavailable discovery remains a
coverage gap, never evidence of no events.

Full captured homepage, compressed index and article fixtures exercise the
DataBundle to citable-payload path, including homepage HTTP 403. A public live
diagnostic using the production DNS-pinned reader now retains the
[September 23 completion announcement](https://blog.adobe.com/en/publish/2026/09/23/adobe-completes-acquisition-of-topaz-labs).
Shared analysis instructions reconcile later completed status with earlier
agreement and explicit historical closing-window evidence; completion does not
establish final consideration, funding or integration results.

## Report meaning and local disclosures

* **IR-03:** Provider estimate EPS has no verified GAAP/adjusted basis. Labels
  and price/provider-EPS quotients now say accounting basis unverified. The
  payload and shared prompt prohibit assuming comparability to GAAP TTM,
  historical P/E, adjusted guidance or model operating EPS. Numerical proximity
  to guidance is not source verification. No DCF/scenario arithmetic changes.
* **IR-05:** The own-history signal names its actual evidenced multiple (for
  example EV/EBITDA) and says P/E history comparison is unavailable, without
  calling an available current P/E unavailable. Stable stored signal IDs remain.
* **IR-06:** Actual grid notes survive into the shared web/Markdown/print audit
  tables. Explicit reinvestment is floored at zero, and terminal ROIC retains
  its disclosed spread over each cell's WACC. These disclose existing arithmetic.
* **IR-07:** Dated remaining repurchase authority is extracted from a retained
  primary quarterly MD&A, with the existing strict issuer/document/period/date
  gate and statement-currency agreement. Its source and as-of travel separately
  from earnings-release capital-return facts. The flat-share policy remains;
  authorization is discretionary and is not funded future repurchase evidence.

## Review and acceptance

Behavior stamps advance to report `1.30.0`, payload `1.35.0`, Stage B
`STAGE_B_2026_10_ACCOUNTING_EVIDENCE_11`, and pipeline `stage-c-1.6.0`.
Earlier passes cannot resume as equivalent. Regression failures were recorded
before the source and presentation fixes. Targeted checks, all ten offline
gates on the exact committed revision, independent code review, and a controlled
fresh run with source/report audit are required before acceptance. No push or
merge is authorized by these changes alone.


### IR-04 independent-review followup before rerun

The exact prior-filing negative control changes only the captured Q2 vendor
filing date to March 25. Before the fix, cash movement was incorrectly refused
because a dependency filing matched, while both endpoint comparisons skipped
the row. All three comparisons now use the ending/current-flow filing anchor.
Prior-quarter filings remain in the calculation provenance, and existing
refusals remain authoritative. The valid June 15 comparison, absent vendor
start date, strict scope controls and serialized refusal closure remain covered.
No controlled rerun occurred on either earlier remediation revision.

### Controlled-rerun wording followup (D-93)

The single rerun on `094db80` completed with updated source admission, Topaz
status, EPS qualifiers and sensitivity disclosures. Its independent acceptance
audit remains separate from this code change. Two residual explanations came
from deterministic templates, not model-authored prose: the EPS projection note
called an MD&A authority figure an earnings-release figure, and forensic/grade
fallback notes called reported but refused investment components not reported.

The projection now names the retained issuer disclosure and preserves its
source identifier/date. Forensic and score explanations refer to compatible
admitted inputs being unavailable or unreconciled, preserving absent/refused
distinctions without inventing a specific unavailable cause. All arithmetic,
refusals, amounts, dates, source records and the flat-share policy are unchanged.
Regressions cover 10-Q, 8-K exhibit and absent source labels, plus the captured
reported-but-refused investment path through accruals and grade explanations.

Patch stamps are report `1.30.1`, payload `1.35.1`, Stage B
`STAGE_B_2026_10_ACCOUNTING_EVIDENCE_12`, pipeline `stage-c-1.6.1`. Both original
reports remain immutable. A separately labeled corrected render may replace
only the enumerated deterministic explanation fields using the frozen inputs;
it retains original model prose, execution/usage and report stamps with a
separate correction manifest. It cannot count as a new analyst run or claim
fresh all-claim verification. Full gates and independent clearance remain
required; no automatic new LLM run, push or merge.

The independent rerun audit subsequently accepted material closure of all seven
prior findings within its bounded numerical/source sample and retained four P3
followups. The authority note also needs to make its positive-dilution rule
conditional. Structured-guidance empty-state text now describes extraction of
structured rows, retaining period/currency/parser restrictions and separately
sourced narrative guidance. Scenario conditions now come from the actual
recorded growth and effective-margin shifts, including binding caps, with
capital efficiency/WACC/terminal inputs held at base. Prior analyst conditions
are retained verbatim inside an explicit separate-qualitative label rather than
presented as numerical prerequisites for a differently modeled target. Repeated
application is idempotent; model inputs and target/forecast arithmetic stay fixed.
Corrected artifacts must enumerate this relocation as well as deterministic
note changes. They do not claim that the original model authored new wording.
