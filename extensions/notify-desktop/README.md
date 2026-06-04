# notify-desktop

`notify-desktop` sends terminal OSC notifications when the Pi agent finishes a turn.

npm package: `@rbright/notify-desktop`

## Install into Pi

```bash
pi install npm:@rbright/notify-desktop
```

For local development:

```bash
pi install ~/Projects/pi-extensions/extensions/notify-desktop
```

If Pi is already running, run `/reload`.

## Behavior

- Triggers on assistant completion and falls back to `agent_end`
- Dedupe per agent run (single notification)
- Writes to `/dev/tty` first, then stdout when appropriate
- Protocol auto-selection:
  - iTerm2 / WezTerm -> OSC 9
  - Ghostty -> OSC 777
  - zellij fallback -> OSC 9

## Configuration

Environment variables:

- `PI_NOTIFY_DESKTOP_ENABLED` - set to `false`, `0`, `no`, or `off` to disable notifications
- `PI_NOTIFY_DESKTOP_PROTOCOL` - `auto`, `osc9`, or `osc777`
- `PI_NOTIFY_DESKTOP_TITLE` - notification title, default `Pi`
- `PI_NOTIFY_DESKTOP_BODY` - notification body, default `Turn complete — awaiting feedback`
- `PI_NOTIFY_DESKTOP_TMUX_PASSTHROUGH` - set to `false`, `0`, `no`, or `off` to disable tmux passthrough

## Local development

From repo root:

```bash
just check:desktop
just build-desktop
```

The Pi package manifest points at `src/index.ts`, so local Pi installs do not require `dist/` to be built first.

## Publishing

Published from the monorepo root:

```bash
just publish-desktop
```
