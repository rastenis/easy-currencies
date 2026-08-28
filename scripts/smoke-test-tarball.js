/**
 * Installs the packed tarball into a temp project and imports it the way
 * consumers do, via both require() and import.
 *
 * publint and attw analyse the package statically; neither executes it. Named
 * ESM imports from this CJS build work only because Node's cjs-module-lexer
 * detects TypeScript's re-export emit — a heuristic, not a guarantee. That is
 * exactly what an exports map or an ESM build can break, so this runs the real
 * thing rather than reasoning about it.
 */
const { execSync } = require("child_process");
const { mkdtempSync, writeFileSync, readdirSync, rmSync } = require("fs");
const { join } = require("path");
const { tmpdir } = require("os");

const run = (cmd, cwd) =>
  execSync(cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

const root = process.cwd();
const dir = mkdtempSync(join(tmpdir(), "ec-smoke-"));
let failed = false;

try {
  run("npm pack --pack-destination " + dir, root);
  const tgz = join(dir, readdirSync(dir).find((f) => f.endsWith(".tgz")));

  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "smoke", version: "1.0.0" }));
  run(`npm install --no-audit --no-fund "${tgz}"`, dir);

  const cases = [
    [
      "require (CJS)",
      "cjs.js",
      `const { Converter, Convert, providers } = require("easy-currencies");
       if (typeof Converter !== "function") throw new Error("Converter missing");
       if (typeof Convert !== "function") throw new Error("Convert missing");
       if (!providers.Fixer) throw new Error("providers.Fixer missing");
       console.log("ok");`
    ],
    [
      "import (ESM named)",
      "esm.mjs",
      `import { Converter, Convert, providers } from "easy-currencies";
       if (typeof Converter !== "function") throw new Error("Converter missing");
       if (typeof Convert !== "function") throw new Error("Convert missing");
       if (!providers.Fixer) throw new Error("providers.Fixer missing");
       console.log("ok");`
    ],
    [
      "import (ESM default)",
      "esm-default.mjs",
      `import pkg from "easy-currencies";
       if (typeof pkg.Converter !== "function") throw new Error("default.Converter missing");
       console.log("ok");`
    ]
  ];

  for (const [label, file, source] of cases) {
    writeFileSync(join(dir, file), source);
    try {
      run(`node ${file}`, dir);
      console.log(`  ok    ${label}`);
    } catch (e) {
      failed = true;
      console.error(`  FAIL  ${label}\n${(e.stderr || e.message).trim()}`);
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (failed) {
  console.error("\nThe packed tarball is not consumable.");
  process.exit(1);
}
console.log("Packed tarball imports cleanly.");
