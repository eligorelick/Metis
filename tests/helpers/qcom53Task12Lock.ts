import { createHash } from "node:crypto";

// D-138 Task 12: test-only inverse of the eleven reviewed development-tooling
// lock nodes (689b6d54 -> 6ce14d60). This does not install the historical tree,
// change the physical lock, alter fixture provenance, or exempt other dev deps.
// Require exact current bytes, every current node, the closed change set, and
// exact restored bytes before the existing branding/license normalization runs.
const REPLACEMENTS: readonly {
  path: string;
  currentHash: string | null;
  before: Record<string, unknown> | null;
}[] = [
  {
    "path": "",
    "currentHash": "d5804d2780a0c3392ca156a87ce098d6260cbd1f9c352ea5f23a7d6525776b54",
    "before": {
      "name": "metis",
      "version": "0.1.0",
      "license": "SEE LICENSE IN LICENSE",
      "dependencies": {
        "@anthropic-ai/sdk": "^0.112.3",
        "@next/env": "16.4.2",
        "better-sqlite3": "^12.11.1",
        "drizzle-orm": "^0.45.2",
        "jose": "6.2.12",
        "lightweight-charts": "^5.2.0",
        "next": "16.4.2",
        "react": "^19.2.7",
        "react-dom": "^19.2.7",
        "recharts": "^3.9.2",
        "server-only": "^0.0.1",
        "zod": "^4.6.6"
      },
      "devDependencies": {
        "@tailwindcss/postcss": "^4.3.3",
        "@types/better-sqlite3": "^7.6.13",
        "@types/node": "^26.1.1",
        "@types/react": "^19.2.17",
        "@types/react-dom": "^19.2.3",
        "@vitest/coverage-v8": "^4.1.12",
        "drizzle-kit": "^0.31.10",
        "esbuild": "0.28.1",
        "eslint": "^9.39.5",
        "eslint-config-next": "16.4.2",
        "fast-glob": "file:scripts/next-eslint-glob",
        "happy-dom": "^21.0.4",
        "postcss": "^8.5.26",
        "tailwindcss": "^4.3.3",
        "typescript": "^6.0.3",
        "vitest": "^4.1.12"
      },
      "engines": {
        "node": ">=24"
      }
    }
  },
  {
    "path": "node_modules/@isaacs/nonrecursive-glob-match",
    "currentHash": "6dc9b8a3d7a184e8cc315393588593377eff0ec8bb574192f6291200eecbfe2e",
    "before": null
  },
  {
    "path": "node_modules/@typescript-eslint/typescript-estree/node_modules/balanced-match",
    "currentHash": null,
    "before": {
      "version": "4.0.4",
      "resolved": "https://registry.npmjs.org/balanced-match/-/balanced-match-4.0.4.tgz",
      "integrity": "sha512-BLrgEcRTwX2o6gGxGOCNyMvGSp35YofuYzw9h1IMTRmKqttAZZVU67bdb9Pr2vUHA8+j3i2tJfjO6C6+4myGTA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": "18 || 20 || >=22"
      }
    }
  },
  {
    "path": "node_modules/@typescript-eslint/typescript-estree/node_modules/brace-expansion",
    "currentHash": null,
    "before": {
      "version": "5.0.12",
      "resolved": "https://registry.npmjs.org/brace-expansion/-/brace-expansion-5.0.12.tgz",
      "integrity": "sha512-YovQ3rzhaLMIrDjNDMkNS01tea93qhEhG5xy8f6+R0l+dw3Ki+5sCoIoI942iuLZTHWogWktgwVDhU09iNEimQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "balanced-match": "^4.0.2"
      },
      "engines": {
        "node": "20 || >=22"
      }
    }
  },
  {
    "path": "node_modules/@typescript-eslint/typescript-estree/node_modules/minimatch",
    "currentHash": "2dcca7bb99691bf4c7fd95e98bcd4f2953bcb8295776fbe0bbaf13d3da99ef0a",
    "before": {
      "version": "10.2.5",
      "resolved": "https://registry.npmjs.org/minimatch/-/minimatch-10.2.5.tgz",
      "integrity": "sha512-MULkVLfKGYDFYejP07QOurDLLQpcjk7Fw+7jXS2R2czRQzR56yHRveU5NDJEOviH+hETZKSkIk5c+T23GjFUMg==",
      "dev": true,
      "license": "BlueOak-1.0.0",
      "dependencies": {
        "brace-expansion": "^5.0.5"
      },
      "engines": {
        "node": "18 || 20 || >=22"
      },
      "funding": {
        "url": "https://github.com/sponsors/isaacs"
      }
    }
  },
  {
    "path": "node_modules/balanced-match",
    "currentHash": "e2f7e48dce5b776c09f408b8277ef1846672fbb41ed543ad97c249ee432ec7c6",
    "before": {
      "version": "1.0.2",
      "resolved": "https://registry.npmjs.org/balanced-match/-/balanced-match-1.0.2.tgz",
      "integrity": "sha512-3oSeUO0TMV67hN1AmbXsK4yaqU7tjiHlbxRDZOpH0KW9+CeX4bRAaX0Anxt0tx2MrpRpWwQaPwIlISEJhYU5Pw==",
      "dev": true,
      "license": "MIT"
    }
  },
  {
    "path": "node_modules/brace-expansion",
    "currentHash": "6c817380f8d67d02bb0b40223d5824c880de50c9116251ee4f242e8044fca404",
    "before": {
      "version": "1.1.21",
      "resolved": "https://registry.npmjs.org/brace-expansion/-/brace-expansion-1.1.21.tgz",
      "integrity": "sha512-9zeA+KLZNNzglF2TPKRQEDyx6Yby7daAkuy8MiPzpXPsYDWi/DRM8jmwUDxokQjYqBpv5DgPiwD4h4ZZSy1Ujw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "balanced-match": "^1.0.0",
        "concat-map": "0.0.1"
      }
    }
  },
  {
    "path": "node_modules/concat-map",
    "currentHash": null,
    "before": {
      "version": "0.0.1",
      "resolved": "https://registry.npmjs.org/concat-map/-/concat-map-0.0.1.tgz",
      "integrity": "sha512-/Srv4dswyQNBfohGpz9o6Yb3Gz3SrUDqBH5rTuhGR7ahtlbYKnVxw2bCFMRljaA7EXHaXZ8wsHdodFvbkhKmqg==",
      "dev": true,
      "license": "MIT"
    }
  },
  {
    "path": "node_modules/minimatch",
    "currentHash": "2a33d5ea48735654e9e988c1f0c8a10faeaa3ecfd2d2dbd4a930bceec73dafb1",
    "before": {
      "version": "3.1.5",
      "resolved": "https://registry.npmjs.org/minimatch/-/minimatch-3.1.5.tgz",
      "integrity": "sha512-VgjWUsnnT6n+NUk6eZq77zeFdpW2LWDzP6zFGrCbHXiYNul5Dzqk2HHQ5uFH2DNW5Xbp8+jVzaeNt94ssEEl4w==",
      "dev": true,
      "license": "ISC",
      "dependencies": {
        "brace-expansion": "^1.1.7"
      },
      "engines": {
        "node": "*"
      }
    }
  },
  {
    "path": "node_modules/minimatch-modern",
    "currentHash": "5da07e74f6dc6069664a66fff2a32d6fca09e8c468121e2a9ae560cf5dc393a0",
    "before": null
  },
  {
    "path": "scripts/legacy-minimatch",
    "currentHash": "a7795df80c7d49bad6baf9e7afecd6af7d04d379bf782ec49636cb4a35c7e2d6",
    "before": null
  }
];

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const entryHash = (entry: Record<string, unknown> | undefined) => entry === undefined ? null : hash(JSON.stringify(entry));

