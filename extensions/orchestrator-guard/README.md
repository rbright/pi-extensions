# @rbright/orchestrator-guard

Pi extension that keeps the root orchestrator session focused on clarification, routing, and summaries.

## Behavior

- blocks direct root use of implementation/publish/noisy tools like `bash`, `edit`, `write`, `mcp`, and web/context execution helpers
- injects root-only workflow guidance before the agent starts: ask one high-leverage clarifying question before non-trivial delegation, keep grill-me/ask_user_question/approval in root, have delegated planners return the next grill question, and avoid generic filenames like `plan.md`, `context.md`, or `session.md`
- allows subagent sessions to use their normal toolsets without injected root guidance
- reads config from `~/.pi/agent/orchestrator-guard.json` by default

## Notes

- Set `PI_ORCHESTRATOR_GUARD_DISABLED=1` to disable the guard entirely.
- Set `PI_ORCHESTRATOR_GUARD_CONFIG=/path/to/file.json` to load a different config file.
- Root-vs-subagent detection is based on the Pi session file path containing `/sessions/subagent/` by default.
