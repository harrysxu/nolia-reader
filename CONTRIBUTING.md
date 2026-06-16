# Contributing

Thanks for helping improve Nolia Reader.

## Development

```sh
npm install
npm run verify
```

Before opening a pull request, run:

```sh
npm run typecheck
npm run lint
npm test
npm run build:chrome
```

Run `npm run e2e` when changing extension loading, content scripts, reader flows, exports, or browser permissions.

## Pull Request Guidelines

- Keep changes focused and explain user-visible behavior.
- Add or update tests for detection, rendering, settings, messaging, and export logic.
- Do not commit generated artifacts from `dist/`, `release/`, `test-results/`, or `playwright-report/`.
- Do not include private documents, internal URLs, access tokens, browser profiles, or local machine paths.

## Code Style

- TypeScript and React are used throughout the extension.
- Keep browser API access behind shared wrappers where possible.
- Prefer local, sanitized rendering. Do not introduce remote code loading.
- Keep permissions narrow and explain any permission expansion in the pull request.
