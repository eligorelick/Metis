# D-262 approved offline replay changes

Baseline: main `cf3eb287`. Both runs use identical frozen local inputs and Node 24, with the harness network blocked. No model or paid provider is called. This record lists filed input corrections, their propagated report changes, and every differing JSON leaf. Original vendor rows and report exports are not reproduced.

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

SHA-256 before `9381e9cafc27f42b7f7a6c4048bc887e0dd19aea32962a8bbffc3e5e6ab459c4`; after `18c48fe6bbe0164383396b45160953b9e4b7f48c823d1a247ab09059818d1ac3`.

306 changed JSON leaves, all enumerated below.

- **capital (1 leaves):** Statement-specific D&A, admitted capex, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

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

SHA-256 before `2dbcf2787731fe38a3bada47664855d48c17012430236b85a2eeb5f247bbe7c2`; after `5cf63c7b777e0a3dd92338749d07f9b2666c30cbc9807e4d794d37dbe19ea3ae`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `cb8a4884af74bf8643841a341761d6c772d80fdec65e8f41351bb6455dac0248`; after `649b645ec1e5b365249d3f656ffd358d3e83f605687317818eb33b003e878df1`.

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

SHA-256 before `818a87ecd255fcbf019cc2bd50c65d8822fad04323662c240f39a981cf2a028b`; after `3e2c64d89f5938e4a63cb5329994ccbab99e7685aebcab6bca3b8974f40b7d39`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `8008e09ee39a70245dbbed0bc8be4cafa37d29ade0c7b48814e7e6294293b5be`; after `deb76a36e5b7d288aa670f2a0c9df6f3789a1387b1eb3b5b5aeaf2d16b6aa1af`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `fe75285733330a2451dbfde4c9d5e1dbe5eae93047328a2d8a41127e0d228a35`; after `8ac1ca5049cc686834286f6be4b9d0c68018f60c1aa252eb9d7c240f6eb5ab16`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `9d63c422d74a7003ff5d365b924984d44048f07c37f5fffec255b9ab657333cf`; after `a3fb5b86ae39f6b90e2bcc21e7397da54fe2e539bef42dd4dc56e8f56a95501e`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:d3a902a8"` to `"1.95.0:e15627bd"`, approved because its version and covered deterministic content changed.

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

SHA-256 before `e4e38961697bd6e4fb7541e06e9e7cf9f765b686131e7780d076873ce8ed2e9d`; after `ee7bd689e3fc62ae265a343c456999290e3bfa14c48006500b5c20fb48938fbb`.

251 changed JSON leaves, all enumerated below.

- **gaps (251 leaves):** New filed substitutions and missing-compatible-counterpart disclosures are added; recovered typed value-only conflicts retire only their own old refusal. Array positions shift after insertion.

```text
gaps.{{27..29,51,64..66,70..72,79..81,90,91}.{field,reason},{30,34,35}.{attemptedSources,field,reason,severity},31.{attemptedSources,expected,field,reason,severity},{32,33}.{field,reason,severity},36.{attemptedSources.{0..2},{expected,field,reason}},37.{attemptedSources.{0..2},{field,reason}},{38,44,58..60,82..84}.{attemptedSources,field,reason},{39,42,43,45..50,52,53,57,61..63,87}.{attemptedSources,expected,field,reason},{40,41}.{attemptedSources.0,{expected,field,reason}},{54..56}.{attemptedSources.{0,1},{field,reason}},{67..69,73..78,85,86,88,89}.{expected,field,reason},{92..131}}
```

### payload.txt

SHA-256 before `ed8afe3ddc9d99a22ff24526ec4b2fe28be8a08cb09c421e6a2ef70587a598b7`; after `e8a3ceee3b8de0342859126ce341186815c61b3c74d563d057115195a6d5d198`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `802a33ed6447a242d8e56f788c0dbba742ce423adfd91e10eeb9e3d679f971ce`; after `2e80ed8c8a72b13d67412aeaef9f68b4fb14ff611af06502b94c8a119f8e677f`.

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

SHA-256 before `d595dbbba285e6b4cab71e530f0dbbf1cca8106a95b10bfc9021760158ca5fc4`; after `01302f7b4d2758b25ec7818df4d2f5e13ddc4677c6be741e6370d0712a88a88e`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `af1525136f250637f4053c6b025d686fa69ef1184ada07251b9dd64221bbe6c9`; after `3433d1d197d0d101847653166c1aebf251bb802533325081dc905d74f77d51d4`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `5e6a67d3b772385379a245cbd2c459808edd03439352b897e78f8aeae8b1f6e5`; after `df17506fb95d63ad53876a7ce80c0d3fc322c5e501905889951b18f13310a8b4`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `d8bd6f95d36424fe16d2860fd343602d635db1e39b52e7c19ade255399e39c8d`; after `69bf08b223bb887486b4a8216b4f3f2e3670b9080b9379afc649ae73624149f1`.

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

SHA-256 before `ebfb1046771b5640b383fc795c0741adb0ca38241b7a92acf9a40dc827f0adab`; after `9f8547e32a3369342abfff5ccd06fd404ede13d88f473b9cb051a8c5902283bc`.

411 changed JSON leaves, all enumerated below.

- **capital (3 leaves):** Statement-specific D&A, admitted capex, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

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

SHA-256 before `0d676d6a44378b390501ae457aff13995de5ed4d6926799219c576cf101457df`; after `f6a5371b09fbf28cb8c296a1f0793049928df61db1eb0a4c5bbab910a7f26e8f`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `850c3ea8c7f9e939f13d4507229f8fc88d4eea7bcf1779529565bf750073dc38`; after `266b0a314cf4a7c253fa0231d8a087a653353edaafa3e0d6e16d1a968d28ab2d`.

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

SHA-256 before `663f92764de714722e6f8398807b7cc8e78e7715df61ce5f76ffa0c434a372bf`; after `d45b72f5016af67b83fb2980070e10afd75cf9c64174b4763ff769a145ce283f`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `13e70700c8f89586ca188a880613fe11585aff2e6f69cf946d377ca9cab65555`; after `d48145cc454efbd99c5917c2ea5d41ad4b13e94116750960800b7f9365865797`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `99fa29d6435dafc1bfda9e2874ed5c410986c7b8532221b3cf62f9c9b322d936`; after `4ac26e9d70fed4bd7cd91a067ccaac48cf10b7f1c2b19d112a67d561ac6cc063`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `07257d30b6c467d04db09f932a83e94c8ac03ea810aa9141ddde03fe32264430`; after `24827bac80e4d45e51ae631f6867fa406f5103c5996f2fb3c4f3131bf43974c1`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:0ff64fb6"` to `"1.95.0:36ed8be1"`, approved because its version and covered deterministic content changed.

## mu-data-only

No scalar input correction: only the revised definition, compatibility identifiers and explicit unverified-coverage disclosures change.

| Field | Window | Filed/admitted amount | SEC tag(s) | Filing evidence |
| --- | --- | ---: | --- | --- |

### stageB.json

SHA-256 before `221c0a467a91e1522bdce283b855072801ae97ddd1061ea42d148fc3c34fbae9`; after `6fd276e28539f97b5a67dc5e30d11efa630d219e92d06ef211f128a745fef058`.

1 changed JSON leaves, all enumerated below.

