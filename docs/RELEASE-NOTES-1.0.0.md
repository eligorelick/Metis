# Metis 1.0.0

Metis is a source-available app that builds equity research reports on public companies from SEC filings and market
data, on your own computer. This is the first release meant for general use.

## What you get

- **Reports you can check.** Code computes the financial results from recorded inputs (filings, the market-data
  provider) and disclosed assumptions. AI models write the arguments and summaries and may repeat figures; those copies
  can be wrong, so factual and estimate statements carry a mark: **[validated]** when code matched them against the
  record they cite, **[not confirmed]** when it did not, and **contradicted** when the record disagrees. Judgments are
  labelled separately.
- **A support level at the top of every report.** It says in plain words whether the report has full support or
  limited support, and lists what was not checked against filings or not covered. It also gives the share of the
  report's distinct factual and estimate statements that code confirmed (a statement repeated in another section
  counts once).
- **Gaps instead of guesses.** Missing required evidence becomes a disclosed gap, and figures that depend on it are
  withheld with a plain reason. Where a provider value or a model assumption is used instead, it is labelled.
- **Three ways to read a report:** in the app, as Markdown, or as a print page you can save as PDF.
- **Data-only reports** need no AI connection. **Full reports** run through your own Claude or ChatGPT sign-in, or the
  Claude API with your key.

## How this release was checked

- A fixed panel of 25 companies across industries, including banks, insurers, REITs, a utility, unprofitable
  companies, a recent IPO and two foreign filers, was rebuilt offline for each change and compared with the previous
  build. All 33 report cases rebuild successfully.
- An accuracy check compares 535 headline figures with the companies' filings: **331 match, 13 differ, 121 are withheld by the report and 70 cannot be checked yet**. The 13 differences are
  definitions the report labels beside the figure (for example a 52-week revenue normalisation or a provider revenue
  line). Passing this check does not mean every figure agrees with the filings or can be checked.
- Three new reports (a US company, a bank and a foreign filer) were generated through a Claude sign-in and checked
  by hand against the release checks; the
  problems that check found were fixed before release.
- The full test suite passes on Linux and Windows, a fresh clone installs and shows the sample report on both, the
  dependency audit is clean, and a secret scan of the full history found no secrets (its few hits were all false positives).

See [validation status](https://github.com/eligorelick/Metis/blob/v1.0.0/docs/VALIDATION-STATUS.md) for the counts and [known limitations](https://github.com/eligorelick/Metis/blob/v1.0.0/docs/KNOWN-LIMITATIONS.md) for
everything that is missing or partial.

## Good to know

- **Full support is rare.** It requires every grade to have all of its evidence and no valuation input to be withheld
  or unchecked. No company on the release panel reaches it today; each report lists its reasons.
- **Banks, insurers, equity and mortgage REITs, regulated utilities, and loss-making or pre-revenue companies** have
  limited support under the current methods. Banks and insurers are valued on book value and returns on equity;
  several other routes give no per-share fair value.
- **Foreign filers'** interim figures come from the data provider and are labelled, because Form 6-K statements are not
  parsed yet.
- **Reports saved before 1.0** keep their original text. Some fixes apply when they are read; others need a new report.
- **Cost and time.** A full report through a Claude sign-in took 28-40 minutes and 2.9-5.5 million input
  tokens (including cached ones) and 0.21-0.31 million output tokens in our six measurements. Priced as Claude API traffic at
  list prices with all input uncached, that usage would be roughly $16-28 per report. A data-only report took under a minute in our measurements and uses no AI. See
  [report costs](https://github.com/eligorelick/Metis/blob/v1.0.0/docs/REPORT-COSTS.md).
- Metis gives no investment advice. Grades and scenario prices are model outputs from the disclosed data and
  assumptions.

## For contributors

[Architecture](https://github.com/eligorelick/Metis/blob/v1.0.0/docs/ARCHITECTURE.md) explains how a report is built and where each rule lives. Planned work is tracked in
GitHub issues with severity labels.
