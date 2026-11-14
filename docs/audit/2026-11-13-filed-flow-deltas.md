# D-262 approved offline replay changes

Baseline: main `cf3eb287`. Current output includes the normal merge of main 742d4d2f: D-263 adds affirmative EBITDA/cash-flow producer metadata and rechecks prose. Those inherited verification/metadata leaves are included below. Both runs use identical frozen local inputs and Node 24, with the harness network blocked. No model or paid provider is called. This record lists filed input corrections, their propagated report changes, and every differing JSON leaf. Original vendor rows and report exports are not reproduced.

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

SHA-256 before `9381e9cafc27f42b7f7a6c4048bc887e0dd19aea32962a8bbffc3e5e6ab459c4`; after `723cd62dc1ffc529e21395c14536b2b5ebbbf490329b8413fa755b8f2e286d55`.

308 changed JSON leaves, all enumerated below.

- **capital (3 leaves):** Statement-specific D&A, admitted capex, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.{current.{cashBridge.definition,ebitdaComputed},netDebtToEbitda.ebitdaComputed}
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

SHA-256 before `2dbcf2787731fe38a3bada47664855d48c17012430236b85a2eeb5f247bbe7c2`; after `66d46bfc1335b7b440bb94cdf0e5e276189b9a6590b5e2d1ba3caa581e3e72c8`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `cb8a4884af74bf8643841a341761d6c772d80fdec65e8f41351bb6455dac0248`; after `f438146ec8abb9dd7647d5eb816a45cb646c0ca6d7e161e44030a5cd1e4a62e7`.

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

SHA-256 before `818a87ecd255fcbf019cc2bd50c65d8822fad04323662c240f39a981cf2a028b`; after `3ac10a77a68e305e2e346943e6d9a07866784bd9a859cce4239380af0ec48485`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `8008e09ee39a70245dbbed0bc8be4cafa37d29ade0c7b48814e7e6294293b5be`; after `58be484a86f7845b68215fbfc39542c2a514fd13a26dd2ff235bd671fa142fa5`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `fe75285733330a2451dbfde4c9d5e1dbe5eae93047328a2d8a41127e0d228a35`; after `3ac4aaf78f4dbdd25557085dc1e31974e8d085534aa7b687a847891af8aa17e3`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `9d63c422d74a7003ff5d365b924984d44048f07c37f5fffec255b9ab657333cf`; after `445d1d600395592be60c57a6bf256ad3188d6ce7e3160820ae797f8421b6e787`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:d3a902a8"` to `"1.95.0:8ca6b713"`, approved because its version and covered deterministic content changed.

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

SHA-256 before `e4e38961697bd6e4fb7541e06e9e7cf9f765b686131e7780d076873ce8ed2e9d`; after `030e39786cd6529167c8914446ab978218ff6d7cd739e7d3b9b55a04cd7b0f17`.

252 changed JSON leaves, all enumerated below.

- **capital (1 leaves):** Statement-specific D&A, admitted capex, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.netDebtToEbitda.ebitdaComputed
```

- **gaps (251 leaves):** New filed substitutions and missing-compatible-counterpart disclosures are added; recovered typed value-only conflicts retire only their own old refusal. Array positions shift after insertion.

```text
gaps.{{27..29,51,64..66,70..72,79..81,90,91}.{field,reason},{30,34,35}.{attemptedSources,field,reason,severity},31.{attemptedSources,expected,field,reason,severity},{32,33}.{field,reason,severity},36.{attemptedSources.{0..2},{expected,field,reason}},37.{attemptedSources.{0..2},{field,reason}},{38,44,58..60,82..84}.{attemptedSources,field,reason},{39,42,43,45..50,52,53,57,61..63,87}.{attemptedSources,expected,field,reason},{40,41}.{attemptedSources.0,{expected,field,reason}},{54..56}.{attemptedSources.{0,1},{field,reason}},{67..69,73..78,85,86,88,89}.{expected,field,reason},{92..131}}
```

### payload.txt

SHA-256 before `ed8afe3ddc9d99a22ff24526ec4b2fe28be8a08cb09c421e6a2ef70587a598b7`; after `e8a3ceee3b8de0342859126ce341186815c61b3c74d563d057115195a6d5d198`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `802a33ed6447a242d8e56f788c0dbba742ce423adfd91e10eeb9e3d679f971ce`; after `794fc811a2cd61a46e21c9f86754ae71406e3d333e5d6d2de1ea5e716273f22d`.

254 changed JSON leaves, all enumerated below.

- **appendix (251 leaves):** Substitution/missing-data/provenance records carry the changed inputs, filings and compatibility stamps; ordered arrays shift after additions. Existing unknown evidence stays unknown.

```text
appendix.missingData.{{30..32,57,58,61,67,70..72,76..78,85..87}.{field,reason},{33..35,37,38}.{attemptedSources,expected,field,reason,severity},36.{attemptedSources,field,reason,severity},{39,40}.{attemptedSources.{0..2},{field,reason}},{41,46..48}.{attemptedSources.{0,1},{field,reason}},42.{attemptedSources.{0,1},{expected,field,reason}},{43..45,49}.{attemptedSources.0,{field,reason}},{50,53,54}.{attemptedSources.0,{expected,field,reason}},{51,52,55,62,63,68,69,90}.{attemptedSources,expected,field,reason},{56,59,60}.{attemptedSources,field,reason},{64..66,73..75,79..84,88,89,91..94}.{expected,field,reason},{95..134}}
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

SHA-256 before `d595dbbba285e6b4cab71e530f0dbbf1cca8106a95b10bfc9021760158ca5fc4`; after `1df220a189870505c5e690b1cf8de4135d38bdca2cf65b6cded9ffa9975d5468`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `af1525136f250637f4053c6b025d686fa69ef1184ada07251b9dd64221bbe6c9`; after `918582fd647e06479be784eec71507fec5b3a5b5a2c1380688fd346c3a463785`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `5e6a67d3b772385379a245cbd2c459808edd03439352b897e78f8aeae8b1f6e5`; after `b4e0b99462d2c69fb9da87d11fd4c02483e07e71e8d968cd16fb5ab745742132`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `d8bd6f95d36424fe16d2860fd343602d635db1e39b52e7c19ade255399e39c8d`; after `18b5e7301567b0961a5cd8ecc0f2501f0c8c051de8067bbe25a01cdb947ba0ee`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:82cd4ed7"` to `"1.95.0:87d8b61d"`, approved because its version and covered deterministic content changed.

## meta-data-only

4 independently filed input corrections are listed below. Repeated aliases and dependent FCF are represented by their capex input, not counted again.

| Field | Window | Filed/admitted amount | SEC tag(s) | Filing evidence |
| --- | --- | ---: | --- | --- |
| incomeQuarterly.interestExpense | 2026-04-01 to 2026-06-30 | 754000000 USD | us-gaap/InterestExpenseDebt | 10-Q 0001628280-26-050705, filed 2026-07-30 |
| cashflowAnnual.interestPaid | 2025-01-01 to 2025-12-31 | 696000000 USD | us-gaap/InterestPaidNet | 10-K 0001628280-26-003942, filed 2026-01-29 |
| cashflowQuarterly.commonDividendsPaid | 2025-10-01 to 2025-12-31 | -1328000000 USD | us-gaap/PaymentsOfDividendsCommonStock | 10-K 0001628280-26-003942, filed 2026-01-29 |
| cashflowQuarterly.commonDividendsPaid | 2025-07-01 to 2025-09-30 | -1323000000 USD | us-gaap/PaymentsOfDividendsCommonStock | 10-Q 0001628280-25-047240, filed 2025-10-30 |

### stageB.json

SHA-256 before `ebfb1046771b5640b383fc795c0741adb0ca38241b7a92acf9a40dc827f0adab`; after `56952c4238fc112230dbf4cb0b8babea2f694e36d9f0596fef572fb1a74549fb`.

413 changed JSON leaves, all enumerated below.

- **capital (5 leaves):** Statement-specific D&A, admitted capex, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.{current.{cashBridge.definition,{ebitdaComputed,interestCoverage,interestExpense}},netDebtToEbitda.ebitdaComputed}
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

SHA-256 before `850c3ea8c7f9e939f13d4507229f8fc88d4eea7bcf1779529565bf750073dc38`; after `d7d25435d8e0dc86a4e6c81494944ed91db650afbba7377d973f56f6b8178135`.

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

SHA-256 before `663f92764de714722e6f8398807b7cc8e78e7715df61ce5f76ffa0c434a372bf`; after `bd2e966d17be0716640ea00b4015bb3c9ed41918d1206a228fe8e71f9c2760cf`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `13e70700c8f89586ca188a880613fe11585aff2e6f69cf946d377ca9cab65555`; after `0aa781a12031815fd020d2707420a302f84102a48b57b6340e4538b111d91767`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `99fa29d6435dafc1bfda9e2874ed5c410986c7b8532221b3cf62f9c9b322d936`; after `0aebf7112d3c3d3c660dd9e4340ca7c9ed3f80bba16f0db7c2abaf2ca39ef9e4`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `07257d30b6c467d04db09f932a83e94c8ac03ea810aa9141ddde03fe32264430`; after `9957b8145de220111330f649c7d63b7216c0f8d2f6b7e3bc574f43f703956e52`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:0ff64fb6"` to `"1.95.0:3bbee120"`, approved because its version and covered deterministic content changed.

## mu-data-only

No scalar input correction: only the revised definition, compatibility identifiers and explicit unverified-coverage disclosures change.

| Field | Window | Filed/admitted amount | SEC tag(s) | Filing evidence |
| --- | --- | ---: | --- | --- |

### stageB.json

SHA-256 before `221c0a467a91e1522bdce283b855072801ae97ddd1061ea42d148fc3c34fbae9`; after `afa75afeed094b61b2e309998ee6b2e7e75ee80d488fae68b954653f3964bb6b`.

3 changed JSON leaves, all enumerated below.

- **capital (3 leaves):** Statement-specific D&A, admitted capex, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.{current.{cashBridge.definition,ebitdaComputed},netDebtToEbitda.ebitdaComputed}
```

### payload.txt

SHA-256 before `53df00250317a2a31da0ac982654047e5981407bff273bb0c03cb4c9476fc50a`; after `505593efc9310d50fca7157d3259553eece4a92e649278b9b16a0510f307fa4d`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `b0e28b9b520a56476caf612331073c1fbb0d4b74e12e5a73232b310161c95ec0`; after `c0f4940a603b763a5e72a8f0aee4f66ad4aa9c9040e60fd41bd117204a57c4be`.

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

SHA-256 before `12437439152797de8848c6db7dca8037106d99494564c139697c509aea03809b`; after `f73028cdafed3aab2e9f2ab692337e465573b89a63c0ae79a1c956d055aca579`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `8b24306478846c0b6cb498dc16652295eec851936a2809b75d4750528240afc1`; after `95bf44e0bf9271ccac8f1cf330148cbd813e06ba56e4e02fff6449377ec99b39`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `2ec772ef496d4b10a917e11d1bcfa234284d5c094440b6ef595e0263772f0a97`; after `d0661c1c29ca4dbbecff239139dbe253baf55e5f6ca736c6bf0660f96e206067`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `9aa87a104010828199f13cdf3aefd73848835b98c33098e12d47be3378966500`; after `232b640bb970d922fb5c8d3af190d564c697a7aaa2f13cacc2eab8fe101fd052`.

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

SHA-256 before `b4f6677ad08d828bc353afaf4bbe835a42154e54dea708fc178316c14f37e553`; after `114392a1568693b0ddb71bb380afe2c383f3428f108e1dd812e3185b276ba93b`.

182 changed JSON leaves, all enumerated below.

- **capital (3 leaves):** Statement-specific D&A, admitted capex, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.{current.{cashBridge.definition,ebitdaComputed},netDebtToEbitda.ebitdaComputed}
```

- **gaps (179 leaves):** New filed substitutions and missing-compatible-counterpart disclosures are added; recovered typed value-only conflicts retire only their own old refusal. Array positions shift after insertion.

```text
gaps.{{51..61}.{field,reason},{62..89,91,92}.{expected,field,reason},90.{attemptedSources,expected,field,reason},{93..155}}
```

