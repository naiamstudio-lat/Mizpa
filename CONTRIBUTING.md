# Contributing to Mizpa

## Branches and naming

- Work on short-lived branches pushed to the repo so others can follow progress.
- Naming conventions:
  - `feature/<name>` or `feat/<name>` for new features
  - `fix/<name>` for bug fixes
  - `test/<name>` for test or QA branches
  - `hotfix/<name>` for urgent fixes
  - `release/<version>` for release candidates

## Pull request process

- Open a PR against `develop` for regular work.
- If a change is ready to land directly in `main`, target `main` and add the label `automerge`.
- Do not push directly to `main`; all changes to `main` must go through a PR.
- PRs must pass the GitHub Actions `CI` workflow before they will be considered for auto-merge.
- At least one approval is required before merging to `main`.
- Use the GitHub PR template to document the scope, tests, and labels.

## How auto-merge works

- When the `CI` workflow completes successfully for a PR, the repository runs the `Auto-merge on CI success` workflow.
- The workflow only merges PRs targeting `main` that also have the `automerge` label.
- If your PR targets `develop`, do not add `automerge`.
- If your PR targets `main`, add `automerge` only when it is ready to merge after review and CI passes.

## Keeping work visible

- Push your `feature/*`, `test/*` branches to the remote; they will remain visible in the repository for collaboration and review.
- Short-lived branches are preferred; delete branches after merging to keep the repo tidy.

## CI and Deploy

- The project runs `CI` for PRs and pushes to `main` and `develop`.
- Deploys to Cloudflare Pages are only performed via the `Deploy to Cloudflare Pages` workflow, which targets `release/**` branches or can be triggered manually.

## Agent integrations

- Repository-level guidance for automated agents lives in `AGENTS.md` at the repository root. Agents and automation tools should prefer reading `AGENTS.md` (and the files it references) instead of adding duplicate instructions in other files. This helps keep guidance consistent and centrally maintained.

Thanks for contributing!