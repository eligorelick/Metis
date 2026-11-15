# Known limitations

Release documentation reviewed 2026-11-15 against build `5a503eec`. Missing evidence is disclosed rather than filled in. These limits apply beyond the named examples wherever the same evidence shape occurs.

## L1: Web claims

All analyst web research. Fetched page bodies are not retained for machine checking; statements remain not confirmed even when linked.

## L2: Dividends

Companies whose historical payout operands or declarations lack row proof. Payout, declared DPS and yield stay gaps rather than inferred values.

## L3: Segments

Companies with overlapping segment/geographic disclosures. The hierarchy can be incomplete; overlap is disclosed rather than treating rows as additive.

## L4: Guidance

Banks and arbitrary guidance table layouts. NII, expense and net-charge-off guidance may not be tabulated; missing structured guidance is disclosed.

## L5: Investments

Dimensioned, IFRS and custom investment facts beyond an admitted carrying subtotal. Unsupported totals stay gaps.

## L6: Business coverage

All companies. Filing excerpts have bounds and length limits; patents, pipeline and competitors can be missing. The report discloses coverage gaps, which do not prove absence.

## L7: House definitions

MU and KO 53-week revenue normalization and NVDA guided tax. Method differences are labelled; these are model inputs, not directly filed values.

## L8: Method and operand gaps

Lender, bank and insurer FCF is not applicable. VKTX capex, RIVN lease-complete debt, MU zero NCI/preferred and DUK lease completeness lack proof; dependent figures stay unavailable with reasons.

## L9: Small model contexts

Large company payloads can exceed smaller models' context windows. The run is refused at $0 instead of truncating away required evidence.

## L10: Sign-in web access

Claude sign-in WebFetch can read fixed regulator, statistics and exchange domains (including their subdomains), plus the issuer's own host exactly (never its subdomains). WebSearch is unrestricted. A public name resolving to a private address is not detected. See [Privacy](PRIVACY.md) for the allowlist and local action limits.

## L11: Successor registrants

Successor filings (8-K12B) are not followed automatically. XOM evidence stops at the predecessor; dated evidence is refused for current use.

## L12: Saved reports

Reports saved before 1.0 retain their original text. Read-time fixes apply where implemented; generation changes require a new report and do not rewrite history.

## L13: Fixed analyst replay

Offline replays can pair stored analyst text with newer figures. Conflicts are marked; replay does not regenerate analyst research.

## L14: Terminal return switch

The terminal-return convention switches after four observed above-hurdle years. LLY exposes a discrete model-value change of about +$77 per share at this boundary; it is a house assumption, not a filing-proven valuation. Smoothing is deferred pending an owner decision.

## L15: Conservative verification

All prose. Correct figures can remain not matched when the cited record does not prove every required basis. Confirmation rates do not establish company-wide factual accuracy.

## L16: Diagnostic bridges

LLY accrual scaler, capex slope and Altman, and TSM Z-prime were flagged for independent operand reconciliation. Their diagnostics are not independently validated by the release panel.

## L17: Evidence loss and scores

All scored companies. Losing negative evidence can raise a composite through neutral shrinkage. The report marks missing evidence and provisional grades; no evidence-loss guard policy has been decided.

## L18: Foreign interim statements

Foreign filers such as TSM and NVO. Form 6-K interim statements are not parsed into structured statements; vendor interim figures carry qualifications.

## L19: Accuracy checker coverage

All panel checks. Inputs are private, and not-established figures mean the checker lacks a proven reference. A passing regression gate is not proof of universal accuracy.

## L20: AI copies of figures

Analyst reports. When the AI's key-number table repeats a figure that code also computes, both rows print: the code row and, beside it, the AI's copy with its own verification mark. They are not merged, so a copy that disagrees with the record stays visible as not confirmed or contradicted.

## L21: App evidence details

The app only. The expandable provenance details beside a figure name the internal source field (for example a computed score path) and raw gap ids. Markdown and print show plain names only.

## Additional release decisions and deferred work

Vendor qualifications use labels and separate gaps; there is no new typed vendor-qualification code in 1.0. Provider revenue may represent a provider revenue line rather than the filed total (R12); the report labels that basis alongside the filed total.

At generation, a statement citing the whole news feed is removed when no single article is identified. Saved reports instead show "News feed (no single article identified)" at read time.

Bank tangible common equity (TCE) and return on tangible equity (ROTE) can use provider goodwill/intangible fields that have not been checked against a filing; the report labels this basis.

The ROIC minus fiscal-year-end WACC spread pairs annual observed ROIC with a fiscal-year-end market-based discount rate: this hybrid basis is labelled rather than presented as a filed ratio. Saved text and the terminal-return switch are described above.

Further debt-evidence sharing, typed refusal-reader migration, shortening reports, checking wording across saved reports, and reconciling business-word inventories remain deferred. Following successor registrants, parsing 6-K interim statements and typed ADS-member facts, evidence-loss scoring and terminal-return smoothing also remain deferred. These are not promised capabilities.

See [validation status](VALIDATION-STATUS.md), [privacy](PRIVACY.md) and [methodology](METHODOLOGY.md).
