# D-262 approved offline replay changes

Baseline: main `9f0d54765a5760e460c53342431c21468dd7c0fc`. Both runs use identical frozen local inputs and Node 24, with the harness network blocked. No model or paid provider is called. This record lists filed input corrections, their propagated report changes, and every differing JSON leaf. Original vendor rows and report exports are not reproduced.

A changed file hash is approved only for the causes and leaf set listed here. Text/HTML are the same deterministic figures, qualifications, provenance and version identifiers in reader/audit/print/web forms. A fixed-analyst case retains its saved analyst output and rechecks it; it does not regenerate prose. All 17 golden cases change compatibility metadata and/or disclosures; cases with no corrected input are identified explicitly.

## How to read the exact leaf sets

Paths use the golden harness's dotted notation. Braces enumerate alternatives; `0..4` means the five integer indices 0 through 4 inclusive. A common suffix applies to every key in its brace. Expanding these expressions gives exactly the harness leaf list, without wildcards. Inserted/deleted array elements are single leaves under the harness rule; later positions can differ because they moved, without a new underlying value. Each path inherits the explanation beside its root and the exact filed input list for that case.

## amzn-data-only

2 independently filed input corrections are listed below. Repeated aliases and dependent FCF are represented by their capex input, not counted again.

| Field | Window | Filed/admitted amount | SEC tag(s) | Filing evidence |
| --- | --- | ---: | --- | --- |
| cashflowAnnual.interestPaid | 2016-01-01 to 2016-12-31 | 290000000 USD | us-gaap/InterestPaid | 10-K 0001018724-17-000011, filed 2017-02-10 |
| cashflowAnnual.capitalExpenditure | 2016-01-01 to 2016-12-31 | -6737000000 USD | us-gaap/PaymentsToAcquirePropertyPlantAndEquipment | 10-K 0001018724-17-000011, filed 2017-02-10 |

### stageB.json

SHA-256 before `9381e9cafc27f42b7f7a6c4048bc887e0dd19aea32962a8bbffc3e5e6ab459c4`; after `51d3240dccc6cc38070e36e3ebda4716041962c0206bd0f53aee7fcebc9f3209`.

306 changed JSON leaves, all enumerated below.

- **capital (1 leaves):** Admitted capex, D&A, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.current.cashBridge.definition
```

- **gaps (300 leaves):** New filed substitutions and missing-compatible-counterpart disclosures are added; recovered typed value-only conflicts retire only their own old refusal. Array positions shift after insertion.

```text
gaps.{{78..80,88..90,94..96,100..102,106..108,112..114,118..120,124..126,134,161,162}.{attemptedSources,field,reason},{81..87,91..93,97..99,103..105,109..111,115..117,121..123,127,128,164}.{field,reason},{129,130,132,133,135,136,138,139,141,142,144,145,147,148,150,151,153,154,156,157,159,160,163}.{expected,field,reason},{131,137,140,143,146,149,152,155,158}.{attemptedSources,expected,field,reason},{165..222}}
```

- **growth (2 leaves):** Annual filed PP&E changes FCF endpoints, CAGR and the associated window/sensitivity descriptions; revenue and EPS definitions are unchanged.

```text
growth.fcfCagrs.3.{cagrPct,startValue}
```

- **scores (3 leaves):** The unchanged scoring formulas read the corrected operands above; driver values, signal arithmetic, aspect/composite results and completeness follow those operands.

```text
scores.aspects.fundamentals.signals.3.{fallbackReason,operands.{6,7}.value}
```

### payload.txt

SHA-256 before `2dbcf2787731fe38a3bada47664855d48c17012430236b85a2eeb5f247bbe7c2`; after `f5d70be5e8d6fbafd8b82375a9f6b07c158f4c363ff006a7212ee9db97b0bfab`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `cb8a4884af74bf8643841a341761d6c772d80fdec65e8f41351bb6455dac0248`; after `7dd5d0a24ba92a9084e240e4c0dae7e15093dc0d40e948f18d6259e9850dbbff`.

218 changed JSON leaves, all enumerated below.

- **appendix (212 leaves):** Substitution/missing-data/provenance records carry the changed inputs, filings and compatibility stamps; ordered arrays shift after additions. Existing unknown evidence stays unknown.

```text
appendix.missingData.{{107..130,136,166}.{field,reason},{131..135,137..162,165}.{expected,field,reason},{163,164}.{attemptedSources,field,reason},{167..224}}
```

- **balanceSheet (1 leaves):** Cash, coverage and capital descriptions read the corrected filed flow family and its qualifications; no balance-sheet stock is independently substituted by this change.

```text
balanceSheet.coverage.commentary.1.text
```

- **fundamentals (1 leaves):** FCF CAGR and the resulting fundamentals grade/driver prose use the corrected annual filed PP&E history.

```text
fundamentals.growthTable.2.values.2.value.value
```

- **meta (1 leaves):** Report/payload/Stage B compatibility stamps advance; payload fingerprint and method-identity hashes identify the revised meaning. Stored-report bytes are untouched.

```text
meta.specVersion
```

- **scores (3 leaves):** The unchanged scoring formulas read the corrected operands above; driver values, signal arithmetic, aspect/composite results and completeness follow those operands.

```text
scores.aspects.fundamentals.signals.3.{fallbackReason,operands.{6,7}.value}
```

### report.md

SHA-256 before `51d14384c319b558ac7a9677d696ecc8f08ddc59327aa62df9e5db87b38a7bd9`; after `3d76226ed108b178a5c6f51c6f073da6ba7bcb432dad842dd88dfe9897210e7a`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `96b42906114a3f5eb240d5757b36e9bab29766e627cdce78f5ea00a369f95c24`; after `de31142062aeaf79bc8d9109b10a0c196c17573bf76cf6f1a2acc976862acd31`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `fe75285733330a2451dbfde4c9d5e1dbe5eae93047328a2d8a41127e0d228a35`; after `01b2fb5bd899e6baa51c4f4e2437b5d5841ff559819080d2d0b2ca8653720a29`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `80b3902a2b2c7a146baff3de7ef4833f0013edb15a2b9b44f5d53451f557eae3`; after `ed8482c343f7d1edf9f0db59474de39177e7f90cfc6b377da65e296384882733`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:d3a902a8"` to `"1.95.0:1e40c06c"`, approved because its version and covered deterministic content changed.

## figr-data-only

11 independently filed input corrections are listed below. Repeated aliases and dependent FCF are represented by their capex input, not counted again.

| Field | Window | Filed/admitted amount | SEC tag(s) | Filing evidence |
| --- | --- | ---: | --- | --- |
| incomeAnnual.researchAndDevelopmentExpenses | 2025-01-01 to 2025-12-31 | 64922000 USD | us-gaap/ResearchAndDevelopmentExpense | 10-K 0002064124-26-000009, filed 2026-03-16 |
| incomeQuarterly.researchAndDevelopmentExpenses | 2026-04-01 to 2026-06-30 | 15551000 USD | us-gaap/ResearchAndDevelopmentExpense | 10-Q 0001628280-26-057061, filed 2026-08-14 |
| incomeQuarterly.researchAndDevelopmentExpenses | 2026-01-01 to 2026-03-31 | 15605000 USD | us-gaap/ResearchAndDevelopmentExpense | 10-Q 0002064124-26-000029, filed 2026-05-15 |
| incomeQuarterly.generalAndAdministrativeExpenses | 2025-10-01 to 2025-12-31 | 60368000 USD (compatible YTD difference) | us-gaap/GeneralAndAdministrativeExpense | 10-K 0002064124-26-000009, filed 2026-03-16 + 10-Q 0002064124-25-000032, filed 2025-11-13 |
| incomeQuarterly.generalAndAdministrativeExpenses | 2025-07-01 to 2025-09-30 | 36366000 USD | us-gaap/GeneralAndAdministrativeExpense | 10-Q 0002064124-25-000032, filed 2025-11-13 |
| cashflowAnnual.incomeTaxesPaid | 2025-01-01 to 2025-12-31 | 10403000 USD | us-gaap/IncomeTaxesPaidNet | 10-K 0002064124-26-000009, filed 2026-03-16 |
| cashflowAnnual.interestPaid | 2025-01-01 to 2025-12-31 | 49892000 USD | us-gaap/InterestPaidNet | 10-K 0002064124-26-000009, filed 2026-03-16 |
| cashflowQuarterly.incomeTaxesPaid | 2026-04-01 to 2026-06-30 | 26473000 USD (compatible YTD difference) | us-gaap/IncomeTaxesPaidNet | 10-Q 0001628280-26-057061, filed 2026-08-14 + 10-Q 0002064124-26-000029, filed 2026-05-15 |
| cashflowQuarterly.interestPaid | 2026-04-01 to 2026-06-30 | 1561000 USD (compatible YTD difference) | us-gaap/InterestPaidNet | 10-Q 0001628280-26-057061, filed 2026-08-14 + 10-Q 0002064124-26-000029, filed 2026-05-15 |
| cashflowQuarterly.incomeTaxesPaid | 2025-10-01 to 2025-12-31 | 2388000 USD (compatible YTD difference) | us-gaap/IncomeTaxesPaidNet | 10-K 0002064124-26-000009, filed 2026-03-16 + 10-Q 0002064124-25-000032, filed 2025-11-13 |
| cashflowQuarterly.interestPaid | 2025-10-01 to 2025-12-31 | 13521000 USD (compatible YTD difference) | us-gaap/InterestPaidNet | 10-K 0002064124-26-000009, filed 2026-03-16 + 10-Q 0002064124-25-000032, filed 2025-11-13 |

### stageB.json

SHA-256 before `e4e38961697bd6e4fb7541e06e9e7cf9f765b686131e7780d076873ce8ed2e9d`; after `f6d5cc7c9b7059ac327a667828018f4b37b316990546f350b63618a9ab6ae45f`.

245 changed JSON leaves, all enumerated below.

- **gaps (245 leaves):** New filed substitutions and missing-compatible-counterpart disclosures are added; recovered typed value-only conflicts retire only their own old refusal. Array positions shift after insertion.

```text
gaps.{{27..29,51,64..66,70..72,79..81,89..91}.{field,reason},{30,34,35}.{attemptedSources,field,reason,severity},31.{attemptedSources,expected,field,reason,severity},{32,33}.{field,reason,severity},36.{attemptedSources.{0..2},{expected,field,reason}},37.{attemptedSources.{0..2},{field,reason}},{38,44,58..60,82..84}.{attemptedSources,field,reason},{39,42,43,45..50,52,53,57,61..63,87}.{attemptedSources,expected,field,reason},{40,41}.{attemptedSources.0,{expected,field,reason}},{54..56}.{attemptedSources.{0,1},{field,reason}},{67..69,73..78,85,86,88}.{expected,field,reason},{92..126}}
```

### payload.txt

SHA-256 before `ed8afe3ddc9d99a22ff24526ec4b2fe28be8a08cb09c421e6a2ef70587a598b7`; after `0009b5715b9ed2ea1099335bccb8d0449685a6345565045ae162af16717e20e9`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `802a33ed6447a242d8e56f788c0dbba742ce423adfd91e10eeb9e3d679f971ce`; after `8ee92f178cda6dffea96ad733d8c721f67597ed39f10bde6950e5bde45e89833`.

249 changed JSON leaves, all enumerated below.

- **appendix (246 leaves):** Substitution/missing-data/provenance records carry the changed inputs, filings and compatibility stamps; ordered arrays shift after additions. Existing unknown evidence stays unknown.

```text
appendix.missingData.{{30..32,57,58,61,67,70..72,76..78,85..87}.{field,reason},{33..35,37,38}.{attemptedSources,expected,field,reason,severity},36.{attemptedSources,field,reason,severity},{39,40}.{attemptedSources.{0..2},{field,reason}},{41,46..48}.{attemptedSources.{0,1},{field,reason}},42.{attemptedSources.{0,1},{expected,field,reason}},{43..45,49}.{attemptedSources.0,{field,reason}},{50,53,54}.{attemptedSources.0,{expected,field,reason}},{51,52,55,62,63,68,69,90}.{attemptedSources,expected,field,reason},{56,59,60}.{attemptedSources,field,reason},{64..66,73..75,79..84,88,89,91..94}.{expected,field,reason},{95..129}}
```

- **meta (2 leaves):** Report/payload/Stage B compatibility stamps advance; payload fingerprint and method-identity hashes identify the revised meaning. Stored-report bytes are untouched.

```text
meta.{dataCompleteness.warningCount,specVersion}
```

- **verdict (1 leaves):** The unchanged verdict presentation reads the recalculated composite and evidence qualifications.

```text
verdict.synthesis
```

### report.md

SHA-256 before `9ad681f47289a274994ff686b3d8eccd91635759a2a9d2c303e4bd1baadc8a76`; after `fe962f73e99dc4f5f0132ee8bd6f807856634571af0d76fdf2c0d3e6e3d62f5f`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `8504661f00d8b30e7ef34b447f6f7c0ccaa5eeb252bb3935d2017280625dd16f`; after `9aed6aa479e1c0168e970b854548ff0c74f338aa4b65e4f905165df32ef44b6c`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `5e6a67d3b772385379a245cbd2c459808edd03439352b897e78f8aeae8b1f6e5`; after `5fc6ee5ba0394e2ae52668083fe9c90a57e65349babe9b0e0370ff8f8c3942ab`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `82ae6e2a01e71a4967c68c28d63534a96eab7a556ae73a76d40fbf15f88e7be6`; after `a750cf84f180bc6e353c3ad3965a616eb0c49fd12b5abc7ab21edcb8ddd9d7bd`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:82cd4ed7"` to `"1.95.0:88cbc62f"`, approved because its version and covered deterministic content changed.

## meta-data-only

4 independently filed input corrections are listed below. Repeated aliases and dependent FCF are represented by their capex input, not counted again.

| Field | Window | Filed/admitted amount | SEC tag(s) | Filing evidence |
| --- | --- | ---: | --- | --- |
| incomeQuarterly.interestExpense | 2026-04-01 to 2026-06-30 | 754000000 USD | us-gaap/InterestExpenseDebt | 10-Q 0001628280-26-050705, filed 2026-07-30 |
| cashflowAnnual.interestPaid | 2025-01-01 to 2025-12-31 | 696000000 USD | us-gaap/InterestPaidNet | 10-K 0001628280-26-003942, filed 2026-01-29 |
| cashflowQuarterly.commonDividendsPaid | 2025-10-01 to 2025-12-31 | -1328000000 USD | us-gaap/PaymentsOfDividendsCommonStock | 10-K 0001628280-26-003942, filed 2026-01-29 |
| cashflowQuarterly.commonDividendsPaid | 2025-07-01 to 2025-09-30 | -1323000000 USD | us-gaap/PaymentsOfDividendsCommonStock | 10-Q 0001628280-25-047240, filed 2025-10-30 |

### stageB.json

SHA-256 before `ebfb1046771b5640b383fc795c0741adb0ca38241b7a92acf9a40dc827f0adab`; after `4c42b4f3124b634210f33d01176b7ea0f8ad1b8c69b591ac664b401033dc2e8d`.

411 changed JSON leaves, all enumerated below.

- **capital (3 leaves):** Admitted capex, D&A, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.current.{cashBridge.definition,{interestCoverage,interestExpense}}
```

- **gaps (401 leaves):** New filed substitutions and missing-compatible-counterpart disclosures are added; recovered typed value-only conflicts retire only their own old refusal. Array positions shift after insertion.

```text
gaps.{{46,47,49,57,95,101,105,107,109,110,112,114,120,122..131,166}.{attemptedSources,field,reason},{48,50,88,89,102..104,106,108,111,113,115..119,121,132..135,154,156,167..169}.{field,reason},51.{attemptedSources,field,reason,severity},{52..56}.{attemptedSources,expected,field,reason,severity},{58,61,64..70,73,74,91,92,97,98}.{attemptedSources.0,{field,reason}},59.{attemptedSources.{1,2},{field,reason}},60.{attemptedSources.{0..2},{field,reason}},{62,76,79,80,82..87,90,93,94,96,99,100}.{attemptedSources.{0,1},{field,reason}},63.{attemptedSources.0,{expected,field,reason}},{71,72,75,77,78,81,137,141,145,149,152}.{attemptedSources,expected,field,reason},{136,138..140,142..144,146..148,150,151,153,165,170}.{expected,field,reason},{155,157..164}.field,{171..198}}
```

- **returns (3 leaves):** Admitted interest or operating/capital inputs propagate through the existing return and borrowing-cost calculations, with their dated basis.

```text
returns.wacc.{interestCoverageRatio,notes.{1,2}}
```

- **scores (4 leaves):** The unchanged scoring formulas read the corrected operands above; driver values, signal arithmetic, aspect/composite results and completeness follow those operands.

```text
scores.aspects.balanceSheet.{drivers.1.value,signals.1.{operands.{0,2}.value,raw}}
```

### payload.txt

SHA-256 before `0d676d6a44378b390501ae457aff13995de5ed4d6926799219c576cf101457df`; after `fcc504016193acbf565b9e1c75bd1ce7858ca1c913aab8ae3deddfdf26932bb1`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `850c3ea8c7f9e939f13d4507229f8fc88d4eea7bcf1779529565bf750073dc38`; after `1cd37ab607a7beef6681d101ac67b6a428e5265106ccf7149df10d9f4937f868`.

408 changed JSON leaves, all enumerated below.

- **appendix (397 leaves):** Substitution/missing-data/provenance records carry the changed inputs, filings and compatibility stamps; ordered arrays shift after additions. Existing unknown evidence stays unknown.

```text
appendix.missingData.{{50..52,87,88,100..120,132..139,158,160,171..173}.{field,reason},{53..57}.{attemptedSources,expected,field,reason,severity},58.{attemptedSources,field,reason,severity},{59,62,65..73,90,91,94,96,97}.{attemptedSources.0,{field,reason}},60.{attemptedSources.{1,2},{field,reason}},61.{attemptedSources.{0..2},{field,reason}},{63,75..79,81..86,89,92,93,95,98,99}.{attemptedSources.{0,1},{field,reason}},64.{attemptedSources.0,{expected,field,reason}},{74,80,123..125,127,128}.{attemptedSources,expected,field,reason},121.{attemptedSources.{0..8},{expected,field,reason}},122.{attemptedSources.{0,1},{expected,field,reason}},{126,170}.{attemptedSources,field,reason},{129..131,140..157,169,174}.{expected,field,reason},{159,161..168}.field,{175..202}}
```

- **balanceSheet (3 leaves):** Cash, coverage and capital descriptions read the corrected filed flow family and its qualifications; no balance-sheet stock is independently substituted by this change.

```text
balanceSheet.{coverage.{commentary.1.text,numbers.9.value},graded.keyNumbers.1.value}
```

- **meta (2 leaves):** Report/payload/Stage B compatibility stamps advance; payload fingerprint and method-identity hashes identify the revised meaning. Stored-report bytes are untouched.

```text
meta.{dataCompleteness.warningCount,specVersion}
```

- **scores (4 leaves):** The unchanged scoring formulas read the corrected operands above; driver values, signal arithmetic, aspect/composite results and completeness follow those operands.

```text
scores.aspects.balanceSheet.{drivers.1.value,signals.1.{operands.{0,2}.value,raw}}
```

- **verdict (2 leaves):** The unchanged verdict presentation reads the recalculated composite and evidence qualifications.

```text
verdict.{gradeStrip.balanceSheet.keyNumbers.1.value,synthesis}
```

### report.md

SHA-256 before `1c4e3fd265f19335adf3235895855a8ba709453797e9b4de3cb0bc3a4367fa07`; after `cc435ce315e48795bbfe33c6292ee382bd1f5a3e34fccb896c812dc10cbd22ca`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `55e3078bbdc97cff7e0294676dd7caa06d4c0dd670b0840e602aca0af87b01c7`; after `06e9432c4a343445d3e965dbd32add9720a1bfc58645b71556adc623d6228f6d`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `99fa29d6435dafc1bfda9e2874ed5c410986c7b8532221b3cf62f9c9b322d936`; after `eefbf33a061f9de3f37ecab3425b99ff42846a255e7660ed6a7dcbc498305aab`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `b108210d396534814b1904fc647907adbb7b88ba624c2bd6fc25363e4cc65b89`; after `f9848a4744915ed611c9fda67a316ce5ba9cdf5c062406b2146cce70e47f5002`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:0ff64fb6"` to `"1.95.0:3bbee120"`, approved because its version and covered deterministic content changed.

## mu-data-only

No scalar input correction: only the revised definition, compatibility identifiers and explicit unverified-coverage disclosures change.

| Field | Window | Filed/admitted amount | SEC tag(s) | Filing evidence |
| --- | --- | ---: | --- | --- |

### stageB.json

SHA-256 before `221c0a467a91e1522bdce283b855072801ae97ddd1061ea42d148fc3c34fbae9`; after `6fd276e28539f97b5a67dc5e30d11efa630d219e92d06ef211f128a745fef058`.

1 changed JSON leaves, all enumerated below.

- **capital (1 leaves):** Admitted capex, D&A, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.current.cashBridge.definition
```

### payload.txt

SHA-256 before `53df00250317a2a31da0ac982654047e5981407bff273bb0c03cb4c9476fc50a`; after `505593efc9310d50fca7157d3259553eece4a92e649278b9b16a0510f307fa4d`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `b0e28b9b520a56476caf612331073c1fbb0d4b74e12e5a73232b310161c95ec0`; after `a858293d5588ad2724f9d1011b0eda360e54bb0539bf1aac6565e1c1bd4ece71`.

2 changed JSON leaves, all enumerated below.

- **balanceSheet (1 leaves):** Cash, coverage and capital descriptions read the corrected filed flow family and its qualifications; no balance-sheet stock is independently substituted by this change.

```text
balanceSheet.coverage.commentary.1.text
```

- **meta (1 leaves):** Report/payload/Stage B compatibility stamps advance; payload fingerprint and method-identity hashes identify the revised meaning. Stored-report bytes are untouched.

```text
meta.specVersion
```

### report.md

SHA-256 before `9c69da7079e03f5d0a1e162b9b9d8c91c374ac8302bf4d11d8f4f0ea1fcb291b`; after `1614e56e1e9f7516828961fe6d5b808896a9bfc5791b0c27e97a0c69b63169c2`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `799e96d4a9aab0edccb880ffc4829d602fa165454c4550c7d7aa5b362d434500`; after `f28b6f4c631be9ad1d4d219f1519e6cc15573a2e2f484d014705782665275c56`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `2ec772ef496d4b10a917e11d1bcfa234284d5c094440b6ef595e0263772f0a97`; after `1109f70478906fcf427e41c5d331932fe11007cc6ca612394b20d4c553a17605`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `7a0862e01627eb3804bd4968373fe108412d17ec94433e8e7879f06871144210`; after `879cff1f52021f7ccd99d0d14e8c01afbb1008c8419cf3cd172975daecab414b`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:ae6c7800"` to `"1.95.0:83ff7142"`, approved because its version and covered deterministic content changed.

## nvda-data-only

8 independently filed input corrections are listed below. Repeated aliases and dependent FCF are represented by their capex input, not counted again.

| Field | Window | Filed/admitted amount | SEC tag(s) | Filing evidence |
| --- | --- | ---: | --- | --- |
| cashflowAnnual.incomeTaxesPaid | 2025-01-27 to 2026-01-25 | 20288000000 USD | us-gaap/IncomeTaxesPaidNet | 10-K 0001045810-26-000021, filed 2026-02-25 |
| cashflowQuarterly.netDividendsPaid | 2026-04-27 to 2026-07-26 | -6000000000 USD | us-gaap/PaymentsOfDividends | 10-Q 0001045810-26-000075, filed 2026-08-26 |
| cashflowQuarterly.incomeTaxesPaid | 2025-10-27 to 2026-01-25 | 6979000000 USD (compatible YTD difference) | us-gaap/IncomeTaxesPaidNet | 10-K 0001045810-26-000021, filed 2026-02-25 + 10-Q 0001045810-25-000230, filed 2025-11-19 |
| cashflowQuarterly.incomeTaxesPaid | 2025-07-28 to 2025-10-26 | 4858000000 USD (compatible YTD difference) | us-gaap/IncomeTaxesPaidNet | 10-Q 0001045810-25-000230, filed 2025-11-19 + 10-Q 0001045810-25-000209, filed 2025-08-27 |
| cashflowQuarterly.acquisitionsNet | 2023-07-31 to 2023-10-29 | 0 USD (compatible YTD difference) | us-gaap/PaymentsToAcquireBusinessesNetOfCashAcquired | 10-Q 0001045810-23-000227, filed 2023-11-21 + 10-Q 0001045810-23-000175, filed 2023-08-28 |
| cashflowQuarterly.netDividendsPaid | 2023-07-31 to 2023-10-29 | -99000000 USD | us-gaap/PaymentsOfDividends | 10-Q 0001045810-23-000227, filed 2023-11-21 |
| cashflowQuarterly.acquisitionsNet | 2023-05-01 to 2023-07-30 | 0 USD (compatible YTD difference) | us-gaap/PaymentsToAcquireBusinessesNetOfCashAcquired | 10-Q 0001045810-23-000175, filed 2023-08-28 + 10-Q 0001045810-23-000093, filed 2023-05-26 |
| cashflowQuarterly.acquisitionsNet | 2023-01-30 to 2023-04-30 | -83000000 USD | us-gaap/PaymentsToAcquireBusinessesNetOfCashAcquired | 10-Q 0001045810-23-000093, filed 2023-05-26 |

### stageB.json

SHA-256 before `b4f6677ad08d828bc353afaf4bbe835a42154e54dea708fc178316c14f37e553`; after `36247b231a03e3972a9c6b1bba0a64197165de75558bb6ac3cc0eeec6c481699`.

180 changed JSON leaves, all enumerated below.

- **capital (1 leaves):** Admitted capex, D&A, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.current.cashBridge.definition
```

- **gaps (179 leaves):** New filed substitutions and missing-compatible-counterpart disclosures are added; recovered typed value-only conflicts retire only their own old refusal. Array positions shift after insertion.

```text
gaps.{{51..61}.{field,reason},{62..89,91,92}.{expected,field,reason},90.{attemptedSources,expected,field,reason},{93..155}}
```

### payload.txt

SHA-256 before `c4abe6679d23ad37e37f446db0418e80d211224167956131f42ed774e1ad9e3e`; after `e55e163d726e41894f0e49fb348282402738c9408dc71330ecdec50935bafa30`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `d067ae4092241a52825e12a18f73f6a246fe941cb816321044b06cafca6d6f2a`; after `9e1ba0da1002ff656f45d438ce938975d48cd3337e0ba56dcca9d1ba9de45db9`.

181 changed JSON leaves, all enumerated below.

- **appendix (179 leaves):** Substitution/missing-data/provenance records carry the changed inputs, filings and compatibility stamps; ordered arrays shift after additions. Existing unknown evidence stays unknown.

```text
appendix.missingData.{{54..64}.{field,reason},{65..92,94,95}.{expected,field,reason},93.{attemptedSources,expected,field,reason},{96..158}}
```

- **balanceSheet (1 leaves):** Cash, coverage and capital descriptions read the corrected filed flow family and its qualifications; no balance-sheet stock is independently substituted by this change.

```text
balanceSheet.coverage.commentary.1.text
```

- **meta (1 leaves):** Report/payload/Stage B compatibility stamps advance; payload fingerprint and method-identity hashes identify the revised meaning. Stored-report bytes are untouched.

```text
meta.specVersion
```

### report.md

SHA-256 before `9bccb076f6f4e3ab3bc25879d2cd1222c64e3d0b29bc10785afdb03527338541`; after `f134788466d352fdd69de3376ad2890f04cd85f6d04459c3c0242a340b2a458f`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `8ed195d12e5ec0e9c686593223d729652016048865189be44c2ec598e14cc7e9`; after `08c74f01b643a4c3bb03e6c892156342f691179e2f0d3b0092f73d2add620335`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `43ac6827d0b3f55f2111d5263e4161870869e695fb67a2c794ab613df3cdf96c`; after `5be35a97e36c418c5c127b4d56dc054089ba15cf6c67c0d40a559d3a00495483`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `6a3c670e88d7886a65152de4fc99065b0ce6aaa4f8cd81498ded3c31705fdec5`; after `6bbc74fbf869b80408cfa75ca367c4c7786bbe4595dcb545afc3cb81c7e914cb`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:182abc3c"` to `"1.95.0:7fd34bb8"`, approved because its version and covered deterministic content changed.