- **capital (1 leaves):** Statement-specific D&A, admitted capex, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.current.cashBridge.definition
```

### payload.txt

SHA-256 before `53df00250317a2a31da0ac982654047e5981407bff273bb0c03cb4c9476fc50a`; after `505593efc9310d50fca7157d3259553eece4a92e649278b9b16a0510f307fa4d`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `b0e28b9b520a56476caf612331073c1fbb0d4b74e12e5a73232b310161c95ec0`; after `09485f78d606551e79362d4fe3f13f3183f908d0bee5f622ed81dbcf7b60c4a3`.

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

SHA-256 before `12437439152797de8848c6db7dca8037106d99494564c139697c509aea03809b`; after `be497303b640799aff716ae2d7190148c5a2c1610868164a75486324e3840f01`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `8b24306478846c0b6cb498dc16652295eec851936a2809b75d4750528240afc1`; after `d25ba35c674d7a6b22879a6465c4c2805e4769a6ea4a0ff987d77454a4836a39`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `2ec772ef496d4b10a917e11d1bcfa234284d5c094440b6ef595e0263772f0a97`; after `455b56980d616c1b463600538c402096dc730bd149a8495a5112d7a0309e8dff`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `9aa87a104010828199f13cdf3aefd73848835b98c33098e12d47be3378966500`; after `b208ad4622ecf10d7979a08d988da4a872759b0e8292c31132e97e85a7533714`.

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

SHA-256 before `b4f6677ad08d828bc353afaf4bbe835a42154e54dea708fc178316c14f37e553`; after `34fb2ca82371a3b4656a8b2390dc3f86e872b500bdb05356ae9a3656e7de608e`.

180 changed JSON leaves, all enumerated below.

- **capital (1 leaves):** Statement-specific D&A, admitted capex, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.current.cashBridge.definition
```

- **gaps (179 leaves):** New filed substitutions and missing-compatible-counterpart disclosures are added; recovered typed value-only conflicts retire only their own old refusal. Array positions shift after insertion.

```text
gaps.{{51..61}.{field,reason},{62..89,91,92}.{expected,field,reason},90.{attemptedSources,expected,field,reason},{93..155}}
```

### payload.txt

SHA-256 before `c4abe6679d23ad37e37f446db0418e80d211224167956131f42ed774e1ad9e3e`; after `ba02bcba8923fa8370f1bbb3a02e0d9dc4e387f4b445eeca5f259941dec7796c`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `d067ae4092241a52825e12a18f73f6a246fe941cb816321044b06cafca6d6f2a`; after `7457b4bd78ff69b3a57e89d3b1fde9087c6a7043735002bc06f23aadc61e5b50`.

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

SHA-256 before `bee69308c1a5eb7d4073ef7adbd6e68c45aa9f7db9a91f0246665df2d1b58f28`; after `f09619e6ee155949fc284e56c4c3b6de65f915fba42d208186dc1e7ef66cd9d6`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `762cf1a6cd0f25ae046021e372758debe8484d04b920cd231f70022093d9b923`; after `482792ad0343d0e1438e7904c066a87fee3cac5c031b8ee629e3f6635e6e5743`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `43ac6827d0b3f55f2111d5263e4161870869e695fb67a2c794ab613df3cdf96c`; after `6c3093b33495b533207145ca858ff7ab2e4227b4e8c959ff5b13b91df768f197`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `3de91090bd801df2d2ea0ac73be4f88aa4617b3794f4637616864f740284d45e`; after `f06f6645bbc91bdf87445139916ca0d91ccde6ee0866e6fd6d50a3ed8a07a009`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:182abc3c"` to `"1.95.0:e1f4a67c"`, approved because its version and covered deterministic content changed.

## qcom-data-only

2 independently filed input corrections are listed below. Repeated aliases and dependent FCF are represented by their capex input, not counted again.

| Field | Window | Filed/admitted amount | SEC tag(s) | Filing evidence |
| --- | --- | ---: | --- | --- |
| cashflowAnnual.incomeTaxesPaid | 2024-09-30 to 2025-09-28 | 3100000000 USD | us-gaap/IncomeTaxesPaidNet | 10-K 0000804328-25-000085, filed 2025-11-05 |
| cashflowAnnual.incomeTaxesPaid | 2017-09-25 to 2018-09-30 | 877000000 USD | us-gaap/IncomeTaxesPaidNet | 10-K 0001728949-18-000095, filed 2018-11-07 |

### stageB.json

SHA-256 before `b07eb9aea95833b278f0f0f21bd503c5385c7dcaf923f3378e2488b00b11193e`; after `e0abb4f284f760db2d116bb48b7a7f3c7dc27c7aac85a47e0f0314a71012f08a`.

282 changed JSON leaves, all enumerated below.

- **capital (1 leaves):** Statement-specific D&A, admitted capex, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.current.cashBridge.definition
```

- **gaps (281 leaves):** New filed substitutions and missing-compatible-counterpart disclosures are added; recovered typed value-only conflicts retire only their own old refusal. Array positions shift after insertion.

```text
gaps.{{9,11,12}.{field,reason,severity},{10,13,14,16}.{attemptedSources,expected,field,reason,severity},15.{attemptedSources,field,reason,severity},{17,42,59}.{field,reason},{18..20,25,34,36,64}.{attemptedSources,expected,field,reason},{21,22,24,27..29}.{attemptedSources.{0,1},{field,reason}},23.{attemptedSources.{0,1},{expected,field,reason}},{26,31..33,35,37,38}.{attemptedSources,field,reason},30.{attemptedSources.{0..2},{field,reason}},{39..41,43..58,60..63,65..72}.{expected,field,reason},{73..138}}
```

### payload.txt

SHA-256 before `da45b2de65b722a5998f24b19f62c2825588b591eb2c03c3475a55e8e9e082c5`; after `1836a64f4ede9f8e5f343cc6a190dc3e308f137b09c57e12f57e609dacd9a39a`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `fd43370aa275b8076006392653c1c6aac3b70dc695cb832ef12e452e116a08bf`; after `9112bdf0ca6a0650af08c02435974584641388901c31ec71ea093b4996cfacdb`.

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

SHA-256 before `b18066345c106fd5008de7cd9083fce93b6b94f6b51a73228f7086e832ad3acc`; after `2d08e3c153dd2c8bfc71bef80b200a199019e530c1c54d6f796db80053875e37`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `4622245c6e29b02991946348fedd6e8b3258fcf0001f111c9f9dff34a4a47540`; after `dc21f49ae951b7e413b8f5e9f2587f4767cfddbae1ab9c06a225abf8a4cf030c`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `a6af831984ba65e641d70648e63c86e9ebb793fc466f704adf40da0b4833f625`; after `d70cdd5b945b01d85a3c81e3a36260e38e1d2740d7d5188938b9f4c75c6061a7`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `7182ecb944de754759d63341b67ae604485bc8904a75b76bfada4e6a6481fe36`; after `072de8248de56ec248784e486413881facbe51b74061fe155c7e9ea15b5216f4`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:75d7d0b1"` to `"1.95.0:47de36c6"`, approved because its version and covered deterministic content changed.

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

SHA-256 before `49546bede47877232cf872d54a23e2a66c0c36287cdcc07490fa9c6138ae6a6d`; after `c3a77fb60c99deb5d9852450855f05908b98935da959263e9dabd76b3c921a12`.

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

SHA-256 before `73db1a5485b3824dd242eb81deabfac76a84434a6547363635696337d16eb8ea`; after `78f0b3608ca1fa934658807188cf3e5e79f451f729c2c471eef5d5cd6c3cd8d7`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `0d523607ba91c7f861dc21fa862a17d9027eb554ccc9006b1d8eb321df98cebf`; after `8b9e840de9ff588aabbab5d9ed3f228c2c7340166fa14c0706eed1d1d12aa0bd`.

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