### payload.txt

SHA-256 before `c4abe6679d23ad37e37f446db0418e80d211224167956131f42ed774e1ad9e3e`; after `1e79cd34cb89b9151f44113f5213e0eb0d66696d33b2b68cdfaabb8fa70fc42a`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `d067ae4092241a52825e12a18f73f6a246fe941cb816321044b06cafca6d6f2a`; after `079437b2f29edc749b74865daa3e1a92c691991f2da7108546c05763ada02214`.

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

SHA-256 before `bee69308c1a5eb7d4073ef7adbd6e68c45aa9f7db9a91f0246665df2d1b58f28`; after `29c3ffc885d161aa6480164a63423b644a5b77b767bc756f39d6f69bbd4d5148`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `762cf1a6cd0f25ae046021e372758debe8484d04b920cd231f70022093d9b923`; after `8388012a91e6f11701a1f10f2e63da8e646d731cc63610e4196d063b085f3427`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `43ac6827d0b3f55f2111d5263e4161870869e695fb67a2c794ab613df3cdf96c`; after `462efc746ee0fdb4838838d20edf495bc7c118f103e7d3f58b69b9a7eecf785b`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `3de91090bd801df2d2ea0ac73be4f88aa4617b3794f4637616864f740284d45e`; after `26e9b8c80136f3032d6bf47c556b5c5d5616d247ba2b144fb98f3d70a8422ef5`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:182abc3c"` to `"1.95.0:c67bcb33"`, approved because its version and covered deterministic content changed.

## qcom-data-only

2 independently filed input corrections are listed below. Repeated aliases and dependent FCF are represented by their capex input, not counted again.

| Field | Window | Filed/admitted amount | SEC tag(s) | Filing evidence |
| --- | --- | ---: | --- | --- |
| cashflowAnnual.incomeTaxesPaid | 2024-09-30 to 2025-09-28 | 3100000000 USD | us-gaap/IncomeTaxesPaidNet | 10-K 0000804328-25-000085, filed 2025-11-05 |
| cashflowAnnual.incomeTaxesPaid | 2017-09-25 to 2018-09-30 | 877000000 USD | us-gaap/IncomeTaxesPaidNet | 10-K 0001728949-18-000095, filed 2018-11-07 |

### stageB.json

SHA-256 before `b07eb9aea95833b278f0f0f21bd503c5385c7dcaf923f3378e2488b00b11193e`; after `8f236c3eaae060a33da7491a204cbc888e1931741d8ee8421779b7aa79630f1c`.

284 changed JSON leaves, all enumerated below.

- **capital (3 leaves):** Statement-specific D&A, admitted capex, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.{current.{cashBridge.definition,ebitdaComputed},netDebtToEbitda.ebitdaComputed}
```

- **gaps (281 leaves):** New filed substitutions and missing-compatible-counterpart disclosures are added; recovered typed value-only conflicts retire only their own old refusal. Array positions shift after insertion.

```text
gaps.{{9,11,12}.{field,reason,severity},{10,13,14,16}.{attemptedSources,expected,field,reason,severity},15.{attemptedSources,field,reason,severity},{17,42,59}.{field,reason},{18..20,25,34,36,64}.{attemptedSources,expected,field,reason},{21,22,24,27..29}.{attemptedSources.{0,1},{field,reason}},23.{attemptedSources.{0,1},{expected,field,reason}},{26,31..33,35,37,38}.{attemptedSources,field,reason},30.{attemptedSources.{0..2},{field,reason}},{39..41,43..58,60..63,65..72}.{expected,field,reason},{73..138}}
```

### payload.txt

SHA-256 before `da45b2de65b722a5998f24b19f62c2825588b591eb2c03c3475a55e8e9e082c5`; after `07a8f75aaf1ee91a8db2e8c48646335c1162979cfaa898aa902a2d77154d20b8`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `fd43370aa275b8076006392653c1c6aac3b70dc695cb832ef12e452e116a08bf`; after `db046224584b0732808f90e3a16dc9ee4dc492d3186c9dcd720825e984e41f49`.

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

SHA-256 before `b18066345c106fd5008de7cd9083fce93b6b94f6b51a73228f7086e832ad3acc`; after `24afd51c35c4d96e324aa0b05f80ee33009a5085072761bfcd1f9c4c7bbbdb4a`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `4622245c6e29b02991946348fedd6e8b3258fcf0001f111c9f9dff34a4a47540`; after `019190ee9845852641329cb48f829e4735c4ed8c9a6954dd04a929e648a75e2b`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `a6af831984ba65e641d70648e63c86e9ebb793fc466f704adf40da0b4833f625`; after `a0772171c86d96ae7b045a06e0d4d5401bb36844862f4557bdff2440af2d3d2a`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `7182ecb944de754759d63341b67ae604485bc8904a75b76bfada4e6a6481fe36`; after `fc097fa6ae3daf1194e4a2d8e5cb0a20c9b8ba29fe79901d8e06712b5e6a1c0f`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:75d7d0b1"` to `"1.95.0:cd106f11"`, approved because its version and covered deterministic content changed.

## jpm-data-only

43 independently filed input corrections are listed below. Repeated aliases and dependent FCF are represented by their capex input, not counted again.

| Field | Window | Filed/admitted amount | SEC tag(s) | Filing evidence |
| --- | --- | ---: | --- | --- |
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

SHA-256 before `49546bede47877232cf872d54a23e2a66c0c36287cdcc07490fa9c6138ae6a6d`; after `a619248653c1ecf5000fe58ce55f3938bf63e9e3313630a58a130e951b0e07ec`.

412 changed JSON leaves, all enumerated below.

- **capital (14 leaves):** Statement-specific D&A, admitted capex, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.{buybackPriceAnalysis.{{avgPricePaidProxy,note,premiumDiscountPct,totalRepurchased},years.{{1,3}.{repurchased,sharesProxy},4}},gaps.{0,1},notes.3,sbc.{latest,pctOfRevenue}}
```

- **fairValue (2 leaves):** Existing fair-value aggregation reads the recalculated valuation outputs and their qualifications.

```text
fairValue.{perShare.value,upsidePct}
```

- **gaps (332 leaves):** New filed substitutions and missing-compatible-counterpart disclosures are added; recovered typed value-only conflicts retire only their own old refusal. Array positions shift after insertion.

```text
gaps.{{0,6..8,16,31,40,42,66,67,76..78}.{attemptedSources,field,reason},{1,24}.{attemptedSources.{0,1},{expected,field,reason}},{2..4}.{attemptedSources.0,field},{5,18,32,37..39,41,79}.{attemptedSources,expected,field,reason},{9..12,19..21,23,33..36,43..65,68..75}.{field,reason},{13..15}.field,17.{attemptedSources,expected,field,reason,severity},{22,25}.{attemptedSources.0,{expected,field,reason}},{26,30}.{attemptedSources.{0..3},{expected,field,reason}},27.{attemptedSources.{0..2},{field,reason}},28.{attemptedSources.{0..3},{field,reason}},29.{attemptedSources.{0..4},{field,reason}},{80..86}.{expected,field,reason},{87..176}}
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

SHA-256 before `73db1a5485b3824dd242eb81deabfac76a84434a6547363635696337d16eb8ea`; after `147b44fd072b6770498f2ec9f26f39e6ddd72ab565eb8f0cb4ccc18ca88605a8`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `0d523607ba91c7f861dc21fa862a17d9027eb554ccc9006b1d8eb321df98cebf`; after `4d0e638af4c711aee582d9100585d6fc744a6e792efdd66774f06b5c769237b4`.

317 changed JSON leaves, all enumerated below.

- **appendix (252 leaves):** Substitution/missing-data/provenance records carry the changed inputs, filings and compatibility stamps; ordered arrays shift after additions. Existing unknown evidence stays unknown.

```text
appendix.missingData.{{16..18,20..24,30,32..55,57..60,63,64,66,67}.{field,reason},19.{attemptedSources,expected,field,reason,severity},{25,29,31}.{attemptedSources.{0,1},{field,reason}},26.{attemptedSources.{0,1},{expected,field,reason}},27.{attemptedSources.{0..3},{field,reason}},28.{attemptedSources.{0..3},{expected,field,reason}},{56,61,62,80,81}.{attemptedSources,field,reason},{65,83..89}.{expected,field,reason},82.{attemptedSources,expected,field,reason},{90..181}}
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

SHA-256 before `f2bcb3bcfa5cfc09300413b3054ced95b47ec5e571e3c44eabf88f27f2918d6e`; after `c025a6b9f469a8db3191cda798159afac80f5bd8799faef51bbbf465e4d8a384`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `d92b2007537e0f4c9725bde3f38e20377670880fb8a51cd1a52b599c33756113`; after `2af34b1386c87a5cddee649447c1ac4c3afd81abbbdfca16d51cd7db2322be46`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `435fe88648a29242dffc5f535e6c8518984db815262a990566b040a63be3ac12`; after `14c9da8878d76ba5f7c605312ac652842a5cb7d305d183168d9d438b6c2058a1`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `da7257f76683ad4921be70a480d90da49122b24ff4300d8410b43e1f3095127a`; after `6555085d29d6819c1d3296776a42b2bfd35969a7f8499f2344e3938e96d8a422`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:c7a70366"` to `"1.95.0:9bec9651"`, approved because its version and covered deterministic content changed.

## pgr-data-only

48 independently filed input corrections are listed below. Repeated aliases and dependent FCF are represented by their capex input, not counted again.

| Field | Window | Filed/admitted amount | SEC tag(s) | Filing evidence |
| --- | --- | ---: | --- | --- |
| incomeAnnual.interestExpense | 2023-01-01 to 2023-12-31 | 268400000 USD | us-gaap/InterestExpenseDebt | 10-K 0000080661-24-000007, filed 2024-02-26 |
| incomeAnnual.interestExpense | 2022-01-01 to 2022-12-31 | 243500000 USD | us-gaap/InterestExpenseDebt | 10-K 0000080661-23-000006, filed 2023-02-27 |
| incomeQuarterly.interestExpense | 2024-01-01 to 2024-03-31 | 69600000 USD | us-gaap/InterestExpenseDebt | 10-Q 0000080661-24-000018, filed 2024-05-06 |
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

SHA-256 before `1309bf4776f51e0431d2fee7084f4660242f59998cedbb3ecbd5ee53a1371d42`; after `365672a8c791fb6144af969eb4b17caf2cd1a62cda5563862973267d6e8d1150`.

597 changed JSON leaves, all enumerated below.

- **gaps (597 leaves):** New filed substitutions and missing-compatible-counterpart disclosures are added; recovered typed value-only conflicts retire only their own old refusal. Array positions shift after insertion.

```text
gaps.{{35,38..45,47..50,60..63,65..68,73..78,80..84,86..99,103,107..109,113,117,121,134,138,139,146,159,163,167,175..177,181,183,188,189,193,194,197,198,200,202,203,212,214..216}.{field,reason},{36,37,52,72,85,205,210,211}.{attemptedSources,field,reason},46.{attemptedSources,expected,field,reason,severity},{51,59,64,70,206..209}.{attemptedSources,expected,field,reason},53.{attemptedSources.0,{expected,field,reason}},{54,56,69}.{attemptedSources.{0,1},{field,reason}},{55,57}.{attemptedSources.{0,1},{expected,field,reason}},58.{attemptedSources.0,{field,reason}},{71,100..102,104..106,110..112,114..116,118..120,122..133,135..137,140..145,147..158,160..162,164..166,168..174,178,179,184..187,190..192,195,196,199,201,204,213,217,218}.{expected,field,reason},79.{attemptedSources.{0..4},{field,reason}},{180,182}.field,{219..323}}
```

### payload.txt

SHA-256 before `cbde47425e35a188b1ffa0204eebb84cf5e04c375bafc7dab84fecf91f250b32`; after `35efbfff53a22dadc01e0b50faebccb21ce088a8acb135700cb0bd66a624b5df`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `36b6896b51f3d7b7856f3a11fa9344e961117f5918814a7668b5ea74218b01e0`; after `687220acff8d0910f46cd029698d7be0380f4cc8ddf15140e0ceaf92ce95ff52`.

558 changed JSON leaves, all enumerated below.

