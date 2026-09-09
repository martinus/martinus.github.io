#!/usr/bin/env python3
"""Measure the rhythm of a post's prose, and name the paragraphs that have none.

A readability instruction that cannot be checked ("make it flow better") gets answered with
clause swaps that leave the reading exactly as it was. This prints numbers instead, so a pass
either moved them or did not:

    scripts/prose-lint.py _posts/2026/*.md              # the summary for each file
    scripts/prose-lint.py --worst 20 <file>             # the sentences to go and fix
    scripts/prose-lint.py --check <file>                # exit 1 if it misses the targets

What it counts and why. **Median sentence length** is the register: this blog's hand-written
posts sit near 18 words and its assisted ones near 25. **Sentences over 35 words** are the ones a
reader has to hold in their head to the end. **Paragraphs with no sentence under 18 words** have
nowhere to land -- that one predicts "dense" better than any average does. **Asides** (`--`) and
**numbers per sentence** are the two things that push a sentence past what one pass can carry.

Prose only: front matter, code fences, HTML blocks, tables, kramdown IALs, headings, figure links
and italic table captions are not prose and are removed before anything is counted.
"""
import argparse
import re
import statistics
import sys

# Measured against this blog's own hand-written posts, not against a style guide. The first
# version of this file asked for a median of 19 and no sentence over 35 words, a pass hit both
# exactly, and the result read as staccato: optimising a central tendency and a ceiling produces
# uniformity, and uniform short sentences are as tiring as uniform long ones. Rhythm is the spread,
# so `long_pct` is a floor rather than a ceiling -- a page with no long sentence in it has no
# rhythm either.
TARGETS = {"median": 20, "over35_pct": 12.0, "no_landing_pct": 15.0, "long_pct_min": 20.0}


def prose_paragraphs(text):
    """(paragraph, line number) for every paragraph that is prose."""
    text = re.sub(r"(?s)^---\n.*?\n---\n", lambda m: "\n" * m.group(0).count("\n"), text)
    # Blank out non-prose rather than deleting it, so line numbers still point into the file.
    def blank(m):
        return "\n" * m.group(0).count("\n")
    text = re.sub(r"(?s)```.*?```", blank, text)
    text = re.sub(r"(?s)<(table|style|script|div).*?</\1>", blank, text)
    out = []
    for para in re.split(r"\n\s*\n", text):
        if not para.strip():
            continue
        line = text[: text.index(para)].count("\n") + 1
        lines = [l for l in para.split("\n")
                 if not l.startswith(("|", "<", "#", "{:", "    ", "\t"))
                 and not re.match(r"^\s*[-*+] ", l) and not re.match(r"^\s*\d+\. ", l)]
        p = re.sub(r"\s+", " ", " ".join(lines)).strip()
        p = re.sub(r"\[!\[.*?\)\]\(.*?\)", "", p)
        is_caption = p.startswith("*") and p.endswith("*") and not p.startswith("**")
        if len(p.split()) > 25 and not is_caption:
            out.append((p, line))
    return out


# A sentence may start with a lowercase identifier here -- `m_values` is not touched, boost's miss
# walks on -- so the split cannot require a capital, which an earlier version did: it glued those
# sentences onto the one before and inflated every length. What it must not split on instead is the
# handful of abbreviations and the version numbers that carry an inner full stop.
ABBREV = re.compile(r"(?:\b(?:e\.g|i\.e|vs|cf|Dr|Mr|Ms|St|approx|fig|ch|pp|al)|\b[A-Z])\.$")


def sentences(paragraph):
    out, current = [], ""
    # `**A claim.** The next sentence` is two sentences: the full stop is inside the bold, so the
    # boundary is after the `**`. Without this the lead-in is glued to what follows, which reads as
    # one 50-word sentence and pushes an editor into moving full stops out of the bold to satisfy a
    # counter -- a formatting change made for the instrument rather than for the reader.
    for piece in re.split(r"(?<=[.!?]) +|(?<=[.!?]\*\*) +", paragraph):
        current = (current + " " + piece).strip() if current else piece
        if ABBREV.search(current.rstrip()):
            continue  # an abbreviation or a version number, not the end of a sentence
        out.append(current)
        current = ""
    if current:
        out.append(current)
    return [s.strip() for s in out if len(s.split()) > 2]


def measure(path):
    paras = prose_paragraphs(open(path).read())
    sents = [(s, line) for p, line in paras for s in sentences(p)]
    if not sents:
        return None
    lengths = [len(s.split()) for s, _ in sents]
    no_landing = [(p, line) for p, line in paras
                  if sentences(p) and min(len(s.split()) for s in sentences(p)) >= 18]
    return {
        "path": path, "sentences": len(sents), "paragraphs": len(paras),
        "median": statistics.median(lengths), "mean": statistics.mean(lengths),
        "under12_pct": 100 * sum(1 for x in lengths if x < 12) / len(lengths),
        "over35_pct": 100 * sum(1 for x in lengths if x > 35) / len(lengths),
        "over35": sorted(((len(s.split()), line, s) for s, line in sents if len(s.split()) > 35),
                         reverse=True),
        "asides": [(line, s) for s, line in sents if s.count("--") >= 2],
        "numbers": [(line, s) for s, line in sents if len(re.findall(r"\d+[\d.,]*", s)) >= 3],
        "no_landing": no_landing,
        "no_landing_pct": 100 * len(no_landing) / len(paras),
        "long_pct": 100 * sum(1 for x in lengths if x > 25) / len(lengths),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--worst", type=int, default=0, help="list this many of the longest sentences")
    ap.add_argument("--check", action="store_true", help="exit 1 if a file misses the targets")
    args = ap.parse_args()
    failed = False
    for path in args.files:
        m = measure(path)
        if m is None:
            continue
        miss = (m["median"] > TARGETS["median"] or m["over35_pct"] > TARGETS["over35_pct"]
                or m["no_landing_pct"] > TARGETS["no_landing_pct"]
                or m["long_pct"] < TARGETS["long_pct_min"])
        failed = failed or miss
        print(f"{path}")
        print(f"  {m['sentences']:5} sentences in {m['paragraphs']} paragraphs")
        print(f"  median {m['median']:.0f} words, mean {m['mean']:.1f}"
              f"        target median <= {TARGETS['median']}")
        print(f"  {m['over35_pct']:5.1f}% over 35 words ({len(m['over35'])})"
              f"       target <= {TARGETS['over35_pct']}%")
        print(f"  {m['no_landing_pct']:5.1f}% of paragraphs have no sentence under 18 words"
              f" ({len(m['no_landing'])})   target <= {TARGETS['no_landing_pct']}%")
        print(f"  {m['under12_pct']:5.1f}% of sentences under 12 words")
        print(f"  {m['long_pct']:5.1f}% over 25 words"
              f"                    target >= {TARGETS['long_pct_min']}% -- rhythm needs long ones too")
        print(f"  {len(m['asides']):5} sentences with two or more -- asides")
        print(f"  {len(m['numbers']):5} sentences carrying three or more numbers")
        if args.worst:
            print("\n  longest sentences:")
            for n, line, s in m["over35"][: args.worst]:
                print(f"    line {line:5}  {n:3}w  {s[:150]}")
            print("\n  paragraphs with no landing point:")
            for p, line in m["no_landing"][: args.worst]:
                print(f"    line {line:5}  {p[:150]}")
    sys.exit(1 if (args.check and failed) else 0)


if __name__ == "__main__":
    main()