SHA-256 before `f2bcb3bcfa5cfc09300413b3054ced95b47ec5e571e3c44eabf88f27f2918d6e`; after `e67155cb35396d339cbb2c4225afe87d7a524349474d3eed555fbd87c8630cdd`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `d92b2007537e0f4c9725bde3f38e20377670880fb8a51cd1a52b599c33756113`; after `baa62c4f77b4faea529579302f72544120b436f7b5ce5f9a895cd7f7d5dfaa32`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `435fe88648a29242dffc5f535e6c8518984db815262a990566b040a63be3ac12`; after `53ed1187cdd57614cfd24df38c2dd7940e02475d4c93f5af340970a1b48da82c`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `da7257f76683ad4921be70a480d90da49122b24ff4300d8410b43e1f3095127a`; after `0be2778bcd0c8b23cd8ed04218f382a71ef796de6f465773618503c0cca52078`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:c7a70366"` to `"1.95.0:9dda21f9"`, approved because its version and covered deterministic content changed.

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

SHA-256 before `36b6896b51f3d7b7856f3a11fa9344e961117f5918814a7668b5ea74218b01e0`; after `1dc53c3dd9956c98d7d8c31331629e7391fad026c4612b443a885e51d27cb217`.

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

SHA-256 before `cfb77c3fd7a14137bddc8bafffe9c253e4fbbcdbe31c60a98e92426aacd24686`; after `32a48f76a1909486cd0a5d8f4056b18e02c6ad78a933c4cdc0db4f36c37c7b96`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `391bc1fb1ec64ca1fd6a66978504ed95fa7f818345d275099fcd48a87870ea57`; after `e860a845b99ec4af777d6c6c9560530bcf0c0dd544a6a6d3111bf6af5ff22070`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `52815cf86c1eaa967a36fea0695362564bd47dea579de91b2ed46b817fbc4fc7`; after `1c50b392b6bfdc69d9e3feb2b0b6547bbe790c9b81e02782e8adcc98846ea6fd`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `985d244ad9341a8aa69c99d33c1d1840f8372cd290253c000cd6abe4c1f5f759`; after `9078ade92026f59bd8836d39d22336409091825be59bfc3849fbc17a21f7007d`.

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

SHA-256 before `f80f5c46ce634b53cabf79ea1db26768623f33505408b1cc5a594d0857672021`; after `6fe38b682418cfce31690e6de1d0eb78746014042de7db495c3551f30737e2b8`.

747 changed JSON leaves, all enumerated below.

- **capital (4 leaves):** Statement-specific D&A, admitted capex, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.{current.{cashBridge.definition,interestExpense},interestCoverage.{interestExpense,value}}
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

SHA-256 before `52b716052275711574e37c93f7cbb47a33aff7d549ae88cfd38e384ebae8739e`; after `77ad0df8a4ec31e1cb720324c7bd16d72f9cfaf3c3179dbce08bea818b2306d5`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `2231610c98538b3a4bf274f1a51dd0ee8387764a4fe4145852f2aceeeff24cda`; after `48a0d4d8f664653c86e13b7bb316e81d9943fff035a0c46746a2e74f480ec2b2`.

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

SHA-256 before `61128eb609eeaed4b3583cecca38254d609012791b27b9d031230b5199499c1d`; after `ab1d48089382c54c161e51dcd57a573f8e76c6e77b40af692c374d801984b49a`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `6b5b1ed5b886dd41c36d95775a303bc3fd27d509c2a584c820805dd955d4074b`; after `7998b83db14b66009551375bc0234acd5ef80d11648673f43da248243db14f3d`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `d8b1b6a96c7e16a13d9bb38e358bca584e3b916d9dcd2fbb793e59d9e07e6864`; after `52f471c958a3db23af52ef2227d2f3837ea8d59a27ed1a915b2164a0f76e2155`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `593c6f2cd13ff954b90cf4aad641010ed1bcf445bf4848593afec271209d6f17`; after `dd56920cf0f82a2fb030cd5675857d618d473d078483b296cdf0ade9c6f66961`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:f47d08c3"` to `"1.95.0:63d85314"`, approved because its version and covered deterministic content changed.

## duk-data-only

43 independently filed input corrections are listed below. Repeated aliases and dependent FCF are represented by their capex input, not counted again.

| Field | Window | Filed/admitted amount | SEC tag(s) | Filing evidence |
| --- | --- | ---: | --- | --- |
| incomeAnnual.depreciationAndAmortization | 2024-01-01 to 2024-12-31 | 5793000000 USD | us-gaap/CostDepreciationAmortizationAndDepletion | 10-K 0001326160-25-000072, filed 2025-02-27 |
| incomeAnnual.depreciationAndAmortization | 2023-01-01 to 2023-12-31 | 5253000000 USD | us-gaap/CostDepreciationAmortizationAndDepletion | 10-K 0001326160-24-000037, filed 2024-02-23 |
| incomeAnnual.depreciationAndAmortization | 2022-01-01 to 2022-12-31 | 5086000000 USD | us-gaap/CostDepreciationAmortizationAndDepletion | 10-K 0001326160-23-000073, filed 2023-02-27 |
| incomeAnnual.depreciationAndAmortization | 2019-01-01 to 2019-12-31 | 4548000000 USD | us-gaap/CostDepreciationAmortizationAndDepletion | 10-K 0001326160-20-000034, filed 2020-02-20 |
| incomeAnnual.depreciationAndAmortization | 2018-01-01 to 2018-12-31 | 4074000000 USD | us-gaap/CostDepreciationAmortizationAndDepletion | 10-K 0001326160-19-000057, filed 2019-02-28 |
| incomeAnnual.interestExpense | 2016-01-01 to 2016-12-31 | 1916000000 USD | us-gaap/InterestExpense | 10-K 0001326160-17-000016, filed 2017-02-24 |
| incomeQuarterly.depreciationAndAmortization | 2026-04-01 to 2026-06-30 | 1700000000 USD | us-gaap/CostDepreciationAmortizationAndDepletion | 10-Q 0001326160-26-000040, filed 2026-08-04 |
| incomeQuarterly.depreciationAndAmortization | 2026-01-01 to 2026-03-31 | 1689000000 USD | us-gaap/CostDepreciationAmortizationAndDepletion | 10-Q 0001326160-26-000026, filed 2026-05-05 |
| incomeQuarterly.depreciationAndAmortization | 2025-07-01 to 2025-09-30 | 1626000000 USD | us-gaap/CostDepreciationAmortizationAndDepletion | 10-Q 0001326160-25-000192, filed 2025-11-07 |
| incomeQuarterly.depreciationAndAmortization | 2025-04-01 to 2025-06-30 | 1583000000 USD | us-gaap/CostDepreciationAmortizationAndDepletion | 10-Q 0001326160-25-000168, filed 2025-08-05 |
| incomeQuarterly.depreciationAndAmortization | 2025-01-01 to 2025-03-31 | 1512000000 USD | us-gaap/CostDepreciationAmortizationAndDepletion | 10-Q 0001326160-25-000150, filed 2025-05-06 |
| incomeQuarterly.depreciationAndAmortization | 2024-10-01 to 2024-12-31 | 1481000000 USD (compatible YTD difference) | us-gaap/CostDepreciationAmortizationAndDepletion | 10-K 0001326160-25-000072, filed 2025-02-27 + 10-Q 0001326160-24-000181, filed 2024-11-07 |
| incomeQuarterly.depreciationAndAmortization | 2024-07-01 to 2024-09-30 | 1516000000 USD | us-gaap/CostDepreciationAmortizationAndDepletion | 10-Q 0001326160-24-000181, filed 2024-11-07 |
| incomeQuarterly.depreciationAndAmortization | 2024-04-01 to 2024-06-30 | 1409000000 USD | us-gaap/CostDepreciationAmortizationAndDepletion | 10-Q 0001326160-24-000167, filed 2024-08-06 |
| incomeQuarterly.depreciationAndAmortization | 2024-01-01 to 2024-03-31 | 1387000000 USD | us-gaap/CostDepreciationAmortizationAndDepletion | 10-Q 0001326160-24-000108, filed 2024-05-07 |
| incomeQuarterly.depreciationAndAmortization | 2023-10-01 to 2023-12-31 | 1340000000 USD (compatible YTD difference) | us-gaap/CostDepreciationAmortizationAndDepletion | 10-K 0001326160-24-000037, filed 2024-02-23 + 10-Q 0001326160-23-000191, filed 2023-11-02 |
| incomeQuarterly.depreciationAndAmortization | 2023-07-01 to 2023-09-30 | 1353000000 USD | us-gaap/CostDepreciationAmortizationAndDepletion | 10-Q 0001326160-23-000191, filed 2023-11-02 |
| incomeQuarterly.depreciationAndAmortization | 2023-04-01 to 2023-06-30 | 1333000000 USD | us-gaap/CostDepreciationAmortizationAndDepletion | 10-Q 0001326160-23-000172, filed 2023-08-08 |
| incomeQuarterly.depreciationAndAmortization | 2023-01-01 to 2023-03-31 | 1227000000 USD | us-gaap/CostDepreciationAmortizationAndDepletion | 10-Q 0001326160-23-000148, filed 2023-05-09 |
| incomeQuarterly.depreciationAndAmortization | 2021-10-01 to 2021-12-31 | 1292000000 USD (compatible YTD difference) | us-gaap/CostDepreciationAmortizationAndDepletion | 10-K 0001326160-22-000072, filed 2022-02-24 + 10-Q 0001326160-21-000231, filed 2021-11-04 |
| incomeQuarterly.interestExpense | 2021-10-01 to 2021-12-31 | 592000000 USD (compatible YTD difference) | us-gaap/InterestExpense | 10-K 0001326160-22-000072, filed 2022-02-24 + 10-Q 0001326160-21-000231, filed 2021-11-04 |
| incomeQuarterly.depreciationAndAmortization | 2021-07-01 to 2021-09-30 | 1265000000 USD | us-gaap/CostDepreciationAmortizationAndDepletion | 10-Q 0001326160-21-000231, filed 2021-11-04 |
| incomeQuarterly.depreciationAndAmortization | 2021-04-01 to 2021-06-30 | 1207000000 USD | us-gaap/CostDepreciationAmortizationAndDepletion | 10-Q 0001326160-21-000216, filed 2021-08-05 |
| incomeQuarterly.depreciationAndAmortization | 2021-01-01 to 2021-03-31 | 1226000000 USD | us-gaap/CostDepreciationAmortizationAndDepletion | 10-Q 0001326160-21-000136, filed 2021-05-10 |
| incomeQuarterly.depreciationAndAmortization | 2020-10-01 to 2020-12-31 | 1208000000 USD (compatible YTD difference) | us-gaap/CostDepreciationAmortizationAndDepletion | 10-K 0001326160-21-000063, filed 2021-02-25 + 10-Q 0001326160-20-000224, filed 2020-11-05 |
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

