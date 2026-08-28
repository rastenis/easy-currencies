/**
 * Patch (delta) coverage: what fraction of the lines this branch ADDED are
 * covered by tests.
 *
 * Global coverage hides new gaps — adding a few uncovered lines to a 99%
 * codebase barely moves the number, and passes a global threshold, while patch
 * coverage reports it directly.
 *
 * Usage: node scripts/patch-coverage.js [baseRef] [--min=80]
 * Reads coverage/lcov.info, so run the coverage suite first.
 */
const { execSync } = require("child_process");
const { readFileSync, existsSync } = require("fs");

const args = process.argv.slice(2);
const minArg = args.find((a) => a.startsWith("--min="));
const MIN = minArg ? Number(minArg.split("=")[1]) : 80;
const base =
  args.find((a) => !a.startsWith("--")) || process.env.BASE_REF || "origin/master";

/** Line numbers added per file, from a zero-context diff. */
function addedLines(baseRef) {
  const diff = execSync(
    // Pathspec is `src`, not a glob: git wildmatch cannot match zero
    // directories, so `src/**/*.ts` silently skips files directly in src/.
    `git diff --unified=0 --diff-filter=AM ${baseRef}...HEAD -- src`,
    { encoding: "utf8", maxBuffer: 1 << 26 }
  );

  const files = new Map();
  let current = null;

  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ b/")) {
      current = line.slice(6).trim();
      if (current === "/dev/null") current = null;
      else files.set(current, new Set());
      continue;
    }
    // @@ -old,n +new,m @@  — m defaults to 1 when omitted
    const hunk = /^@@ -\S+ \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunk && current) {
      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      for (let i = 0; i < count; i++) files.get(current).add(start + i);
    }
  }
  return files;
}

/** Executable lines and their hit counts, per file, from lcov. */
function lcovHits(path) {
  const files = new Map();
  let current = null;

  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (line.startsWith("SF:")) {
      current = line.slice(3).trim().replace(`${process.cwd()}/`, "");
      files.set(current, new Map());
    } else if (line.startsWith("DA:") && current) {
      const [ln, hits] = line.slice(3).split(",").map(Number);
      files.get(current).set(ln, hits);
    }
  }
  return files;
}

if (!existsSync("coverage/lcov.info")) {
  console.error("No coverage/lcov.info — run the coverage suite first.");
  process.exit(1);
}

const added = addedLines(base);
const hits = lcovHits("coverage/lcov.info");

const rows = [];
let totalAdded = 0;
let totalCovered = 0;

for (const [file, lines] of [...added].sort()) {
  const fileHits = hits.get(file);
  if (!fileHits) continue;

  // Only lines the instrumenter considers executable; comments, types and
  // blank lines are not coverable and must not count against the score.
  const executable = [...lines].filter((l) => fileHits.has(l));
  if (!executable.length) continue;

  const covered = executable.filter((l) => fileHits.get(l) > 0);
  const missing = executable.filter((l) => fileHits.get(l) === 0);

  totalAdded += executable.length;
  totalCovered += covered.length;
  rows.push({ file, added: executable.length, covered: covered.length, missing });
}

if (!totalAdded) {
  console.log("## Patch coverage\n\nNo new executable lines in `src/`.");
  process.exit(0);
}

const pct = (totalCovered / totalAdded) * 100;
const ok = pct >= MIN;

const out = [
  "## Patch coverage",
  "",
  `${ok ? "🟢" : "🔴"} **${pct.toFixed(2)}%** of ${totalAdded} new line${
    totalAdded === 1 ? "" : "s"
  } covered (minimum ${MIN}%)`,
  "",
  "| File | New lines | Covered | Uncovered lines |",
  "| --- | --- | --- | --- |"
];

for (const r of rows) {
  out.push(
    `| ${r.file} | ${r.added} | ${r.covered} | ${
      r.missing.length ? r.missing.join(", ") : "—"
    } |`
  );
}

console.log(out.join("\n"));

if (!ok) {
  console.error(`\nPatch coverage ${pct.toFixed(2)}% is below the ${MIN}% minimum.`);
  process.exit(1);
}
