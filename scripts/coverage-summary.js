// Renders coverage/coverage-summary.json as markdown for $GITHUB_STEP_SUMMARY,
// so the figures appear on the run page instead of only in the raw log.
const { readFileSync } = require("fs");

const pct = (n) => `${n.toFixed(2)}%`;
const mark = (n) => (n >= 95 ? "🟢" : n >= 80 ? "🟡" : "🔴");

let summary;
try {
  summary = JSON.parse(readFileSync("coverage/coverage-summary.json", "utf8"));
} catch {
  console.log("No coverage summary found.");
  process.exit(0);
}

const { total, ...files } = summary;
const row = (name, m) =>
  `| ${name} | ${mark(m.statements.pct)} ${pct(m.statements.pct)} | ${pct(
    m.branches.pct
  )} | ${pct(m.functions.pct)} | ${pct(m.lines.pct)} |`;

const lines = [
  "## Coverage",
  "",
  "| File | Statements | Branches | Functions | Lines |",
  "| --- | --- | --- | --- | --- |",
  row("**All files**", total)
];

for (const [path, m] of Object.entries(files).sort()) {
  lines.push(row(path.replace(`${process.cwd()}/`, ""), m));
}

console.log(lines.join("\n"));
