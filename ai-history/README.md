# ai-history

A written record of AI-assisted work on this repository. Commits carry **no**
AI attribution (see `CONTRIBUTING.md`; the `commit-msg` hook rejects it), so
the contribution is recorded here instead, in prose, where it is useful.

Assistants keep this directory up to date. Humans read it to find out why
something is the way it is.

## Layout

```
ai-history/
  sessions/    one note per working session, oldest first
  decisions/   numbered notes, one per decision that changes a project premise
```

### `sessions/`

Filename: `YYYY-MM-DD-short-slug.md`. If there are several in a day, add
`-2`, `-3`.

A session note says what was asked, what was done, what was **tried and
abandoned** and why, and what is still open. The abandoned paths matter most,
because a later reader cannot work them out from the diff.

Template:

```markdown
---
date: YYYY-MM-DD
model: <model id, e.g. claude-opus-5-5>
commits: <short shas, branch, or "none">
---

## Asked

What the person asked for, in their own words where it matters.

## Done

What changed and how it was checked: tests, `npm run check`, clicking
through the app.

## Tried and abandoned

Dead ends, wrong guesses, and approaches that were rejected, each with the reason.

## Still open

Anything unfinished, untested, or waiting on someone.
```

### `decisions/`

Filename: `NNNN-short-slug.md`, zero-padded (`0001-...`) and never renumbered.
Write one for a choice that changes a project premise: the kind of choice a
later reader would otherwise mistake for carelessness. Examples here: which
dataset version is used, why a linkage is labelled "reconstructed", or how
missing data is handled.

Template:

```markdown
---
status: accepted | superseded by NNNN
date: YYYY-MM-DD
---

## Decision

One or two sentences.

## Context

What forced the choice, and the options that were weighed.

## Consequences

What this makes easier, what it makes harder, and what must now stay true.
```

A decision is never edited to reverse it. Write a new one and mark the old one
`superseded by NNNN`.

## Rules

- **Append.** Never rewrite a past session note to make it look tidier.
  The record is worth more than tidiness. Fixing format or a factual error is
  fine. Say so in the commit.
- **Record failures**, dead ends and wrong turns explicitly.
- **No secrets.** Never paste a token, a `_netrc` line, a password or a
  private URL into a note.
- **Facts go elsewhere.** A durable fact goes in `docs/memory/` as a one-fact
  note. This directory holds the narrative and that one holds the facts. Link
  between them freely.
