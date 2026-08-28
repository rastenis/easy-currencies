# Contributing

Bug fixes and provider fixes are very welcome.

## Setup

```bash
npm install    # also builds, via the prepare script
npm test       # offline suite; no API keys needed
```

Node 18 or newer. The offline suite never touches the network, so it passes on
forks, which receive no secrets.

## If CI fails with "You have changed the API signature"

This is not a rejection. Your change altered the public API, and the
change needs recording. The repo keeps a snapshot of the public API at
`etc/easy-currencies.api.md` so that changes to it appear in review rather than
in a consumer's build.

To accept the change:

```bash
npm run api:update
git add etc/easy-currencies.api.md
git commit -m "chore: update API report"
```

Then say in your PR what changed. If you did not intend to change the public
API, the diff in that file shows you what leaked out.

Ignore the tool's suggestion to copy files out of `temp/`. That directory is
scratch output and is gitignored. `npm run api:update` is the supported path.

Removing or changing a line in the report means a breaking change; adding one is
additive. Mention which in your PR, since the tooling cannot tell the difference.

## If CI fails on publint, attw, or the pack smoke test

These check the published tarball rather than the source:

```bash
npm run lint:package    # packaging and package.json correctness
npm run check:package   # TypeScript resolution across node10/node16/bundler
npm run smoke:pack      # installs the tarball and imports it, CJS and ESM
```

They usually fail because `package.json` fields (`main`, `types`, `exports`) and
the built output disagree.

## Coverage

CI gates coverage on the lines your PR changes, not just the global figure. If it
fails, add a test for the new branch rather than lowering the threshold.

## Live tests

`npm run test:live` calls the real provider APIs and needs keys. Copy
`.env.example` to `.env` and fill in what you have. `.env` is gitignored, never
commit it. Maintainers run these on a schedule; you do not need them for a PR.
