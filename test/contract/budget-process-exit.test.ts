import { execFileSync } from "child_process";
import { writeFileSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

/**
 * The time budget has to settle the promise in a process with nothing else to
 * do, which is exactly the shape of a script whose only work is one conversion.
 *
 * This cannot be an in-process test: jest keeps the event loop alive, so an
 * unref'd deadline timer still fires under it and the suite stayed green while
 * a real consumer got node exiting 0 with the promise never settling. Only a
 * separate process shows the difference.
 */

function run(script: string): string {
  const dir = mkdtempSync(join(tmpdir(), "ec-budget-"));
  const file = join(dir, "run.js");
  writeFileSync(file, script);
  return execFileSync(process.execPath, [file], {
    encoding: "utf8",
    timeout: 30000
  }).trim();
}

const DIST = join(__dirname, "..", "..", "dist", "index.js");

it("rejects a hanging client instead of letting the process exit silently", () => {
  const out = run(`
    const { Converter } = require(${JSON.stringify(DIST)});
    const c = new Converter();
    c.onError = () => {};
    c.setClient({ get: () => new Promise(() => {}) });
    c.setRetryOptions({ budgetMs: 500 });

    let settled = false;
    c.convert(1, "USD", "EUR").then(
      () => { settled = true; console.log("RESOLVED"); },
      (e) => { settled = true; console.log("REJECTED:" + e.message); }
    );
    process.on("exit", () => {
      if (!settled) console.log("EXITED WITHOUT SETTLING");
    });
  `);

  expect(out).toMatch(/^REJECTED:/);
  expect(out).toMatch(/ran out of time/);
});

it("does not hold the process open once the answer is in", () => {
  const out = run(`
    const { Converter } = require(${JSON.stringify(DIST)});
    const c = new Converter();
    c.setClient({ get: async () => ({ status: 200, data: { rates: { EUR: 0.9 } } }) });
    // A long budget must not keep the process alive after the conversion lands.
    c.setRetryOptions({ budgetMs: 600000 });

    const started = Date.now();
    process.on("exit", () => console.log("EXITED_IN_MS:" + (Date.now() - started)));
    c.convert(10, "USD", "EUR").then((v) => console.log("VALUE:" + v));
  `);

  expect(out).toMatch(/VALUE:9/);
  const ms = Number(/EXITED_IN_MS:(\d+)/.exec(out)![1]);
  expect(ms).toBeLessThan(5000);
});
