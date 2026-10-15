import { METIS_MARK_PATH, METIS_WORDMARK_PATH, METIS_WORDMARK_TRANSFORM } from "./identity";

/** Outlined, theme-aware artwork with one accessible name. */
export function MetisLogo({ className = "", markOnly = false }: { className?: string; markOnly?: boolean }) {
  return (
    <svg viewBox={markOnly ? "0 0 96 72" : "0 0 300 76"} role="img" aria-label="Metis" className={className} fill="currentColor">
      <path d={METIS_MARK_PATH} />
      {!markOnly && <path d={METIS_WORDMARK_PATH} transform={METIS_WORDMARK_TRANSFORM} />}
    </svg>
  );
}
