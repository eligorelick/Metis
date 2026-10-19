# TTM diluted EPS convention — October 17, 2026

Metis preserves its existing analytical convention: sum the latest four eligible quarterly `epsDiluted` observations. `epsDilutedBasis: "sum-quarterly-diluted-eps"` identifies that construction; missing EPS yields a null value and basis. The adapter carries this metadata to the report-facing P/E basis when price/EPS is used. Reported annual EPS and common-income fallback multiples do not acquire the quarter-sum label. No completeness penalty or warning is added merely for using the convention.

This sum may differ from an issuer's full-period GAAP diluted EPS. Replacing it with total net income divided by average quarterly diluted shares is not established as a correction: those fields need not supply the full-period earnings numerator, weighting, instrument terms, or anti-dilution decisions. This change does not reconstruct annual or year-to-date EPS.

## Public primary-source scope

The [IFRS Foundation's issued IAS 33 text](https://www.ifrs.org/content/dam/ifrs/publications/html-standards/english/2026/issued/ias33.html), inspected October 17, 2026, provides narrowly relevant cautions:

- Paragraphs 19–20: basic shares use period weighting, including issuance and repurchase timing.
- Paragraphs 31–36: diluted EPS adjusts both earnings and shares for dilutive instruments. Paragraph 37 determines dilution independently for each presented period.
- Paragraphs 41–43: continuing-operations earnings control dilution; antidilutive instruments are excluded.
- Paragraph 64: stock splits and similar changes require retrospective per-share adjustments.

These provisions support the distinction between summed quarterly observations and a separately computed full-period measure. They do not prescribe Metis's analytical TTM convention. This review does not establish equivalence between IAS 33 and ASC 260; no unverified ASC paragraph is relied upon.

## Synthetic regression evidence and remaining limits

`tests/stageB.ttm.epsConvention.test.ts` fixes the following independently understandable cases:

- Four quarters earning 100 each, with shares changing between 50 and 100 midyear: separate issuance and repurchase fixtures both sum quarterly EPS to 6. The simple equal-quarter ratio 400/75 is 5.333…, illustrating a different construction rather than certifying statutory annual EPS.
- Three profitable quarters report diluted EPS 1; a loss quarter reports −2 on its smaller basic denominator. The sum remains 1. No full-period instrument inclusion is invented from the observed quarterly shares.
- Uniformly adjusting every EPS observation and quoted price for a 2-for-1 split halves both per-share quantities, preserves earnings and market capitalization, and leaves the P/E comparison unchanged. This proves consistent-input scaling only. Mixed historical split bases remain unverified by this calculation.
- Missing/nonfinite EPS suppresses only EPS; zero is observed data. Missing currency or a broken quarterly window withholds the window under existing gates.

The `runStageB` wiring regression confirms that the convention reaches the P/E basis consumed by reporting. No issuer-specific numerical claim, independent EPS normalization, or new provider/model call is part of this work.
