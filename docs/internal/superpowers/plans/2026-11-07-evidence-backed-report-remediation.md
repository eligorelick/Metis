# Evidence-backed report remediation plan

Spec: `docs/internal/superpowers/specs/2026-11-07-evidence-backed-report-remediation.md`.

## Global constraints

Use Node 24 (`C:/Program Files/nodejs/node.exe` on this workstation). Tests are offline and fixtures synthetic. Read CONTRIBUTING. Do not add ticker-specific rules, force a bullish target, double-count SBC, mutate historical reports, commit real data, change dependencies, or weaken financial refusal paths. For each fix reproduce the defect in a test, implement the minimum general correction, and run neighboring tests. Coordinate ownership before touching another lane's files. Controller owns shared docs, stamps, integration and PR. No subdelegation. Record test commands and outcomes in each lane's ignored report. Scope is the 33-item audit; scratch evidence is outside this checkout and must not be committed.

## Task 1: Financial-source and period integrity

Own financial reconciliation/normalization code (locate its actual module), `src/edgar/statements.ts`, `src/pipeline/stageB/`, and directly associated tests. Do not edit presentation, prompts, other EDGAR modules, or shared docs/stamps without coordination.

Revalidate Q01/Q02/Q03/Q13/Q14/Q15/Q17/Q31/Q33 against code. Resolve compatible SEC annual-minus-YTD SBC while preserving the conflict audit; use filed loss-quarter share/EPS semantics; reconcile annual date aliases before duration inference. Correct completed-year estimate selection at its canonical producer and calendarization; expose a helper if presentation needs it. Explain negative observed taxes and nonconsecutive ROIC observations accurately. Propagate repurchase authorization to the flat-share policy without assuming repurchases. Label independently weighted metrics accurately or provide reconciling weighted EBIT. Resolve prior cash/debt only where source definitions establish it; refuse ambiguity. Add focused synthetic tests, including negative cases. Assess whether Q11/Q29 have safe additive calculations without overriding the DCF; report recommendations to controller before widening. Report exact changed files/tests and unresolved evidence boundaries.

## Task 2: Source extraction and coverage

Own `src/edgar/` except `statements.ts`, `src/providers/companyIr*.ts`, and associated tests. Coordinate any needed Stage A edits. Do not edit Stage B, report presentation, prompts/evidenceSelection, shared docs/stamps.

Revalidate Q04/Q08/Q16/Q30/Q32 and source dependencies of Q05/Q06/Q07/Q33. Recover substantive annual notes when Item 8 extraction produces a stub; preserve document bounds and refuse unrelated sections. Parse full outlook ranges and accounting/period bases (including abbreviated headings and tabular fiscal periods). Recover CEO tenure across intervening board clauses without attributing another officer's date. Improve official IR discovery through observed issuer-authorized investor/newsroom links with bounded crawling; preserve identity, date, and SSRF protections. Diagnose proxy/governance gaps rather than invent missing fields. Inspect current geography and comparative-note ingestion for general fixes. Use synthetic regressions, not issuer fixtures. Report source refresh requirements separately from improvements reproducible on frozen inputs.

## Task 3: Verification and reader/export correctness

Own `src/report/` except schema/sourceFacts and shared version constants, `src/pipeline/stageC/claimEvidence.ts`, verifier/provenance modules if needed, and associated tests. Coordinate presentation forward selection with Task 1. Do not edit prompts/evidenceSelection/payload or shared docs/stamps.

Revalidate Q18/Q19/Q20/Q21/Q22/Q23/Q24/Q31. Expand numerical audit coverage to displayed filing-disclosure and market-data numbers without claiming complete semantic verification. Fix supported WACC, projection-period and target matches while retaining metric/unit/period/accounting checks and negative tests. Render small forensic ratios with correct units/precision. Generate headings and caveats from actual rows. Include or precisely locate referenced geography/product tables, preserving dates and bases. Make print citations/source URLs clickable using safe escaped links. Reduce proven duplicate sections and use linked appendix navigation where safe; avoid broad layout rewrites or deleting evidence. Clearly label independently averaged scenario metrics if Task 1 does not supply a coherent income statement. Report verification coverage limitations honestly.

## Task 4: Evidence-backed analytical coverage and integration

Controller owns `src/pipeline/stageC/prompts.ts`, `evidenceSelection.ts`, payload/schema changes coordinated with agents, source-fact additions, docs and stamps. Revalidate Q05/Q06/Q07/Q09/Q10/Q11/Q12/Q25/Q26/Q27/Q28/Q29 and integrate source repairs. Preserve material acquisitions, customer consideration, segment-perimeter changes and commercial opportunity evidence in bounded model inputs. Require quantified revenue/cost bridges where operands exist, dated milestones, funding/capital constraints, and no double counting of consensus growth. Distinguish sensitivities from underwritten scenarios. Add source-backed analytical tables where robust, and explicit gaps where economics are undisclosed. Use current issuer sources to assess commercial progress but do not bake issuer facts into code. Add regressions for evidence selection and output instructions. Record a disposition for all 33 audit items.

## Task 5: Verification, independent review and GitHub

Review each implementation lane for specification compliance and code quality. Resolve review findings. Run frozen Stage B replay without changing source bytes; separately test extraction repairs on locally fetched public documents where possible. Record what a new full report requires. Run `npm run verify` on Node 24, diagnose failures, and rerun affected checks. Update methodology, consequential decisions, changelog, meaning/version stamps and release documentation allowlist. Run a fresh whole-branch review. Commit synthetic code/docs/tests only, push the branch, create a PR and immediately link it to this thread. State test and review results and evidence limits in the PR and final response.
