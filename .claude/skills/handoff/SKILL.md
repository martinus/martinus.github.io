---
name: handoff
description: End the current Claude session by writing a timestamped handoff document into the handoff/ folder, so a fresh session can get a new agent up to speed. Use when the user wants to end or wrap up the session, says /handoff, or asks to prepare a handoff for the next session.
---

# Session Handoff

End the current session by writing a handoff document that lets a brand-new agent — with zero chat history — pick up the work exactly where it stopped.

## Steps

1. **Locate the target.** Find the repository root (`git rev-parse --show-toplevel`; fall back to the current working directory if not in a repo). Create the `handoff/` directory there if it doesn't exist.

2. **Name the file.** Get a timestamp with `date +%Y-%m-%d_%H%M` and write to:

   ```
   handoff/<timestamp>-<slug>.md
   ```

   where `<slug>` is 2–4 lowercase hyphenated words describing the session, e.g. `handoff/2026-07-04_1336-fix-ci-flakes.md`.

3. **Gather real state before writing — do not rely on memory alone.** Run whichever apply:
   - `git status` and `git log --oneline -10` (branch, last commits, uncommitted changes)
   - the project's test/build command, if the session touched code and it's cheap to run
   - anything else needed to state facts instead of recollections

4. **Write the document** using the template below. Rules:
   - Write for a reader who has NO access to this conversation. No "as discussed above", no shorthand invented during the session.
   - Answer every reflection question honestly and **specifically** — concrete file names, commands, failure modes, and trade-offs, not platitudes. "Nothing comes to mind" is only acceptable with a stated reason.
   - Record dead ends that were already tried, so the next agent doesn't repeat them.

5. **Do NOT commit** the handoff file unless the user asks.

6. **Reply to the user** with the file path and the exact resume line to paste into the next session.

## Document template

```markdown
# Session Handoff — <YYYY-MM-DD HH:MM>

## Resume prompt
Paste this into a fresh session:
> Read `handoff/<this-file>.md` and continue the work described there.

## Goal
What this session was trying to achieve, in one or two sentences.

## State
- Repo / branch / last commit; uncommitted changes if any
- **Done** (and how it was verified)
- **In progress** — exactly where it stops, mid-thought included
- **Not started**

## Key context
- Files that matter and why
- Decisions made and their reasons, especially non-obvious ones
- Dead ends already tried — do not repeat these
- Commands to build, test, and run

## Next steps
Ordered and concrete. The first step must be immediately executable.

## Reflection
Answered by the outgoing agent, honestly and specifically.

### What am I least confident about right now?

### What is the biggest thing the user may be missing about the situation? What don't they realize?

### If this breaks in 3 months, what's the most likely reason?

### If I could add one unrequested, industry-leading feature, what would it be?

### What assumptions did I make that I never stated explicitly?

### What could the user have done differently to make this session smoother?
```
