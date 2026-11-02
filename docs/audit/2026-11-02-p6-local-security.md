# P6 local security repairs

Stored reports are never rewritten. Report, payload, Stage B and pipeline stamps stay unchanged.

| Finding | Disposition | Commit | Red / green receipts | Stored-report impact |
| --- | --- | --- | --- | --- |
| SEC-201 | Fixed: company landing mutations return 405 | Owning SEC-201 commit | sec201-red / sec201-green | None |

| SEC-202 | Fixed: LAN management refused | Owning SEC-202 commit | sec202-red / sec202-green | None |

| SEC-204 | Fixed: safe config reads, strict jobs/writes | Owning SEC-204 commit | sec204-red / sec204-green | None |

| SEC-206 | Fixed: visible billed default agrees | Owning SEC-206 commit | sec206-red / sec206-green | None |

| SEC-207 | Fixed: disclosure; retention intentionally unchanged | Owning SEC-207 commit | sec207-red / sec207-green | None |

| PERF-201 | Fixed: valid-token steady state has zero DPAPI calls or renames | Owning PERF-201 commit | perf201-red / perf201-green | None |

| SEC-205 | Fixed: captured unsupported Fast becomes Standard | Owning SEC-205 commit | sec205-red / sec205-green | None; resume fingerprint may change |

## Residuals

LAN mode remains unauthenticated for report reads and job starts within existing spending safeguards. It is an opt-in trusted-network deployment, not an authentication boundary.