SHA-256 before `9a5f22b992dfa6ae55c8649cccf1211d9deba2704bf588fcb3b114bf3ae194a0`; after `ccac560042467ff4fca033d0b3ca0d3f03161675093c17f3c58eed18ff6849c9`.

896 changed JSON leaves, all enumerated below.

- **capital (9 leaves):** Statement-specific D&A, admitted capex, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.{capexIntensity.series.4.capexToDA,current.{cashBridge.definition,{ebitda,netDebtToEbitda}},maintenanceVsGrowthCapex.{capexToDA5yAvg,capexToDALatest,impliedGrowthCapex,impliedMaintenanceCapex},netDebtToEbitda.ebitda}
```

- **forensics (13 leaves):** The unchanged forensic formulas read the corrected D&A, acquisition, cash-flow totals, compensation or cost operands; related warnings/source labels follow those same facts.

```text
forensics.{accruals.{{aggregateAccrualsCashFlow,cashFlowAccrualRatio,definition,investingCashFlow,operatingInvestingCashFlow},notes.{1,4}},beneish.{indices.depi,{score,sgiNeutralScore,tataBalanceSheet}},notes.{10,13}}
```

- **gaps (806 leaves):** New filed substitutions and missing-compatible-counterpart disclosures are added; recovered typed value-only conflicts retire only their own old refusal. Array positions shift after insertion.

```text
gaps.{{16,91,101,106..109}.{attemptedSources.{0,1},{field,reason}},{17,18,28,29,53,63,73}.{attemptedSources,field},{19..24,30,42..45,52,54,55,57,62,64,65,72,74,75,233,235,236,265,267,268}.field,{25..27,46,48..51,58,60,61,67,69..71,86,90,125,127,128,130,133,135,136,138,140,141,143..145,149,151,155,159,160,165,168,172,176,180,184..186,190,191,195,196,200,204..206,208,211,220,221,223,224,226..229,231,232,234,239,242,245,253,256,259,261,264,266,271,273,277,278,280,285,286,290..292}.{field,reason},{31,41,47,56,59,66,68,76..78,87,93,95,96,120,122..124,126,129,131,132,134,137,139,142,146..148,150,161,281..284}.{attemptedSources,field,reason},{79,80}.{attemptedSources,field,reason,severity},{81..85}.{attemptedSources,expected,field,reason,severity},{88,89,92,94}.{attemptedSources.0,{expected,field,reason}},{97,98,102..105,164,173,182,194,198,199}.{attemptedSources,expected,field,reason},{99,100}.{attemptedSources.{0,1},{expected,field,reason}},{110..117,119,121}.{attemptedSources.0,{field,reason}},118.{attemptedSources.{0..2},{field,reason}},{152..154,156..158,162,163,166,167,169..171,174,175,177..179,181,183,187..189,192,193,197,201..203,207,209,210,212..219,222,225,230,237,238,240,241,243,244,246..252,254,255,257,258,260,262,263,269,270,272,274..276,279,287..289}.{expected,field,reason},{293..397}}
```

- **scores (44 leaves):** The unchanged scoring formulas read the corrected operands above; driver values, signal arithmetic, aspect/composite results and completeness follow those operands.

```text
scores.{aspects.{quality.{drivers.{1,2}.value,score,signals.{1.{{contributionPoints,fallbackReason,raw,transformedScore},operands.0.value},2.{{contributionPoints,raw,transformedScore},operands.0.value}}},valuation.{{band,score},drivers.0.value,signals.0.{{contributionPoints,raw,transformedScore},operands.{0,1,3..18}.value}}},assessments.{businessQuality.score,valuation.{band,score}},composite.score,factorExposure.{3,5}.aboveNeutralPoints,qualification.{aspects.valuation.reasons.0.detail,composite.reasons.0.detail}}
```

- **valuation (24 leaves):** The unchanged valuation/DCF and multiple formulas read the admitted cash/cost operands and growth history; related inputs, availability, sensitivities and descriptions move together.

```text
valuation.multiples.{multiples.1.{current,ownHistory.{observationDetails.{0..15}.value,{p25,p5,p50,p75,p95,percentileRank}}},notes.28}
```

### payload.txt

SHA-256 before `3c6fd15c2dcfc0f41bcdb093c7b4024aeb49f83f234210250a7960f94e0a059a`; after `13d66ce5ff8d6c45643e9e5895235abefc51268768be1f92124469c235eaf4ba`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `7c5e4b8edde374cd3fd3612da5a7dd72dc4511c734fcd06972dd7284842de859`; after `2a06849f0bb9e77c5e6dacc4c24cf44b8e27ac0085a09b047450fa33c15ffa2b`.

839 changed JSON leaves, all enumerated below.

- **appendix (717 leaves):** Substitution/missing-data/provenance records carry the changed inputs, filings and compatibility stamps; ordered arrays shift after additions. Existing unknown evidence stays unknown.

```text
appendix.missingData.{{78..80,104..109,131,137,139,145,153,160,163,171,177,181,183,185,189..192,201..204,213,214,216,218..226,229..231,290,291,293,294}.{field,reason},{81..87}.{attemptedSources,expected,field,reason,severity},88.{attemptedSources,field,reason,severity},{89,97}.{attemptedSources.{0,1},{expected,field,reason}},{90,98,103,110..116}.{attemptedSources.0,{field,reason}},{91..95,99..102}.{attemptedSources.{0,1},{field,reason}},96.{attemptedSources.0,{expected,field,reason}},{117,119,121,124,178,180,198..200,205..208,248,279,280,288}.{attemptedSources,expected,field,reason},{118,120,122,123,179,186..188,215,217,227,228}.{attemptedSources,field,reason},{125..130,134..136,142..144,150..152,158,159,161,162,168..170,182,184,193..197,209..212,232..247,249..278,281..287,289,292,295,296}.{expected,field,reason},{132,133,138,140,141,146..149,154..157,164..167,172..176}.field,{297..402}}
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