- **appendix (555 leaves):** Substitution/missing-data/provenance records carry the changed inputs, filings and compatibility stamps; ordered arrays shift after additions. Existing unknown evidence stays unknown.

```text
appendix.missingData.{{47,49..53,59..62,65..70,111,113..123,126,130..134,137..141,143..156}.{field,reason},48.{attemptedSources,expected,field,reason,severity},{54,58,63,128}.{attemptedSources.{0,1},{field,reason}},{55,110}.{attemptedSources.{0,1},{expected,field,reason}},56.{attemptedSources.0,{expected,field,reason}},{57,64,108,109}.{attemptedSources.0,{field,reason}},{71,107,112,215}.{attemptedSources,expected,field,reason},{72..79,87,88,92..97,124,135,157..213,216..222}.{expected,field,reason},{80..86,89..91,98..106,125}.field,{127,129,136,142,214}.{attemptedSources,field,reason},{223..327}}
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

SHA-256 before `cfb77c3fd7a14137bddc8bafffe9c253e4fbbcdbe31c60a98e92426aacd24686`; after `5188b67547af6eb6c1217d7008467224d1f2474ef905297b826a64a8befe3963`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `391bc1fb1ec64ca1fd6a66978504ed95fa7f818345d275099fcd48a87870ea57`; after `5f15f92d67679f69de54fe63056e96206543c9f38e7c85636016bd4f763ca877`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `52815cf86c1eaa967a36fea0695362564bd47dea579de91b2ed46b817fbc4fc7`; after `b09471f0f671aa4972802e61e6ac862f350ed5255b03eff28e660063e5e045b8`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `985d244ad9341a8aa69c99d33c1d1840f8372cd290253c000cd6abe4c1f5f759`; after `7a563663be25075407da2a6299137fd88d0bdb7cb1a2597bbfc223d9ace3efda`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:6bb0b997"` to `"1.95.0:981e58d9"`, approved because its version and covered deterministic content changed.

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

SHA-256 before `f80f5c46ce634b53cabf79ea1db26768623f33505408b1cc5a594d0857672021`; after `7da29aee6b524525074cb86a41201ce2d669b6f2c9b0832f25730774b0876b04`.

748 changed JSON leaves, all enumerated below.

- **capital (5 leaves):** Statement-specific D&A, admitted capex, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.{current.{cashBridge.definition,interestExpense},interestCoverage.{interestExpense,value},netDebtToEbitda.ebitdaComputed}
```

- **gaps (721 leaves):** New filed substitutions and missing-compatible-counterpart disclosures are added; recovered typed value-only conflicts retire only their own old refusal. Array positions shift after insertion.

```text
gaps.{{25,26,28,29,94,95,101,103,104,199..201}.{attemptedSources,field,reason},{27,30..32,35..38,46,48,102,105,169,170,180,185,186,190,191,198}.{field,reason},33.{field,reason,severity},{34,45,47,106,171,202,208..210}.{attemptedSources,expected,field,reason},{39,41,44}.{attemptedSources.0,{expected,field,reason}},{40,50..93,96..100}.{attemptedSources.0,{field,reason}},{42,49}.{attemptedSources.{0,1},{field,reason}},43.{attemptedSources.{0,1},{expected,field,reason}},{107..168,172..179,181..184,187..189,192..197,203..207,211}.{expected,field,reason},{212..375}}
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

SHA-256 before `52b716052275711574e37c93f7cbb47a33aff7d549ae88cfd38e384ebae8739e`; after `b21fffea3e4492c4b15cc6a379e0a578763cac0d9ed5ce3e680871dd8b9dc2fd`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `2231610c98538b3a4bf274f1a51dd0ee8387764a4fe4145852f2aceeeff24cda`; after `cf9c96335f3e02f32c510b2bc82e7ef4ff6b0345e85086c1d40a66c746be688a`.

667 changed JSON leaves, all enumerated below.

- **appendix (659 leaves):** Substitution/missing-data/provenance records carry the changed inputs, filings and compatibility stamps; ordered arrays shift after additions. Existing unknown evidence stays unknown.

```text
appendix.missingData.{34.reason,{35..37,39..43,48,136..140,145}.{field,reason},38.{attemptedSources,expected,field,reason,severity},{44,47,49}.{attemptedSources.{0,1},{field,reason}},45.{attemptedSources.{0,1},{expected,field,reason}},46.{attemptedSources.0,{expected,field,reason}},{50..93,96..100,133,134,143}.{attemptedSources.0,{field,reason}},{94,95,101,135,142,144,147,148}.{attemptedSources,field,reason},{102,126,127,129,130,141,146,149..151,153..205,207..211,215}.{expected,field,reason},{103..125,128,131}.field,{132,152,206,212..214}.{attemptedSources,expected,field,reason},{216..381}}
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

SHA-256 before `61128eb609eeaed4b3583cecca38254d609012791b27b9d031230b5199499c1d`; after `e206bfe1798fe8d56e1de04c4f7b106b9eea0d845b0daf9624eeb634ddcc4828`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `6b5b1ed5b886dd41c36d95775a303bc3fd27d509c2a584c820805dd955d4074b`; after `5b97a959cd338dab97b8119fec7f33f8ca36e6b8f966b106aa37b4f28c14d285`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `d8b1b6a96c7e16a13d9bb38e358bca584e3b916d9dcd2fbb793e59d9e07e6864`; after `8419b4da92991eadfa0133a68e06096ae4af5c09d00e9a51871a60f25a305ca6`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `593c6f2cd13ff954b90cf4aad641010ed1bcf445bf4848593afec271209d6f17`; after `20a064641c0b4cd562571eb3496eee60381730db485b6148103200d531555ac8`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:f47d08c3"` to `"1.95.0:9aebc350"`, approved because its version and covered deterministic content changed.

## duk-data-only

20 independently filed input corrections are listed below. Repeated aliases and dependent FCF are represented by their capex input, not counted again.

| Field | Window | Filed/admitted amount | SEC tag(s) | Filing evidence |
| --- | --- | ---: | --- | --- |
| incomeAnnual.interestExpense | 2016-01-01 to 2016-12-31 | 1916000000 USD | us-gaap/InterestExpense | 10-K 0001326160-17-000016, filed 2017-02-24 |
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

SHA-256 before `9a5f22b992dfa6ae55c8649cccf1211d9deba2704bf588fcb3b114bf3ae194a0`; after `59068392f47d3daea6b80c651eca6557a129ff9c53ec6a5be7db3c7d4e58f72e`.

842 changed JSON leaves, all enumerated below.

- **capital (11 leaves):** Statement-specific D&A, admitted capex, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.{capexIntensity.series.4.capexToDA,current.{cashBridge.definition,{ebitda,ebitdaComputed,netDebtToEbitda}},maintenanceVsGrowthCapex.{capexToDA5yAvg,capexToDALatest,impliedGrowthCapex,impliedMaintenanceCapex},netDebtToEbitda.{ebitda,ebitdaComputed}}
```

- **forensics (13 leaves):** The unchanged forensic formulas read the corrected D&A, acquisition, cash-flow totals, compensation or cost operands; related warnings/source labels follow those same facts.

```text
forensics.{accruals.{{aggregateAccrualsCashFlow,cashFlowAccrualRatio,definition,investingCashFlow,operatingInvestingCashFlow},notes.{1,4}},beneish.{indices.depi,{score,sgiNeutralScore,tataBalanceSheet}},notes.{10,13}}
```

- **gaps (803 leaves):** New filed substitutions and missing-compatible-counterpart disclosures are added; recovered typed value-only conflicts retire only their own old refusal. Array positions shift after insertion.

```text
gaps.{{16,91,101,106..109}.{attemptedSources.{0,1},{field,reason}},{17,18,28,29,53,63,73}.{attemptedSources,field},{19..24,30,42..45,52,54,55,57,62,64,65,72,74,75,269,271,272}.field,{25..27,46,48..51,58,60,61,67,69..71,86,90,125,127,128,130,133,135,136,138,140,141,143..145,149,151,155,159,160,165,168,172,176,180,184..186,190,191,195,196,200,204..206,208,211,220,223,230,235,237,245,251,253,254,256,258,259,265,266,268,270,277,278,280,288..290}.{field,reason},{31,41,47,56,59,66,68,76..78,87,93,95,96,120,122..124,126,129,131,132,134,137,139,142,146..148,150,161}.{attemptedSources,field,reason},{79,80}.{attemptedSources,field,reason,severity},{81..85}.{attemptedSources,expected,field,reason,severity},{88,89,92,94}.{attemptedSources.0,{expected,field,reason}},{97,98,102..105,164,173,182,194,198,199,281..284}.{attemptedSources,expected,field,reason},{99,100}.{attemptedSources.{0,1},{expected,field,reason}},{110..117,119,121}.{attemptedSources.0,{field,reason}},118.{attemptedSources.{0..2},{field,reason}},{152..154,156..158,162,163,166,167,169..171,174,175,177..179,181,183,187..189,192,193,197,201..203,207,209,210,212..219,221,222,224..229,231..234,236,238..244,246..250,252,255,257,260..264,267,273..276,279,285..287,291,292}.{expected,field,reason},{293..376}}
```

- **scores (15 leaves):** The unchanged scoring formulas read the corrected operands above; driver values, signal arithmetic, aspect/composite results and completeness follow those operands.

```text
scores.{aspects.quality.{drivers.{1,2}.value,score,signals.{1.{{contributionPoints,fallbackReason,raw,transformedScore},operands.0.value},2.{{contributionPoints,raw,transformedScore},operands.0.value}}},assessments.businessQuality.score,composite.score,factorExposure.3.aboveNeutralPoints}
```

### payload.txt

SHA-256 before `3c6fd15c2dcfc0f41bcdb093c7b4024aeb49f83f234210250a7960f94e0a059a`; after `55b308cefe92acb53065f268864fbcf24bc98f3b16d00c07f7b3a01c6e65f6c2`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `7c5e4b8edde374cd3fd3612da5a7dd72dc4511c734fcd06972dd7284842de859`; after `bf2f537e24db6723ec6478c1c072878aaa8114b325f910d490d878d1e0611d7e`.

760 changed JSON leaves, all enumerated below.

- **appendix (695 leaves):** Substitution/missing-data/provenance records carry the changed inputs, filings and compatibility stamps; ordered arrays shift after additions. Existing unknown evidence stays unknown.

```text
appendix.missingData.{{78..80,104..109,131,137,139,145,153,160,163,171,177,181,183,185,189..192,201..204,213,214,216,218..226,229..231,290,291,293,294,296}.{field,reason},{81..87}.{attemptedSources,expected,field,reason,severity},88.{attemptedSources,field,reason,severity},{89,97}.{attemptedSources.{0,1},{expected,field,reason}},{90,98,103,110..116}.{attemptedSources.0,{field,reason}},{91..95,99..102}.{attemptedSources.{0,1},{field,reason}},96.{attemptedSources.0,{expected,field,reason}},{117,119,121,124,178,180,198..200,205..208,248,279,280,288}.{attemptedSources,expected,field,reason},{118,120,122,123,179,186..188,215,217,227,228}.{attemptedSources,field,reason},{125..130,134..136,142..144,150..152,158,159,161,162,168..170,182,184,193..197,209..212,232..247,249..278,281..287,289,292,295}.{expected,field,reason},{132,133,138,140,141,146..149,154..157,164..167,172..176}.field,{297..381}}
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

- **scores (15 leaves):** The unchanged scoring formulas read the corrected operands above; driver values, signal arithmetic, aspect/composite results and completeness follow those operands.

```text
scores.{aspects.quality.{drivers.{1,2}.value,score,signals.{1.{{contributionPoints,fallbackReason,raw,transformedScore},operands.0.value},2.{{contributionPoints,raw,transformedScore},operands.0.value}}},assessments.businessQuality.score,composite.score,factorExposure.3.aboveNeutralPoints}
```

- **verdict (15 leaves):** The unchanged verdict presentation reads the recalculated composite and evidence qualifications.

```text
verdict.{gradeStrip.quality.{keyNumbers.{{1..4}.value,{9,10}.{source,sourceId,value},{11,12}},oneLineWhy,reasoning.0.text},synthesis}
```

