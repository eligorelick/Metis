import { TestRunner, type RunnerTestFile } from "vitest";
import { nativeSqliteTestTimeout } from "./nativeSqliteTiming";

/** Supported runner hook: resolve the default before collecting each file's tests. */
export default class NativeSqliteTestRunner extends TestRunner {
  private readonly configuredTimeout = this.config.testTimeout;
  private readonly hostPlatform = process.platform;

  override onCollectStart(file: RunnerTestFile): void {
    // Start from the resolved caller default every time, even when one worker
    // collects a native-I/O file followed by an unrelated CPU-only file.
    this.config.testTimeout = nativeSqliteTestTimeout(file.filepath, this.hostPlatform, this.configuredTimeout);
    super.onCollectStart(file);
  }
}