- **scores (44 leaves):** The unchanged scoring formulas read the corrected operands above; driver values, signal arithmetic, aspect/composite results and completeness follow those operands.

```text
scores.{aspects.{quality.{drivers.{1,2}.value,score,signals.{1.{{contributionPoints,fallbackReason,raw,transformedScore},operands.0.value},2.{{contributionPoints,raw,transformedScore},operands.0.value}}},valuation.{{band,score},drivers.0.value,signals.0.{{contributionPoints,raw,transformedScore},operands.{0,1,3..18}.value}}},assessments.{businessQuality.score,valuation.{band,score}},composite.score,factorExposure.{3,5}.aboveNeutralPoints,qualification.{aspects.valuation.reasons.0.detail,composite.reasons.0.detail}}
```

- **valuation (23 leaves):** The unchanged valuation/DCF and multiple formulas read the admitted cash/cost operands and growth history; related inputs, availability, sensitivities and descriptions move together.

```text
valuation.{graded.{{grade,oneLineWhy},keyNumbers.0.value,qualification.reasons.0.detail,reasoning.0.text},multiples.1.{{current,own5yPercentile},ownHistoryDetails.{0..15}.value}}
```

- **verdict (20 leaves):** The unchanged verdict presentation reads the recalculated composite and evidence qualifications.

```text
verdict.{gradeStrip.{quality.{keyNumbers.{{1..4}.value,{9,10}.{source,sourceId,value},{11,12}},oneLineWhy,reasoning.0.text},valuation.{{grade,oneLineWhy},keyNumbers.0.value,qualification.reasons.0.detail,reasoning.0.text}},synthesis}
```

### report.md

SHA-256 before `a8e8b13f2019b3c4c2a1b7f33b2f9628af4984122e0f6d98170d48730f83d94a`; after `04a2bfe79e6970b390c72a3419f21cae0931721874b483211b4111ab3d71a43e`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `bf88c13badb158a58de4d0b4b37bfc926b954cbf7f33549c5dbfcbfe94081cdd`; after `5e9b40dad3c72e9c28c72f583c01c608bf39c4e10e33546004aa332876e90ae9`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `fdc117eb9ead7fcdaec21bd4d44e7a98e032688be7813868ca45a4da63329b5c`; after `493fb76df9d2df691f0bf46704d19f6e7ee9c97072749a46c4715833717f55a9`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `2d425b989629365be7f5759ae582977fbbdc4564eb7f06ed2a5bdc5a2f42477d`; after `abc9bac76109e6b882d648f2ea1fa33108fef274c811008a92c9f752ec98997e`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:98ff17ff"` to `"1.95.0:c0113ef9"`, approved because its version and covered deterministic content changed.

## tsm-data-only

No scalar input correction: only the revised definition, compatibility identifiers and explicit unverified-coverage disclosures change.

| Field | Window | Filed/admitted amount | SEC tag(s) | Filing evidence |
| --- | --- | ---: | --- | --- |

### stageB.json

SHA-256 before `e96bdb78936f7d705c1bf8fe9d189d4b97c74409fa4f0881536b3e7844c2832e`; after `475cdcb3e9b7eea174afbb2e03b68d1e6f2ceb07383d1818df86ceac49ec2ed0`.

336 changed JSON leaves, all enumerated below.

- **capital (1 leaves):** Statement-specific D&A, admitted capex, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.current.cashBridge.definition
```

- **gaps (335 leaves):** New filed substitutions and missing-compatible-counterpart disclosures are added; recovered typed value-only conflicts retire only their own old refusal. Array positions shift after insertion.

```text
gaps.{{8..10}.{field,reason},{11,20}.{field,reason,severity},{12..18,21..23,25..37}.{attemptedSources,expected,field,reason,severity},{19,24}.{attemptedSources,field,reason,severity},{38,46,51,63,66,68}.{attemptedSources,expected,field,reason},{39..44}.{attemptedSources.{0..2},{field,reason}},{45,48..50,52..62}.{attemptedSources,field,reason},{47,65,67}.{expected,field,reason},64.{attemptedSources.{0..4},{expected,field,reason}},{69..152}}
```

### payload.txt

SHA-256 before `784836c88e9f1d08323c64f5f7e8adeefa0698018009c21b8978037ec3d4c181`; after `87f5022cbbaf0bdf50f13a6b9efba8987756e9be82eb78768636916d2b679ef1`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `81be5e52f834aeacb12188bf6a5c060f1f55d610d3abc0a23c6a96cbaee5fc44`; after `1562368c215fa111a6c1c4967e1f44575daa5c779eacdb2dfbfb958f43fe4f0f`.

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

SHA-256 before `3645d46db50e5a17ddaa7f6bc39b377fe6ad377057e0dee50bdf65c19b2648e5`; after `fdbd223997ff525ab8e5d520f90444d9a033de6eb32c1d3f842f31dca6466fbd`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `89be7d69e3b4d81759451d5754f314f13bd64e4d32e53cc575f9c29119e4ef0d`; after `b28aff794ad4ed9cec9b34c8c25edf00a8cda354e7229cb6f4ede69e06467c04`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `9824c8bb6b1205ff3d098e189f38de083a1d496c18aaafaf0b08e7334edf59a4`; after `45ff98aea947974a6200d2a25571b78705f2007c563510ffb4153c9378de143f`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `87280f799ba21e6b6f0d439eee27bb0f0f62614b5783fae4e08baca8c6f583d7`; after `1412fba7b8cc05f4164f24cc3d1aed193eeff9fa00ac2c34daaac629cfb229e0`.

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

SHA-256 before `f04b44a7d1cfce93da7577348610537597ca9711da8c89b77059ebd98dc73dca`; after `906851ee189e83582ceea09180f8937e59fa446c184ac5765bc863afb2ada536`.

373 changed JSON leaves, all enumerated below.

- **capital (1 leaves):** Statement-specific D&A, admitted capex, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.current.cashBridge.definition
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

SHA-256 before `aaa2bcf2ec2a4701b0e8a12d8ce90410273659d5d819058e81bc9871a0626a61`; after `4b215c411bf4c04def112ec13a5ff69f02288dd5c22e2e9a7f1825b487b520c6`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `33fb30b93d508efc744d1855a266e23685099ed1ff0708d1a6d13880989686a4`; after `eba3b2ba452159eaf8e515f5b94d62b1fc5a46ba694328c9d22b4171ff036e4f`.

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

SHA-256 before `9023878668f9ad4e7783036e6bdcb63c21b44255f0d5a185712994165dec2fae`; after `2169e2416f6734843c73b2eee0261c796132480eb1bd140ab79a5041e76a4ab4`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `55e0d4b9c2368573517bebb705eadfee90e3d2747dfeea61ba593f14ca547e1f`; after `4d5a1232fedcd3faa1d6899c459a53766cc4d72db31f030e7b659114df60c1a7`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `7ba8d6d816b59d51dc98cb829245092fffe08a4f9e0598f61305eda1fc5f64b1`; after `36746e1358332fe4c05e11794c0b04ff3be21c57dd91248548acd8cc99e43442`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `edb23cc31cc632a2c699ab13a1730e033d78f42b466030aa014fe782ac3b4f2f`; after `dd0faf1314143818358ba0ac96d342242ae8dbf02e123a61c839a2391274ab38`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:a64b7469"` to `"1.95.0:dda308fd"`, approved because its version and covered deterministic content changed.

