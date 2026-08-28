// Stryker needs a single-project jest config: the offline suite only, with no
// coverage collection (Stryker does its own instrumentation).
const base = require("./jest.config.js");
const offline = base.projects.find((p) => p.displayName === "offline");

module.exports = { ...offline, displayName: undefined };
