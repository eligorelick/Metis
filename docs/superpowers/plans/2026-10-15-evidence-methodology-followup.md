# Evidence and reporting follow-up

Base: public main `0a32d1fd641aa23a536654c6a7d703b430c835f7`, after PR 16.
User instruction: keep this separate, test locally and end to end before a new PR.

## Purpose and boundaries

Make existing research evidence harder to misread without changing financial
formulas, factor weights, grades, scenario priors, provider choice or paid-data
requirements. Historical reports and snapshots remain readable and immutable.
This work improves explicit contracts and presentation; it does not establish
predictive calibration, professional readiness or whole-prose validation.

## Research rationale

- [XBRL dates](https://www.xbrl.org/dates-in-xbrl/) distinguishes an instant
  from a duration with explicit boundaries. [SEC API guidance](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)
  cautions that issuer calendars and period lengths vary. Carry actual source
  boundaries, never guess a quarter or half-year from an end date.
- [CFA V(B)](https://www.cfainstitute.org/standards/professionals/code-ethics-standards/standards-of-practice-v-b)
  distinguishes facts, opinions and limitations; [CFA V(A)](https://www.cfainstitute.org/standards/professionals/code-ethics-standards/standards-of-practice-v-a)
  calls for adequate support and model testing. These support conservative
  evidence handling, not a certification claim or a looser prose matcher.
- [Damodaran's valuation introduction](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/background/valintro.htm)
  describes assumption-dependent valuation. Separate time disclosures are an
  engineering inference to help readers assess the existing inputs, not a new
  valuation rule or arbitrary expiry threshold.

## Changes and acceptance tests

1. Optional structured period context in numeric evidence and traced numbers.
   Carry established instant/duration, exact source dates, basis and fiscal
   label. Compare supplied contexts before legacy aliases. Absence preserves
   established legacy matching; contradictory supplied contexts fail closed.
   Test equal-end/different-start, instant/flow, fiscal calendars, 52/53 weeks,
   invalid contexts, exact legacy strings, schema and replay compatibility.

2. Pipeline-owned source facts and reported earnings reconciliation.
   Use exact registry identities and statement operands, with units, currency,
   period and source. Keep provider facts and arithmetic separate from AI
   opinions. Reconcile only a complete, compatible set; never infer a missing
   tax/equity operand or force a residual to zero. An arithmetic identity is
   not normalized recurring earnings or a universal tax treatment. Block a
   narrow promise of an earnings bridge unless that actual reconciliation is
   rendered, with an audit entry; a cash/debt bridge cannot satisfy it.
   Test valid identity, signed equity result, missing/conflicting/mixed-period
   operands, changed metric/definition/qualifier, opinion remaining unverified,
   absent/suppressed destination, and identical deterministic facts in AI and
   data-only paths. Do not loosen claimEvidence.ts.

3. Timestamp disclosure beside valuation evidence.
   Distinguish quote observation, financial period, established filing or
   publication, acquisition and calculation. Preserve unknowns. Reuse existing
   freshness policy and reject demonstrably future inputs against the supplied
   cutoff; do not invent an expiry policy or call acquisition publication.
   Test stale/unknown/future dates and live/Markdown/print agreement.

## Integration and release

Use optional, versioned report/payload fields and preserve historical stamps.
Update current introductory docs while retaining dated historical records.
Focused failures precede fixes; then run product and integration tests,
TypeScript, lint, dependency/coverage gates, production build, security audit,
independent review and an isolated data-only browser/API/export check. Frozen
AMZN input recomputation is a controlled replay, never a new live AI result.
No new PR or publication until local verification and end-to-end checks pass.