### report.md

SHA-256 before `a8e8b13f2019b3c4c2a1b7f33b2f9628af4984122e0f6d98170d48730f83d94a`; after `b030aa94be00047ca8aa82bb65597450cc9cca4f97211eb36918b54b21616e51`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `bf88c13badb158a58de4d0b4b37bfc926b954cbf7f33549c5dbfcbfe94081cdd`; after `25d384445462ed6ecfa05bf0fe2468db7bf32cdfadff703f0847bdbbb106b081`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `fdc117eb9ead7fcdaec21bd4d44e7a98e032688be7813868ca45a4da63329b5c`; after `00fdc72819501f190b7d2e4a4da4920c73c31171f894b55acc1dfda9c27d24af`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `2d425b989629365be7f5759ae582977fbbdc4564eb7f06ed2a5bdc5a2f42477d`; after `241274a933b5f8ce7d8e2827e67302bde37a0bf80a273ab938d09ae8f14cd810`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:98ff17ff"` to `"1.95.0:6f5b4a40"`, approved because its version and covered deterministic content changed.

## tsm-data-only

No scalar input correction: only the revised definition, compatibility identifiers and explicit unverified-coverage disclosures change.

| Field | Window | Filed/admitted amount | SEC tag(s) | Filing evidence |
| --- | --- | ---: | --- | --- |

### stageB.json

SHA-256 before `e96bdb78936f7d705c1bf8fe9d189d4b97c74409fa4f0881536b3e7844c2832e`; after `b8dc5ed2174b2bf94a8bc6cac7d4b3ca5d51d3b6f9af39d5f009d6af8e7c5ff2`.

338 changed JSON leaves, all enumerated below.

- **capital (3 leaves):** Statement-specific D&A, admitted capex, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.{current.{cashBridge.definition,ebitdaComputed},netDebtToEbitda.ebitdaComputed}
```

- **gaps (335 leaves):** New filed substitutions and missing-compatible-counterpart disclosures are added; recovered typed value-only conflicts retire only their own old refusal. Array positions shift after insertion.

```text
gaps.{{8..10}.{field,reason},{11,20}.{field,reason,severity},{12..18,21..23,25..37}.{attemptedSources,expected,field,reason,severity},{19,24}.{attemptedSources,field,reason,severity},{38,46,51,63,66,68}.{attemptedSources,expected,field,reason},{39..44}.{attemptedSources.{0..2},{field,reason}},{45,48..50,52..62}.{attemptedSources,field,reason},{47,65,67}.{expected,field,reason},64.{attemptedSources.{0..4},{expected,field,reason}},{69..152}}
```

### payload.txt

SHA-256 before `784836c88e9f1d08323c64f5f7e8adeefa0698018009c21b8978037ec3d4c181`; after `87f5022cbbaf0bdf50f13a6b9efba8987756e9be82eb78768636916d2b679ef1`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `81be5e52f834aeacb12188bf6a5c060f1f55d610d3abc0a23c6a96cbaee5fc44`; after `73da94e3933252d8ed8c78719e8d0a878603e3928fa41ff143bceceb8cfe218e`.

360 changed JSON leaves, all enumerated below.

- **appendix (356 leaves):** Substitution/missing-data/provenance records carry the changed inputs, filings and compatibility stamps; ordered arrays shift after additions. Existing unknown evidence stays unknown.

```text
appendix.missingData.{11.{field,reason},{12..18,21..23,25..35}.{attemptedSources,expected,field,reason,severity},{19,24}.{attemptedSources,field,reason,severity},20.{field,reason,severity},{36..38}.{expected,field,reason,severity},{39..45,48..50,52,53,63..68}.{attemptedSources,field,reason},{46,51,58,59,69,70}.{attemptedSources,expected,field,reason},{47,71..74}.{expected,field,reason},{54,56}.{attemptedSources.{0..8},{expected,field,reason}},{55,57}.{attemptedSources.{0,1},{expected,field,reason}},{60..62}.{attemptedSources.{0..2},{field,reason}},{75..158}}
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

SHA-256 before `3645d46db50e5a17ddaa7f6bc39b377fe6ad377057e0dee50bdf65c19b2648e5`; after `fe2cd88144376b36c94977e48c3b1814b748ef499193249a993cd50c0a893fbf`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `89be7d69e3b4d81759451d5754f314f13bd64e4d32e53cc575f9c29119e4ef0d`; after `1fd833f62ff33b3f615cf621fa65221bef17978d7dfbb0f7dd38e753b2b7b114`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `9824c8bb6b1205ff3d098e189f38de083a1d496c18aaafaf0b08e7334edf59a4`; after `46295de53e97e03394b0f7d7920261360ad9ba7936aa9d2d779698339a976f58`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `87280f799ba21e6b6f0d439eee27bb0f0f62614b5783fae4e08baca8c6f583d7`; after `1de8b2227393a089cd82ea225172cd0ab5863991c593bccfdae95e41cbeaf718`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:9e66a774"` to `"1.95.0:9f5c5896"`, approved because its version and covered deterministic content changed.

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

SHA-256 before `f04b44a7d1cfce93da7577348610537597ca9711da8c89b77059ebd98dc73dca`; after `a6cc48e53e3112563995b092fb4867d3a62f5450bdf8366a7f84d04b49f2a04a`.

375 changed JSON leaves, all enumerated below.

- **capital (3 leaves):** Statement-specific D&A, admitted capex, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.{current.{cashBridge.definition,ebitdaComputed},netDebtToEbitda.ebitdaComputed}
```

- **forensics (4 leaves):** The unchanged forensic formulas read the corrected D&A, acquisition, cash-flow totals, compensation or cost operands; related warnings/source labels follow those same facts.

```text
forensics.{beneish.{indices.sgai,{score,sgiNeutralScore}},piotroski.signals.noEquityIssuance.detail}
```

- **gaps (368 leaves):** New filed substitutions and missing-compatible-counterpart disclosures are added; recovered typed value-only conflicts retire only their own old refusal. Array positions shift after insertion.

```text
gaps.{{32..37,43,46,61..63,72,74,76..80,82..91,93,96,98,100}.{field,reason},38.{field,reason,severity},{39..41}.{attemptedSources,expected,field,reason,severity},{42,44,53,57,120}.{attemptedSources,expected,field,reason},{45,49,52}.{attemptedSources.0,{expected,field,reason}},{47,51,55,59,64..66,68..70}.{attemptedSources.{0,1},{field,reason}},{48,71,73,75,81,117..119}.{attemptedSources,field,reason},{50,54,56,58,60,67}.{attemptedSources.0,{field,reason}},{92,94,95,97,99,101..116,122..131}.{expected,field,reason},121.{cause,expected,field,reason},{132..206}}
```

### payload.txt

SHA-256 before `aaa2bcf2ec2a4701b0e8a12d8ce90410273659d5d819058e81bc9871a0626a61`; after `2ed2e3f740f5ddae5075669526c747f49d7840ebdb4e12a23b82f3dbbb2e1d7b`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `33fb30b93d508efc744d1855a266e23685099ed1ff0708d1a6d13880989686a4`; after `4d1545ce690cb5b21fadea828a0b05e7022c72f1ce0566d98d61ac052c075c5b`.

378 changed JSON leaves, all enumerated below.

- **appendix (372 leaves):** Substitution/missing-data/provenance records carry the changed inputs, filings and compatibility stamps; ordered arrays shift after additions. Existing unknown evidence stays unknown.

```text
appendix.missingData.{{33..38,43,44,58..60,75,76,85..99}.{field,reason},{39..42}.{attemptedSources,expected,field,reason,severity},{45,49,52,53,56,61..63,65..67}.{attemptedSources.{0,1},{field,reason}},{46,50}.{attemptedSources.0,{expected,field,reason}},{47,48,51,54,55,57,64,68..70}.{attemptedSources.0,{field,reason}},{71..74}.{attemptedSources,field,reason},{77,78,80..82,84,100..120,123..132}.{expected,field,reason},{79,83,121}.{attemptedSources,expected,field,reason},122.{cause,expected,field,reason},{133..207}}
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

SHA-256 before `9023878668f9ad4e7783036e6bdcb63c21b44255f0d5a185712994165dec2fae`; after `617f80e9e664e25e052d42ceea50c4d884e0bf97d135ba485f03e777b1a4dcdd`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `55e0d4b9c2368573517bebb705eadfee90e3d2747dfeea61ba593f14ca547e1f`; after `efce2541324a9a51fc5445505ed194ed920680acaa01a4c43ca3fba5991b25d0`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `7ba8d6d816b59d51dc98cb829245092fffe08a4f9e0598f61305eda1fc5f64b1`; after `412c4d44f03c58c6bb8bcdc940d52a79103d554277e637defa0ab31c88288ac0`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `edb23cc31cc632a2c699ab13a1730e033d78f42b466030aa014fe782ac3b4f2f`; after `ce83c5e6b198200ef69e44b9cae3d387b83f09e3c173c00b645c78698cac4332`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:a64b7469"` to `"1.95.0:82e60c3c"`, approved because its version and covered deterministic content changed.

## vktx-data-only

4 independently filed input corrections are listed below. Repeated aliases and dependent FCF are represented by their capex input, not counted again.

| Field | Window | Filed/admitted amount | SEC tag(s) | Filing evidence |
| --- | --- | ---: | --- | --- |
| incomeAnnual.generalAndAdministrativeExpenses | 2019-01-01 to 2019-12-31 | 9128000 USD | us-gaap/GeneralAndAdministrativeExpense | 10-K 0001564590-20-006766, filed 2020-02-26 |
| incomeQuarterly.generalAndAdministrativeExpenses | 2020-10-01 to 2020-12-31 | 2217000 USD (compatible YTD difference) | us-gaap/GeneralAndAdministrativeExpense | 10-K 0001564590-21-006406, filed 2021-02-17 + 10-Q 0001564590-20-048398, filed 2020-10-28 |
| cashflowAnnual.interestPaid | 2018-01-01 to 2018-12-31 | 81000 USD | us-gaap/InterestPaidNet | 10-K 0001564590-19-007584, filed 2019-03-13 |
| cashflowAnnual.interestPaid | 2016-01-01 to 2016-12-31 | 205139 USD | us-gaap/InterestPaid | 10-K 0001564590-17-004911, filed 2017-03-21 |

### stageB.json

SHA-256 before `0ef2c05d948cd9c97c32a90f810fa3254b79b49d71257cc91dbd12b03e2d5a93`; after `418e2265e5675b28d53d0de8e96f09e33598c4f7a43e9f68a61bdd9f4b5b6790`.

440 changed JSON leaves, all enumerated below.

- **capital (3 leaves):** Statement-specific D&A, admitted capex, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.{current.{cashBridge.definition,ebitdaComputed},netDebtToEbitda.ebitdaComputed}
```

- **gaps (437 leaves):** New filed substitutions and missing-compatible-counterpart disclosures are added; recovered typed value-only conflicts retire only their own old refusal. Array positions shift after insertion.

```text
gaps.{21.reason,{22,24..28,32,33,39..42,45,50..53,55,104..113,115,119,120}.{attemptedSources,field,reason},{23,31,34..38,43,44,46..49,54,56..58,99..101}.{field,reason},29.field,30.{attemptedSources,field},{59,60,73..76}.{attemptedSources,field,reason,severity},{61..63,67,70,72}.{attemptedSources.{0,1},{expected,field,reason,severity}},{64,65,68,71,77..80}.{attemptedSources,expected,field,reason,severity},66.{field,reason,severity},69.{attemptedSources.{0,1},{field,reason,severity}},{81,82,88,95..98,102,103,114,116..118,121,122}.{attemptedSources,expected,field,reason},{83,90}.{attemptedSources.{0,1},{field,reason}},{84..87,89,92..94}.{attemptedSources.0,{field,reason}},{91,123}.{attemptedSources.0,{expected,field,reason}},124.{expected,field,reason},{125..213}}
```

### payload.txt

SHA-256 before `b4b5e05cf9da2c48b8e5b4ec4e850cac3f5b3b7b6c386f6ccf2429cbc5f27e25`; after `1a980d53b07baacb50bf9e4293304029d732d689238bd605b00f9bc134db89f4`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `ddae34524ea2547dee5869f0b0af849a149f1e96c425e83ab9880d250e02c209`; after `adecd3e36546ec0f1b68cd5b0077a28b3fd807bcde954abddaaf9cd53e6ac214`.

355 changed JSON leaves, all enumerated below.

- **appendix (351 leaves):** Substitution/missing-data/provenance records carry the changed inputs, filings and compatibility stamps; ordered arrays shift after additions. Existing unknown evidence stays unknown.

```text
appendix.missingData.{58.reason,{59,93..95}.{field,reason},{60..66,68..81}.{attemptedSources,expected,field,reason,severity},67.{attemptedSources,field,reason,severity},{82..87,90..92}.{attemptedSources.0,{field,reason}},88.{attemptedSources.{0,1},{field,reason}},89.{attemptedSources.0,{expected,field,reason}},{96..108}.{attemptedSources,field,reason},{109..117,127}.{attemptedSources,expected,field,reason},{118..126,128}.{expected,field,reason},{129..217}}
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

