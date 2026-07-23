---
name: mizpa-cicd
description: "Trigger: conventional commits, commit, push, PR, deploy, CI/CD, workflow, git, versioning, changelog. CI/CD and commit conventions for Mizpa."
license: Apache-2.0
metadata:
  author: naiamstudio
  version: "1.0"
---

## Activation Contract

Use when committing, pushing, creating PRs, or deploying in Mizpa. Enforces conventional commits and agent-first practices.

## Hard Rules

- All commits MUST follow Conventional Commits v1.0.0.
- No `Co-Authored-By` or AI attribution in commits.
- No force pushes to `main`.
- PRs require descriptive title matching commit message scope.
- Deploy happens automatically on merge to `main`.

## Commit Format

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Formatting, no code change
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `perf`: Performance improvement
- `test`: Adding or correcting tests
- `chore`: Build process, tooling, dependencies
- `ci`: CI configuration changes

**Scopes (Mizpa-specific):**
- `landing`: Landing page components
- `playground`: Playground page and skills
- `auth`: Authentication and login
- `dashboard`: Dashboard page
- `supabase`: Edge Functions, migrations, DB
- `freestyle`: VM pipeline, snapshots
- `i18n`: Translations and internationalization
- `deps`: Dependencies only

**Examples:**
```bash
feat(landing): add hero parallax animation
fix(auth): handle expired session tokens
docs(readme): update deployment instructions
chore(deps): update supabase-js to 2.108.2
```

## Branch Strategy

**Branches:**
- `main` — production, protected
- `feature/*` — new features
- `fix/*` — bug fixes
- `chore/*` — maintenance

**Naming:**
```bash
feature/landing-hero-animation
fix/auth-token-refresh
chore/update-dependencies
```

## PR Convention

**Title:** Matches commit scope and type
```
feat(supabase): add task queue processing
```

**Description:**
```markdown
## What
Brief description of changes.

## Why
Motivation or problem solved.

## How
Implementation approach (if non-obvious).

## Testing
How to verify the changes work.
```

## Pre-commit Checks

Before committing, verify:
1. `npm run build` passes (TypeScript + Vite)
2. No console errors in browser
3. Changes match commit message scope
4. No secrets or env vars in code

## Deployment Pipeline

**Flow:**
1. Push to feature branch
2. Create PR → review
3. Merge to `main`
4. Cloudflare Pages auto-deploys
5. Edge Functions deploy via `supabase functions deploy`

**Manual Deploy:**
```bash
# Frontend
npm run build
npx wrangler pages deploy dist

# Edge Functions
supabase functions deploy create-task
supabase functions deploy process-queue
supabase functions deploy cleanup-vms
supabase functions deploy task-callback
```

## Versioning

- SemVer for package.json version
- Conventional commits auto-generate changelog
- Use `npm version patch|minor|major` for releases

## Gotchas

- `main` branch is protected — no direct pushes.
- Cloudflare Pages deploys from `main` automatically.
- Edge Functions require `SUPABASE_ACCESS_TOKEN` for deploy.
- Snapshot ID changes require updating `FREESTYLE_SNAPSHOT_ID` in Supabase secrets.
- PR descriptions help AI agents understand context in future sessions.

## Validation

Before merging PR:
1. All commits follow conventional format.
2. Build passes locally.
3. No sensitive data in diff.
4. PR description explains what/why/how.
5. Scope matches actual changes.
