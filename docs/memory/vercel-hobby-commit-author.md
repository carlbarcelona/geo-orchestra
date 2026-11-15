---
name: vercel-hobby-commit-author
description: "Vercel (Hobby plan) refuses to deploy a commit authored by anyone outside the Vercel team, so only jeflecias pushes main"
type: project
date: 2026-11-15
---

The Vercel project `spacebigan` is on the free Hobby plan of `jeflecias`'s account, and that Vercel team has one member. Vercel deploys a commit only when its **git author** is a team member. It doesn't matter whose token the deploy uses: a GitHub Actions deploy with the owner's `VERCEL_TOKEN` still fails with `TEAM_ACCESS_REQUIRED` ("The commit author doesn't have access to this team").

On 2026-11-15, four teammate merges to `main` (b391e40 and the three before it) failed to deploy for this reason.

**Why:** the team chose not to pay for Pro. The workaround is that `jeflecias` makes the final merge commit, so the newest commit on `main` is always one that Vercel accepts.

**How to apply:**
- Teammates' agents push branches only and never touch `main` (rule in `CLAUDE.md`).
- `jeflecias` gathers branches into `main` with `git merge --no-ff`, so a fast-forward never leaves a teammate's commit on top.
- Don't strip or rewrite commit authors to get around the check. If the team grows or pushes need to deploy on their own, upgrade to Pro and invite members.