export function restoreQcom53Task12Lock(source: string): string {
  if (Buffer.byteLength(source) !== 327884 || hash(source) !== "9626141684a0c02a95ee949bd7a2ecb06c44d6706956ae7b069b3d8ee903668f") {
    throw new Error("Task12 lock requires exact reviewed current bytes");
  }
  const current = JSON.parse(source) as { packages: Record<string, Record<string, unknown>> };
  const restored = structuredClone(current);
  if (REPLACEMENTS.length !== 11 || new Set(REPLACEMENTS.map(row => row.path)).size !== 11) {
    throw new Error("Task12 lock restoration requires eleven distinct nodes");
  }
  for (const row of REPLACEMENTS) {
    if (entryHash(current.packages[row.path]) !== row.currentHash) {
      throw new Error("Task12 lock unexpected current node: " + row.path);
    }
    if (row.before === null) delete restored.packages[row.path];
    else restored.packages[row.path] = structuredClone(row.before);
  }
  const paths = [...new Set([...Object.keys(current.packages), ...Object.keys(restored.packages)])];
  const changed = paths.filter(key => JSON.stringify(current.packages[key]) !== JSON.stringify(restored.packages[key])).sort();
  if (JSON.stringify(changed) !== JSON.stringify(REPLACEMENTS.map(row => row.path).sort())) {
    throw new Error("Task12 lock restoration changed an unowned node or missed an owned node");
  }
  // Match the pre-task npm serialization, including underscore/punctuation order.
  restored.packages = Object.fromEntries(Object.entries(restored.packages).sort(([a], [b]) => a.localeCompare(b, "en")));
  const result = JSON.stringify(restored, null, 2) + "\n";
  if (Buffer.byteLength(result) !== 327945 || hash(result) !== "39ef0024e898fa8db387dfeef99bb97a9463fd7a8a584082e961feaec8770d95") {
    throw new Error("Task12 lock restoration does not reproduce exact pre-task bytes");
  }
  return result;
}
