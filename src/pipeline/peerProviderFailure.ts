/**
 * Reasons the peer loader treats as a terminal provider failure: collection
 * stops at the first candidate refused this way (src/pipeline/peers.ts). The
 * report's peer summary reads the same vocabulary, so a candidate the
 * provider refused is never counted as excluded at the screen (Codex review
 * of PR #42). No imports: the report renders this on the client too.
 */
export const PEER_PROVIDER_TERMINAL = /401|402|403|429|quota|rate.?limit|api.?key|entitlement|subscription|denied|timeout|abort/i;
