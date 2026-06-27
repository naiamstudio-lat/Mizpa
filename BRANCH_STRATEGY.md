# Branch strategy

## Goals
- Keep main always deployable and stable.
- Require validation before changes land in main.
- Make feature work visible through short-lived branches.

## Branch model
- main: production-ready state. Protected branch.
- develop: integration branch for the next release. Optional but recommended.
- feature/*: work branches for new features or fixes.
- hotfix/*: urgent fixes that must be applied quickly.
- release/*: optional stabilization branch before promoting to main.

## Rules
1. No direct pushes to main.
2. Every change to main must come from a pull request.
3. PRs must pass CI before merge.
4. At least one approval is required before merging to main.
5. Prefer squash merges for a clean main history.

## Workflow
1. Create a branch from develop or main depending on the scope.
2. Implement the change and open a PR targeting develop for regular work.
3. For urgent fixes, open a PR directly to main with the hotfix label.
4. Merge only after CI is green and review is complete.

## Cloudflare Pages deployment guidance

- Do not configure Cloudflare Pages to auto-deploy from `main` or `develop`.
- Configure Cloudflare Pages to deploy from the `release` branch, or disable automatic deployments in the Cloudflare dashboard.
- This repository includes a GitHub Actions workflow that deploys to Cloudflare Pages only for pushes to `release/**` or when manually triggered (`workflow_dispatch`).
- To enable automatic deploys from GitHub Actions, set these repository secrets in GitHub: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_PROJECT_NAME`.

Suggested steps to stop accidental auto-deploys:

1. In the Cloudflare Pages project settings, change the branch used for builds to `release` (or disable builds).
2. If you need immediate control, turn off "Automatic Builds" in the Cloudflare Pages dashboard.
3. Use the `release/*` branch to trigger controlled deployments via the provided GitHub Actions workflow.
