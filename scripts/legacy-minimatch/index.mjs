// Only the API used by our pinned ESLint 9/config/plugin consumers is adapted.
// All glob parsing and matching belongs to the real, patched upstream engine.
import { Minimatch as PatchedMinimatch } from "minimatch-modern";

class Minimatch extends PatchedMinimatch {
  constructor(pattern, options = {}) {
    super(pattern.trim(), {
      // v3 preserved literal '..' portions and treated native Windows separators
      // as separators unless allowWindowsEscape was explicitly enabled.
      optimizationLevel: 0,
      windowsPathsNoEscape: process.platform === "win32" && !options.allowWindowsEscape,
      ...options,
    });
  }
}

function minimatch(value, pattern, options) {
  return new Minimatch(pattern, options).match(value);
}

minimatch.Minimatch = Minimatch;
// eslint-plugin-import/no-internal-modules consumes only .test(), never RegExp
// source/exec/flags. v11 deliberately removed regexp compilation; do not recreate
// it or claim this small compatibility surface is a general RegExp replacement.
minimatch.makeRe = (pattern, options) => {
  const matcher = new Minimatch(pattern, options);
  return { test: (value) => matcher.match(value) };
};

// The project requires Node >=24: its synchronous require(ESM) interop export
// returns the callable function to CommonJS; ESM consumers use the default.
export default minimatch;
export { minimatch as "module.exports" };