## qcom-data-only

2 independently filed input corrections are listed below. Repeated aliases and dependent FCF are represented by their capex input, not counted again.

| Field | Window | Filed/admitted amount | SEC tag(s) | Filing evidence |
| --- | --- | ---: | --- | --- |
| cashflowAnnual.incomeTaxesPaid | 2024-09-30 to 2025-09-28 | 3100000000 USD | us-gaap/IncomeTaxesPaidNet | 10-K 0000804328-25-000085, filed 2025-11-05 |
| cashflowAnnual.incomeTaxesPaid | 2017-09-25 to 2018-09-30 | 877000000 USD | us-gaap/IncomeTaxesPaidNet | 10-K 0001728949-18-000095, filed 2018-11-07 |

### stageB.json

SHA-256 before `b07eb9aea95833b278f0f0f21bd503c5385c7dcaf923f3378e2488b00b11193e`; after `5d7ab7bb90be7e79f84ad65dd06ffd88b14342db5215219a730a0ad92ac32651`.

282 changed JSON leaves, all enumerated below.

- **capital (1 leaves):** Admitted capex, D&A, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.current.cashBridge.definition
```

- **gaps (281 leaves):** New filed substitutions and missing-compatible-counterpart disclosures are added; recovered typed value-only conflicts retire only their own old refusal. Array positions shift after insertion.

```text
gaps.{{9,11,12}.{field,reason,severity},{10,13,14,16}.{attemptedSources,expected,field,reason,severity},15.{attemptedSources,field,reason,severity},{17,42,59}.{field,reason},{18..20,25,34,36,64}.{attemptedSources,expected,field,reason},{21,22,24,27..29}.{attemptedSources.{0,1},{field,reason}},23.{attemptedSources.{0,1},{expected,field,reason}},{26,31..33,35,37,38}.{attemptedSources,field,reason},30.{attemptedSources.{0..2},{field,reason}},{39..41,43..58,60..63,65..72}.{expected,field,reason},{73..138}}
```

### payload.txt

SHA-256 before `da45b2de65b722a5998f24b19f62c2825588b591eb2c03c3475a55e8e9e082c5`; after `f372ae5a4223a89edf7e2718db5cc777f2d22e9d38ffb854f1d3e1d037a577b3`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `fd43370aa275b8076006392653c1c6aac3b70dc695cb832ef12e452e116a08bf`; after `43cb4ed62c2a5b486560c9179c357a0ca782ca3fa7c97bf825cc0ce863cf68b0`.

292 changed JSON leaves, all enumerated below.

- **appendix (288 leaves):** Substitution/missing-data/provenance records carry the changed inputs, filings and compatibility stamps; ordered arrays shift after additions. Existing unknown evidence stays unknown.

```text
appendix.missingData.{{10..12,14..17}.{attemptedSources,expected,field,reason,severity},13.{attemptedSources,field,reason,severity},{18..20,23,30}.{attemptedSources.{0,1},{field,reason}},{21,29}.{attemptedSources.{0,1},{expected,field,reason}},22.{attemptedSources.0,{field,reason}},{24..28,65}.{attemptedSources,expected,field,reason},31.{attemptedSources.{0..2},{field,reason}},{32..36,40..42,44..59,61..64,66..73}.{expected,field,reason},{37..39}.{attemptedSources,field,reason},{43,60}.{field,reason},{74..139}}
```

- **balanceSheet (1 leaves):** Cash, coverage and capital descriptions read the corrected filed flow family and its qualifications; no balance-sheet stock is independently substituted by this change.

```text
balanceSheet.coverage.commentary.1.text
```

- **meta (2 leaves):** Report/payload/Stage B compatibility stamps advance; payload fingerprint and method-identity hashes identify the revised meaning. Stored-report bytes are untouched.

```text
meta.{dataCompleteness.warningCount,specVersion}
```

- **verdict (1 leaves):** The unchanged verdict presentation reads the recalculated composite and evidence qualifications.

```text
verdict.synthesis
```

### report.md

SHA-256 before `0dde64a357f2085a10559ce2dd2e4e5ee71620b11c01b239ebbf291ea088e50b`; after `6ba8eaddb9a1380fa5c81ca7a25b6fdd1574b06399ffe42ccb105958ce8aa193`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `a9d334eb339f65459f5d1afc2785fd3ecf38920fbc4cfe87d061eaea7dc1289a`; after `8e3c4064156f21e78748cdc5c1665b89df2233f496609e55781d56454c318801`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `a6af831984ba65e641d70648e63c86e9ebb793fc466f704adf40da0b4833f625`; after `4d60ed77cc7984f6868259878a0ff74b17a4fcc581f8e2548f87af5d86afb69e`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `2f954cde1b62a1a776ddc9a5fa29595fdb6cdd9ddbef27fd6041a1afdef1d9ce`; after `d6f29320f94f8cf22627b14aa7ba3f1c5de12b0e3e083b1d8cb2a416029b68c8`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:75d7d0b1"` to `"1.95.0:fa62cef0"`, approved because its version and covered deterministic content changed.

## jpm-data-only

44 independently filed input corrections are listed below. Repeated aliases and dependent FCF are represented by their capex input, not counted again.

| Field | Window | Filed/admitted amount | SEC tag(s) | Filing evidence |
| --- | --- | ---: | --- | --- |
| incomeQuarterly.depreciationAndAmortization | 2026-07-01 to 2026-09-30 | 2903000000 USD (compatible YTD difference) | us-gaap/DepreciationAmortizationAndAccretionNet | 10-Q 0001628280-26-069523, filed 2026-11-03 + 10-Q 0001628280-26-054343, filed 2026-08-06 |
| cashflowAnnual.commonStockRepurchased | 2025-01-01 to 2025-12-31 | -31591000000 USD | us-gaap/PaymentsForRepurchaseOfCommonStock | 10-K 0001628280-26-008131, filed 2026-02-13 |
| cashflowAnnual.stockBasedCompensation | 2025-01-01 to 2025-12-31 | 3614000000 USD | us-gaap/ShareBasedCompensation | 10-K 0001628280-26-008131, filed 2026-02-13 |
| cashflowAnnual.stockBasedCompensation | 2024-01-01 to 2024-12-31 | 3504000000 USD | us-gaap/ShareBasedCompensation | 10-K 0000019617-25-000270, filed 2025-02-14 |
| cashflowAnnual.commonStockRepurchased | 2024-01-01 to 2024-12-31 | -18830000000 USD | us-gaap/PaymentsForRepurchaseOfCommonStock | 10-K 0000019617-25-000270, filed 2025-02-14 |
| cashflowAnnual.stockBasedCompensation | 2023-01-01 to 2023-12-31 | 3117000000 USD | us-gaap/ShareBasedCompensation | 10-K 0000019617-24-000225, filed 2024-02-16 |
| cashflowAnnual.stockBasedCompensation | 2022-01-01 to 2022-12-31 | 2794000000 USD | us-gaap/ShareBasedCompensation | 10-K 0000019617-23-000231, filed 2023-02-21 |
| cashflowAnnual.commonStockRepurchased | 2022-01-01 to 2022-12-31 | -3162000000 USD | us-gaap/PaymentsForRepurchaseOfCommonStock | 10-K 0000019617-23-000231, filed 2023-02-21 |
| cashflowAnnual.stockBasedCompensation | 2021-01-01 to 2021-12-31 | 2929000000 USD | us-gaap/ShareBasedCompensation | 10-K 0000019617-22-000272, filed 2022-02-22 |
| cashflowAnnual.stockBasedCompensation | 2020-01-01 to 2020-12-31 | 2451000000 USD | us-gaap/ShareBasedCompensation | 10-K 0000019617-21-000236, filed 2021-02-23 |
| cashflowAnnual.commonStockRepurchased | 2020-01-01 to 2020-12-31 | -6517000000 USD | us-gaap/PaymentsForRepurchaseOfCommonStock | 10-K 0000019617-21-000236, filed 2021-02-23 |
| cashflowAnnual.stockBasedCompensation | 2019-01-01 to 2019-12-31 | 2256000000 USD | us-gaap/ShareBasedCompensation | 10-K 0000019617-20-000257, filed 2020-02-25 |
| cashflowAnnual.commonStockRepurchased | 2019-01-01 to 2019-12-31 | -24001000000 USD | us-gaap/PaymentsForRepurchaseOfCommonStock | 10-K 0000019617-20-000257, filed 2020-02-25 |
| cashflowAnnual.stockBasedCompensation | 2018-01-01 to 2018-12-31 | 2322000000 USD | us-gaap/ShareBasedCompensation | 10-K 0000019617-19-000054, filed 2019-02-26 |
| cashflowAnnual.commonStockRepurchased | 2018-01-01 to 2018-12-31 | -19983000000 USD | us-gaap/PaymentsForRepurchaseOfCommonStock | 10-K 0000019617-19-000054, filed 2019-02-26 |
| cashflowAnnual.stockBasedCompensation | 2017-01-01 to 2017-12-31 | 2070000000 USD | us-gaap/ShareBasedCompensation | 10-K 0000019617-18-000057, filed 2018-02-27 |
| cashflowAnnual.commonStockRepurchased | 2017-01-01 to 2017-12-31 | -15410000000 USD | us-gaap/PaymentsForRepurchaseOfCommonStock | 10-K 0000019617-18-000057, filed 2018-02-27 |
| cashflowAnnual.stockBasedCompensation | 2016-01-01 to 2016-12-31 | 1940000000 USD | us-gaap/ShareBasedCompensation | 10-K 0000019617-17-000314, filed 2017-02-28 |
| cashflowQuarterly.stockBasedCompensation | 2025-07-01 to 2025-09-30 | 910000000 USD | us-gaap/ShareBasedCompensation | 10-Q 0001628280-25-048859, filed 2025-11-04 |
| cashflowQuarterly.stockBasedCompensation | 2025-04-01 to 2025-06-30 | 959000000 USD | us-gaap/ShareBasedCompensation | 10-Q 0000019617-25-000615, filed 2025-08-05 |
| cashflowQuarterly.stockBasedCompensation | 2025-01-01 to 2025-03-31 | 1053000000 USD | us-gaap/ShareBasedCompensation | 10-Q 0000019617-25-000421, filed 2025-05-01 |
| cashflowQuarterly.commonStockRepurchased | 2025-01-01 to 2025-03-31 | -7528000000 USD | us-gaap/PaymentsForRepurchaseOfCommonStock | 10-Q 0000019617-25-000421, filed 2025-05-01 |
| cashflowQuarterly.stockBasedCompensation | 2024-10-01 to 2024-12-31 | 773000000 USD (compatible YTD difference) | us-gaap/ShareBasedCompensation | 10-K 0000019617-25-000270, filed 2025-02-14 + 10-Q 0000019617-24-000611, filed 2024-10-30 |
| cashflowQuarterly.commonStockRepurchased | 2024-10-01 to 2024-12-31 | -4301000000 USD (compatible YTD difference) | us-gaap/PaymentsForRepurchaseOfCommonStock | 10-K 0000019617-25-000270, filed 2025-02-14 + 10-Q 0000019617-24-000611, filed 2024-10-30 |
| cashflowQuarterly.stockBasedCompensation | 2024-07-01 to 2024-09-30 | 849000000 USD | us-gaap/ShareBasedCompensation | 10-Q 0000019617-24-000611, filed 2024-10-30 |
| cashflowQuarterly.commonStockRepurchased | 2024-07-01 to 2024-09-30 | -6361000000 USD (compatible YTD difference) | us-gaap/PaymentsForRepurchaseOfCommonStock | 10-Q 0000019617-24-000611, filed 2024-10-30 + 10-Q 0000019617-24-000453, filed 2024-08-02 |
| cashflowQuarterly.stockBasedCompensation | 2024-04-01 to 2024-06-30 | 944000000 USD | us-gaap/ShareBasedCompensation | 10-Q 0000019617-24-000453, filed 2024-08-02 |
| cashflowQuarterly.commonStockRepurchased | 2024-04-01 to 2024-06-30 | -5336000000 USD (compatible YTD difference) | us-gaap/PaymentsForRepurchaseOfCommonStock | 10-Q 0000019617-24-000453, filed 2024-08-02 + 10-Q 0000019617-24-000326, filed 2024-05-01 |
| cashflowQuarterly.stockBasedCompensation | 2024-01-01 to 2024-03-31 | 938000000 USD | us-gaap/ShareBasedCompensation | 10-Q 0000019617-24-000326, filed 2024-05-01 |
| cashflowQuarterly.stockBasedCompensation | 2023-10-01 to 2023-12-31 | 631000000 USD (compatible YTD difference) | us-gaap/ShareBasedCompensation | 10-K 0000019617-24-000225, filed 2024-02-16 + 10-Q 0000019617-23-000524, filed 2023-11-01 |
| cashflowQuarterly.stockBasedCompensation | 2023-07-01 to 2023-09-30 | 782000000 USD | us-gaap/ShareBasedCompensation | 10-Q 0000019617-23-000524, filed 2023-11-01 |
| cashflowQuarterly.stockBasedCompensation | 2023-04-01 to 2023-06-30 | 834000000 USD | us-gaap/ShareBasedCompensation | 10-Q 0000019617-23-000432, filed 2023-08-03 |
| cashflowQuarterly.stockBasedCompensation | 2023-01-01 to 2023-03-31 | 870000000 USD | us-gaap/ShareBasedCompensation | 10-Q 0000019617-23-000310, filed 2023-05-03 |
| cashflowQuarterly.stockBasedCompensation | 2022-10-01 to 2022-12-31 | 485000000 USD (compatible YTD difference) | us-gaap/ShareBasedCompensation | 10-K 0000019617-23-000231, filed 2023-02-21 + 10-Q 0000019617-22-000492, filed 2022-11-03 |
| cashflowQuarterly.commonStockRepurchased | 2022-10-01 to 2022-12-31 | 0 USD (compatible YTD difference) | us-gaap/PaymentsForRepurchaseOfCommonStock | 10-K 0000019617-23-000231, filed 2023-02-21 + 10-Q 0000019617-22-000492, filed 2022-11-03 |
| cashflowQuarterly.stockBasedCompensation | 2022-07-01 to 2022-09-30 | 684000000 USD | us-gaap/ShareBasedCompensation | 10-Q 0000019617-22-000492, filed 2022-11-03 |
| cashflowQuarterly.stockBasedCompensation | 2022-04-01 to 2022-06-30 | 819000000 USD | us-gaap/ShareBasedCompensation | 10-Q 0000019617-22-000422, filed 2022-08-03 |
| cashflowQuarterly.stockBasedCompensation | 2022-01-01 to 2022-03-31 | 806000000 USD | us-gaap/ShareBasedCompensation | 10-Q 0000019617-22-000319, filed 2022-05-03 |
| cashflowQuarterly.commonStockRepurchased | 2022-01-01 to 2022-03-31 | -2455000000 USD | us-gaap/PaymentsForRepurchaseOfCommonStock | 10-Q 0000019617-22-000319, filed 2022-05-03 |
| cashflowQuarterly.stockBasedCompensation | 2021-10-01 to 2021-12-31 | 664000000 USD (compatible YTD difference) | us-gaap/ShareBasedCompensation | 10-K 0000019617-22-000272, filed 2022-02-22 + 10-Q 0000019617-21-000458, filed 2021-11-02 |
| cashflowQuarterly.stockBasedCompensation | 2021-07-01 to 2021-09-30 | 618000000 USD | us-gaap/ShareBasedCompensation | 10-Q 0000019617-21-000458, filed 2021-11-02 |
| cashflowQuarterly.stockBasedCompensation | 2021-04-01 to 2021-06-30 | 743000000 USD | us-gaap/ShareBasedCompensation | 10-Q 0000019617-21-000373, filed 2021-08-02 |
| cashflowQuarterly.stockBasedCompensation | 2021-01-01 to 2021-03-31 | 904000000 USD | us-gaap/ShareBasedCompensation | 10-Q 0000019617-21-000292, filed 2021-05-04 |
| cashflowQuarterly.stockBasedCompensation | 2020-10-01 to 2020-12-31 | 484000000 USD (compatible YTD difference) | us-gaap/ShareBasedCompensation | 10-K 0000019617-21-000236, filed 2021-02-23 + 10-Q 0000019617-20-000438, filed 2020-11-02 |

### stageB.json

SHA-256 before `49546bede47877232cf872d54a23e2a66c0c36287cdcc07490fa9c6138ae6a6d`; after `141ae3e7bcbfbc9cd553833f8e669b967e2c68eb19a7201a4b35bc7c70feb58c`.

413 changed JSON leaves, all enumerated below.

- **capital (14 leaves):** Admitted capex, D&A, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.{buybackPriceAnalysis.{{avgPricePaidProxy,note,premiumDiscountPct,totalRepurchased},years.{{1,3}.{repurchased,sharesProxy},4}},gaps.{0,1},notes.3,sbc.{latest,pctOfRevenue}}
```

- **fairValue (2 leaves):** Existing fair-value aggregation reads the recalculated valuation outputs and their qualifications.

```text
fairValue.{perShare.value,upsidePct}
```

- **gaps (333 leaves):** New filed substitutions and missing-compatible-counterpart disclosures are added; recovered typed value-only conflicts retire only their own old refusal. Array positions shift after insertion.

```text
gaps.{{0,6..8,16,31,40,42,66,67,76..78}.{attemptedSources,field,reason},{1,24}.{attemptedSources.{0,1},{expected,field,reason}},{2..4}.{attemptedSources.0,field},{5,18,32,37..39,41,79}.{attemptedSources,expected,field,reason},{9..12,19..21,23,33..36,43..65,68..75}.{field,reason},{13..15}.field,17.{attemptedSources,expected,field,reason,severity},{22,25}.{attemptedSources.0,{expected,field,reason}},{26,30}.{attemptedSources.{0..3},{expected,field,reason}},27.{attemptedSources.{0..2},{field,reason}},28.{attemptedSources.{0..3},{field,reason}},29.{attemptedSources.{0..4},{field,reason}},{80..86}.{expected,field,reason},{87..177}}
```

- **scenarioTargets (10 leaves):** Existing scenario calculations read the revised admitted inputs; no scenario parameter or model rule is tuned.

```text
scenarioTargets.{basis.{4,6..8},targets.{0..2}.{perShare.value,upsidePct}}
```

- **scores (9 leaves):** The unchanged scoring formulas read the corrected operands above; driver values, signal arithmetic, aspect/composite results and completeness follow those operands.

```text
scores.{aspects.valuation.{drivers.0.value,score,signals.0.{{contributionPoints,raw,transformedScore},operands.1.value}},assessments.valuation.score,composite.score,factorExposure.0.aboveNeutralPoints}
```

- **valuation (45 leaves):** The unchanged valuation/DCF and multiple formulas read the admitted cash/cost operands and growth history; related inputs, availability, sensitivities and descriptions move together.

```text
valuation.excessReturn.{bookValuePath.{1..10},{equityValue,impliedPToBv,perShare,terminalExcess},financialAssumptions.{{continuingValuePv,continuingValueSharePct,payoutPathBasis},payoutPathPct.{0..8}},{horizonYears,priceToTangibleBookVsRote}.basis,notes.{2,3},payoutRatioPct.value,reverseSolve.{impliedCurrentRoePct,notes.0},startAlternative.{equityValue,perShare},startCoeGrid.{notes.2,perShare.{0..2}.{0..2}}}
```

### payload.txt

SHA-256 before `73db1a5485b3824dd242eb81deabfac76a84434a6547363635696337d16eb8ea`; after `aefb248445d04fa7047f490ec69027391d17c4e26f7d9a62d20d65e168e757d4`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `0d523607ba91c7f861dc21fa862a17d9027eb554ccc9006b1d8eb321df98cebf`; after `05de4949e7bf969500e7a8e1089e8990d6fe50731a46c7cbde3b8e34e67f743f`.

318 changed JSON leaves, all enumerated below.

- **appendix (253 leaves):** Substitution/missing-data/provenance records carry the changed inputs, filings and compatibility stamps; ordered arrays shift after additions. Existing unknown evidence stays unknown.

```text
appendix.missingData.{{16..18,20..24,30,32..55,57..60,63,64,66,67}.{field,reason},19.{attemptedSources,expected,field,reason,severity},{25,29,31}.{attemptedSources.{0,1},{field,reason}},26.{attemptedSources.{0,1},{expected,field,reason}},27.{attemptedSources.{0..3},{field,reason}},28.{attemptedSources.{0..3},{expected,field,reason}},{56,61,62,80,81}.{attemptedSources,field,reason},{65,83..89}.{expected,field,reason},82.{attemptedSources,expected,field,reason},{90..182}}
```

- **balanceSheet (6 leaves):** Cash, coverage and capital descriptions read the corrected filed flow family and its qualifications; no balance-sheet stock is independently substituted by this change.

```text
balanceSheet.capitalAllocation.{1.{source,text},2.{label,source,text},3}
```

- **fairValue (2 leaves):** Existing fair-value aggregation reads the recalculated valuation outputs and their qualifications.

```text
fairValue.{perShare.value,upsidePct}
```

- **meta (2 leaves):** Report/payload/Stage B compatibility stamps advance; payload fingerprint and method-identity hashes identify the revised meaning. Stored-report bytes are untouched.

```text
meta.{dataCompleteness.warningCount,specVersion}
```

- **routeMetrics (3 leaves):** Financial-company metric presentation reads the corrected SBC, payout or cash-flow evidence and its existing applicability rules.

```text
routeMetrics.{metrics.{0,2}.basis,notes.2}
```

- **scenarioPresentation (2 leaves):** Scenario notes and sensitivities read the corrected deterministic expense/cash inputs; scenario methods are unchanged.

```text
scenarioPresentation.sensitivity.{maxPerShare,minPerShare}
```

- **scenarioTargets (10 leaves):** Existing scenario calculations read the revised admitted inputs; no scenario parameter or model rule is tuned.

```text
scenarioTargets.{basis.{4,6..8},targets.{0..2}.{perShare.value,upsidePct}}
```

- **scores (9 leaves):** The unchanged scoring formulas read the corrected operands above; driver values, signal arithmetic, aspect/composite results and completeness follow those operands.

```text
scores.{aspects.valuation.{drivers.0.value,score,signals.0.{{contributionPoints,raw,transformedScore},operands.1.value}},assessments.valuation.score,composite.score,factorExposure.0.aboveNeutralPoints}
```

- **valuation (27 leaves):** The unchanged valuation/DCF and multiple formulas read the admitted cash/cost operands and growth history; related inputs, availability, sensitivities and descriptions move together.

```text
valuation.{dcf.{excessReturnGrid.{notes.2,perShare.{0..2}.{0..2}},perShare.value,upsidePct},graded.{keyNumbers.0.value,oneLineWhy,reasoning.0.text},scenarios.{0..2}.{assumptions.{1,6},priceTarget.value,whatWouldHaveToBeTrue.0}}
```

- **verdict (4 leaves):** The unchanged verdict presentation reads the recalculated composite and evidence qualifications.

```text
verdict.{gradeStrip.valuation.{keyNumbers.0.value,oneLineWhy,reasoning.0.text},synthesis}
```

### report.md

SHA-256 before `3f1c5f884906631ff2f4c8497f1f84bf3ae4598569f0720fe035fbb36ff329a0`; after `d3396d0f648dc01898e5d7fc0042aa8746438acc0246b31770aec74541d158ba`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `4b1f560306f1ae88dddc7d665314217b3aa041fb7d488f542d461814df22dd04`; after `c4f5e92aea4a895bf0d27d454246d1a1aa9fd02ffb2d0624cfdd8cb77c116b0e`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `435fe88648a29242dffc5f535e6c8518984db815262a990566b040a63be3ac12`; after `3cfaeee838640df0482272dfbcde95b1551489a60f253c1948835046d297332b`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `bb3870da9ed8934b90cf303da9a4b3ba8d4eb9cad99f4f920051c86ce09be4fc`; after `77c160ade917a923fd9d4f96b15cc8eda7830026dac747794ce559d09a04654f`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:c7a70366"` to `"1.95.0:232d6eb9"`, approved because its version and covered deterministic content changed.

## pgr-data-only

82 independently filed input corrections are listed below. Repeated aliases and dependent FCF are represented by their capex input, not counted again.

