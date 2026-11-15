---
date: 2026-11-15
model: claude-opus-5-5
commits: branch chore/owner-merges-main, merged into main by jeflecias
---

## Asked

Vercel emailed that a teammate "attempted to deploy a commit ... but they're not a member of the team". `jeflecias` asked for a workaround: teammates push to branches, and `jeflecias` gathers them into `main` so that Vercel updates.

## Done

- Diagnosed the cause from the Actions log. The four `Deploy production` runs after `27aa481` failed with `TEAM_ACCESS_REQUIRED`, because the deployed commit's author (the teammate) isn't in the Hobby Vercel team. The live site stayed on `27aa481`.
- `CLAUDE.md`: the merge rule now depends on `git config user.name`. Anyone other than `jeflecias` pushes a branch only. `jeflecias` merges branches into `main` with `--no-ff` and pushes.
- `CONTRIBUTING.md`: the same rule for people, plus the deploy failure mode.
- Memory note `vercel-hobby-commit-author`.
- Merging this branch as `jeflecias` puts an owner-authored merge commit on top of the teammate's work, so this push also deploys their four merges.

## Tried and abandoned

- Removing or rewriting the commit author before `vercel deploy`. Rejected: it gets around Vercel's plan restriction rather than meeting it.
- Making the repo public. Not used: that relaxation applies to Vercel's Git integration, and this project deploys with the CLI from Actions.

## Still open

- Nothing enforces the rule. A teammate pushing `main` directly still breaks the deploy until `jeflecias` merges something on top. A `pre-push` hook in `.githooks/` or branch protection (admin only) could enforce it.
- Upgrading to Vercel Pro and inviting teammates would remove the need for this rule.
