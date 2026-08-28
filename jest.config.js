// jest.config.js

/**
 * The offline suite (unit + contract) is the default and the CI gate: no API
 * keys, no network, deterministic.
 *
 * The live suite talks to real vendor APIs. It exists to catch vendor drift —
 * changed payloads, retired endpoints — which mocks cannot see. It is opt-in
 * via `npm run test:live` and skips itself when no API keys are configured, so
 * it never fails a contributor who simply doesn't have credentials.
 */

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
      testMatch: [
        "<rootDir>/test/unit/**/*.test.ts",
        "<rootDir>/test/unit/**/*.test.js",
        "<rootDir>/test/contract/**/*.test.ts"
      ]
    },
    {
      ...common,
      displayName: "live",
      // An empty testMatch makes jest fall back to its default pattern and scan
      // the whole tree, so when keys are absent we point at a glob that matches
      // nothing instead. Run with --passWithNoTests.
      testMatch: [
        hasLiveKeys
          ? "<rootDir>/test/live/**/*.live.test.js"
          : "<rootDir>/test/live/**/*.no-credentials-configured.js"
      ]
    }
  ],
  collectCoverageFrom: ["src/**/*.ts", "!src/index.ts"]
};
