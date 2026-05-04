# Pi Extension Agent Setup

This folder contains user-level pi-coding-agent extensions. Future agents should use this file as the local handoff/context document before changing extension code.

## Current extensions

- `border-status-editor.ts`
  - Replaces the default editor with a custom bordered editor and hides the default footer/working row.
  - Renders the editor as top bar, one blank padding row, input rows, one blank padding row, then bottom bar.
  - Tracks agent activity with `agent_start` / `agent_end`, animates a spinner, shows unmuted cwd/yellow git branch plus colored git change summary and context usage on the top border, and shows merged extension footer statuses on the bottom border opposite model/thinking.
  - Uses `CustomEditor`, `setEditorComponent()`, `setFooter()`/`footerData.getExtensionStatuses()`, `setWorkingVisible()`, timed `pi.exec()` calls for debounced/cached git summary refreshes, `ctx.getContextUsage()`, and `session_shutdown` cleanup.

- `git-checkpoint.ts`
  - Creates lightweight git stash object checkpoints at turn start and offers to restore code when forking.
  - Uses `tool_result` to track the current leaf entry, `turn_start`, `session_before_fork`, `agent_end`, and `pi.exec()`.
  - Important caveat: git checkpoint behavior depends on being inside a git repository and on stash refs remaining available.

- `inline-bash.ts`
  - Transforms user prompts by expanding `!{command}` inline bash snippets before the agent sees the prompt.
  - Preserves normal whole-line `!command` handling.
  - Uses the `input` event with `{ action: "transform" }`, `pi.exec("bash", ["-c", command])`, timeout handling, and UI notification when available.
  - Security note: this executes user-provided shell code; keep behavior explicit and avoid expanding unintended syntax.

- `interactive-shell.ts`
  - Intercepts user `!` bash commands that need a real terminal, such as editors, pagers, git interactive commands, TUIs, SSH, database clients, and `!i <command>` forced interactive mode.
  - Uses `user_bash`, `ctx.ui.custom()`, direct TUI `stop()` / `start()`, and `spawnSync(..., { stdio: "inherit" })`.
  - Guards non-interactive modes with `ctx.hasUI`.

- `mac-system-theme.ts`
  - Checks system appearance at session startup and switches pi between `dark` and `light` themes.
  - On macOS, uses `defaults read -g AppleInterfaceStyle`; on other platforms, uses `DARK_MODE=1` for dark mode and `DARK_MODE=0` for light mode.
  - Uses `session_start` and `ctx.ui.setTheme()`; failures/defaults resolve to light mode.

- `notify.ts`
  - Sends a native/terminal notification when the pi agent finishes and is ready for input.
  - Supports Windows Terminal toast, Kitty OSC 99, and OSC 777 terminals such as Ghostty/iTerm2/WezTerm/rxvt-unicode.
  - Uses `agent_end` and writes terminal escape sequences to stdout.

- `questionnaire.ts`
  - Registers a `questionnaire` tool for single or multi-question clarification flows.
  - Uses `typebox` schemas, `ctx.hasUI`, `ctx.ui.custom()`, `Editor`, custom key handling, custom `renderCall()` / `renderResult()`, and structured tool `details`.
  - Supports tabbed multi-question UI, custom text answers, cancellation, and compact result rendering.

- `todo.ts`
  - Registers a `todo` tool and `/todos` command for branch-aware task tracking.
  - Shows a one-line widget above the input editor with a checkmark prefix, the current todo count/text, and dimmed numbered previews for remaining incomplete todos that fit.
  - Persists state in tool result `details`, then reconstructs from `ctx.sessionManager.getBranch()` on `session_start` and `session_tree`.
  - Uses `StringEnum` from `@mariozechner/pi-ai`, `typebox`, custom tool rendering, `ctx.ui.setWidget()` for the current/remaining todo widget, and `ctx.ui.custom()` for the command UI.

## Best practices for this folder

- Read this file and `AGENTS.md` before changing extensions.
- When any extension behavior, API usage, command/tool contract, state model, or setup assumption changes, update this file in the same change unless the user explicitly says not to.
- Keep extension changes small and scoped. Extensions run with full system permissions.
- Prefer TypeScript files directly in this folder for simple extensions. Use a directory with `index.ts` and `package.json` only when dependencies or multiple source files are needed.
- Use `/reload` after editing auto-discovered extensions in `~/.pi/agent/extensions/` to load changes in an interactive pi session.
- Run `tsc -p tsconfig.json` for a quick TypeScript verification pass across top-level extension files.
- Check `ctx.hasUI` before using interactive UI in code paths that may run in print, JSON, or RPC mode.
- Clean up timers, intervals, subprocesses, watchers, and stale TUI references in `session_shutdown`.
- For custom tools:
  - Define parameters with `typebox`.
  - Use `StringEnum([...])` from `@mariozechner/pi-ai` for string enum parameters.
  - Return concise `content` for the model and structured `details` for rendering/state.
  - Throw errors to mark a tool result as failed; returning an error-looking object does not set `isError`.
  - Truncate large outputs and tell the model where full output can be found if saved.
  - If a custom tool mutates files, use `withFileMutationQueue()` over the full read-modify-write window.
- For stateful tools, prefer persisting state in tool result `details` and reconstructing from the current session branch so fork/tree navigation behaves correctly.
- For custom TUI components:
  - Every rendered line must fit the provided `width`; use `truncateToWidth()` / `wrapTextWithAnsi()` as needed.
  - Use the `theme` passed into the render/custom callback; do not cache pre-themed strings across theme changes unless `invalidate()` rebuilds them.
  - Use `matchesKey()` / `Key` helpers for keyboard handling.
  - Call `tui.requestRender()` after state changes.
  - Prefer built-in components like `SelectList`, `SettingsList`, `BorderedLoader`, `Text`, `Container`, and `Editor` where practical.
- For commands that switch/reload/fork sessions, use only the replacement-session context passed to callbacks; do not keep using stale captured session-bound objects.
- For user shell integration, be explicit about what is intercepted. `user_bash` affects user `!` commands, not agent `bash` tool calls.
- For prompt/input transforms, avoid surprising rewrites and preserve images when returning transformed input.

## Primary references

- Pi extension docs: `/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md`
- TUI component docs: `/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/docs/tui.md`
- Keybinding docs: `/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/docs/keybindings.md`
- Package docs: `/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/docs/packages.md`
- Extension examples index: `/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions/README.md`
- Working examples: `/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions/`
