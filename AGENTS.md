# Extension Folder Instructions

This folder contains user-level pi-coding-agent extensions.

Before changing extension code:

- Read `EXTENSIONS.md` for the current extension inventory, learned patterns, best practices, and pi documentation references.
- Inspect the specific extension file(s) involved and nearby examples before editing.
- Keep changes focused and reversible; extensions run with full user permissions.

When changing an extension:

- Update `EXTENSIONS.md` in the same change if behavior, commands/tools, API usage, state persistence, UI behavior, cleanup requirements, or setup assumptions changed.
- Do not broaden the setup beyond `AGENTS.md` and `EXTENSIONS.md` unless the user confirms or explicitly instructs it.
- Preserve existing style: TypeScript, tabs for indentation in current extension files, concise comments, and direct pi extension APIs.
- Guard UI-dependent behavior with `ctx.hasUI` when relevant.
- Add or preserve `session_shutdown` cleanup for timers, intervals, watchers, subprocesses, and TUI references.
- For stateful tools, prefer storing state in tool result `details` and reconstructing from the current session branch.

Validation guidance:

- Prefer targeted TypeScript/syntax checks when available.
- For interactive UI changes, include a manual `/reload` and smoke-test note because behavior may require an interactive pi session.
- Do not run destructive commands, install dependencies, or modify machine-level config unless the user explicitly approves.
