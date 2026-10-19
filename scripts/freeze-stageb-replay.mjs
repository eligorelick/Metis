import { build } from "esbuild";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** Freeze the exact offline calculation graph, independent of a later checkout. */
export async function compileStageBReplay(root, buildId) {
  const built = await build({
    absWorkingDir: root, entryPoints: [join(root, "scripts", "stageb-runtime-replay-entry.ts")],
    bundle: true, write: false, platform: "node", format: "cjs", target: "node22",
    conditions: ["react-server"], external: ["better-sqlite3", "@anthropic-ai/sdk"], metafile: true,
    define: { "process.env.METIS_RUNTIME_BUILD_ID": JSON.stringify(buildId) },
    plugins: [{
      name: "offline-explicit-config",
      setup(builder) {
        builder.onResolve({ filter: /^@\/config\/env$/ }, () => ({ path: "captured-config-only", namespace: "offline" }));
        builder.onLoad({ filter: /.*/, namespace: "offline" }, () => ({
          contents: 'export function getConfig() { throw new Error("Frozen replay requires explicit captured calculation options"); }',
        }));
        // Pure helpers share provider files with live clients. Omit evaluation
        // effects of UNUSED imports only in this specialized offline graph.
        // Used persistence/config code or a new external capability is refused
        // by the emitted graph check below, rather than silently bundled.
        builder.onResolve({ filter: /^@\/(?:ai|db|cache|providers)\// }, args => ({
          path: join(root, "src", `${args.path.slice(2)}.ts`), sideEffects: false,
        }));
      },
    }],
  });
  const permittedProviders = new Set(["src/providers/fmp.ts", "src/providers/currentReports.ts"]);
  for (const output of Object.values(built.metafile.outputs)) {
    if (output.imports.some(dependency => dependency.path !== "node:crypto")) throw new Error("Non-offline replay dependency in emitted runtime graph");
    for (const [rawPath, contribution] of Object.entries(output.inputs)) {
      const path = rawPath.replaceAll("\\", "/");
      if (contribution.bytesInOutput > 0 && (/^src\/(?:ai|db|cache|config)\//.test(path) || (path.startsWith("src/providers/") && !permittedProviders.has(path)))) {
        throw new Error("Non-offline replay dependency in emitted runtime graph");
      }
    }
  }
  return built.outputFiles[0].contents;
}

/** Changes while compiling must not produce a manifest for mixed source states. */
export function buildInputFingerprint(root) {
  const files = [];
  const visit = (relative) => {
    const absolute = join(root, relative);
    if (!existsSync(absolute)) return;
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new Error("Build inputs must not be symlinks");
    if (stat.isDirectory()) for (const entry of readdirSync(absolute)) visit(`${relative}/${entry}`);
    else if (stat.isFile()) files.push([relative, createHash("sha256").update(readFileSync(absolute)).digest("hex")]);
  };
  for (const input of ["src", "config", "scripts", "docs/METHODOLOGY.md", "package.json", "package-lock.json", "next.config.ts", "tsconfig.json"]) visit(input);
  files.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  return createHash("sha256").update(JSON.stringify(files)).digest("hex");
}
