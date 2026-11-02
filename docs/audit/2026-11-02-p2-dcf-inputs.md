# P2 DCF inputs and seasonality disposition (2026-11-02)

Base: ac4916f8. Shared stamps stay report 1.56.0, payload 1.60.0,
Stage B STAGE_B_2026_11_CLAUDE_REPAIRS_39, pipeline stage-c-1.6.18.
Every replay is offline. Stored reports are never rewritten.

| Finding | Disposition | Commit | Red / green receipts | Stored-report impact |
|---|---|---|---|---|
| FIN-402 | Fixed: coverage normalizes its EBIT window | Owning family commit | fin-402-family-red / fin-402-family-green-03 | Existing figures remain |
| FIN-402-V1 | Fixed: separate normalized terminal evidence | Owning family commit | fin-402-family-red / fin-402-family-green-03 | Existing figures remain |
| FIN-402-V2 | Fixed: history and ceiling normalize together; recurring costs retained | Owning family commit | fin-402-family-red / fin-402-family-green-03 | Existing figures remain |
| FIN-502 | Fixed: bounded normalized tax seed | Owning family commit | fin-402-family-red; fin-502-legacy-red / fin-402-family-docs-green | Display note for proven old mismatch |

| FIN-102 | Fixed: known operating losses remain terminal misses | Owning FIN-102 commit | fin-102-red / fin-102-green | Immutable prior figures |

| FIN-111 | Fixed: transition flows excluded consistently | Owning FIN-111 commit | fin-111-red / fin-111-green | No census transition; stored figures immutable |

| FIN-501 | Fixed: reverse margin family contains base path | Owning reverse commit | fin-501-104-red-02 / fin-501-104-green | Old figures retained |
| FIN-104 | Fixed: candidate-domain admission | Owning reverse commit | fin-501-104-red-02 / fin-501-104-green | Old bounds remain historical |

| FIN-116 | Fixed: The latest debt balance used for WACC weights also admits the debt leg. Average debt is only the effective-rate denominator; newly borrowed debt cannot imply an all-equity rate, and fully repaid debt needs no debt cost. | Owning FIN-116 commit | fin-116-red / fin-116-green | Stored figures unchanged |

| FIN-405 | Fixed: Latest revenue YoY and acceleration are withheld when their endpoint is older than the newest annual flow row; an older comparison cannot be dated as current in the payload or report. | Owning FIN-405 commit | fin-405-red / fin-405-green | Stored figures unchanged |

| FIN-127 | Fixed: Historical projection rows carry the filed fiscalYear, including start-year retailer labels. When labels collide, both actuals receive distinct ended-date labels across revenue, operating margin, FCF and EPS; no actual is collapsed. | Owning FIN-127 commit | fin-127-red / fin-127-green | Stored figures unchanged |

| FIN-114 | Fixed: The WACC and DCF assumption source labels name the selected domicile ERP country. US is reserved for the US row or US fallback; country selection and numerical ERP are unchanged. | Owning FIN-114 commit | fin-114-red / fin-114-green | Stored figures unchanged |

| FIN-113 | Fixed: Current-capital windows use the established oldest-quarter start, including 52/53-week windows. Without an established start the calendar-anniversary fallback is explicitly approximate in the AI context. | Owning FIN-113 commit | fin-113-red / fin-113-green | Stored figures unchanged |

| FIN-115 | Fixed: Discount-rate notes and manifest gaps name the debt cost actually accepted. A rejected historical rate is labelled rejected; synthetic-use wording appears only after a synthetic rate is computable, and unavailable outcomes say so. | Owning FIN-115 commit | fin-115-red / fin-115-green | Stored figures unchanged |

| FIN-118 | Fixed: Headline valuation degradation excludes market-cap history and enterprise-value history. Daily and SPY price substitutions are named only when the selected WACC beta consumes the keyless regression; the provider-fallback manifest still retains every substitution. | Owning FIN-118 commit | fin-118-red / fin-118-green | Stored figures unchanged |

| FIN-406 | Fixed: A vendor effective tax ratio cannot create a WACC shield when the same statement window establishes non-positive pre-tax income. The existing zero-shield basis applies equally to keyed and keyless runs, including positive net income from below-line gains. | Owning FIN-406 commit | fin-406-red / fin-406-green | Stored figures unchanged |

| FIN-512 | Fixed: Scenario shocks retain their existing 25pp growth and 12pp margin bounds. Binding caps disclose the uncapped sample sigma beside the bounded shock in target and projection bases; optional raw fields retain compatibility, and judge framing names the bounds. | Owning FIN-512 commit | fin-512-red / fin-512-green | Stored figures unchanged |

| RPT-502 | Fixed: Available-scenario assumptions now state that runs outside the DCF domain are withheld. The obsolete negative-equity floor-at-zero claim is removed; deterministic scenario targets and stored report bytes remain unchanged. | Owning RPT-502 commit | fin-512-legacy-rpt502-red / rpt-502-green | Stored figures unchanged |

## Evidence and residuals

The non-deductible-charge synthetic tax seed moves from 35% to 21.0526316%
(company median); its no-charge control stays 21%. Without history the
marginal-effect reading is 29.4%. The census and retained-input delta table and
final verification receipts will be added after the remaining items.
