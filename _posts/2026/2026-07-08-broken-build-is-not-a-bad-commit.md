---
layout: post
title: A Broken Build Is Not a Bad Commit
subtitle: I chased a regression through two months of history where half the commits wouldn't even compile. Here's the tool I wrote so it wouldn't happen again.
---

A few weeks ago I hit the kind of bug that ruins an afternoon: something that
used to work didn't anymore, and I had no idea when it broke. Not "yesterday",
not "in that one PR" — somewhere in the last month or two, buried in a stretch
of history where the build had also been getting torn up. This is a shared
project with a lot of people committing to it, and in that same window a broken
third-party dependency had been swapped for a newer version, a compiler had
moved, and a pile of little fixes had gone in from all over to keep everything
compiling with the current toolset. The regression and the build churn had
happened in the same slice of history — which is exactly the combination that
makes `git bisect` miserable.

I reached for `git bisect run` like everyone does, wrote the obvious little
shell script, and it lied to me. That's the short version. The long version is
why I ended up writing [`git_bisectlib`](https://github.com/martinus/git_bisectlib),
and this post is really about the one idea at its center:

**a commit that doesn't build is not a bad commit.**

# The trap

Here's the naive recipe, the one everybody writes first:

```sh
git bisect run sh -c 'cmake --build build && ctest'
```

Read what that actually does. `git bisect run` cares about one thing: the exit
code of your script. Zero means good, non-zero means bad. So when an old commit
fails to *build* — because two months ago your CMakeLists still said `c++17` and
today's compiler wants a flag it didn't have, or a header that has since moved —
`cmake --build` exits non-zero, the whole `&&` chain exits non-zero, and git
writes it down as **bad**.

But that commit isn't bad. You have no idea whether the bug is present, because
you never got to run the test. Git doesn't know the difference. It happily
folds "the bug is here" and "I couldn't compile this" into the same non-zero
number, narrows the range around it, and hands you a first-bad commit with total
confidence. **No error, no warning, just the wrong answer.** In a range where
half the commits don't build cleanly with your current toolchain, this isn't an
edge case — it's most of your commits.

That's the failure mode that cost me the afternoon. Once I understood it, the
fix was obvious in hindsight: the script needs to say three different things,
not two. *Bug present. Bug absent. I couldn't test this one.*

# git already has the vocabulary

The good news is that `git bisect run` already understands this — the exit-code
contract is richer than the shell script I'd written was using:

| Exit code | git bisect reads it as |
|---|---|
| `0` | good — bug absent |
| `1`–`124`, `126`, `127` | bad — bug present |
| `125` | **skip** — can't test this commit, route around it |
| `≥128` | **abort** — stop everything, keep the bisect state |

So a broken build should exit `125` (skip) or, if the breakage means *my recipe
is wrong*, exit `128` and abort so I can fix it and pick up exactly where I left
off. The whole problem is just: never let a build failure reach git as a `1`.

You *can* express that in shell. I've written those scripts. They become a pile
of `if` statements and exit-code arithmetic that I get slightly wrong every time
and rewrite from scratch on the next hard bisect. So I wrote the plumbing once,
in Python, and made the distinction the default instead of something you have to
remember.

# The recipe I actually ran

`bisectlib` splits the two jobs into two verbs, and the verb *is* the meaning:

- `run(...)` is infrastructure — configure, build, setup. If it fails, your
  harness is probably broken, so it **aborts** rather than blaming the commit.
- `test(...)` is the verdict — pass is good, fail is bad. This is the only thing
  allowed to call a commit bad.

For my regression the recipe was basically this:

```python
from bisectlib import run, test, fixup, in_range

# A teammate had already replaced the broken third-party lib with a newer
# version. Cherry-pick that fix onto the older commits so they build too
# (applied for the block, auto-reverted afterwards).
with fixup(cherry_pick="<the-dependency-bump-commit>",
           when=in_range("<good>..<dep-bump>")):
    run("rm -rf build/CMakeCache.txt build/CMakeFiles")  # kill the stale cache
    run("cmake -B build")                                 # broken build? ABORT
    run("cmake --build build -j")

test("ctest --test-dir build -R the_regression")
# fell off the end with no failure -> GOOD
```

A few things make that work where the shell script didn't:

**The build can't vote.** Those `run()` lines can fail all they want; they will
never mark a commit bad. Only `test()` does that. The single most important line
in the whole recipe is the one that *isn't* a test.

**Someone else's fix travels with me and cleans up after itself.** My actual
blocker was a third-party library those older commits pinned to a version that
simply doesn't build anymore. I didn't fix that — a teammate had, further up
the history, by bumping the dependency to a newer release. On a project this
size the fix you need almost always already exists somewhere; it's just newer
than the commits you're trying to test. So instead of `git bisect skip`-ing
every commit that predates the bump and losing resolution, I cherry-picked that
one commit onto each of them with `fixup(cherry_pick=..., when=in_range(...))`.
It's applied for the block and **reverted automatically** afterwards, leaving
the tree clean again before git checks out the next commit, and suddenly the
whole broken stretch is testable. A plain patch file works the same way via
`fixup(patch=...)`, and a one-line edit via `replace(path, old, new)` — same
deal, scoped to exactly the commits that need it, reverted after.

**The stale CMake cache had to die every round.** This one bit me for a while.
By default `bisectlib` keeps the gitignored `build/` directory between commits
so incremental builds stay fast — which is usually what you want, and was
exactly wrong here. A `CMakeCache.txt` written while configuring one commit
pins absolute paths, the detected compiler, and the *old* library location, and
then poisons the configure of the next commit git checks out. So half my "build
failures" were really one commit's cache lying to the next. Nuking the cache
files at the top of each run fixed it; if you'd rather wipe untracked build
output wholesale, `configure(clean="clean")` runs a `git clean -fdx` (keeping
`.bisect/`) for a pristine tree every single round.

**A mistake in the recipe aborts, it doesn't mis-bisect.** The first time I ran
it I had the `ctest` target name wrong. Old me would have gotten a clean,
confident, completely wrong answer. Instead the run aborted, git kept the whole
bisect state with the failing commit checked out, I fixed the typo, re-ran the
*same* `git bisect run` command, and it resumed from where it stopped. Abort is
the "my harness is wrong" signal, and it's built to be recovered from.

# I didn't have a good commit

`git bisect` needs two ends: a bad commit and a good one. I had the bad one —
HEAD, where I was staring at the bug. The good one I had to go find, and "a
month or two ago" is not a commit hash.

This turned out to be my favorite part. You run the *same recipe* by hand, and
because HEAD is already marked bad it doesn't waste time re-testing it — it lays
out older commits to jump to, spaced on a widening schedule (a day back, three
days, a week, two weeks, a month...) so a handful of hops cover a couple of
months:

```text
━━━ already marked bad — skipping ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ● HEAD is already marked BAD — nothing to test.
  To find a GOOD commit, git checkout an older one and run it there:
    ec0acd2  1 day ago     fix cache eviction
    356a26b  1 week ago    bump deps
    c196853  2 weeks ago   tune scheduler
    a59303d  2 months ago  rework parser
```

You check one out, run the recipe, and one of three things happens. Bug still
there → mark it bad, get a fresh batch of even-older candidates. Bug gone → it
hands the search straight back to `git bisect`. Commit won't build → and this is
the part that mattered for me, it *doesn't guess*. An unbuildable commit is
neither good nor bad, so it shows you the directions and lets you decide: jump
older past the broken stretch, or come back newer toward code that compiles.
That's the whole reason I could work through a range that was, honestly, a bit
of a construction site at the time.

# Watching it narrow

While it runs, `bisectlib` writes a live Markdown report to `.bisect/status.md`
in the repo root. I opened it in my editor next to the terminal and just watched
the range funnel down — each row is the input range, the probe git chose, and
the result, in that order:

```text
| good      | bad       | probe     | range              | status        |
|-----------|-----------|-----------|--------------------|---------------|
| 2801e95…  | 79cb050…  | cb53949…  | 27d · 11 commits   | 🟢 good       |
| cb53949…  | 79cb050…  | 9534554…  | 12d · 6 commits    | 🔴 bad        |
| cb53949…  | 9534554…  | 5c9dcaf…  | 6d · 3 commits     | 🔴 bad        |
| cb53949…  | 5c9dcaf…  | 19d89b1…  | 3d · 2 commits     | 🟢 good       |
```

The `.bisect/` directory carries its own `.gitignore` of `*`, so it stays out of
`git status` and survives all the checkouts git does between commits without me
having to think about it.

One configure-plus-build-plus-test cycle on this project takes about two
minutes, and a bisect over that range was nine steps, so the whole thing ran a
bit over fifteen minutes start to finish. That's the good part: it's fifteen
minutes I didn't spend, fifteen minutes of `git checkout`, wait, build, wait,
run, squint, repeat that I would have gotten wrong by hand around step four.
Long enough to go fetch a good coffee and come back to an answer — thanks,
automation. When the search resolved it printed the culprit the way `git show`
would — full commit, diffstat, the works — and of course it was a tiny,
innocent-looking change that nobody would have flagged in review. They never are
the scary ones. Then `git bisect reset` put me back on my branch.

# What I actually took away from this

1. **Two answers isn't enough.** The entire class of silent mis-bisects comes
   from collapsing "bug present", "bug absent", and "couldn't test" into a
   single exit code. Give the script all three words and the problem mostly
   dissolves. git has always had the vocabulary — `125` and `128` are right
   there — the naive script just never uses them.
2. **A broken build is data about your toolchain, not about the bug.** When
   you're bisecting across a stretch where the build itself was changing, this
   stops being pedantry and becomes the whole game. Patch the old commits so
   they build; don't let their build failures answer a question they were never
   asked.
3. **Make the risky default the safe one.** I know all of this. I still would
   have written the two-outcome shell script under deadline pressure, because
   it's the thing your fingers type. The only durable fix was to make the tool
   refuse to blame a commit for a build failure, so I can't get it wrong at 6pm
   on a Friday.

It's a small library — pure standard library, no dependencies, just needs `git`
on your `PATH` — and it's on GitHub as
[`git_bisectlib`](https://github.com/martinus/git_bisectlib) with a spec, tests,
and runnable example recipes:

```sh
pip install git_bisectlib
```

Full disclaimer, in the tradition of my hashmap posts: I'm the author, so I think
it's great. But I built it because a naive bisect handed me a wrong answer with a
straight face, and I never want to spend that afternoon again.
