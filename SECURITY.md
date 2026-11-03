# Security policy

## Supported version

Security fixes target the current `main` branch (application version 0.1.0). Older commits and prior copies do not have a maintained security backport line. Update to current source and review migration guidance in [operations](docs/OPERATIONS.md) and [privacy](docs/PRIVACY.md).

## Report a vulnerability privately

Use the repository's [GitHub private security advisory form](https://github.com/eligorelick/Metis/security/advisories/new). Include the affected commit, Node/OS versions, reproducible steps, impact and a minimal synthetic example. Do not post exploits, API keys, account tokens, local databases or real research exports in public issues. There is no promised response deadline; keep disclosure private while a fix is coordinated.

## Local security and data

As described in the [README](README.md#quick-start), keys saved through Settings use protected local storage, override environment keys and remain hidden when already saved. They are server-side credentials, not browser localStorage. Environment files are not encrypted by Metis. The [privacy guide](docs/PRIVACY.md) describes the protected credential/AI connection stores, permissions, deletion and upgrade constraints; the research SQLite database has no application encryption at rest.

Metis is single-user, binds to loopback by default and has no authentication. Its request-origin/token checks are a browser CSRF boundary, not protection against other local processes. Keep the host and its local files protected. Local-first means local persistence, not offline operation: configured providers receive requests and the selected AI service receives research evidence. Read [privacy and safety](docs/PRIVACY.md) for recipients and retention, and [data rights](docs/DATA-RIGHTS.md) before sharing retrieved material or reports.
