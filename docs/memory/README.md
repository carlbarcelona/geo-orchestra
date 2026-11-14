# How to write a memory note

Project memory: durable facts about this repository, in plain Markdown, in
git so that everyone who clones gets them. It needs no AI tooling. It is a
folder of notes that any person or assistant reads with ordinary tools.

One fact per file, named for its slug (`kebab-case.md`), in this directory.
Add a line for it to `index.md`. A note that nothing links to is a note that
nobody reads.

```markdown
---
name: kebab-case-slug
description: "One line, used to decide whether the note is relevant"
type: user | feedback | project | reference
date: YYYY-MM-DD
---

The fact, in prose. For `feedback` and `project` notes, follow it with:

**Why:** the reason it matters, and what goes wrong without it.

**How to apply:** what to actually do differently.
```

The four types:

- **`user`**: who the team is. Roles, expertise and standing preferences.
- **`feedback`**: guidance on how to work, including corrections. Include the
  why, because a correction without its reason gets misapplied.
- **`project`**: ongoing work, goals and constraints that can't be read from
  the code or the git history. Write absolute dates, never "last week".
- **`reference`**: pointers outward. Tool behaviour, URLs, dashboards,
  dataset pages, tickets.

## Rules

1. **One fact per note.** If a note needs the word "also", it is two notes.
2. **Update, don't duplicate.** Check for an existing note on the topic first.
3. **Delete what turns out to be wrong.** A stale memory is worse than none,
   because it gets trusted.
4. **Don't record what the repo already says.** Code structure, past fixes
   and anything already in `CONTRIBUTING.md`, `docs/` or the git history
   don't belong here. A note holds what a reader of the code could not have
   worked out.
5. **No secrets.** Never a token, a password or a credential file's contents.

Narrative (what happened in a session, what was tried and abandoned) goes in
`../../ai-history/`, not here.