| Field | Window | Filed/admitted amount | SEC tag(s) | Filing evidence |
| --- | --- | ---: | --- | --- |
| incomeAnnual.interestIncome | 2025-01-01 to 2025-12-31 | 3583000000 USD | us-gaap/InterestAndDividendIncomeOperating | 10-K 0000080661-26-000086, filed 2026-03-02 |
| incomeAnnual.interestIncome | 2024-01-01 to 2024-12-31 | 2832000000 USD | us-gaap/InterestAndDividendIncomeOperating | 10-K 0000080661-25-000007, filed 2025-03-03 |
| incomeAnnual.interestIncome | 2023-01-01 to 2023-12-31 | 1891800000 USD | us-gaap/InterestAndDividendIncomeOperating | 10-K 0000080661-24-000007, filed 2024-02-26 |
| incomeAnnual.interestExpense | 2023-01-01 to 2023-12-31 | 268400000 USD | us-gaap/InterestExpenseDebt | 10-K 0000080661-24-000007, filed 2024-02-26 |
| incomeAnnual.interestIncome | 2022-01-01 to 2022-12-31 | 1260300000 USD | us-gaap/InterestAndDividendIncomeOperating | 10-K 0000080661-23-000006, filed 2023-02-27 |
| incomeAnnual.interestExpense | 2022-01-01 to 2022-12-31 | 243500000 USD | us-gaap/InterestExpenseDebt | 10-K 0000080661-23-000006, filed 2023-02-27 |
| incomeAnnual.interestIncome | 2021-01-01 to 2021-12-31 | 860900000 USD | us-gaap/InterestAndDividendIncomeOperating | 10-K 0000080661-22-000046, filed 2022-02-28 |
| incomeAnnual.interestIncome | 2020-01-01 to 2020-12-31 | 936600000 USD | us-gaap/InterestAndDividendIncomeOperating | 10-K 0000080661-21-000014, filed 2021-03-01 |
| incomeAnnual.interestIncome | 2019-01-01 to 2019-12-31 | 1042000000 USD | us-gaap/InterestAndDividendIncomeOperating | 10-K 0000080661-20-000006, filed 2020-03-02 |
| incomeAnnual.interestIncome | 2018-01-01 to 2018-12-31 | 820500000 USD | us-gaap/InterestAndDividendIncomeOperating | 10-K 0000080661-19-000008, filed 2019-02-27 |
| incomeAnnual.interestIncome | 2017-01-01 to 2017-12-31 | 563100000 USD | us-gaap/InterestAndDividendIncomeOperating | 10-K 0000080661-18-000011, filed 2018-02-27 |
| incomeAnnual.interestIncome | 2016-01-01 to 2016-12-31 | 478900000 USD | us-gaap/InterestAndDividendIncomeOperating | 10-K 0000080661-17-000012, filed 2017-03-01 |
| incomeQuarterly.interestIncome | 2026-07-01 to 2026-09-30 | 1035000000 USD | us-gaap/InterestAndDividendIncomeOperating | 10-Q 0000080661-26-000379, filed 2026-11-02 |
| incomeQuarterly.interestIncome | 2026-04-01 to 2026-06-30 | 979000000 USD | us-gaap/InterestAndDividendIncomeOperating | 10-Q 0000080661-26-000308, filed 2026-08-03 |
| incomeQuarterly.interestIncome | 2026-01-01 to 2026-03-31 | 917000000 USD | us-gaap/InterestAndDividendIncomeOperating | 10-Q 0000080661-26-000177, filed 2026-05-04 |
| incomeQuarterly.interestIncome | 2025-10-01 to 2025-12-31 | 974000000 USD (compatible YTD difference) | us-gaap/InterestAndDividendIncomeOperating | 10-K 0000080661-26-000086, filed 2026-03-02 + 10-Q 0000080661-25-000129, filed 2025-11-03 |
| incomeQuarterly.interestIncome | 2025-07-01 to 2025-09-30 | 924000000 USD | us-gaap/InterestAndDividendIncomeOperating | 10-Q 0000080661-25-000129, filed 2025-11-03 |
| incomeQuarterly.interestIncome | 2025-04-01 to 2025-06-30 | 871000000 USD | us-gaap/InterestAndDividendIncomeOperating | 10-Q 0000080661-25-000051, filed 2025-08-04 |
| incomeQuarterly.interestIncome | 2025-01-01 to 2025-03-31 | 814000000 USD | us-gaap/InterestAndDividendIncomeOperating | 10-Q 0000080661-25-000023, filed 2025-05-05 |
| incomeQuarterly.interestIncome | 2024-10-01 to 2024-12-31 | 789900000 USD (compatible YTD difference) | us-gaap/InterestAndDividendIncomeOperating | 10-K 0000080661-25-000007, filed 2025-03-03 + 10-Q 0000080661-24-000045, filed 2024-11-04 |
| incomeQuarterly.interestIncome | 2024-07-01 to 2024-09-30 | 739500000 USD | us-gaap/InterestAndDividendIncomeOperating | 10-Q 0000080661-24-000045, filed 2024-11-04 |
| incomeQuarterly.interestIncome | 2024-04-01 to 2024-06-30 | 685000000 USD | us-gaap/InterestAndDividendIncomeOperating | 10-Q 0000080661-24-000031, filed 2024-08-05 |
| incomeQuarterly.interestIncome | 2024-01-01 to 2024-03-31 | 617600000 USD | us-gaap/InterestAndDividendIncomeOperating | 10-Q 0000080661-24-000018, filed 2024-05-06 |
| incomeQuarterly.interestExpense | 2024-01-01 to 2024-03-31 | 69600000 USD | us-gaap/InterestExpenseDebt | 10-Q 0000080661-24-000018, filed 2024-05-06 |
| incomeQuarterly.interestIncome | 2023-10-01 to 2023-12-31 | 507500000 USD (compatible YTD difference) | us-gaap/InterestAndDividendIncomeOperating | 10-K 0000080661-24-000007, filed 2024-02-26 + 10-Q 0000080661-23-000049, filed 2023-10-31 |
| incomeQuarterly.interestIncome | 2023-07-01 to 2023-09-30 | 510200000 USD | us-gaap/InterestAndDividendIncomeOperating | 10-Q 0000080661-23-000049, filed 2023-10-31 |
| incomeQuarterly.interestIncome | 2023-04-01 to 2023-06-30 | 454500000 USD | us-gaap/InterestAndDividendIncomeOperating | 10-Q 0000080661-23-000037, filed 2023-08-01 |
| incomeQuarterly.interestIncome | 2023-01-01 to 2023-03-31 | 419600000 USD | us-gaap/InterestAndDividendIncomeOperating | 10-Q 0000080661-23-000023, filed 2023-05-02 |
| incomeQuarterly.interestIncome | 2022-10-01 to 2022-12-31 | 392100000 USD (compatible YTD difference) | us-gaap/InterestAndDividendIncomeOperating | 10-K 0000080661-23-000006, filed 2023-02-27 + 10-Q 0000080661-22-000080, filed 2022-11-01 |
| incomeQuarterly.interestIncome | 2022-07-01 to 2022-09-30 | 333600000 USD | us-gaap/InterestAndDividendIncomeOperating | 10-Q 0000080661-22-000080, filed 2022-11-01 |
| incomeQuarterly.interestIncome | 2022-04-01 to 2022-06-30 | 292400000 USD | us-gaap/InterestAndDividendIncomeOperating | 10-Q 0000080661-22-000071, filed 2022-08-02 |
| incomeQuarterly.interestIncome | 2022-01-01 to 2022-03-31 | 242200000 USD | us-gaap/InterestAndDividendIncomeOperating | 10-Q 0000080661-22-000058, filed 2022-05-02 |
| incomeQuarterly.interestIncome | 2021-10-01 to 2021-12-31 | 221100000 USD (compatible YTD difference) | us-gaap/InterestAndDividendIncomeOperating | 10-K 0000080661-22-000046, filed 2022-02-28 + 10-Q 0000080661-21-000053, filed 2021-11-02 |
| incomeQuarterly.interestIncome | 2021-07-01 to 2021-09-30 | 208900000 USD | us-gaap/InterestAndDividendIncomeOperating | 10-Q 0000080661-21-000053, filed 2021-11-02 |
| incomeQuarterly.interestIncome | 2021-04-01 to 2021-06-30 | 210700000 USD | us-gaap/InterestAndDividendIncomeOperating | 10-Q 0000080661-21-000044, filed 2021-08-03 |
| incomeQuarterly.interestIncome | 2021-01-01 to 2021-03-31 | 220200000 USD | us-gaap/InterestAndDividendIncomeOperating | 10-Q 0000080661-21-000030, filed 2021-05-04 |
| incomeQuarterly.interestIncome | 2020-10-01 to 2020-12-31 | 221100000 USD (compatible YTD difference) | us-gaap/InterestAndDividendIncomeOperating | 10-K 0000080661-21-000014, filed 2021-03-01 + 10-Q 0000080661-20-000040, filed 2020-11-03 |
| cashflowAnnual.incomeTaxesPaid | 2025-01-01 to 2025-12-31 | 3107000000 USD | us-gaap/IncomeTaxesPaidNet | 10-K 0000080661-26-000086, filed 2026-03-02 |
| cashflowAnnual.interestPaid | 2025-01-01 to 2025-12-31 | 276000000 USD | us-gaap/InterestPaidNet | 10-K 0000080661-26-000086, filed 2026-03-02 |
| cashflowAnnual.acquisitionsNet | 2022-01-01 to 2022-12-31 | 0 USD | us-gaap/PaymentsToAcquireBusinessesNetOfCashAcquired | 10-K 0000080661-23-000006, filed 2023-02-27 |
| cashflowAnnual.acquisitionsNet | 2019-01-01 to 2019-12-31 | 0 USD | us-gaap/PaymentsToAcquireBusinessesNetOfCashAcquired | 10-K 0000080661-20-000006, filed 2020-03-02 |
| cashflowAnnual.incomeTaxesPaid | 2019-01-01 to 2019-12-31 | 954300000 USD | us-gaap/IncomeTaxesPaid | 10-K 0000080661-20-000006, filed 2020-03-02 |
| cashflowAnnual.acquisitionsNet | 2018-01-01 to 2018-12-31 | 0 USD | us-gaap/PaymentsToAcquireBusinessesNetOfCashAcquired | 10-K 0000080661-19-000008, filed 2019-02-27 |
| cashflowAnnual.incomeTaxesPaid | 2018-01-01 to 2018-12-31 | 702600000 USD | us-gaap/IncomeTaxesPaid | 10-K 0000080661-19-000008, filed 2019-02-27 |
| cashflowAnnual.interestPaid | 2018-01-01 to 2018-12-31 | 154000000 USD | us-gaap/InterestPaid | 10-K 0000080661-19-000008, filed 2019-02-27 |
| cashflowAnnual.incomeTaxesPaid | 2017-01-01 to 2017-12-31 | 715600000 USD | us-gaap/IncomeTaxesPaid | 10-K 0000080661-18-000011, filed 2018-02-27 |
| cashflowAnnual.interestPaid | 2017-01-01 to 2017-12-31 | 146300000 USD | us-gaap/InterestPaid | 10-K 0000080661-18-000011, filed 2018-02-27 |
| cashflowAnnual.acquisitionsNet | 2016-01-01 to 2016-12-31 | 0 USD | us-gaap/PaymentsToAcquireBusinessesNetOfCashAcquired | 10-K 0000080661-17-000012, filed 2017-03-01 |
| cashflowAnnual.incomeTaxesPaid | 2016-01-01 to 2016-12-31 | 459400000 USD | us-gaap/IncomeTaxesPaid | 10-K 0000080661-17-000012, filed 2017-03-01 |
| cashflowAnnual.interestPaid | 2016-01-01 to 2016-12-31 | 139200000 USD | us-gaap/InterestPaid | 10-K 0000080661-17-000012, filed 2017-03-01 |
| cashflowQuarterly.incomeTaxesPaid | 2026-07-01 to 2026-09-30 | 790000000 USD (compatible YTD difference) | us-gaap/IncomeTaxesPaidNet | 10-Q 0000080661-26-000379, filed 2026-11-02 + 10-Q 0000080661-26-000308, filed 2026-08-03 |
| cashflowQuarterly.interestPaid | 2026-07-01 to 2026-09-30 | 125000000 USD (compatible YTD difference) | us-gaap/InterestPaidNet | 10-Q 0000080661-26-000379, filed 2026-11-02 + 10-Q 0000080661-26-000308, filed 2026-08-03 |
| cashflowQuarterly.interestPaid | 2026-04-01 to 2026-06-30 | 50000000 USD (compatible YTD difference) | us-gaap/InterestPaidNet | 10-Q 0000080661-26-000308, filed 2026-08-03 + 10-Q 0000080661-26-000177, filed 2026-05-04 |
| cashflowQuarterly.interestPaid | 2026-01-01 to 2026-03-31 | 88000000 USD | us-gaap/InterestPaidNet | 10-Q 0000080661-26-000177, filed 2026-05-04 |
| cashflowQuarterly.interestPaid | 2025-10-01 to 2025-12-31 | 50000000 USD (compatible YTD difference) | us-gaap/InterestPaidNet | 10-K 0000080661-26-000086, filed 2026-03-02 + 10-Q 0000080661-25-000129, filed 2025-11-03 |
| cashflowQuarterly.interestPaid | 2025-07-01 to 2025-09-30 | 88000000 USD (compatible YTD difference) | us-gaap/InterestPaidNet | 10-Q 0000080661-25-000129, filed 2025-11-03 + 10-Q 0000080661-25-000051, filed 2025-08-04 |
| cashflowQuarterly.interestPaid | 2025-04-01 to 2025-06-30 | 50000000 USD (compatible YTD difference) | us-gaap/InterestPaidNet | 10-Q 0000080661-25-000051, filed 2025-08-04 + 10-Q 0000080661-25-000023, filed 2025-05-05 |
| cashflowQuarterly.interestPaid | 2025-01-01 to 2025-03-31 | 88000000 USD | us-gaap/InterestPaidNet | 10-Q 0000080661-25-000023, filed 2025-05-05 |
| cashflowQuarterly.interestPaid | 2024-10-01 to 2024-12-31 | 50100000 USD (compatible YTD difference) | us-gaap/InterestPaidNet | 10-K 0000080661-25-000007, filed 2025-03-03 + 10-Q 0000080661-24-000045, filed 2024-11-04 |
| cashflowQuarterly.preferredDividendsPaid | 2024-01-01 to 2024-03-31 | -7800000 USD | us-gaap/PaymentsOfDividendsPreferredStockAndPreferenceStock | 10-Q 0000080661-24-000018, filed 2024-05-06 |
| cashflowQuarterly.netCashProvidedByFinancingActivities | 2024-01-01 to 2024-03-31 | -1042800000 USD | us-gaap/NetCashProvidedByUsedInFinancingActivities | 10-Q 0000080661-24-000018, filed 2024-05-06 |
| cashflowQuarterly.capitalExpenditure | 2024-01-01 to 2024-03-31 | -50200000 USD | us-gaap/PaymentsToAcquirePropertyPlantAndEquipment | 10-Q 0000080661-24-000018, filed 2024-05-06 |
| cashflowQuarterly.interestPaid | 2023-10-01 to 2023-12-31 | 51400000 USD (compatible YTD difference) | us-gaap/InterestPaidNet | 10-K 0000080661-24-000007, filed 2024-02-26 + 10-Q 0000080661-23-000049, filed 2023-10-31 |
| cashflowQuarterly.interestPaid | 2023-07-01 to 2023-09-30 | 87900000 USD (compatible YTD difference) | us-gaap/InterestPaidNet | 10-Q 0000080661-23-000049, filed 2023-10-31 + 10-Q 0000080661-23-000037, filed 2023-08-01 |
| cashflowQuarterly.interestPaid | 2023-04-01 to 2023-06-30 | 37700000 USD (compatible YTD difference) | us-gaap/InterestPaidNet | 10-Q 0000080661-23-000037, filed 2023-08-01 + 10-Q 0000080661-23-000023, filed 2023-05-02 |
| cashflowQuarterly.acquisitionsNet | 2022-10-01 to 2022-12-31 | 0 USD (compatible YTD difference) | us-gaap/PaymentsToAcquireBusinessesNetOfCashAcquired | 10-K 0000080661-23-000006, filed 2023-02-27 + 10-Q 0000080661-22-000080, filed 2022-11-01 |
| cashflowQuarterly.incomeTaxesPaid | 2022-10-01 to 2022-12-31 | 123100000 USD (compatible YTD difference) | us-gaap/IncomeTaxesPaid | 10-K 0000080661-23-000006, filed 2023-02-27 + 10-Q 0000080661-22-000080, filed 2022-11-01 |
| cashflowQuarterly.interestPaid | 2022-10-01 to 2022-12-31 | 37600000 USD (compatible YTD difference) | us-gaap/InterestPaidNet | 10-K 0000080661-23-000006, filed 2023-02-27 + 10-Q 0000080661-22-000080, filed 2022-11-01 |
| cashflowQuarterly.acquisitionsNet | 2022-07-01 to 2022-09-30 | 0 USD (compatible YTD difference) | us-gaap/PaymentsToAcquireBusinessesNetOfCashAcquired | 10-Q 0000080661-22-000080, filed 2022-11-01 + 10-Q 0000080661-22-000071, filed 2022-08-02 |
| cashflowQuarterly.incomeTaxesPaid | 2022-07-01 to 2022-09-30 | 232700000 USD (compatible YTD difference) | us-gaap/IncomeTaxesPaid | 10-Q 0000080661-22-000080, filed 2022-11-01 + 10-Q 0000080661-22-000071, filed 2022-08-02 |
| cashflowQuarterly.interestPaid | 2022-07-01 to 2022-09-30 | 88700000 USD (compatible YTD difference) | us-gaap/InterestPaidNet | 10-Q 0000080661-22-000080, filed 2022-11-01 + 10-Q 0000080661-22-000071, filed 2022-08-02 |
| cashflowQuarterly.incomeTaxesPaid | 2022-04-01 to 2022-06-30 | 363200000 USD (compatible YTD difference) | us-gaap/IncomeTaxesPaid | 10-Q 0000080661-22-000071, filed 2022-08-02 + 10-Q 0000080661-22-000058, filed 2022-05-02 |
| cashflowQuarterly.interestPaid | 2022-04-01 to 2022-06-30 | 37700000 USD (compatible YTD difference) | us-gaap/InterestPaidNet | 10-Q 0000080661-22-000071, filed 2022-08-02 + 10-Q 0000080661-22-000058, filed 2022-05-02 |
| cashflowQuarterly.interestPaid | 2022-01-01 to 2022-03-31 | 64900000 USD | us-gaap/InterestPaidNet | 10-Q 0000080661-22-000058, filed 2022-05-02 |
| cashflowQuarterly.acquisitionsNet | 2021-10-01 to 2021-12-31 | 0 USD (compatible YTD difference) | us-gaap/PaymentsToAcquireBusinessesNetOfCashAcquired | 10-K 0000080661-22-000046, filed 2022-02-28 + 10-Q 0000080661-21-000053, filed 2021-11-02 |
| cashflowQuarterly.incomeTaxesPaid | 2021-10-01 to 2021-12-31 | 172900000 USD (compatible YTD difference) | us-gaap/IncomeTaxesPaid | 10-K 0000080661-22-000046, filed 2022-02-28 + 10-Q 0000080661-21-000053, filed 2021-11-02 |
| cashflowQuarterly.interestPaid | 2021-10-01 to 2021-12-31 | 37700000 USD (compatible YTD difference) | us-gaap/InterestPaidNet | 10-K 0000080661-22-000046, filed 2022-02-28 + 10-Q 0000080661-21-000053, filed 2021-11-02 |
| cashflowQuarterly.acquisitionsNet | 2021-07-01 to 2021-09-30 | 0 USD (compatible YTD difference) | us-gaap/PaymentsToAcquireBusinessesNetOfCashAcquired | 10-Q 0000080661-21-000053, filed 2021-11-02 + 10-Q 0000080661-21-000044, filed 2021-08-03 |
| cashflowQuarterly.incomeTaxesPaid | 2021-07-01 to 2021-09-30 | 95400000 USD (compatible YTD difference) | us-gaap/IncomeTaxesPaid | 10-Q 0000080661-21-000053, filed 2021-11-02 + 10-Q 0000080661-21-000044, filed 2021-08-03 |
| cashflowQuarterly.incomeTaxesPaid | 2021-04-01 to 2021-06-30 | 573300000 USD (compatible YTD difference) | us-gaap/IncomeTaxesPaid | 10-Q 0000080661-21-000044, filed 2021-08-03 + 10-Q 0000080661-21-000030, filed 2021-05-04 |
| cashflowQuarterly.incomeTaxesPaid | 2021-01-01 to 2021-03-31 | 800000 USD | us-gaap/IncomeTaxesPaid | 10-Q 0000080661-21-000030, filed 2021-05-04 |
| cashflowQuarterly.incomeTaxesPaid | 2020-10-01 to 2020-12-31 | 367100000 USD (compatible YTD difference) | us-gaap/IncomeTaxesPaid | 10-K 0000080661-21-000014, filed 2021-03-01 + 10-Q 0000080661-20-000040, filed 2020-11-03 |

### stageB.json

SHA-256 before `1309bf4776f51e0431d2fee7084f4660242f59998cedbb3ecbd5ee53a1371d42`; after `29ae0e7d8a29242ed830f74229c14db789264461efdf7f5be2acaf3e7b81a4e8`.

621 changed JSON leaves, all enumerated below.

- **gaps (621 leaves):** New filed substitutions and missing-compatible-counterpart disclosures are added; recovered typed value-only conflicts retire only their own old refusal. Array positions shift after insertion.

```text
gaps.{{35,38..45,47..50,60..63,65..68,73..78,80..83,85..99,103,107..109,113,117,121,134,138,139,146,159,163,167,173,174,179,180,183,185,188,191..194,197,203,204,213,215,216,218}.{field,reason},{36,37,52,72,84,207,210,211}.{attemptedSources,field,reason},46.{attemptedSources,expected,field,reason,severity},{51,59,64,70,205,206,208,209}.{attemptedSources,expected,field,reason},53.{attemptedSources.0,{expected,field,reason}},{54,56,69}.{attemptedSources.{0,1},{field,reason}},{55,57}.{attemptedSources.{0,1},{expected,field,reason}},58.{attemptedSources.0,{field,reason}},{71,100..102,104..106,110..112,114..116,118..120,122..133,135..137,140..145,147..158,160..162,164..166,168..170,172,175,176,178,181,182,184,186,187,189,190,195,196,198..202,212,214,217}.{expected,field,reason},79.{attemptedSources.{0..4},{field,reason}},{171,177}.field,{219..347}}
```

### payload.txt

SHA-256 before `cbde47425e35a188b1ffa0204eebb84cf5e04c375bafc7dab84fecf91f250b32`; after `5275ef68689370e7b76100935647cdfd45317f891970d1e973c68d8402622bcd`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `36b6896b51f3d7b7856f3a11fa9344e961117f5918814a7668b5ea74218b01e0`; after `f308b61031d44e333ab0a793b4ba60cf4873f887fa12acb08b598d7ec5c2cd26`.

582 changed JSON leaves, all enumerated below.

- **appendix (579 leaves):** Substitution/missing-data/provenance records carry the changed inputs, filings and compatibility stamps; ordered arrays shift after additions. Existing unknown evidence stays unknown.

```text
appendix.missingData.{{47,49..53,59..62,65..70,111,113..123,126,130..134,137..140,142..156}.{field,reason},48.{attemptedSources,expected,field,reason,severity},{54,58,63,128}.{attemptedSources.{0,1},{field,reason}},{55,110}.{attemptedSources.{0,1},{expected,field,reason}},56.{attemptedSources.0,{expected,field,reason}},{57,64,108,109}.{attemptedSources.0,{field,reason}},{71,107,112,215}.{attemptedSources,expected,field,reason},{72..79,87,88,92..97,124,135,157..213,216..222}.{expected,field,reason},{80..86,89..91,98..106,125}.field,{127,129,136,141,214}.{attemptedSources,field,reason},{223..351}}
```

- **meta (2 leaves):** Report/payload/Stage B compatibility stamps advance; payload fingerprint and method-identity hashes identify the revised meaning. Stored-report bytes are untouched.

```text
meta.{dataCompleteness.warningCount,specVersion}
```

- **verdict (1 leaves):** The unchanged verdict presentation reads the recalculated composite and evidence qualifications.

```text
verdict.synthesis
```

### report.md

SHA-256 before `0f88afffa43c16ecf5a91de945faa07ee76486ad315540ddb98e9fd9feb20026`; after `2dda124f72ff1ac6f65fcd6bb080dd2fa4d145ab6af8b56ce2ffbf23b49b987a`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `80a2f6dc35e7b3b4d99f888f375e49f930e78d37e086b5c1a4f9f5b0055c8169`; after `3c8d3807959116c4a80660e273bcf5823963cf6322f0568b75f23c5f5da6455c`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `52815cf86c1eaa967a36fea0695362564bd47dea579de91b2ed46b817fbc4fc7`; after `6b0aee0d0282dfe2325f52b7858e8b6afa8e645d9e7bd81a6f80c7952e5269b3`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `9a8c7b9af23644f370ffe667e11b80f1467b902a8031dfd4c9ab7c808d2957b6`; after `e492636ba8fe1572850af4af5338ef5e3ff0ac6d00707fbe3e7ab3b6d671bd2d`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:6bb0b997"` to `"1.95.0:dbd903b2"`, approved because its version and covered deterministic content changed.

## o-data-only

129 independently filed input corrections are listed below. Repeated aliases and dependent FCF are represented by their capex input, not counted again.

