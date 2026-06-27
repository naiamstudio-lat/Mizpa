# Mizpa Roadmap

This document outlines the next steps for Mizpa development, keeping the focus on the current product goal and the stability of the `main` branch through CI and tests.

## Project vision

Mizpa is an AI agent that:
- audits websites for SEO and geo-localization,
- generates modern React + Tailwind replicas,
- deploys code to Cloudflare Pages in a controlled way.

The immediate goal is to build a tool that allows freelancers, development teams, and entrepreneurs to modernize existing websites with a reproducible flow and the quality guarantees provided by a test pipeline.

## Current status

Based on the current repository:
- Frontend using Vite + React 19 + TypeScript + Tailwind
- Backend using Supabase (Auth, Postgres, Edge Functions)
- E2E tests with Puppeteer
- CI in GitHub Actions with a protected `main` branch
- Auto-merge configured for PRs to `main` with the `automerge` label
- Controlled deploys to Cloudflare Pages from `release/**`

## Main work areas

### 1. CI flow stability

Priority:
- `main` must always remain stable.
- Changes must enter through PRs.
- All PRs must pass the `CI` workflow before merging.
- Auto-merge only applies to PRs targeting `main` with the `automerge` label.

Next steps:
- maintain and expand E2E tests to cover key routes.
- ensure the preview server starts correctly in CI.
- document and validate the `CI` + `Auto-merge` flow.

### 2. Test coverage and quality

Priority:
- continue adding tests that cover the real behavior of the app.
- use the pipeline to validate the user experience and Supabase integration.

Next steps:
- create or improve tests for authentication flows.
- add tests for task creation logic and app navigation.
- ensure `README` and development docs include how to run tests locally.

### 3. Product development

Priority:
- consolidate the core skills: `audit`, `generate`, and `replica`.
- avoid drifting away from the value proposition: modernizing existing websites.

Next steps:
- stabilize the SEO/GEO audit experience.
- ensure React + Tailwind replica generation produces readable, usable code.
- validate controlled deploys to Cloudflare Pages from `release/*` branches.

### 4. Processes and governance

Priority:
- maintain clear branch and PR rules.
- document the criteria for `main`, `develop`, `release/*`, and `hotfix/*`.

Next steps:
- keep `CONTRIBUTING.md` updated with the auto-merge process.
- use `BRANCH_STRATEGY.md` as a reference for collaborators.
- reinforce that `main` only updates through approved PRs with successful CI.

## Tactical roadmap

### Short term (1-2 sprints)

- stabilize the `CI` pipeline and confirm its reliability.
- cover critical flows with E2E tests: login, dashboard, playground, task.
- validate auto-merge for PRs targeting `main`.
- publish `docs/ROADMAP.md` and keep `CONTRIBUTING.md` consistent.

### Mid term (3-5 sprints)

- improve test coverage and maintain a reproducible environment.
- refine the `audit` skill to deliver more useful results.
- automate controlled deploys from `release/**`.
- ensure any CI adjustments remain small and safe.

### Long term

- extend replica generation to more site types.
- integrate better design and content analysis capabilities.
- make Mizpa a reliable tool for migrating existing websites.

## How to use this roadmap

- Any major change should be planned in a feature branch and reviewed.
- Issues and PRs should map to short-term or mid-term objectives.
- The primary goal is that every advancement passes CI and keeps `main` stable.

---

> Note: this roadmap is aligned with the current state described in `README.md`, `CONTRIBUTING.md`, and the GitHub Actions workflows in the repository.
