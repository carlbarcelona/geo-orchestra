# Contributing to GeoOrchestra

These rules keep the repository small, honest about its data, and easy for the four-person team to review.

## One-time setup

```bash
npm install          # also activates the git hooks in .githooks (via the "prepare" script)
```

If the hooks are not active (`git config core.hooksPath` prints nothing), run `npm run hooks`.

## Branches

- `main` is always deployable: it builds, its tests pass, and it matches what is on Vercel production.
- Work on short-lived branches named `<area>/<short-description>`. For example: `data/full-archive-check`, `sound/hybrid-mode`, `ui/visual-feed-states`, `fix/seek-double-notes`.
- Merge to `main` only after review (see below). Rebase or squash noisy WIP commits first.
- Merge with a merge commit (`git merge --no-ff`), not a fast-forward, so each branch stays visible in `main`'s history. AI agents merge and push their own branches to `main` (see `CLAUDE.md`).

## Commits

- Use the imperative mood with an optional area prefix: `sound: cancel scheduled notes on region change`.
- Keep the subject line at 72 characters or fewer. In the body, explain *why* when the reason isn't obvious.
- One logical change per commit, and don't mix pipeline data regeneration with UI changes.
- **No AI attribution trailers.** Do not add `Co-Authored-By: Claude …` or similar lines. The `commit-msg` hook rejects them.
- Never commit with `--no-verify` to get around a failing hook. Fix the cause instead.

## Before every commit

```bash
npm run check        # typecheck + unit tests (the pre-commit hook runs this too)
```

Also run the app (`npm run dev`) and click through the flow you changed. A screenshot of an unfinished screen does not count as a finished feature.

## Data rules (most important)

- **Never commit** `data/raw/`, Earthdata credentials (`_netrc`, `.netrc`, `.env*`), tokens, or the Python venv. The pre-commit hook blocks these paths, and any file over 15 MB.
- `public/data/**` is **generated**. Change it only by re-running the pipeline:
  ```bash
  pipeline/.venv/Scripts/python pipeline/prepare_imerg.py
  pipeline/.venv/Scripts/python pipeline/prepare_svs.py
  ```
  Commit the regenerated files in their own commit (`data: …`). Note in the body what changed in `validation.json` / `alignment.json`.
- **Missing is never zero.** Never interpolate or invent measurements. Synthetic data must stay visibly labelled.
- Keep the honesty labels accurate. The visual-feed linkage is **reconstructed**. Don't label it "exact" unless the matching NASA data has actually been obtained and verified.
- Changes to the sound mapping must bump `MAPPING.version` in `src/sound/mapping.ts` and update `docs/mapping-guide.md`.

## Review

- Each developer reviews the other's data, timing, or integration changes. The designer reviews interaction changes.
- Reviewers check:
  - tests cover new aggregation, mapping or playback behaviour
  - units are stated (mm/hr)
  - sources are attributed
  - keyboard access still works

## Deploying

- Production deploys automatically: every push to `main` runs `.github/workflows/deploy-production.yml`, which runs `npm run check` and then deploys to Vercel production. If the checks fail, nothing is deployed. Watch it under the repository's Actions tab, or re-run it from there (`workflow_dispatch`).
- The workflow needs a repository secret `VERCEL_TOKEN` (a Vercel access token with access to the `spacebigan` project). Only a repository admin can add it: Settings → Secrets and variables → Actions.
- Preview: `vercel deploy`. A manual production deploy (`vercel deploy --prod`) is only for emergencies, from `main` only.
- After deploying, load the NASA sample and the visual feed on the hosted URL, and check the status-bar `sync` reading on the demo machine.