| Field | Window | Filed/admitted amount | SEC tag(s) | Filing evidence |
| --- | --- | ---: | --- | --- |
| incomeAnnual.generalAndAdministrativeExpenses | 2025-01-01 to 2025-12-31 | 202554000 USD | us-gaap/GeneralAndAdministrativeExpense | 10-K 0000726728-26-000011, filed 2026-02-25 |
| incomeAnnual.interestExpense | 2025-01-01 to 2025-12-31 | 1134879000 USD | us-gaap/InterestExpenseOperating | 10-K 0000726728-26-000011, filed 2026-02-25 |
| incomeAnnual.interestExpense | 2024-01-01 to 2024-12-31 | 1016955000 USD | us-gaap/InterestExpenseOperating | 10-K 0000726728-25-000055, filed 2025-02-25 |
| incomeAnnual.interestExpense | 2023-01-01 to 2023-12-31 | 730423000 USD | us-gaap/InterestExpense | 10-K 0000726728-24-000047, filed 2024-02-21 |
| incomeAnnual.interestExpense | 2022-01-01 to 2022-12-31 | 465223000 USD | us-gaap/InterestExpense | 10-K 0000726728-23-000044, filed 2023-02-22 |
| incomeAnnual.interestExpense | 2021-01-01 to 2021-12-31 | 323644000 USD | us-gaap/InterestExpense | 10-K 0000726728-22-000046, filed 2022-02-23 |
| incomeAnnual.interestExpense | 2020-01-01 to 2020-12-31 | 309336000 USD | us-gaap/InterestExpense | 10-K 0000726728-21-000043, filed 2021-02-23 |
| incomeAnnual.interestExpense | 2019-01-01 to 2019-12-31 | 290991000 USD | us-gaap/InterestExpense | 10-K 0000726728-20-000033, filed 2020-02-24 |
| incomeAnnual.interestExpense | 2018-01-01 to 2018-12-31 | 266020000 USD | us-gaap/InterestExpense | 10-K 0000726728-19-000038, filed 2019-02-22 |
| incomeAnnual.interestExpense | 2017-01-01 to 2017-12-31 | 247413000 USD | us-gaap/InterestExpense | 10-K 0001104659-18-011376, filed 2018-02-22 |
| incomeAnnual.interestExpense | 2016-01-01 to 2016-12-31 | 219974000 USD | us-gaap/InterestExpense | 10-K 0001104659-17-011170, filed 2017-02-23 |
| incomeQuarterly.interestExpense | 2026-04-01 to 2026-06-30 | 312083000 USD | us-gaap/InterestExpenseOperating | 10-Q 0000726728-26-000048, filed 2026-08-06 |
| incomeQuarterly.interestExpense | 2026-01-01 to 2026-03-31 | 291940000 USD | us-gaap/InterestExpenseOperating | 10-Q 0000726728-26-000030, filed 2026-05-07 |
| incomeQuarterly.generalAndAdministrativeExpenses | 2025-10-01 to 2025-12-31 | 54142000 USD (compatible YTD difference) | us-gaap/GeneralAndAdministrativeExpense | 10-K 0000726728-26-000011, filed 2026-02-25 + 10-Q 0000726728-25-000148, filed 2025-11-04 |
| incomeQuarterly.interestExpense | 2025-10-01 to 2025-12-31 | 288199000 USD (compatible YTD difference) | us-gaap/InterestExpenseOperating | 10-K 0000726728-26-000011, filed 2026-02-25 + 10-Q 0000726728-25-000148, filed 2025-11-04 |
| incomeQuarterly.generalAndAdministrativeExpenses | 2025-07-01 to 2025-09-30 | 55039000 USD | us-gaap/GeneralAndAdministrativeExpense | 10-Q 0000726728-25-000148, filed 2025-11-04 |
| incomeQuarterly.interestExpense | 2025-07-01 to 2025-09-30 | 294482000 USD | us-gaap/InterestExpenseOperating | 10-Q 0000726728-25-000148, filed 2025-11-04 |
| incomeQuarterly.interestExpense | 2025-04-01 to 2025-06-30 | 283824000 USD | us-gaap/InterestExpenseOperating | 10-Q 0000726728-25-000131, filed 2025-08-07 |
| incomeQuarterly.interestExpense | 2025-01-01 to 2025-03-31 | 268374000 USD | us-gaap/InterestExpenseOperating | 10-Q 0000726728-25-000096, filed 2025-05-06 |
| incomeQuarterly.interestExpense | 2024-07-01 to 2024-09-30 | 261261000 USD | us-gaap/InterestExpense | 10-Q 0000726728-24-000130, filed 2024-11-05 |
| incomeQuarterly.interestExpense | 2024-04-01 to 2024-06-30 | 246931000 USD | us-gaap/InterestExpense | 10-Q 0000726728-24-000118, filed 2024-08-06 |
| incomeQuarterly.interestExpense | 2024-01-01 to 2024-03-31 | 240614000 USD | us-gaap/InterestExpense | 10-Q 0000726728-24-000077, filed 2024-05-07 |
| incomeQuarterly.interestExpense | 2023-10-01 to 2023-12-31 | 208313000 USD (compatible YTD difference) | us-gaap/InterestExpense | 10-K 0000726728-24-000047, filed 2024-02-21 + 10-Q 0000726728-23-000115, filed 2023-11-07 |
| incomeQuarterly.interestExpense | 2023-07-01 to 2023-09-30 | 184121000 USD | us-gaap/InterestExpense | 10-Q 0000726728-23-000115, filed 2023-11-07 |
| incomeQuarterly.interestExpense | 2023-04-01 to 2023-06-30 | 183857000 USD | us-gaap/InterestExpense | 10-Q 0000726728-23-000107, filed 2023-08-03 |
| incomeQuarterly.interestExpense | 2023-01-01 to 2023-03-31 | 154132000 USD | us-gaap/InterestExpense | 10-Q 0000726728-23-000068, filed 2023-05-04 |
| incomeQuarterly.interestExpense | 2022-10-01 to 2022-12-31 | 131290000 USD (compatible YTD difference) | us-gaap/InterestExpense | 10-K 0000726728-23-000044, filed 2023-02-22 + 10-Q 0000726728-22-000121, filed 2022-11-03 |
| incomeQuarterly.interestExpense | 2022-07-01 to 2022-09-30 | 117409000 USD | us-gaap/InterestExpense | 10-Q 0000726728-22-000121, filed 2022-11-03 |
| incomeQuarterly.interestExpense | 2022-04-01 to 2022-06-30 | 110121000 USD | us-gaap/InterestExpense | 10-Q 0000726728-22-000103, filed 2022-08-04 |
| incomeQuarterly.interestExpense | 2022-01-01 to 2022-03-31 | 106403000 USD | us-gaap/InterestExpense | 10-Q 0000726728-22-000056, filed 2022-05-05 |
| incomeQuarterly.interestExpense | 2021-10-01 to 2021-12-31 | 100739000 USD (compatible YTD difference) | us-gaap/InterestExpense | 10-K 0000726728-22-000046, filed 2022-02-23 + 10-Q 0000726728-21-000104, filed 2021-11-02 |
| incomeQuarterly.interestExpense | 2021-07-01 to 2021-09-30 | 76156000 USD | us-gaap/InterestExpense | 10-Q 0000726728-21-000104, filed 2021-11-02 |
| incomeQuarterly.interestExpense | 2021-04-01 to 2021-06-30 | 73674000 USD | us-gaap/InterestExpense | 10-Q 0000726728-21-000092, filed 2021-08-03 |
| incomeQuarterly.interestExpense | 2021-01-01 to 2021-03-31 | 73075000 USD | us-gaap/InterestExpense | 10-Q 0000726728-21-000049, filed 2021-05-04 |
| incomeQuarterly.interestExpense | 2020-10-01 to 2020-12-31 | 78764000 USD | us-gaap/InterestExpense | 10-K 0000726728-21-000043, filed 2021-02-23 |
| cashflowAnnual.incomeTaxesPaid | 2025-01-01 to 2025-12-31 | 49785000 USD | us-gaap/IncomeTaxesPaidNet | 10-K 0000726728-26-000011, filed 2026-02-25 |
| cashflowAnnual.interestPaid | 2025-01-01 to 2025-12-31 | 1072484000 USD | us-gaap/InterestPaidNet | 10-K 0000726728-26-000011, filed 2026-02-25 |
| cashflowAnnual.commonStockIssuance | 2024-01-01 to 2024-12-31 | 1742810000 USD | us-gaap/ProceedsFromIssuanceOfCommonStock | 10-K 0000726728-25-000055, filed 2025-02-25 |
| cashflowAnnual.commonDividendsPaid | 2024-01-01 to 2024-12-31 | -2691719000 USD | us-gaap/PaymentsOfDividendsCommonStock | 10-K 0000726728-25-000055, filed 2025-02-25 |
| cashflowAnnual.preferredDividendsPaid | 2024-01-01 to 2024-12-31 | -7763000 USD | us-gaap/PaymentsOfDividendsPreferredStockAndPreferenceStock | 10-K 0000726728-25-000055, filed 2025-02-25 |
| cashflowAnnual.interestPaid | 2024-01-01 to 2024-12-31 | 970009000 USD | us-gaap/InterestPaidNet | 10-K 0000726728-25-000055, filed 2025-02-25 |
| cashflowAnnual.commonStockIssuance | 2023-01-01 to 2023-12-31 | 5439462000 USD | us-gaap/ProceedsFromIssuanceOfCommonStock | 10-K 0000726728-24-000047, filed 2024-02-21 |
| cashflowAnnual.commonDividendsPaid | 2023-01-01 to 2023-12-31 | -2111793000 USD | us-gaap/PaymentsOfDividendsCommonStock | 10-K 0000726728-24-000047, filed 2024-02-21 |
| cashflowAnnual.interestPaid | 2023-01-01 to 2023-12-31 | 692004000 USD | us-gaap/InterestPaidNet | 10-K 0000726728-24-000047, filed 2024-02-21 |
| cashflowAnnual.commonStockIssuance | 2022-01-01 to 2022-12-31 | 4556028000 USD | us-gaap/ProceedsFromIssuanceOfCommonStock | 10-K 0000726728-23-000044, filed 2023-02-22 |
| cashflowAnnual.commonDividendsPaid | 2022-01-01 to 2022-12-31 | -1813431000 USD | us-gaap/PaymentsOfDividendsCommonStock | 10-K 0000726728-23-000044, filed 2023-02-22 |
| cashflowAnnual.incomeTaxesPaid | 2022-01-01 to 2022-12-31 | 45031000 USD | us-gaap/IncomeTaxesPaid | 10-K 0000726728-23-000044, filed 2023-02-22 |
| cashflowAnnual.interestPaid | 2022-01-01 to 2022-12-31 | 501716000 USD | us-gaap/InterestPaidNet | 10-K 0000726728-23-000044, filed 2023-02-22 |
| cashflowAnnual.acquisitionsNet | 2021-01-01 to 2021-12-31 | -366030000 USD | us-gaap/PaymentsToAcquireBusinessesNetOfCashAcquired | 10-K 0000726728-22-000046, filed 2022-02-23 |
| cashflowAnnual.commonDividendsPaid | 2021-01-01 to 2021-12-31 | -1169026000 USD | us-gaap/PaymentsOfDividendsCommonStock | 10-K 0000726728-22-000046, filed 2022-02-23 |
| cashflowAnnual.incomeTaxesPaid | 2021-01-01 to 2021-12-31 | 19676000 USD | us-gaap/IncomeTaxesPaid | 10-K 0000726728-22-000046, filed 2022-02-23 |
| cashflowAnnual.interestPaid | 2021-01-01 to 2021-12-31 | 355483000 USD | us-gaap/InterestPaidNet | 10-K 0000726728-22-000046, filed 2022-02-23 |
| cashflowAnnual.commonDividendsPaid | 2020-01-01 to 2020-12-31 | -964167000 USD | us-gaap/PaymentsOfDividendsCommonStock | 10-K 0000726728-21-000043, filed 2021-02-23 |
| cashflowAnnual.commonStockIssuance | 2019-01-01 to 2019-12-31 | 845061000 USD | us-gaap/ProceedsFromIssuanceOfCommonStock | 10-K 0000726728-20-000033, filed 2020-02-24 |
| cashflowAnnual.commonDividendsPaid | 2019-01-01 to 2019-12-31 | -852134000 USD | us-gaap/PaymentsOfDividendsCommonStock | 10-K 0000726728-20-000033, filed 2020-02-24 |
| cashflowAnnual.commonStockIssuance | 2018-01-01 to 2018-12-31 | 0 USD | us-gaap/ProceedsFromIssuanceOfCommonStock | 10-K 0000726728-19-000038, filed 2019-02-22 |
| cashflowAnnual.commonDividendsPaid | 2018-01-01 to 2018-12-31 | -761582000 USD | us-gaap/PaymentsOfDividendsCommonStock | 10-K 0000726728-19-000038, filed 2019-02-22 |
| cashflowAnnual.incomeTaxesPaid | 2018-01-01 to 2018-12-31 | 4700000 USD | us-gaap/IncomeTaxesPaid | 10-K 0000726728-19-000038, filed 2019-02-22 |
| cashflowAnnual.interestPaid | 2018-01-01 to 2018-12-31 | 251500000 USD | us-gaap/InterestPaidNet | 10-K 0000726728-19-000038, filed 2019-02-22 |
| cashflowAnnual.commonStockIssuance | 2017-01-01 to 2017-12-31 | 704938000 USD | us-gaap/ProceedsFromIssuanceOfCommonStock | 10-K 0001104659-18-011376, filed 2018-02-22 |
| cashflowAnnual.commonDividendsPaid | 2017-01-01 to 2017-12-31 | -689294000 USD | us-gaap/PaymentsOfDividendsCommonStock | 10-K 0001104659-18-011376, filed 2018-02-22 |
| cashflowAnnual.preferredDividendsPaid | 2017-01-01 to 2017-12-31 | -6168000 USD | us-gaap/PaymentsOfDividendsPreferredStockAndPreferenceStock | 10-K 0001104659-18-011376, filed 2018-02-22 |
| cashflowAnnual.incomeTaxesPaid | 2017-01-01 to 2017-12-31 | 3800000 USD | us-gaap/IncomeTaxesPaid | 10-K 0001104659-18-011376, filed 2018-02-22 |
| cashflowAnnual.interestPaid | 2017-01-01 to 2017-12-31 | 240400000 USD | us-gaap/InterestPaidNet | 10-K 0001104659-18-011376, filed 2018-02-22 |
| cashflowAnnual.commonStockIssuance | 2016-01-01 to 2016-12-31 | 383572000 USD | us-gaap/ProceedsFromIssuanceOfCommonStock | 10-K 0001104659-17-011170, filed 2017-02-23 |
| cashflowAnnual.commonDividendsPaid | 2016-01-01 to 2016-12-31 | -610516000 USD | us-gaap/PaymentsOfDividendsCommonStock | 10-K 0001104659-17-011170, filed 2017-02-23 |
| cashflowAnnual.preferredDividendsPaid | 2016-01-01 to 2016-12-31 | -27080000 USD | us-gaap/PaymentsOfDividendsPreferredStockAndPreferenceStock | 10-K 0001104659-17-011170, filed 2017-02-23 |
| cashflowAnnual.incomeTaxesPaid | 2016-01-01 to 2016-12-31 | 3600000 USD | us-gaap/IncomeTaxesPaid | 10-K 0001104659-17-011170, filed 2017-02-23 |
| cashflowQuarterly.netCashProvidedByFinancingActivities | 2026-07-01 to 2026-09-30 | 1008433000 USD (compatible YTD difference) | us-gaap/NetCashProvidedByUsedInFinancingActivities | 10-Q 0000726728-26-000059, filed 2026-11-03 + 10-Q 0000726728-26-000048, filed 2026-08-06 |
| cashflowQuarterly.netCashProvidedByInvestingActivities | 2026-07-01 to 2026-09-30 | -1977605000 USD (compatible YTD difference) | us-gaap/NetCashProvidedByUsedInInvestingActivities | 10-Q 0000726728-26-000059, filed 2026-11-03 + 10-Q 0000726728-26-000048, filed 2026-08-06 |
| cashflowQuarterly.commonStockIssuance | 2026-07-01 to 2026-09-30 | 460164000 USD (compatible YTD difference) | us-gaap/ProceedsFromIssuanceOfCommonStock | 10-Q 0000726728-26-000059, filed 2026-11-03 + 10-Q 0000726728-26-000048, filed 2026-08-06 |
| cashflowQuarterly.incomeTaxesPaid | 2026-04-01 to 2026-06-30 | -11609000 USD (compatible YTD difference) | us-gaap/IncomeTaxesPaidNet | 10-Q 0000726728-26-000048, filed 2026-08-06 + 10-Q 0000726728-26-000030, filed 2026-05-07 |
| cashflowQuarterly.interestPaid | 2026-04-01 to 2026-06-30 | 217045000 USD (compatible YTD difference) | us-gaap/InterestPaidNet | 10-Q 0000726728-26-000048, filed 2026-08-06 + 10-Q 0000726728-26-000030, filed 2026-05-07 |
| cashflowQuarterly.incomeTaxesPaid | 2026-01-01 to 2026-03-31 | 70270000 USD | us-gaap/IncomeTaxesPaidNet | 10-Q 0000726728-26-000030, filed 2026-05-07 |
| cashflowQuarterly.interestPaid | 2026-01-01 to 2026-03-31 | 270513000 USD | us-gaap/InterestPaidNet | 10-Q 0000726728-26-000030, filed 2026-05-07 |
| cashflowQuarterly.interestPaid | 2025-10-01 to 2025-12-31 | 261852000 USD (compatible YTD difference) | us-gaap/InterestPaidNet | 10-K 0000726728-26-000011, filed 2026-02-25 + 10-Q 0000726728-25-000148, filed 2025-11-04 |
| cashflowQuarterly.interestPaid | 2025-07-01 to 2025-09-30 | 359196000 USD (compatible YTD difference) | us-gaap/InterestPaidNet | 10-Q 0000726728-25-000148, filed 2025-11-04 + 10-Q 0000726728-25-000131, filed 2025-08-07 |
| cashflowQuarterly.interestPaid | 2025-04-01 to 2025-06-30 | 180517000 USD (compatible YTD difference) | us-gaap/InterestPaidNet | 10-Q 0000726728-25-000131, filed 2025-08-07 + 10-Q 0000726728-25-000096, filed 2025-05-06 |
| cashflowQuarterly.interestPaid | 2025-01-01 to 2025-03-31 | 270919000 USD | us-gaap/InterestPaidNet | 10-Q 0000726728-25-000096, filed 2025-05-06 |
| cashflowQuarterly.commonStockIssuance | 2024-10-01 to 2024-12-31 | 932900000 USD (compatible YTD difference) | us-gaap/ProceedsFromIssuanceOfCommonStock | 10-K 0000726728-25-000055, filed 2025-02-25 + 10-Q 0000726728-24-000130, filed 2024-11-05 |
| cashflowQuarterly.commonDividendsPaid | 2024-10-01 to 2024-12-31 | -691861000 USD (compatible YTD difference) | us-gaap/PaymentsOfDividendsCommonStock | 10-K 0000726728-25-000055, filed 2025-02-25 + 10-Q 0000726728-24-000130, filed 2024-11-05 |
| cashflowQuarterly.interestPaid | 2024-10-01 to 2024-12-31 | 237886000 USD (compatible YTD difference) | us-gaap/InterestPaidNet | 10-K 0000726728-25-000055, filed 2025-02-25 + 10-Q 0000726728-24-000130, filed 2024-11-05 |
| cashflowQuarterly.commonStockIssuance | 2024-07-01 to 2024-09-30 | 266627000 USD (compatible YTD difference) | us-gaap/ProceedsFromIssuanceOfCommonStock | 10-Q 0000726728-24-000130, filed 2024-11-05 + 10-Q 0000726728-24-000118, filed 2024-08-06 |
| cashflowQuarterly.commonDividendsPaid | 2024-07-01 to 2024-09-30 | -687144000 USD (compatible YTD difference) | us-gaap/PaymentsOfDividendsCommonStock | 10-Q 0000726728-24-000130, filed 2024-11-05 + 10-Q 0000726728-24-000118, filed 2024-08-06 |
| cashflowQuarterly.preferredDividendsPaid | 2024-07-01 to 2024-09-30 | -2588000 USD (compatible YTD difference) | us-gaap/PaymentsOfDividendsPreferredStockAndPreferenceStock | 10-Q 0000726728-24-000130, filed 2024-11-05 + 10-Q 0000726728-24-000118, filed 2024-08-06 |
| cashflowQuarterly.incomeTaxesPaid | 2024-07-01 to 2024-09-30 | 2088000 USD (compatible YTD difference) | us-gaap/IncomeTaxesPaid | 10-Q 0000726728-24-000130, filed 2024-11-05 + 10-Q 0000726728-24-000118, filed 2024-08-06 |
| cashflowQuarterly.interestPaid | 2024-07-01 to 2024-09-30 | 334213000 USD (compatible YTD difference) | us-gaap/InterestPaidNet | 10-Q 0000726728-24-000130, filed 2024-11-05 + 10-Q 0000726728-24-000118, filed 2024-08-06 |
| cashflowQuarterly.incomeTaxesPaid | 2024-04-01 to 2024-06-30 | 6148000 USD (compatible YTD difference) | us-gaap/IncomeTaxesPaid | 10-Q 0000726728-24-000118, filed 2024-08-06 + 10-Q 0000726728-24-000077, filed 2024-05-07 |
| cashflowQuarterly.interestPaid | 2024-04-01 to 2024-06-30 | 168728000 USD (compatible YTD difference) | us-gaap/InterestPaidNet | 10-Q 0000726728-24-000118, filed 2024-08-06 + 10-Q 0000726728-24-000077, filed 2024-05-07 |
| cashflowQuarterly.commonStockIssuance | 2024-01-01 to 2024-03-31 | 543538000 USD | us-gaap/ProceedsFromIssuanceOfCommonStock | 10-Q 0000726728-24-000077, filed 2024-05-07 |
| cashflowQuarterly.commonDividendsPaid | 2024-01-01 to 2024-03-31 | -636499000 USD | us-gaap/PaymentsOfDividendsCommonStock | 10-Q 0000726728-24-000077, filed 2024-05-07 |
| cashflowQuarterly.preferredDividendsPaid | 2024-01-01 to 2024-03-31 | -2588000 USD | us-gaap/PaymentsOfDividendsPreferredStockAndPreferenceStock | 10-Q 0000726728-24-000077, filed 2024-05-07 |
| cashflowQuarterly.incomeTaxesPaid | 2024-01-01 to 2024-03-31 | 21582000 USD | us-gaap/IncomeTaxesPaid | 10-Q 0000726728-24-000077, filed 2024-05-07 |
| cashflowQuarterly.interestPaid | 2024-01-01 to 2024-03-31 | 229182000 USD | us-gaap/InterestPaidNet | 10-Q 0000726728-24-000077, filed 2024-05-07 |
| cashflowQuarterly.commonStockIssuance | 2023-10-01 to 2023-12-31 | 1589499000 USD (compatible YTD difference) | us-gaap/ProceedsFromIssuanceOfCommonStock | 10-K 0000726728-24-000047, filed 2024-02-21 + 10-Q 0000726728-23-000115, filed 2023-11-07 |
| cashflowQuarterly.commonDividendsPaid | 2023-10-01 to 2023-12-31 | -556114000 USD (compatible YTD difference) | us-gaap/PaymentsOfDividendsCommonStock | 10-K 0000726728-24-000047, filed 2024-02-21 + 10-Q 0000726728-23-000115, filed 2023-11-07 |
| cashflowQuarterly.interestPaid | 2023-10-01 to 2023-12-31 | 190842000 USD (compatible YTD difference) | us-gaap/InterestPaidNet | 10-K 0000726728-24-000047, filed 2024-02-21 + 10-Q 0000726728-23-000115, filed 2023-11-07 |
| cashflowQuarterly.commonStockIssuance | 2023-07-01 to 2023-09-30 | 873280000 USD (compatible YTD difference) | us-gaap/ProceedsFromIssuanceOfCommonStock | 10-Q 0000726728-23-000115, filed 2023-11-07 + 10-Q 0000726728-23-000107, filed 2023-08-03 |
| cashflowQuarterly.commonDividendsPaid | 2023-07-01 to 2023-09-30 | -543343000 USD (compatible YTD difference) | us-gaap/PaymentsOfDividendsCommonStock | 10-Q 0000726728-23-000115, filed 2023-11-07 + 10-Q 0000726728-23-000107, filed 2023-08-03 |
| cashflowQuarterly.incomeTaxesPaid | 2023-07-01 to 2023-09-30 | 3381000 USD (compatible YTD difference) | us-gaap/IncomeTaxesPaid | 10-Q 0000726728-23-000115, filed 2023-11-07 + 10-Q 0000726728-23-000107, filed 2023-08-03 |
| cashflowQuarterly.interestPaid | 2023-07-01 to 2023-09-30 | 176451000 USD (compatible YTD difference) | us-gaap/InterestPaidNet | 10-Q 0000726728-23-000115, filed 2023-11-07 + 10-Q 0000726728-23-000107, filed 2023-08-03 |
| cashflowQuarterly.commonStockIssuance | 2023-04-01 to 2023-06-30 | 2180493000 USD (compatible YTD difference) | us-gaap/ProceedsFromIssuanceOfCommonStock | 10-Q 0000726728-23-000107, filed 2023-08-03 + 10-Q 0000726728-23-000068, filed 2023-05-04 |
| cashflowQuarterly.commonDividendsPaid | 2023-04-01 to 2023-06-30 | -515091000 USD (compatible YTD difference) | us-gaap/PaymentsOfDividendsCommonStock | 10-Q 0000726728-23-000107, filed 2023-08-03 + 10-Q 0000726728-23-000068, filed 2023-05-04 |
| cashflowQuarterly.incomeTaxesPaid | 2023-04-01 to 2023-06-30 | 5313000 USD (compatible YTD difference) | us-gaap/IncomeTaxesPaid | 10-Q 0000726728-23-000107, filed 2023-08-03 + 10-Q 0000726728-23-000068, filed 2023-05-04 |
| cashflowQuarterly.interestPaid | 2023-04-01 to 2023-06-30 | 178250000 USD (compatible YTD difference) | us-gaap/InterestPaidNet | 10-Q 0000726728-23-000107, filed 2023-08-03 + 10-Q 0000726728-23-000068, filed 2023-05-04 |
| cashflowQuarterly.commonStockIssuance | 2023-01-01 to 2023-03-31 | 796190000 USD | us-gaap/ProceedsFromIssuanceOfCommonStock | 10-Q 0000726728-23-000068, filed 2023-05-04 |
| cashflowQuarterly.commonDividendsPaid | 2023-01-01 to 2023-03-31 | -497245000 USD | us-gaap/PaymentsOfDividendsCommonStock | 10-Q 0000726728-23-000068, filed 2023-05-04 |
| cashflowQuarterly.incomeTaxesPaid | 2023-01-01 to 2023-03-31 | 2768000 USD | us-gaap/IncomeTaxesPaid | 10-Q 0000726728-23-000068, filed 2023-05-04 |
| cashflowQuarterly.interestPaid | 2023-01-01 to 2023-03-31 | 146461000 USD | us-gaap/InterestPaidNet | 10-Q 0000726728-23-000068, filed 2023-05-04 |
| cashflowQuarterly.commonStockIssuance | 2022-10-01 to 2022-12-31 | 2151936000 USD (compatible YTD difference) | us-gaap/ProceedsFromIssuanceOfCommonStock | 10-K 0000726728-23-000044, filed 2023-02-22 + 10-Q 0000726728-22-000121, filed 2022-11-03 |
| cashflowQuarterly.commonDividendsPaid | 2022-10-01 to 2022-12-31 | -470736000 USD (compatible YTD difference) | us-gaap/PaymentsOfDividendsCommonStock | 10-K 0000726728-23-000044, filed 2023-02-22 + 10-Q 0000726728-22-000121, filed 2022-11-03 |
| cashflowQuarterly.incomeTaxesPaid | 2022-10-01 to 2022-12-31 | 2806000 USD (compatible YTD difference) | us-gaap/IncomeTaxesPaid | 10-K 0000726728-23-000044, filed 2023-02-22 + 10-Q 0000726728-22-000121, filed 2022-11-03 |
| cashflowQuarterly.interestPaid | 2022-10-01 to 2022-12-31 | 138198000 USD (compatible YTD difference) | us-gaap/InterestPaidNet | 10-K 0000726728-23-000044, filed 2023-02-22 + 10-Q 0000726728-22-000121, filed 2022-11-03 |
| cashflowQuarterly.commonStockIssuance | 2022-07-01 to 2022-09-30 | 691396000 USD (compatible YTD difference) | us-gaap/ProceedsFromIssuanceOfCommonStock | 10-Q 0000726728-22-000121, filed 2022-11-03 + 10-Q 0000726728-22-000103, filed 2022-08-04 |
| cashflowQuarterly.commonDividendsPaid | 2022-07-01 to 2022-09-30 | -458586000 USD (compatible YTD difference) | us-gaap/PaymentsOfDividendsCommonStock | 10-Q 0000726728-22-000121, filed 2022-11-03 + 10-Q 0000726728-22-000103, filed 2022-08-04 |
| cashflowQuarterly.incomeTaxesPaid | 2022-07-01 to 2022-09-30 | 12134000 USD (compatible YTD difference) | us-gaap/IncomeTaxesPaid | 10-Q 0000726728-22-000121, filed 2022-11-03 + 10-Q 0000726728-22-000103, filed 2022-08-04 |
| cashflowQuarterly.interestPaid | 2022-07-01 to 2022-09-30 | 133589000 USD (compatible YTD difference) | us-gaap/InterestPaidNet | 10-Q 0000726728-22-000121, filed 2022-11-03 + 10-Q 0000726728-22-000103, filed 2022-08-04 |
| cashflowQuarterly.commonDividendsPaid | 2022-04-01 to 2022-06-30 | -445829000 USD (compatible YTD difference) | us-gaap/PaymentsOfDividendsCommonStock | 10-Q 0000726728-22-000103, filed 2022-08-04 + 10-Q 0000726728-22-000056, filed 2022-05-05 |
| cashflowQuarterly.incomeTaxesPaid | 2022-04-01 to 2022-06-30 | 17773000 USD (compatible YTD difference) | us-gaap/IncomeTaxesPaid | 10-Q 0000726728-22-000103, filed 2022-08-04 + 10-Q 0000726728-22-000056, filed 2022-05-05 |
| cashflowQuarterly.interestPaid | 2022-04-01 to 2022-06-30 | 111742000 USD (compatible YTD difference) | us-gaap/InterestPaidNet | 10-Q 0000726728-22-000103, filed 2022-08-04 + 10-Q 0000726728-22-000056, filed 2022-05-05 |
| cashflowQuarterly.commonStockIssuance | 2022-01-01 to 2022-03-31 | 656094000 USD | us-gaap/ProceedsFromIssuanceOfCommonStock | 10-Q 0000726728-22-000056, filed 2022-05-05 |
| cashflowQuarterly.commonDividendsPaid | 2022-01-01 to 2022-03-31 | -438280000 USD | us-gaap/PaymentsOfDividendsCommonStock | 10-Q 0000726728-22-000056, filed 2022-05-05 |
| cashflowQuarterly.incomeTaxesPaid | 2022-01-01 to 2022-03-31 | 12318000 USD | us-gaap/IncomeTaxesPaid | 10-Q 0000726728-22-000056, filed 2022-05-05 |
| cashflowQuarterly.interestPaid | 2022-01-01 to 2022-03-31 | 118187000 USD | us-gaap/InterestPaidNet | 10-Q 0000726728-22-000056, filed 2022-05-05 |
| cashflowQuarterly.commonDividendsPaid | 2021-10-01 to 2021-12-31 | -371179000 USD (compatible YTD difference) | us-gaap/PaymentsOfDividendsCommonStock | 10-K 0000726728-22-000046, filed 2022-02-23 + 10-Q 0000726728-21-000104, filed 2021-11-02 |
| cashflowQuarterly.incomeTaxesPaid | 2021-10-01 to 2021-12-31 | 9900000 USD (compatible YTD difference) | us-gaap/IncomeTaxesPaid | 10-K 0000726728-22-000046, filed 2022-02-23 + 10-Q 0000726728-21-000104, filed 2021-11-02 |
| cashflowQuarterly.interestPaid | 2021-10-01 to 2021-12-31 | 126018000 USD (compatible YTD difference) | us-gaap/InterestPaidNet | 10-K 0000726728-22-000046, filed 2022-02-23 + 10-Q 0000726728-21-000104, filed 2021-11-02 |
| cashflowQuarterly.commonDividendsPaid | 2021-07-01 to 2021-09-30 | -273791000 USD (compatible YTD difference) | us-gaap/PaymentsOfDividendsCommonStock | 10-Q 0000726728-21-000104, filed 2021-11-02 + 10-Q 0000726728-21-000092, filed 2021-08-03 |
| cashflowQuarterly.commonDividendsPaid | 2020-10-01 to 2020-12-31 | -247632000 USD (compatible YTD difference) | us-gaap/PaymentsOfDividendsCommonStock | 10-K 0000726728-21-000043, filed 2021-02-23 + 10-Q 0000726728-20-000100, filed 2020-11-03 |

### stageB.json

SHA-256 before `f80f5c46ce634b53cabf79ea1db26768623f33505408b1cc5a594d0857672021`; after `c63fb1b3e130c7b6485b724bea2686cbb7b2552729f2c56c44cc5a59c83c08c0`.

745 changed JSON leaves, all enumerated below.

