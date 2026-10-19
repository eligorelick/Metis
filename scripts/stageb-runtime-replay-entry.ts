/** Built with Stage B and retained beside the server graph; never imports today's checkout. */
export { runStageB } from "../src/pipeline/compute";
export { replayRunInputSnapshot } from "../src/pipeline/replayRunInput";
export { CURRENT_SNAPSHOT_VERSIONS } from "../src/pipeline/runInputSnapshot";
export const RUNTIME_REPLAY_BUILD_ID = process.env.METIS_RUNTIME_BUILD_ID;
