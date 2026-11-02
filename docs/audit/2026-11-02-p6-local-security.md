# P6 local security repairs

Stored reports are never rewritten. Report, payload, Stage B and pipeline stamps stay unchanged.

| Finding | Disposition | Commit | Red / green receipts | Stored-report impact |
| --- | --- | --- | --- | --- |
| SEC-201 | Fixed: company landing mutations return 405 | f73dd65b | sec201-red / sec201-green + sec201-release | None |
| SEC-202 | Fixed: LAN management refused | e32457bc | sec202-red / sec202-final | None |
| SEC-204 | Fixed: safe config reads, strict jobs/writes | 274d3720 | sec204-red / sec204-green | None |
| SEC-206 | Fixed: visible billed default agrees | 315645d8 | sec206-red / sec206-green | None |
| SEC-207 | Fixed: disclosure; retention intentionally unchanged | 9bc58858 | sec207-red / sec207-green | None |
| PERF-201 | Fixed: valid-token steady state has zero DPAPI calls or renames | c4e95578 | perf201-red / perf201-green | None |
| SEC-205 | Fixed: captured unsupported Fast becomes Standard | 326e2791 | sec205-red / sec205-green | None; resume fingerprint may change |

## Residuals

LAN mode remains unauthenticated for report reads and job starts within existing spending safeguards. It is an opt-in trusted-network deployment, not an authentication boundary.

## Validation and scope

All seven regressions failed before their owning repair and passed afterwards. Final focused verification: 21 files, 532 tests passed (`final-focused`). Typecheck and lint passed (`final-typecheck`, `final-lint`). Additional consumers and shell/legacy-LAN controls are recorded in the handoff receipts. No pre-existing test failure was observed.

Output deltas: SEC-201 company POST 200 -> 405; SEC-202 spoofed local credential GET 200 -> 403 in LAN mode; SEC-204 configuration throws -> usable data configuration with both billed keys absent; SEC-206 dropdown none -> anthropic after key refresh; SEC-207 recovery documentation absent -> present in all three privacy sections; PERF-201 steady-state DPAPI calls 4 -> 0 and renames 1 -> 0; SEC-205 captured unsupported Fast -> Standard.

No report/payload/Stage B/pipeline stamp or golden changed. No Stage A/B/C computation or persisted research changed. Frozen stored-input replay was not run: this batch changes request boundaries, configuration, captured AI speed and documentation only; the offline regressions and unchanged computation diff are its evidence. Existing startup hold, job caps and rolling USD caps are untouched. Fresh independent review belongs to the integrator; this implementation received an author self-review only.

Final review added root-shell rendering, transient EBUSY recovery and legacy/loopback LAN controls. It also found a missing recovery pointer on credential POST failures: `sec204-pointer-red` reproduced it and `sec204-pointer-green` verifies the correction. Credential GET and POST failures now both name the same guide.

Independent review (`tmp/claude-2026-11-01/reviews/P6-REVIEW.md` in the integration checkout): merge after fixes. Fixed by the coordinator: M-1 the P3 release-record test now finds its heading anywhere (the newest batch heading stays first); L-1 the connections POST keeps the unreadable-store message with its recovery pointer; L-2 `writeAiStore` refuses a state that fails the store schema before any write, so an invalid save fails at once instead of after a restart; L-3 a byte-identical store returns one frozen credential object (no full-store clone per call); L-4 PRIVACY, OPERATIONS, CLAUDE-USAGE and README carry each note once in the owning section (OPERATIONS has the troubleshooting row); L-5 BOMs removed from five tests. Gates: `CL-p6fix-red` (L-2, L-3 and M-1 red; L-1 red in the reviewer's `REV-probes-head`), `CL-p6fix-green` 653/653, `CL-p6fix-docs` 587/587.