- **capital (4 leaves):** Admitted capex, D&A, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.{current.{cashBridge.definition,interestExpense},interestCoverage.{interestExpense,value}}
```

- **gaps (719 leaves):** New filed substitutions and missing-compatible-counterpart disclosures are added; recovered typed value-only conflicts retire only their own old refusal. Array positions shift after insertion.

```text
gaps.{{25,26,28,29,94,95,101,103,104,199..201}.{attemptedSources,field,reason},{27,30..32,35..38,46,48,102,105,169,170,180,185,186,190,191,198}.{field,reason},33.{field,reason,severity},{34,45,47,106,171,202,208..210}.{attemptedSources,expected,field,reason},{39,41,44}.{attemptedSources.0,{expected,field,reason}},{40,50..93,96..100}.{attemptedSources.0,{field,reason}},{42,49}.{attemptedSources.{0,1},{field,reason}},43.{attemptedSources.{0,1},{expected,field,reason}},{107..168,172..179,181..184,187..189,192..197,203..207,211}.{expected,field,reason},{212..373}}
```

- **returns (20 leaves):** Admitted interest or operating/capital inputs propagate through the existing return and borrowing-cost calculations, with their dated basis.

```text
returns.{notes.{1,2},wacc.{{costOfDebtPct,waccPct,waccRawPct},notes.1},waccHistory.{basis,notes.0,points.{0.costOfDebtPct,{1..4}.{costOfDebtPct,waccPct}}},waccInputs.{costOfDebt.pct,{summary,waccPct}}}
```

- **valuation (2 leaves):** The unchanged valuation/DCF and multiple formulas read the admitted cash/cost operands and growth history; related inputs, availability, sensitivities and descriptions move together.

```text
valuation.{gaps.2.reason,multiples.gaps.2.reason}
```

### payload.txt

SHA-256 before `52b716052275711574e37c93f7cbb47a33aff7d549ae88cfd38e384ebae8739e`; after `d3d987b76db796b37146ffdd5e10bb1f01ba7bd4f0473d1140732fa08a417a10`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `2231610c98538b3a4bf274f1a51dd0ee8387764a4fe4145852f2aceeeff24cda`; after `4effe464d23ffd9076ec6bc288552b870254ca48aaf6656543bd9fa0f8b6fb1f`.

665 changed JSON leaves, all enumerated below.

- **appendix (657 leaves):** Substitution/missing-data/provenance records carry the changed inputs, filings and compatibility stamps; ordered arrays shift after additions. Existing unknown evidence stays unknown.

```text
appendix.missingData.{34.reason,{35..37,39..43,48,136..140,145}.{field,reason},38.{attemptedSources,expected,field,reason,severity},{44,47,49}.{attemptedSources.{0,1},{field,reason}},45.{attemptedSources.{0,1},{expected,field,reason}},46.{attemptedSources.0,{expected,field,reason}},{50..93,96..100,133,134,143}.{attemptedSources.0,{field,reason}},{94,95,101,135,142,144,147,148}.{attemptedSources,field,reason},{102,126,127,129,130,141,146,149..151,153..205,207..211,215}.{expected,field,reason},{103..125,128,131}.field,{132,152,206,212..214}.{attemptedSources,expected,field,reason},{216..379}}
```

- **balanceSheet (3 leaves):** Cash, coverage and capital descriptions read the corrected filed flow family and its qualifications; no balance-sheet stock is independently substituted by this change.

```text
balanceSheet.coverage.{commentary.1.text,numbers.{0,2}.value}
```

- **fundamentals (2 leaves):** FCF CAGR and the resulting fundamentals grade/driver prose use the corrected annual filed PP&E history.

```text
fundamentals.returns.{2,4}.values.0.value.value
```

- **meta (2 leaves):** Report/payload/Stage B compatibility stamps advance; payload fingerprint and method-identity hashes identify the revised meaning. Stored-report bytes are untouched.

```text
meta.{dataCompleteness.warningCount,specVersion}
```

- **verdict (1 leaves):** The unchanged verdict presentation reads the recalculated composite and evidence qualifications.

```text
verdict.synthesis
```

### report.md

SHA-256 before `f5c904421de0babe862bbcdae804b19a91ae17f2230b05d2edc6be7f2f1d251b`; after `48cda1ce92359af7f88c6fbdc2e50ac659dfd18b939db85eee1154ba749c814a`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `0f0ba704afff1b86d7bf77a4ad900f07c89c881d4205b4ee4673d233ab3a859a`; after `fa1a2e62b7fc895c0c1c5c4b77c3a36c78234d1b75daf0dcc6b11417c31e9108`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `d8b1b6a96c7e16a13d9bb38e358bca584e3b916d9dcd2fbb793e59d9e07e6864`; after `aeea365ad4ddd1b8d0e059e2675213eaaaf04108e3835f6dfd7e84f577745e48`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `5a4911367ddb9acd40b615c8745c4b7c57dc81d0a886c5d72d8650f9c93a25f8`; after `52f22fbf19b7da334c04b13d4b3cebbe18c8e0fb19442c4f547c2337f12fd311`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:f47d08c3"` to `"1.95.0:c2e8b1b0"`, approved because its version and covered deterministic content changed.

## duk-data-only

22 independently filed input corrections are listed below. Repeated aliases and dependent FCF are represented by their capex input, not counted again.

| Field | Window | Filed/admitted amount | SEC tag(s) | Filing evidence |
| --- | --- | ---: | --- | --- |
| incomeAnnual.depreciationAndAmortization | 2025-01-01 to 2025-12-31 | 7704000000 USD | us-gaap/DepreciationDepletionAndAmortization | 10-K 0001326160-26-000014, filed 2026-02-26 |
| incomeAnnual.interestExpense | 2016-01-01 to 2016-12-31 | 1916000000 USD | us-gaap/InterestExpense | 10-K 0001326160-17-000016, filed 2017-02-24 |
| incomeQuarterly.depreciationAndAmortization | 2026-07-01 to 2026-09-30 | 1830000000 USD (compatible YTD difference) | us-gaap/DepreciationDepletionAndAmortization | 10-Q 0001326160-26-000051, filed 2026-11-05 + 10-Q 0001326160-26-000040, filed 2026-08-04 |
| incomeQuarterly.interestExpense | 2021-10-01 to 2021-12-31 | 592000000 USD (compatible YTD difference) | us-gaap/InterestExpense | 10-K 0001326160-22-000072, filed 2022-02-24 + 10-Q 0001326160-21-000231, filed 2021-11-04 |
| cashflowAnnual.netCashProvidedByInvestingActivities | 2025-01-01 to 2025-12-31 | -14338000000 USD | us-gaap/NetCashProvidedByUsedInInvestingActivities | 10-K 0001326160-26-000014, filed 2026-02-26 |
| cashflowAnnual.depreciationAndAmortization | 2025-01-01 to 2025-12-31 | 7704000000 USD | us-gaap/DepreciationDepletionAndAmortization | 10-K 0001326160-26-000014, filed 2026-02-26 |
| cashflowAnnual.incomeTaxesPaid | 2025-01-01 to 2025-12-31 | -625000000 USD | us-gaap/IncomeTaxesPaidNet | 10-K 0001326160-26-000014, filed 2026-02-26 |
| cashflowAnnual.interestPaid | 2025-01-01 to 2025-12-31 | 3590000000 USD | us-gaap/InterestPaidNet | 10-K 0001326160-26-000014, filed 2026-02-26 |
| cashflowAnnual.incomeTaxesPaid | 2024-01-01 to 2024-12-31 | -400000000 USD | us-gaap/IncomeTaxesPaidNet | 10-K 0001326160-25-000072, filed 2025-02-27 |
| cashflowAnnual.interestPaid | 2024-01-01 to 2024-12-31 | 3284000000 USD | us-gaap/InterestPaidNet | 10-K 0001326160-25-000072, filed 2025-02-27 |
| cashflowAnnual.incomeTaxesPaid | 2022-01-01 to 2022-12-31 | -6000000 USD | us-gaap/IncomeTaxesPaidNet | 10-K 0001326160-23-000073, filed 2023-02-27 |
| cashflowAnnual.interestPaid | 2022-01-01 to 2022-12-31 | 2361000000 USD | us-gaap/InterestPaidNet | 10-K 0001326160-23-000073, filed 2023-02-27 |
| cashflowAnnual.incomeTaxesPaid | 2021-01-01 to 2021-12-31 | -3000000 USD | us-gaap/IncomeTaxesPaidNet | 10-K 0001326160-22-000072, filed 2022-02-24 |
| cashflowAnnual.interestPaid | 2021-01-01 to 2021-12-31 | 2248000000 USD | us-gaap/InterestPaidNet | 10-K 0001326160-22-000072, filed 2022-02-24 |
| cashflowAnnual.incomeTaxesPaid | 2020-01-01 to 2020-12-31 | -585000000 USD | us-gaap/IncomeTaxesPaidNet | 10-K 0001326160-21-000063, filed 2021-02-25 |
| cashflowAnnual.interestPaid | 2020-01-01 to 2020-12-31 | 2186000000 USD | us-gaap/InterestPaidNet | 10-K 0001326160-21-000063, filed 2021-02-25 |
| cashflowAnnual.incomeTaxesPaid | 2019-01-01 to 2019-12-31 | -651000000 USD | us-gaap/IncomeTaxesPaidNet | 10-K 0001326160-20-000034, filed 2020-02-20 |
| cashflowAnnual.interestPaid | 2019-01-01 to 2019-12-31 | 2195000000 USD | us-gaap/InterestPaidNet | 10-K 0001326160-20-000034, filed 2020-02-20 |
| cashflowAnnual.incomeTaxesPaid | 2018-01-01 to 2018-12-31 | -266000000 USD | us-gaap/IncomeTaxesPaidNet | 10-K 0001326160-19-000057, filed 2019-02-28 |
| cashflowAnnual.interestPaid | 2018-01-01 to 2018-12-31 | 2086000000 USD | us-gaap/InterestPaidNet | 10-K 0001326160-19-000057, filed 2019-02-28 |
| cashflowAnnual.acquisitionsNet | 2016-01-01 to 2016-12-31 | -4778000000 USD | us-gaap/PaymentsToAcquireBusinessesNetOfCashAcquired | 10-K 0001326160-17-000016, filed 2017-02-24 |
| cashflowQuarterly.depreciationAndAmortization | 2026-07-01 to 2026-09-30 | 1830000000 USD (compatible YTD difference) | us-gaap/DepreciationDepletionAndAmortization | 10-Q 0001326160-26-000051, filed 2026-11-05 + 10-Q 0001326160-26-000040, filed 2026-08-04 |

### stageB.json

SHA-256 before `9a5f22b992dfa6ae55c8649cccf1211d9deba2704bf588fcb3b114bf3ae194a0`; after `6f657515793255af0f595b336e47888f07e3314ecb3080e4fee252576a6348fe`.

829 changed JSON leaves, all enumerated below.

- **capital (9 leaves):** Admitted capex, D&A, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.{capexIntensity.series.4.capexToDA,current.{cashBridge.definition,{ebitda,netDebtToEbitda}},maintenanceVsGrowthCapex.{capexToDA5yAvg,capexToDALatest,impliedGrowthCapex,impliedMaintenanceCapex},netDebtToEbitda.ebitda}
```

- **forensics (13 leaves):** The unchanged forensic formulas read the corrected D&A, acquisition, cash-flow totals, compensation or cost operands; related warnings/source labels follow those same facts.

```text
forensics.{accruals.{{aggregateAccrualsCashFlow,cashFlowAccrualRatio,definition,investingCashFlow,operatingInvestingCashFlow},notes.{1,4}},beneish.{indices.depi,{score,sgiNeutralScore,tataBalanceSheet}},notes.{10,13}}
```

- **gaps (775 leaves):** New filed substitutions and missing-compatible-counterpart disclosures are added; recovered typed value-only conflicts retire only their own old refusal. Array positions shift after insertion.

```text
gaps.{{16,91,101,106..109}.{attemptedSources.{0,1},{field,reason}},{17,18,28,29,53,63,73}.{attemptedSources,field},{19..24,30,42..45,52,54,55,57,62,64,65,72,74,75,209,210,225,226,228,230,231,233,235,243,245}.field,{25..27,46,48..51,58,60,61,67,69..71,86,90,125,127,129,130,134..136,139..141,143..145,150,151,155,159,161,165,168,176,180,184..186,190,191,195,200,204,205,208,212,213,215,216,219,222,224,227,229,232,234,236,238,239,241,242,244,246,247,250,257,258,260,262,263,267,269,272,274,275,279,286..288}.{field,reason},{31,41,47,56,59,66,68,76..78,87,93,95,96,120,122..124,126,128,131..133,137,138,142,146..149,160,172,196,282,283}.{attemptedSources,field,reason},{79,80}.{attemptedSources,field,reason,severity},{81..85}.{attemptedSources,expected,field,reason,severity},{88,89,92,94}.{attemptedSources.0,{expected,field,reason}},{97,98,102..105,163,181,192,197,281,284}.{attemptedSources,expected,field,reason},{99,100}.{attemptedSources.{0,1},{expected,field,reason}},{110..117,119,121}.{attemptedSources.0,{field,reason}},118.{attemptedSources.{0..2},{field,reason}},{152..154,156..158,162,164,166,167,169..171,173..175,177..179,182,183,187..189,193,194,198,199,201..203,206,207,211,214,217,218,220,221,223,237,240,248,249,251..256,259,261,264..266,268,270,271,273,276..278,280,285,289..292}.{expected,field,reason},{293..376}}
```

- **scores (27 leaves):** The unchanged scoring formulas read the corrected operands above; driver values, signal arithmetic, aspect/composite results and completeness follow those operands.

```text
scores.{aspects.{quality.{drivers.{1,2}.value,score,signals.{1.{{contributionPoints,fallbackReason,raw,transformedScore},operands.0.value},2.{{contributionPoints,raw,transformedScore},operands.0.value}}},valuation.{drivers.0.value,score,signals.0.{{contributionPoints,raw,transformedScore},operands.{0,1,3}.value}}},assessments.{businessQuality,valuation}.score,composite.score,factorExposure.{3,5}.aboveNeutralPoints,qualification.{aspects.valuation.reasons.0.detail,composite.reasons.0.detail}}
```

- **valuation (5 leaves):** The unchanged valuation/DCF and multiple formulas read the admitted cash/cost operands and growth history; related inputs, availability, sensitivities and descriptions move together.

```text
valuation.multiples.{multiples.1.{current,ownHistory.{observationDetails.0.value,{p5,percentileRank}}},notes.28}
```

### payload.txt

SHA-256 before `3c6fd15c2dcfc0f41bcdb093c7b4024aeb49f83f234210250a7960f94e0a059a`; after `8498c4e0e1047f1be41e9a22b7a951fd349d30b6e0b01fc0110e6926e4196ea1`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `7c5e4b8edde374cd3fd3612da5a7dd72dc4511c734fcd06972dd7284842de859`; after `9ae5d74d1933200e88a38b5709ca465f6fb79d35b71edbb9d91d627d5be79ffe`.

782 changed JSON leaves, all enumerated below.

- **appendix (694 leaves):** Substitution/missing-data/provenance records carry the changed inputs, filings and compatibility stamps; ordered arrays shift after additions. Existing unknown evidence stays unknown.

```text
appendix.missingData.{{78..80,104..109,131,137,139,145,153,160,163,171,177,181,183,185,189..192,201..204,213,214,217..226,229..231,289,291,292,294,295}.{field,reason},{81..87}.{attemptedSources,expected,field,reason,severity},88.{attemptedSources,field,reason,severity},{89,97}.{attemptedSources.{0,1},{expected,field,reason}},{90,98,103,110..116}.{attemptedSources.0,{field,reason}},{91..95,99..102}.{attemptedSources.{0,1},{field,reason}},96.{attemptedSources.0,{expected,field,reason}},{117,119,121,124,178,180,198..200,205..208,247,277,278}.{attemptedSources,expected,field,reason},{118,120,122,123,179,186..188,215,216,227,228,288}.{attemptedSources,field,reason},{125..130,134..136,142..144,150..152,158,159,161,162,168..170,182,184,193..197,209..212,232..246,248..276,279..287,290,293,296}.{expected,field,reason},{132,133,138,140,141,146..149,154..157,164..167,172..176}.field,{297..381}}
```

- **balanceSheet (5 leaves):** Cash, coverage and capital descriptions read the corrected filed flow family and its qualifications; no balance-sheet stock is independently substituted by this change.

```text
balanceSheet.{capexTrajectory.numbers.{2,3}.value,coverage.{commentary.1.text,numbers.8.value},debtProfile.numbers.0.value}
```

- **meta (2 leaves):** Report/payload/Stage B compatibility stamps advance; payload fingerprint and method-identity hashes identify the revised meaning. Stored-report bytes are untouched.

```text
meta.{dataCompleteness.warningCount,specVersion}
```

- **quality (28 leaves):** Forensic/quality presentation inherits the changed forensic operands and qualifications.

```text
quality.{forensicScores.{accruals,beneish}.{score,variant},graded.{keyNumbers.{{1..4}.value,{9,10}.{source,sourceId,value},{11,12}},oneLineWhy,reasoning.0.text},notes.{1,4..12}}
```

- **scores (27 leaves):** The unchanged scoring formulas read the corrected operands above; driver values, signal arithmetic, aspect/composite results and completeness follow those operands.

```text
scores.{aspects.{quality.{drivers.{1,2}.value,score,signals.{1.{{contributionPoints,fallbackReason,raw,transformedScore},operands.0.value},2.{{contributionPoints,raw,transformedScore},operands.0.value}}},valuation.{drivers.0.value,score,signals.0.{{contributionPoints,raw,transformedScore},operands.{0,1,3}.value}}},assessments.{businessQuality,valuation}.score,composite.score,factorExposure.{3,5}.aboveNeutralPoints,qualification.{aspects.valuation.reasons.0.detail,composite.reasons.0.detail}}
```

- **valuation (7 leaves):** The unchanged valuation/DCF and multiple formulas read the admitted cash/cost operands and growth history; related inputs, availability, sensitivities and descriptions move together.

```text
valuation.{graded.{keyNumbers.0.value,oneLineWhy,qualification.reasons.0.detail,reasoning.0.text},multiples.1.{{current,own5yPercentile},ownHistoryDetails.0.value}}
```

- **verdict (19 leaves):** The unchanged verdict presentation reads the recalculated composite and evidence qualifications.

```text
verdict.{gradeStrip.{quality.{keyNumbers.{{1..4}.value,{9,10}.{source,sourceId,value},{11,12}},oneLineWhy,reasoning.0.text},valuation.{keyNumbers.0.value,oneLineWhy,qualification.reasons.0.detail,reasoning.0.text}},synthesis}
```

### report.md

SHA-256 before `f32f8236f402bd6984f84bfd1325482703e631cfaf9647f117405175412e68f1`; after `1537742d61773bfa686a675bbb4d3fdad24938b19bf8215f18a01fcfa97fada2`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `7badf60c9e48cdaa184255fce0a5e3852b8d272a4c44f4be0a04b33343f16992`; after `c31cfeec26873b44028bcf46ef76d62d7301a4435b2109a11c65187cdc876adf`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `fdc117eb9ead7fcdaec21bd4d44e7a98e032688be7813868ca45a4da63329b5c`; after `6f3958bfe381abd7dbdc371298d5ad6ee6eb11baa250f62f0199868f4edc46cf`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `1bd9aee3409cea716062714d581424bde8f0381c72b61eeff0c8ff12f61ab076`; after `6b6f7c541e57d2adfde7ebfbf000759346b2cbb7d8f732de7a0a4fdde3ef50db`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:98ff17ff"` to `"1.95.0:554a988e"`, approved because its version and covered deterministic content changed.

## tsm-data-only

No scalar input correction: only the revised definition, compatibility identifiers and explicit unverified-coverage disclosures change.

| Field | Window | Filed/admitted amount | SEC tag(s) | Filing evidence |
| --- | --- | ---: | --- | --- |

### stageB.json

SHA-256 before `e96bdb78936f7d705c1bf8fe9d189d4b97c74409fa4f0881536b3e7844c2832e`; after `68dedf85da87d69f483a8661828222986b77e3a567bd6edc1530c1976509173a`.

333 changed JSON leaves, all enumerated below.

- **capital (1 leaves):** Admitted capex, D&A, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.current.cashBridge.definition
```

- **gaps (332 leaves):** New filed substitutions and missing-compatible-counterpart disclosures are added; recovered typed value-only conflicts retire only their own old refusal. Array positions shift after insertion.

```text
gaps.{{8..10}.{field,reason},{11,20}.{field,reason,severity},{12..18,21..23,25..38}.{attemptedSources,expected,field,reason,severity},{19,24}.{attemptedSources,field,reason,severity},{39,47,52,64,65,67}.{attemptedSources,expected,field,reason},{40..44}.{attemptedSources.{0..2},{field,reason}},{45,46,49..51,53..62}.{attemptedSources,field,reason},{48,66,68}.{expected,field,reason},63.{attemptedSources.{0,1},{expected,field,reason}},{69..152}}
```

### payload.txt

SHA-256 before `784836c88e9f1d08323c64f5f7e8adeefa0698018009c21b8978037ec3d4c181`; after `d6a6f143fc58fdf7833e5b1249e863df258210d2d799d96db51e5385fdee9be9`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `81be5e52f834aeacb12188bf6a5c060f1f55d610d3abc0a23c6a96cbaee5fc44`; after `abee00df6f6981dcbf507830f483478de4d4cc20f7cbbcde7ad31f3bc688c157`.

363 changed JSON leaves, all enumerated below.

- **appendix (359 leaves):** Substitution/missing-data/provenance records carry the changed inputs, filings and compatibility stamps; ordered arrays shift after additions. Existing unknown evidence stays unknown.

```text
appendix.missingData.{11.{field,reason},{12..18,21..23,25..35}.{attemptedSources,expected,field,reason,severity},{19,24}.{attemptedSources,field,reason,severity},20.{field,reason,severity},{36..39}.{expected,field,reason,severity},{40..46,49..51,53,64..68}.{attemptedSources,field,reason},{47,52,58,59,69,70}.{attemptedSources,expected,field,reason},{48,71..74}.{expected,field,reason},{54,56}.{attemptedSources.{0..8},{expected,field,reason}},{55,57}.{attemptedSources.{0,1},{expected,field,reason}},{60..63}.{attemptedSources.{0..2},{field,reason}},{75..158}}
```

- **balanceSheet (1 leaves):** Cash, coverage and capital descriptions read the corrected filed flow family and its qualifications; no balance-sheet stock is independently substituted by this change.

```text
balanceSheet.coverage.commentary.1.text
```

- **meta (2 leaves):** Report/payload/Stage B compatibility stamps advance; payload fingerprint and method-identity hashes identify the revised meaning. Stored-report bytes are untouched.

```text
meta.{dataCompleteness.warningCount,specVersion}
```

- **verdict (1 leaves):** The unchanged verdict presentation reads the recalculated composite and evidence qualifications.

```text
verdict.synthesis
```

### report.md

SHA-256 before `772252d7b9d2e700d14fc6e558d8e21582f11e462eb9b5d47f8649a53bcc696b`; after `1591eca2fabc46a4a3452843adf86a1a654dd1eaf01219425efd100c189f203b`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `df6fe4808dc7f98658a5e9010e0c1df51d5e32a6bbcedf65c4e086e20fe61ee1`; after `5b0163e248da972b3cb91395b947d2e944ef5680b3ddc114fa9cc615bbd8c39f`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `9824c8bb6b1205ff3d098e189f38de083a1d496c18aaafaf0b08e7334edf59a4`; after `4ce7d2cf4d126f2f7379a9cce7f04b582d048cca28d498a68c63e3e584d012df`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `ff7da856d81147a417556b6161b0d471e74f0963bedd9fecf8d4c1402ecabb63`; after `d6412ba99bbf82770767588764ae87c9194aa99b3d4941eb2246ea76ebcdf69b`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:9e66a774"` to `"1.95.0:c05dac62"`, approved because its version and covered deterministic content changed.

## rivn-data-only

18 independently filed input corrections are listed below. Repeated aliases and dependent FCF are represented by their capex input, not counted again.

| Field | Window | Filed/admitted amount | SEC tag(s) | Filing evidence |
| --- | --- | ---: | --- | --- |
| incomeAnnual.sellingGeneralAndAdministrativeExpenses | 2025-01-01 to 2025-12-31 | 2061000000 USD | us-gaap/SellingGeneralAndAdministrativeExpense | 10-K 0001874178-26-000008, filed 2026-02-12 |
| incomeQuarterly.sellingGeneralAndAdministrativeExpenses | 2026-04-01 to 2026-06-30 | 549000000 USD | us-gaap/SellingGeneralAndAdministrativeExpense | 10-Q 0001874178-26-000054, filed 2026-07-30 |
| incomeQuarterly.sellingGeneralAndAdministrativeExpenses | 2026-01-01 to 2026-03-31 | 542000000 USD | us-gaap/SellingGeneralAndAdministrativeExpense | 10-Q 0001874178-26-000035, filed 2026-04-30 |
| incomeQuarterly.sellingGeneralAndAdministrativeExpenses | 2025-10-01 to 2025-12-31 | 529000000 USD (compatible YTD difference) | us-gaap/SellingGeneralAndAdministrativeExpense | 10-K 0001874178-26-000008, filed 2026-02-12 + 10-Q 0001874178-25-000052, filed 2025-11-04 |
| incomeQuarterly.sellingGeneralAndAdministrativeExpenses | 2025-04-01 to 2025-06-30 | 498000000 USD | us-gaap/SellingGeneralAndAdministrativeExpense | 10-Q 0001874178-25-000036, filed 2025-08-05 |
| incomeQuarterly.sellingGeneralAndAdministrativeExpenses | 2025-01-01 to 2025-03-31 | 480000000 USD | us-gaap/SellingGeneralAndAdministrativeExpense | 10-Q 0001874178-25-000026, filed 2025-05-06 |
| incomeQuarterly.sellingGeneralAndAdministrativeExpenses | 2024-04-01 to 2024-06-30 | 496000000 USD | us-gaap/SellingGeneralAndAdministrativeExpense | 10-Q 0001874178-24-000057, filed 2024-08-06 |
| cashflowAnnual.commonStockIssuance | 2025-01-01 to 2025-12-31 | 750000000 USD | us-gaap/ProceedsFromIssuanceOfCommonStock | 10-K 0001874178-26-000008, filed 2026-02-12 |
| cashflowAnnual.incomeTaxesPaid | 2025-01-01 to 2025-12-31 | 8000000 USD | us-gaap/IncomeTaxesPaidNet | 10-K 0001874178-26-000008, filed 2026-02-12 |
| cashflowAnnual.interestPaid | 2025-01-01 to 2025-12-31 | 222000000 USD | us-gaap/InterestPaidNet | 10-K 0001874178-26-000008, filed 2026-02-12 |
| cashflowAnnual.interestPaid | 2024-01-01 to 2024-12-31 | 279000000 USD | us-gaap/InterestPaidNet | 10-K 0001874178-25-000007, filed 2025-02-24 |
| cashflowAnnual.interestPaid | 2023-01-01 to 2023-12-31 | 169000000 USD | us-gaap/InterestPaidNet | 10-K 0001874178-24-000014, filed 2024-02-26 |
| cashflowAnnual.interestPaid | 2022-01-01 to 2022-12-31 | 88000000 USD | us-gaap/InterestPaidNet | 10-K 0001874178-23-000009, filed 2023-02-28 |
| cashflowAnnual.commonStockIssuance | 2021-01-01 to 2021-12-31 | 2658000000 USD | us-gaap/ProceedsFromIssuanceOfCommonStock | 10-K 0001874178-22-000008, filed 2022-03-31 |
| cashflowAnnual.interestPaid | 2021-01-01 to 2021-12-31 | 2000000 USD | us-gaap/InterestPaidNet | 10-K 0001874178-22-000008, filed 2022-03-31 |
| cashflowQuarterly.commonStockIssuance | 2025-10-01 to 2025-12-31 | 0 USD (compatible YTD difference) | us-gaap/ProceedsFromIssuanceOfCommonStock | 10-K 0001874178-26-000008, filed 2026-02-12 + 10-Q 0001874178-25-000052, filed 2025-11-04 |
| cashflowQuarterly.commonStockIssuance | 2025-07-01 to 2025-09-30 | 0 USD (compatible YTD difference) | us-gaap/ProceedsFromIssuanceOfCommonStock | 10-Q 0001874178-25-000052, filed 2025-11-04 + 10-Q 0001874178-25-000036, filed 2025-08-05 |
| cashflowQuarterly.commonStockIssuance | 2021-10-01 to 2021-12-31 | 4000000 USD (compatible YTD difference) | us-gaap/ProceedsFromIssuanceOfCommonStock | 10-K 0001874178-22-000008, filed 2022-03-31 + 10-Q 0001874178-21-000006, filed 2021-12-17 |

