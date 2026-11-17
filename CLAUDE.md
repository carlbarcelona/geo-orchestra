# Instructions for AI coding assistants

Follow [CONTRIBUTING.md](CONTRIBUTING.md). The most important rules:

- **Never add `Co-Authored-By` or any other AI attribution line to commits or PR descriptions.** The commit-msg hook rejects them.
- Run `npm run check` before committing. Never use `--no-verify`.
- **Who merges to `main` depends on who you are working for.** Check `git config user.name` first.
  - **Anyone other than `jeflecias`:** work on a `<area>/<short-description>` branch and finish by pushing **only that branch** (`git push -u origin <branch>`). **Never merge into `main` and never push `main`.** Tell the user the branch name so `jeflecias` can gather it.
  - **`jeflecias`:** gather teammates' pushed branches and your own into `main`, each with a merge commit, then push `main`: `git switch main && git pull --ff-only && git fetch && git merge --no-ff origin/<branch>` for each branch, `npm run check`, then `git push origin main`.
  - **Why:** Vercel's Hobby plan only deploys commits whose git author is a member of the Vercel team, and that is `jeflecias` alone. A push to `main` whose newest commit someone else authored fails the deploy (`TEAM_ACCESS_REQUIRED`) and the live site stays behind.
  - This overrides the review-before-merge step in CONTRIBUTING.md for agent work.
- Do not hand-edit `public/data/**`. Regenerate it with the scripts in `pipeline/`.
- Do not commit `data/raw/`, credentials (`_netrc`, `.env*`), or `pipeline/.venv`.
- Missing measurements stay `null`, never `0`. The SVS climatology linkage is labelled **reconstructed**, not exact.
- Sound mapping changes bump `MAPPING.version` (`src/sound/mapping.ts`) and update `docs/mapping-guide.md`.

Layout:
- `src/contracts`: shared types
- `src/playback/controller.ts`: the only playback clock
- `src/sound/mapping.ts`: pure, tested mapping
- `src/state/actions.ts`: wiring between views, controller and engine
- `pipeline/`: Python data preparation
- `docs/`: verification record and other documentation

## Project memory and design decisions

Keep durable project facts and design rationale in the repository so that
everyone who clones it can read and maintain them.

**Before starting work:**
- Read `docs/memory/index.md` and open the notes that bear on the task.
- Read the relevant technical documentation under `docs/` for the current
  design and the reasons behind it.
- Before acting on a memory note that names a file, function or flag, check
  that it still exists.

**While working:**
- When you learn something durable that the code doesn't say (a dataset
  quirk, a tool's behaviour, a team preference, a correction you were given),
  write it as one note in `docs/memory/`, following `docs/memory/README.md`,
  and add a line to `docs/memory/index.md`.
- Keep one fact per note. Update an existing note rather than adding a
  near-duplicate, and delete notes that turn out to be wrong.
- Keep memory in the repo, not in a per-machine assistant memory folder, so
  the whole team has it.

**Before finishing:**
- Update the relevant technical documentation when a change alters a
  project premise. Explain the current decision, its rationale and its
  practical limits. Keep the memory notes consistent with it.
- Commit documentation with the change it describes. Keep session diaries
  out of the repository.
- Never write a secret into any note. The commit and PR attribution rules
  above still apply.
