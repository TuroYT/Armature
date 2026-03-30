# Contributing to Armature

Thank you for taking the time to contribute!

## Getting started

1. Fork the repository
2. Clone your fork and create a branch: `git checkout -b feat/my-feature`
3. Follow the [Getting Started](./docs/getting-started.md) guide to set up the project locally

## Development workflow

```bash
npm install
cp .env.example .env   # fill in required variables
npx prisma migrate dev
npm run start:dev
```

## Before submitting a PR

- [ ] `npm run lint` passes with no errors
- [ ] `npm run build` compiles without errors
- [ ] `npm test` passes
- [ ] New public APIs are documented in `/docs`
- [ ] New `ErrorCode` entries have translations in both `fr.ts` and `en.ts`

## Conventions

- Follow the patterns described in [Architecture](./docs/architecture.md)
- Use `ErrorCode` constants — never raw string literals in exceptions
- Inject `LoggerService` — never `console.log`
- Relative imports must use `.js` extensions (TypeScript `nodenext` module resolution)
- Import Prisma types from `generated/prisma/client.js`, never from `@prisma/client`

## Adding an optional module

Optional modules must self-activate via `static register()` reading `process.env`. See [Adding a Social Provider](./docs/adding-social-provider.md) for the full pattern.

## Reporting bugs

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.yml).

## Suggesting features

Use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.yml).
