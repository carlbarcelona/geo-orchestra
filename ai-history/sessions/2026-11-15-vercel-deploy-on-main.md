---
date: 2026-11-15
model: claude-opus-5-5
commits: see branch chore/vercel-deploy-on-main
---

## Asked

Make every push to `main` update the Vercel production deployment.

## Done

- `.github/workflows/deploy-production.yml`: on push to `main` (or a manual
  run) it installs, runs `npm run check`, then `vercel pull`, `vercel build
  --prod` and `vercel deploy --prebuilt --prod`. Org and project IDs come from
  `.vercel/project.json`; the token comes from the `VERCEL_TOKEN` secret.
- `CONTRIBUTING.md` "Deploying" section describes the automatic deploy.

## Tried and abandoned

Vercel's own Git integration (dashboard setting) would also work but cannot
be set up from the repo; the workflow keeps the setup reviewable in git.

## Still open

- A repository admin must add the `VERCEL_TOKEN` secret; until then the
  workflow fails at `vercel pull`. The committing account has push but not
  admin rights.
- If Vercel's Git integration is also connected to this repo, each push
  would deploy twice; disconnect one of them.
