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

## Evidence and residuals

The non-deductible-charge synthetic tax seed moves from 35% to 21.0526316%
(company median); its no-charge control stays 21%. Without history the
marginal-effect reading is 29.4%. The census and retained-input delta table and
final verification receipts will be added after the remaining items.
