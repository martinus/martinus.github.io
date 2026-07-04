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
Answered by the outgoing agent, honestly and specifically. Each question has
its own scope, noted below it — never repeat an answer across questions.

### 1. What in the delivered work am I least confident is correct?
Scope: the work itself. Code paths, edge cases, or claims that were not fully
verified this session. Name the file or behavior and how the next agent can check it.

### 2. What assumptions did I make that I never stated explicitly?
Scope: unverified premises, not the work. Things treated as facts — about
requirements, the environment, data, or user intent — without checking.
For each: if it's wrong, what breaks?

### 3. What is the biggest thing the user may not realize about the broader situation?
Scope: strategy and surroundings, not this task's code. Direction, alternatives
never considered, or risks outside the task that the user shows no sign of seeing.

### 4. If this work breaks in 3 months, what's the most likely reason?
Scope: future change only — current correctness doubts belong in Q1. Dependency
drift, scale or data growth, or a neighboring change violating an invariant
this work silently relies on.

### 5. Were there any tools, scripts, or hooks that would have reduced my churn this session if they had existed when we started?
Scope: missing automation and infrastructure. Name the concrete tool and the
churn it would have eliminated, and say whether it's worth building now.

### 6. What could the user have done differently to make this session smoother?
Scope: human process only — tooling belongs in Q5. Information provided or
withheld, task framing, decision timing, feedback loops.

### 7. If I could add one unrequested, industry-leading feature, what would it be?
Scope: opportunity, not risk. One concrete feature, and why it would put this
project ahead of comparable ones.
```
