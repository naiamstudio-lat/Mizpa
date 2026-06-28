Agent files reference

This file lists common agent integrations and the repository files they typically read.

Claude Code
- Files read: `CLAUDE.md`, `.claude/settings.json`, `.claude/commands/*`, `.claude/`, `~/.claude/`
- Stores: `.claude/`, `~/.claude/`
- Explanation: Project-level instructions and custom commands for Claude.

OpenAI Codex CLI
- Files read: `AGENTS.md`, `codex.toml` (optional)
- Stores: `~/.codex/`
- Explanation: Uses `AGENTS.md` as guidance and `codex.toml` for CLI configuration and auth.

OpenCode
- Files read: `AGENTS.md`, `opencode.json`, `.opencode/`
- Stores: `~/.config/opencode/` or `.opencode/`
- Explanation: Compatible with `AGENTS.md` and supports its own config file.

OpenClaw
- Files read: `AGENTS.md`, `openclaw.yaml`, `.openclaw/`
- Stores: `.openclaw/`, `~/.openclaw/`
- Explanation: Follows the agent standard and adds OpenClaw-specific configuration.

Guidance for maintainers
- Keep this file up to date with agent-specific notes so automated agents can read repository-level instructions.