### stageB.json

SHA-256 before `f04b44a7d1cfce93da7577348610537597ca9711da8c89b77059ebd98dc73dca`; after `b628fcd1c9b4058ee67168a1274c9bb7b05e6ca5efd255dd010813fb4ecb293f`.

367 changed JSON leaves, all enumerated below.

- **capital (1 leaves):** Admitted capex, D&A, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.current.cashBridge.definition
```

- **forensics (4 leaves):** The unchanged forensic formulas read the corrected D&A, acquisition, cash-flow totals, compensation or cost operands; related warnings/source labels follow those same facts.

```text
forensics.{beneish.{indices.sgai,{score,sgiNeutralScore}},piotroski.signals.noEquityIssuance.detail}
```

- **gaps (362 leaves):** New filed substitutions and missing-compatible-counterpart disclosures are added; recovered typed value-only conflicts retire only their own old refusal. Array positions shift after insertion.

```text
gaps.{{32..37,43,46,61..63,72,74,76..80,82..91,93,96,98,100}.{field,reason},38.{field,reason,severity},{39..41}.{attemptedSources,expected,field,reason,severity},{42,44,53,57,120}.{attemptedSources,expected,field,reason},{45,49,52}.{attemptedSources.0,{expected,field,reason}},{47,51,55,59,64..66,68..70}.{attemptedSources.{0,1},{field,reason}},{48,71,73,75,81,117..119}.{attemptedSources,field,reason},{50,54,56,58,60,67}.{attemptedSources.0,{field,reason}},{92,94,95,97,99,101..116,122..131}.{expected,field,reason},121.{cause,expected,field,reason},{132..200}}
```

### payload.txt

SHA-256 before `aaa2bcf2ec2a4701b0e8a12d8ce90410273659d5d819058e81bc9871a0626a61`; after `59604a82804cc6c7cc1a6d252f391c1a2834cbad2722620c784f9b8007b59422`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `33fb30b93d508efc744d1855a266e23685099ed1ff0708d1a6d13880989686a4`; after `2e03f4899880b45feff33cfe6a9ca3de27ba7efa7dd89d66a3b225c4d025d0b1`.

372 changed JSON leaves, all enumerated below.

- **appendix (366 leaves):** Substitution/missing-data/provenance records carry the changed inputs, filings and compatibility stamps; ordered arrays shift after additions. Existing unknown evidence stays unknown.

```text
appendix.missingData.{{33..38,43,44,58..60,75,76,85..99}.{field,reason},{39..42}.{attemptedSources,expected,field,reason,severity},{45,49,52,53,56,61..63,65..67}.{attemptedSources.{0,1},{field,reason}},{46,50}.{attemptedSources.0,{expected,field,reason}},{47,48,51,54,55,57,64,68..70}.{attemptedSources.0,{field,reason}},{71..74}.{attemptedSources,field,reason},{77,78,80..82,84,100..120,123..132}.{expected,field,reason},{79,83,121}.{attemptedSources,expected,field,reason},122.{cause,expected,field,reason},{133..201}}
```

- **balanceSheet (1 leaves):** Cash, coverage and capital descriptions read the corrected filed flow family and its qualifications; no balance-sheet stock is independently substituted by this change.

```text
balanceSheet.coverage.commentary.1.text
```

- **meta (2 leaves):** Report/payload/Stage B compatibility stamps advance; payload fingerprint and method-identity hashes identify the revised meaning. Stored-report bytes are untouched.

```text
meta.{dataCompleteness.warningCount,specVersion}
```

- **quality (2 leaves):** Forensic/quality presentation inherits the changed forensic operands and qualifications.

```text
quality.forensicScores.beneish.{score,variant}
```

- **verdict (1 leaves):** The unchanged verdict presentation reads the recalculated composite and evidence qualifications.

```text
verdict.synthesis
```

### report.md

SHA-256 before `a14030555b7e1b1b161e3492455e03aa7bcf5959b578e2d6fd6ff44c2e864e7b`; after `ae27b688f7907ee6bf8c26bf5be9820e1c23c5aad7a47d8c811ee761df1b0ef3`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `44b2a635ba4c929d7a692d9d7a9ce7c8f5e1e704bca633213890028b39b3ebb5`; after `06206575c2d832cca6c0d568f2dbfbe595bb59bef0f53ebe39ea922f93061202`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `7ba8d6d816b59d51dc98cb829245092fffe08a4f9e0598f61305eda1fc5f64b1`; after `9805628d4be475b163788aa49b327b3a3246e5458b6891ebe2b78adb15447fa8`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `73b8ac6c70d246bcaad859dfeaabd1046503645be13bee7fd964c2d872b2b93b`; after `ad173cf88a0029df9e7c18baab7cdc73df10f8f52f62316545403d722d128a53`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:a64b7469"` to `"1.95.0:90b7facf"`, approved because its version and covered deterministic content changed.

## vktx-data-only

4 independently filed input corrections are listed below. Repeated aliases and dependent FCF are represented by their capex input, not counted again.

| Field | Window | Filed/admitted amount | SEC tag(s) | Filing evidence |
| --- | --- | ---: | --- | --- |
| incomeAnnual.generalAndAdministrativeExpenses | 2019-01-01 to 2019-12-31 | 9128000 USD | us-gaap/GeneralAndAdministrativeExpense | 10-K 0001564590-20-006766, filed 2020-02-26 |
| incomeQuarterly.generalAndAdministrativeExpenses | 2020-10-01 to 2020-12-31 | 2217000 USD (compatible YTD difference) | us-gaap/GeneralAndAdministrativeExpense | 10-K 0001564590-21-006406, filed 2021-02-17 + 10-Q 0001564590-20-048398, filed 2020-10-28 |
| cashflowAnnual.interestPaid | 2018-01-01 to 2018-12-31 | 81000 USD | us-gaap/InterestPaidNet | 10-K 0001564590-19-007584, filed 2019-03-13 |
| cashflowAnnual.interestPaid | 2016-01-01 to 2016-12-31 | 205139 USD | us-gaap/InterestPaid | 10-K 0001564590-17-004911, filed 2017-03-21 |

### stageB.json

SHA-256 before `0ef2c05d948cd9c97c32a90f810fa3254b79b49d71257cc91dbd12b03e2d5a93`; after `a20c4ee3566a6b421cd5b4992f1e5c667ecb8cbc9b516ed18e2a776afbd7cc87`.

446 changed JSON leaves, all enumerated below.

- **capital (1 leaves):** Admitted capex, D&A, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.current.cashBridge.definition
```

- **gaps (445 leaves):** New filed substitutions and missing-compatible-counterpart disclosures are added; recovered typed value-only conflicts retire only their own old refusal. Array positions shift after insertion.

```text
gaps.{21.reason,{22,24..29,31,32,34,40,42,44,47,50,53..55,57,58,104..113,115,119,120}.{attemptedSources,field,reason},{23,33,35..39,41,43,45,46,48,49,51,52,56,102,103}.{field,reason},30.field,{59,74..76}.{attemptedSources,field,reason,severity},{60,66,73}.{field,reason,severity},{61..65,71,72,77,78}.{attemptedSources.{0,1},{expected,field,reason,severity}},{67,68,70,79..85}.{attemptedSources,expected,field,reason,severity},69.{attemptedSources.{0,1},{field,reason,severity}},{86,87,93,100,101,114,116..118,121,122,124}.{attemptedSources,expected,field,reason},{88..92,94,97..99}.{attemptedSources.0,{field,reason}},95.{attemptedSources.{0,1},{field,reason}},{96,123}.{attemptedSources.0,{expected,field,reason}},{125..211}}
```

### payload.txt

SHA-256 before `b4b5e05cf9da2c48b8e5b4ec4e850cac3f5b3b7b6c386f6ccf2429cbc5f27e25`; after `27c8f02acbe38cf103e60d7a2224a9db9df4a0b15f3df90bd6a201dad313deb3`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `ddae34524ea2547dee5869f0b0af849a149f1e96c425e83ab9880d250e02c209`; after `be8921746eff28e0d8ea7d1db6b6cf8597811c3c2bca90ef27efb89cf5dca548`.

371 changed JSON leaves, all enumerated below.

- **appendix (367 leaves):** Substitution/missing-data/provenance records carry the changed inputs, filings and compatibility stamps; ordered arrays shift after additions. Existing unknown evidence stays unknown.

```text
appendix.missingData.{58.reason,59.{field,reason},{60..66,68..86}.{attemptedSources,expected,field,reason,severity},67.{attemptedSources,field,reason,severity},{87..92,95}.{attemptedSources.0,{field,reason}},93.{attemptedSources.{0,1},{field,reason}},94.{attemptedSources.0,{expected,field,reason}},{96..108}.{attemptedSources,field,reason},{109..122,127}.{attemptedSources,expected,field,reason},{123..126,128}.{expected,field,reason},{129..215}}
```

- **balanceSheet (1 leaves):** Cash, coverage and capital descriptions read the corrected filed flow family and its qualifications; no balance-sheet stock is independently substituted by this change.

```text
balanceSheet.coverage.commentary.1.text
```

- **meta (2 leaves):** Report/payload/Stage B compatibility stamps advance; payload fingerprint and method-identity hashes identify the revised meaning. Stored-report bytes are untouched.

```text
meta.{dataCompleteness.warningCount,specVersion}
```

- **verdict (1 leaves):** The unchanged verdict presentation reads the recalculated composite and evidence qualifications.

```text
verdict.synthesis
```

### report.md

SHA-256 before `ea1078a0662e7d5bff8b2f2a3d07f059a8d4a0a131abfec3e256809ebf4843bc`; after `aa83054ee52353eaeece708ab4c193dba98f608940daaa021604782c23493dc0`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `f9ae3debd0ca150230d168fcc9a5c220e0f4a1e4fe97c8ecf126ef8a0158410d`; after `a23a5f734756ee7767055e0cecfa9df39ef23b1956d18b07e326475ac422c51a`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `3f9bf669dc8ac5d933f3a05d27452570f8f31b70213bf8f1624daabda9e84cf5`; after `f707a79887c5d31eb092362d451bdd699f9190d34e83f5dd058081d4552b65a7`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `608b6b3041e760c1291cff3bf213fe9a73d314f6b2478415cf74ca5c7b962d0e`; after `8f0d6a4afe014b3977f0011c73542785747a12fe347c83699ed4b79356a6d9f0`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:d2838e19"` to `"1.95.0:6e0aba4a"`, approved because its version and covered deterministic content changed.

## amzn-fixed-analyst

2 independently filed input corrections are listed below. Repeated aliases and dependent FCF are represented by their capex input, not counted again.

| Field | Window | Filed/admitted amount | SEC tag(s) | Filing evidence |
| --- | --- | ---: | --- | --- |
| cashflowAnnual.interestPaid | 2016-01-01 to 2016-12-31 | 290000000 USD | us-gaap/InterestPaid | 10-K 0001018724-17-000011, filed 2017-02-10 |
| cashflowAnnual.capitalExpenditure | 2016-01-01 to 2016-12-31 | -6737000000 USD | us-gaap/PaymentsToAcquirePropertyPlantAndEquipment | 10-K 0001018724-17-000011, filed 2017-02-10 |

### stageB.json

SHA-256 before `9381e9cafc27f42b7f7a6c4048bc887e0dd19aea32962a8bbffc3e5e6ab459c4`; after `51d3240dccc6cc38070e36e3ebda4716041962c0206bd0f53aee7fcebc9f3209`.

306 changed JSON leaves, all enumerated below.

- **capital (1 leaves):** Admitted capex, D&A, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.current.cashBridge.definition
```

- **gaps (300 leaves):** New filed substitutions and missing-compatible-counterpart disclosures are added; recovered typed value-only conflicts retire only their own old refusal. Array positions shift after insertion.

```text
gaps.{{78..80,88..90,94..96,100..102,106..108,112..114,118..120,124..126,134,161,162}.{attemptedSources,field,reason},{81..87,91..93,97..99,103..105,109..111,115..117,121..123,127,128,164}.{field,reason},{129,130,132,133,135,136,138,139,141,142,144,145,147,148,150,151,153,154,156,157,159,160,163}.{expected,field,reason},{131,137,140,143,146,149,152,155,158}.{attemptedSources,expected,field,reason},{165..222}}
```

- **growth (2 leaves):** Annual filed PP&E changes FCF endpoints, CAGR and the associated window/sensitivity descriptions; revenue and EPS definitions are unchanged.

```text
growth.fcfCagrs.3.{cagrPct,startValue}
```

- **scores (3 leaves):** The unchanged scoring formulas read the corrected operands above; driver values, signal arithmetic, aspect/composite results and completeness follow those operands.

```text
scores.aspects.fundamentals.signals.3.{fallbackReason,operands.{6,7}.value}
```

### payload.txt

SHA-256 before `2dbcf2787731fe38a3bada47664855d48c17012430236b85a2eeb5f247bbe7c2`; after `f5d70be5e8d6fbafd8b82375a9f6b07c158f4c363ff006a7212ee9db97b0bfab`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `0761353d161bc0e321a07e641fca47adb402c8739dfae79d6ccbed1609eb0d8e`; after `87e1f2495f45f76a4b81eea4e1180c121c545c86a0d5a40b8abf35daa4a55921`.

309 changed JSON leaves, all enumerated below.

- **appendix (304 leaves):** Substitution/missing-data/provenance records carry the changed inputs, filings and compatibility stamps; ordered arrays shift after additions. Existing unknown evidence stays unknown.

```text
appendix.{missingData.{{96..98,106..108,112..114,118..120,124..126,130..132,136..138,142..144,152,179}.{attemptedSources,field,reason},{99..105,109..111,115..117,121..123,127..129,133..135,139..141,145,146,180,182}.{field,reason},{147,148,150,151,153,154,156,157,159,160,162,163,165,166,168,169,171,172,174,175,177,178,183}.{expected,field,reason},{149,155,158,161,164,167,170,173,176,181}.{attemptedSources,expected,field,reason},{184..241}},verificationLog.355.claim}
```

- **balanceSheet (1 leaves):** Cash, coverage and capital descriptions read the corrected filed flow family and its qualifications; no balance-sheet stock is independently substituted by this change.

```text
balanceSheet.coverage.commentary.3.text
```

- **meta (1 leaves):** Report/payload/Stage B compatibility stamps advance; payload fingerprint and method-identity hashes identify the revised meaning. Stored-report bytes are untouched.

```text
meta.specVersion
```

- **scores (3 leaves):** The unchanged scoring formulas read the corrected operands above; driver values, signal arithmetic, aspect/composite results and completeness follow those operands.

```text
scores.aspects.fundamentals.signals.3.{fallbackReason,operands.{6,7}.value}
```

### report.md

SHA-256 before `ce54c0ff7dc046948588b0049220cfef1c7bbc5d357eae5e358ec9ec5ec09940`; after `4e5f3e880e3218bd3223168b2239ea8ad23ad2fbd9a0f957bdb36822784c90f5`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `659423ffaea89cb44e964552bbb2c94a1c82046028dea46364f40349f9d42008`; after `acac9ae6cf70786520938b584184870b856312a9893c7fb4cf1eab730773fb24`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `b426e2cc6d086c4bbc64aed1327e6741754138939a86c33c7be4f2f2b954a726`; after `24fe82ee58903e7ec69ff50f0691f7fb96768a425c9285fdd97ab1af04024fb3`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `f654e8ae9a3b250da6af16f05618748704e97ec667e607550df5c527d248d812`; after `a94cde47bb68aeed0b83ea0eb2853fb44e78f6cfb4c5ba406945929746b9fd47`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:d3a902a8"` to `"1.95.0:1e40c06c"`, approved because its version and covered deterministic content changed.

## meta-fixed-analyst

4 independently filed input corrections are listed below. Repeated aliases and dependent FCF are represented by their capex input, not counted again.

| Field | Window | Filed/admitted amount | SEC tag(s) | Filing evidence |
| --- | --- | ---: | --- | --- |
| incomeQuarterly.interestExpense | 2026-04-01 to 2026-06-30 | 754000000 USD | us-gaap/InterestExpenseDebt | 10-Q 0001628280-26-050705, filed 2026-07-30 |
| cashflowAnnual.interestPaid | 2025-01-01 to 2025-12-31 | 696000000 USD | us-gaap/InterestPaidNet | 10-K 0001628280-26-003942, filed 2026-01-29 |
| cashflowQuarterly.commonDividendsPaid | 2025-10-01 to 2025-12-31 | -1328000000 USD | us-gaap/PaymentsOfDividendsCommonStock | 10-K 0001628280-26-003942, filed 2026-01-29 |
| cashflowQuarterly.commonDividendsPaid | 2025-07-01 to 2025-09-30 | -1323000000 USD | us-gaap/PaymentsOfDividendsCommonStock | 10-Q 0001628280-25-047240, filed 2025-10-30 |

### stageB.json

SHA-256 before `ebfb1046771b5640b383fc795c0741adb0ca38241b7a92acf9a40dc827f0adab`; after `4c42b4f3124b634210f33d01176b7ea0f8ad1b8c69b591ac664b401033dc2e8d`.

411 changed JSON leaves, all enumerated below.

- **capital (3 leaves):** Admitted capex, D&A, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.current.{cashBridge.definition,{interestCoverage,interestExpense}}
```

- **gaps (401 leaves):** New filed substitutions and missing-compatible-counterpart disclosures are added; recovered typed value-only conflicts retire only their own old refusal. Array positions shift after insertion.

```text
gaps.{{46,47,49,57,95,101,105,107,109,110,112,114,120,122..131,166}.{attemptedSources,field,reason},{48,50,88,89,102..104,106,108,111,113,115..119,121,132..135,154,156,167..169}.{field,reason},51.{attemptedSources,field,reason,severity},{52..56}.{attemptedSources,expected,field,reason,severity},{58,61,64..70,73,74,91,92,97,98}.{attemptedSources.0,{field,reason}},59.{attemptedSources.{1,2},{field,reason}},60.{attemptedSources.{0..2},{field,reason}},{62,76,79,80,82..87,90,93,94,96,99,100}.{attemptedSources.{0,1},{field,reason}},63.{attemptedSources.0,{expected,field,reason}},{71,72,75,77,78,81,137,141,145,149,152}.{attemptedSources,expected,field,reason},{136,138..140,142..144,146..148,150,151,153,165,170}.{expected,field,reason},{155,157..164}.field,{171..198}}
```

- **returns (3 leaves):** Admitted interest or operating/capital inputs propagate through the existing return and borrowing-cost calculations, with their dated basis.

```text
returns.wacc.{interestCoverageRatio,notes.{1,2}}
```

- **scores (4 leaves):** The unchanged scoring formulas read the corrected operands above; driver values, signal arithmetic, aspect/composite results and completeness follow those operands.

```text
scores.aspects.balanceSheet.{drivers.1.value,signals.1.{operands.{0,2}.value,raw}}
```

### payload.txt

SHA-256 before `0d676d6a44378b390501ae457aff13995de5ed4d6926799219c576cf101457df`; after `fcc504016193acbf565b9e1c75bd1ce7858ca1c913aab8ae3deddfdf26932bb1`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `3cccad378e9f950f5298c3eb1caec78e37355b0f0520094127ad4f7d763aa0b5`; after `6ac40d939501314871cbce8447dcc7e2cc980e7543373884bbf546cacfcfd609`.

479 changed JSON leaves, all enumerated below.

- **appendix (471 leaves):** Substitution/missing-data/provenance records carry the changed inputs, filings and compatibility stamps; ordered arrays shift after additions. Existing unknown evidence stays unknown.

```text
appendix.{missingData.{{47,48,50,52,59,111,117,121,123,125,126,128,130,136,138..147,182..184}.{attemptedSources,field,reason},{49,51,104,105,118..120,122,124,127,129,131..135,137,148..151,170,172,185,187,188}.{field,reason},53.{field,reason,severity},{54..58}.{attemptedSources,expected,field,reason,severity},{60,63,73..78,91}.{attemptedSources.0,{expected,field,reason}},{61,62}.{attemptedSources.{0..2},{expected,field,reason}},{64,97}.{attemptedSources.{0,1},{expected,field,reason}},{65..72,79..85,88,89,107,108,113,114}.{attemptedSources.0,{field,reason}},{86,87,90,92,93,96,153,157,161,165,168}.{attemptedSources,expected,field,reason},{94,95,98..103,106,109,110,112,115,116}.{attemptedSources.{0,1},{field,reason}},{152,154..156,158..160,162..164,166,167,169,181,186}.{expected,field,reason},{171,173..180}.field,189.{attemptedSources,field,reason,severity},{190..217}},verificationLog.{83,147,237}.claim}
```

- **balanceSheet (2 leaves):** Cash, coverage and capital descriptions read the corrected filed flow family and its qualifications; no balance-sheet stock is independently substituted by this change.

```text
balanceSheet.coverage.{commentary.4.text,numbers.10.value}
```

- **meta (2 leaves):** Report/payload/Stage B compatibility stamps advance; payload fingerprint and method-identity hashes identify the revised meaning. Stored-report bytes are untouched.

```text
meta.{dataCompleteness.warningCount,specVersion}
```

- **scores (4 leaves):** The unchanged scoring formulas read the corrected operands above; driver values, signal arithmetic, aspect/composite results and completeness follow those operands.

```text
scores.aspects.balanceSheet.{drivers.1.value,signals.1.{operands.{0,2}.value,raw}}
```

### report.md

SHA-256 before `3ec02cbc901679e584798fb3e8f7ec9d978667d64b3785aedb57261137a90310`; after `5085fddc36fa7f2aa05643c773cb77ff0698524089b786ed19cc61421a87fdfe`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `e4b6aa58b8be21fe48867705cb6d4fdea3b00312cb3473b557912ebf087dfb25`; after `98d0bb90f764eb80365eea1d4c157162cf18ada250a2b9ef5630a8212e7da994`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `a60013601fec2067a0f5f910f7fda08f431ec4adf6b3734c6b5bfbd1ddbc32bf`; after `d0a4a83fed9264795866c0b26569d1b4ec080343e2cf5c3ed1b6115b8df66bf5`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `f46012e9d755d69ee8941a38361a8a2b7a5c0935b2465d321f109f9a086b01a0`; after `218a0f3833d9b7cf7132294b0c980b011b445722c9c8f6bc3ccbbcc605e54792`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:0ff64fb6"` to `"1.95.0:3bbee120"`, approved because its version and covered deterministic content changed.

## mu-fixed-analyst

No scalar input correction: only the revised definition, compatibility identifiers and explicit unverified-coverage disclosures change.

| Field | Window | Filed/admitted amount | SEC tag(s) | Filing evidence |
| --- | --- | ---: | --- | --- |

### stageB.json

SHA-256 before `221c0a467a91e1522bdce283b855072801ae97ddd1061ea42d148fc3c34fbae9`; after `6fd276e28539f97b5a67dc5e30d11efa630d219e92d06ef211f128a745fef058`.

1 changed JSON leaves, all enumerated below.

- **capital (1 leaves):** Admitted capex, D&A, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.current.cashBridge.definition
```

### payload.txt

SHA-256 before `53df00250317a2a31da0ac982654047e5981407bff273bb0c03cb4c9476fc50a`; after `505593efc9310d50fca7157d3259553eece4a92e649278b9b16a0510f307fa4d`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `86e6bb54852aa99761a75f9068bd5ea8bedd4672455d381eae99132e743dceb2`; after `88505a5c5a80824f3af618a28a58dcb62bc998d993fd2f035c38b01cdde39eba`.

3 changed JSON leaves, all enumerated below.

- **appendix (1 leaves):** Substitution/missing-data/provenance records carry the changed inputs, filings and compatibility stamps; ordered arrays shift after additions. Existing unknown evidence stays unknown.

```text
appendix.verificationLog.366.claim
```

- **balanceSheet (1 leaves):** Cash, coverage and capital descriptions read the corrected filed flow family and its qualifications; no balance-sheet stock is independently substituted by this change.

```text
balanceSheet.coverage.commentary.5.text
```

- **meta (1 leaves):** Report/payload/Stage B compatibility stamps advance; payload fingerprint and method-identity hashes identify the revised meaning. Stored-report bytes are untouched.

```text
meta.specVersion
```

### report.md

SHA-256 before `8eef5ed122882ebc457773f469e52240e328008e10766ab29885cc208e0c9325`; after `4d77bb0f5809ef7da0d29ff9de7a8bf1092f2ebe256fbd7f7165e44aa0e66ac1`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `84af32328ea25fd6743aca6f26749d66ecba159485b1301acea35f86198ae34c`; after `d9e077596620ba0fbc707d84036cb9b0856a699eed1ef9b5a76935a57c23dd0f`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `884b4373251bc88424c021eadae880a4b6dc17615bdae546dc7b494b3c8695af`; after `73018a8ea19c68b610a8148f61046ed9806ea8542266754d713223a33c3b556f`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `a02c2fd7e59c820d98168e11037de3f6355b45efc50383fc187886f8a192b10e`; after `c06f1f41496fbe7a07d189d8be33783173c7eaa1ca30cc6cf386bd4512b04581`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:ae6c7800"` to `"1.95.0:83ff7142"`, approved because its version and covered deterministic content changed.

## nvda-fixed-analyst

8 independently filed input corrections are listed below. Repeated aliases and dependent FCF are represented by their capex input, not counted again.

| Field | Window | Filed/admitted amount | SEC tag(s) | Filing evidence |
| --- | --- | ---: | --- | --- |
| cashflowAnnual.incomeTaxesPaid | 2025-01-27 to 2026-01-25 | 20288000000 USD | us-gaap/IncomeTaxesPaidNet | 10-K 0001045810-26-000021, filed 2026-02-25 |
| cashflowQuarterly.netDividendsPaid | 2026-04-27 to 2026-07-26 | -6000000000 USD | us-gaap/PaymentsOfDividends | 10-Q 0001045810-26-000075, filed 2026-08-26 |
| cashflowQuarterly.incomeTaxesPaid | 2025-10-27 to 2026-01-25 | 6979000000 USD (compatible YTD difference) | us-gaap/IncomeTaxesPaidNet | 10-K 0001045810-26-000021, filed 2026-02-25 + 10-Q 0001045810-25-000230, filed 2025-11-19 |
| cashflowQuarterly.incomeTaxesPaid | 2025-07-28 to 2025-10-26 | 4858000000 USD (compatible YTD difference) | us-gaap/IncomeTaxesPaidNet | 10-Q 0001045810-25-000230, filed 2025-11-19 + 10-Q 0001045810-25-000209, filed 2025-08-27 |
| cashflowQuarterly.acquisitionsNet | 2023-07-31 to 2023-10-29 | 0 USD (compatible YTD difference) | us-gaap/PaymentsToAcquireBusinessesNetOfCashAcquired | 10-Q 0001045810-23-000227, filed 2023-11-21 + 10-Q 0001045810-23-000175, filed 2023-08-28 |
| cashflowQuarterly.netDividendsPaid | 2023-07-31 to 2023-10-29 | -99000000 USD | us-gaap/PaymentsOfDividends | 10-Q 0001045810-23-000227, filed 2023-11-21 |
| cashflowQuarterly.acquisitionsNet | 2023-05-01 to 2023-07-30 | 0 USD (compatible YTD difference) | us-gaap/PaymentsToAcquireBusinessesNetOfCashAcquired | 10-Q 0001045810-23-000175, filed 2023-08-28 + 10-Q 0001045810-23-000093, filed 2023-05-26 |
| cashflowQuarterly.acquisitionsNet | 2023-01-30 to 2023-04-30 | -83000000 USD | us-gaap/PaymentsToAcquireBusinessesNetOfCashAcquired | 10-Q 0001045810-23-000093, filed 2023-05-26 |