## vktx-data-only

4 independently filed input corrections are listed below. Repeated aliases and dependent FCF are represented by their capex input, not counted again.

| Field | Window | Filed/admitted amount | SEC tag(s) | Filing evidence |
| --- | --- | ---: | --- | --- |
| incomeAnnual.generalAndAdministrativeExpenses | 2019-01-01 to 2019-12-31 | 9128000 USD | us-gaap/GeneralAndAdministrativeExpense | 10-K 0001564590-20-006766, filed 2020-02-26 |
| incomeQuarterly.generalAndAdministrativeExpenses | 2020-10-01 to 2020-12-31 | 2217000 USD (compatible YTD difference) | us-gaap/GeneralAndAdministrativeExpense | 10-K 0001564590-21-006406, filed 2021-02-17 + 10-Q 0001564590-20-048398, filed 2020-10-28 |
| cashflowAnnual.interestPaid | 2018-01-01 to 2018-12-31 | 81000 USD | us-gaap/InterestPaidNet | 10-K 0001564590-19-007584, filed 2019-03-13 |
| cashflowAnnual.interestPaid | 2016-01-01 to 2016-12-31 | 205139 USD | us-gaap/InterestPaid | 10-K 0001564590-17-004911, filed 2017-03-21 |

### stageB.json

SHA-256 before `0ef2c05d948cd9c97c32a90f810fa3254b79b49d71257cc91dbd12b03e2d5a93`; after `3a1d0ab031157c71c310e2664d77fda45b8e5a5a38da2ad693af292f536342c6`.

438 changed JSON leaves, all enumerated below.

- **capital (1 leaves):** Statement-specific D&A, admitted capex, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.current.cashBridge.definition
```

- **gaps (437 leaves):** New filed substitutions and missing-compatible-counterpart disclosures are added; recovered typed value-only conflicts retire only their own old refusal. Array positions shift after insertion.

```text
gaps.{21.reason,{22,24..28,32,33,39..42,45,50..53,55,104..113,115,119,120}.{attemptedSources,field,reason},{23,31,34..38,43,44,46..49,54,56..58,99..101}.{field,reason},29.field,30.{attemptedSources,field},{59,60,73..76}.{attemptedSources,field,reason,severity},{61..63,67,70,72}.{attemptedSources.{0,1},{expected,field,reason,severity}},{64,65,68,71,77..80}.{attemptedSources,expected,field,reason,severity},66.{field,reason,severity},69.{attemptedSources.{0,1},{field,reason,severity}},{81,82,88,95..98,102,103,114,116..118,121,122}.{attemptedSources,expected,field,reason},{83,90}.{attemptedSources.{0,1},{field,reason}},{84..87,89,92..94}.{attemptedSources.0,{field,reason}},{91,123}.{attemptedSources.0,{expected,field,reason}},124.{expected,field,reason},{125..213}}
```

### payload.txt

SHA-256 before `b4b5e05cf9da2c48b8e5b4ec4e850cac3f5b3b7b6c386f6ccf2429cbc5f27e25`; after `1a980d53b07baacb50bf9e4293304029d732d689238bd605b00f9bc134db89f4`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `ddae34524ea2547dee5869f0b0af849a149f1e96c425e83ab9880d250e02c209`; after `91d2406f178ad57b3f21167066fc6022a470b78d3b1c0cafd11cf93ab2dc999e`.

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

SHA-256 before `8389592b8f2599afa3e5568a9111f53d5a574cd3866e1c81c051f4fe9438c65f`; after `464171ae28af0ef4e0dd4e8d5dacac77004e7a2dd1c0f9a879a7a836f82e2254`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `597cccd532ae323f833819c070b1326e29a226767bba1da6d6529e58fd4e6bd5`; after `451dcf3fceb492e18ac52919164b844e7fd507338ad00bdb1b1b10335ed8f329`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `3f9bf669dc8ac5d933f3a05d27452570f8f31b70213bf8f1624daabda9e84cf5`; after `d178f158f5de3e08838d695f36820704bc0c456f094d7d6abaf0201b1ac0e70c`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `abc9fd85fea456e4514c5855930d9e153be0bca514e213b294fac76c52b2bb66`; after `8d82c2bac670b12a2e7cf685c0c9a05f5c86fff58791fc5938957ecc703f318f`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:d2838e19"` to `"1.95.0:8f3f3c5b"`, approved because its version and covered deterministic content changed.

## amzn-fixed-analyst

2 independently filed input corrections are listed below. Repeated aliases and dependent FCF are represented by their capex input, not counted again.

| Field | Window | Filed/admitted amount | SEC tag(s) | Filing evidence |
| --- | --- | ---: | --- | --- |
| cashflowAnnual.interestPaid | 2016-01-01 to 2016-12-31 | 290000000 USD | us-gaap/InterestPaid | 10-K 0001018724-17-000011, filed 2017-02-10 |
| cashflowAnnual.capitalExpenditure | 2016-01-01 to 2016-12-31 | -6737000000 USD | us-gaap/PaymentsToAcquirePropertyPlantAndEquipment | 10-K 0001018724-17-000011, filed 2017-02-10 |

### stageB.json

SHA-256 before `9381e9cafc27f42b7f7a6c4048bc887e0dd19aea32962a8bbffc3e5e6ab459c4`; after `18c48fe6bbe0164383396b45160953b9e4b7f48c823d1a247ab09059818d1ac3`.

306 changed JSON leaves, all enumerated below.

- **capital (1 leaves):** Statement-specific D&A, admitted capex, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

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

SHA-256 before `2dbcf2787731fe38a3bada47664855d48c17012430236b85a2eeb5f247bbe7c2`; after `5cf63c7b777e0a3dd92338749d07f9b2666c30cbc9807e4d794d37dbe19ea3ae`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `0761353d161bc0e321a07e641fca47adb402c8739dfae79d6ccbed1609eb0d8e`; after `5d704cf4a5a7dd7fb16e068b6600f48f6fc712a465e0994d80d56e562c1e2973`.

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

