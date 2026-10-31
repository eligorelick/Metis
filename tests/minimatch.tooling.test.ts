import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const require = createRequire(path.join(ROOT, "package.json"));
const consumers = ["eslint", "@eslint/config-array", "@eslint/eslintrc", "eslint-plugin-import", "eslint-plugin-react", "eslint-plugin-jsx-a11y", "@typescript-eslint/typescript-estree"];

describe("patched minimatch tooling boundary", () => {
  it("has no vulnerable upstream minimatch in the locked or actual consumer graph", () => {
    const lock = JSON.parse(readFileSync(path.join(ROOT, "package-lock.json"), "utf8"));
    const upstream = Object.entries(lock.packages).filter(([location, raw]) => {
      const entry = raw as { name?: string; link?: boolean };
      return !entry.link && (entry.name === "minimatch" || (!entry.name && location.endsWith("/node_modules/minimatch")) || (!entry.name && location === "node_modules/minimatch"));
    });
    expect(upstream.length).toBeGreaterThan(0);
    expect([...new Set(upstream.map(([, raw]) => (raw as { version: string }).version))]).toEqual(["11.0.1"]);
  });

  it("resolves only the patched engine from every installed ESLint consumer", () => {
    for (const consumer of consumers) {
      const fromConsumer = createRequire(require.resolve(consumer));
      const info = fromConsumer("minimatch/package.json") as { name: string; version: string };
      if (info.name === "@metis/legacy-minimatch") {
        const fromFacade = createRequire(fromConsumer.resolve("minimatch"));
        expect(fromFacade("minimatch-modern/package.json")).toMatchObject({ name: "minimatch", version: "11.0.1" });
      } else {
        expect(info).toMatchObject({ name: "minimatch", version: "11.0.1" });
      }
    }
  });

  it("preserves legacy path options and predicate matching for actual consumers", async () => {
    const fromImport = createRequire(require.resolve("eslint-plugin-import"));
    const legacy = fromImport("minimatch");
    const imported = await import(pathToFileURL(fromImport.resolve("minimatch")).href);
    expect(imported.default("nested/a.ts", "**/*.ts")).toBe(true);
    expect(imported.default("nested/a.js", "**/*.ts")).toBe(false);
    expect(legacy("a/../b.ts", "a/../*.ts")).toBe(true);
    expect(legacy("b.ts", "a/../*.ts")).toBe(false);
    expect(legacy("a.ts", "  *.ts  ")).toBe(true);
    expect(legacy(".hidden.ts", "*.ts")).toBe(false);
    expect(legacy(".hidden.ts", "*.ts", { dot: true })).toBe(true);
    expect(legacy("a.ts", "!*.js")).toBe(true);
    expect(legacy("a.js", "!*.js")).toBe(false);
    expect(legacy("a.js", "!*.js", { flipNegate: true })).toBe(true);
    expect(legacy("nested/a.ts", "*.ts", { matchBase: true })).toBe(true);
    expect(legacy.makeRe("secret/{a,b}").test("secret/a")).toBe(true);
    expect(legacy.makeRe("secret/{a,b}").test("secret/c")).toBe(false);
    if (process.platform === "win32") {
      expect(legacy("nested\\a.ts", "nested\\*.ts")).toBe(true);
    }
  });

  it("keeps file selection, dotfiles, braces, extglobs and ignores in the real ESLint enumerator", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "metis-minimatch-files-"));
    try {
      const files = ["a.js", "a.cjs", "a.mjs", "a.ts", "a.tsx", "a.jsx", ".hidden.ts", "nested/a.ts", "nested/a.test.ts", "ignored/a.ts", "nested/a.txt"];
      for (const file of files) {
        mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
        writeFileSync(path.join(dir, file), "debugger;\n");
      }
      const eslint = new ESLint({ cwd: dir, overrideConfigFile: true, overrideConfig: [
        { ignores: ["ignored/**", "**/*.test.ts"] },
        { files: ["**/*.{js,cjs,mjs,ts,tsx,jsx}"], rules: { "no-debugger": "error" } },
        { files: ["**/!(*.test).ts"], rules: { "no-empty": "error" } },
      ] });
      const results = await eslint.lintFiles(["."]);
      expect(results.map((result) => path.relative(dir, result.filePath).replaceAll("\\", "/")).sort()).toEqual([
        ".hidden.ts", "a.cjs", "a.js", "a.jsx", "a.mjs", "a.ts", "a.tsx", "nested/a.ts",
      ]);
      for (const result of results) expect(result.messages.map((message) => message.ruleId)).toEqual(["no-debugger"]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("runs legacy callable and makeRe consumers without dropping rule diagnostics", async () => {
    const eslint = new ESLint({ cwd: ROOT, overrideConfigFile: true, overrideConfig: [{
      files: ["**/*.jsx"], languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
      plugins: { react: require("eslint-plugin-react"), import: require("eslint-plugin-import"), "jsx-a11y": require("eslint-plugin-jsx-a11y") },
      rules: {
        "react/forbid-component-props": ["error", { forbid: [{ propNamePattern: "data-*", disallowedForPatterns: ["Bad*"] }] }],
        "import/no-internal-modules": ["error", { forbid: ["secret/**"] }],
        "jsx-a11y/label-has-associated-control": ["error", { controlComponents: ["Field*"], assert: "nesting" }],
      },
    }] });
    const valid = await eslint.lintText('import x from "public/x"; const a = <Good data-id="a"/>; const b = <label>Name<FieldText /></label>;', { filePath: "consumer.jsx" });
    expect(valid[0]!.messages).toEqual([]);
    const invalid = await eslint.lintText('import x from "secret/x"; const a = <BadPanel data-id="a"/>; const b = <label>Name<Other /></label>;', { filePath: "consumer.jsx" });
    expect(invalid[0]!.messages.map((message) => message.ruleId).sort()).toEqual(["import/no-internal-modules", "jsx-a11y/label-has-associated-control", "react/forbid-component-props"]);
  });

  it("retains legacy override matchBase and exclusion behavior on native paths", () => {
    const { Legacy } = require("@eslint/eslintrc");
    const config = new Legacy.ConfigArrayFactory().create({ overrides: [{ files: ["*.{js,ts}"], excludedFiles: ["**/*.test.*"], rules: { "no-debugger": "error" } }] }, { basePath: ROOT });
    expect(config.extractConfig(path.join(ROOT, "nested", "a.ts")).rules["no-debugger"]).toEqual(["error"]);
    expect(config.extractConfig(path.join(ROOT, "nested", "a.test.ts")).rules["no-debugger"]).toBeUndefined();
    expect(config.extractConfig(path.join(ROOT, "nested", "a.txt")).rules["no-debugger"]).toBeUndefined();
  });

  it("runs the modern named-export consumer through TypeScript project-service admission", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "metis-minimatch-project-"));
    const parser = require("@typescript-eslint/parser");
    try {
      const file = path.join(dir, "outside.ts");
      writeFileSync(file, "const value: number = 1;\n");
      const result = parser.parseForESLint("const value: number = 1;", { filePath: file, tsconfigRootDir: dir, projectService: { allowDefaultProject: ["*.ts"] }, disallowAutomaticSingleRunInference: true });
      expect(result.services.program).toBeDefined();
      expect(result.ast.body[0].type).toBe("VariableDeclaration");
    } finally { parser.clearCaches(); rmSync(dir, { recursive: true, force: true }); }
  });
});
