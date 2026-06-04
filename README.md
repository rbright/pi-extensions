# pi-extensions monorepo

Monorepo for Pi notification extensions using Turborepo.

## Workspace layout

- `extensions/notify-desktop` - `@rbright/notify-desktop`

All format/lint/typecheck/test/build tooling is centralized at the repo root.

## Development

```bash
just deps
just fmt-check
just lint
just typecheck
just test
just build
just check
```

Build the extension independently:

```bash
just build-desktop
```

## Publishing

Only `@rbright/notify-desktop` is published from this repository.

Manual publish:

```bash
just publish-desktop
```

## CI/CD

- `.github/workflows/ci.yml` validates the workspace
- `.github/workflows/publish.yml` publishes `@rbright/notify-desktop`

## Pi install

Local source package:

```bash
pi install ~/Projects/pi-extensions/extensions/notify-desktop
```

Published npm package:

```bash
pi install npm:@rbright/notify-desktop
```

The Pi package manifest points at `src/index.ts`, which Pi loads directly with its TypeScript extension loader.