SHA-256 before `8389592b8f2599afa3e5568a9111f53d5a574cd3866e1c81c051f4fe9438c65f`; after `d6793e6b42f305dceb6f9b61d6777774872ab4815bd745032fff19b9d994515a`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `597cccd532ae323f833819c070b1326e29a226767bba1da6d6529e58fd4e6bd5`; after `91974bb583a8ac5367605ec47d44ed11048446e52e20c65da48c14dc38c46095`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `3f9bf669dc8ac5d933f3a05d27452570f8f31b70213bf8f1624daabda9e84cf5`; after `a5d130144ac4d7f167e2700ec084612f21e0b361de237e34937a16a9c2e600c7`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `abc9fd85fea456e4514c5855930d9e153be0bca514e213b294fac76c52b2bb66`; after `f828d2cbbb33b43b21b63ca64ce86782649053c18c56da4f339939575fe95100`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:d2838e19"` to `"1.95.0:8f3f3c5b"`, approved because its version and covered deterministic content changed.

## amzn-fixed-analyst

2 independently filed input corrections are listed below. Repeated aliases and dependent FCF are represented by their capex input, not counted again.

| Field | Window | Filed/admitted amount | SEC tag(s) | Filing evidence |
| --- | --- | ---: | --- | --- |
| cashflowAnnual.interestPaid | 2016-01-01 to 2016-12-31 | 290000000 USD | us-gaap/InterestPaid | 10-K 0001018724-17-000011, filed 2017-02-10 |
| cashflowAnnual.capitalExpenditure | 2016-01-01 to 2016-12-31 | -6737000000 USD | us-gaap/PaymentsToAcquirePropertyPlantAndEquipment | 10-K 0001018724-17-000011, filed 2017-02-10 |

### stageB.json

SHA-256 before `9381e9cafc27f42b7f7a6c4048bc887e0dd19aea32962a8bbffc3e5e6ab459c4`; after `723cd62dc1ffc529e21395c14536b2b5ebbbf490329b8413fa755b8f2e286d55`.

308 changed JSON leaves, all enumerated below.

- **capital (3 leaves):** Statement-specific D&A, admitted capex, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.{current.{cashBridge.definition,ebitdaComputed},netDebtToEbitda.ebitdaComputed}
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

SHA-256 before `2dbcf2787731fe38a3bada47664855d48c17012430236b85a2eeb5f247bbe7c2`; after `66d46bfc1335b7b440bb94cdf0e5e276189b9a6590b5e2d1ba3caa581e3e72c8`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `0761353d161bc0e321a07e641fca47adb402c8739dfae79d6ccbed1609eb0d8e`; after `4c734da71b7dbcd8622848ac89ca59626b0d2b5586691130962466b01b6e30d5`.

917 changed JSON leaves, all enumerated below.

- **appendix (909 leaves):** Substitution/missing-data/provenance records carry the changed inputs, filings and compatibility stamps; ordered arrays shift after additions. Existing unknown evidence stays unknown.

```text
appendix.{missingData.{{96..98,106..108,112..114,118..120,124..126,130..132,136..138,142..144,152,179}.{attemptedSources,field,reason},{99..105,109..111,115..117,121..123,127..129,133..135,139..141,145,146,180,182}.{field,reason},{147,148,150,151,153,154,156,157,159,160,162,163,165,166,168,169,171,172,174,175,177,178,183}.{expected,field,reason},{149,155,158,161,164,167,170,173,176,181}.{attemptedSources,expected,field,reason},{184..241}},provenanceCoverage.factualValidation.{contradicted,rate,validated},verificationLog.{355.claim,{356,409}.{claimSupportStatus,note,numericSupportStatus,reason,traceKind,validationStatus},447.{note,reason,source,traceKind},{448,451..454,458}.{claim,note,path},{449,450,455,456,460}.{claim,note,path,source},457.{claim,note,path,reason,source,traceKind},459.{claim,note,path,reason,traceKind},461.{claim,evidenceKind,note,path,reason,source,traceKind},{462..676,678..726}.{claim,path},677.path,727}}
```

- **balanceSheet (1 leaves):** Cash, coverage and capital descriptions read the corrected filed flow family and its qualifications; no balance-sheet stock is independently substituted by this change.

```text
balanceSheet.coverage.commentary.3.text
```

- **meta (4 leaves):** Report/payload/Stage B compatibility stamps advance; payload fingerprint and method-identity hashes identify the revised meaning. Stored-report bytes are untouched.

```text
meta.{provenanceCoverage.factualValidation.{contradicted,rate,validated},specVersion}
```

- **scores (3 leaves):** The unchanged scoring formulas read the corrected operands above; driver values, signal arithmetic, aspect/composite results and completeness follow those operands.

```text
scores.aspects.fundamentals.signals.3.{fallbackReason,operands.{6,7}.value}
```

### report.md

SHA-256 before `77886bd04f5eff3742141d9398db8b8ff207abbf045d7edbc987081f092b9299`; after `adae16bc2efb4212706c0abd6c1b95d8bca4ea73dc9338d2e96b5abae2da0ee3`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `2e49a7f26fa3ee9a00f4aac3a81422bc3b0aaa1b4e406c5649860aac508bee52`; after `0bc2492f1708756714910c1aa74fcd605f8299a53478993874046f60a596ac82`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `b426e2cc6d086c4bbc64aed1327e6741754138939a86c33c7be4f2f2b954a726`; after `1cb0dd4315b64d78f142a63612c84f8767b823e8349b02e161ba3acf004129e9`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `46e84253fa9d514a7746d10c1a35d5faf448ec28a8942b3fa36e400d0f81f3bd`; after `0050439f955cf691735994409a4733abada5d92d33e2e59f249ba41ae83902e3`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:d3a902a8"` to `"1.95.0:8ca6b713"`, approved because its version and covered deterministic content changed.

## meta-fixed-analyst

4 independently filed input corrections are listed below. Repeated aliases and dependent FCF are represented by their capex input, not counted again.

| Field | Window | Filed/admitted amount | SEC tag(s) | Filing evidence |
| --- | --- | ---: | --- | --- |
| incomeQuarterly.interestExpense | 2026-04-01 to 2026-06-30 | 754000000 USD | us-gaap/InterestExpenseDebt | 10-Q 0001628280-26-050705, filed 2026-07-30 |
| cashflowAnnual.interestPaid | 2025-01-01 to 2025-12-31 | 696000000 USD | us-gaap/InterestPaidNet | 10-K 0001628280-26-003942, filed 2026-01-29 |
| cashflowQuarterly.commonDividendsPaid | 2025-10-01 to 2025-12-31 | -1328000000 USD | us-gaap/PaymentsOfDividendsCommonStock | 10-K 0001628280-26-003942, filed 2026-01-29 |
| cashflowQuarterly.commonDividendsPaid | 2025-07-01 to 2025-09-30 | -1323000000 USD | us-gaap/PaymentsOfDividendsCommonStock | 10-Q 0001628280-25-047240, filed 2025-10-30 |

### stageB.json

SHA-256 before `ebfb1046771b5640b383fc795c0741adb0ca38241b7a92acf9a40dc827f0adab`; after `56952c4238fc112230dbf4cb0b8babea2f694e36d9f0596fef572fb1a74549fb`.

413 changed JSON leaves, all enumerated below.

- **capital (5 leaves):** Statement-specific D&A, admitted capex, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.{current.{cashBridge.definition,{ebitdaComputed,interestCoverage,interestExpense}},netDebtToEbitda.ebitdaComputed}
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

SHA-256 before `3cccad378e9f950f5298c3eb1caec78e37355b0f0520094127ad4f7d763aa0b5`; after `326bd7d308ad30dd497e461d83161bb86e253e3863681d61426e48e1eed28c28`.

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

SHA-256 before `04edf31e120fee6be1b29396cee8fbfd02ac30dbaba0c5cdbdf5c7419f046d1e`; after `f30e09ddebceb4b7c9f5e704367c0ae252e35b97d6c47242c7853f02a9195f4d`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `3d731bff7dbd12f4d0479a93acd86193fac51871d77037280f6560cbc21a26ba`; after `dbf703a3f9cce95efd45ce5fe52138e583fb24bf0d62ea3c29e5c3db3b9ce1b1`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `a60013601fec2067a0f5f910f7fda08f431ec4adf6b3734c6b5bfbd1ddbc32bf`; after `943bac02796a1238cccd06d83212993a2f32b605ac5bd2fd40954ed8580fdc06`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `5fe1e7aec36d6d17e531ea9803f496f7a11af801f9cb2ea7174e380acf661bc6`; after `e7f427ccfb549b73144c8d1b82810b934e783bedc56fd07926afb4c9ef92410e`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:0ff64fb6"` to `"1.95.0:3bbee120"`, approved because its version and covered deterministic content changed.

## mu-fixed-analyst

No scalar input correction: only the revised definition, compatibility identifiers and explicit unverified-coverage disclosures change.

| Field | Window | Filed/admitted amount | SEC tag(s) | Filing evidence |
| --- | --- | ---: | --- | --- |

### stageB.json

SHA-256 before `221c0a467a91e1522bdce283b855072801ae97ddd1061ea42d148fc3c34fbae9`; after `afa75afeed094b61b2e309998ee6b2e7e75ee80d488fae68b954653f3964bb6b`.

3 changed JSON leaves, all enumerated below.

- **capital (3 leaves):** Statement-specific D&A, admitted capex, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.{current.{cashBridge.definition,ebitdaComputed},netDebtToEbitda.ebitdaComputed}
```

### payload.txt

SHA-256 before `53df00250317a2a31da0ac982654047e5981407bff273bb0c03cb4c9476fc50a`; after `505593efc9310d50fca7157d3259553eece4a92e649278b9b16a0510f307fa4d`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `86e6bb54852aa99761a75f9068bd5ea8bedd4672455d381eae99132e743dceb2`; after `3e07af03e3bfeb5c12d12f0e3580b6c999be9bbd6a6560cab0c5bda8c5d21901`.

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

SHA-256 before `88a9427fc848130682b1e9edb36c1ccbe39a66e41bd52443326181b50b08dc58`; after `866e00b91ccf56b90902f428f7d4f8ac0098647901cafc6d6b64cc56fe079bb6`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `751f25604ec76fd1450485eae4f2d9a4b6c2ddf9581784da5c78db3c93b6ba49`; after `8c08dc2792316d5e025952209c193e6f3f701c77591a984944295b445373eaa0`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `884b4373251bc88424c021eadae880a4b6dc17615bdae546dc7b494b3c8695af`; after `f680f77c52f3002af3ecbb71204e2141fc8e6f2377734c46e5cdf9809c04bcae`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `dc3413c67804dde6dcb224041fd1fc62d725458b174cb8e0ab70bf4bbfb36c36`; after `ebf882d898b529a65b54eb7eaf2089257f7ea5f8f2d3ad0a12df011eb5b8b56a`.

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

SHA-256 before `b4f6677ad08d828bc353afaf4bbe835a42154e54dea708fc178316c14f37e553`; after `114392a1568693b0ddb71bb380afe2c383f3428f108e1dd812e3185b276ba93b`.

182 changed JSON leaves, all enumerated below.

- **capital (3 leaves):** Statement-specific D&A, admitted capex, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.{current.{cashBridge.definition,ebitdaComputed},netDebtToEbitda.ebitdaComputed}
```

