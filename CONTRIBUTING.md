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
- If the PR is ready to be merged directly into `main`, add the label `automerge` to request automatic merge after CI passes.
- PRs must pass the GitHub Actions `CI` workflow before they will be considered for auto-merge.
- At least one approval is required before merging to `main`.

## How auto-merge works

- When the `CI` workflow completes successfully for a PR, the repository runs the `Auto-merge on CI success` workflow.
- The workflow will try to merge PRs whose base is `main` and that have the `automerge` label applied.
- If you want your PR to be auto-merged, make sure to target `main` and add the `automerge` label.

## Keeping work visible

- Push your `feature/*`, `test/*` branches to the remote; they will remain visible in the repository for collaboration and review.
- Short-lived branches are preferred; delete branches after merging to keep the repo tidy.

## CI and Deploy

- The project runs `CI` for PRs and pushes to `main` and `develop`.
- Deploys to Cloudflare Pages are only performed via the `Deploy to Cloudflare Pages` workflow, which targets `release/**` branches or can be triggered manually.

Thanks for contributing!