import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { ESLint } from "eslint";
import { expect, it } from "vitest";
it("TEST-202 scopes TypeScript roots while retaining tracked sources",()=>{
 const config=JSON.parse(readFileSync("tsconfig.json","utf8"));
 const base=process.cwd();
 const files=execFileSync("git",["ls-files","-z"],{encoding:"utf8"}).split("\0").filter(f=>/\.tsx?$/.test(f));
 const probe="docs/owner-untracked/probe.ts";
 const host={...ts.sys,readDirectory:()=>[...files,probe].map(f=>path.join(base,f))};
 const parsed=ts.parseJsonConfigFileContent(config,host,base);
 // Compiler matching against synthetic owner material, with tracked inclusion checked separately.
 expect(config.include).toEqual(["next-env.d.ts","src/**/*.ts","src/**/*.tsx","tests/**/*.ts","tests/**/*.tsx","scripts/**/*.ts","*.ts",".next/types/**/*.ts",".next/dev/types/**/*.ts"]);
 expect(parsed.errors).toEqual([]);
 const real=ts.parseJsonConfigFileContent(config,ts.sys,base).fileNames.map(f=>path.resolve(f).toLowerCase());
 for(const f of files.filter(f=>!f.startsWith("tmp/")&&!f.endsWith(".d.ts"))) expect(real,f).toContain(path.resolve(f).toLowerCase());
});
it("TEST-202 excludes owner code but keeps tracked lint inputs",async()=>{
 const eslint=new ESLint();
 for(const f of ["docs/owner-untracked/probe.ts","brag-output-new/video.js"]) expect(await eslint.isPathIgnored(f),f).toBe(true);
 const files=execFileSync("git",["ls-files","-z"],{encoding:"utf8"}).split("\0").filter(f=>/\.(?:tsx?|mjs|cjs|js)$/.test(f)&&f!=="next-env.d.ts");
 for(const f of files) expect(await eslint.isPathIgnored(f),f).toBe(false);
}, 30_000);
