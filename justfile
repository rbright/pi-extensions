set shell := ["bash", "-uc"]
set positional-arguments

default:
  @just --list

deps:
  bun install

[group('build')]
build:
  bun run build

[group('build')]
build-desktop:
  bun run build:desktop

[group('format')]
fmt:
  bun run format

[group('format')]
fmt-check:
  bun run format:check

[group('lint')]
lint:
  bun run lint

[group('lint')]
typecheck:
  bun run typecheck

[group('test')]
test:
  bun run test

check:
  bun run check

pre-commit:
  prek run --all-files

pre-commit-install:
  prek install

clean:
  bun run clean

publish-desktop:
  bun run publish:desktop