- **gaps (179 leaves):** New filed substitutions and missing-compatible-counterpart disclosures are added; recovered typed value-only conflicts retire only their own old refusal. Array positions shift after insertion.

```text
gaps.{{51..61}.{field,reason},{62..89,91,92}.{expected,field,reason},90.{attemptedSources,expected,field,reason},{93..155}}
```

### payload.txt

SHA-256 before `c4abe6679d23ad37e37f446db0418e80d211224167956131f42ed774e1ad9e3e`; after `1e79cd34cb89b9151f44113f5213e0eb0d66696d33b2b68cdfaabb8fa70fc42a`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `bc56369a7773a0e66915aff9be7c692bea09caf102f4d7bc5805ff130173efef`; after `8e3f3ac71280780d9a9935b1f71953935c2812699074a09f756cbbfc88158133`.

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

SHA-256 before `2b0a040e7e010446108a4785675c3bb10bfbf7c5d028d4bb73806b28a7095f68`; after `70082af35fc922a35cea53f96481ec28d25b8bca4a677e256e9b657a75392ed5`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `41504b0ee73503790919d73863151fc257e80993afa919b1a88cac6592b1f56d`; after `50ef9c3859f8997bd49d6351ba7fa3c780a5cae7fe60876bfda00095f8ec2f0c`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `f2828dc35371e1b29b0823846368a68fab87079507033d1174bd360cb63101fc`; after `17324778334cacb94d58f38cd99fe82a77e49eab645f7ac6f6f0a23f683f9205`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `b259752adc661984f86562c6eb199854a52b432cd9975fbdf1b9db9390bc660a`; after `5d9e090e68a4a1ecaf94d3213608f9d1f93e2f280353180c454e140a29ee74e7`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:182abc3c"` to `"1.95.0:c67bcb33"`, approved because its version and covered deterministic content changed.

## lly-data-only

57 independently filed input corrections are listed below. Repeated aliases and dependent FCF are represented by their capex input, not counted again.

| Field | Window | Filed/admitted amount | SEC tag(s) | Filing evidence |
| --- | --- | ---: | --- | --- |
| incomeAnnual.interestExpense | 2025-01-01 to 2025-12-31 | 895000000 USD | us-gaap/InterestExpenseNonoperating | 10-K 0000059478-26-000013, filed 2026-02-12 |
| incomeAnnual.sellingGeneralAndAdministrativeExpenses | 2020-01-01 to 2020-12-31 | 6121200000 USD | us-gaap/SellingGeneralAndAdministrativeExpense | 10-K 0000059478-21-000083, filed 2021-02-17 |
| incomeAnnual.sellingGeneralAndAdministrativeExpenses | 2019-01-01 to 2019-12-31 | 6213800000 USD | us-gaap/SellingGeneralAndAdministrativeExpense | 10-K 0000059478-20-000057, filed 2020-02-19 |
| incomeQuarterly.interestExpense | 2025-10-01 to 2025-12-31 | 222600000 USD (compatible YTD difference) | us-gaap/InterestExpenseNonoperating | 10-K 0000059478-26-000013, filed 2026-02-12 + 10-Q 0000059478-25-000254, filed 2025-10-30 |
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

SHA-256 before `1e45f11f6a39257b63f83a4e053cf6bb263046763b7f888c468aab96ca23ffbe`; after `cfe3dd9cd5e5df5c65ddcc4725a0fa737696a5f541026ece78a29a5d18daf47f`.

631 changed JSON leaves, all enumerated below.

- **capital (30 leaves):** Statement-specific D&A, admitted capex, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.{capexIntensity.{series.{0,1}.{capex,capexToDA,capexToRevenuePct},slopePctPtsPerYear},current.{cashBridge.{afterSbcStandardizedFcf,cashCapitalExpenditure,definition,standardizedFcf},{fcfBeforeSbc,fcfConversionBeforeSbc,interestExpense,sbcPctOfFcf},filedCashFlows.capitalExpenditure},fcf.series.{0,1}.{fcf,fcfBeforeSbc,fcfConversion,fcfConversionBeforeSbc,note},interestCoverage.{interestExpense,value},maintenanceVsGrowthCapex.capexToDA5yAvg,netDebtToEbitda.ebitdaComputed}
```

- **gaps (494 leaves):** New filed substitutions and missing-compatible-counterpart disclosures are added; recovered typed value-only conflicts retire only their own old refusal. Array positions shift after insertion.

```text
gaps.{{14,15,27,29,43..45,121}.{attemptedSources,field,reason},{16,22,25,41,48,51,54,55,58,59,83,87,94,97,100,103,107,110..112,115,122,125,126,129,130}.{field,reason},17.{field,reason,severity},{18..20}.{attemptedSources,expected,field,reason,severity},{21,23,28,34,46,47,119,120}.{attemptedSources,expected,field,reason},24.{attemptedSources.0,{expected,field,reason}},{26,30,31,33,36..38,42}.{attemptedSources.{0,1},{field,reason}},{32,35,40}.{attemptedSources.{0,1},{expected,field,reason}},39.{attemptedSources.0,{field,reason}},{49,50,52,53,56,57,60..82,84..86,88..93,95,96,98,99,101,102,104..106,108,109,113,114,116..118,123,124,127,128,131}.{expected,field,reason},{132..268}}
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

SHA-256 before `69f9dacf4b21c582d3cbd401865d688b0ff02a3a97694286123308224c1ab6c3`; after `bde37798199d601b178235722687040dfeabcad6c8e18ba4f89ebb2bbc804892`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `4806bd919b7e84f3d2f48acdaf331c8db75a084c7518b693bf6deba84d3f767e`; after `9021131c301a5feb5acfa6ab13b061ffa42e2f7fa385730b2c64712398070078`.

628 changed JSON leaves, all enumerated below.

- **appendix (493 leaves):** Substitution/missing-data/provenance records carry the changed inputs, filings and compatibility stamps; ordered arrays shift after additions. Existing unknown evidence stays unknown.

```text
appendix.missingData.{{16,17,22,23,37,38,44..46,49,50,53..61,66..68,70}.{field,reason},{18..21}.{attemptedSources,expected,field,reason,severity},{24,27,28,30,31,33,34,39}.{attemptedSources.{0,1},{field,reason}},25.{attemptedSources.0,{expected,field,reason}},{26,35}.{attemptedSources.0,{field,reason}},{29,32,36}.{attemptedSources.{0,1},{expected,field,reason}},{40..43,69}.{attemptedSources,field,reason},{47,48,51,52,64,122}.{attemptedSources,expected,field,reason},{62,63,65,71..121,123..132}.{expected,field,reason},{133..269}}
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

SHA-256 before `937bf0d8bbb2447bb5d5312ca8c313190b091ed3046d807794850263fa0f60dd`; after `be3fa9b30e9828a4eccebfa6e1ad76c82190d69eacccb45a21b44d799da68873`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `523c3a7425d241891612e9809f29f67f1524f954e1baae81f7fb97dae1cd1cd0`; after `a3af7b85bb3c55ba9c302ad794821fc5550c5ec74cd27d59faf226cc17159ad4`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `7e27aab690fab05c0123f0963d5b07c0fc82d469d785509693615a9236a0aa9c`; after `c3c3491e746186ca63bf766896a88ead6df126b032ed4a8fffa01adaec5a4b4f`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `c940d9ec1cdfadca7e5a972e6b88d5b58cab9f817610a3e1bab6b7ee9c3bf3b3`; after `ccba8641619346a803bd23427d7d215f198c4954401774e26842250cf73f0c16`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:b7c9e5bd"` to `"1.95.0:264712b3"`, approved because its version and covered deterministic content changed.

## lly-fixed-analyst

57 independently filed input corrections are listed below. Repeated aliases and dependent FCF are represented by their capex input, not counted again.

| Field | Window | Filed/admitted amount | SEC tag(s) | Filing evidence |
| --- | --- | ---: | --- | --- |
| incomeAnnual.interestExpense | 2025-01-01 to 2025-12-31 | 895000000 USD | us-gaap/InterestExpenseNonoperating | 10-K 0000059478-26-000013, filed 2026-02-12 |
| incomeAnnual.sellingGeneralAndAdministrativeExpenses | 2020-01-01 to 2020-12-31 | 6121200000 USD | us-gaap/SellingGeneralAndAdministrativeExpense | 10-K 0000059478-21-000083, filed 2021-02-17 |
| incomeAnnual.sellingGeneralAndAdministrativeExpenses | 2019-01-01 to 2019-12-31 | 6213800000 USD | us-gaap/SellingGeneralAndAdministrativeExpense | 10-K 0000059478-20-000057, filed 2020-02-19 |
| incomeQuarterly.interestExpense | 2025-10-01 to 2025-12-31 | 222600000 USD (compatible YTD difference) | us-gaap/InterestExpenseNonoperating | 10-K 0000059478-26-000013, filed 2026-02-12 + 10-Q 0000059478-25-000254, filed 2025-10-30 |
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

SHA-256 before `1e45f11f6a39257b63f83a4e053cf6bb263046763b7f888c468aab96ca23ffbe`; after `cfe3dd9cd5e5df5c65ddcc4725a0fa737696a5f541026ece78a29a5d18daf47f`.

631 changed JSON leaves, all enumerated below.

- **capital (30 leaves):** Statement-specific D&A, admitted capex, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.{capexIntensity.{series.{0,1}.{capex,capexToDA,capexToRevenuePct},slopePctPtsPerYear},current.{cashBridge.{afterSbcStandardizedFcf,cashCapitalExpenditure,definition,standardizedFcf},{fcfBeforeSbc,fcfConversionBeforeSbc,interestExpense,sbcPctOfFcf},filedCashFlows.capitalExpenditure},fcf.series.{0,1}.{fcf,fcfBeforeSbc,fcfConversion,fcfConversionBeforeSbc,note},interestCoverage.{interestExpense,value},maintenanceVsGrowthCapex.capexToDA5yAvg,netDebtToEbitda.ebitdaComputed}
```

- **gaps (494 leaves):** New filed substitutions and missing-compatible-counterpart disclosures are added; recovered typed value-only conflicts retire only their own old refusal. Array positions shift after insertion.

```text
gaps.{{14,15,27,29,43..45,121}.{attemptedSources,field,reason},{16,22,25,41,48,51,54,55,58,59,83,87,94,97,100,103,107,110..112,115,122,125,126,129,130}.{field,reason},17.{field,reason,severity},{18..20}.{attemptedSources,expected,field,reason,severity},{21,23,28,34,46,47,119,120}.{attemptedSources,expected,field,reason},24.{attemptedSources.0,{expected,field,reason}},{26,30,31,33,36..38,42}.{attemptedSources.{0,1},{field,reason}},{32,35,40}.{attemptedSources.{0,1},{expected,field,reason}},39.{attemptedSources.0,{field,reason}},{49,50,52,53,56,57,60..82,84..86,88..93,95,96,98,99,101,102,104..106,108,109,113,114,116..118,123,124,127,128,131}.{expected,field,reason},{132..268}}
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

SHA-256 before `69f9dacf4b21c582d3cbd401865d688b0ff02a3a97694286123308224c1ab6c3`; after `bde37798199d601b178235722687040dfeabcad6c8e18ba4f89ebb2bbc804892`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `d75787e1eff32fd770febb336fe5d1e50c0060c3747c9343bdad34b5e3b26ee7`; after `ef45abd3c9215598a463a54818416a3598d658edfe2c9808c80f922da9626b3c`.

1607 changed JSON leaves, all enumerated below.

- **appendix (1460 leaves):** Substitution/missing-data/provenance records carry the changed inputs, filings and compatibility stamps; ordered arrays shift after additions. Existing unknown evidence stays unknown.

