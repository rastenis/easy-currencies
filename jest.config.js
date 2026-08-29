// jest.config.js

// Loaded here rather than via --setupFiles: the live/offline split below is
// decided when this config is evaluated, which is before setup files run.
require("dotenv").config();

const LIVE_KEYS = [
  "CURRENCY_LAYER_KEY",
  "FIXER_KEY",
  "ALPHA_VANTAGE_KEY",
  "EXCHANGERATESAPI_IO_KEY",
  "OPEN_EXCHANGE_RATES_KEY"
];

const hasLiveKeys = LIVE_KEYS.some((k) => !!process.env[k]);

const common = {
  preset: "ts-jest",
  testEnvironment: "node",
  transform: { "^.+\\.(ts|tsx)$": "ts-jest" }
};

module.exports = {
  projects: [
    {
      ...common,
      displayName: "offline",
      testMatch: ["<rootDir>/test/**/*.test.{ts,js}"],
      testPathIgnorePatterns: ["/node_modules/", "<rootDir>/test/live/"]
    },
    {
      ...common,
      displayName: "live",
      // Real requests, with retries on a 429, against vendors that rate limit.
      // Jest's 5s default is not enough: two of these files had no explicit
      // timeout and one timed out on a back-to-back canary run. Setting it here
      // rather than per test so a new live file cannot inherit the gap.
      testTimeout: 30000,
      // Hits real vendor APIs to catch drift that mocks cannot see. Opt-in, and
      // an empty match when unconfigured (jest falls back to its default
      // pattern and scans everything if testMatch is an empty array).
      testMatch: [
        hasLiveKeys
          ? "<rootDir>/test/live/**/*.live.test.js"
          : "<rootDir>/test/live/**/*.no-credentials-configured.js"
      ]
    }
  ],
  collectCoverageFrom: ["src/**/*.ts", "!src/index.ts"],
  coverageReporters: ["text", "text-summary", "lcov", "json-summary"],

  // A gate, not a dashboard: a PR that drops coverage fails here. Set a little
  // below current levels so ordinary refactors don't trip it.
  coverageThreshold: {
    global: { statements: 95, branches: 90, functions: 95, lines: 95 }
  }
};