### stageB.json

SHA-256 before `b4f6677ad08d828bc353afaf4bbe835a42154e54dea708fc178316c14f37e553`; after `36247b231a03e3972a9c6b1bba0a64197165de75558bb6ac3cc0eeec6c481699`.

180 changed JSON leaves, all enumerated below.

- **capital (1 leaves):** Admitted capex, D&A, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.current.cashBridge.definition
```

- **gaps (179 leaves):** New filed substitutions and missing-compatible-counterpart disclosures are added; recovered typed value-only conflicts retire only their own old refusal. Array positions shift after insertion.

```text
gaps.{{51..61}.{field,reason},{62..89,91,92}.{expected,field,reason},90.{attemptedSources,expected,field,reason},{93..155}}
```

### payload.txt

SHA-256 before `c4abe6679d23ad37e37f446db0418e80d211224167956131f42ed774e1ad9e3e`; after `e55e163d726e41894f0e49fb348282402738c9408dc71330ecdec50935bafa30`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `bc56369a7773a0e66915aff9be7c692bea09caf102f4d7bc5805ff130173efef`; after `064336de96b4aabbf66da4fbad9326f627d77b49b7bce25c52424f7c4f4e9243`.

195 changed JSON leaves, all enumerated below.

- **appendix (193 leaves):** Substitution/missing-data/provenance records carry the changed inputs, filings and compatibility stamps; ordered arrays shift after additions. Existing unknown evidence stays unknown.

```text
appendix.{missingData.{{68..78}.{field,reason},{79..107,109,110}.{expected,field,reason},108.{attemptedSources,expected,field,reason},{111,112}.{attemptedSources,expected,field,reason,severity},{113..175}},verificationLog.333.claim}
```

- **balanceSheet (1 leaves):** Cash, coverage and capital descriptions read the corrected filed flow family and its qualifications; no balance-sheet stock is independently substituted by this change.

```text
balanceSheet.coverage.commentary.3.text
```

- **meta (1 leaves):** Report/payload/Stage B compatibility stamps advance; payload fingerprint and method-identity hashes identify the revised meaning. Stored-report bytes are untouched.

```text
meta.specVersion
```

### report.md

SHA-256 before `708ca26c00122be27f590643c2e445dddc30bc7da536eae1e8398876f00b8af0`; after `324ad58a32c2cf9fa0cd4d321cdd45d4e2e5a26440b76f83ec91d19c3a356444`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `8edb118e84dced65c17819e94e99b27ab2b22d27fca9127c9ef417eba7e7c06e`; after `0c6d7718fb405637e891e0cf9c24e34d3146461505d6218204fd5f0423f38014`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `f2828dc35371e1b29b0823846368a68fab87079507033d1174bd360cb63101fc`; after `bce82528695c2b46f8112c3b112c643ca922b9c38424dd9a1a18a8a53188fd22`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `0d4bd3c544bc2c6ee4cecc0265cf39110961cb489b42a259de87f3415c8ea0f6`; after `e908aaf02a07ed1ac5708f193e7ce346107fe1891f2e65bd37ba6d55011c717a`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:182abc3c"` to `"1.95.0:7fd34bb8"`, approved because its version and covered deterministic content changed.

## lly-data-only

61 independently filed input corrections are listed below. Repeated aliases and dependent FCF are represented by their capex input, not counted again.

| Field | Window | Filed/admitted amount | SEC tag(s) | Filing evidence |
| --- | --- | ---: | --- | --- |
| incomeAnnual.interestExpense | 2025-01-01 to 2025-12-31 | 895000000 USD | us-gaap/InterestExpenseNonoperating | 10-K 0000059478-26-000013, filed 2026-02-12 |
| incomeAnnual.depreciationAndAmortization | 2024-01-01 to 2024-12-31 | 1766600000 USD | us-gaap/DepreciationDepletionAndAmortization | 10-K 0000059478-25-000067, filed 2025-02-19 |
| incomeAnnual.sellingGeneralAndAdministrativeExpenses | 2020-01-01 to 2020-12-31 | 6121200000 USD | us-gaap/SellingGeneralAndAdministrativeExpense | 10-K 0000059478-21-000083, filed 2021-02-17 |
| incomeAnnual.sellingGeneralAndAdministrativeExpenses | 2019-01-01 to 2019-12-31 | 6213800000 USD | us-gaap/SellingGeneralAndAdministrativeExpense | 10-K 0000059478-20-000057, filed 2020-02-19 |
| incomeQuarterly.interestExpense | 2025-10-01 to 2025-12-31 | 222600000 USD (compatible YTD difference) | us-gaap/InterestExpenseNonoperating | 10-K 0000059478-26-000013, filed 2026-02-12 + 10-Q 0000059478-25-000254, filed 2025-10-30 |
| incomeQuarterly.depreciationAndAmortization | 2025-07-01 to 2025-09-30 | 470000000 USD (compatible YTD difference) | us-gaap/DepreciationDepletionAndAmortization | 10-Q 0000059478-25-000254, filed 2025-10-30 + 10-Q 0000059478-25-000204, filed 2025-08-07 |
| incomeQuarterly.depreciationAndAmortization | 2025-04-01 to 2025-06-30 | 478500000 USD (compatible YTD difference) | us-gaap/DepreciationDepletionAndAmortization | 10-Q 0000059478-25-000204, filed 2025-08-07 + 10-Q 0000059478-25-000132, filed 2025-05-01 |
| incomeQuarterly.depreciationAndAmortization | 2025-01-01 to 2025-03-31 | 462800000 USD | us-gaap/DepreciationDepletionAndAmortization | 10-Q 0000059478-25-000132, filed 2025-05-01 |
| incomeQuarterly.researchAndDevelopmentExpenses | 2025-01-01 to 2025-03-31 | 2733700000 USD | us-gaap/ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost | 10-Q 0000059478-25-000132, filed 2025-05-01 |
| incomeQuarterly.sellingGeneralAndAdministrativeExpenses | 2024-04-01 to 2024-06-30 | 2117300000 USD | us-gaap/SellingGeneralAndAdministrativeExpense | 10-Q 0000059478-24-000187, filed 2024-08-08 |
| incomeQuarterly.sellingGeneralAndAdministrativeExpenses | 2024-01-01 to 2024-03-31 | 1952200000 USD | us-gaap/SellingGeneralAndAdministrativeExpense | 10-Q 0000059478-24-000118, filed 2024-04-30 |
| incomeQuarterly.sellingGeneralAndAdministrativeExpenses | 2023-10-01 to 2023-12-31 | 1924600000 USD (compatible YTD difference) | us-gaap/SellingGeneralAndAdministrativeExpense | 10-K 0000059478-24-000065, filed 2024-02-21 + 10-Q 0000059478-23-000284, filed 2023-11-02 |
| incomeQuarterly.sellingGeneralAndAdministrativeExpenses | 2023-07-01 to 2023-09-30 | 1803900000 USD | us-gaap/SellingGeneralAndAdministrativeExpense | 10-Q 0000059478-23-000284, filed 2023-11-02 |
| incomeQuarterly.sellingGeneralAndAdministrativeExpenses | 2023-04-01 to 2023-06-30 | 1925400000 USD | us-gaap/SellingGeneralAndAdministrativeExpense | 10-Q 0000059478-23-000221, filed 2023-08-08 |
| incomeQuarterly.sellingGeneralAndAdministrativeExpenses | 2023-01-01 to 2023-03-31 | 1749200000 USD | us-gaap/SellingGeneralAndAdministrativeExpense | 10-Q 0000059478-23-000162, filed 2023-04-27 |
| incomeQuarterly.sellingGeneralAndAdministrativeExpenses | 2022-10-01 to 2022-12-31 | 1643200000 USD (compatible YTD difference) | us-gaap/SellingGeneralAndAdministrativeExpense | 10-K 0000059478-23-000082, filed 2023-02-22 + 10-Q 0000059478-22-000250, filed 2022-11-01 |
| incomeQuarterly.sellingGeneralAndAdministrativeExpenses | 2022-07-01 to 2022-09-30 | 1614200000 USD | us-gaap/SellingGeneralAndAdministrativeExpense | 10-Q 0000059478-22-000250, filed 2022-11-01 |
| incomeQuarterly.sellingGeneralAndAdministrativeExpenses | 2022-04-01 to 2022-06-30 | 1625100000 USD | us-gaap/SellingGeneralAndAdministrativeExpense | 10-Q 0000059478-22-000196, filed 2022-08-04 |
| incomeQuarterly.sellingGeneralAndAdministrativeExpenses | 2022-01-01 to 2022-03-31 | 1557900000 USD | us-gaap/SellingGeneralAndAdministrativeExpense | 10-Q 0000059478-22-000133, filed 2022-04-29 |
| incomeQuarterly.sellingGeneralAndAdministrativeExpenses | 2021-10-01 to 2021-12-31 | 1592000000 USD (compatible YTD difference) | us-gaap/SellingGeneralAndAdministrativeExpense | 10-K 0000059478-22-000068, filed 2022-02-23 + 10-Q 0000059478-21-000216, filed 2021-10-27 |
| incomeQuarterly.sellingGeneralAndAdministrativeExpenses | 2021-07-01 to 2021-09-30 | 1577900000 USD | us-gaap/SellingGeneralAndAdministrativeExpense | 10-Q 0000059478-21-000216, filed 2021-10-27 |
| incomeQuarterly.sellingGeneralAndAdministrativeExpenses | 2021-04-01 to 2021-06-30 | 1685700000 USD | us-gaap/SellingGeneralAndAdministrativeExpense | 10-Q 0000059478-21-000171, filed 2021-08-03 |
| incomeQuarterly.sellingGeneralAndAdministrativeExpenses | 2021-01-01 to 2021-03-31 | 1576000000 USD | us-gaap/SellingGeneralAndAdministrativeExpense | 10-Q 0000059478-21-000122, filed 2021-04-30 |
| incomeQuarterly.sellingGeneralAndAdministrativeExpenses | 2020-10-01 to 2020-12-31 | 1553900000 USD (compatible YTD difference) | us-gaap/SellingGeneralAndAdministrativeExpense | 10-K 0000059478-21-000083, filed 2021-02-17 + 10-Q 0000059478-20-000155, filed 2020-10-28 |
| cashflowAnnual.incomeTaxesPaid | 2025-01-01 to 2025-12-31 | 10814000000 USD | us-gaap/IncomeTaxesPaidNet | 10-K 0000059478-26-000013, filed 2026-02-12 |
| cashflowAnnual.interestPaid | 2025-01-01 to 2025-12-31 | 633000000 USD | us-gaap/InterestPaidNet | 10-K 0000059478-26-000013, filed 2026-02-12 |
| cashflowAnnual.interestPaid | 2024-01-01 to 2024-12-31 | 577500000 USD | us-gaap/InterestPaidNet | 10-K 0000059478-25-000067, filed 2025-02-19 |
| cashflowAnnual.incomeTaxesPaid | 2022-01-01 to 2022-12-31 | 2672900000 USD | us-gaap/IncomeTaxesPaid | 10-K 0000059478-23-000082, filed 2023-02-22 |
| cashflowAnnual.interestPaid | 2022-01-01 to 2022-12-31 | 323700000 USD | us-gaap/InterestPaidNet | 10-K 0000059478-23-000082, filed 2023-02-22 |
| cashflowAnnual.capitalExpenditure | 2022-01-01 to 2022-12-31 | -1854300000 USD | us-gaap/PaymentsToAcquireOtherPropertyPlantAndEquipment | 10-K 0000059478-23-000082, filed 2023-02-22 |
| cashflowAnnual.incomeTaxesPaid | 2021-01-01 to 2021-12-31 | 1598800000 USD | us-gaap/IncomeTaxesPaid | 10-K 0000059478-22-000068, filed 2022-02-23 |
| cashflowAnnual.interestPaid | 2021-01-01 to 2021-12-31 | 338000000 USD | us-gaap/InterestPaidNet | 10-K 0000059478-22-000068, filed 2022-02-23 |
| cashflowAnnual.capitalExpenditure | 2021-01-01 to 2021-12-31 | -1309800000 USD | us-gaap/PaymentsToAcquireOtherPropertyPlantAndEquipment | 10-K 0000059478-22-000068, filed 2022-02-23 |
| cashflowAnnual.incomeTaxesPaid | 2020-01-01 to 2020-12-31 | 954600000 USD | us-gaap/IncomeTaxesPaid | 10-K 0000059478-21-000083, filed 2021-02-17 |
| cashflowAnnual.interestPaid | 2020-01-01 to 2020-12-31 | 345800000 USD | us-gaap/InterestPaidNet | 10-K 0000059478-21-000083, filed 2021-02-17 |
| cashflowAnnual.capitalExpenditure | 2020-01-01 to 2020-12-31 | -1387900000 USD | us-gaap/PaymentsToAcquireOtherPropertyPlantAndEquipment | 10-K 0000059478-21-000083, filed 2021-02-17 |
| cashflowAnnual.acquisitionsNet | 2019-01-01 to 2019-12-31 | -6917700000 USD | us-gaap/PaymentsToAcquireBusinessesNetOfCashAcquired | 10-K 0000059478-20-000057, filed 2020-02-19 |
| cashflowAnnual.incomeTaxesPaid | 2019-01-01 to 2019-12-31 | 1180500000 USD | us-gaap/IncomeTaxesPaid | 10-K 0000059478-20-000057, filed 2020-02-19 |
| cashflowAnnual.interestPaid | 2019-01-01 to 2019-12-31 | 305500000 USD | us-gaap/InterestPaidNet | 10-K 0000059478-20-000057, filed 2020-02-19 |
| cashflowAnnual.capitalExpenditure | 2019-01-01 to 2019-12-31 | -1033900000 USD | us-gaap/PaymentsToAcquireOtherPropertyPlantAndEquipment | 10-K 0000059478-20-000057, filed 2020-02-19 |
| cashflowAnnual.interestPaid | 2018-01-01 to 2018-12-31 | 223800000 USD | us-gaap/InterestPaidNet | 10-K 0000059478-19-000082, filed 2019-02-19 |
| cashflowAnnual.capitalExpenditure | 2018-01-01 to 2018-12-31 | -1210600000 USD | us-gaap/PaymentsToAcquireOtherPropertyPlantAndEquipment | 10-K 0000059478-19-000082, filed 2019-02-19 |
| cashflowAnnual.interestPaid | 2017-01-01 to 2017-12-31 | 192700000 USD | us-gaap/InterestPaidNet | 10-K 0000059478-18-000089, filed 2018-02-20 |
| cashflowAnnual.capitalExpenditure | 2017-01-01 to 2017-12-31 | -1076800000 USD | us-gaap/PaymentsToAcquireOtherPropertyPlantAndEquipment | 10-K 0000059478-18-000089, filed 2018-02-20 |
| cashflowAnnual.incomeTaxesPaid | 2016-01-01 to 2016-12-31 | 700600000 USD | us-gaap/IncomeTaxesPaid | 10-K 0000059478-17-000098, filed 2017-02-21 |
| cashflowAnnual.interestPaid | 2016-01-01 to 2016-12-31 | 146400000 USD | us-gaap/InterestPaidNet | 10-K 0000059478-17-000098, filed 2017-02-21 |
| cashflowAnnual.capitalExpenditure | 2016-01-01 to 2016-12-31 | -1037000000 USD | us-gaap/PaymentsToAcquireOtherPropertyPlantAndEquipment | 10-K 0000059478-17-000098, filed 2017-02-21 |
| cashflowQuarterly.depreciationAndAmortization | 2025-07-01 to 2025-09-30 | 470000000 USD (compatible YTD difference) | us-gaap/DepreciationDepletionAndAmortization | 10-Q 0000059478-25-000254, filed 2025-10-30 + 10-Q 0000059478-25-000204, filed 2025-08-07 |
| cashflowQuarterly.capitalExpenditure | 2025-07-01 to 2025-09-30 | -2087700000 USD (compatible YTD difference) | us-gaap/PaymentsToAcquireOtherPropertyPlantAndEquipment | 10-Q 0000059478-25-000254, filed 2025-10-30 + 10-Q 0000059478-25-000204, filed 2025-08-07 |
| cashflowQuarterly.depreciationAndAmortization | 2025-04-01 to 2025-06-30 | 478500000 USD (compatible YTD difference) | us-gaap/DepreciationDepletionAndAmortization | 10-Q 0000059478-25-000204, filed 2025-08-07 + 10-Q 0000059478-25-000132, filed 2025-05-01 |
| cashflowQuarterly.capitalExpenditure | 2025-04-01 to 2025-06-30 | -1697100000 USD (compatible YTD difference) | us-gaap/PaymentsToAcquireOtherPropertyPlantAndEquipment | 10-Q 0000059478-25-000204, filed 2025-08-07 + 10-Q 0000059478-25-000132, filed 2025-05-01 |
| cashflowQuarterly.capitalExpenditure | 2024-10-01 to 2024-12-31 | -1496000000 USD (compatible YTD difference) | us-gaap/PaymentsToAcquireOtherPropertyPlantAndEquipment | 10-K 0000059478-25-000067, filed 2025-02-19 + 10-Q 0000059478-24-000245, filed 2024-10-30 |
| cashflowQuarterly.capitalExpenditure | 2024-07-01 to 2024-09-30 | -1350700000 USD (compatible YTD difference) | us-gaap/PaymentsToAcquireOtherPropertyPlantAndEquipment | 10-Q 0000059478-24-000245, filed 2024-10-30 + 10-Q 0000059478-24-000187, filed 2024-08-08 |
| cashflowQuarterly.capitalExpenditure | 2024-04-01 to 2024-06-30 | -1224800000 USD (compatible YTD difference) | us-gaap/PaymentsToAcquireOtherPropertyPlantAndEquipment | 10-Q 0000059478-24-000187, filed 2024-08-08 + 10-Q 0000059478-24-000118, filed 2024-04-30 |
| cashflowQuarterly.capitalExpenditure | 2023-10-01 to 2023-12-31 | -1070600000 USD (compatible YTD difference) | us-gaap/PaymentsToAcquireOtherPropertyPlantAndEquipment | 10-K 0000059478-24-000065, filed 2024-02-21 + 10-Q 0000059478-23-000284, filed 2023-11-02 |
| cashflowQuarterly.capitalExpenditure | 2023-07-01 to 2023-09-30 | -970300000 USD (compatible YTD difference) | us-gaap/PaymentsToAcquireOtherPropertyPlantAndEquipment | 10-Q 0000059478-23-000284, filed 2023-11-02 + 10-Q 0000059478-23-000221, filed 2023-08-08 |
| cashflowQuarterly.capitalExpenditure | 2023-04-01 to 2023-06-30 | -738200000 USD (compatible YTD difference) | us-gaap/PaymentsToAcquireOtherPropertyPlantAndEquipment | 10-Q 0000059478-23-000221, filed 2023-08-08 + 10-Q 0000059478-23-000162, filed 2023-04-27 |
| cashflowQuarterly.capitalExpenditure | 2023-01-01 to 2023-03-31 | -668500000 USD | us-gaap/PaymentsToAcquireOtherPropertyPlantAndEquipment | 10-Q 0000059478-23-000162, filed 2023-04-27 |
| cashflowQuarterly.capitalExpenditure | 2021-07-01 to 2021-09-30 | -336800000 USD (compatible YTD difference) | us-gaap/PaymentsToAcquireProductiveAssets | 10-Q 0000059478-21-000216, filed 2021-10-27 + 10-Q 0000059478-21-000171, filed 2021-08-03 |
| cashflowQuarterly.capitalExpenditure | 2021-04-01 to 2021-06-30 | -381300000 USD (compatible YTD difference) | us-gaap/PaymentsToAcquireProductiveAssets | 10-Q 0000059478-21-000171, filed 2021-08-03 + 10-Q 0000059478-21-000122, filed 2021-04-30 |
| cashflowQuarterly.capitalExpenditure | 2021-01-01 to 2021-03-31 | -300300000 USD | us-gaap/PaymentsToAcquireProductiveAssets | 10-Q 0000059478-21-000122, filed 2021-04-30 |

### stageB.json

SHA-256 before `1e45f11f6a39257b63f83a4e053cf6bb263046763b7f888c468aab96ca23ffbe`; after `30ea3991b9898a43a9fb739f5b0489f5a4446658e2ae8630ff802f22f00d2081`.

617 changed JSON leaves, all enumerated below.

- **capital (29 leaves):** Admitted capex, D&A, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.{capexIntensity.{series.{0,1}.{capex,capexToDA,capexToRevenuePct},slopePctPtsPerYear},current.{cashBridge.{afterSbcStandardizedFcf,cashCapitalExpenditure,definition,standardizedFcf},{fcfBeforeSbc,fcfConversionBeforeSbc,interestExpense,sbcPctOfFcf},filedCashFlows.capitalExpenditure},fcf.series.{0,1}.{fcf,fcfBeforeSbc,fcfConversion,fcfConversionBeforeSbc,note},interestCoverage.{interestExpense,value},maintenanceVsGrowthCapex.capexToDA5yAvg}
```

- **gaps (481 leaves):** New filed substitutions and missing-compatible-counterpart disclosures are added; recovered typed value-only conflicts retire only their own old refusal. Array positions shift after insertion.

```text
gaps.{{14,15,27,29,43..45,121}.{attemptedSources,field,reason},{16,22,25,41,48,51,54,55,58,59,83,87,94,97,100,103,107,110..112,115,122,125,126,129,130}.{field,reason},17.{field,reason,severity},{18..20}.{attemptedSources,expected,field,reason,severity},{21,23,28,34,46,47,119,120}.{attemptedSources,expected,field,reason},24.{attemptedSources.0,{expected,field,reason}},{26,30,31,33,36..38,42}.{attemptedSources.{0,1},{field,reason}},{32,35,40}.{attemptedSources.{0,1},{expected,field,reason}},39.{attemptedSources.0,{field,reason}},{49,50,52,53,56,57,60..82,84..86,88..93,95,96,98,99,101,102,104..106,108,109,113,114,116..118,123,124,127,128,131}.{expected,field,reason},{132..255}}
```

- **growth (6 leaves):** Annual filed PP&E changes FCF endpoints, CAGR and the associated window/sensitivity descriptions; revenue and EPS definitions are unchanged.

```text
growth.fcfCagrs.{1..3}.{cagrPct,startValue}
```

- **projections (63 leaves):** Existing projection calculations read corrected historical/growth inputs, without a new forecast rule.

```text
projections.series.{2.historical.0.value.value,3.{assumptions.5,{base,bear,bull,weighted}.{0..4}.value.value,capitalReturn.netIncomeToEbit,{flatShare,shareTrend}.{base,bear,bull,weighted}.{0..4}.value.value}}
```

- **returns (3 leaves):** Admitted interest or operating/capital inputs propagate through the existing return and borrowing-cost calculations, with their dated basis.

```text
returns.wacc.{interestCoverageRatio,notes.{1,2}}
```

- **scores (29 leaves):** The unchanged scoring formulas read the corrected operands above; driver values, signal arithmetic, aspect/composite results and completeness follow those operands.

```text
scores.{aspects.{balanceSheet.{drivers.{0,1}.value,signals.{0.{{contributionPoints,raw,transformedScore},operands.{0,2}.value},1.{{contributionPoints,raw,transformedScore},operands.{1,2}.value}}},fundamentals.{drivers.3.value,score,signals.3.{{contributionPoints,fallbackReason,raw,transformedScore},operands.{0,2..4,9,10}.value}}},assessments.businessQuality.score,composite.score,factorExposure.{0,6,7}.aboveNeutralPoints}
```

- **valuation (6 leaves):** The unchanged valuation/DCF and multiple formulas read the admitted cash/cost operands and growth history; related inputs, availability, sensitivities and descriptions move together.

```text
valuation.{assumptions.{notes.10,sbc.{basis,value.{afterSbc,beforeSbc}}},multiples.multiples.3.current,notes.10}
```

### payload.txt

SHA-256 before `69f9dacf4b21c582d3cbd401865d688b0ff02a3a97694286123308224c1ab6c3`; after `02509cbd3ffe93ed4e9219c3531505e00eb0d50d90dd1ab35ddbfa0a4ed10d5a`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `4806bd919b7e84f3d2f48acdaf331c8db75a084c7518b693bf6deba84d3f767e`; after `39fc19b309976a8e0a053a94f6fcd5d8618aeb7a11037b467e148f9e94511157`.

615 changed JSON leaves, all enumerated below.

- **appendix (480 leaves):** Substitution/missing-data/provenance records carry the changed inputs, filings and compatibility stamps; ordered arrays shift after additions. Existing unknown evidence stays unknown.

```text
appendix.missingData.{{16,17,22,23,37,38,44..46,49,50,53..61,66..68,70}.{field,reason},{18..21}.{attemptedSources,expected,field,reason,severity},{24,27,28,30,31,33,34,39}.{attemptedSources.{0,1},{field,reason}},25.{attemptedSources.0,{expected,field,reason}},{26,35}.{attemptedSources.0,{field,reason}},{29,32,36}.{attemptedSources.{0,1},{expected,field,reason}},{40..43,69}.{attemptedSources,field,reason},{47,48,51,52,64,122}.{attemptedSources,expected,field,reason},{62,63,65,71..121,123..132}.{expected,field,reason},{133..256}}
```

- **balanceSheet (14 leaves):** Cash, coverage and capital descriptions read the corrected filed flow family and its qualifications; no balance-sheet stock is independently substituted by this change.

```text
balanceSheet.{capexTrajectory.{commentary.0.text,numbers.{1,3}.value},coverage.{commentary.{0,1}.text,numbers.{0,2,4,5,7..9}.value},graded.keyNumbers.{0,1}.value}
```

- **filingDisclosures (3 leaves):** Quarterly cash/FCF displays use the same admitted row as the calculations; costs/interest and field qualifications retain their exact periods.

```text
filingDisclosures.quarterlyTrend.{4,5,7}.freeCashFlow
```

- **fundamentals (16 leaves):** FCF CAGR and the resulting fundamentals grade/driver prose use the corrected annual filed PP&E history.

```text
fundamentals.{fcf.{0..4}.values.{0,1}.value.value,graded.{keyNumbers.3.value,oneLineWhy,reasoning.0.text},growthTable.2.values.{1..3}.value.value}
```

- **meta (2 leaves):** Report/payload/Stage B compatibility stamps advance; payload fingerprint and method-identity hashes identify the revised meaning. Stored-report bytes are untouched.

```text
meta.{dataCompleteness.warningCount,specVersion}
```

- **projections (63 leaves):** Existing projection calculations read corrected historical/growth inputs, without a new forecast rule.

```text
projections.series.{2.historical.0.value.value,3.{assumptions.5,{base,bear,bull,weighted}.{0..4}.value.value,capitalReturn.netIncomeToEbit,{flatShare,shareTrend}.{base,bear,bull,weighted}.{0..4}.value.value}}
```

- **scores (29 leaves):** The unchanged scoring formulas read the corrected operands above; driver values, signal arithmetic, aspect/composite results and completeness follow those operands.

```text
scores.{aspects.{balanceSheet.{drivers.{0,1}.value,signals.{0.{{contributionPoints,raw,transformedScore},operands.{0,2}.value},1.{{contributionPoints,raw,transformedScore},operands.{1,2}.value}}},fundamentals.{drivers.3.value,score,signals.3.{{contributionPoints,fallbackReason,raw,transformedScore},operands.{0,2..4,9,10}.value}}},assessments.businessQuality.score,composite.score,factorExposure.{0,6,7}.aboveNeutralPoints}
```

- **valuation (2 leaves):** The unchanged valuation/DCF and multiple formulas read the admitted cash/cost operands and growth history; related inputs, availability, sensitivities and descriptions move together.

```text
valuation.{dcf.assumptions.12.basis,multiples.3.current}
```

- **verdict (6 leaves):** The unchanged verdict presentation reads the recalculated composite and evidence qualifications.

```text
verdict.{gradeStrip.{balanceSheet.keyNumbers.{0,1}.value,fundamentals.{keyNumbers.3.value,oneLineWhy,reasoning.0.text}},synthesis}
```

### report.md

SHA-256 before `1958ba2a116a2dc65b7afef3677e1b5b3f9c570fe93a47c7a9cb809a021e9301`; after `ecb09ec8039408134c01af0ffbbfaef74ab6f72c60f64f40ae38310339f68733`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `4c2b1f0c7fc6fb25eed217827ec8027976350f43214c2c1255cc50bae586580c`; after `e89a0994d899c636e9301c498174fa80f9c08dc19a0829b2d6bb58b3c9897312`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `7e27aab690fab05c0123f0963d5b07c0fc82d469d785509693615a9236a0aa9c`; after `6852659cbb80ec3fb1dc6ed7b34444b936f946922ed36588f4382f24bc4ac662`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `c61677cf02550d91efdfe05f391952abc24e48a3f7f80a3330175e6e05b87afd`; after `ed7a8090a72072dd077a4bc9ac11a8f69408aedea3fe132254be31602845ddb0`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:b7c9e5bd"` to `"1.95.0:2d9361eb"`, approved because its version and covered deterministic content changed.

