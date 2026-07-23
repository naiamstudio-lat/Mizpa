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

## Project Skills (Mizpa-specific)

Location: `.opencode/skills/`

### mizpa-supabase
- Trigger: supabase, edge functions, RLS, auth, database, migrations
- Scope: Supabase patterns, Edge Function conventions, database schema
- Path: `.opencode/skills/mizpa-supabase/SKILL.md`

### mizpa-freestyle
- Trigger: freestyle, VM, snapshot, agent, pipeline, cleanup, queue
- Scope: Freestyle.sh VM management, agent execution, queue system
- Path: `.opencode/skills/mizpa-freestyle/SKILL.md`

### mizpa-cicd
- Trigger: conventional commits, commit, push, PR, deploy, CI/CD, git
- Scope: Commit conventions, branch strategy, deployment pipeline
- Path: `.opencode/skills/mizpa-cicd/SKILL.md`
