# Instructions for AI coding assistants

Follow [CONTRIBUTING.md](CONTRIBUTING.md). The most important rules:

- **Never add `Co-Authored-By` or any other AI attribution line to commits or PR descriptions.** The commit-msg hook rejects them.
- Run `npm run check` before committing. Never use `--no-verify`.
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