## lly-fixed-analyst

61 independently filed input corrections are listed below. Repeated aliases and dependent FCF are represented by their capex input, not counted again.

| Field | Window | Filed/admitted amount | SEC tag(s) | Filing evidence |
| --- | --- | ---: | --- | --- |
| incomeAnnual.interestExpense | 2025-01-01 to 2025-12-31 | 895000000 USD | us-gaap/InterestExpenseNonoperating | 10-K 0000059478-26-000013, filed 2026-02-12 |
| incomeAnnual.depreciationAndAmortization | 2024-01-01 to 2024-12-31 | 1766600000 USD | us-gaap/DepreciationDepletionAndAmortization | 10-K 0000059478-25-000067, filed 2025-02-19 |
| incomeAnnual.sellingGeneralAndAdministrativeExpenses | 2020-01-01 to 2020-12-31 | 6121200000 USD | us-gaap/SellingGeneralAndAdministrativeExpense | 10-K 0000059478-21-000083, filed 2021-02-17 |
| incomeAnnual.sellingGeneralAndAdministrativeExpenses | 2019-01-01 to 2019-12-31 | 6213800000 USD | us-gaap/SellingGeneralAndAdministrativeExpense | 10-K 0000059478-20-000057, filed 2020-02-19 |
| incomeQuarterly.interestExpense | 2025-10-01 to 2025-12-31 | 222600000 USD (compatible YTD difference) | us-gaap/InterestExpenseNonoperating | 10-K 0000059478-26-000013, filed 2026-02-12 + 10-Q 0000059478-25-000254, filed 2025-10-30 |
| incomeQuarterly.depreciationAndAmortization | 2025-07-01 to 2025-09-30 | 470000000 USD (compatible YTD difference) | us-gaap/DepreciationDepletionAndAmortization | 10-Q 0000059478-25-000254, filed 2025-10-30 + 10-Q 0000059478-25-000204, filed 2025-08-07 |
| incomeQuarterly.depreciationAndAmortization | 2025-04-01 to 2025-06-30 | 478500000 USD (compatible YTD difference) | us-gaap/DepreciationDepletionAndAmortization | 10-Q 0000059478-25-000204, filed 2025-08-07 + 10-Q 0000059478-25-000132, filed 2025-05-01 |
| incomeQuarterly.depreciationAndAmortization | 2025-01-01 to 2025-03-31 | 462800000 USD | us-gaap/DepreciationDepletionAndAmortization | 10-Q 0000059478-25-000132, filed 2025-05-01 |
| incomeQuarterly.researchAndDevelopmentExpenses | 2025-01-01 to 2025-03-31 | 2733700000 USD | us-gaap/ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost | 10-Q 0000059478-25-000132, filed 2025-05-01 |
| incomeQuarterly.sellingGeneralAndAdministrativeExpenses | 2024-04-01 to 2024-06-30 | 2117300000 USD | us-gaap/SellingGeneralAndAdministrativeExpense | 10-Q 0000059478-24-000187, filed 2024-08-08 |
| incomeQuarterly.sellingGeneralAndAdministrativeExpenses | 2024-01-01 to 2024-03-31 | 1952200000 USD | us-gaap/SellingGeneralAndAdministrativeExpense | 10-Q 0000059478-24-000118, filed 2024-04-30 |
| incomeQuarterly.sellingGeneralAndAdministrativeExpenses | 2023-10-01 to 2023-12-31 | 1924600000 USD (compatible YTD difference) | us-gaap/SellingGeneralAndAdministrativeExpense | 10-K 0000059478-24-000065, filed 2024-02-21 + 10-Q 0000059478-23-000284, filed 2023-11-02 |
| incomeQuarterly.sellingGeneralAndAdministrativeExpenses | 2023-07-01 to 2023-09-30 | 1803900000 USD | us-gaap/SellingGeneralAndAdministrativeExpense | 10-Q 0000059478-23-000284, filed 2023-11-02 |
| incomeQuarterly.sellingGeneralAndAdministrativeExpenses | 2023-04-01 to 2023-06-30 | 1925400000 USD | us-gaap/SellingGeneralAndAdministrativeExpense | 10-Q 0000059478-23-000221, filed 2023-08-08 |
| incomeQuarterly.sellingGeneralAndAdministrativeExpenses | 2023-01-01 to 2023-03-31 | 1749200000 USD | us-gaap/SellingGeneralAndAdministrativeExpense | 10-Q 0000059478-23-000162, filed 2023-04-27 |
| incomeQuarterly.sellingGeneralAndAdministrativeExpenses | 2022-10-01 to 2022-12-31 | 1643200000 USD (compatible YTD difference) | us-gaap/SellingGeneralAndAdministrativeExpense | 10-K 0000059478-23-000082, filed 2023-02-22 + 10-Q 0000059478-22-000250, filed 2022-11-01 |
| incomeQuarterly.sellingGeneralAndAdministrativeExpenses | 2022-07-01 to 2022-09-30 | 1614200000 USD | us-gaap/SellingGeneralAndAdministrativeExpense | 10-Q 0000059478-22-000250, filed 2022-11-01 |
| incomeQuarterly.sellingGeneralAndAdministrativeExpenses | 2022-04-01 to 2022-06-30 | 1625100000 USD | us-gaap/SellingGeneralAndAdministrativeExpense | 10-Q 0000059478-22-000196, filed 2022-08-04 |
| incomeQuarterly.sellingGeneralAndAdministrativeExpenses | 2022-01-01 to 2022-03-31 | 1557900000 USD | us-gaap/SellingGeneralAndAdministrativeExpense | 10-Q 0000059478-22-000133, filed 2022-04-29 |
| incomeQuarterly.sellingGeneralAndAdministrativeExpenses | 2021-10-01 to 2021-12-31 | 1592000000 USD (compatible YTD difference) | us-gaap/SellingGeneralAndAdministrativeExpense | 10-K 0000059478-22-000068, filed 2022-02-23 + 10-Q 0000059478-21-000216, filed 2021-10-27 |
| incomeQuarterly.sellingGeneralAndAdministrativeExpenses | 2021-07-01 to 2021-09-30 | 1577900000 USD | us-gaap/SellingGeneralAndAdministrativeExpense | 10-Q 0000059478-21-000216, filed 2021-10-27 |
| incomeQuarterly.sellingGeneralAndAdministrativeExpenses | 2021-04-01 to 2021-06-30 | 1685700000 USD | us-gaap/SellingGeneralAndAdministrativeExpense | 10-Q 0000059478-21-000171, filed 2021-08-03 |
| incomeQuarterly.sellingGeneralAndAdministrativeExpenses | 2021-01-01 to 2021-03-31 | 1576000000 USD | us-gaap/SellingGeneralAndAdministrativeExpense | 10-Q 0000059478-21-000122, filed 2021-04-30 |
| incomeQuarterly.sellingGeneralAndAdministrativeExpenses | 2020-10-01 to 2020-12-31 | 1553900000 USD (compatible YTD difference) | us-gaap/SellingGeneralAndAdministrativeExpense | 10-K 0000059478-21-000083, filed 2021-02-17 + 10-Q 0000059478-20-000155, filed 2020-10-28 |
| cashflowAnnual.incomeTaxesPaid | 2025-01-01 to 2025-12-31 | 10814000000 USD | us-gaap/IncomeTaxesPaidNet | 10-K 0000059478-26-000013, filed 2026-02-12 |
| cashflowAnnual.interestPaid | 2025-01-01 to 2025-12-31 | 633000000 USD | us-gaap/InterestPaidNet | 10-K 0000059478-26-000013, filed 2026-02-12 |
| cashflowAnnual.interestPaid | 2024-01-01 to 2024-12-31 | 577500000 USD | us-gaap/InterestPaidNet | 10-K 0000059478-25-000067, filed 2025-02-19 |
| cashflowAnnual.incomeTaxesPaid | 2022-01-01 to 2022-12-31 | 2672900000 USD | us-gaap/IncomeTaxesPaid | 10-K 0000059478-23-000082, filed 2023-02-22 |
| cashflowAnnual.interestPaid | 2022-01-01 to 2022-12-31 | 323700000 USD | us-gaap/InterestPaidNet | 10-K 0000059478-23-000082, filed 2023-02-22 |
| cashflowAnnual.capitalExpenditure | 2022-01-01 to 2022-12-31 | -1854300000 USD | us-gaap/PaymentsToAcquireOtherPropertyPlantAndEquipment | 10-K 0000059478-23-000082, filed 2023-02-22 |
| cashflowAnnual.incomeTaxesPaid | 2021-01-01 to 2021-12-31 | 1598800000 USD | us-gaap/IncomeTaxesPaid | 10-K 0000059478-22-000068, filed 2022-02-23 |
| cashflowAnnual.interestPaid | 2021-01-01 to 2021-12-31 | 338000000 USD | us-gaap/InterestPaidNet | 10-K 0000059478-22-000068, filed 2022-02-23 |
| cashflowAnnual.capitalExpenditure | 2021-01-01 to 2021-12-31 | -1309800000 USD | us-gaap/PaymentsToAcquireOtherPropertyPlantAndEquipment | 10-K 0000059478-22-000068, filed 2022-02-23 |
| cashflowAnnual.incomeTaxesPaid | 2020-01-01 to 2020-12-31 | 954600000 USD | us-gaap/IncomeTaxesPaid | 10-K 0000059478-21-000083, filed 2021-02-17 |
| cashflowAnnual.interestPaid | 2020-01-01 to 2020-12-31 | 345800000 USD | us-gaap/InterestPaidNet | 10-K 0000059478-21-000083, filed 2021-02-17 |
| cashflowAnnual.capitalExpenditure | 2020-01-01 to 2020-12-31 | -1387900000 USD | us-gaap/PaymentsToAcquireOtherPropertyPlantAndEquipment | 10-K 0000059478-21-000083, filed 2021-02-17 |
| cashflowAnnual.acquisitionsNet | 2019-01-01 to 2019-12-31 | -6917700000 USD | us-gaap/PaymentsToAcquireBusinessesNetOfCashAcquired | 10-K 0000059478-20-000057, filed 2020-02-19 |
| cashflowAnnual.incomeTaxesPaid | 2019-01-01 to 2019-12-31 | 1180500000 USD | us-gaap/IncomeTaxesPaid | 10-K 0000059478-20-000057, filed 2020-02-19 |
| cashflowAnnual.interestPaid | 2019-01-01 to 2019-12-31 | 305500000 USD | us-gaap/InterestPaidNet | 10-K 0000059478-20-000057, filed 2020-02-19 |
| cashflowAnnual.capitalExpenditure | 2019-01-01 to 2019-12-31 | -1033900000 USD | us-gaap/PaymentsToAcquireOtherPropertyPlantAndEquipment | 10-K 0000059478-20-000057, filed 2020-02-19 |
| cashflowAnnual.interestPaid | 2018-01-01 to 2018-12-31 | 223800000 USD | us-gaap/InterestPaidNet | 10-K 0000059478-19-000082, filed 2019-02-19 |
| cashflowAnnual.capitalExpenditure | 2018-01-01 to 2018-12-31 | -1210600000 USD | us-gaap/PaymentsToAcquireOtherPropertyPlantAndEquipment | 10-K 0000059478-19-000082, filed 2019-02-19 |
| cashflowAnnual.interestPaid | 2017-01-01 to 2017-12-31 | 192700000 USD | us-gaap/InterestPaidNet | 10-K 0000059478-18-000089, filed 2018-02-20 |
| cashflowAnnual.capitalExpenditure | 2017-01-01 to 2017-12-31 | -1076800000 USD | us-gaap/PaymentsToAcquireOtherPropertyPlantAndEquipment | 10-K 0000059478-18-000089, filed 2018-02-20 |
| cashflowAnnual.incomeTaxesPaid | 2016-01-01 to 2016-12-31 | 700600000 USD | us-gaap/IncomeTaxesPaid | 10-K 0000059478-17-000098, filed 2017-02-21 |
| cashflowAnnual.interestPaid | 2016-01-01 to 2016-12-31 | 146400000 USD | us-gaap/InterestPaidNet | 10-K 0000059478-17-000098, filed 2017-02-21 |
| cashflowAnnual.capitalExpenditure | 2016-01-01 to 2016-12-31 | -1037000000 USD | us-gaap/PaymentsToAcquireOtherPropertyPlantAndEquipment | 10-K 0000059478-17-000098, filed 2017-02-21 |
| cashflowQuarterly.depreciationAndAmortization | 2025-07-01 to 2025-09-30 | 470000000 USD (compatible YTD difference) | us-gaap/DepreciationDepletionAndAmortization | 10-Q 0000059478-25-000254, filed 2025-10-30 + 10-Q 0000059478-25-000204, filed 2025-08-07 |
| cashflowQuarterly.capitalExpenditure | 2025-07-01 to 2025-09-30 | -2087700000 USD (compatible YTD difference) | us-gaap/PaymentsToAcquireOtherPropertyPlantAndEquipment | 10-Q 0000059478-25-000254, filed 2025-10-30 + 10-Q 0000059478-25-000204, filed 2025-08-07 |
| cashflowQuarterly.depreciationAndAmortization | 2025-04-01 to 2025-06-30 | 478500000 USD (compatible YTD difference) | us-gaap/DepreciationDepletionAndAmortization | 10-Q 0000059478-25-000204, filed 2025-08-07 + 10-Q 0000059478-25-000132, filed 2025-05-01 |
| cashflowQuarterly.capitalExpenditure | 2025-04-01 to 2025-06-30 | -1697100000 USD (compatible YTD difference) | us-gaap/PaymentsToAcquireOtherPropertyPlantAndEquipment | 10-Q 0000059478-25-000204, filed 2025-08-07 + 10-Q 0000059478-25-000132, filed 2025-05-01 |
| cashflowQuarterly.capitalExpenditure | 2024-10-01 to 2024-12-31 | -1496000000 USD (compatible YTD difference) | us-gaap/PaymentsToAcquireOtherPropertyPlantAndEquipment | 10-K 0000059478-25-000067, filed 2025-02-19 + 10-Q 0000059478-24-000245, filed 2024-10-30 |
| cashflowQuarterly.capitalExpenditure | 2024-07-01 to 2024-09-30 | -1350700000 USD (compatible YTD difference) | us-gaap/PaymentsToAcquireOtherPropertyPlantAndEquipment | 10-Q 0000059478-24-000245, filed 2024-10-30 + 10-Q 0000059478-24-000187, filed 2024-08-08 |
| cashflowQuarterly.capitalExpenditure | 2024-04-01 to 2024-06-30 | -1224800000 USD (compatible YTD difference) | us-gaap/PaymentsToAcquireOtherPropertyPlantAndEquipment | 10-Q 0000059478-24-000187, filed 2024-08-08 + 10-Q 0000059478-24-000118, filed 2024-04-30 |
| cashflowQuarterly.capitalExpenditure | 2023-10-01 to 2023-12-31 | -1070600000 USD (compatible YTD difference) | us-gaap/PaymentsToAcquireOtherPropertyPlantAndEquipment | 10-K 0000059478-24-000065, filed 2024-02-21 + 10-Q 0000059478-23-000284, filed 2023-11-02 |
| cashflowQuarterly.capitalExpenditure | 2023-07-01 to 2023-09-30 | -970300000 USD (compatible YTD difference) | us-gaap/PaymentsToAcquireOtherPropertyPlantAndEquipment | 10-Q 0000059478-23-000284, filed 2023-11-02 + 10-Q 0000059478-23-000221, filed 2023-08-08 |
| cashflowQuarterly.capitalExpenditure | 2023-04-01 to 2023-06-30 | -738200000 USD (compatible YTD difference) | us-gaap/PaymentsToAcquireOtherPropertyPlantAndEquipment | 10-Q 0000059478-23-000221, filed 2023-08-08 + 10-Q 0000059478-23-000162, filed 2023-04-27 |
| cashflowQuarterly.capitalExpenditure | 2023-01-01 to 2023-03-31 | -668500000 USD | us-gaap/PaymentsToAcquireOtherPropertyPlantAndEquipment | 10-Q 0000059478-23-000162, filed 2023-04-27 |
| cashflowQuarterly.capitalExpenditure | 2021-07-01 to 2021-09-30 | -336800000 USD (compatible YTD difference) | us-gaap/PaymentsToAcquireProductiveAssets | 10-Q 0000059478-21-000216, filed 2021-10-27 + 10-Q 0000059478-21-000171, filed 2021-08-03 |
| cashflowQuarterly.capitalExpenditure | 2021-04-01 to 2021-06-30 | -381300000 USD (compatible YTD difference) | us-gaap/PaymentsToAcquireProductiveAssets | 10-Q 0000059478-21-000171, filed 2021-08-03 + 10-Q 0000059478-21-000122, filed 2021-04-30 |
| cashflowQuarterly.capitalExpenditure | 2021-01-01 to 2021-03-31 | -300300000 USD | us-gaap/PaymentsToAcquireProductiveAssets | 10-Q 0000059478-21-000122, filed 2021-04-30 |

### stageB.json

SHA-256 before `1e45f11f6a39257b63f83a4e053cf6bb263046763b7f888c468aab96ca23ffbe`; after `30ea3991b9898a43a9fb739f5b0489f5a4446658e2ae8630ff802f22f00d2081`.

617 changed JSON leaves, all enumerated below.

- **capital (29 leaves):** Admitted capex, D&A, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.{capexIntensity.{series.{0,1}.{capex,capexToDA,capexToRevenuePct},slopePctPtsPerYear},current.{cashBridge.{afterSbcStandardizedFcf,cashCapitalExpenditure,definition,standardizedFcf},{fcfBeforeSbc,fcfConversionBeforeSbc,interestExpense,sbcPctOfFcf},filedCashFlows.capitalExpenditure},fcf.series.{0,1}.{fcf,fcfBeforeSbc,fcfConversion,fcfConversionBeforeSbc,note},interestCoverage.{interestExpense,value},maintenanceVsGrowthCapex.capexToDA5yAvg}
```

- **gaps (481 leaves):** New filed substitutions and missing-compatible-counterpart disclosures are added; recovered typed value-only conflicts retire only their own old refusal. Array positions shift after insertion.

```text
gaps.{{14,15,27,29,43..45,121}.{attemptedSources,field,reason},{16,22,25,41,48,51,54,55,58,59,83,87,94,97,100,103,107,110..112,115,122,125,126,129,130}.{field,reason},17.{field,reason,severity},{18..20}.{attemptedSources,expected,field,reason,severity},{21,23,28,34,46,47,119,120}.{attemptedSources,expected,field,reason},24.{attemptedSources.0,{expected,field,reason}},{26,30,31,33,36..38,42}.{attemptedSources.{0,1},{field,reason}},{32,35,40}.{attemptedSources.{0,1},{expected,field,reason}},39.{attemptedSources.0,{field,reason}},{49,50,52,53,56,57,60..82,84..86,88..93,95,96,98,99,101,102,104..106,108,109,113,114,116..118,123,124,127,128,131}.{expected,field,reason},{132..255}}
```

- **growth (6 leaves):** Annual filed PP&E changes FCF endpoints, CAGR and the associated window/sensitivity descriptions; revenue and EPS definitions are unchanged.

```text
growth.fcfCagrs.{1..3}.{cagrPct,startValue}
```

- **projections (63 leaves):** Existing projection calculations read corrected historical/growth inputs, without a new forecast rule.

```text
projections.series.{2.historical.0.value.value,3.{assumptions.5,{base,bear,bull,weighted}.{0..4}.value.value,capitalReturn.netIncomeToEbit,{flatShare,shareTrend}.{base,bear,bull,weighted}.{0..4}.value.value}}
```

- **returns (3 leaves):** Admitted interest or operating/capital inputs propagate through the existing return and borrowing-cost calculations, with their dated basis.

```text
returns.wacc.{interestCoverageRatio,notes.{1,2}}
```

- **scores (29 leaves):** The unchanged scoring formulas read the corrected operands above; driver values, signal arithmetic, aspect/composite results and completeness follow those operands.

```text
scores.{aspects.{balanceSheet.{drivers.{0,1}.value,signals.{0.{{contributionPoints,raw,transformedScore},operands.{0,2}.value},1.{{contributionPoints,raw,transformedScore},operands.{1,2}.value}}},fundamentals.{drivers.3.value,score,signals.3.{{contributionPoints,fallbackReason,raw,transformedScore},operands.{0,2..4,9,10}.value}}},assessments.businessQuality.score,composite.score,factorExposure.{0,6,7}.aboveNeutralPoints}
```

- **valuation (6 leaves):** The unchanged valuation/DCF and multiple formulas read the admitted cash/cost operands and growth history; related inputs, availability, sensitivities and descriptions move together.

```text
valuation.{assumptions.{notes.10,sbc.{basis,value.{afterSbc,beforeSbc}}},multiples.multiples.3.current,notes.10}
```

### payload.txt

SHA-256 before `69f9dacf4b21c582d3cbd401865d688b0ff02a3a97694286123308224c1ab6c3`; after `02509cbd3ffe93ed4e9219c3531505e00eb0d50d90dd1ab35ddbfa0a4ed10d5a`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `d75787e1eff32fd770febb336fe5d1e50c0060c3747c9343bdad34b5e3b26ee7`; after `d0802ce370d83e5442f86251c5e53a7f250625314fd41a2ae9bfc2b58256581e`.

837 changed JSON leaves, all enumerated below.

- **appendix (690 leaves):** Substitution/missing-data/provenance records carry the changed inputs, filings and compatibility stamps; ordered arrays shift after additions. Existing unknown evidence stays unknown.

```text
appendix.{consistencyChecks.unit.{checked,passed},missingData.{{15,16,28,29,39,44,54..56,132}.{attemptedSources,field,reason},{17,23,26,52,59,62,65,66,69,70,94,98,105,108,111,114,118,121..123,126,133,136,137,140,141}.{field,reason},18.{field,reason,severity},{19..21}.{attemptedSources,expected,field,reason,severity},{22,24,57,58,130,131}.{attemptedSources,expected,field,reason},{25,31,38,49}.{attemptedSources.0,{expected,field,reason}},{27,43,45,47,48,53}.{attemptedSources.{0,1},{field,reason}},{30,33..37,50}.{attemptedSources.0,{field,reason}},{32,40..42,46,51}.{attemptedSources.{0,1},{expected,field,reason}},{60,61,63,64,67,68,71..93,95..97,99..104,106,107,109,110,112,113,115..117,119,120,124,125,127..129,134,135,138,139,142}.{expected,field,reason},{143..266}},provenanceCoverage.{factualValidation.{contradicted,rate,validated},numeric.{rate,supported}},verificationLog.{{2,6,24,32,38,74,75,80,82,83,89,101,103,116,118,123}.{note,outcome,reason,traceKind,validationStatus},107.{claim,note},{108,110..112,196,201,202,257,285..344,499,1070,1077,1092}.claim,{346,448}.{claimSupportStatus,note,numericSupportStatus,reason,traceKind,validationStatus}},verificationRate}
```

- **balanceSheet (18 leaves):** Cash, coverage and capital descriptions read the corrected filed flow family and its qualifications; no balance-sheet stock is independently substituted by this change.

```text
balanceSheet.{capexTrajectory.numbers.{3,5}.{verificationNote,verified},coverage.{commentary.7.text,numbers.{{0,2}.{verificationNote,verified},6.{period,periodContext,value},{7,9..11}.value}},graded.keyNumbers.3.{verificationNote,verified}}
```

- **filingDisclosures (3 leaves):** Quarterly cash/FCF displays use the same admitted row as the calculations; costs/interest and field qualifications retain their exact periods.

```text
filingDisclosures.quarterlyTrend.{4,5,7}.freeCashFlow
```

- **fundamentals (14 leaves):** FCF CAGR and the resulting fundamentals grade/driver prose use the corrected annual filed PP&E history.

```text
fundamentals.{fcf.{0.values.{3,4}.value.{verificationNote,verified},1.values.4.value.{verificationNote,verified},2.values.{1,2}.value.{verificationNote,verified}},graded.keyNumbers.{0,6}.{verificationNote,verified}}
```

- **meta (10 leaves):** Report/payload/Stage B compatibility stamps advance; payload fingerprint and method-identity hashes identify the revised meaning. Stored-report bytes are untouched.

```text
meta.{consistencyChecks.unit.{checked,passed},dataCompleteness.warningCount,provenanceCoverage.{factualValidation.{contradicted,rate,validated},numeric.{rate,supported}},{specVersion,verificationRate}}
```

- **projections (63 leaves):** Existing projection calculations read corrected historical/growth inputs, without a new forecast rule.

```text
projections.series.{2.historical.0.value.value,3.{assumptions.5,{base,bear,bull,weighted}.{0..4}.value.value,capitalReturn.netIncomeToEbit,{flatShare,shareTrend}.{base,bear,bull,weighted}.{0..4}.value.value}}
```

- **scores (29 leaves):** The unchanged scoring formulas read the corrected operands above; driver values, signal arithmetic, aspect/composite results and completeness follow those operands.

```text
scores.{aspects.{balanceSheet.{drivers.{0,1}.value,signals.{0.{{contributionPoints,raw,transformedScore},operands.{0,2}.value},1.{{contributionPoints,raw,transformedScore},operands.{1,2}.value}}},fundamentals.{drivers.3.value,score,signals.3.{{contributionPoints,fallbackReason,raw,transformedScore},operands.{0,2..4,9,10}.value}}},assessments.businessQuality.score,composite.score,factorExposure.{0,6,7}.aboveNeutralPoints}
```

- **valuation (4 leaves):** The unchanged valuation/DCF and multiple formulas read the admitted cash/cost operands and growth history; related inputs, availability, sensitivities and descriptions move together.

```text
valuation.{dcf.assumptions.12.basis,graded.keyNumbers.3.{verificationNote,verified},multiples.3.current}
```

- **verdict (6 leaves):** The unchanged verdict presentation reads the recalculated composite and evidence qualifications.

```text
verdict.gradeStrip.{balanceSheet.keyNumbers.2.{verificationNote,verified},fundamentals.keyNumbers.0.{verificationNote,verified},valuation.keyNumbers.1.{verificationNote,verified}}
```

### report.md

SHA-256 before `55665fe5f088ea310aa13a99badd7f6806a17a50c6bccf3fc2495f181a6b42e4`; after `cbf8a33ce671d0c3a776e4fd1ef1bd479c401954739a92abe7fd2968f99e76be`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `5b5c09546bb4840237a9f0236f28b64f346e4219feb7b6f921e2fceaffdcfeb2`; after `5a99f00ecc96af1bb59db2e6f04f9e3a95cdcddf84d8ac9e7cda6eec733fb74a`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `d70eedde9a048c23cee2120fdc6b233af18c65ac2015a87a06d19eae3c83acf7`; after `d087bd9966059bf60789f19960a726a43fd25dcb8dd5b740c2365076c99f9c69`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `630143f236b64c7fa323dfcff42d013a612df75dd5803b8e6bfe14b2b0f0b132`; after `80e24990c9301374d139be84f136bf29b95743f924b4f334f5ebfa319e40b0e4`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:b7c9e5bd"` to `"1.95.0:2d9361eb"`, approved because its version and covered deterministic content changed.
