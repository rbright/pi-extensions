# @rbright/provider-cache-keys

Pi extension that injects stable repo-derived cache-affinity keys for OpenRouter requests.

## Behavior

- derives a stable repo identity from `git remote.origin.url` when available, otherwise from the git top-level path
- uses repo-level keys by default so root Pi sessions and pi-subagent child sessions in the same repo share cache affinity
- adds source-specific affinity suffixes for isolated retrieval agents (`datadog`, `linear`, `sentry`, `todoist`, `web-researcher`) while keeping the isolation key repo-derived
- injects `session_id` for `openrouter` payloads so OpenRouter sticky routing follows a stable repo-derived key instead of Pi session ids
- writes structured JSONL metrics to `~/.pi/agent/logs/provider-cache-keys.jsonl` without prompts, completions, headers, or secrets
- reads config from `~/.pi/agent/provider-cache-keys.json` by default

## Notes

- Set `PI_PROVIDER_CACHE_KEYS_CONFIG=/path/to/file.json` to load a different config file.
- OpenRouter uses `session_id` as the sticky-routing key; this extension keeps that key stable across root and subagent sessions in the same repo.
- Set `enabled` to `false` in the config file to disable injection and logging.
- Set `affinityScope` to `worktree` only if repo-level affinity is too coarse under heavy parallel worktree load.