```text
appendix.{consistencyChecks.unit.{checked,passed},missingData.{{15,16,28,29,39,44,54..56,132}.{attemptedSources,field,reason},{17,23,26,52,59,62,65,66,69,70,94,98,105,108,111,114,118,121..123,126,133,136,137,140,141}.{field,reason},18.{field,reason,severity},{19..21}.{attemptedSources,expected,field,reason,severity},{22,24,57,58,130,131}.{attemptedSources,expected,field,reason},{25,31,38,49}.{attemptedSources.0,{expected,field,reason}},{27,43,45,47,48,53}.{attemptedSources.{0,1},{field,reason}},{30,33..37,50}.{attemptedSources.0,{field,reason}},{32,40..42,46,51}.{attemptedSources.{0,1},{expected,field,reason}},{60,61,63,64,67,68,71..93,95..97,99..104,106,107,109,110,112,113,115..117,119,120,124,125,127..129,134,135,138,139,142}.{expected,field,reason},{143..279}},provenanceCoverage.{factualValidation.{rate,unchecked,validated},numeric.{rate,supported}},verificationLog.{{2,6,24,32,38,74,75,80,82,83,89,101,103,116,118,123}.{note,outcome,reason,traceKind,validationStatus},107.{claim,note},{108,110..112,196,201,202,257,285..344,499}.claim,{346,448,470,503,733}.{claimSupportStatus,note,numericSupportStatus,reason,traceKind,validationStatus},818.{note,reason,source,traceKind},{819..838,840,841,847..849,853..856,859,860,863}.{claim,note,path,source},{839,844..846,851,852,857,858,861,862}.{claim,note,path},842.{claim,note,path,reason,traceKind},843.{note,reason,traceKind},{850,865..930,932..1096,1098..1146}.{claim,path},864.{claim,evidenceKind,note,path,reason,source,traceKind},{931,1097}.path,1147},verificationRate}
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
meta.{consistencyChecks.unit.{checked,passed},dataCompleteness.warningCount,provenanceCoverage.{factualValidation.{rate,unchecked,validated},numeric.{rate,supported}},{specVersion,verificationRate}}
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

SHA-256 before `bd0a7a989bddcbffa73476a3fa02dca39d97acdc4c7f9e925a299c33e054ad78`; after `eccf37de08395bcc0bade7092620ff71c51ed64094670b249acc630ac13e4328`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `a932199ba534591fe53134332098ccb86b6fb1b764dd6138a08928f3d82ee462`; after `7801c259e6036ed102017f962ce20c673937e79595065dd61deda9511e6b30cd`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `d70eedde9a048c23cee2120fdc6b233af18c65ac2015a87a06d19eae3c83acf7`; after `5e2d81bc272b0ae14386e30437d7c3283f2a7c5bee1b926c65dd95018337cbfe`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `d4ba9d570cee6b1a08202f71bb7dafc019c7651e7c5756e23cb6e4054bf0e625`; after `42250dbba01301fdf94970480078e293f521cd5f0dc938a3c989aec5a6c112a4`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:b7c9e5bd"` to `"1.95.0:264712b3"`, approved because its version and covered deterministic content changed.

## Review follow-up, 2026-11-14

Comparison: pinned main cf3eb287; review-before is branch 7b172879. Current outputs also include the normal merge of main 742d4d2f (D-263). Input amounts below are filed facts, never vendor rows. Derived scores and valuation comparisons are Metis outputs, not independently filed model values.

| Case | Main warnings | Review-before warnings | Final warnings | Composite main → final | Composite review-before → final |
| --- | ---: | ---: | ---: | --- | --- |
| amzn-data-only | 8 | 8 | 8 | 56.12 → 56.12 | 56.12 → 56.12 |
| figr-data-only | 27 | 33 | 33 | 53.53 → 53.53 | 53.53 → 53.53 |
| meta-data-only | 44 | 50 | 50 | 60 → 60 | 60 → 60 |
| mu-data-only | 36 | 36 | 36 | 77.91 → 77.91 | 77.91 → 77.91 |
| nvda-data-only | 8 | 8 | 8 | 75.97 → 75.97 | 75.97 → 75.97 |
| qcom-data-only | 4 | 12 | 12 | 56.96 → 56.96 | 56.96 → 56.96 |
| jpm-data-only | 14 | 15 | 15 | 56.54 → 56.47 | 56.47 → 56.47 |
| pgr-data-only | 41 | 42 | 42 | 59.72 → 59.72 | 59.72 → 59.72 |
| o-data-only | 32 | 33 | 33 | 51.09 → 51.09 | 51.09 → 51.09 |
| duk-data-only | 75 | 83 | 83 | 57.29 → 57.3 | 57.5 → 57.3 |
| tsm-data-only | 7 | 35 | 34 | 72.35 → 72.35 | 72.35 → 72.35 |
| rivn-data-only | 33 | 37 | 37 | 45.97 → 45.97 | 45.97 → 45.97 |
| vktx-data-only | 54 | 81 | 76 | 43.95 → 43.95 | 43.95 → 43.95 |
| amzn-fixed-analyst | 9 | 9 | 9 | 56.12 → 56.12 | 56.12 → 56.12 |
| meta-fixed-analyst | 46 | 52 | 52 | 60 → 60 | 60 → 60 |
| mu-fixed-analyst | 37 | 37 | 37 | 77.91 → 77.91 | 77.91 → 77.91 |
| nvda-fixed-analyst | 11 | 11 | 11 | 75.97 → 75.97 | 75.97 → 75.97 |
| lly-data-only | 12 | 16 | 16 | 63.74 → 63.59 | 63.59 → 63.59 |
| lly-fixed-analyst | 13 | 17 | 17 | 63.74 → 63.59 | 63.59 → 63.59 |

Operating-part check: 222 rows with R&D, SG&A and an operating-expense total; 11 have corrected parts; 4 previously agreeing part sums cease agreeing under the existing P8 same-observation rule. Every independent part correction now carries a row-dated mixed-basis disclosure; no total is plugged.

### Same-quantity review reversions

All earlier income-D&A substitutions are removed: JPM Q3 2026; DUK FY2025 and Q3 2026; LLY FY2024 and Q1?Q3 2025. The cash add-back never establishes the income line. DUK restores filed CostDepreciationAmortizationAndDepletion 6,324M (FY2025, 10-K 0001326160-26-000014, 2026-02-26) and 1,709M (Q3 2026, 10-Q 0001326160-26-000051, 2026-11-05). The other retained income observations are unverified and their vendor amounts are not reproduced here. PGR?s 34 InterestAndDividendIncomeOperating substitutions are also removed: a combined line cannot prove interest alone. No independently filed interest-only replacement is claimed.

### Parallel branch frozen-record receipts

The merged live log follows main?s linear hash chain and records D-262?s scoped integration. These earlier branch receipts preserve the parallel history rather than falsely chaining its hashes after D-263. All receipts concern synthetic fixtures, not vendor data.

| Target | Date | Before hash | After hash | Changed leaves |
| --- | --- | --- | --- | ---: |
| audit-fixture | 2026-11-14 | `738cfcfcc5658feaa1e6360c74d36260bc60c7153c36216699d50f7be76ac975` | `dac441547fca213787b1a2ac190cbbb72037fa29740b19185c9295b8369eb9bd` | 4 |
| stagec-payload | 2026-11-14 | `f90848c2e57a07702d5d2491d00b9cbffb1fd800546aee150cd8f830420fa2da` | `b39c36e6f4d888513e6e368fb6c1e30835bf717bceba773c8862d55126096c67` | 11 |
| audit-fixture | 2026-11-14 | `dac441547fca213787b1a2ac190cbbb72037fa29740b19185c9295b8369eb9bd` | `f2fec74e3c9a00fb4108d54c629e6ec0e7b935b7106525a5b10a833b8f82f76d` | 2 |
| audit-fixture | 2026-11-14 | `e807d4dbb303980754701a2418b13358d1947d0ab0cfeddcc5eec6f0848dc79c` | `d1c8aac937934a1019868929c16721f721813a290f7229969b3fc597e1dc2d75` | 2 |
| stagec-payload | 2026-11-14 | `77754c944ec592e40f0f341188b48fa91016c51f422a6e659caa27f86cf58b78` | `168dfa18f0252101295afebc7cb073540e07f3c3b323f95af24462f7f97e3316` | 1 |

### Discarded wider filed observations

These are public filed quantities formerly substituted into a different field. Their amounts do not prove the income field. Final retained observations remain unverified and vendor amounts are not reproduced.

