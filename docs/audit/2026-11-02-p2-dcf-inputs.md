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

## Evidence and residuals

The non-deductible-charge synthetic tax seed moves from 35% to 21.0526316%
(company median); its no-charge control stays 21%. Without history the
marginal-effect reading is 29.4%. The census and retained-input delta table and
final verification receipts will be added after the remaining items.
