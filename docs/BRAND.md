# Metis brand and compatibility

Metis is a local-first equity research application. The name comes from the ancient Greek Titan goddess associated with wisdom and planning. Use **Metis** in prose and **equity research** as the descriptor. The outlined serif wordmark uses lowercase **metis**. The identity describes a research process; it makes no claim about investment performance or forecasting accuracy.

## Visual identity

The original M emblem uses two flared forms around an open central space, suggesting a book or leaves. Use the supplied artwork instead of recreating it with text. The wordmark is a fixed whole-word outline created from the installed Windows Georgia font using .NET GraphicsPath.AddString. No font file or reusable glyph library is redistributed, and rendering needs no installed font or external request. Microsoft distinguishes logo and graphic output from font redistribution in its [Windows font usage FAQ](https://learn.microsoft.com/en-us/typography/fonts/font-faq).

| Role | Color | Use |
| --- | --- | --- |
| Deep ink | `#181b19` | Dark surfaces and primary light-mode text |
| Warm ivory | `#f6f2e9` | Light surfaces and primary dark-mode text |
| Muted bronze | `#a68557` | Identity details and decorative accents |
| Dark-mode accent | `#cfaf7d` | Readable accents on ink |
| Light-mode accent | `#785b32` | Readable accents on ivory |

Bronze does not replace semantic positive, negative or warning colors. Retain visible labels, legible tabular numerals and the distinct financial/chart semantics in both appearances and print. Keep the mark's proportions and negative space intact, give it breathing room, and do not stretch, rotate, recolor or add effects. Use ink artwork on light backgrounds and ivory artwork on dark backgrounds.

## Assets

All assets are local and self-contained; the SVGs use no external fonts or images.

| Asset | Purpose |
| --- | --- |
| [`metis-lockup.svg`](../public/brand/metis-lockup.svg) | README and shared identity; explicit ivory background remains readable in GitHub's light and dark modes |
| [`metis-lockup-ink.svg`](../public/brand/metis-lockup-ink.svg) | Transparent lockup for light surfaces |
| [`metis-lockup-ivory.svg`](../public/brand/metis-lockup-ivory.svg) | Transparent lockup for dark surfaces |
| [`metis-mark-ink.svg`](../public/brand/metis-mark-ink.svg) | Standalone emblem for light surfaces |
| [`metis-mark-ivory.svg`](../public/brand/metis-mark-ivory.svg) | Standalone emblem for dark surfaces |
| [`metis-social.svg`](../public/brand/metis-social.svg) | 1200 x 630 social/repository image |
| [`metis-social.png`](../public/brand/metis-social.png) | 1280 x 640 GitHub preview, with the SVG source fitted on ivory |
| [App icon](../src/app/icon.svg) | Self-contained ink tile with ivory emblem |
| [Apple icon](../src/app/apple-icon.png) | 180 x 180 raster icon |
| [Open Graph image](../src/app/opengraph-image.png) | 1200 x 630 raster share image |

[`src/brand/identity.ts`](../src/brand/identity.ts) supplies shared UI and inline print artwork. Print/export chrome must remain self-contained and preserve research content, disclosures and source attribution.

## Compatibility

The rebrand changes product identity and compatible operational names. It does not change financial methods, scoring formulas, schema versions, historical research bytes or evidence identifiers.

- **Configuration:** `METIS_*` is canonical. Corresponding `THESIS_*` environment variables remain accepted for existing installations and scripts. An explicitly present canonical value always takes precedence, including blank or invalid values; the legacy value never rescues an invalid canonical setting. Each setting keeps its validation and defaults. Blank path overrides retain their existing unset-path semantics. Unprefixed provider/model variables remain unchanged. See [configuration](../README.md#configuration) and [.env.example](../.env.example).
- **Local data:** fresh installations use Metis data paths and `metis.db`. Existing legacy `Thesis` directories (`thesis` on Linux) remain discoverable and take precedence when present. An existing legacy `thesis.db` or its SQLite recovery files (`thesis.db-wal`/`thesis.db-shm`) in the selected directory selects `thesis.db` before creating `metis.db`. Explicit DB/data overrides still apply. Discovery does not move, delete, rename or overwrite existing files; use the resolved path printed by the server. See [storage locations](PRIVACY.md#where-local-data-is-kept).
- **AI credentials:** the per-user connection store discovers the existing legacy `Thesis/ai` directory separately from database selection. New installations use `Metis/ai`. These AI directory names retain uppercase initials on every platform, including Linux; Linux database directories remain lowercase. Credential encryption, locking and stopped-server upgrade/downgrade requirements remain unchanged. Database overrides do not isolate AI connections.
- **Local HTTP clients:** send the startup token through `X-Metis-Token`; `X-Thesis-Token` is accepted when the primary header is absent. An invalid primary header cannot fall back to a valid legacy header. Both retain the same Host, Origin and Fetch Metadata checks. Tokens are never remote credentials or authentication for local processes. Read the printed token-file path and never log its contents.
- **Browser preferences:** the existing `thesis-ui-design` cookie and `current`/`workspace` values remain unchanged so appearance preferences survive the rebrand.
- **Research and history:** the financial term *thesis*, synthesis, `thesisTriggers`, hashes, model identifiers, prior commit/PR/run IDs, stored reports and quoted legacy identifiers retain their meaning. Historical audit/configuration examples preserve the names used at the time; they remain evidence about those batches, not current setup instructions. Repository links use the Metis target while retaining the original issue, PR and workflow run IDs.

The package name is `metis`; the repository target is [eligorelick/Metis](https://github.com/eligorelick/Metis). Existing local checkout paths and Git history remain intact. Follow [operations](OPERATIONS.md) for current usage and [privacy](PRIVACY.md) before removing any local data.