SHA-256 before `77886bd04f5eff3742141d9398db8b8ff207abbf045d7edbc987081f092b9299`; after `00d4ed43ccf0e6a7ca24caf6f8479a063eda9da96f01d6efe7a90c6d89a868d4`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `2e49a7f26fa3ee9a00f4aac3a81422bc3b0aaa1b4e406c5649860aac508bee52`; after `46d3e66df31b3f4c9047d84f29d36456026395ab39c4c47927a9d3094dc5d075`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `b426e2cc6d086c4bbc64aed1327e6741754138939a86c33c7be4f2f2b954a726`; after `a817029258b6cdb147946b43aa8234a37d0af10c1ba5f1f3a35a15bb2cfd1110`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `46e84253fa9d514a7746d10c1a35d5faf448ec28a8942b3fa36e400d0f81f3bd`; after `2f8a25a0e3c5f907152924754cd25af23e53daffeba9cc1b17f64d21aade01aa`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:d3a902a8"` to `"1.95.0:e15627bd"`, approved because its version and covered deterministic content changed.

## meta-fixed-analyst

4 independently filed input corrections are listed below. Repeated aliases and dependent FCF are represented by their capex input, not counted again.

| Field | Window | Filed/admitted amount | SEC tag(s) | Filing evidence |
| --- | --- | ---: | --- | --- |
| incomeQuarterly.interestExpense | 2026-04-01 to 2026-06-30 | 754000000 USD | us-gaap/InterestExpenseDebt | 10-Q 0001628280-26-050705, filed 2026-07-30 |
| cashflowAnnual.interestPaid | 2025-01-01 to 2025-12-31 | 696000000 USD | us-gaap/InterestPaidNet | 10-K 0001628280-26-003942, filed 2026-01-29 |
| cashflowQuarterly.commonDividendsPaid | 2025-10-01 to 2025-12-31 | -1328000000 USD | us-gaap/PaymentsOfDividendsCommonStock | 10-K 0001628280-26-003942, filed 2026-01-29 |
| cashflowQuarterly.commonDividendsPaid | 2025-07-01 to 2025-09-30 | -1323000000 USD | us-gaap/PaymentsOfDividendsCommonStock | 10-Q 0001628280-25-047240, filed 2025-10-30 |

### stageB.json

SHA-256 before `ebfb1046771b5640b383fc795c0741adb0ca38241b7a92acf9a40dc827f0adab`; after `9f8547e32a3369342abfff5ccd06fd404ede13d88f473b9cb051a8c5902283bc`.

411 changed JSON leaves, all enumerated below.

- **capital (3 leaves):** Statement-specific D&A, admitted capex, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

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

SHA-256 before `0d676d6a44378b390501ae457aff13995de5ed4d6926799219c576cf101457df`; after `f6a5371b09fbf28cb8c296a1f0793049928df61db1eb0a4c5bbab910a7f26e8f`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `3cccad378e9f950f5298c3eb1caec78e37355b0f0520094127ad4f7d763aa0b5`; after `639eb26946be374120092d355ac1e3ab8f9aa6f248dea2826ae6fcb1ed14113b`.

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

SHA-256 before `04edf31e120fee6be1b29396cee8fbfd02ac30dbaba0c5cdbdf5c7419f046d1e`; after `32b3121084a07e20d3f86a539c331f8cdbf327e652259afef1d9b1d752613022`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `3d731bff7dbd12f4d0479a93acd86193fac51871d77037280f6560cbc21a26ba`; after `2fdbb9e6304791c34bf0422de115d7c8721719b325a7f94e069fb0e5d3695325`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `a60013601fec2067a0f5f910f7fda08f431ec4adf6b3734c6b5bfbd1ddbc32bf`; after `f3c4a6c0e18278cd30a2314d1d147e93d168584766ddbac4656676b631ae03fb`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `5fe1e7aec36d6d17e531ea9803f496f7a11af801f9cb2ea7174e380acf661bc6`; after `05a419e5fb36ecfb765730c1c150f1edb92ab905fc9689b164d191ce9fb47f5a`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:0ff64fb6"` to `"1.95.0:36ed8be1"`, approved because its version and covered deterministic content changed.

## mu-fixed-analyst

No scalar input correction: only the revised definition, compatibility identifiers and explicit unverified-coverage disclosures change.

| Field | Window | Filed/admitted amount | SEC tag(s) | Filing evidence |
| --- | --- | ---: | --- | --- |

### stageB.json

SHA-256 before `221c0a467a91e1522bdce283b855072801ae97ddd1061ea42d148fc3c34fbae9`; after `6fd276e28539f97b5a67dc5e30d11efa630d219e92d06ef211f128a745fef058`.

1 changed JSON leaves, all enumerated below.

- **capital (1 leaves):** Statement-specific D&A, admitted capex, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.current.cashBridge.definition
```

### payload.txt

SHA-256 before `53df00250317a2a31da0ac982654047e5981407bff273bb0c03cb4c9476fc50a`; after `505593efc9310d50fca7157d3259553eece4a92e649278b9b16a0510f307fa4d`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `86e6bb54852aa99761a75f9068bd5ea8bedd4672455d381eae99132e743dceb2`; after `25e47b72c230bfac9943c66838600413e34993b47d84a1d6ef763290b8e0929a`.

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

SHA-256 before `88a9427fc848130682b1e9edb36c1ccbe39a66e41bd52443326181b50b08dc58`; after `1ccee3003a5ee8d6a139ea877bd3867f56d9badb58d637234a0cc18e59818704`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `751f25604ec76fd1450485eae4f2d9a4b6c2ddf9581784da5c78db3c93b6ba49`; after `be0958f6220d99e2439eec3fc916d3832fecd8864f8e2f0fb7cf232c5521ebd1`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `884b4373251bc88424c021eadae880a4b6dc17615bdae546dc7b494b3c8695af`; after `d8a10f7152612cfec2ffd4faa9c949dcfb166a7a34a68c2ec3770ed4b0747162`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `dc3413c67804dde6dcb224041fd1fc62d725458b174cb8e0ab70bf4bbfb36c36`; after `8523d833305f157bf4cc3e744f49fe23d524ce8395553689b0810a21ddac1890`.

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

SHA-256 before `b4f6677ad08d828bc353afaf4bbe835a42154e54dea708fc178316c14f37e553`; after `34fb2ca82371a3b4656a8b2390dc3f86e872b500bdb05356ae9a3656e7de608e`.

180 changed JSON leaves, all enumerated below.

- **capital (1 leaves):** Statement-specific D&A, admitted capex, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.current.cashBridge.definition
```

- **gaps (179 leaves):** New filed substitutions and missing-compatible-counterpart disclosures are added; recovered typed value-only conflicts retire only their own old refusal. Array positions shift after insertion.

```text
gaps.{{51..61}.{field,reason},{62..89,91,92}.{expected,field,reason},90.{attemptedSources,expected,field,reason},{93..155}}
```

### payload.txt

SHA-256 before `c4abe6679d23ad37e37f446db0418e80d211224167956131f42ed774e1ad9e3e`; after `ba02bcba8923fa8370f1bbb3a02e0d9dc4e387f4b445eeca5f259941dec7796c`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `bc56369a7773a0e66915aff9be7c692bea09caf102f4d7bc5805ff130173efef`; after `b4f25128aa84854717c4103731eae499e12bab0f3f8498229812048aee1e28f0`.

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

SHA-256 before `2b0a040e7e010446108a4785675c3bb10bfbf7c5d028d4bb73806b28a7095f68`; after `91e072907253f113a504238eaaee5adc2e6d18f2cd0ee3287208ea97b7c7c533`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `41504b0ee73503790919d73863151fc257e80993afa919b1a88cac6592b1f56d`; after `b8d9dffc89404470ecf4ea323b46024d6eae5d50d3d99e8ff040473a03e90607`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `f2828dc35371e1b29b0823846368a68fab87079507033d1174bd360cb63101fc`; after `42dca9cf12d63b8ddca9a68b543a8dceced0f203d8b15ef780159c28aa6bf960`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `b259752adc661984f86562c6eb199854a52b432cd9975fbdf1b9db9390bc660a`; after `58cfa1490835dafc016d00b2d70d9d2c7e11c05a57fe3e7ff3c407f50417329c`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:182abc3c"` to `"1.95.0:e1f4a67c"`, approved because its version and covered deterministic content changed.

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