| Case | Field / period | Wider filed amount (USD) | Tag | Filing |
| --- | --- | ---: | --- | --- |
| jpm-data-only | depreciationAndAmortization: 2026-07-01 to 2026-09-30 | 2903000000 | us-gaap/DepreciationAmortizationAndAccretionNet | 10-Q 0001628280-26-069523, 2026-11-03 + 10-Q 0001628280-26-054343, 2026-08-06 |
| pgr-data-only | interestIncome: 2025-01-01 to 2025-12-31 | 3583000000 | us-gaap/InterestAndDividendIncomeOperating | 10-K 0000080661-26-000086, 2026-03-02 |
| pgr-data-only | interestIncome: 2024-01-01 to 2024-12-31 | 2832000000 | us-gaap/InterestAndDividendIncomeOperating | 10-K 0000080661-25-000007, 2025-03-03 |
| pgr-data-only | interestIncome: 2023-01-01 to 2023-12-31 | 1891800000 | us-gaap/InterestAndDividendIncomeOperating | 10-K 0000080661-24-000007, 2024-02-26 |
| pgr-data-only | interestIncome: 2022-01-01 to 2022-12-31 | 1260300000 | us-gaap/InterestAndDividendIncomeOperating | 10-K 0000080661-23-000006, 2023-02-27 |
| pgr-data-only | interestIncome: 2021-01-01 to 2021-12-31 | 860900000 | us-gaap/InterestAndDividendIncomeOperating | 10-K 0000080661-22-000046, 2022-02-28 |
| pgr-data-only | interestIncome: 2020-01-01 to 2020-12-31 | 936600000 | us-gaap/InterestAndDividendIncomeOperating | 10-K 0000080661-21-000014, 2021-03-01 |
| pgr-data-only | interestIncome: 2019-01-01 to 2019-12-31 | 1042000000 | us-gaap/InterestAndDividendIncomeOperating | 10-K 0000080661-20-000006, 2020-03-02 |
| pgr-data-only | interestIncome: 2018-01-01 to 2018-12-31 | 820500000 | us-gaap/InterestAndDividendIncomeOperating | 10-K 0000080661-19-000008, 2019-02-27 |
| pgr-data-only | interestIncome: 2017-01-01 to 2017-12-31 | 563100000 | us-gaap/InterestAndDividendIncomeOperating | 10-K 0000080661-18-000011, 2018-02-27 |
| pgr-data-only | interestIncome: 2016-01-01 to 2016-12-31 | 478900000 | us-gaap/InterestAndDividendIncomeOperating | 10-K 0000080661-17-000012, 2017-03-01 |
| pgr-data-only | interestIncome: 2026-07-01 to 2026-09-30 | 1035000000 | us-gaap/InterestAndDividendIncomeOperating | 10-Q 0000080661-26-000379, 2026-11-02 |
| pgr-data-only | interestIncome: 2026-04-01 to 2026-06-30 | 979000000 | us-gaap/InterestAndDividendIncomeOperating | 10-Q 0000080661-26-000308, 2026-08-03 |
| pgr-data-only | interestIncome: 2026-01-01 to 2026-03-31 | 917000000 | us-gaap/InterestAndDividendIncomeOperating | 10-Q 0000080661-26-000177, 2026-05-04 |
| pgr-data-only | interestIncome: 2025-10-01 to 2025-12-31 | 974000000 | us-gaap/InterestAndDividendIncomeOperating | 10-K 0000080661-26-000086, 2026-03-02 + 10-Q 0000080661-25-000129, 2025-11-03 |
| pgr-data-only | interestIncome: 2025-07-01 to 2025-09-30 | 924000000 | us-gaap/InterestAndDividendIncomeOperating | 10-Q 0000080661-25-000129, 2025-11-03 |
| pgr-data-only | interestIncome: 2025-04-01 to 2025-06-30 | 871000000 | us-gaap/InterestAndDividendIncomeOperating | 10-Q 0000080661-25-000051, 2025-08-04 |
| pgr-data-only | interestIncome: 2025-01-01 to 2025-03-31 | 814000000 | us-gaap/InterestAndDividendIncomeOperating | 10-Q 0000080661-25-000023, 2025-05-05 |
| pgr-data-only | interestIncome: 2024-10-01 to 2024-12-31 | 789900000 | us-gaap/InterestAndDividendIncomeOperating | 10-K 0000080661-25-000007, 2025-03-03 + 10-Q 0000080661-24-000045, 2024-11-04 |
| pgr-data-only | interestIncome: 2024-07-01 to 2024-09-30 | 739500000 | us-gaap/InterestAndDividendIncomeOperating | 10-Q 0000080661-24-000045, 2024-11-04 |
| pgr-data-only | interestIncome: 2024-04-01 to 2024-06-30 | 685000000 | us-gaap/InterestAndDividendIncomeOperating | 10-Q 0000080661-24-000031, 2024-08-05 |
| pgr-data-only | interestIncome: 2024-01-01 to 2024-03-31 | 617600000 | us-gaap/InterestAndDividendIncomeOperating | 10-Q 0000080661-24-000018, 2024-05-06 |
| pgr-data-only | interestIncome: 2023-10-01 to 2023-12-31 | 507500000 | us-gaap/InterestAndDividendIncomeOperating | 10-K 0000080661-24-000007, 2024-02-26 + 10-Q 0000080661-23-000049, 2023-10-31 |
| pgr-data-only | interestIncome: 2023-07-01 to 2023-09-30 | 510200000 | us-gaap/InterestAndDividendIncomeOperating | 10-Q 0000080661-23-000049, 2023-10-31 |
| pgr-data-only | interestIncome: 2023-04-01 to 2023-06-30 | 454500000 | us-gaap/InterestAndDividendIncomeOperating | 10-Q 0000080661-23-000037, 2023-08-01 |
| pgr-data-only | interestIncome: 2023-01-01 to 2023-03-31 | 419600000 | us-gaap/InterestAndDividendIncomeOperating | 10-Q 0000080661-23-000023, 2023-05-02 |
| pgr-data-only | interestIncome: 2022-10-01 to 2022-12-31 | 392100000 | us-gaap/InterestAndDividendIncomeOperating | 10-K 0000080661-23-000006, 2023-02-27 + 10-Q 0000080661-22-000080, 2022-11-01 |
| pgr-data-only | interestIncome: 2022-07-01 to 2022-09-30 | 333600000 | us-gaap/InterestAndDividendIncomeOperating | 10-Q 0000080661-22-000080, 2022-11-01 |
| pgr-data-only | interestIncome: 2022-04-01 to 2022-06-30 | 292400000 | us-gaap/InterestAndDividendIncomeOperating | 10-Q 0000080661-22-000071, 2022-08-02 |
| pgr-data-only | interestIncome: 2022-01-01 to 2022-03-31 | 242200000 | us-gaap/InterestAndDividendIncomeOperating | 10-Q 0000080661-22-000058, 2022-05-02 |
| pgr-data-only | interestIncome: 2021-10-01 to 2021-12-31 | 221100000 | us-gaap/InterestAndDividendIncomeOperating | 10-K 0000080661-22-000046, 2022-02-28 + 10-Q 0000080661-21-000053, 2021-11-02 |
| pgr-data-only | interestIncome: 2021-07-01 to 2021-09-30 | 208900000 | us-gaap/InterestAndDividendIncomeOperating | 10-Q 0000080661-21-000053, 2021-11-02 |
| pgr-data-only | interestIncome: 2021-04-01 to 2021-06-30 | 210700000 | us-gaap/InterestAndDividendIncomeOperating | 10-Q 0000080661-21-000044, 2021-08-03 |
| pgr-data-only | interestIncome: 2021-01-01 to 2021-03-31 | 220200000 | us-gaap/InterestAndDividendIncomeOperating | 10-Q 0000080661-21-000030, 2021-05-04 |
| pgr-data-only | interestIncome: 2020-10-01 to 2020-12-31 | 221100000 | us-gaap/InterestAndDividendIncomeOperating | 10-K 0000080661-21-000014, 2021-03-01 + 10-Q 0000080661-20-000040, 2020-11-03 |
| duk-data-only | depreciationAndAmortization: 2025-01-01 to 2025-12-31 | 7704000000 | us-gaap/DepreciationDepletionAndAmortization | 10-K 0001326160-26-000014, 2026-02-26 |
| duk-data-only | depreciationAndAmortization: 2026-07-01 to 2026-09-30 | 1830000000 | us-gaap/DepreciationDepletionAndAmortization | 10-Q 0001326160-26-000051, 2026-11-05 + 10-Q 0001326160-26-000040, 2026-08-04 |
| lly-data-only | depreciationAndAmortization: 2024-01-01 to 2024-12-31 | 1766600000 | us-gaap/DepreciationDepletionAndAmortization | 10-K 0000059478-25-000067, 2025-02-19 |
| lly-data-only | depreciationAndAmortization: 2025-07-01 to 2025-09-30 | 470000000 | us-gaap/DepreciationDepletionAndAmortization | 10-Q 0000059478-25-000254, 2025-10-30 + 10-Q 0000059478-25-000204, 2025-08-07 |
| lly-data-only | depreciationAndAmortization: 2025-04-01 to 2025-06-30 | 478500000 | us-gaap/DepreciationDepletionAndAmortization | 10-Q 0000059478-25-000204, 2025-08-07 + 10-Q 0000059478-25-000132, 2025-05-01 |
| lly-data-only | depreciationAndAmortization: 2025-01-01 to 2025-03-31 | 462800000 | us-gaap/DepreciationDepletionAndAmortization | 10-Q 0000059478-25-000132, 2025-05-01 |

### DUK derived numeric changes in this review

These are unchanged-formula consequences of restoring the same income expense quantity proved above, not additional input substitutions.

| Stage B leaf | Review-before | Final |
| --- | ---: | ---: |
| `.scores.aspects.valuation.drivers.0.value` | 14.492153715203843 | 17.36935145189677 |
| `.scores.aspects.valuation.score` | 83.81 | 81.12 |
| `.scores.aspects.valuation.signals.0.contributionPoints` | 2.4263629090294083 | 2.2336319601600247 |
| `.scores.aspects.valuation.signals.0.operands.0.value` | 11.50496948050432 | 11.58680484039739 |
| `.scores.aspects.valuation.signals.0.operands.1.value` | 14.492153715203843 | 17.36935145189677 |
| `.scores.aspects.valuation.signals.0.operands.3.value` | 10.821550315199627 | 10.89852448415731 |
| `.scores.aspects.valuation.signals.0.raw` | 14.492153715203843 | 17.36935145189677 |
| `.scores.aspects.valuation.signals.0.transformedScore` | 83.80732319914308 | 81.12193864489635 |
| `.scores.assessments.valuation.score` | 83.81 | 81.12 |
| `.scores.composite.score` | 57.5 | 57.3 |
| `.scores.factorExposure.5.aboveNeutralPoints` | 2.4263629090294083 | 2.2336319601600247 |
| `.valuation.multiples.multiples.1.current` | 11.50496948050432 | 11.58680484039739 |
| `.valuation.multiples.multiples.1.ownHistory.observationDetails.0.value` | 10.821550315199627 | 10.89852448415731 |
| `.valuation.multiples.multiples.1.ownHistory.p5` | 11.200254139422036 | 11.219497681661455 |
| `.valuation.multiples.multiples.1.ownHistory.percentileRank` | 14.492153715203843 | 17.36935145189677 |

Parallel-branch receipt details (scope and changed paths preserved):

```json
[
  {
    "date": "2026-11-14",
    "target": "audit-fixture",
    "decision": "D-262",
    "reason": "D-262 changes the declared filed PP&E precedence and report version; synthetic DEMO arithmetic and all unrelated leaves remain pinned.",
    "scope": [
      "$.projectionSha256",
      "$.projection.stageB.capital.current.cashBridge.definition",
      "$.projection.report.meta.specVersion",
      "$.projection.report.balanceSheet.coverage.commentary[1].text"
    ],
    "beforeSha256": "738cfcfcc5658feaa1e6360c74d36260bc60c7153c36216699d50f7be76ac975",
    "afterSha256": "dac441547fca213787b1a2ac190cbbb72037fa29740b19185c9295b8369eb9bd",
    "changedLeaves": 4,
    "changedPaths": [
      "$.projectionSha256",
      "$.projection.stageB.capital.current.cashBridge.definition",
      "$.projection.report.meta.specVersion",
      "$.projection.report.balanceSheet.coverage.commentary[1].text"
    ]
  },
  {
    "date": "2026-11-14",
    "target": "stagec-payload",
    "decision": "D-262",
    "reason": "D-262 identifies the filed PP&E precedence in the capital definition and advances payload compatibility; numeric synthetic fixture values are unchanged.",
    "scope": [
      "$.payloadVersion",
      "$.fingerprint",
      "$.summary.promptBytes",
      "$.summary.promptFnv1a32",
      "$.prompt.bytes",
      "$.prompt.sha256",
      "$.prompt.sections[0].sha256",
      "$.prompt.sections[6].bytes",
      "$.prompt.sections[6].sha256",
      "$.payload.payloadVersion",
      "$.payload.computed[4].notes[1]"
    ],
    "beforeSha256": "f90848c2e57a07702d5d2491d00b9cbffb1fd800546aee150cd8f830420fa2da",
    "afterSha256": "b39c36e6f4d888513e6e368fb6c1e30835bf717bceba773c8862d55126096c67",
    "changedLeaves": 11,
    "changedPaths": [
      "$.payloadVersion",
      "$.fingerprint",
      "$.summary.promptBytes",
      "$.summary.promptFnv1a32",
      "$.prompt.bytes",
      "$.prompt.sha256",
      "$.prompt.sections[0].sha256",
      "$.prompt.sections[6].bytes",
      "$.prompt.sections[6].sha256",
      "$.payload.payloadVersion",
      "$.payload.computed[4].notes[1]"
    ]
  },
  {
    "date": "2026-11-14",
    "target": "audit-fixture",
    "decision": "D-262",
    "reason": "D-262 review moves report compatibility to 1.77.0 to reserve 1.76.0 for D-263; synthetic arithmetic remains unchanged.",
    "scope": [
      "$.projectionSha256",
      "$.projection.report.meta.specVersion"
    ],
    "beforeSha256": "dac441547fca213787b1a2ac190cbbb72037fa29740b19185c9295b8369eb9bd",
    "afterSha256": "f2fec74e3c9a00fb4108d54c629e6ec0e7b935b7106525a5b10a833b8f82f76d",
    "changedLeaves": 2,
    "changedPaths": [
      "$.projectionSha256",
      "$.projection.report.meta.specVersion"
    ]
  },
  {
    "date": "2026-11-14",
    "target": "audit-fixture",
    "decision": "D-262",
    "reason": "D-262 merges D-263 proof metadata and uses reserved report spec 1.78.0; synthetic calculation values remain unchanged.",
    "scope": [
      "$.projectionSha256",
      "$.projection.report.meta.specVersion",
      "$.projection.stageB.capital.current.ebitdaComputed",
      "$.projection.stageB.capital.netDebtToEbitda.ebitdaComputed"
    ],
    "beforeSha256": "e807d4dbb303980754701a2418b13358d1947d0ab0cfeddcc5eec6f0848dc79c",
    "afterSha256": "d1c8aac937934a1019868929c16721f721813a290f7229969b3fc597e1dc2d75",
    "changedLeaves": 2,
    "changedPaths": [
      "$.projectionSha256",
      "$.projection.report.meta.specVersion"
    ]
  },
  {
    "date": "2026-11-14",
    "target": "stagec-payload",
    "decision": "D-262",
    "reason": "D-262 merge combines D-263 affirmative producer metadata with the filed-flow capital definition; only the provenance hash changes.",
    "scope": [
      "$.summary.provenanceHash"
    ],
    "beforeSha256": "77754c944ec592e40f0f341188b48fa91016c51f422a6e659caa27f86cf58b78",
    "afterSha256": "168dfa18f0252101295afebc7cb073540e07f3c3b323f95af24462f7f97e3316",
    "changedLeaves": 1,
    "changedPaths": [
      "$.summary.provenanceHash"
    ]
  }
]
```
