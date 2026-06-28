**Claude Code**

Files read:
- `CLAUDE.md`, `.claude/settings.json`, `.claude/commands/*`, `.claude/`, `~/.claude/`

Where it stores resources:
- `.claude/`, `~/.claude/`

Explanation:
Claude Code reads the project-level `CLAUDE.md` for instructions and may load per-project settings from `.claude/settings.json` and custom commands in `.claude/commands/`. Store secrets and local caches under `.claude/` or the user's home `~/.claude/`.

Usage:
- Edit `CLAUDE.md` to provide high-level guidance the Claude agent should follow for this repository.
- Place reusable command definitions under `.claude/commands/`.