SHA-256 before `1e45f11f6a39257b63f83a4e053cf6bb263046763b7f888c468aab96ca23ffbe`; after `2dedd767848a673a1b67df82a7fa23dc6abed6a7961aa1f4ceaaf1471b74bcc7`.

630 changed JSON leaves, all enumerated below.

- **capital (29 leaves):** Statement-specific D&A, admitted capex, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.{capexIntensity.{series.{0,1}.{capex,capexToDA,capexToRevenuePct},slopePctPtsPerYear},current.{cashBridge.{afterSbcStandardizedFcf,cashCapitalExpenditure,definition,standardizedFcf},{fcfBeforeSbc,fcfConversionBeforeSbc,interestExpense,sbcPctOfFcf},filedCashFlows.capitalExpenditure},fcf.series.{0,1}.{fcf,fcfBeforeSbc,fcfConversion,fcfConversionBeforeSbc,note},interestCoverage.{interestExpense,value},maintenanceVsGrowthCapex.capexToDA5yAvg}
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

SHA-256 before `69f9dacf4b21c582d3cbd401865d688b0ff02a3a97694286123308224c1ab6c3`; after `3d7ed45b4fa62e9e0bbb3e1e90058c97dab846e95455f79213ee134a1b01eb04`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `4806bd919b7e84f3d2f48acdaf331c8db75a084c7518b693bf6deba84d3f767e`; after `103f6b6fbb265d6883f7f5a296248394b4c870ee2c61eddea76f83dcfe37ace9`.

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

SHA-256 before `937bf0d8bbb2447bb5d5312ca8c313190b091ed3046d807794850263fa0f60dd`; after `902acd3c28da22ebdb12ea749886997ce50a74e0ec17aeb3d5ac187939d66b12`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `523c3a7425d241891612e9809f29f67f1524f954e1baae81f7fb97dae1cd1cd0`; after `5602a64524aa99e5f17354759ea21dcd914467f31ab40c687c88ca88a7193d47`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `7e27aab690fab05c0123f0963d5b07c0fc82d469d785509693615a9236a0aa9c`; after `6e464c8fd6d56d4e9697eaf01c73f4c18b8b10f3ba7ab510eb919acef0296abd`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `c940d9ec1cdfadca7e5a972e6b88d5b58cab9f817610a3e1bab6b7ee9c3bf3b3`; after `d97ce0590354f44aba072bc3e1c9f470b145eb0c0aca214a9918424851634162`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:b7c9e5bd"` to `"1.95.0:b1eae941"`, approved because its version and covered deterministic content changed.

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

SHA-256 before `1e45f11f6a39257b63f83a4e053cf6bb263046763b7f888c468aab96ca23ffbe`; after `2dedd767848a673a1b67df82a7fa23dc6abed6a7961aa1f4ceaaf1471b74bcc7`.

630 changed JSON leaves, all enumerated below.

- **capital (29 leaves):** Statement-specific D&A, admitted capex, SBC, dividends, repurchases or interest change the cash/capital operands, ratios and their descriptions; exact input facts are listed below.

```text
capital.{capexIntensity.{series.{0,1}.{capex,capexToDA,capexToRevenuePct},slopePctPtsPerYear},current.{cashBridge.{afterSbcStandardizedFcf,cashCapitalExpenditure,definition,standardizedFcf},{fcfBeforeSbc,fcfConversionBeforeSbc,interestExpense,sbcPctOfFcf},filedCashFlows.capitalExpenditure},fcf.series.{0,1}.{fcf,fcfBeforeSbc,fcfConversion,fcfConversionBeforeSbc,note},interestCoverage.{interestExpense,value},maintenanceVsGrowthCapex.capexToDA5yAvg}
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

SHA-256 before `69f9dacf4b21c582d3cbd401865d688b0ff02a3a97694286123308224c1ab6c3`; after `3d7ed45b4fa62e9e0bbb3e1e90058c97dab846e95455f79213ee134a1b01eb04`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### report.json

SHA-256 before `d75787e1eff32fd770febb336fe5d1e50c0060c3747c9343bdad34b5e3b26ee7`; after `5401b3fe3ce5f76e8bbbb48ab33d6751e3ac44a00790e666b0ea05787b32c161`.

850 changed JSON leaves, all enumerated below.

- **appendix (703 leaves):** Substitution/missing-data/provenance records carry the changed inputs, filings and compatibility stamps; ordered arrays shift after additions. Existing unknown evidence stays unknown.

```text
appendix.{consistencyChecks.unit.{checked,passed},missingData.{{15,16,28,29,39,44,54..56,132}.{attemptedSources,field,reason},{17,23,26,52,59,62,65,66,69,70,94,98,105,108,111,114,118,121..123,126,133,136,137,140,141}.{field,reason},18.{field,reason,severity},{19..21}.{attemptedSources,expected,field,reason,severity},{22,24,57,58,130,131}.{attemptedSources,expected,field,reason},{25,31,38,49}.{attemptedSources.0,{expected,field,reason}},{27,43,45,47,48,53}.{attemptedSources.{0,1},{field,reason}},{30,33..37,50}.{attemptedSources.0,{field,reason}},{32,40..42,46,51}.{attemptedSources.{0,1},{expected,field,reason}},{60,61,63,64,67,68,71..93,95..97,99..104,106,107,109,110,112,113,115..117,119,120,124,125,127..129,134,135,138,139,142}.{expected,field,reason},{143..279}},provenanceCoverage.{factualValidation.{contradicted,rate,validated},numeric.{rate,supported}},verificationLog.{{2,6,24,32,38,74,75,80,82,83,89,101,103,116,118,123}.{note,outcome,reason,traceKind,validationStatus},107.{claim,note},{108,110..112,196,201,202,257,285..344,499,1070,1077,1092}.claim,{346,448}.{claimSupportStatus,note,numericSupportStatus,reason,traceKind,validationStatus}},verificationRate}
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

SHA-256 before `bd0a7a989bddcbffa73476a3fa02dca39d97acdc4c7f9e925a299c33e054ad78`; after `daab1a681754afdce3da57a2daab713f2ae24a207c77b653e54adec2a15cb46f`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### print.html

SHA-256 before `a932199ba534591fe53134332098ccb86b6fb1b764dd6138a08928f3d82ee462`; after `79f396d8794f6cd6ffeea6b1c52c124ede30cf2dc0372b53dde685e6cdfbf11e`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### audit.md

SHA-256 before `d70eedde9a048c23cee2120fdc6b233af18c65ac2015a87a06d19eae3c83acf7`; after `b075118c2532449e3607b97f9f0d8748c363be505dc001af37715f159fdc17db`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

### web-dossier.html

SHA-256 before `d4ba9d570cee6b1a08202f71bb7dafc019c7651e7c5756e23cb6e4054bf0e625`; after `27f9886f3bae5b528bde83522cdadb696df2db1b8d6e650019676a6e01135245`.

Approved changes: the corrected filed facts and unchanged-formula consequences listed for this case; the associated evidence/unknown-coverage and capex-definition text; version/fingerprint identifiers; and deterministic fixed-analyst verification of those records. No separate numerical or presentation policy is introduced.

Manifest payloadFingerprint: `"1.94.0:b7c9e5bd"` to `"1.95.0:b1eae941"`, approved because its version and covered deterministic content changed.
