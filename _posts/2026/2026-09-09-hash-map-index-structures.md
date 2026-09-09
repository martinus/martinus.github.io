---
layout: post
title: The Index Structures of Fast C++ Hash Maps
subtitle: "What SwissTable, Boost, F14, emhash8, emilib, indivi, Verstable, ihtab and unordered_dense put in front of their keys: every design read from its source, drawn to one scale, and measured on one machine"
cover-img: /img/2026/hashmap-index/cover.jpg
share-img: /img/2026/hashmap-index/cover.jpg
---

<style>
/* The cover photo has pale drawer fronts in it, and the theme's header text is white with nothing
   but a 3px shadow behind it -- which is not enough over the bright patches, worst at phone width
   where the subtitle wraps onto them. An inset shadow paints over the background image and under
   the text, so one line darkens the photo without touching anything else. */
.intro-header.big-img { box-shadow: inset 0 0 0 100vh rgba(0, 0, 0, 0.35); }

/* Eighteen maps by seven workloads does not fit a phone; let the wide ones scroll sideways
   instead of being clipped. */
.blog-post table { display: block; width: fit-content; max-width: 100%; overflow-x: auto; }

/* The workload grids tint each cell by how far it is from parity: a diverging ramp, four steps
   either side, blue where a map beats unordered_dense and amber where it does not. Every tint is
   light enough that the ink on top stays at 7.4:1 or better -- that constraint is what decides how
   dark the ramp may get -- and blue against amber is the pair that survives every kind of colour
   blindness, separating by 25 to 130 units under deuteranopia, protanopia and tritanopia alike.
   Lightness carries the magnitude, hue the direction, and the number is in the cell, so nothing is
   encoded by colour alone. */
.blog-post table.grid { border-collapse: separate; border-spacing: 2px; }
.blog-post table.grid th { font-weight: 400; white-space: nowrap; }
.blog-post table.grid thead th { font-weight: 600; }
.blog-post table.grid td { text-align: right; }
.blog-post table.grid thead th { text-align: right; }
.blog-post table.grid thead th:first-child, .blog-post table.grid tbody th { text-align: left; }
/* Digits line up column-wise in every table, generated or written by hand, and a numeric column is
   right-aligned by the markdown itself so it stays that way with scripting off. */
.blog-post table td, .blog-post table th { font-variant-numeric: tabular-nums; }
.blog-post table.grid td.na { color: #6b7280; }
.blog-post table.grid .f1 { background: #e8f1fd; }
.blog-post table.grid .f2 { background: #cfe3fb; }
.blog-post table.grid .f3 { background: #aed1f7; }
.blog-post table.grid .f4 { background: #8bbdf2; }
.blog-post table.grid .s1 { background: #fdf0e3; }
.blog-post table.grid .s2 { background: #fbdfc2; }
.blog-post table.grid .s3 { background: #f7c99b; }
.blog-post table.grid .s4 { background: #f2b273; }
/* One padding for every table cell, generated or written by hand. Tinted cells used to be the only
   ones with any, which made a table look like two tables. */
.blog-post table td, .blog-post table th { padding: 3px 9px; }
.blog-post table .f1 { background: #e8f1fd; }
.blog-post table .f2 { background: #cfe3fb; }
.blog-post table .f3 { background: #aed1f7; }
.blog-post table .f4 { background: #8bbdf2; }
.blog-post table .s1 { background: #fdf0e3; }
.blog-post table .s2 { background: #fbdfc2; }
.blog-post table .s3 { background: #f7c99b; }
.blog-post table .s4 { background: #f2b273; }

/* Every chapter heading carries a link back to the contents. Floated, so it sits at the right
   of the heading's first line and a long title neither wraps around it nor is pushed by it;
   0.85rem in the muted ink rather than a shrunken h1, and #4b5563 is 7.6:1 on the page. */
.blog-post h1 > a.up { float: right; margin-left: 1.5rem; font-size: 0.85rem; font-weight: 400;
                       line-height: 1.9; color: #4b5563; text-decoration: none; white-space: nowrap; }
.blog-post h1 > a.up:hover, .blog-post h1 > a.up:focus { color: #008AFF; text-decoration: underline; }
@media (max-width: 480px) { .blog-post h1 > a.up { margin-left: 0.75rem; } }
</style>

<script>
/* The markdown tables get the same tinting the generated grids carry as classes: distance from a
   reference, four steps, blue nearer / amber further. `.heat-par` measures every cell against 1.00,
   which is parity with unordered_dense; `.heat-low` measures each column against its own best value,
   so the leanest cell is untinted and the rest deepen away from it; `.heat-row` does the same along a
   row instead, for tables whose rows are conditions and whose columns are the alternatives being
   compared. Getting that axis wrong is worse than no colour at all: a column holding a build time, a
   churn time and a byte count has no common scale, and tinting it claims there is one.
   `data-invert` names the columns
   where larger is better (IPC). A row whose only filled cell is its label starts a new section, so
   the two halves of the counter table are scaled separately rather than against each other -- hits
   and misses are not comparable quantities and tinting them on one scale would say they were.
   The number is in the cell either way, so with scripting off nothing is lost but the shortcut. */
(function () {
  /* This block sits at the top of the post, so the tables below it do not exist yet. */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', paint);
  } else {
    paint();
  }
  function paint() {
  var FAST = ['f1', 'f2', 'f3', 'f4'], SLOW = ['s1', 's2', 's3', 's4'], EDGE = [0.07, 0.22, 0.5, 1.0];
  var num = function (td) {
    var s = td.textContent.trim().replace(/,/g, '');
    return /^[0-9]+(\.[0-9]+)?$/.test(s) ? parseFloat(s) : null;
  };
  var filled = function (tr) {
    return [].filter.call(tr.children, function (c) { return c.textContent.trim() !== ''; }).length;
  };
  [].forEach.call(document.querySelectorAll('table.heat-par, table.heat-low, table.heat-row'), function (t) {
    var par = t.classList.contains('heat-par');
    var byRow = t.classList.contains('heat-row');
    var inv = (t.getAttribute('data-invert') || '').split(',').map(function (s) { return s.trim(); });
    var head = [].map.call(t.querySelectorAll('thead th'), function (th) { return th.textContent.trim(); });
    var sections = [[]];
    [].forEach.call(t.querySelectorAll('tbody tr'), function (tr) {
      if (filled(tr) <= 1 && sections[sections.length - 1].length) { sections.push([]); }
      if (filled(tr) > 1) { sections[sections.length - 1].push(tr); }
    });
    var paint = function (cells, vals, ref) {
      cells.forEach(function (td, i) {
        var d = Math.abs(Math.log(vals[i] / ref) / Math.LN2), b = -1;
        if (d >= EDGE[0]) { b = 3; for (var k = 1; k < EDGE.length; k++) { if (d < EDGE[k]) { b = k - 1; break; } } }
        if (b >= 0) { td.className = (par && vals[i] < 1 ? FAST : SLOW)[b]; }
      });
    };
    if (byRow) {
      [].forEach.call(t.querySelectorAll('tbody tr'), function (tr) {
        var cells = [], vals = [];
        for (var c = 1; c < tr.children.length; c++) {
          var v = num(tr.children[c]);
          if (v !== null && v > 0) { cells.push(tr.children[c]); vals.push(v); }
        }
        if (vals.length >= 2) { paint(cells, vals, Math.min.apply(null, vals)); }
      });
      return;
    }
    sections.forEach(function (rows) {
      if (rows.length < 2) { return; }
      var cols = Math.max.apply(null, rows.map(function (r) { return r.children.length; }));
      for (var c = 1; c < cols; c++) {
        var cells = [], vals = [];
        rows.forEach(function (r) {
          var td = r.children[c];
          if (!td) { return; }
          var v = num(td);
          if (v !== null && v > 0) { cells.push(td); vals.push(v); }
        });
        if (vals.length < 2) { continue; }
        var ref = par ? 1 : (inv.indexOf(head[c]) >= 0 ? Math.max.apply(null, vals)
                                                       : Math.min.apply(null, vals));
        paint(cells, vals, ref);
      }
    });
  });
  }
}());
</script>

Two hash maps can agree on everything you would think matters: open addressing, a power of two
capacity, the same good hash. And still one of them takes twice as long for a lookup that finds
nothing. The difference is a few bytes you never see. Before either map touches a key it reads
something smaller, a control byte or a tag or a fingerprint or a counter. That metadata is where
most of the hash map work of the last ten years happened, and I could not find a single place that
writes it down. So here it is: every design read from its source, drawn to the same scale, and asked
the same five questions.

**What you should get out of it** is the ability to look at any of these maps and say what happens
on a miss, what an erase leaves behind, and what that costs. And to predict which of them suffers
on a churning table, on a large value, or on memory, before running anything. Also, to read someone
else's hash map benchmark and see what it is not telling you, which lasts longer than knowing this
year's winner.

**How it is arranged.** Four chapters of setup: the five questions every index answers, and the
three families that answer them differently. Then one chapter per design, all written in the same
shape: layout, one lookup, what an erase leaves, what the design is good at and what it pays for. So
they read in any order, and they compare column by column. Then all of them side by side, with a
summary table, eighteen maps on seven workloads, hardware counters, and three probe loops
disassembled, because the argument comes down to about two instructions.

The last part is about my own map, which is also the disclosure. `ankerl::unordered_dense` is here
in two versions and both are mine, 4.11.0 released and 5.0 not yet. Everything else is someone
else's work, quoted from their source. Every number comes from one desktop, every map is handed the
same hash, and every ratio between two maps is a geometric mean over a range of table sizes.
[The last chapter](#how-measured) says why I do it that way.

**If you are not going to read all of it.** [The summary table](#summary-table) is every design in
two tables, and the three paragraphs under it are the short version of the argument. [Question by
question](#question-by-question) answers "which of these should I use" for ten different situations.
[What reading eighteen indexes changed my mind about](#changed-my-mind) is the conclusion, in four
paragraphs. Every design chapter stands on its own, so the list below is a menu rather than an order.

# Contents {#contents}

**What an index has to do**

1. [Five questions every hash map index answers](#five-questions)
2. [What a lookup is made of](#what-a-lookup-is-made-of)
3. [Three families: flat, dense, node](#three-families)
    * [Keys in the slots: flat](#flat-family)
    * [Keys in a vector: dense](#dense-family)
    * [Keys behind a pointer: node-based](#node-family)
4. [Per-slot metadata or per-group metadata](#per-slot-or-per-group)

**The designs**

Every chapter here reads the same way: the layout, one lookup through it, what an insert and an
erase leave behind, and what the design is good at and what it pays for. Listed below each chapter
are only the parts particular to that design.

{:start="5"}
5. [Robin hood with an ordered word: unordered_dense 4.11.0](#robin-hood)
    * [Backward shift deletion: no tombstones, ever](#backward-shift)
    * [What carried into the group index, and what did not](#rh-carried)
6. [SwissTable: abseil's flat_hash_map](#swisstable)
    * [Tombstones and the 7/8 rule](#swiss-tombstones)
    * [The small table: one element, and no allocation at all](#swiss-soo)
7. [Boost's unordered_flat_map: fifteen slots and an overflow byte](#boost)
    * [An erase cannot clear a bit](#boost-erase)
    * [Why an overflow bit degrades more gently than a tombstone](#bit-vs-tombstone)
8. [Folly F14: one counter per chunk](#f14)
    * [A counter an erase can decrement](#f14-counter)
    * [Value, Node, Vector](#f14-variants)
9. [indivi: counters an erase can undo, and distance nibbles](#indivi)
    * [Erase by iterator without a hash: the nibbles](#indivi-nibbles)
10. [indivi flat_wmap: the window that beats the group](#flat-wmap)
    * [Layout: one byte per slot, and a window rather than a group](#wmap-layout)
    * [One lookup](#wmap-lookup)
    * [Why it is faster, and it is not the window](#wmap-why)
    * [What it would cost the group index](#wmap-steal)
11. [The group index: unordered_dense 5.0](#group-index)
    * [Eight counters, by fingerprint class](#counters-by-class)
    * [The miss bound, and eight keys that hang a map without one](#miss-bound)
    * [Erase: decrement, do not tombstone](#group-erase)
    * [Drift, and moving home](#drift)
    * [Where the indices live: one array or two](#one-array-or-two)
12. [Chains instead of probes: emhash8 and Verstable](#chains)
    * [emhash8: chaining through the index, and a fingerprint for free](#emhash8)
    * [Verstable: a 16 bit word with a chain in it](#verstable)
13. [The plain SwissTables: emilib and ihtab](#plain)
    * [emilib: a state byte per slot](#emilib)
    * [ihtab: eight slots at half load](#ihtab)
    * [ixhtab, and the bug that a constant-size churn finds](#ixhtab)

**Side by side**

{:start="14"}
14. [The summary table](#summary-table)
    * [What one lookup touches](#what-one-lookup-touches)
15. [The same workloads on every map](#same-workloads)
    * [Integer keys](#integer-keys)
    * [String keys](#string-keys)
    * [A 64 byte mapped value](#big-value)
    * [Memory](#memory)
16. [Where the time actually goes](#where-the-time-goes)
    * [Counters](#counters)
    * [The probe loops, in assembly](#probe-assembly)
    * [Three ways to be fast](#three-ways)
17. [Question by question](#question-by-question)
    * [Which one, then](#which-one)

**Standing on those shoulders**

The three chapters about my own map rather than about the field: what it borrowed, how it was
built, and what it has not answered.

{:start="18"}
18. [What unordered_dense 5.0 took from the others, and what each idea was worth](#borrowed)
    * [From boost: the fingerprint word table, and a probe that terminates](#from-boost)
    * [From folly F14, and then from Verstable: how wide should the counter be](#counter-width)
    * [From folly F14: double hashing instead of a triangular probe](#from-f14-probe)
    * [From emhash8: a second fingerprint in the spare index bits](#from-emhash8)
    * [From indivi: the counters themselves, and the nibbles that did not follow](#from-indivi)
    * [From abseil: a per-table seed](#from-abseil-seed)
    * [From abseil and boost: cache-line-aligned metadata](#from-aligned)
    * [From CPython: a value index narrower than 32 bits](#from-cpython)
19. [Building the group index: growth, the compiler, the hash](#building)
    * [Growth: the pipelined rehash](#pipelined-rehash)
    * [What the compiler decides](#compiler)
    * [The hash it is given](#the-hash)
20. [What is still on the table](#still-on-the-table)

**What it adds up to**

{:start="21"}
21. [What reading eighteen indexes changed my mind about](#changed-my-mind)

**How it was measured**

{:start="22"}
22. [How the numbers were made, and how to remake them](#how-measured)
23. [Appendix: sources and versions](#appendix)

# 1. Five questions every hash map index answers [&#8593; contents](#contents){:.up} {#five-questions}

Every map in this post is an [open addressing](https://en.wikipedia.org/wiki/Open_addressing) hash
table. The entries live in one flat array of slots, and a key that finds its slot taken looks for
another one nearby instead of going onto a linked list. Here is the shape of it, and the five
questions are the five things this picture has to decide.

[![An open addressing lookup: hash the key, take the home slot from some bits of it, compare the metadata, probe on](/img/2026/hashmap-index/hashmap-basics.svg)](/img/2026/hashmap-index/hashmap-basics.svg)

A lookup, an insert and an erase are all made of the same five questions, and every design below is
a different set of answers to them.

1. **Home: where does this key belong?** Some bits of the
   [hash](https://en.wikipedia.org/wiki/Hash_function) pick a slot or a group of slots. Which bits
   is a real decision. If the fingerprint and the home come from the same part of the hash they are
   correlated, so most designs here take them from opposite ends on purpose. Verstable's header says
   so outright, *"We take the highest four bits so that keys that map (via modulo) to the same
   bucket have distinct hash fragments."*

2. **Here? Is the key in this slot, or this group?** That is what the metadata is for. A
   **fingerprint** (also called a tag, a hash fragment, an H2, or a reduced hash value: the same
   idea under five names) is a handful of hash bits stored beside the slot. If it does not match,
   the key cannot be here, and the map has saved itself a load of the key and a comparison. If it
   does match, it is probably here, and the map goes and checks.

3. **Absent? When may a miss stop?** This is the question that separates the designs. Something has
   to tell a probe that the key it is looking for is not further along. An **empty slot** does it:
   if the key existed it would have been placed at the first free slot on this sequence, so an empty
   slot proves absence. So does
   [robin hood](https://en.wikipedia.org/wiki/Hash_table#Robin_Hood_hashing)'s ordering, and boost's
   overflow bit, and F14's overflow counter, and Verstable's in-home-bucket bit. Those answers cost
   different amounts, and they are not equally exact.

4. **Where next? What does the probe sequence look like, and where does an insert land?**
   [Linear](https://en.wikipedia.org/wiki/Linear_probing),
   [quadratic](https://en.wikipedia.org/wiki/Quadratic_probing), triangular over groups,
   [double hashing](https://en.wikipedia.org/wiki/Double_hashing), or a chain threaded through the
   metadata itself.

5. **Gone: what does an erase leave behind?** This one is awkward. If a map answers "absent" with "I
   found an empty slot", then freeing a slot in the middle of a probe sequence breaks the proof for
   every key that probed past it.

There are four answers to that last question, and which one a map picks is most of what
distinguishes it from the others.

- Leave a **tombstone**, a marker that is not empty but holds nothing, and rehash when they pile
  up. That is abseil's SwissTable, emilib and ihtab.
- **Set an overflow bit** saying "somebody of this hash class went past here", and never clear it,
  because a bit cannot know whether some other key still needs it. A rehash is what eventually
  clears it. That is `boost::unordered_flat_map`.
- **Count** what passed by, and count it back down again on an erase, so that nothing is left
  behind at all. That is folly's F14, `indivi::flat_umap` and unordered_dense 5.0.
- **Move the elements back** so the sequence is repaired: robin hood's *backward shift deletion*,
  which is unordered_dense 4.11.0.

And there is a way of not needing an answer at all: **thread a chain** through the metadata, so that
a lookup only ever visits keys that belong to it. That is what emhash8 and Verstable do.

A few more words I will use from here on without explaining them again. A **group** is the run of
slots a map compares in one instruction, usually 14, 15 or 16. A slot's **home** is the group or
bucket its key hashes to, and **displacement** or **distance** is how far from home it ended up. The
**load factor** is how full the table is, and every map here has a maximum after which it doubles.

# 2. What a lookup is made of [&#8593; contents](#contents){:.up} {#what-a-lookup-is-made-of}

Three things cost time in a hash map lookup, and it helps to know which one a design is spending.

1. **Dependent loads.** The hash produces the address of the metadata, and the metadata produces the
   address of the key. On a dense map it produces an index instead, and the key and the value arrive
   together one link further along. Nothing on
   that chain can start early, so each link costs a full
   [cache miss](https://en.wikipedia.org/wiki/CPU_cache) once the table is bigger than the cache.
   For large tables this is the dominant cost, and it means the number of *regions* a lookup
   touches matters as much as the number of bytes.

2. **Branch mispredictions.** A [branch](https://en.wikipedia.org/wiki/Branch_predictor) whose
   outcome is data-dependent and unpredictable costs about sixteen cycles when it is wrong. "Is
   this bucket occupied?" asked once per bucket is a coin flip. "Did any of these sixteen
   fingerprints match?" asked once per group is not. Most of the gap between the scalar designs and
   the [SIMD](https://en.wikipedia.org/wiki/Single_instruction,_multiple_data) ones is that
   difference, and it shows up again and again below.

3. **Instructions.** These are the cheapest of the three. A modern core retires four a cycle, and a
   lookup that waits on memory has slots to spare. A design that saves instructions on a path that
   is already stalled saves nothing. Several clever-looking ideas in this post lost for exactly that
   reason.

A fourth thing is not a cost, but it decides whether a measurement means anything at all.

**A table's cost rides a sawtooth.** A map doubles its slot array at one size and not at another,
so between two doublings its load factor sweeps from about a half up to its maximum and drops back.
One doubling is what I will call an **octave**, and it is the unit every ratio in this post is
averaged over.

[![Cost of a hit against table size across one doubling: every map ramps up as it fills and drops when it doubles](/img/2026/hashmap-index/sawtooth.svg)](/img/2026/hashmap-index/sawtooth.svg)

That is a hit measured at fifty-seven table sizes from 1,673 to 3,636 entries, small enough that all
of it is in L1, so nothing in the picture is the cache. Every line ramps as the table fills and drops
when it doubles, and **the amplitude differs by more than a factor of two between designs**: within
the octave unordered_dense 4.11.0 swings 1.83x between its cheapest and dearest size, boost 1.52x,
abseil 1.35x and unordered_dense 5.0 1.25x. Of the four maps drawn here robin hood has the largest
tooth, and [the robin hood chapter](#robin-hood) says why. Those four are not the whole field.
[`indivi::flat_wmap`](#flat-wmap) is not on this chart and swings wider than any of them. Also, an
amplitude is only comparable to another one taken on the same workload at the same sizes.

Two things follow. First, a number quoted at one size is a number at one arbitrary point of that
map's own tooth, and it can be 1.8x away from the same map's number one size along. Second, the
teeth do not line up. This octave nearly hides that, because a maximum load of 0.8 and one of 0.875
happen to double at almost the same place for these sizes. But boost's slot count is not a power of
two, and at larger sizes its tooth walks out of phase with everyone else's.

So every ratio in this post is a geometric mean over the five sizes drawn as large dots, rather than
a measurement at one of them. That changes answers, it does not just refine them. Measured on
unordered_dense 5.0 against boost, churn at a fixed size read 19% in unordered_dense's favour when
sampled at one size, and **22% in boost's** averaged over the octave. The sign reversed.

**And the seven workloads, once, because they are used by name from here on.** **Build** from empty
with no reserve. **Hit**, **miss** and **50% hits**: random lookups on a freshly built table, with
an rng that never replays. **Iterate**, summing every mapped value. **Churn**, erasing one and
inserting one at a constant size, always with a key the map has never held. And **insert/erase**, a
mix of `operator[]` and `erase` on a table that grows and shrinks. Each is run on
`map<uint64_t, size_t>`, on `map<std::string, size_t>` with keys 8 to 135 bytes, and on a `uint64_t`
key with a 64 byte mapped value.

# 3. Three families: flat, dense, node [&#8593; contents](#contents){:.up} {#three-families}

Before the metadata, one decision splits the field: where the key and the value actually live.

[![Flat, dense and node maps, and what one lookup has to touch in each](/img/2026/hashmap-index/families.svg)](/img/2026/hashmap-index/families.svg)

Flat has the shortest chain, and pays for it with every cost scaling in `sizeof(value_type)`,
because a hash-scattered slot is written whole. Dense writes four bytes there and appends the
payload in order, so iteration is an array walk and a large value costs the vector rather than the
table. For that it pays one more dependent load on every hit. Node maps keep references and
iterators valid forever, and pay an allocation per insert and a cache miss per lookup for it.

## Keys in the slots: flat {#flat-family}

`absl::flat_hash_map`, `boost::unordered_flat_map`, `folly::F14ValueMap`, `indivi::flat_umap`,
emilib, Verstable. The `value_type` is stored in the slot the hash picked. A lookup that gets a
fingerprint match reads the key from the same group it just read the metadata from, so a hit touches
one region and the shortest chain of the three families.

What it costs is that *every* cost scales with `sizeof(value_type)`. Growth copies whole values into
hash-scattered slots. An empty slot occupies a full `value_type`. Iteration walks the whole slot
array, most of which is empty, so a flat map at load 0.5 reads twice the memory it has to. And
references and iterators are invalidated by any growth, because the values move.

## Keys in a vector: dense {#dense-family}

`ankerl::unordered_dense`, `emhash8::HashMap`, `folly::F14VectorMap`, ihtab. The values live in a
contiguous array in insertion order, and the hash table holds an *index* into it rather than the
value. Iteration is a plain array walk over exactly the live entries. A 64 byte value costs the
vector rather than the table. Growth rehashes indices, not values.

**Four bytes is the usual index, and it is a choice rather than a law.** `folly::F14VectorMap` and
ihtab fix theirs at `uint32_t`. unordered_dense uses `uint32_t` and has a second bucket type,
`group_big`, whose index is a `size_t` for tables past four billion entries.
`emhash8::HashMap` is a `uint32_t` by default and a `uint16_t` or a `uint64_t` depending on how it
is compiled, and it stores *two* of them per bucket, because one of them is the chain link. And
[CPython's compact dict](https://mail.python.org/pipermail/python-dev/2012-December/123028.html),
which is the same idea outside C++, sizes its index to the table: one byte, two, four or eight. That
last one sounds like the obvious win. Building it into unordered_dense 5.0 measures **1.4% slower**
([the borrowed ideas](#borrowed) has it), because a table small enough to be indexed in 16 bits has
an index of at most 128 KB, which is already in L2. Halving something that already fits buys
nothing.

The price is one more dependent load on every hit: metadata, then index, then value. On a table that
fits in cache that is a few cycles. On a table that does not it is a cache miss and a TLB entry, and
that is the one structural cost of the family. It is why boost is ahead of unordered_dense 5.0 on a
fresh lookup, and it is not going away.

There is a second price. Erasing from the middle of a dense vector leaves a hole, and the usual fix
is to move the last element into it. That means finding the *slot* that points at the moved element,
which means hashing its key again. For an integer key that is free, and for a string key it costs
about 50 ns, both measured in unordered_dense 5.0 in [its erase](#group-erase).

## Keys behind a pointer: node-based {#node-family}

[`std::unordered_map`](https://en.cppreference.com/w/cpp/container/unordered_map),
`boost::unordered_node_map`, `absl::node_hash_map`, `folly::F14NodeMap`. Each
element is its own heap allocation and the table holds pointers. You want references that never go
stale? Then this is the family: references, pointers and iterators to an element stay valid for the
element's whole life, whatever else happens to the map. What you pay is an allocation per insert and
a pointer chase per lookup, into memory whose layout the map does not control.

The three modern node maps are worth separating from `std::unordered_map`, because only the last one
has its shape forced on it. The standard requires a bucket interface, so `bucket(key)`,
`bucket_size(n)` and local iterators, plus a guarantee that a rehash happens only when the load
factor is exceeded. Together those force a bucket array of linked lists, and every conforming
implementation has one. The modern node maps keep a fast index (a SwissTable in abseil's case, a
`group15` in boost's, an F14 chunk in folly's) and put the node behind it. So everything in the
chapters below applies to them as well, they just add one pointer chase and one allocation. In the
[measurements](#same-workloads) that costs a lot on lookups and almost nothing on iteration.

# 4. Per-slot metadata or per-group metadata [&#8593; contents](#contents){:.up} {#per-slot-or-per-group}

Within open addressing, the second decision is how much the map is willing to store per slot, and
whether the metadata is read one slot at a time or a group at a time.

**One byte per slot, sixteen at a time.** SwissTable and everything descended from it. A byte holds
seven or eight bits of hash plus an encoding of empty and deleted, and sixteen bytes are one SSE2
register. One compare and one `movemask` give sixteen verdicts, and one unpredictable branch instead
of sixteen. The cost is that a byte is not much room, so anything else the design wants, e.g.
overflow information or a distance, needs somewhere else to live.

**One byte per slot, and no groups at all.** `indivi::flat_wmap` reads sixteen bytes *unaligned*
starting at the home slot. It gives up any notion of a group boundary, which makes placement per
slot rather than per group, and on integer keys it is the fastest map on a hit in
[the measurements](#same-workloads).

**More than a fingerprint per slot.** Robin hood's eight byte bucket carries a distance as well, so
a single compare orders buckets and a miss can stop on an inequality. Verstable's sixteen bits carry
a chain link. emhash8's two words carry a chain and a value index. These designs can answer
questions a byte cannot, and they pay for it in branches and in memory.

**A group, plus something on the side.** boost's sixteenth byte, F14's two counter bytes, indivi's
and unordered_dense 5.0's eight counters. This is where the answer to "when may a miss stop?" moved
in the last few years, and it is what the chapters on [boost](#boost), [F14](#f14),
[indivi](#indivi) and [the group index](#group-index) are mostly about.

One piece of vocabulary before the designs, because it turns up well before its own chapter does.
When I write **the group index** I mean the index unordered_dense 5.0 uses: sixteen one-byte
fingerprints and eight overflow counters per group of sixteen slots, with the value indices in the
same block. [Its own chapter](#group-index) takes it apart, and every design chapter before that one
ends by pointing forward to it, so the name has to arrive here.

Read each chapter for two things: **how a miss stops**, and **what an erase leaves behind**. Those
two are one question asked from both ends, and no two of these maps answer it the same way.

Where a design has an idea worth stealing, its chapter says so, and
[the borrowed ideas](#borrowed) say what happened when I stole it: twelve of them, implemented in
unordered_dense 5.0 and measured, four kept, one optional, seven not.

# 5. Robin hood with an ordered word: unordered_dense 4.11.0 [&#8593; contents](#contents){:.up} {#robin-hood}

This is my own map as it stood up to 4.11.0, and I have written about the design
[twice](/2016/09/15/very-fast-hashmap-in-c-part-1/)
[before](/2026/09/04/unordered-dense-four-buckets-at-a-time/). It is in this post because it is the
best robin hood table I know of, and because the trick at the centre of it is, as far as I know,
mine.

## Layout: distance above fingerprint, so one compare orders both

[![One bucket to byte scale, 3 bytes of distance, 1 of fingerprint and 4 of value index, and a run of buckets before and after an insert](/img/2026/hashmap-index/rh-bucket.svg)](/img/2026/hashmap-index/rh-bucket.svg)

```cpp
struct standard {
    static constexpr std::uint32_t dist_inc = 1U << 8U;             // skip 1 byte fingerprint
    static constexpr std::uint32_t fingerprint_mask = dist_inc - 1; // mask for 1 byte of fingerprint

    std::uint32_t m_dist_and_fingerprint; // upper 3 byte: distance to original bucket. lower byte: fingerprint from hash
    std::uint32_t m_value_idx;            // index into the m_values vector.
};
```

Eight bytes per slot, and no key in them. Four of those eight are `m_dist_and_fingerprint`, and the
rest of this section is about that `uint32_t`. Its low byte is the fingerprint. Its upper three
bytes are the distance from home, incremented by adding `dist_inc`, which is exactly `1 << 8`. Zero
means the bucket is empty, distance 1 means the key is at home. The other four bytes are
`m_value_idx` and take no part in any of it.

Because the distance sits above the fingerprint in the same `uint32_t`, one integer compare orders
two buckets first by distance and then, as a tiebreak, by fingerprint. Robin hood needs to know "am
I further from home than the key sitting here?", and the fingerprint check needs to know "are these
the same eight hash bits?". One comparison of one word answers both, with the right precedence, and
for free. The idea comes from the *infobyte* and *hashbits* of my
[2016 post](/2016/09/21/very-fast-hashmap-in-c-part-2/) and then from `robin_hood`. Packing them
into one ordered word came later, and I have not seen it anywhere else.

## One lookup: equal, less, or keep going

```cpp
while (true) {
    auto const* bucket = &at(m_buckets, bucket_idx);
    if (dist_and_fingerprint == bucket->m_dist_and_fingerprint) {
        if (m_equal(key, get_key(m_values[bucket->m_value_idx]))) {
            return {dist_and_fingerprint, bucket_idx, bucket->m_value_idx, true};
        }
    } else if (dist_and_fingerprint > bucket->m_dist_and_fingerprint) {
        return {dist_and_fingerprint, bucket_idx, 0, false};
    }
    dist_and_fingerprint = dist_inc(dist_and_fingerprint);
    bucket_idx = next(bucket_idx);
}
```

Three outcomes per bucket. Equal means the fingerprints match and the key is worth comparing.
**Greater is the proof of absence**, because distances never drop by more than one along a run. So
if the key we are looking for is further from home than the key sitting here, ours cannot be
anywhere ahead. Everything else means step on. An empty bucket has distance 0, which is smaller than
any live `dist_and_fingerprint`, so it falls out of the same comparison and needs no special case.

4.11.0 also has an SSE2 path that does the same thing to four consecutive buckets at once, which is
the subject of [the previous post](/2026/09/04/unordered-dense-four-buckets-at-a-time/). Having that
path in the comparison is what makes this an honest comparison rather than a straw man. The scalar
loop above runs where SSE2 is not available, and it is the classic shape.

## Backward shift deletion: no tombstones, ever {#backward-shift}

An erase does not free the slot and walk away. It shifts the following run back down by one and
decrements each distance, until it reaches a bucket at distance 1 or an empty one. That restores the
invariant exactly, so **a table that has churned for hours is byte for byte the table a fresh build
of the same contents would have produced**. No tombstones, no rehash to clean up, no degradation. Of
everything in this post, only robin hood gives that unconditionally.

## Good at, pays for

Good at: the strongest possible answer to "gone?", a compact 8 bytes per slot, and a probe that
stops on a comparison rather than on an occupancy test.

Pays for: **a coin flip per bucket**. The scalar probe and the insert's shift loop both ask a
question whose answer is unpredictable, once per bucket. The scalar probe costs 1.14 branch
mispredictions per hit, the four-lane SSE2 one 0.19, and the shift went from 0.61 mispredictions per
insert to 0.24 the same way. Also, a lookup here rides the load factor harder than in any other
design in this post, because probe lengths in a robin hood table roughly double between an empty
table and a full one. On all-hit lookups a scalar robin hood probe swings 2.05 to 2.35x between the
cheapest and the dearest point of an octave, where a group design swings 1.07 to 1.28x. The vector
probe of 4.11.0 takes the worst of that back, with a swing of 1.83x on [the sawtooth chart
above](#what-a-lookup-is-made-of). That is still the widest of the four maps drawn there.

## What carried into the group index, and what did not {#rh-carried}

Into unordered_dense 5.0, that is. [The group index chapter](#group-index) has the whole design, and
this here is only the part that came from the design above.

Kept: the fingerprint from the low byte of the hash and the home from the top bits, so the two are
independent; the dense value vector; the 8 bit fingerprint width.

Dropped: the ordering, the shifts, and the sentinel padding at the end of the bucket array. What
replaced them is [the group index](#group-index).

# 6. SwissTable: abseil's flat_hash_map [&#8593; contents](#contents){:.up} {#swisstable}

Everything else in this post is measured against this design, whether it says so or not. The shape
comes from [abseil](https://abseil.io/about/design/swisstables)'s `raw_hash_set`: a group of slots,
one byte of hash each, compared in a single SIMD instruction. Boost, folly, indivi, emilib, ihtab
and unordered_dense 5.0 are all variations of it, and the chapters that follow are mostly about the
one thing each of them changed.

## Layout: one control byte per slot, sixteen at a time

[![The hash split into H1 and H2, sixteen control bytes, and the slots](/img/2026/hashmap-index/swiss-group.svg)](/img/2026/hashmap-index/swiss-group.svg)

**Each control byte** describes exactly one slot: `kEmpty` if the slot is free, `kDeleted` if it
holds a tombstone, or **H2**, the top seven bits of the hash of the key that is in it. (`kSentinel`
is written once, at the end of the array, so that iteration knows where to stop.) The markers all
have their top bit set and a tag has it clear, so one sign test separates "there is a key here" from
"there is not".

```cpp
enum class ctrl_t : int8_t {
  kEmpty = -128,   // 0b10000000
  kDeleted = -2,   // 0b11111110
  kSentinel = -1,  // 0b11111111
};
```

abseil spells out why each marker is the number it is, in a run of `static_assert`s directly
underneath:

```cpp
static_assert(
    ctrl_t::kSentinel == static_cast<ctrl_t>(-1),
    "ctrl_t::kSentinel must be -1 to elide loading it from memory into SIMD "
    "registers (pcmpeqd xmm, xmm)");
static_assert(ctrl_t::kEmpty == static_cast<ctrl_t>(-128),
              "ctrl_t::kEmpty must be -128 to make the SIMD check for its "
              "existence efficient (psignb xmm, xmm)");
```

The home comes from **H1**, which in the current version is simply the whole hash, masked. So the
group comes from the low bits and the tag from the top seven, which is the same independence robin
hood gets by taking the fingerprint from the bottom. Before either of them is taken, a per-table
16 bit seed is XORed into a non-default hash. That is abseil's defence against a caller reusing one
hash across many tables.

## One lookup: match H2, then match empty

```cpp
auto seq = probe(common(), hash);
const h2_t h2 = H2(hash);
const ctrl_t* ctrl = control();
while (true) {
  Group g{ctrl + seq.offset()};
  for (uint32_t i : g.Match(h2)) {
    if (ABSL_PREDICT_TRUE(equal_to(key, slot_array() + seq.offset(i))))
      return iterator_at(seq.offset(i));
  }
  if (ABSL_PREDICT_TRUE(g.MaskEmpty())) return end();
  seq.next();
}
```

That is the canonical SwissTable probe, and six of the other maps in this post are variations of
these nine lines. `Match(h2)` is a broadcast, a `_mm_cmpeq_epi8` and a `_mm_movemask_epi8`, so
sixteen slots become one 16 bit mask. Iterating that mask visits only the lanes that could match.
`MaskEmpty()` is the answer to "absent?": if any slot in this group is empty, then the key would
have been placed at or before it, so it is not in the table.

The probe sequence is triangular, `offset += index; index += Width`, which visits every group in a
power-of-two array exactly once.

## Tombstones and the 7/8 rule {#swiss-tombstones}

An erase writes `kDeleted`, unless both neighbours in the same group are empty, in which case it can
write `kEmpty` without breaking anyone's proof. So a table that churns at a fixed size fills up with
tombstones, `MaskEmpty()` stops finding anything, and misses get longer and longer. abseil handles
that by rehashing in place when an insert finds no growth left. The table does not get bigger, but
the tombstones go away and every probe sequence is rebuilt.

The maximum load factor is 7/8, so growth happens at capacity times 7/8.

## The small table: one element, and no allocation at all {#swiss-soo}

Recent abseil has something no other map here does, and it is aimed at a case a benchmark suite
almost never measures: the map that holds nothing, or one single thing.

A `flat_hash_map` whose capacity is one does not allocate. The single element lives **inside the
container object**, in the same bytes that otherwise hold the pointer to the heap:

```cpp
constexpr size_t SooCapacity() { return 1; }
constexpr bool IsSmallCapacity(size_t capacity) { return capacity <= 1; }

constexpr static bool SooEnabled() {
  return PolicyTraits::soo_enabled() &&
         sizeof(slot_type) <= sizeof(HeapOrSoo) &&
         alignof(slot_type) <= alignof(HeapOrSoo);
}
```

`HeapOrSoo` is a union of the heap pointers and one slot, so the optimization applies exactly when
the `value_type` is no bigger than those pointers. A `map<int, int>` gets it, a
`map<std::string, std::string>` does not. And a lookup on that table does not probe at all:

```cpp
iterator find_small(const key_arg<K>& key) {
  return empty() || !equal_to(key, single_slot()) ? end() : single_iterator();
}
```

No control bytes, no group compare, no probe sequence, just one key comparison. `find()` branches on
`is_small()` and takes that path instead of hashing.

**One element and not two**, deliberately, and the header says why:

```cpp
// We only allow a maximum of 1 SOO element, which makes the implementation
// much simpler. Complications with multiple SOO elements include:
// - Satisfying the guarantee that erasing one element doesn't invalidate
//   iterators to other elements ...
// - In order to prevent user code from depending on iteration order for small
//   tables, we would need to randomize the iteration order somehow.
```

What it buys is an allocation, and that is worth a lot more than a probe. A `map<int, int>` used as
a local scratch variable, or one held per node of a tree, costs a `malloc` and a `free` in every
other map in this post, and costs nothing here. There is a second and smaller tier above it: once a
table outgrows the single slot, capacities up to seven use a simplified algorithm
(`MaxSmallAfterSooCapacity`) rather than the general one.

**None of it shows in my measurements.** The smallest table that [the measurements](#same-workloads)
build holds a thousand entries, so every abseil number in this post comes from the general path. A
workload of many tiny maps would rank the field differently, and there abseil would be the map to
beat.

## Good at, pays for

Good at: the shortest dependent-load chain of any design here, with one region, one load after the
metadata, and the key right there. Years of tuning behind it, and the only small-table optimization
in the field.

Pays for: tombstones. A table held at a constant size by erasing one and inserting one is the
workload where SwissTable's answer to "gone?" is the weakest of the field, which is why
[the measurements](#same-workloads) include it on purpose.

Two things from this chapter were tried inside unordered_dense 5.0, and they are measured with the
others in [the borrowed ideas](#borrowed): the per-table seed, which costs nothing on a lookup, and
cache-line-aligning the metadata, which costs 0.7%.

# 7. Boost's unordered_flat_map: fifteen slots and an overflow byte [&#8593; contents](#contents){:.up} {#boost}

[boost::unordered_flat_map](https://www.boost.org/doc/libs/latest/libs/unordered/doc/html/unordered/structures.html#structures_open_addressing_containers)
is a SwissTable descendant with one change that matters a lot. It spends its sixteenth metadata byte
on the answer to "absent?" instead of on a sixteenth slot.

## Layout: group15 and the byte at the end

[![Fifteen reduced hash values and an overflow byte, and the bit it sets](/img/2026/hashmap-index/boost-group15.svg)](/img/2026/hashmap-index/boost-group15.svg)

Fifteen of the sixteen bytes are one reduced hash value per slot. [Boost's
header](https://github.com/boostorg/unordered/blob/develop/include/boost/unordered/detail/foa/core.hpp)
describes them as:

> `hi` is 0 if the i-th element slot is available, 1 to mark a sentinel and, when the slot is
> occupied, a value in the range [2,255] obtained from the element's original hash value.

**The sentinel is not a tombstone.** A tombstone is one per slot and means "something was here and
was erased", and boost has none at all. The sentinel is a single byte in the whole table, written by
`set_sentinel()` into the last group of the *metadata* array. It is there so that iteration knows
where to stop without carrying a separate end pointer. One byte per table, not one per erase.

The sixteenth byte of each group does something else:

> `ofw` is the so-called overflow byte. If insertion of an element with hash value `h` is tried on a
> full group, then the `(h%8)`-th bit of the overflow byte is set to 1 and a further group is
> probed.

That has two consequences, and the header names both. First, **no value has to be reserved for a
tombstone**, so a reduced hash keeps all log2(254) = 7.99 bits of it. The saving is smaller than it
looks, since a design that reserves one more value for a tombstone still keeps 253 of them, or 7.98
bits. What a tombstone really costs is the encoding around it. abseil spends the *top bit* of its
control byte on markers so that "empty or deleted" is one SIMD test at insertion, which is what
leaves it seven bits of hash rather than eight. Second, and this one matters more:

> When doing an unsuccessful lookup (i.e. the element is not present in the table), probing stops at
> the first non-overflowed group. Having 8 bits for signalling overflow makes it very likely that we
> stop at the current group (this happens when no element with the same `(h%8)` value has overflowed
> in the group), saving us an additional group check even under high-load/high-erase conditions. It
> is critical that hash reduction is invariant under modulo 8.

That last sentence is a nice detail. The reduced hash is not `h & 0xFF`. 0 and 1 are reserved, so
they are remapped, to 8 and 9 respectively, and the remap leaves `h % 8` unchanged, so the overflow
bit a group consults is the same one an insert set. The remap is a 256 entry table of pre-broadcast
32 bit words, **and that is the one I took for unordered_dense 5.0's own fingerprint word. Boost had
it first.**

## One lookup: match, then is_not_overflowed

```cpp
prober pb(pos0);
do{
  auto pos=pb.get();
  auto pg=arrays.groups()+pos;
  auto mask=pg->match(hash);
  if(mask){
    auto p=elements+pos*N;
    do{
      auto n=unchecked_countr_zero(mask);
      if(BOOST_LIKELY(bool(pred()(x,key_from(p[n]))))){ return {pg,n,p+n}; }
      mask&=mask-1;
    }while(mask);
  }
  if(BOOST_LIKELY(pg->is_not_overflowed(hash))){ return {}; }
}
while(BOOST_LIKELY(pb.next(arrays.groups_size_mask)));
```

The shape is SwissTable's, with `is_not_overflowed` where abseil has `MaskEmpty`. The metadata load
is *aligned*, `_mm_load_si128` rather than abseil's `loadu`, because a group is 16 bytes and the
array is aligned. The match then masks off the overflow byte with `& 0x7FFF`.

`pow2_quadratic_prober` steps by `pos += ++step`, the same triangular progression as abseil's, and
`next()` returns false once `step > mask`, so a full-table walk terminates. Maximum load factor is
0.875.

## An erase cannot clear a bit {#boost-erase}

The overflow byte has a cost, and it is the exact mirror of what makes it good. An insert sets a bit
to say "someone of class *h*%8 passed through here". An erase cannot unset it, because the bit is
shared by every key of that class and there is no count, so the map does not know whether some other
key still needs it. On a table held at a fixed size by erasing one and inserting one, boost's
overflow bits accumulate, misses walk further and further, and the only thing that clears them is a
rehash. Measured with boost's own statistics facility on a table of 200,000 entries at load 0.81,
erasing one and inserting one:

*How many groups (the 16 byte metadata blocks) an unsuccessful lookup probes on average. 1.00 means every miss stopped in its home group and never loaded a second one, 1.50 would mean half of them loaded a second one. One turnover is 200,000 erase-insert pairs, so a table that has replaced every element it holds. The sample points are not evenly spaced, they sit either side of the two in-place rehashes, which is where the number moves. Tinted cells, here and below, are coloured by how far they are from the best value in their column, or from parity where the table is a ratio to unordered_dense. A table with no tint is one where no axis is a common scale, or where every difference is too small to be worth a colour.*

| erase-insert pairs, in turnovers of the table | groups visited per miss |
|---|---:|
| 0.00, freshly built | 1.104 |
| 0.25 | 1.206 |
| 0.50 | 1.269 |
| 0.62 | 1.104 |
| 1.12 | 1.214 |
| 1.25 | 1.058 |
{: .heat-low}

**The number climbs and then drops back.** It climbs while the overflow bits accumulate, from 1.104
groups per miss on the fresh table to 1.269 half a turnover later. Then boost rehashes and it
returns to 1.104, and the climb starts again. That happened twice in this run, once per 120,000 to
150,000 erase-insert pairs. The repair is an **in-place rehash**: the bucket count is 245,759 before
and after, so the table is not growing, it is being rebuilt at the same size to clear the bits.

(Those probe lengths are from a build with `BOOST_UNORDERED_ENABLE_STATS` defined, which adds
Welford accounting to every lookup and makes a miss take 10.4 ns instead of 3.9. The counts are
exact either way, and the times below are from a build without it.)

## Why an overflow bit degrades more gently than a tombstone {#bit-vs-tombstone}

Both boost and abseil leave something behind that only a rehash clears, so why is one so much worse
than the other? Same workload, same hash, same machine, a miss on a 200,000 entry table, worst point
over one turnover of erase-and-insert:

*Time per miss. The multiplier is the worst point over the fresh table.*

|  | miss, freshly built | worst over one turnover | bucket count |
|---|---:|---:|---:|
| `boost::unordered_flat_map` | 3.91 ns | 5.71 ns (1.46x) | 245,759, unchanged |
| `absl::flat_hash_map` | 6.26 ns | 14.62 ns (2.34x) | 262,143, unchanged |

The difference is *what* the erase leaves behind, and it comes down to three things.

**A tombstone costs capacity; an overflow bit does not.** A later insert can take the slot, since
abseil places into the first empty *or* deleted slot on the probe sequence, but the erase does not
hand the capacity back. `OverwriteFullAsDeleted()` sets a flag and leaves `growth_left` alone, so a
tombstoned slot still counts against the load factor until a rehash reclaims it. Boost's erase frees
its slot outright. Under churn abseil's table then behaves as though it were fuller than it is, and
pays what a rising load factor costs.

**A miss stops on an empty slot, and an erase does not make one.** abseil's miss ends at the first
group holding an empty control byte. Erasing writes `kDeleted`, which is not empty, so churn keeps
consuming empty slots through inserts without ever producing one, and misses walk further as the
supply runs down. Boost stops a miss on the overflow bit instead, and the bit is one of eight chosen
by `h % 8`, so a group that has overflowed for one class still stops seven eighths of the misses
arriving at it. The overflow byte is a *byte* and not a flag for exactly that reason.

**And a tombstone makes the miss longer in a second way.** The probe that continues has to
`Match(h2)` the next group and compare any key whose tag collides, where boost's continuation is
just another `test` against the next overflow byte until something matches. The 1.46x against 2.34x
is those three compounding.

What boost pays instead is that its bit is *approximate* in the other direction. It can be set by a
key that has since been erased, so a boost miss sometimes walks on for nothing, where abseil's
tombstone at least marks a slot that really was used. That is a cost in probe length only, and [the
group index](#group-index)'s counters remove it, because a count can come back down where a bit
cannot.

## Good at, pays for

Good at: a lean 1.07 bytes of metadata per slot, a miss test that costs one `and` and one `test` and
is right seven eighths of the time even under heavy erasing, and no tombstone value to spend a bit
on. It is consistently among the two or three fastest maps here on every lookup workload.

Pays for: probe length under sustained churn, 1.46x on a miss before the rehash that repairs it as
the table above measures, and an erase that leaves that work for a future rehash to do. What it does
not pay is the churn workload itself. Even at its worst point boost is faster there than
unordered_dense 5.0, whose counters exist to remove that degradation, because it starts so far
ahead.

Two of boost's ideas ended up in unordered_dense 5.0, its terminating prober and its
pre-broadcast fingerprint word table. [The borrowed ideas](#borrowed) says what each was worth.

# 8. Folly F14: one counter per chunk [&#8593; contents](#contents){:.up} {#f14}

[folly](https://github.com/facebook/folly)'s F14 is the first design I know of that made a
SwissTable derivative tombstone-free, and it did it with a counter rather than with a bit.

## Layout: fourteen tags, a hosted count, an outbound count

[![An F14 chunk: 14 tags, control_ and outboundOverflowCount_](/img/2026/hashmap-index/f14-chunk.svg)](/img/2026/hashmap-index/f14-chunk.svg)

```cpp
// Zero means an empty tag. tags_ array might be bigger
// than kCapacity to keep alignment of first item.
std::array<uint8_t, 14> tags_;

// Bits 0..3 of chunk 0 record the scaling factor between the number of
// chunks and the max size without rehash.  Bits 4-7 in any chunk are a
// 4-bit counter of the number of values in this chunk that were placed
// because they overflowed their desired chunk (hostedOverflowCount).
uint8_t control_;

// The number of values that would have been placed into this chunk if
// there had been space, including values that also overflowed previous
// full chunks.  This value saturates; once it becomes 254 it no longer
// increases nor decreases.
uint8_t outboundOverflowCount_;
```

Fourteen tags rather than fifteen or sixteen, because with 16 byte vector alignment and items of at
least four bytes that is the most space-efficient capacity. For four byte items it is twelve, which
makes a chunk exactly one cache line. The tag is the top byte of the hash, forced to at least 1 so
that 0 can mean empty.

**The low four bits of `control_` belong to the table rather than to the chunk.** Every other map
here keeps "how many elements may I hold before I rehash" in the container object. F14 keeps it in
the metadata of **chunk 0** and nowhere else. `capacityScale` is the per-chunk capacity, so the
table's limit is `chunkCount * scale`. For a multi-chunk table the scale is `kDesiredCapacity`,
twelve of the fourteen slots, and for a single-chunk table it is whatever that one chunk was sized
to (2, 6 or 14):

```cpp
static std::size_t computeCapacity(std::size_t chunkCount, std::size_t scale) {
  return (((chunkCount - 1) >> Chunk::kCapacityScaleShift) + 1) * scale;
}
```

It is written once, by `computeChunkCountAndScale` when the chunk array is allocated, and read on
the insert path to decide whether this insert is the one that rehashes. There are two reasons to put
it there. First, it **costs nothing**: those four bits of chunk 0's `control_` are unused, because
`hostedOverflowCount` only needs the top four, so the field is free storage that a container member
would not be, and `sizeof(F14ValueMap)` is something folly cares about, since these maps get held by
the million. Second, a nonzero scale doubles as the marker that says "this is a real chunk array and
not the shared empty one", which is what `eof()` tests when an iterator runs off the end.

For chunks of twelve, tags 12 and 13 are unused as well, so the scale gets sixteen bits there
instead of four. That is the whole of `kCapacityScaleBits`.

## One lookup: double hashing, not triangular

```cpp
std::size_t index = hp.first;
std::size_t step = probeDelta(hp);
auto needleV = loadNeedleV(hp.second);
for (std::size_t tries = chunkCount(); tries > 0;) {
  ChunkPtr chunk = chunkAt(moduloByChunkCount(index));
  ItemIter found{};
  if (chunk->forEachTagMatch(needleV, [&](unsigned i) { ... })) { return found; }
  if (FOLLY_LIKELY(chunk->outboundOverflowCount() == 0)) { break; }
  --tries;
  index += step;
}
```

`probeDelta` is `2 * hp.second + 1`, twice the tag plus one, so it is odd and therefore coprime with
the power-of-two chunk count. That is double hashing: two keys that land in the same chunk take
*different* tours, where quadratic or linear probing gives them the same one. Folly says why in a
comment, and it reads as a direct answer to abseil and boost:

```cpp
// We could also implement probing strategies that resulted in the same
// tour for every key initially assigned to a chunk (linear probing or
// quadratic), but that results in longer probe lengths.  In particular,
// the cache locality wins of linear probing are not worth the increase
// in probe lengths (extra work and less branch predictability) in
// our experiments.
```

## A counter an erase can decrement {#f14-counter}

`outboundOverflowCount_` counts the keys that wanted this chunk and did not fit. An insert that
passes a full chunk increments it, and **an erase of such a key decrements it again**. Unlike
boost's bit it comes back down, so a table that churns at a fixed size does not degrade.
unordered_dense **5.0**'s index is built on that idea, and F14 got there first. (4.11.0 is robin
hood and has no counters at all.)

The two limits are in the comment. It **saturates at 254**, and once saturated it never moves again,
so a pathological table can pin a chunk permanently. And there is exactly **one counter per chunk**,
which knows nothing about the hash class, so any overflow at all sends every later miss into that
chunk on to the next.

## Value, Node, Vector {#f14-variants}

F14 ships three maps over one table. `F14ValueMap` is flat. `F14NodeMap` is node-based.
`F14VectorMap` keeps the values in a contiguous vector behind 4 byte indices, and as far as I know
it is, besides `ankerl::unordered_dense` and emhash8, the only mainstream dense map, so it is the
closest relative unordered_dense has. Its items are four bytes, so it gets the twelve-slot chunk,
with tags, counters and indices in exactly one cache line. It is measured in [the
measurements](#same-workloads) alongside the rest, and [what is still on the
table](#still-on-the-table) says what the comparison found.

## Good at, pays for

Good at: a tombstone-free erase, which in 2019 nobody else had; double hashing, which shortens
probe sequences under load; three container shapes over one table.

Pays for: one class-blind counter per chunk, and a saturation point it cannot come back from. The
table is also more elaborate than the others here, since the chunk carries capacity bookkeeping and
chunk 0 is special.

Two of F14's ideas were tried in unordered_dense 5.0 and neither survived, the single counter
and the double hashing. [The borrowed ideas](#borrowed) has both, with the numbers.

# 9. indivi: counters an erase can undo, and distance nibbles [&#8593; contents](#contents){:.up} {#indivi}

[indivi_collection](https://github.com/gaujay/indivi_collection) by Guillaume Aujay is where
unordered_dense 5.0's overflow counters come from, and it is also the least known map in this post.
Its `flat_umap` takes [F14](#f14)'s overflow counter one step further: one counter per hash class
instead of one per group.

## Layout: sixteen fragments, eight counters, sixteen nibbles

[![indivi's 32 byte metadata group: fragments, overflow counters and distance nibbles](/img/2026/hashmap-index/indivi-metagroup.svg)](/img/2026/hashmap-index/indivi-metagroup.svg)

```cpp
struct alignas(32) MetaGroup
{
  alignas(16) unsigned char hfrags[16] = {}; // 1-Byte hash fragments (0 means empty)
  unsigned char oflws[8] = {}; // 1-Byte dual overflow counters (modulo 8, i.e. n and n+8 entries)
  unsigned char dists[8] = {}; // 4-bits distance counters from original bucket (low/high, modulo 8)
};
```

Two bytes of metadata per slot, in three arrays that together are one 32 byte struct. The fragments
are a SwissTable group. The eight `oflws` are **one counter per hash class**: an insert that passes
a full group increments the counter for its own `hash & 7`, and an erase of that key decrements it
again. The sixteen four-bit `dists` record how far each slot's key is from its home group.

## One lookup, and a miss that stops on a counter

The probe is the SwissTable shape with `get_overflow(hash) == 0` where abseil has `MaskEmpty()`:

```cpp
unsigned char get_overflow(std::size_t hash) const noexcept {
    std::size_t pos = hash & 0x07;
    return oflws[pos];
}
void dec_overflow(std::size_t hash) noexcept {
    std::size_t pos = hash & 0x07;
    if (oflws[pos] != 255) { --oflws[pos]; }   // saturated counters never come back
}
```

On a churning table that is strictly better than boost's overflow byte, because a count can come
back down where a bit cannot. On a fresh table it is strictly better than F14's single counter,
because it knows the class. Like F14's it saturates, at 255, and indivi's own assertion message is
honest about what that means: *"Overflow counter saturated: tombstone will remain until rehash."*

Maximum load factor is 0.875, and the probe is the same triangular walk over groups as in boost,
abseil and unordered_dense 5.0. `gIndex = (gIndex + (++delta)) & mGMask` is boost's
`pos=(pos+step)&mask` line for line.

## Erase by iterator without a hash: the nibbles {#indivi-nibbles}

The distance nibbles are the second idea, and they aim at one specific operation. Given an iterator,
an ordinary open addressing map cannot erase without knowing where the key's home is, and the only
way to find that out is to hash the key again. With the distance stored, home is the current group
minus that many steps of the probe sequence, run backwards. So `erase(iterator)` needs no hash and
no key access at all, which for a `std::string` key saves a whole wyhash and a dependent load.

## Good at, pays for

Good at: the most information per slot of any flat map here (a fragment, a class counter's share,
and a distance), a tombstone-free erase that also knows the class, and an `erase(iterator)` that
costs no hash.

Pays for: two bytes per slot instead of one, plus the bookkeeping. An insert maintains counters and
distances, an erase undoes both.

unordered_dense 5.0's counters are indivi's. The distance nibbles were tried there and dropped, and
[the borrowed ideas](#borrowed) covers both.

The same author also ships a second map that throws all of this away, the counters, the distances
and the groups themselves, and it is faster on every lookup than this one. That is the next chapter.

# 10. indivi flat_wmap: the window that beats the group [&#8593; contents](#contents){:.up} {#flat-wmap}

The fastest map in this post on an integer hit is not a SwissTable, it does not group its slots, and
it comes from the same author as the map in the chapter before. `indivi::flat_wmap` is
`flat_umap`'s sibling, same repository, same file structure, same SSE2, with the groups taken out.
It beats `flat_umap` by 1.13 to 1.42x on lookups, which is the largest single index effect I found
in anyone else's code. The reason turned out to be a different one than the design advertises.

## Layout: one byte per slot, and a window rather than a group {#wmap-layout}

[![One metadata byte per slot, the sixteen-byte window read unaligned at the home slot, and the duplicated tail that makes it legal](/img/2026/hashmap-index/wmap-window.svg)](/img/2026/hashmap-index/wmap-window.svg)

One byte per slot, and that is all of the metadata: no counters, no distances, no second array. The
byte holds either a seven bit hash fragment or one of two markers, and the marker values are chosen
so that a *signed* compare separates them:

```cpp
static constexpr uint8_t EMPTY_FRAG{ 0x7F };     // 127
static constexpr uint8_t TOMBSTONE_FRAG{ 0x7E }; // 126
static constexpr uint8_t SETMAX_FRAG{ 0x7D };    // 125
```

Every occupied slot holds a fragment that is `< 126` as `int8_t`, and every free one holds either
126 or 127. So `match_available` is one `_mm_cmpgt_epi8` against 125, and `match_set` one
`_mm_cmplt_epi8` against 126. The fragment comes from the *low* byte of the hash through a 256 entry
table of pre-broadcast words, which is boost's trick and the one [the group index](#group-index)
also took. Here it does double duty, because the table is also what remaps a hash byte that would
collide with the two markers.

The home is a **slot**, not a group: `hash_position` is `hash >> shift`, the top bits, and the
sixteen bytes compared are the sixteen bytes *starting at that slot*, read with `_mm_loadu_si128`.
There is no alignment anywhere in the design. What makes that legal at the end of the array is the
same trick abseil uses for a different purpose. The metadata is over-allocated by sixteen bytes that
duplicate the first group, `newGCapa = newCapa + 16u`, so a window opened at the last slot is still
one load and still wraps to the right fragments.

## One lookup {#wmap-lookup}

```cpp
do {
  const uint8_t* group = &mGroups.data[index];   // index is the home *slot*
  auto hfrags = MetaWGroup::load_hfrags(group);  // _mm_loadu_si128
  int matchs = MetaWGroup::match_hfrag(hfrags, hash);
  if (matchs) {
    item_type* pValue = &mValues.data[index];
    INDIVI_PREFETCH(pValue);
    do {
      int idx = first_bit_index(matchs);
      size_type valIdx = (index + idx) & mGMask;
      if (equal()(key, get_key(mValues.data[valIdx]))) { return { mValues.data + valIdx, valIdx }; }
      matchs &= matchs - 1;
    } while (matchs);
  }
  if (MetaWGroup::match_empty(hfrags)) { return { nullptr, 0 }; }
  index = (index + (++delta) * 16) & mGMask;
} while (index <= mGMask);
```

Three things happen in that loop. First, the lane index is added to the *slot* rather than to a
group base, `valIdx = (index + idx) & mGMask`, so a match in lane 0 is the home slot itself and the
value array wraps where the metadata array duplicates. Second, the miss stops on an **empty**
fragment, so this is a tombstone design and pays what tombstone designs pay under churn. Third, the
probe steps by `(++delta) * 16`. That is still triangular, but in units of sixteen slots, so the
second window begins where the first one ended instead of at the next aligned group.

Placement mirrors that. `unchecked_insert` runs `match_available` on the same unaligned window and
puts the key in the **first free slot within sixteen of its home**, where a grouped map has to take
the first free slot in the one group its home falls in. That is the difference the design exists
for. It is measurable, and it is not where the speed comes from.

## Why it is faster, and it is not the window {#wmap-why}

The two siblings are the cleanest comparison I have in someone else's code: one author, one
repository, one set of intrinsics, groups present in one and absent in the other.

*Time relative to unordered_dense 5.0, lower is faster, bold marks the better of the two.*

|  | hit | miss | build | churn |
|---|---:|---:|---:|---:|
| `flat_umap`, grouped | 0.82 | 0.97 | **1.62** | **0.69** |
| `flat_wmap`, ungrouped | **0.71** | **0.83** | 1.86 | 0.93 |
{: .heat-par}

Faster on both lookup columns and slower on both columns that write. The obvious explanation for
that is the wrong one.

**The window is not it.** The intuitive story goes like this: slot-level placement gives a shorter
displacement distribution, because a key takes the first free slot within sixteen of its home where
a grouped map takes the first free slot in the group of sixteen its home falls in, and a *group*
being completely full is likelier than a sliding window having *no* free slot at all. That is true,
and it buys almost nothing. Simulated with the same keys at the same load, windows visited per
placement:

*Sixteen-slot windows visited per placement, lower is better, bold marks the better of the two.*

| load | bucketized | sliding |
|---:|---:|---:|
| 0.760 | 1.0318 | **1.0238** |
| 0.790 | 1.0436 | **1.0352** |
| 0.799 | 1.0481 | **1.0396** |

Slot-level placement removes about a fifth of an excess that is already under 5%. For calibration,
that is a quarter of what moving displaced entries home is worth in [the group index](#drift), and
that in turn buys about a tenth of a miss at every table size.

**What does cause it is instructions and metadata width.** One map per binary, all-hit lookups, the
grouped sibling against the ungrouped one:

*Per hit, one map per binary, lower is better, bold marks the better of each pair.*

| entries | `flat_umap` instructions | `flat_wmap` | `flat_umap` L1 misses | `flat_wmap` |
|---:|---:|---:|---:|---:|
| 1,000 | 53.3 | **47.3** | 0.876 | **0.378** |
| 50,000 | 54.6 | **48.3** | 3.744 | **3.297** |
| 1,000,000 | 72.6 | **64.4** | 4.733 | **3.856** |

Six fewer instructions per hit at every size, and fewer cache lines touched **even at a thousand
entries, where the whole map is in L1**. So this is not a footprint effect that only shows up once
the metadata array gets big. It comes from one byte of metadata per slot instead of two, and from
having no overflow counter to load on the way past. The alignment of the window is the most visible
difference between the two designs, and the least important one.

## Good at, pays for {#wmap-pays}

Good at: the fastest integer hit and miss measured here, at one byte of metadata per slot, which is
the leanest index in the post that still compares sixteen slots at once. Slot-level placement, so a
displaced key lands as close to home as any design here puts it.

Pays for: tombstones, and everything that follows from them. A miss that stops on an empty fragment
degrades under churn, and only a rehash repairs it. The build is slower than its grouped sibling's
at every size. And it has the widest load-factor sawtooth of anything in this post: at the 32,000
octave a hit swings 2.12x between the cheapest and the dearest point of the octave, where the group
designs swing 1.5 to 1.6x. So a number quoted for it at one size says less than it would for
anything else here.

## What it would cost the group index {#wmap-steal}

Comparing two people's maps cannot separate the window from everything else that differs between
them. So I built both layouts over one implementation: same value vector, hash, fingerprint
encoding, load factor, tombstones, growth, erase and SSE2 helpers, differing in the home unit and
the probe step and nothing else. One variant per binary, and both were cross-checked against
`std::unordered_map` before anything was timed.

**The window wins a lookup at the branch predictor rather than in the cache.** Per operation at
200,000 entries it retires one to three fewer instructions, takes three to four fewer cycles, and
mispredicts **16% less** on both a hit and a miss. It takes *more* L1 misses while doing so, because
an unaligned sixteen byte load straddles two cache lines where an aligned one does not. In time that
comes to 1 to 5% on a hit. Its miss looks better too, but only against this baseline. Neither
variant has overflow counters, since the ungrouped one has no group to hang them on, so both stop a
miss on an empty slot where [the shipped index](#group-index) stops on a counter at home. Where a
miss already stops at home the advantage evaporates: at a million entries the window is 2% *slower*
on one.

**And it loses churn, for a reason that carries over to other maps.** At a million entries the
window ends a churn run with one extra doubling and 24% slower churn, because **15.8% of its
placements reuse a tombstone against the grouped variant's 33.8%**. Transplanting only that property
confirms it. Give the *grouped* variant a per-key starting lane instead of always taking the lowest
one, change nothing else, and its recycling falls to 16.3% while its slot count doubles, landing on
the window's numbers exactly.

**That is the reverse of what intuition says.** Spreading the preferred lane destroys recycling
instead of relieving contention, so contending on one lane is the *feature*. A tombstone appears
wherever a key was, so if every key prefers lane 0 then lane 0 is where the tombstones are, and the
next placement lands on one instead of consuming a fresh slot. That applies to [abseil](#swisstable)
and [emilib](#emilib), which both take the lowest lane and should keep doing so, and it is why a
window cannot recycle well, since its first lane is the home slot by construction. The group index
is untouched by it, because it has no tombstones to recycle and compares all sixteen lanes at once,
so lane position cannot reach a lookup at all.

**So: no.** A sliding window means no per-group counters, because there is no group to hang them on.
No counters means the miss stops on an empty slot, and that means tombstones, which is the property
[churn](#same-workloads) exists to protect. It also means giving up the merged 88 byte block, since
sixteen fingerprints starting at an arbitrary slot are not contiguous in it, and that block is worth
7% of a lookup's instructions and 28% of its dTLB misses at four million entries. A few percent of a
hit does not pay for that.

# 11. The group index: unordered_dense 5.0 [&#8593; contents](#contents){:.up} {#group-index}

This is what replaced [robin hood](#robin-hood) in my own map in 5.0. I know this design best,
because I built it by measuring every alternative I could think of and keeping whatever won. Most of
this chapter is those alternatives. Two things are deliberately elsewhere: the ideas it took from
the other maps have [a chapter of their own](#borrowed), and [how it grows, what the compilers make
of it and which hash it is handed](#building) is not about the index at all.

## Layout: an 88 byte block

[![The 88 byte block to byte scale, then its 16 fingerprints, 8 counters and 16 value indices, and the values vector](/img/2026/hashmap-index/group-block.svg)](/img/2026/hashmap-index/group-block.svg)

```cpp
template <typename ValueIdx>
struct basic_group {
    using value_idx_type = ValueIdx;
    std::array<std::uint8_t, 16> m_fingerprints; // one per slot; 0 is an empty slot
    std::array<std::uint8_t, 8> m_overflows;     // how many entries with (fingerprint & 7) == i probed past this group
};

struct block : Group {
    std::array<value_idx_type, slots> m_index;
};
```

Sixteen fingerprints, eight overflow counters, sixteen value indices: 88 bytes per sixteen slots,
**5.5 bytes per slot**, in one allocation. The group comes from the top bits of the hash and the
fingerprint from the low byte, so the two are independent. Zero means empty, and a hash whose low
byte is zero is remapped to 8. That keeps the low three bits, which are the counter class,
unchanged. The remap is boost's, and so is the way it is done:

```cpp
[[nodiscard]] constexpr auto make_fingerprint_words() -> std::array<std::uint32_t, 256> {
    auto t = std::array<std::uint32_t, 256>{};
    for (std::uint32_t i = 0; i < 256; ++i) {
        t[i] = (i == 0 ? 8U : i) * 0x01010101U;
    }
    return t;
}
```

The fingerprint is stored pre-broadcast into all four bytes of a `uint32_t`. The SSE2 compare then
needs a `movd` and a `pshufd` rather than a real byte broadcast, and building the word is one L1
load instead of five instructions. That sits on the critical path of every probe, every placement
and every erase.

## One lookup

```cpp
auto const word = fingerprint_word(mh);
auto const counter = word & 7U;
auto group_idx = group_idx_from_hash(mh);
auto const* groups = m_buckets.data();
value_idx_type delta = 0;
while (true) {
    prefetch_index(groups, group_idx);
    auto const& group = groups[group_idx];
    auto lanes = match_fingerprint(group, word);
    while (lanes != 0) {
        auto const lane = first_lane(lanes);
        auto const slot = static_cast<value_idx_type>(std::size_t{group_idx} * slots_per_group + lane);
        auto const value_idx = group.m_index[lane];
        if (m_equal(key, get_key(m_values[value_idx]))) {
            return {slot, value_idx, true};
        }
        lanes &= lanes - 1;
    }
    // Not here if nothing of this class ever overflowed past this group, and not anywhere
    // once every group has been looked at: see the miss bound below.
    if (group.m_overflows[counter] == 0 || delta == m_group_mask) {
        return {0, 0, false};
    }
    group_idx = next_group(group_idx, delta);
}
```

That is SwissTable's shape again, with three differences. The value index replaces the key in the
slot, so a hit costs one more dependent load. The miss test is a per-class counter. And the probe
has a termination bound, which [boost](#boost) has had all along and unordered_dense did not.

`match_fingerprint` has three backends. [SSE2](https://en.wikipedia.org/wiki/SSE2) is
`_mm_cmpeq_epi8` and `_mm_movemask_epi8`, sixteen lanes into sixteen bits. NEON has no movemask. The
cheap stand-in, a compare followed by a narrowing shift, puts the sixteen answers one nibble apart
in a 64 bit word, so the mask type and a lane stride are named once and `first_lane()` divides by
the stride. Testing a mask, taking the lowest lane and clearing it with `m & (m - 1)` are then
written once for all three backends. The fallback is [SWAR](https://en.wikipedia.org/wiki/SWAR),
eight bytes at a time:

```cpp
[[nodiscard]] static auto match_zero_bytes(std::uint64_t x) -> unsigned {
    static constexpr auto lows = UINT64_C(0x7F7F7F7F7F7F7F7F);
    static constexpr auto highs = UINT64_C(0x8080808080808080);
    auto const zeros = ~(((x & lows) + lows) | x) & highs;
    return static_cast<unsigned>(((zeros >> 7U) * UINT64_C(0x0102040810204080)) >> 56U);
}
```

The more familiar `(x - ones) & ~x & highs` is two operations shorter, and wrong here. A zero byte
borrows from the next one, so a `0x01` sitting above a `0x00` is marked as a match as well. For a
probe that is harmless, since every candidate is verified against the key. For the empty slot an
insert picks it is not harmless at all. The multiply gathers the eight high bits into eight adjacent
ones.

Adding NEON was worth a lot on ARM, and for the opposite of the usual reason. On a Neoverse N2 the
SWAR backend was **behind** 4.11.0's *scalar* probe on every lookup. Word-at-a-time was replacing a
robin hood probe that was never vectorised there either, so it lost nothing and gained nothing. With
`vceqq_u8` the same runner reads 1.48x of 4.11.0 on hits and 1.62x on misses. So the vector compare
is where the group design's gain comes from, rather than an optimization on top of it.

## Eight counters, by fingerprint class {#counters-by-class}

An insert that finds its home group full increments the counter for its own class in every full
group it passes, and an erase decrements the same ones. A miss stops at the first group whose
counter for its class is zero. That is indivi's idea with F14's erase-decrement, and it leaves one
question open: how wide should a counter be? One shared counter per group, eight bytes, sixteen
nibbles, thirty-two two-bit counters, or an exact one. All five were built and measured, in
[the borrowed ideas](#borrowed). The short version is that a byte per class is the point where the
counter is still a single aligned load and already knows the class. Also, about 80% of what it fails
to filter is **siblings**: keys whose home *is* this group and which genuinely did not fit, so they
walk the same sequence a later miss walks. An exact counter has to follow those as well.

## The miss bound, and eight keys that hang a map without one {#miss-bound}

A miss that stops on a counter has a failure mode that a miss stopping on an empty slot does not.
Every counter on the sequence can be nonzero, and then nothing ever tells the probe to stop. Eight
chosen keys are enough to make `contains()` on an absent key loop forever. Fill a group, send one
key of class 1 past it, then erase the fillers, so the passer stays and the counter it incremented
stays with it. Repeat that for every group. Any hash the caller controls reaches that state, and so
does the default hash with keys chosen for it.

So the probe needs a second exit, one that does not depend on the counters being informative:
`|| delta == m_group_mask`. A key that exists was placed within one cycle of its probe sequence, so
a walk that has seen every group can stop. [Boost](#boost)'s prober has always had this,
`return step<=mask`, and until the review before release unordered_dense did not. The argument for
leaving it out was that an exact counter puts a zero right after the furthest entry of its class.
That argument is wrong, because a counter counts entries that overflowed past its group on *their*
probe sequences, not on the one being walked. `indivi::flat_umap`, where the counters came from, had
the same hole. It was [reported](https://github.com/gaujay/indivi_collection/issues/2) and fixed the
same day. The bound itself is free: on a 200,000 entry table, 83.6 to 82.7 instructions on a hit and
69.5 to 67.6 on a miss, with cycles and mispredictions unchanged.

The bound has one side effect, and it is a trade rather than a free lunch. A bug in the erase's
counter decrement used to hang the test suite loudly, and now it only makes the table slower.
Against a hostile hash that is the right way round, for a test suite it is the wrong one. So
unordered_dense now has a test that measures how much *longer* a miss probes instead of checking
what it answers.

## Erase: decrement, do not tombstone {#group-erase}

An erase clears the fingerprint and walks the same sequence from home to the group the entry was
found in, decrementing each counter. Then, because the values are dense, it moves `m_values.back()`
into the hole. That means finding the slot that points at the moved element, and that means hashing
the moved key again and running a second probe.

That sounds expensive, and for an integer key it is free. Measured at a million entries, an erase
plus an insert against a sequence with the same two cold probes and no move at all:

*Time per erase-and-insert.*

|  | with the move | without |
|---|---:|---:|
| `uint64_t` keys | 57.0 ns | 56.2 ns |
| `std::string` keys | 410.4 ns | 377.7 ns |

Three things make it free for an integer. The moved element is always the back of the vector, which
in a churn loop is the same few cache lines and stays hot. `do_erase` prefetches it first, so that
load runs under the counter walk. And an integer hash is one multiply, so the group access it
produces issues early enough to overlap. For a string it costs about 50 ns, because wyhash over 8 to
135 bytes behind a heap pointer is a dependent load and then a long chain, and none of it overlaps.

The fix for the string case would be a slot back-pointer per value, which is indivi's distance
nibbles taken to their conclusion. It is [measured and rejected in the borrowed
ideas](#borrowed): a tenth faster exactly where the hash is expensive, and a loss everywhere the
vector grows.

## Drift, and moving home {#drift}

Because nothing moves after it is placed, an entry that landed away from home while its home group
was full **stays there after the home empties again**. So a long-churned table probes further than a
freshly built one with the same contents. Below are groups visited per lookup, counted inside the
probe, on a reserved table churned 200 times through. Each round erases a uniformly random live key
and inserts one the map has never held, so the size stays constant.

*Groups visited per lookup, lower is better; bold is the best in each row.*

|  | fresh | churned | + one writing hit per round | + four |
|---|---:|---:|---:|---:|
| **per hit** |  |  |  |  |
| load 0.760 | 1.031 | 1.036 | 1.023 | **1.014** |
| load 0.799 | 1.039 | 1.066 | 1.044 | **1.028** |
| **per miss** |  |  |  |  |
| load 0.760 | 1.052 | 1.061 | 1.036 | **1.025** |
| load 0.799 | 1.086 | 1.122 | 1.081 | **1.052** |

The drift is real, and it saturates rather than growing: 5, 20, 100 and 400 turnovers give 1.039,
1.036, 1.035 and 1.035 per hit at load 0.76. At the fullest point of the sawtooth it is worth about
0.036 groups on a miss, and at the emptiest almost nothing.

That is the honest difference from a tombstone design: real, and small. Repairing it eagerly was
measured too. On every erase, look one group along for an entry whose home is the freed slot's
group. That costs 20 ns per erase to buy half a nanosecond per lookup, because at this load *some*
counter of the freed group is nonzero on 46% of erases, and each of those has to hash two or three
candidate keys to find out. **The lazy version is the one that is kept.** The entry a hit just found
is the one candidate whose home is already known without another hash, since the probe computed it,
and whether that home has room is one `match_empty` on a group the probe just visited. So
`move_home` runs on every hit inside a path that already writes (`try_emplace`, `operator[]`,
`insert`, `emplace`, `insert_or_assign`) and nowhere else. It is deliberately not in `find()`, const
or not: callers treat a non-const `find` on a shared map as read-only, and writing there would make
it a data race.

The two right-hand columns of the table are what `move_home` does, and they say more than "it takes
the drift back". With four writing hits per round the churned table probes **better than a fresh
one**: 1.014 groups per hit against 1.031, and 1.025 per miss against 1.052, at load 0.76. So
`move_home` does not only undo the displacement that churn caused, it also keeps pulling in entries
that the original build had left away from home. A table that is *used* ends up more compact than
one that was only built. It converges rather than plateauing, because every displaced entry that is
touched again goes home.

The drift `move_home` takes back is so small that I doubted the whole thing was worth anything, so
it had to be timed. One map per binary, the same header with `move_home` turned into a no-op beside
it, a table at load 0.80 churned through and then timed on its own. The control column is the one to
read first: with no writing lookups `move_home` never fires, so the two binaries have to measure the
same. They read 1.052, 1.002 and 1.003, so the two larger sizes are clean and the smallest one
carries some code layout that has to be subtracted.

*Time with `move_home` relative to time without it, lower is faster, the same convention as every other ratio in this post. Bold is the best in each row.*

| entries | control, no writing hits | on misses, one writing hit per round | on hits | on the churn round |
|---|---:|---:|---:|---|
| 52,363 (in L2) | 1.052 | **0.903** | 0.961 | 0.988 |
| 838,860 (L3) | 1.002 | **0.908** | 0.997 | -- |
| 3,355,443 (past L3) | 1.003 | **0.910** | 1.009 | -- |
{: .heat-par}

So it is worth **about a tenth of a miss, at every size**, nothing on a hit, and nothing on the
writing path that earns it. I expected the gain to fade out of cache, since one step of displacement
lands in the adjacent block and the prefetcher already has that. It does not fade.

The performance counters say why, and the extra group visit is not the reason. Per lookup at 52,363
entries, from the same two binaries: with no writing hits, **27.59 cycles and 0.2118 branch misses
against 27.52 and 0.2116**, identical as the control demands. With one writing hit per round it is
**25.58 and 0.1591 against 28.93 and 0.2177**, on instruction counts that barely move. A quarter of
the branch misses go, on 0.04 fewer groups per miss. **Most of what drift costs is the
stop-or-continue branch becoming unpredictable**, and a branch does not get cheaper because the
table left the cache.

Unfortunately none of that helps everybody. `move_home` runs only on a hit inside a path that
writes, so a program that only reads gets exactly nothing, and the control column *is* that program.
The gain is also entirely on misses. So it pays for one shape of program: one that churns a map at a
fixed size, writes to it by key, and asks it about keys that are not there. That shape is real, and
none of the workloads in my benchmark suite has it, which is why the suite reads exactly level on
this change and always will.

## Where the indices live: one array or two {#one-array-or-two}

The value indices used to be a second array beside the groups. A comment in the header recorded that
the split had been tried against a merged block years ago and was 10% faster on a build. That
verdict came from a regime that no longer describes where the cost is, so it was re-tested: one 88
byte block, `struct block : Group` so every existing use of the metadata reads unchanged, no
padding, the same bytes in one allocation instead of two.

Memory is unchanged to the byte. The suite moves 1.5-2.2% and its finds 4.4-5.3%. The counters say
more here than the suite does: one map per binary, all-hits lookups at 200,000, 800,000 and 4M
entries, split against merged. Merged executes **7% fewer instructions** (66.9 to 62.0 per lookup),
because the index is at a fixed offset from the group rather than a second address to compute. It
also has **12-14% fewer L1 misses** and **28% fewer dTLB misses at 4M** (5.30 to 3.79), because a
lookup touches two regions rather than three.

One other layout question on the same axis came out a tie. Splitting the fingerprints and the
counters into *two* arrays makes four groups' fingerprints fit a cache line exactly, where a 24 byte
group straddles one time in four. It reads the same in cache and on a 20M entry table whose index is
37 MB (57.1 against 57.0 ns per hit). The straddle is free because the second line is the adjacent
one, and the counter line is free because its address depends only on the group, so it issues beside
the fingerprint load rather than after it.

## Good at, pays for

Good at: no tombstones and a counter that comes back down, so a table that churns at a fixed size
degrades by 1 to 3% in probe length and then stops. The dense value vector, so iteration is an array
walk and a 64 byte value costs the vector rather than the table. 5.5 bytes of metadata per slot. And
a bound that makes a hostile hash slow rather than endless.

Pays for: one more dependent load on every hit than a flat map, which is the family cost and does
not go away. A value vector that doubles on its own cadence, whose overhang is most of what
unordered_dense costs in memory against a flat map at an eight byte value. And an erase that hashes
the moved element's key, which is free for an integer and about 50 ns for a string.

# 12. Chains instead of probes: emhash8 and Verstable [&#8593; contents](#contents){:.up} {#chains}

Two designs answer "absent?" without a probe sequence at all. They thread a **chain** through the
metadata, so a lookup only visits keys that belong to its own bucket, and a miss ends where the
chain does. One is C++ and dense, the other is C and flat. They arrive at the same cost from
opposite directions.

## emhash8: chaining through the index, and a fingerprint for free {#emhash8}

[emhash](https://github.com/ktprime/emhash) is a family of maps by ktprime; `emhash8::HashMap` is
the dense one. It uses coalesced chaining, and it is fast.

### Layout: {next, slot} per bucket, values packed in a vector

[![emhash8's index: a next pointer and a slot word, and the chain they thread](/img/2026/hashmap-index/emhash8-index.svg)](/img/2026/hashmap-index/emhash8-index.svg)

```cpp
struct Index {
    size_type next;
    size_type slot;
};
```

Eight bytes per bucket, no key and no fingerprint byte, plus a dense `_pairs` vector for the values,
exactly like unordered_dense's. `next` is the bucket where this bucket's chain continues, and `slot`
is where the value is.

Every key whose home is bucket *b* is on one list starting at *b*. Say a key arrives and finds its
home occupied by a **stranger**, a key whose own home is elsewhere. Then it evicts the stranger to
another bucket and takes the head for itself, so a chain always starts at its own home. That is
[coalesced hashing](https://en.wikipedia.org/wiki/Coalesced_hashing) with main-bucket kickout, and a
lookup then walks only keys that share its home, never a stranger's.

### The trick: hash bits above the mask

```cpp
#define EMH_EQHASH(n, key_hash) ((static_cast<size_type>(key_hash) & ~_mask) == (_index[n].slot & ~_mask))
#define EMH_NEW(key, val, bucket, key_hash) \
    new (_pairs + _num_filled) value_type(key, val); \
    _etail = bucket; \
    _index[bucket] = {bucket, _num_filled++ | (static_cast<size_type>(key_hash) & ~_mask)}
```

The `slot` word has to be big enough to index the values, and the table has fewer slots than the
word can hold. So **everything above `log2(bucket count)` is spare and gets filled with hash bits**.
That fingerprint costs no memory and no extra load, since the word is on the critical path anyway.
It also gets *wider the smaller the table is*, which is the right direction: a small table has more
spare bits, and a large one needs fewer of them to be discriminating.
[CPython's compact dict](https://mail.python.org/pipermail/python-dev/2012-December/123028.html)
stores its indices in 1, 2, 4 or 8 bytes for the same reason, coming from the other end.

### One lookup

```cpp
const auto bucket = size_type(key_hash & _mask);
const auto& idx = _index[bucket];
auto next_bucket = idx.next;
if (static_cast<int>(next_bucket) < 0) return _num_filled;   // empty bucket: absent

const auto slot = idx.slot & _mask;
prefetch_read(reinterpret_cast<char*>(&_pairs[slot]));
if (EMH_EQHASH(bucket, key_hash)) {
    if (EMH_LIKELY(_eq(key, _pairs[slot].first))) return slot;
}
if (next_bucket == bucket) return _num_filled;               // chain of one: absent

while (true) {
    if (EMH_EQHASH(next_bucket, key_hash)) { ... }
    const auto nbucket = _index[next_bucket].next;
    if (nbucket == next_bucket) return _num_filled;          // end of chain: absent
    next_bucket = nbucket;
}
```

The answer to "absent?" is **the end of the chain**. The chain holds only keys that belong to this
bucket, so it stays short, and most buckets have no chain at all. There is no probe sequence in the
usual sense, and no group compare anywhere.

### Good at, pays for

Good at: a dense value vector, so iteration is an array walk and a large value only costs the
vector. The free fingerprint. Short chains, because a chain holds only keys that share a home.

Pays for: **branches**. Every step of the loop is a data-dependent branch, and so is the question
whether there is a chain at all. That is fine when the answer is nearly always no. It is also why
emhash8's misses are its weakest column in [the measurements](#same-workloads), and
[the counters](#counters) show the mechanism: a miss has to reach the end of the chain, and whether
there is one is exactly the unpredictable question. The eviction machinery also means an insert can
move an existing key, which the group designs never do.

The free fingerprint was tried in unordered_dense 5.0 and lost. [The borrowed ideas](#borrowed) say
why.

## Verstable: a 16 bit word with a chain in it {#verstable}

[Verstable](https://github.com/JacksonAllan/Verstable) by Jackson Allan is a C library that I have
not seen in a single benchmark round-up, which is a pity. It compiles as C++ unchanged, so it went
into the same binary as everything else. It packs everything into two bytes per bucket:

```c
#define VT_EMPTY               0x0000
#define VT_HASH_FRAG_MASK      0xF000 // 0b1111000000000000.
#define VT_IN_HOME_BUCKET_MASK 0x0800 // 0b0000100000000000.
#define VT_DISPLACEMENT_MASK   0x07FF // 0b0000011111111111, also denotes the displacement limit.
```

[![Verstable's two metadata bytes, to bit scale: a 4 bit fragment, an in-home bit and an 11 bit displacement, and the chain they thread](/img/2026/hashmap-index/verstable-word.svg)](/img/2026/hashmap-index/verstable-word.svg)

Four bits of hash fragment are taken from the *top* of the hash, because the bucket comes from the
bottom. That is the same independence every design here arranges in some way. One bit says "the key
sitting here belongs here". Eleven bits hold the quadratic displacement to the next key in *this
bucket's* chain.

So every key homed at a bucket sits on one linked list, threaded through otherwise unused buckets,
and a lookup visits *only* buckets holding keys that belong to it. Key and value are inline in a
flat bucket array, both arrays out of one `malloc`, maximum load 0.9, and tombstone-free. An insert
evicts at most one key to keep the invariant that a chain starts at its home.

The in-home bit is my favourite idea in this post, because it gives the **exact** answer to
"absent?". Either a key that belongs here is here, or none is, and there is nothing approximate
about it. Every counter design above is only a hint in comparison. I measured it as an alternative
in [the borrowed ideas](#borrowed), where it is worth 2 to 3% in cache and nothing out of it. What
an approximate counter gets wrong is mostly keys that really do belong to the group it is guarding,
and an exact test has to follow those too.

**What it costs is branches.** One map per binary, 30M lookups at 50,000 entries, from
[the counter table](#counters):

*Per miss at 50,000 entries. Lower is better, bold is the best in each column.*

|  | instructions | cycles | branch misses | L1 misses |
|---|---:|---:|---:|---:|
| miss, group index | 57.2 | 20.7 | **0.108** | 3.41 |
| miss, boost | 54.2 | **20.4** | 0.164 | **1.90** |
| miss, Verstable | **44.6** | 40.8 | 0.806 | 1.96 |
{: .heat-low}

A Verstable miss executes **22% fewer instructions than a group probe and takes twice the cycles**.
The design delivers what it advertises, fewest instructions and fewest cache lines touched, and then
hands all of it back at the branch predictor. "Is my home bucket a chain head, and how long is the
chain" is a data-dependent decision on every lookup, where a group compare is not. At load 0.9 about
59% of misses land on a chain head and have to walk it.

Its weakest column is the build, for a related reason. A rehash re-runs the whole insert for every
key, and an occupied home bucket calls `evict`, which re-hashes the occupant and walks *its* chain.
Growth costs it 143 instructions and 79 cycles per element against unordered_dense's 44 and 12, at
2.398 branch misses per element against 0.132.

Memory is where it does well. 18 bytes per slot at a 0.9 maximum load puts it next to abseil and
emilib at the lean end of [the memory table](#memory), ahead of boost and every dense map.

# 13. The plain SwissTables: emilib and ihtab [&#8593; contents](#contents){:.up} {#plain}

Two implementations of the standard design, with fewer moving parts than anything else in the post.
A clean version of the standard design is the baseline every trick above has to beat, which is why
they are here. Also, one of them is dense in a way that shows what being dense does and does not
buy.

## emilib: a state byte per slot {#emilib}

`emilib::HashMap` (shipped in the same repository as emhash) is SwissTable with fewer tricks.

[![emilib's state byte array and its slots](/img/2026/hashmap-index/emilib-state.svg)](/img/2026/hashmap-index/emilib-state.svg)

```cpp
enum State : int8_t {
    EEMPTY = -128,
    EDELETE = EEMPTY + 1,
    EFILLED = EDELETE + 1,
    ESENTINEL = 127,
};
```

One state byte per slot: empty, deleted, and 253 fingerprint values above them. A flat slot array.
Two things distinguish it. First, the home slot is **rounded down to a multiple of the group size**:

```cpp
main_bucket -= main_bucket % simd_bytes;
```

So a compare is always an aligned group and a probe never straddles two of them, which is what
emilib buys with the alignment that abseil spends on cloned bytes. Second, the fingerprint is
`key_hash % 253 + EFILLED`, a real modulo rather than a bit slice, which costs a multiply per lookup
but uses every value between the two markers.

It has tombstones, so it degrades under churn like SwissTable does. Nothing here transferred into
the group index, and that is not a criticism. It is a clean, small and readable implementation of
the standard design, and in [the measurements](#same-workloads) it lands in the middle of the field,
which is where a clean implementation of the standard design should land.

## ihtab: eight slots at half load {#ihtab}

[ihtab](https://github.com/vnmakarov/ihtab) by Vladimir Makarov is the other C library here, also
absent from every round-up and also compiled as C++ unchanged. It is an eight slot SSE group, and
unusually it is a **dense** map like unordered_dense: elements are appended to an `els` array in
insertion order, and the group holds indices into it.

[![ihtab's group: 8 tags, 8 indices, and an element array that is never compacted](/img/2026/hashmap-index/ihtab-group.svg)](/img/2026/hashmap-index/ihtab-group.svg)

```c
static constexpr unsigned int GROUP_SIZE = 8;
static constexpr size_t GROUP_BYTES = GROUP_SIZE * (1 + sizeof(ind_t));
static constexpr unsigned char EMPTY_H7 = 0xc0;
static constexpr unsigned char DELETED_H7 = 0x80;
static constexpr unsigned int LF_FACTOR = 1;
static constexpr unsigned int LF_DIVISOR = 2;
```

Forty bytes per eight slots: eight tags, then eight `uint32_t` indices, all in one block. That is
the same merged layout [the group index](#group-index) arrived at, at half the width. `EMPTY_H7` is
`0xc0` and `DELETED_H7` is `0x80`, chosen so that both have the top *two* bits set and `match_empty`
is one `movemask(g & (g << 1))`. Probing is linear over groups.

It is quick, and the reason is on the label. `LF_FACTOR / LF_DIVISOR` is **one half**, so a lookup
almost always lands in its home group and the tag compare is the whole probe. Buying probe length
with memory is available to every design in this post and is not an idea about the index. It is the
same axis [the two-bit counter](#counter-width) sat on, filtering best when fresh. It is also a
choice that works: ihtab builds faster at the 32,000 octave than every map here except
unordered_dense, and its integer miss is among the three quickest in [the counter table](#counters).
Half the load factor is a blunt instrument and not a *cheap* one, but it is not a naive one either.

The element array is never compacted. Erased elements are marked in a `deleted` bitmap and
`els_bound` only grows, so a table that churns rebuilds itself periodically instead of filling a
hole. That has two measurable consequences, and both are in [the measurements](#same-workloads).
First, memory across a turnover goes from 36.1 to **72.3** bytes per entry and stays there, because
the table carries one dead element for every live one until it rebuilds. Second, it is the one dense
map here that does *not* get the dense map's iteration: an iterator has to consult the deleted bit
for every element, and that branch stops the loop from vectorising, so it iterates at 7.3x
unordered_dense 5.0 rather than at 1.0. Being dense buys the fast iteration only when the array
holds live entries and nothing else.

## ixhtab, and the bug that a constant-size churn finds {#ixhtab}

`ixht::ixhtab` puts extendible hashing on top: a directory of bins, each one an `ihtab` with sixteen
bit indices, split once a bin fills. On the churn workload it behaved differently from everything
else, and the reason turned out to be a bug:

```c
if (2 * els_num >= indexes_size)  // ixhtab.hpp:290
```

`els_num` is the **whole table's** live count, while `indexes_size` is **one bin's** index size. For
any table bigger than a single bin that comparison is always true, so the code splits instead of
compacting in place. A deleted slot is never reclaimed, so a bin fills its element array from
tombstones alone, however few of its elements are live. Each bin then splits about once per
turnover, each split halves the live occupancy of both halves, and nothing merges back. At a
constant 50,000 live elements over 40 turnovers the heap goes from **1.4 MB to 44.8 MB**, 29.5 to
938.9 bytes per element and still doubling, and a hit goes from 8.2 ns to 17-30. `ihtab::rebuild()`
has the same-shaped test and is correct there, because both quantities describe the same single
table.

I reported it as [vnmakarov/ihtab#2](https://github.com/vnmakarov/ihtab/issues/2) with a reproducer.
The transferable part is the test rather than the bug: **a workload that holds the element count
exactly constant while churning is the only one that can see this class of fault**, and most hash
map benchmarks do not have such a workload.

# 14. The summary table [&#8593; contents](#contents){:.up} {#summary-table}

Everything above, in two tables. The first one is what the index *is*, the second one is how it
behaves. The bold cell in each row is the choice that makes that design what it is.

**What the metadata is**

| map | keys live | metadata per slot | compared at once | fingerprint | empty / deleted |
|---|---|---:|---|---|---|
| unordered_dense 4.11.0 | dense | 8 B | 1, or 4 with SSE2 | 8 bits, low byte | **distance 0 / none** |
| unordered_dense 5.0 | dense | 5.5 B | 16 | 8 bits, low byte | 0 / **none** |
| abseil `flat_hash_map` | flat | **1 B** | 16 | 7 bits, top | −128 / −2 |
| boost `unordered_flat_map` | flat | 1.07 B | 15 | ~8 bits (2..255), low byte | 0 / **none** |
| folly F14 | flat, dense or node | 1.14 B | 14 | 8 bits, top | 0 / **none** |
| emhash8 | dense | 8 B | 1 | **the spare high bits of the index word** | `next < 0` / none |
| emilib | flat | 1 B | 16 | hash mod 253 | −128 / −127 |
| indivi `flat_umap` | flat | **2 B** | 16 | 8 bits | 0 / none |
| indivi `flat_wmap` | flat | 1 B | **16, unaligned from the home slot** | 7 bits | 0x7F / 0x7E |
| Verstable | flat | 2 B | 1 | **4 bits, top** | 0 / none |
| ihtab | dense | 5 B | 8 | 7 bits, top | 0xc0 / 0x80 |
| `std::unordered_map` | node | 8 B (a pointer) | 1 | **none** | null / none |
| boost / abseil / F14 node | node | as the flat sibling | as the flat sibling | as the flat sibling | as the flat sibling |

**How it behaves**

| map | probe | a miss stops on | tombstones | moves after placement | max load | bounded on a hostile hash |
|---|---|---|---|---|---:|---|
| unordered_dense 4.11.0 | linear | **the distance ordering** | no | **shifts on insert and erase** | 0.80 | yes |
| unordered_dense 5.0 | triangular over groups | a per-class overflow counter | no | **only a hit inside a write, to its own home** | 0.80 | yes |
| abseil `flat_hash_map` | triangular over groups | an empty byte in the group | **yes** | no | 0.875 | yes |
| boost `unordered_flat_map` | triangular over groups | **an overflow bit for its hash class** | no | no | 0.875 | yes |
| folly F14 | **double hashing** | an outbound counter of zero | no | no | 0.857 | yes |
| emhash8 | **coalesced chain** | the end of the chain | no | **evicts a stranger from its home** | 0.80 | yes |
| emilib | linear over aligned groups | an empty byte in the group | **yes** | no | 0.833 | yes |
| indivi `flat_umap` | triangular over groups | **a per-class overflow counter** | no | no | 0.875 | since 2026-09 |
| indivi `flat_wmap` | triangular in steps of 16 slots, from the home slot | an empty byte in the window | **yes** | no | 0.80 | not checked |
| Verstable | quadratic chain | **an exact in-home-bucket bit** | no | evicts at most one key | **0.90** | yes |
| ihtab | linear over groups | an empty tag in the group | **yes** | no | **0.50** | yes |
| `std::unordered_map` | **a linked list per bucket** | the end of the list | n/a | no | 1.0 | yes |

Three ways to read those tables.

**Down the "a miss stops on" column** is the last decade of hash map work. An empty slot is the
classic answer, and it is what forces tombstones. Everything else in that column is an attempt to
answer the question without needing an empty slot: an ordering (2018), an overflow bit (2022), a
counter that an erase can undo (2019, and again in 2024 with the class split), an exact bit (2023).
The designs with **no** in the tombstone column are exactly the designs with something other than
"empty" in the miss column. That is no coincidence, it is the same choice written twice.

**Down "metadata per slot"** is the memory the index costs before any key is stored. One byte is the
SwissTable floor, boost gets fifteen slots out of sixteen bytes, and indivi spends two bytes to hold
three separate things. The dense maps look expensive here at 5.5 or 8 bytes, but this is the only
place where they pay for the value's location. A flat map pays for the same thing by keeping
`sizeof(value_type)` of empty slot. [The memory table](#memory) measures what it actually costs per
live entry: at an eight byte value this column is roughly the answer, and at a large one it is
turned on its head.

**Down "compared at once"** is what the branch predictor sees, and it explains more of the
measurements than anything else in either table. A design that asks one question of sixteen slots
has one unpredictable branch per group. A design that asks a question per slot, or walks a chain,
has one per element visited. Verstable executes 22% fewer instructions per miss than the group index
and takes twice as many cycles, entirely for this reason.

## What one lookup touches {#what-one-lookup-touches}

The tables above are static. The picture below draws the same information as the *chain* a hit waits
on. The hash is arithmetic, and every box after it is a load whose address the box before it
produced, so none of them can start early. One of those loads is cheaper than the others and is
marked amber: in the group index and in ihtab the value index lives inside the same block the
fingerprints came from, so by the time it is needed it is usually already in cache. Every other load
in the picture goes to a different region and pays for it.

[![The chain of loads a hit waits on, per design, grouped by family](/img/2026/hashmap-index/lookup-touches.svg)](/img/2026/hashmap-index/lookup-touches.svg)

**A flat map waits for two loads and a dense one for three**, and that third box is [the family
cost](#three-families). No amount of index cleverness recovers it, because it is what the dense
layout *is*. What varies is how much it costs. The amber box is usually already in cache in the
group index and in ihtab, while F14Vector's index is a separate array and pays in full.

**Two designs get out of it by not having a separate index at all.** unordered_dense 4.11.0's bucket
word holds the distance, the fingerprint and the index together, and emhash8's index word holds the
chain link and the index. So both are dense and still wait for only two loads. They pay for that
elsewhere: eight bytes per slot for one, and a chain to walk for the other.

**Also, boxes at the same depth are not the same cost.** A group compare is one `movdqu`, one
`pcmpeqb` and one `pmovmskb`, producing sixteen verdicts and a single branch. A chain step is a load
plus a branch the predictor has to guess. That is why the designs marked "+1 per chain step" lose
even where the chain is short, and why at load 0.9 about 59% of Verstable's misses land on a chain
head.

# 15. The same workloads on every map [&#8593; contents](#contents){:.up} {#same-workloads}

Eighteen maps for an integer key and sixteen for a string, seven workloads, three key and value
shapes, all in one process with the alternatives interleaved. The two that drop out for strings are
Verstable and ihtab, both C libraries whose buckets are `malloc`ed and never constructed, so a key
has to be trivially copyable. Everything below is **time relative to `ankerl::unordered_dense`
5.0**, so 1.00 is level with it and **below 1.00 is faster than it**. Every figure is the geometric
mean of five sizes spanning one doubling. [How the numbers were made](#how-measured) says why, and
how to rerun any of it.

Those seven workloads are the ones named [in chapter 2](#what-a-lookup-is-made-of).

## Integer keys {#integer-keys}

[![Every map on build, hit, churn and iterate, relative to the group index](/img/2026/hashmap-index/bench-u64.svg)](/img/2026/hashmap-index/bench-u64.svg)

`map<uint64_t, size_t>`, octave from 32,000 entries. The index is comfortably in L2 and the values
in L3, which is where most maps in most programs live:

*Time relative to unordered_dense 5.0: 0.80 is 20% faster, 1.50 is 50% slower. Lower is faster, bold is the fastest map in each column, blue beats unordered_dense and amber does not.*

<table class="grid">
<thead><tr><th scope="col">map</th>
<th scope="col">build</th>
<th scope="col">hit</th>
<th scope="col">miss</th>
<th scope="col">50% hits</th>
<th scope="col">iterate</th>
<th scope="col">churn</th>
<th scope="col">insert/erase</th>
</tr></thead>
<tbody>
<tr><th scope="row">unordered_dense 4.11</th>
<td class="s4">2.32</td>
<td class="s3">1.52</td>
<td class="s3">1.57</td>
<td class="s3">1.42</td>
<td>1.04</td>
<td class="s3">1.46</td>
<td class="s2">1.38</td>
</tr>
<tr><th scope="row">unordered_dense 5.0</th>
<td><b>1.00</b></td>
<td>1.00</td>
<td>1.00</td>
<td>1.00</td>
<td><b>1.00</b></td>
<td>1.00</td>
<td>1.00</td>
</tr>
<tr><th scope="row">boost flat</th>
<td class="s3">1.66</td>
<td class="f2">0.79</td>
<td class="f2"><b>0.83</b></td>
<td class="f1">0.87</td>
<td class="s4">12.52</td>
<td class="f2">0.76</td>
<td class="f1">0.87</td>
</tr>
<tr><th scope="row">boost flat, own hash</th>
<td class="s3">1.68</td>
<td class="f2">0.80</td>
<td class="f2">0.83</td>
<td class="f1">0.87</td>
<td class="s4">10.67</td>
<td class="f2">0.75</td>
<td class="f1">0.89</td>
</tr>
<tr><th scope="row">absl flat</th>
<td class="s3">1.61</td>
<td class="f2">0.73</td>
<td class="s2">1.38</td>
<td>0.99</td>
<td class="s4">13.68</td>
<td class="s2">1.19</td>
<td class="s2">1.23</td>
</tr>
<tr><th scope="row">absl flat, own hash</th>
<td class="s1">1.12</td>
<td class="f2">0.76</td>
<td class="s3">1.43</td>
<td class="f1">0.94</td>
<td class="s4">14.68</td>
<td class="s2">1.19</td>
<td class="s2">1.23</td>
</tr>
<tr><th scope="row">F14Value</th>
<td class="s3">1.69</td>
<td class="f1">0.91</td>
<td class="s3">1.47</td>
<td class="s1">1.08</td>
<td class="s4">8.65</td>
<td class="s2">1.22</td>
<td class="s2">1.27</td>
</tr>
<tr><th scope="row">F14Vector</th>
<td class="s3">1.76</td>
<td class="s1">1.06</td>
<td class="s1">1.10</td>
<td class="s1">1.06</td>
<td class="s3">1.56</td>
<td class="s2">1.34</td>
<td class="s2">1.36</td>
</tr>
<tr><th scope="row">emhash8</th>
<td class="s4">2.87</td>
<td class="s2">1.19</td>
<td class="s4">2.13</td>
<td class="s3">1.50</td>
<td class="s1">1.07</td>
<td class="s2">1.22</td>
<td class="s2">1.23</td>
</tr>
<tr><th scope="row">emilib</th>
<td class="s3">1.89</td>
<td class="s1">1.09</td>
<td class="s1">1.13</td>
<td class="s1">1.11</td>
<td class="s4">6.15</td>
<td class="f1">0.94</td>
<td class="s1">1.08</td>
</tr>
<tr><th scope="row">indivi flat_umap</th>
<td class="s3">1.62</td>
<td class="f2">0.82</td>
<td>0.97</td>
<td class="f1">0.89</td>
<td class="s4">6.25</td>
<td class="f3"><b>0.69</b></td>
<td class="f1"><b>0.86</b></td>
</tr>
<tr><th scope="row">indivi flat_wmap</th>
<td class="s3">1.86</td>
<td class="f2"><b>0.71</b></td>
<td class="f2">0.83</td>
<td class="f2"><b>0.82</b></td>
<td class="s4">9.68</td>
<td class="f1">0.93</td>
<td class="f1">0.94</td>
</tr>
<tr><th scope="row">Verstable</th>
<td class="s4">3.12</td>
<td class="s1">1.07</td>
<td class="s4">2.10</td>
<td class="s2">1.36</td>
<td class="s4">11.64</td>
<td class="s1">1.10</td>
<td class="s1">1.13</td>
</tr>
<tr><th scope="row">ihtab</th>
<td class="s1">1.08</td>
<td>0.99</td>
<td class="s1">1.08</td>
<td>1.03</td>
<td class="s4">7.32</td>
<td class="s1">1.13</td>
<td class="s1">1.11</td>
</tr>
<tr><th scope="row">std::unordered_map</th>
<td class="s4">5.54</td>
<td class="s3">1.91</td>
<td class="s4">3.97</td>
<td class="s4">2.23</td>
<td class="s4">34.16</td>
<td class="s4">2.08</td>
<td class="s4">2.08</td>
</tr>
<tr><th scope="row">boost node</th>
<td class="s4">4.45</td>
<td class="s1">1.15</td>
<td class="f1">0.86</td>
<td class="s1">1.14</td>
<td class="s4">14.28</td>
<td class="s2">1.35</td>
<td class="s2">1.39</td>
</tr>
<tr><th scope="row">absl node</th>
<td class="s4">3.95</td>
<td class="s1">1.06</td>
<td class="s2">1.38</td>
<td class="s1">1.12</td>
<td class="s4">15.54</td>
<td class="s3">1.90</td>
<td class="s3">1.68</td>
</tr>
<tr><th scope="row">F14Node</th>
<td class="s4">4.15</td>
<td class="s1">1.14</td>
<td class="s2">1.33</td>
<td class="s2">1.22</td>
<td class="s4">12.47</td>
<td class="s4">2.06</td>
<td class="s3">1.84</td>
</tr>
</tbody>
</table>

Read it by column, and the earlier chapters fall out of it.

**The miss column answers the third of the five questions.** abseil is the quickest grouped
SwissTable on a hit (0.73) and the *slowest* flat SwissTable on a miss (1.38). Its miss has to find
an empty control byte, and at load 7/8 that is often not in the home group. boost (0.83), indivi's
`flat_umap` (0.97) and unordered_dense 5.0 almost always stop at home, because all three have an
explicit test for "did anything of my class overflow past here" instead of relying on an empty slot.
This is what the overflow byte and the overflow counter were invented for, and between two otherwise
nearly identical SwissTables it is worth 1.4 to 1.7x.

**And the churn column does not say what the design chapters say.**
Boost is 0.76 here and 0.53 at half a million entries, while [its own chapter](#boost-erase) has its
misses degrading 1.46x under exactly this workload. Both are true. What degrades is *probe length*,
measured in groups, and boost degrades from so far ahead that it is still the faster map once it
gets there. A counter that comes back down does not buy a faster churn. It buys a number that does
not move at all, with no rehash scheduled to make it stop moving. You care about tail latency? Then
that is the property you want. For throughput on this workload, read the column and pick boost.

**The chained designs pay for the miss too, and pay more.** emhash8 at 2.13 and Verstable at 2.10
are the two slowest misses of any modern design here, and [the counters below](#counters) say the
instructions are not the reason. A chain has to be walked to its end, and whether there is one at
all is unpredictable.

**The iterate column is very nearly the family split.** 1.00 to 1.56 for the dense maps, 6 to 15x
for every flat map, 12 to 34x for the node maps. Those are the largest ratios in the post by a
factor of ten, and they come entirely from a flat map having to walk its empty slots. The exception
is ihtab at 7.32, which is dense and still iterates like a flat map. [Its own section](#ihtab) has
the reason: the element array is append-only, so an iterator has to test a deleted bit per element.

**The build column has a surprise in it**, and the index has nothing to do with it. `absl flat, own
hash` builds at 1.12 where `absl flat` with unordered_dense's wyhash builds at 1.61.
`absl::Hash<uint64_t>` is much cheaper than a wyhash multiply for an integer key, and a build is the
workload that hashes most. Same map, same index, same everything else, and 1.4x apart on the hash
alone. That is why the "same hash for all" convention needs the own-hash control rows beside it.

At an octave from 500,000 entries, with the index out of L2 and the values out of L3, the picture
tilts:

*Time relative to unordered_dense 5.0, lower is faster, bold is the fastest map in each column.*

<table class="grid">
<thead><tr><th scope="col">map</th>
<th scope="col">build</th>
<th scope="col">hit</th>
<th scope="col">miss</th>
<th scope="col">50% hits</th>
<th scope="col">iterate</th>
<th scope="col">churn</th>
<th scope="col">insert/erase</th>
</tr></thead>
<tbody>
<tr><th scope="row">unordered_dense 4.11</th>
<td class="s4">2.05</td>
<td class="s3">1.46</td>
<td class="s3">1.51</td>
<td class="s3">1.47</td>
<td><b>1.00</b></td>
<td class="s2">1.27</td>
<td class="s2">1.21</td>
</tr>
<tr><th scope="row">unordered_dense 5.0</th>
<td><b>1.00</b></td>
<td>1.00</td>
<td>1.00</td>
<td>1.00</td>
<td>1.00</td>
<td>1.00</td>
<td>1.00</td>
</tr>
<tr><th scope="row">boost flat</th>
<td class="s2">1.38</td>
<td class="f2">0.76</td>
<td class="f3">0.65</td>
<td class="f2">0.76</td>
<td class="s4">6.04</td>
<td class="f3"><b>0.53</b></td>
<td class="f3">0.66</td>
</tr>
<tr><th scope="row">boost flat, own hash</th>
<td class="s2">1.37</td>
<td class="f2">0.77</td>
<td class="f3">0.65</td>
<td class="f2">0.75</td>
<td class="s4">5.74</td>
<td class="f3">0.53</td>
<td class="f3">0.66</td>
</tr>
<tr><th scope="row">absl flat</th>
<td class="s3">1.42</td>
<td class="f3">0.70</td>
<td class="f2">0.73</td>
<td class="f2">0.72</td>
<td class="s4">8.15</td>
<td class="f3">0.64</td>
<td class="f2">0.78</td>
</tr>
<tr><th scope="row">absl flat, own hash</th>
<td class="s1">1.08</td>
<td class="f3">0.70</td>
<td class="f2">0.75</td>
<td class="f2">0.71</td>
<td class="s4">8.33</td>
<td class="f3">0.64</td>
<td class="f2">0.77</td>
</tr>
<tr><th scope="row">F14Value</th>
<td class="s3">1.95</td>
<td class="f1">0.86</td>
<td class="s2">1.18</td>
<td>0.96</td>
<td class="s4">4.31</td>
<td>0.99</td>
<td>1.01</td>
</tr>
<tr><th scope="row">F14Vector</th>
<td class="s3">1.93</td>
<td class="s1">1.15</td>
<td class="s1">1.09</td>
<td class="s1">1.13</td>
<td>1.02</td>
<td>1.04</td>
<td class="s1">1.11</td>
</tr>
<tr><th scope="row">emhash8</th>
<td class="s4">2.55</td>
<td>1.03</td>
<td class="s1">1.14</td>
<td class="s1">1.07</td>
<td>1.00</td>
<td class="f1">0.92</td>
<td class="f1">0.92</td>
</tr>
<tr><th scope="row">emilib</th>
<td class="s3">1.61</td>
<td>1.00</td>
<td class="f2">0.74</td>
<td class="f1">0.95</td>
<td class="s4">3.52</td>
<td class="f2">0.71</td>
<td class="f2">0.77</td>
</tr>
<tr><th scope="row">indivi flat_umap</th>
<td class="s2">1.39</td>
<td class="f2">0.81</td>
<td class="f2">0.85</td>
<td class="f2">0.83</td>
<td class="s4">3.60</td>
<td class="f3">0.55</td>
<td class="f3">0.70</td>
</tr>
<tr><th scope="row">indivi flat_wmap</th>
<td class="s3">1.75</td>
<td class="f3"><b>0.64</b></td>
<td class="f3"><b>0.60</b></td>
<td class="f3"><b>0.63</b></td>
<td class="s4">4.65</td>
<td class="f3">0.63</td>
<td class="f3"><b>0.58</b></td>
</tr>
<tr><th scope="row">Verstable</th>
<td class="s4">2.59</td>
<td class="f2">0.74</td>
<td class="f1">0.92</td>
<td class="f2">0.78</td>
<td class="s4">5.37</td>
<td class="f3">0.67</td>
<td class="f3">0.69</td>
</tr>
<tr><th scope="row">ihtab</th>
<td class="s2">1.28</td>
<td>1.00</td>
<td class="s1">1.11</td>
<td class="s1">1.05</td>
<td class="s4">2.92</td>
<td class="f3">0.70</td>
<td class="f2">0.78</td>
</tr>
<tr><th scope="row">std::unordered_map</th>
<td class="s4">5.99</td>
<td class="s3">1.72</td>
<td class="s4">3.47</td>
<td class="s4">2.08</td>
<td class="s4">60.40</td>
<td class="s3">1.84</td>
<td class="s3">1.89</td>
</tr>
<tr><th scope="row">boost node</th>
<td class="s4">4.83</td>
<td class="s1">1.15</td>
<td class="f2">0.80</td>
<td class="s1">1.11</td>
<td class="s4">29.51</td>
<td>0.96</td>
<td class="s1">1.12</td>
</tr>
<tr><th scope="row">absl node</th>
<td class="s4">4.48</td>
<td>1.05</td>
<td class="f1">0.93</td>
<td>1.04</td>
<td class="s4">15.91</td>
<td class="s1">1.12</td>
<td class="s2">1.19</td>
</tr>
<tr><th scope="row">F14Node</th>
<td class="s4">5.10</td>
<td class="s1">1.07</td>
<td class="s2">1.20</td>
<td class="s1">1.13</td>
<td class="s4">22.46</td>
<td class="s3">1.49</td>
<td class="s3">1.44</td>
</tr>
</tbody>
</table>

**The dense penalty grows with the table.** boost goes from 0.79 to 0.76 on a hit and from 0.83 to
**0.65** on a miss, abseil from 0.73 to 0.70 and from 1.38 to 0.73. The extra dependent load of [the
dense family](#three-families) turns from a few cycles into a cache miss and a TLB entry, and no
amount of index work removes it. It is also why boost's *miss* improves so much. Once every lookup
is waiting on memory, the number of regions touched matters more than where the probe stops.

**And the load factor stops being the story.** `indivi::flat_wmap` has the quickest integer hit at
every size measured, and it reads 0.64 here. It is also the map with [the widest sawtooth in the
post](#flat-wmap), 2.12x across the 32,000 octave where the group designs are 1.5 to 1.6x. A single
number at a single size would have been worth very little for it.

## String keys {#string-keys}

[![Every map on the string workloads, relative to the group index](/img/2026/hashmap-index/bench-str.svg)](/img/2026/hashmap-index/bench-str.svg)

`map<std::string, size_t>`, keys 8 to 135 bytes skewed towards short, octave from 32,000:

*Time relative to unordered_dense 5.0, lower is faster, bold is the fastest map in each column.*

<table class="grid">
<thead><tr><th scope="col">map</th>
<th scope="col">build</th>
<th scope="col">hit</th>
<th scope="col">miss</th>
<th scope="col">50% hits</th>
<th scope="col">iterate</th>
<th scope="col">churn</th>
<th scope="col">insert/erase</th>
</tr></thead>
<tbody>
<tr><th scope="row">unordered_dense 4.11</th>
<td class="s2">1.21</td>
<td class="s1">1.12</td>
<td>0.97</td>
<td class="s1">1.07</td>
<td>1.01</td>
<td>1.03</td>
<td>1.05</td>
</tr>
<tr><th scope="row">unordered_dense 5.0</th>
<td><b>1.00</b></td>
<td>1.00</td>
<td>1.00</td>
<td>1.00</td>
<td>1.00</td>
<td>1.00</td>
<td>1.00</td>
</tr>
<tr><th scope="row">boost flat</th>
<td class="s2">1.41</td>
<td class="f1">0.87</td>
<td class="f2"><b>0.84</b></td>
<td class="f1">0.88</td>
<td class="s4">4.08</td>
<td class="f1">0.87</td>
<td class="f1"><b>0.87</b></td>
</tr>
<tr><th scope="row">boost flat, own hash</th>
<td class="s3">1.60</td>
<td class="s1">1.14</td>
<td class="s2">1.25</td>
<td class="s1">1.10</td>
<td class="s4">3.86</td>
<td class="f1">0.92</td>
<td>1.00</td>
</tr>
<tr><th scope="row">absl flat</th>
<td class="s2">1.25</td>
<td class="f1">0.92</td>
<td>0.98</td>
<td class="f1">0.88</td>
<td class="s4">5.08</td>
<td class="f1">0.93</td>
<td>0.96</td>
</tr>
<tr><th scope="row">absl flat, own hash</th>
<td class="s2">1.24</td>
<td class="f1">0.95</td>
<td>0.99</td>
<td class="f1">0.90</td>
<td class="s4">5.31</td>
<td class="f1">0.93</td>
<td>0.96</td>
</tr>
<tr><th scope="row">F14Value</th>
<td class="s2">1.36</td>
<td>0.98</td>
<td>0.99</td>
<td class="f1">0.95</td>
<td class="s4">3.48</td>
<td class="f1">0.93</td>
<td>1.00</td>
</tr>
<tr><th scope="row">F14Vector</th>
<td class="s2">1.24</td>
<td>0.97</td>
<td class="f1">0.88</td>
<td>0.96</td>
<td>0.99</td>
<td>1.01</td>
<td>1.01</td>
</tr>
<tr><th scope="row">emhash8</th>
<td class="s3">1.73</td>
<td>0.96</td>
<td class="s1">1.12</td>
<td>0.98</td>
<td><b>0.96</b></td>
<td class="s1">1.09</td>
<td class="s1">1.10</td>
</tr>
<tr><th scope="row">emilib</th>
<td class="s3">1.55</td>
<td class="f1">0.94</td>
<td class="f1">0.92</td>
<td>0.96</td>
<td class="s4">3.39</td>
<td class="f1">0.91</td>
<td>0.98</td>
</tr>
<tr><th scope="row">indivi flat_umap</th>
<td class="s3">1.45</td>
<td>0.96</td>
<td>1.02</td>
<td class="f1">0.95</td>
<td class="s4">2.77</td>
<td class="f2"><b>0.80</b></td>
<td>0.99</td>
</tr>
<tr><th scope="row">indivi flat_wmap</th>
<td class="s2">1.38</td>
<td class="f1">0.89</td>
<td class="f1">0.90</td>
<td class="f1">0.90</td>
<td class="s4">3.64</td>
<td class="f1">0.95</td>
<td class="f1">0.95</td>
</tr>
<tr><th scope="row">std::unordered_map</th>
<td class="s4">2.62</td>
<td class="s1">1.13</td>
<td class="s4">2.39</td>
<td class="s2">1.38</td>
<td class="s4">45.36</td>
<td class="s3">1.64</td>
<td class="s3">1.54</td>
</tr>
<tr><th scope="row">boost node</th>
<td class="s3">1.90</td>
<td class="f2"><b>0.83</b></td>
<td class="f1">0.89</td>
<td class="f2"><b>0.85</b></td>
<td class="s4">10.42</td>
<td class="s1">1.10</td>
<td>1.02</td>
</tr>
<tr><th scope="row">absl node</th>
<td class="s3">1.92</td>
<td class="f1">0.87</td>
<td>1.02</td>
<td class="f2">0.85</td>
<td class="s4">7.80</td>
<td class="s1">1.12</td>
<td class="s1">1.08</td>
</tr>
<tr><th scope="row">F14Node</th>
<td class="s3">1.70</td>
<td class="f1">0.87</td>
<td>0.97</td>
<td class="f2">0.85</td>
<td class="s4">8.42</td>
<td class="s1">1.08</td>
<td class="s1">1.09</td>
</tr>
</tbody>
</table>

**On every lookup and churn column, nearly all of the modern maps are within 15% of each other**,
because the hash and the key comparison are most of the work and every map is handed the same hash.
`std::unordered_map` at 2.39 on a miss is the exception, and boost given its own hash at 1.25 is the
control that the next table is about. So for string keys, the index you pick is close to irrelevant,
and the hash you pick is not.

One number in that table is not what it looks like. F14Vector's **0.88** on the miss is a paired
figure, and a paired harness cannot resolve a gap that size. [Measured one map per
binary](#still-on-the-table), the hit is a tie and the miss is 8 to 9%, and that is the figure to
quote.

The own-hash control rows are where that shows up. Here is the same workload with the hash a caller
gets by writing the type name and nothing else:

*Time relative to unordered_dense 5.0, lower is faster, bold is the best in each row.*

|  | boost, this wyhash | boost, its own hash | abseil, this wyhash | abseil, its own hash |
|---|---:|---:|---:|---:|
| hit | **0.87** | 1.14 | 0.92 | 0.95 |
| miss | **0.84** | 1.25 | 0.98 | 0.99 |
| build | 1.41 | 1.60 | 1.25 | **1.24** |
| churn | **0.87** | 0.92 | 0.93 | 0.93 |
{: .heat-par}

`boost::hash<std::string>` costs boost 31% on a hit and 49% on a miss, which turns a map that is
ahead of unordered_dense 5.0 into one that is behind it. `absl::Hash<std::string>` costs abseil 1 to
4% and changes nothing else. So the often-quoted "boost is faster on string lookups" is a statement
about boost *given unordered_dense's hash*. Out of the box it is not, and abseil's default is the
one that holds up. For an integer key it goes the other way, but only for one of the two:
`absl::Hash<uint64_t>` is 1.4x cheaper on a build and shows plainly in the integer table, while
`boost::hash<uint64_t>` is a wash against this wyhash to within a percent.

## A 64 byte mapped value {#big-value}

[![Every map with a 64 byte mapped value, relative to the group index](/img/2026/hashmap-index/bench-big.svg)](/img/2026/hashmap-index/bench-big.svg)

`map<uint64_t, some_64_byte_struct>`, octave from 32,000. Nothing changes here except the size of
the value, which is the axis that separates flat from dense:

*Time relative to unordered_dense 5.0, lower is faster, bold is the fastest map in each column.*

<table class="grid">
<thead><tr><th scope="col">map</th>
<th scope="col">build</th>
<th scope="col">hit</th>
<th scope="col">miss</th>
<th scope="col">50% hits</th>
<th scope="col">iterate</th>
<th scope="col">churn</th>
<th scope="col">insert/erase</th>
</tr></thead>
<tbody>
<tr><th scope="row">unordered_dense 4.11</th>
<td class="s3">1.95</td>
<td class="s2">1.39</td>
<td class="s3">1.56</td>
<td class="s2">1.35</td>
<td><b>1.00</b></td>
<td class="s2">1.39</td>
<td class="s2">1.26</td>
</tr>
<tr><th scope="row">unordered_dense 5.0</th>
<td>1.00</td>
<td>1.00</td>
<td>1.00</td>
<td>1.00</td>
<td>1.00</td>
<td>1.00</td>
<td>1.00</td>
</tr>
<tr><th scope="row">boost flat</th>
<td class="s3">1.73</td>
<td class="f1">0.90</td>
<td class="f2"><b>0.83</b></td>
<td class="f1">0.94</td>
<td class="s4">4.07</td>
<td class="f2">0.75</td>
<td class="f2">0.84</td>
</tr>
<tr><th scope="row">boost flat, own hash</th>
<td class="s3">1.72</td>
<td class="f1">0.90</td>
<td class="f2">0.83</td>
<td class="f1">0.93</td>
<td class="s4">3.87</td>
<td class="f2">0.75</td>
<td class="f2">0.83</td>
</tr>
<tr><th scope="row">absl flat</th>
<td class="s2">1.22</td>
<td class="f2">0.81</td>
<td class="s2">1.40</td>
<td class="f2">0.83</td>
<td class="s4">3.07</td>
<td class="f1">0.88</td>
<td class="f1">0.95</td>
</tr>
<tr><th scope="row">absl flat, own hash</th>
<td class="f1"><b>0.94</b></td>
<td class="f2">0.83</td>
<td class="s3">1.42</td>
<td class="f2"><b>0.82</b></td>
<td class="s4">3.12</td>
<td class="f1">0.88</td>
<td class="f1">0.95</td>
</tr>
<tr><th scope="row">F14Value</th>
<td class="s3">1.76</td>
<td>1.05</td>
<td class="s3">1.56</td>
<td class="s1">1.07</td>
<td class="s4">3.35</td>
<td class="s1">1.13</td>
<td class="s2">1.17</td>
</tr>
<tr><th scope="row">F14Vector</th>
<td class="s3">1.78</td>
<td class="s1">1.08</td>
<td class="s1">1.10</td>
<td class="s1">1.08</td>
<td>1.02</td>
<td class="s2">1.17</td>
<td class="s2">1.19</td>
</tr>
<tr><th scope="row">emhash8</th>
<td class="s4">2.53</td>
<td>1.04</td>
<td class="s4">2.16</td>
<td class="s1">1.13</td>
<td>1.05</td>
<td class="s1">1.09</td>
<td>1.02</td>
</tr>
<tr><th scope="row">emilib</th>
<td class="s3">1.76</td>
<td class="s1">1.10</td>
<td class="s1">1.14</td>
<td class="s1">1.14</td>
<td class="s4">2.81</td>
<td class="f1">0.89</td>
<td>1.00</td>
</tr>
<tr><th scope="row">indivi flat_umap</th>
<td class="s3">1.61</td>
<td class="f1">0.89</td>
<td class="f1">0.95</td>
<td class="f1">0.94</td>
<td class="s4">2.80</td>
<td class="f2"><b>0.72</b></td>
<td class="f1">0.88</td>
</tr>
<tr><th scope="row">indivi flat_wmap</th>
<td class="s3">1.80</td>
<td class="f2"><b>0.76</b></td>
<td class="f2">0.84</td>
<td class="f2">0.85</td>
<td class="s4">3.21</td>
<td class="f1">0.89</td>
<td class="f2"><b>0.81</b></td>
</tr>
<tr><th scope="row">std::unordered_map</th>
<td class="s4">5.26</td>
<td class="s3">1.44</td>
<td class="s4">4.21</td>
<td class="s3">1.55</td>
<td class="s4">25.41</td>
<td class="s3">1.84</td>
<td class="s3">1.77</td>
</tr>
<tr><th scope="row">boost node</th>
<td class="s4">3.91</td>
<td class="s1">1.08</td>
<td class="f1">0.88</td>
<td class="s1">1.08</td>
<td class="s4">5.89</td>
<td class="s1">1.12</td>
<td class="s2">1.17</td>
</tr>
<tr><th scope="row">absl node</th>
<td class="s4">3.49</td>
<td>1.01</td>
<td class="s2">1.36</td>
<td class="s1">1.05</td>
<td class="s4">4.71</td>
<td class="s2">1.40</td>
<td class="s2">1.24</td>
</tr>
<tr><th scope="row">F14Node</th>
<td class="s4">3.55</td>
<td class="s1">1.05</td>
<td class="s2">1.33</td>
<td class="s1">1.10</td>
<td class="s4">4.82</td>
<td class="s3">1.67</td>
<td class="s3">1.42</td>
</tr>
</tbody>
</table>

**Building is 1.6 to 1.8x faster dense** than boost, F14Value, emilib and indivi given the same
hash, because growth copies four byte indices rather than 72 byte slots. **Iteration is 2.8 to 4.1x
faster dense**, because there are no empty 72 byte slots to walk. Both gaps grow with the value. The
exception in the build column is abseil, at 1.22 with this wyhash and 0.94 with its own integer
hash. That is the same 1.4x hash effect as in the integer table, showing through a workload that is
half hashing.

Against that, the flat maps keep their lookup and churn advantage, with boost still at 0.75 on
churn. So the trade is exactly the one [the three families](#three-families) describes, at the value
size where it is easiest to see.

## Memory {#memory}

[![Bytes per entry with a 64 byte value, before and after churning](/img/2026/hashmap-index/memory-big.svg)](/img/2026/hashmap-index/memory-big.svg)

Bytes of heap per live entry, counted by `mallinfo2` around a build and then around a full turnover
of churn, geometric mean over the same octave. There are two columns because the second one is the
memory cost of whatever an erase leaves behind.

*Bytes of heap per live entry, lower is better, bold is the leanest in each column. Rows are grouped by family (flat, then dense, then node) and sorted within each group, so a number that looks out of order down the page is a family boundary rather than a mistake.*

| map | 8 byte value, steady | after churn | 64 byte value, steady | after churn |
|---|---:|---:|---:|---:|
| absl flat | **27.0** | 31.0 | 113.3 | 130.2 |
| emilib | **27.0** | **27.0** | 130.2 | 130.2 |
| indivi `flat_umap` | 28.6 | 28.6 | 114.9 | 114.9 |
| Verstable | 28.6 | 28.6 | -- | -- |
| boost flat | 29.2 | 29.2 | 122.1 | 122.1 |
| F14Value | 29.2 | 29.2 | 114.1 | 114.1 |
| indivi `flat_wmap` | 31.0 | 35.7 | 130.2 | 149.5 |
| unordered_dense 5.0 | 32.6 | 32.6 | 107.6 | 107.6 |
| F14Vector | 33.7 | 33.7 | 115.3 | 115.3 |
| ihtab | 36.1 | 72.3 | -- | -- |
| unordered_dense 4.11 | 37.3 | 37.3 | 112.3 | 112.3 |
| emhash8 | 38.0 | 38.0 | 117.0 | 117.0 |
| `std::unordered_map` | 43.6 | 43.6 | 108.4 | 108.4 |
| absl node | 46.5 | 48.6 | **94.2** | 96.3 |
| F14Node | 46.8 | 46.8 | 94.5 | **94.5** |
| boost node | 47.7 | 47.7 | 95.4 | 95.4 |
{: .heat-low}

`uint64_t` keys, octave from 32,000 entries. The flat maps hold a 16 or 72 byte `value_type`, and
the dense ones hold the same in a vector plus their index. Verstable and ihtab have no 64 byte
figure, because the adapter that measures memory holds the mapped value by value, and neither
library's C interface takes one that large without changes I did not make.

**At an eight byte value the flat maps win, and it is close.** 27 to 29 bytes per entry against 32.6
for unordered_dense 5.0. That is one byte of metadata per slot at load 0.875 against 5.5 bytes at
0.8, plus the doubling overhang of a `std::vector`, which is where most of the gap actually comes
from. The overhang is a knob rather than a property. The value container is a template parameter,
and one that grows by 1.5x instead of 2 measures **10% less per entry, for 14% of the build** (and
13% less at a 64 byte value, for 19%). Those figures come from a separate experiment with its own
baseline, 33.2 and 113.3 bytes per entry where this table reads 32.6 and 107.6, so read the
percentages against the rows above rather than the absolutes. It buys memory level with boost, and
pays for it out of the build, which is the column unordered_dense leads the field on. So 2 stays the
default, and the trade is there for anyone whose scarce resource is the other one. Every map here
doubles, by the way: folly's much-quoted 1.406 growth factor binds only on an explicit `reserve`,
never on insertion.

**At a 64 byte value the order reverses completely and the node maps win.** A flat map pays for
every empty slot at the full width of the value. At load 0.875 that is 82 bytes of slot for 72 bytes
of data, before any metadata. A dense map pays 72 bytes plus 5.5 of index. A node map pays 72 plus a
pointer plus the allocator's header, and is the leanest of the three. This is the one column where
`std::unordered_map` is competitive with anything.

**The churn column is where tombstones show up as bytes.** Everything with `no` in the tombstone
column of [the summary table](#summary-table) is flat across a turnover, to the byte. abseil goes
27.0 to 31.0 and 113.3 to 130.2, because its tombstones count against the growth budget, so a
churning table rehashes into a bigger one. `indivi::flat_wmap` does the same, 31.0 to 35.7. emilib
has tombstones and does *not* grow, because it counts only live elements against its limit. It pays
in probe length instead, which is the same trade the other way round.

**And ihtab doubles**, 36.1 to 72.3, and stays there. That is the append-only element array again,
carrying one dead element for every live one until it rebuilds. It is a design choice rather than a
fault. In its extendible-hashing sibling [ixhtab](#ixhtab) the same property meets a bin-splitting
test that compares a table-wide count against a per-bin size, and there the memory does not stop
growing at all.

# 16. Where the time actually goes [&#8593; contents](#contents){:.up} {#where-the-time-goes}

The tables above are ratios, and a ratio only tells you which map was quicker. This chapter has the
counters underneath them: instructions, cycles, branch misses, cache lines. One map per binary, so
nothing in the measurement depends on what else was compiled beside it. After that come the three
instructions that separate the three answers to "absent?", read straight out of the binaries. Same
field as the chapter before, asked why instead of how much.

## Counters {#counters}

Times are ratios, counters are not. These runs are their own campaign, so their absolute nanoseconds
are not the ones in [chapter 7's degradation table](#bit-vs-tombstone) or in [the huge-pages
note](#still-on-the-table). Different sizes, different binaries, different days. One map per binary,
`perf stat`, 30 million lookups on a table of 50,000 entries, so the index sits in L1 and L2 and what
gets counted is the work rather than the memory system. Per lookup:

*Per lookup, lower is better except for IPC, and bold is the best in each column of each half. The harness's timer quantises the ns column of the upper half to a third of a nanosecond, which is why several maps read exactly level there. The cycle counts are the ones with enough resolution to separate them.*

|  | ns | instructions | cycles | branch misses | L1 misses | IPC |
|---|---:|---:|---:|---:|---:|---:|
| **all hits** |  |  |  |  |  |  |
| indivi `flat_wmap` | **3.67** | 48.0 | **19.8** | 0.035 | 3.29 | 2.42 |
| absl flat | 4.00 | 56.1 | 21.4 | 0.044 | 3.52 | **2.62** |
| boost flat | 4.33 | 57.0 | 24.8 | 0.094 | 3.84 | 2.30 |
| indivi `flat_umap` | 4.33 | 54.3 | 23.8 | 0.065 | 3.73 | 2.28 |
| F14Value | 4.67 | 64.0 | 25.2 | **0.022** | 3.80 | 2.54 |
| ihtab | 5.33 | 53.8 | 28.7 | **0.022** | 3.23 | 1.87 |
| unordered_dense 5.0 | 5.67 | 60.5 | 29.4 | 0.065 | 4.22 | 2.06 |
| emilib | 5.67 | 73.1 | 32.2 | 0.099 | **2.86** | 2.27 |
| F14Vector | 6.00 | 68.1 | 32.1 | 0.024 | 3.95 | 2.12 |
| Verstable | 6.33 | 61.2 | 34.8 | 0.426 | 3.26 | 1.76 |
| emhash8 | 6.67 | 48.4 | 36.6 | 0.420 | 3.20 | 1.32 |
| unordered_dense 4.11 | 7.67 | 76.8 | 39.1 | 0.161 | 3.49 | 1.96 |
| `std::unordered_map` | 9.67 | **45.1** | 52.4 | 0.325 | 4.22 | 0.86 |
| **all misses** |  |  |  |  |  |  |
| F14Vector | **3.49** | 60.5 | **18.6** | **0.043** | 2.01 | **3.26** |
| indivi `flat_umap` | 3.53 | 52.1 | **18.6** | 0.108 | 1.98 | 2.80 |
| ihtab | 3.79 | 56.2 | 20.0 | 0.044 | 1.98 | 2.81 |
| boost flat | 4.16 | 54.2 | 20.4 | 0.164 | **1.90** | 2.66 |
| unordered_dense 5.0 | 4.19 | 57.2 | 20.7 | 0.108 | 3.41 | 2.76 |
| indivi `flat_wmap` | 4.82 | 49.3 | 25.8 | 0.302 | 2.11 | 1.91 |
| unordered_dense 4.11 | 5.73 | 72.8 | 28.4 | 0.163 | 2.49 | 2.57 |
| emilib | 6.02 | 75.6 | 32.1 | 0.420 | 1.92 | 2.35 |
| absl flat | 6.26 | 61.1 | 32.6 | 0.362 | 3.44 | 1.87 |
| emhash8 | 7.19 | 46.4 | 38.2 | 0.592 | 2.07 | 1.21 |
| Verstable | 7.58 | **44.6** | 40.8 | 0.806 | 1.96 | 1.09 |
| `std::unordered_map` | 12.61 | 52.9 | 68.0 | 0.649 | 3.43 | 0.78 |
{: .heat-low data-invert="IPC"}

**The bottom of the miss table has the argument of this whole post in four rows.** Verstable executes
**44.6 instructions and takes 40.8 cycles**, where unordered_dense 5.0 executes 57.2 and takes 20.7.
Twenty-eight percent more work, in half the time. The difference is 0.108 branch misses against
0.806, which is about eleven cycles of pipeline. emhash8 has the same shape, and
`std::unordered_map` has it again with a pointer chase on top: 52.9 instructions at an IPC of 0.78.

**The two flat SwissTables that answer a miss with an empty byte are the expensive ones.** abseil
needs 32.6 cycles at 0.362 branch misses and emilib 32.1 at 0.420, against boost's 20.4 and 0.164.
[The assembly below](#probe-assembly) shows where that comes from, in two instructions.

**Also, nobody here is instruction-bound.** Every design retires between 0.8 and 3.3 instructions per
cycle on a core that can do four. The ones near the top are waiting on the branch predictor, and on a
bigger table they will all be waiting on memory instead. Here is the same all-hits lookup at a
million entries:

*Per lookup at a million entries, lower is better, and bold is the best in each column.*

|  | ns | cycles | dTLB misses | L1 misses |
|---|---:|---:|---:|---:|
| indivi `flat_wmap` | **16.60** | 91.9 | 1.369 | 3.844 |
| boost flat | 17.03 | **87.4** | 1.335 | 4.388 |
| absl flat | 17.57 | 97.8 | 1.340 | 4.250 |
| ihtab | 19.17 | 106.7 | 1.864 | 3.705 |
| Verstable | 20.13 | 111.1 | 1.607 | 3.859 |
| F14Vector | 20.69 | 114.8 | 1.779 | 4.539 |
| indivi `flat_umap` | 21.45 | 118.9 | 1.603 | 4.727 |
| unordered_dense 5.0 | 22.64 | 111.8 | 1.910 | 4.879 |
| F14Value | 22.70 | 126.1 | **1.157** | 4.303 |
| emhash8 | 24.69 | 137.2 | 2.205 | **3.697** |
| boost node | 33.30 | 185.8 | 2.580 | 5.440 |
{: .heat-low}

**The dTLB column splits the families**, and it is the clearest single number for what a dense layout
costs. The flat maps that touch one region take 1.16 to 1.61 misses per lookup, the dense ones that
touch two take 1.78 to 2.21, and a node map that touches a heap allocation takes 2.58. On 4 KB pages
a prefetch cannot hide a page walk, which is why huge pages are worth 22% here and nobody asks for
them ([what is still on the table](#still-on-the-table)).

## The probe loops, in assembly {#probe-assembly}

The three answers to "absent?" come down to three instructions, and you can read them straight out of
the binaries. All three are the tail of the same loop: broadcast the fingerprint, compare sixteen
bytes, `pmovmskb`, walk the matches. They only differ in what happens when the mask is empty.
Compiled with clang 22 at `-O3`, default `-march`, one map per binary, taken from the all-hits lookup
loop.

**abseil**: a second vector compare, against a broadcast `kEmpty`.

```nasm
  pcmpeqb xmm3,xmm2              ; the sixteen control bytes against H2
  pmovmskb ebx,xmm3
  test   ebx,ebx
  je     .no_match
  ...                            ; walk the matching lanes
.no_match:
  pcmpeqb xmm2,xmm0              ; the same sixteen bytes against kEmpty
  pmovmskb r9d,xmm2
  test   r9d,r9d
  jne    .absent                 ; an empty slot: the key is not in the table
  add    rdx,rdi                 ; else the next group
```

**boost**: one byte test against a shift table.

```nasm
  pcmpeqb xmm1,xmm0
  pmovmskb ecx,xmm1
  movzx  r15d,BYTE PTR [rsp-0x9] ; 1 << (hash % 8), computed once outside the loop
  and    ecx,0x7fff              ; mask off the overflow byte
  je     .no_match
  ...
.no_match:
  test   BYTE PTR [rdx+0x4248a0],r15b   ; the group's overflow byte, this key's bit
  je     .absent
```

**the group index**: one byte compare against zero.

```nasm
  prefetcht0 BYTE PTR [r13+r10*1+0x40]  ; the block's second and last cache lines,
  prefetcht0 BYTE PTR [r13+r10*1+0x57]  ; issued before the fingerprints are even loaded
  movdqu xmm1,XMMWORD PTR [r13+r10*1+0x0]
  pcmpeqb xmm1,xmm0
  pmovmskb r10d,xmm1
  test   r10d,r10d
  je     .no_match
.match:
  tzcnt  r10d,ebp
  mov    r10d,DWORD PTR [r9+r10*4+0x18] ; the value index, from the same block
  shl    r10,0x4
  cmp    r11,QWORD PTR [r12+r10*1]      ; the key, from the values vector
  je     .found
  lea    r10d,[rbp-0x1]                 ; clear the lowest match and try the next lane
  and    r10d,ebp
  mov    ebp,r10d
  jne    .match
.no_match:
  cmp    BYTE PTR [r9+rax*1+0x10],0x0   ; this key's overflow counter
  je     .absent
  cmp    edi,r14d                       ; ... or every group has been seen
  je     .absent
```

Three things show up here that no table shows.

The **miss test** is two vector instructions and a branch in abseil, one memory `test` in boost, and
one `cmp` against an immediate zero in the group index. abseil's has to consult all sixteen bytes
where the other two look at one. That is the mechanism behind the 1.38 in the miss column.

The group index issues **its two prefetches before the metadata load**, so its extra dependent load
costs less than [the picture of what one lookup touches](#what-one-lookup-touches) suggests. The
value index sits in the same block, and that cache line is already on its way. Unfortunately the
placement is compiler-dependent on x86 and cannot be tuned in both directions at once: clang emits
both prefetches before the `movdqu` and gcc emits them after, and dropping one is a 5-11% win under
clang and a 12% loss under gcc at four million entries.

And **the match walk is the same three instructions everywhere**: `tzcnt`, use the lane, then
`lea`/`and` to clear it. That is the part everyone does the same way, and all of the design
difference sits in the two instructions before and after it.

## Three ways to be fast {#three-ways}

Put those counters beside the times from [the chapter before](#same-workloads) and the field sorts
into three strategies. None of them dominates.

**Fewest instructions.** Verstable, with emhash8 close behind. A chain visits only keys that belong
to this bucket, so in principle nothing is wasted. It still loses, because every step of the chain is
a branch.

**Fewest regions touched.** The flat SwissTables. One allocation, one dependent load after the
metadata, and the key is right there. On integer keys this wins a fresh hit at every size, and it
wins by more the larger the table gets. That is the one trend in this post that does not reverse
anywhere.

**Fewest unpredictable branches.** The group designs. One question per sixteen slots, whatever the
group holds, and the answer to "absent?" arranged so that a miss usually stops at home. This wins in
cache and on anything that erases, and it is what most of the last five years of hash map work has
been about.

None of them dominates because they are strong against different costs, and which cost matters
depends on the table size. In L1 and L2 the branch predictor is the bottleneck, so the group designs
win. Past L3 the memory system is the bottleneck, so the map that touches one region wins. The dense
maps are on the wrong side of that second one by construction, and on the right side of every column
that involves iterating, growing, or a value bigger than a pointer.

# 17. Question by question [&#8593; contents](#contents){:.up} {#question-by-question}

What the measurements say, workload by workload. The first three items are
[questions 3 and 5](#five-questions), when may a miss stop and what does an erase leave behind. Those
are the two the designs really disagree about. The rest are not questions about the index at all, and
they decide which map you want anyway.

**A hit on a fresh table.** On integer keys the flat SwissTables, by a good margin. On string keys
there is no margin at all: the quickest hit there comes from a node map, boost's, and the spread
across the modern maps is 15%. One region, one dependent load after the metadata, and the key is in
the group. abseil and boost trade places depending on the hash and the size, and indivi is right
there with them. The dense maps pay one more load for it. Against the quickest flat map in the same
table, unordered_dense 5.0 is 1.41x behind at 32,000 entries and 1.56x at 500,000, and F14Vector is
1.16x behind its own flat sibling F14Value. That is the cost of the family, and no index trick
recovers it.

**A miss on a fresh table.** Closer, and in cache the counter designs do well. A miss that stops at
its home group never touches a key at all, so the metadata compare is the whole lookup, and boost's
overflow bit, indivi's counter and unordered_dense's counter almost always stop there. The chained
designs are slowest here for the opposite reason: a miss has to reach the end of a chain, and whether
there is one is exactly the unpredictable question. Past L3 the order changes and the counters stop
deciding it. At half a million entries `flat_wmap` is 0.60, boost 0.65, abseil 0.73, and emilib,
which has tombstones, 0.74. By then every design is waiting on memory, and what counts is how many
regions it touches.

**A table that only churns.** This is where the answers to "gone?" separate. The designs whose miss
test comes back down, F14's counter, indivi's and unordered_dense's, hold their probe lengths. The
designs that leave something behind, abseil's tombstones, boost's overflow bits, emilib's and
ihtab's tombstones, get slower until a rehash and then pay for the rehash. Whether a benchmark shows
any of this depends entirely on whether it holds the size constant, and most do not. It is a
statement about the shape of the curve rather than about a winner: boost degrades 1.46x on a miss and
is still ahead of unordered_dense on the churn workload at every size, because it starts out ahead.
Counters buy a flat line, not a lower one.

**Iteration.** The dense maps, by an order of magnitude, and that is the largest ratio anywhere in
this post. A dense map walks exactly the live entries in a contiguous array, where a flat map walks
the whole slot array, and at load 0.5 that is twice the memory for the same elements. F14Vector and
emhash8 are here with unordered_dense. ihtab is not, because its array is append-only and its
iterator has to check a deleted bit per element.

**Large values.** The dense maps again, for the same reason seen from the other side. A flat map
writes `sizeof(value_type)` into a hash-scattered slot and copies all of it on every growth, where a
dense map writes four bytes there and appends the payload in order.

**Memory.** At a large mapped value the order is nearly the reverse of the metadata-per-slot column
of [the summary table](#summary-table), and at an eight byte one it is close to the same order. A
flat map costs `sizeof(value_type) / load factor` per live entry plus a byte or two of metadata, so
its footprint is dominated by empty slots at the width of the value. A dense map costs
`sizeof(value_type)` exactly, plus its index at the width of a slot. That crosses over as the value
grows, and where it crosses is in [the measurements](#same-workloads).

**Pointer stability.** Only the node maps, and only they can give it. If you need a reference to
survive an insert, nothing in the flat or dense families will do, and no amount of measurement
changes that. `unordered_dense::segmented_map` is a partial answer, since it keeps references valid
by segmenting the value vector. It is not the same guarantee though, because the index still doubles
beside itself.

**A hostile hash.** Every design here degrades to a linear scan of a probe sequence, which is fine.
The question is whether it terminates. `indivi::flat_umap` did not until [September
2026](https://github.com/gaujay/indivi_collection/issues/2), and neither did unordered_dense 5.0
until the review before its release. Eight chosen keys were enough to hang either one. abseil
additionally salts each table with a per-table seed, which is the only defence here aimed at an
adversary rather than at an accident. [Measured in unordered_dense](#borrowed) it costs zero cycles
on a lookup, so the argument against it is about reproducible iteration order and not about speed.

**Erase by iterator.** indivi, thanks to the distance nibbles: no hash, no key access. Everything
else re-derives the home from the key.

**Small, short-lived maps.** The maps that allocate nothing until the first insert, plus abseil's
[single-element mode](#swisstable), which makes an empty or one-entry map allocate nothing at all.
Measure it if that is your workload, because the ranking there is not the ranking anywhere else.

## Which one, then {#which-one}

Small values and a table that is mostly read? Take a flat SwissTable,
`boost::unordered_flat_map` and `absl::flat_hash_map` are both excellent. You iterate, or the values
are large, or you want the memory of a dense layout? Take a dense map, and `ankerl::unordered_dense`
is mine so take the recommendation accordingly. You need references to stay valid? Take a node map,
and prefer `boost::unordered_node_map` or `absl::node_hash_map` over `std::unordered_map`, which is
slow for reasons the standard requires.

I also wrote [a quiz](/which-hash-map/) about this. It asks the questions in an order that gets to an
answer faster than a table does.

# 18. What unordered_dense 5.0 took from the others, and what each idea was worth [&#8593; contents](#contents){:.up} {#borrowed}

I read every design above with one question in mind: is there something in it that belongs in
[the group index](#group-index)? Twelve ideas were then built into unordered_dense 5.0 and measured
against the same header without them. Four are in the shipped index, one is there behind a switch,
and seven are not. The seven are the more interesting part, because a negative result with a
mechanism behind it says more about a design than a positive one does.

**Read a row as "unordered_dense 5.0 already had a way of doing this", not as "this was a bad
idea".** None of it is a verdict on an idea, and even less on the map it came from. An idea that
reads 4% slower here is often exactly what makes the map it came from fast.

**And the list runs the other way too.** Every part of this index that is worth having came from one
of the maps on it. The counters are [indivi](#indivi)'s, the erase that decrements them is
[folly](#f14)'s, the pre-broadcast fingerprint word and the prober that terminates are
[boost](#boost)'s, and the group of sixteen fingerprints compared in one instruction is
[abseil](#swisstable)'s. That last one is what everything else here sits on. What is mine is the
arrangement, and the measuring; the shoulders are theirs.

| idea | from | measured | kept |
|---|---|---|---|
| overflow counters, one per hash class | [indivi](#indivi) | it is the design | **yes** |
| an erase that decrements the counter | [folly F14](#f14) | it is the design | **yes** |
| the pre-broadcast fingerprint word table | [boost](#boost) | integer misses 5 to 6% faster | **yes** |
| a probe that terminates | [boost](#boost) | free, by instruction count | **yes** |
| a per-table seed | [abseil](#swisstable) | 0 cycles a lookup, 3.5% slower to build | behind a switch |
| one counter per group instead of eight | [folly F14](#f14) | 4% slower on the suite | no |
| double hashing instead of a triangular probe | [folly F14](#f14) | 9% slower on integer misses | no |
| a second fingerprint in the spare index bits | [emhash8](#emhash8) | 2.5% slower on the suite | no |
| distance nibbles, with a slot back-pointer | [indivi](#indivi) | 4% slower on the suite | no |
| cache-line-aligned metadata | [abseil](#swisstable), [boost](#boost) | 0.7% slower on the suite | no |
| an exact in-home test | [Verstable](#verstable) | 2 to 3% faster in cache, nothing out of it | no |
| a value index narrower than 32 bits | CPython's compact dict | 1.4% slower on the suite | no |

"On the suite" is the geometric mean of the fifteen workloads of unordered_dense's own benchmark.
Each row was measured paired against the same header with that one change taken out. Where a number
needs more than a row, it is below.

Six of these rows are a few percent, which is below what a paired harness can resolve. Most of them
do not rest on the paired harness alone, since instruction counts, one map per binary or probe
lengths settle them. Three do rest on it: the second fingerprint, the cache-line-aligned metadata
and the narrow value index. Read those as "measured, did not pay for itself, not re-tested on a
better instrument".

## From boost: the fingerprint word table, and a probe that terminates {#from-boost}

[boost](#boost) has a 256 entry table of pre-broadcast fingerprint words, and unordered_dense had
lost that somewhere. Building the word arithmetically costs an and, a compare, a shift, an or and a
multiply, all on the critical path of every probe, placement and erase, where one L1 load is
cheaper. Paired, integer misses come out 5 to 6% faster on both compilers, and big-value finds 14%
faster under gcc.

The other thing taken from boost is its terminating prober. That one is a correctness fix rather
than an optimization: it is [the miss bound](#miss-bound), with the eight keys that showed it was
missing.

## From folly F14, and then from Verstable: how wide should the counter be {#counter-width}

The group index keeps eight one-byte counters per group, one per fingerprint class. Folly's design
asks the obvious question: is one enough? That is measurable, and so are the other directions off
the shipped design. Every division of a group's eight counter bytes was built and measured on a
table at load 0.76 after 200 turnovers:

*Groups visited per miss, the share of misses that leave home, and time on the suite relative to the shipped design. Lower is better throughout, and bold is the best in each column. The churned column comes from the older instrumentation, which reads 1.26 groups where the instrument used everywhere else reads 1.06, so the four rows are comparable to each other but not to a number from another section.*

| counters per group | fresh miss | churned miss | misses continuing past home | time on the suite |
|---|---:|---:|---:|---:|
| 1, F14 style | 1.21 groups | 2.79 | 60% | 1.043 |
| 8, one byte each | 1.06 | 1.26 | 17.5% | **1.000** |
| 16 nibbles | 1.03 | **1.13** | **9.7%** | 1.014 |
| 32 two-bit | **1.02** | 1.15 and rising | rising | 1.012 |

A shared counter does not know the fingerprint class, so *any* overflow past a group makes every
later miss into it carry on. In a churned table most groups have seen an overflow, so 60% of misses
continue. That is 4% slower over the benchmark suite and 20% slower on churn.

**Finer** counters, sixteen nibbles, do filter genuinely better at no memory cost: 9.7% of churned
misses continue against 17.5%. They still lose, by 1.4%. A sub-byte counter is a load-mask-compare
on the read and a read-modify-write on the increment, paid on *every* lookup, to save a group hop
that was already rare. Two-bit counters filter best of all when fresh (1.3% continue) and are the
worst under churn, because their maximum of 3 is reached constantly and a saturated counter never
comes back down. A byte per class is the point where the counter is a single aligned load and still
knows the class.

Two more variants on the same axis. Consulting a *different* class at each step of the probe
(`(fp + d) & 7`) is exactly a no-op, as the arithmetic says it must be: a displaced sibling adds the
same *d* the miss does, so if they agree at step 0 they agree everywhere. Three fresh hash bits per
step does break that lockstep, and takes the churned miss from 1.262 groups to 1.238. It still
measures as noise, because that is 2% of the probe work on a path only 17.5% of churned misses
reach.

The fifth point on the axis comes from [Verstable](#verstable): an **exact** counter, a second set
of eight per group holding "entries of class *c* whose home *is* this group and which did not fit",
which is its in-home bit generalised. It was measured before any of it was written, on an
instrumented header that rebuilds the exact answer offline by hashing every occupied slot. At load
0.79 after 200 turnovers it takes a churned miss from 1.242 groups to 1.201. That is a quarter of
what moving displaced keys home is worth, for eight more bytes per group and a second invariant to
keep. (Its churned baseline is the older instrument's, so read the *difference* between the two
variants rather than either absolute against a figure from another chapter.) **About 80% of what the
approximate counter fails to filter is siblings**, keys that genuinely home in that group and
genuinely did not fit. Both tests say "continue" for those, and both are right. Being exact only
removes the strangers.

## From folly F14: double hashing instead of a triangular probe {#from-f14-probe}

The other transferable thing in [F14](#f14) is the probe sequence, and it aims at a real weakness
here. Under a triangular sequence every key homed in group *g* walks the same groups, so a
[sibling](#counters-by-class) sits exactly where a later miss for *g* will look. That is most of the
problem, the same 80% the exact counter above could not remove either.

Double hashing breaks it. The step comes from bits 8 to 15 of the hash, which neither the group (the
top bits) nor the fingerprint (the low byte) uses. Forcing it odd keeps the "visits every group
exactly once" property that the miss bound needs, and two siblings get different tours. It does
exactly what it is supposed to do. Groups visited per lookup, triangular against double hashed:

*Groups visited per lookup, lower is better. The second number of each pair is double hashing.*

|  | fresh miss | churned miss | fresh hit |
|---|---:|---:|---:|
| load 0.760 | 1.052 to **1.035** | 1.061 to 1.050 | 1.031 to 1.027 |
| load 0.799 | 1.086 to **1.054** | 1.122 to 1.096 | 1.039 to 1.033 |

**A third of the excess is gone, and it is still slower.** Paired on the benchmark suite, random
integer misses come out **9% slower**, builds 5%, big-value churn 3%. One map per binary says why:
**+4.6 instructions per lookup**, plus one more live register in the probe, in the placement and in
the counter walk, against 0.03 groups on a path that five percent of misses reach. Branch misses
even improve a little, 0.108 to 0.093, and that changes nothing.

It is the same answer as every other idea in this post that added work to a path that always runs.
The group compare and the counter have already taken the probe to 1.03 groups, so **the shape of the
sequence past home has nothing left to win.** Folly's comment is right about folly's map, where the
tour matters precisely because there is no per-class counter stopping a miss at home in the first
place.

## From emhash8: a second fingerprint in the spare index bits {#from-emhash8}

[emhash8](#emhash8)'s free fingerprint is the most tempting idea in this post to steal, because
unordered_dense's value index is also a `uint32_t` with spare high bits, and it is also loaded on
every hit. Eight bits there cost nothing until a table wants more than 2^24 slots.

Measured, it is **2.5% slower** on the geometric mean, and the losses are precisely on lookups: find
9%, big-value find 8%, random hit 7%, churn 8.5%. The reason is the one this whole exercise keeps
running into: **a filter only pays where nothing cheaper filtered first.** For emhash8 the trick is
free, because there is no group-level fingerprint and the word has to be consulted anyway. Here the
sixteen-way fingerprint compare has already rejected everything it is going to reject, so a second
check only adds an xor, a shift and a compare to the dependent chain of every lookup, to avoid a
value access on the 3% with a fingerprint collision.

## From indivi: the counters themselves, and the nibbles that did not follow {#from-indivi}

[indivi](#indivi)'s counters are the ancestor of these, and not much changed in the copy: the
fingerprint word remap (0 to 8, so that the class is unchanged), and unordered_dense's counters
living in the same block as the value indices. The third difference is the **termination bound**,
which indivi lacked until [it was reported](https://github.com/gaujay/indivi_collection/issues/2).
`find_impl` looped on `gIndex <= mGMask`, which the mask makes always true. indivi has had the bound
since September 2026.

The nibbles did not follow, and they were measured properly before being dropped. Here they are a
slot back-pointer per value (four extra bytes per entry) plus indivi's distance nibbles, so that
`erase(iterator)` needs no hash at all. On the one workload it exists for, find then `erase(it)`
then insert on a reserved table:

- with `std::string` keys, **1.10x faster**: 1006 to 888 instructions per round, one wyhash and two
  probes gone.
- with `uint64_t` keys, **1.10x slower**: 352 to 363 instructions. The saved hash is eight
  instructions and the back-pointer maintained on every insert costs more than that.
- on the benchmark suite, where every erase is by key and the back-pointer can only cost: 4%
  slower on the geometric mean, integer build 17% slower, big-value build 11%, integer churn 10%.
- memory 31 to 38 MB per million eight byte values.

So it is a real win for a real pattern. But the pattern needs an expensive key *and* an erase by
iterator, and a caller with both can call `erase(key)` with the hash their own `find` already paid
for.

## From abseil: a per-table seed {#from-abseil-seed}

[abseil](#swisstable) mixes a seed of its own into every hash, so that keys chosen against a known
hash cannot be aimed at a particular table. It is the one idea in this post that aims at an
adversary rather than at a workload, and it is cheap enough to report precisely. Here it works the
same way: `mixed_hash` returns `hash ^ m_seed`, with the seed scrambled from the table's own
address, so two live tables differ and ASLR makes two processes differ. One map per binary at 50,000
entries, that costs **one instruction and zero cycles** per lookup, 21.4 cycles against 21.4 on a
miss and 29.6 against 29.6 on a hit, with ns per operation identical to two decimals. On a *build*
it costs 3.5%, 7.13 to 7.38 ns per element, because the pipelined rehash is latency-bound and the
xor lands between the hash and the group address.

The rest of it is what makes this a feature rather than a patch. The seed has to travel with the
index it built, through both allocator-aware constructors, both branches of the move assignment, the
copy assignment and `swap`. That is six sites, and the test suite failed in 85 places until all six
were right, which says something good about the suite and is a fair statement of the surface area.
Eleven tests then still fail because they assert that `mixed_hash` returns an avalanching hash
*unchanged*, which a seed contradicts by design. Also, iteration order stops being reproducible
between runs.

So it sits behind a switch and is not the default, because the cost is paid by everyone and the
threat is not everyone's. abseil makes the opposite call, which is defensible for a library used at
a scale where somebody is always feeding you keys.

## From abseil and boost: cache-line-aligned metadata {#from-aligned}

[abseil](#swisstable)'s and [boost](#boost)'s groups are cache-line-aligned, which they get for free
because their metadata is 16 bytes. This was measured while the value indices were still a separate
array. A group's sixteen indices are exactly 64 bytes, and glibc hands back large allocations at 16
mod 64, so *every* group's indices straddled two cache lines. Giving the index array a 64 byte
aligned block type does what you would expect on lookups, find and hit both 2% faster, and costs
4-5% on builds and churn, for a net **0.7% loss** on the geometric mean. The likely mechanism is
conflict misses: with both arrays at power-of-two offsets, a group's metadata and its indices
collide in the same cache sets more often than when one of them is skewed.

## From CPython: a value index narrower than 32 bits {#from-cpython}

[CPython's compact dict](https://mail.python.org/pipermail/python-dev/2012-December/123028.html)
sizes its index to the table, one byte, two, four or eight. The equivalent here is a group type with
a `uint16_t` index, which makes the block 3.5 bytes per slot instead of 5.5 and puts two groups'
indices in one cache line. Over the thirteen workloads of the suite that fit under 2^16 entries it
is **1.4% slower**, with only random integer hits (3% faster) and string finds (2%) ahead, and churn
and big-value finds 3 to 4% behind. The reason kills the adaptive version too. A map small enough to
be indexed in 16 bits has an index of at most 128 KB, which is already in L2, so halving something
that already fits buys nothing. The narrow loads also cost a zero-extension on every use, and the
maps whose index footprint actually hurts are exactly the ones that need more than 16 bits.

# 19. Building the group index: growth, the compiler, the hash [&#8593; contents](#contents){:.up} {#building}

The three sections here are about unordered_dense 5.0 rather than about its index: how it grows,
what the two compilers do to it, and what hash it is handed. They are here and not in
[the group index chapter](#group-index) because a reader of the reference does not need them, and a
reader who wants to know where the group index's build and lookup times actually come from does.

## Growth: the pipelined rehash {#pipelined-rehash}

Only one thing rebuilds the index, and that is growth. Nothing degrades, so there is no repair
rehash to run. When the load factor is reached the group array doubles and every entry is placed
again. That is the cheap half of the map, because **the values do not move.** `m_values` is not
touched at all. The loop writes a fingerprint byte and a four byte index per entry, where a flat
map's growth moves every `value_type` into a hash-scattered slot. Per element rehashed at a million
`uint64_t` entries, `perf stat`: boost 97.5 instructions and 110.9 cycles against **51.9 and 46.7**
here, on the same 3.7 to 3.8 L1 load misses. Most of that comes down to the dense layout rather than
to the loop being clever.

The loop itself is unusually free, for two reasons that belong to the group index and not to the
dense vector. Placement is shift-free, so entries can go in **any order**. And every key is known to
be unique, so no key is ever compared and the value vector is read only for its hash. What is left
per element is a hash and a walk to the first empty lane:

```cpp
auto const word = fingerprint_word(mh);
auto const counter = word & 7U;
auto group_idx = static_cast<value_idx_type>(mh >> shifts);
value_idx_type delta = 0;
while (true) {
    auto& group = groups[group_idx];
    auto const empties = match_empty(group);
    if (empties != 0) {
        auto const lane = first_lane(empties);
        group.m_fingerprints[lane] = static_cast<std::uint8_t>(word);
        group.m_index[lane] = static_cast<value_idx_type>(value_idx);
        break;
    }
    if (group.m_overflows[counter] != 255) {
        ++group.m_overflows[counter];
    }
    group_idx = static_cast<value_idx_type>((group_idx + (++delta)) & mask);
}
```

The counters come out of that same walk. An entry that passes a full group increments that group's
counter for its class on the way past, exactly as an insert does. So the overflow state is rebuilt
by the pass that places, and there is no second one.

The two halves of an element want opposite things. A hash is a dependency chain that wants to run
far ahead of everything else, and a placement is a random write into an array that may not be in
cache. One element at a time they wait for each other, so the loop keeps **a ring of sixteen
hashes** and stays that far in front of itself: before placing element *i* it hashes element *i* +
16 and prefetches every line of the block that one will land in.

```cpp
auto const fetch = [&](std::size_t i) -> void {
    auto const mh = mixed_hash(get_key(*it));
    ++it;
    ring[i] = mh;
    prefetch_block(groups, static_cast<std::size_t>(mh >> shifts));
};
```

In cache the decoupling alone is worth **1.26x**, 2.05 to 1.63 ns per element at 200,000 entries,
with nothing prefetched that was not going to be read anyway. Out of cache what pays is the
prefetch, and only for a key whose hash gives the miss something to hide behind. A string rehash at
four million entries goes **30.6 to 12.4 ns per element**, and an integer one at 176 MB goes 12.6 to
12.5, which is to say nothing. That loop is not waiting on latency but on the TLB, 1.15 dTLB misses
per placement on 4 KB pages, and no prefetch hides a page walk.

The TLB is the one thing left on this loop, and it cannot be fixed inside it. Partitioning the
elements by the top bits of their destination group first, database style, does cut the dTLB misses
to 0.24 and halves the isolated rehash from four million entries up. Unfortunately, inside a build
it is worth 0 to 7% above 32 MB and nothing below, because a rehash is a minority of a large build
and the scratch it needs is fresh memory, faulted in at about a microsecond a page every time the
table doubles. Not kept. What the loop wants is 2 MB pages, which is [chapter
20](#still-on-the-table), and not something a library can ask for on the caller's behalf.

Two things about how the loop is written, both of them the same fact about aliasing. It walks
`m_values` with an **iterator** rather than indexing it, and it holds the group pointer, the mask
and the shift in locals and spells the placement out instead of calling `place_group`. Placing an
entry stores a `std::uint8_t` fingerprint, and a byte store may alias any object at all, including
the value container's own data pointer and everything else reached through `this`. So after every
placement an indexed read has to load that pointer back out of the container before it can even form
the address of the next key. That is a store-to-load chain through the entire rehash costing one
memory latency per element, because the random group access cannot start until it resolves. Walking
with an iterator instead took the growth phase from **10.43 ns per insert to 2.74** and the whole
200,000 element build from 16.72 ms to 8.96. gcc did not move at all, having disambiguated it on its
own, which is why I now compare the two compilers' absolute times against each other and not only
each against its own baseline.

A lookahead sounds like something every map would have, but as far as I can see none of them does.
Folly prefetches the *source* values of the chunk it is about to hash and then places synchronously.
Abseil's `GrowToNextCapacity` answers a different question: it moves the elements that stay in their
home group of the doubled array straight across and encodes the ones that would probe into a stack
buffer for a second pass, so nothing is hashed twice. Boost, indivi, emhash8, emilib, Verstable and
ihtab hash and place one element at a time with no prefetch at all. I ported the ring into a copy of
boost's rehash and it is a wash to a loss there, and the instruction counts above say why: that loop
is not waiting on a load, it is doing twice the work. So most of the win here comes down to the map
being dense, and the rest to a loop that has nothing to wait for.

## What the compiler decides {#compiler}

Two of the largest single numbers in unordered_dense 5.0 are not design changes at all.

`probe` is marked force-inline, because **gcc leaves it out of line in a large translation unit**.
Its unit-growth budget runs out, and the probe, bigger with the SWAR match, is what it stops
inlining. The whole design assumes the probe is inlined: the prefetch, the hoisted pointers and the
early exit only pay inside the caller. With the attribute, gcc's lead over 4.11.0 went from 1.15x to
**1.24x** with SSE2 and from 1.10x to 1.17x without, and the string lookups that were the one family
behind 4.11.0 came out ahead of it. clang measures 1.00 everywhere, having inlined it already.

And clang splits the insert path in two. `do_try_emplace` gets a six register prologue and calls
`do_place_element` out of line, which clang refuses to inline at cost 480 against a threshold of 250
(`vector::emplace_back` with `piecewise_construct` is 225 of that). Per insert on a reserved table,
net of the loop:

*Per operation on a reserved table, net of the benchmark loop, lower is better. The first two
columns are an insert that places, the third is `operator[]` on a key that is already there, which
never places.*

| compiler | unordered_dense, insert | boost, insert | unordered_dense, `operator[]` on a present key |
|---|---:|---:|---:|
| clang 22 | 128 instructions, 39 cycles | 64, 26.5 | 74 instructions |
| gcc 16 | 82 instructions, 26 cycles | 55, 23 | 68 instructions |

Forcing the inline takes the miss path to 100 instructions and 32 cycles, and it raises `operator[]`
on a *present* key from 74 to 88, because the merged function pays the placement code's register
pressure on a path that never places. Paired on the benchmark suite that came out 1.2% faster with
every interval excluding parity, so the attribute went in.

**I removed that attribute once, on a measurement, and put it back the same day on a better one.**
The scored benchmark is ~90 translation units of test suite. That is the largest unit anyone
compiles this header into, and its inlining budget is already spent, so an `always_inline` there
displaces something else. A caller's translation unit holds one map. Measured that way, building
from empty, with the attribute against without:

*One map per binary, building from empty, lower is better.*

| entries | with the attribute | without | instructions with | without |
|---:|---:|---:|---:|---:|
| 32,000 | **251,633 ns** | 287,833 | **5.08M** | 5.98M |
| 200,000 | **1,749,840 ns** | 2,087,600 | **28.09M** | 33.71M |
| 1,000,000 | **13,064,800 ns** | 15,670,600 | **162.3M** | 190.4M |

**14 to 20% slower without it at every size**, on 17 to 20% more instructions retired. The
instruction counts are what settle it, because neither code layout nor drift can move them.

So the rule this leaves is narrower than "one map per binary": **the size of the translation unit
decides what an `always_inline` is worth, a benchmark binary is the largest unit anyone compiles
this header into, and an instruction count is the only number in the argument that none of it
moves.**

## The hash it is given {#the-hash}

A hash for a map is chosen on **latency**, not throughput, because its result is the address of the
group to probe and nothing after it can start. That sounds obvious, and it orders candidates by more
than 2x. An AES-NI hash is a quarter faster in a hashing loop and 9 to 37% slower on every single
workload inside unordered_dense. The worst case, 37%, is a random hit, which cannot overlap
anything; the mildest, 9%, is a build, whose rehash hashes sixteen ahead. One hasher per binary, 30M
all-hits lookups: AES executes **fewer instructions** (5.15G against 5.35G) and takes **59% more
cycles**, IPC 1.30 down to 0.79. That is a dependency chain, not extra work.

**So the hash this library ships is a wyhash that has been rewritten for latency**, and it is no
longer interchangeable with upstream wyhash, since it produces different values. Four changes, all
of them shortening the dependent chain rather than removing work:

- **8 to 16 bytes: two overlapping 8 byte reads**, instead of assembling two words out of four
  4 byte reads and shifts. That one is [rapidhash](https://github.com/Nicoshev/rapidhash)'s, and
  short keys were the only place rapidhash was ahead.
- **17 to 144 bytes: every 16 byte block mixed on its own** with its own pair of secrets and
  xor-folded into one finalizer, where wyhash chains the blocks through `seed`. A 48 byte key used
  to be three multiplies in a row before the finalizer could start. Now it is one multiply plus the
  finalizer at any length in the range.
- **Above 192 bytes: six independent lanes** rather than three, so the multiply chain over a long
  key is half as long.
- **An independent tail** above 48 bytes: the last 16 bytes are mixed from secrets alone, so that
  work runs beside the lanes instead of behind them.

What none of it does is drop a multiply. The block range is two dependent multiplies, and the second
one exists only to repair the bits a single product leaves weak. Removing it fails an avalanche test
outright at every length, so it stays even though it sits on the critical path.

Here is what that is worth against the hash each of the other libraries ships: same keys, same
process, every hasher interleaved round by round. Latency is measured by writing one byte of each
answer into the *next key before hashing it*, so that no two hashes can overlap and each one waits
on the last.

*Latency in ns per hash, lower is better, and bold is the fastest at each length. `mix` is the
scored suite's own keys, 8 to 135 bytes and skewed short, so the length dispatch is as unpredictable
as it is in a real table. Every number includes the chain's own cost, which a hash that does no work
(`size ^ first byte`) measures at 1.51 to 1.55 ns. Median of three runs in fresh processes, which
agreed with each other to within 0.9% on every cell.*

| hash | 8 B | 16 B | 32 B | 64 B | 128 B | 256 B | mix |
|---|---:|---:|---:|---:|---:|---:|---:|
| unordered_dense 5.0 | 5.60 | 5.59 | 5.99 | 6.41 | **7.33** | **9.50** | **6.29** |
| unordered_dense 4.11.0 | 5.58 | 5.59 | 6.74 | **6.29** | 8.68 | 9.50 | 6.94 |
| `absl::Hash` | **5.23** | **4.84** | **5.03** | 6.98 | 8.66 | 11.14 | 6.35 |
| `boost::hash` | 6.16 | 9.55 | 10.02 | 10.68 | 12.27 | 18.91 | 9.48 |
| `folly::hasher` | 8.02 | 13.06 | 13.08 | 17.83 | 27.51 | 32.52 | 15.51 |
{: .heat-low}

[![Latency of five string hashes against key length, 4 to 1024 bytes: unordered_dense 5.0 and 4.11.0, absl::Hash, boost::hash and folly::hasher](/img/2026/hashmap-index/hash-latency.svg)](/img/2026/hashmap-index/hash-latency.svg)

The shape is a staircase, because every one of these hashes dispatches on length, and the steps are
where each of them changes strategy: boost and folly both step at 16 bytes, this hash at 16 and
again every 16 up to 144, abseil at 32. The band is where this post's string keys live, which is
where a real table's keys tend to live too. Everything to the right of it is a hash benchmark's
territory more than a map's. The two slow lines cross the top of the axis in the last few dozen
bytes: at a kilobyte boost is at 66.9 ns and folly at 59.7.

Net of the chain, on the scored mix: **4.8 ns for this hash and for abseil's, 5.4 for 4.11.0's, 8.0
for boost's and 14.0 for folly's**. Every percentage below is net of the chain, since that constant
is not part of anybody's hash. Four things in that table need saying.

**`absl::Hash` is the one to beat, and up to 32 bytes it wins.** It has 9 to 22% lower latency than
this hash at 8, 16 and 32 bytes, and 12 to 23% higher at 64, 128 and 256. On the scored mix, which
is mostly short keys, the two are level to within the noise. That is the number behind the own-hash
control rows in [the workload tables](#same-workloads): giving abseil its own hash costs it 1 to 4%
and nothing else, because what it ships is as fast as what the harness hands it.

**`boost::hash<std::string>` is 1.7x**, and that is the whole of boost's own-hash column. It is what
turns a map that is 13% ahead of unordered_dense on a string hit into one that is 14% behind.
Boost's index is excellent, and its default string hash is what a caller actually gets.

**`folly::hasher<std::string>` is 2.9x**, which surprised me. It is `SpookyHashV2`, a 2012 design
built for throughput on long inputs, and F14 uses it for every string key unless you say otherwise.
Of these five it has the highest latency at every length measured, by a factor of two over boost's
at 128 bytes.

**And the latency rewrite of this hash is worth 12% on the mix, all of it between 17 and 144
bytes.** 4.11.0 is identical below 17 bytes, where the short path was not touched, and identical at
256, where the lane loop was not touched either. The 17% at 32 bytes and the 23% at 128 are the
independent-block change and nothing else. It also lost 3% at 64 bytes, which is the price of mixing
a block that a chained version would have folded into the seed for free.

In throughput the ordering is the same and the margins are wider: on the mix, 2.22 ns for this hash,
2.25 for abseil's, 2.37 for 4.11.0's, 4.48 for boost's and 8.80 for folly's. That is the panel most
hash benchmarks report, and it is not the one a map pays.

**One warning about measuring this**, because I got it wrong first. Four further latency tunings,
fewer length branches, the length out of the finalizer, and both together, looked decisive in a
standalone harness: 1.40x, with clang and gcc agreeing to 0.02 ns. Inside the map they were worth
exactly nothing. That harness made lengths unpredictable by chaining through key *selection*, `x =
hash(keys[x & mask])`, which puts the key's **length and address** on the dependency chain. A real
lookup has no such edge, since the caller already holds the key: its length is known before the hash
starts and only the bytes are loaded. The table above chains through the key's *contents* for that
reason.

# 20. What is still on the table [&#8593; contents](#contents){:.up} {#still-on-the-table}

Things I know are worth something and have not done. They are all about my own map, with one
exception: huge pages, where boost gains as much as unordered_dense does.

**Twelve instructions per hit, and I do not know where they go.** This is the one new thing writing
this post handed me, and it came from a map I had never heard of before. At 50,000 entries, all
hits, one map per binary: `indivi::flat_wmap` executes **48.3 instructions** and
`ankerl::unordered_dense` **60.8**. The gap holds at a thousand entries and at a million. Part of it
is structural and is not coming back, since the value index is a load a flat map does not do. The
rest is one byte of metadata per slot against 5.5, no counter load on the path, and slot addressing
instead of group-and-lane arithmetic. Twelve instructions on a path that retires two per cycle are
15% of a hit in cache. I went looking in the probe *sequence* and in the window *alignment*, and
both were dead ends. If there is an answer, it is in the instruction stream.

**Inlining is not it**, which is the first guess and has been measured twice: force-inlining the
lookup moves cycles and leaves the instruction count where it was. What is left is the register
allocator. On identical source clang executes 106.8 instructions per reserved insert where gcc
executes 68.9, because clang spills the probe's loop state at function entry where gcc sinks the
same spills into a branch a miss never takes. That is the same order as the twelve instructions
above. The cheap experiment is to build both maps under gcc, one per binary, and I have not run it.

**Huge pages are worth 22% of a large lookup and nothing asks for them.** A dense map touches two
regions per lookup where a flat map touches one, and that shows up in the translation: at 800,000
entries and all hits, unordered_dense 5.0 takes 1.48 dTLB misses per lookup against boost's 0.89.
Transparent huge pages are set to `madvise` on this machine, which is a common default, and neither
map ever madvises. Handing both an allocator that `mmap`s 2 MB-aligned and `madvise(MADV_HUGEPAGE)`s
takes unordered_dense from 17.10 to 13.32 ns per hit and boost from 9.75 to 7.58, both about 22%. At
200,000 entries it does nothing at all, which is exactly the regime my own suite cannot see. It
belongs in an opt-in allocator rather than in the container.

**Prefetching should probably be tuned per architecture and is not.** Boost tunes it and says so in
a comment: *"ARM architectures get a higher speedup when around the first half of the element slots
in a group are prefetched, whereas for Intel just the first cache line is best."* unordered_dense
5.0 issues the same two prefetches everywhere. On x86 I found nothing to tune that is right for both
compilers. Dropping the second one is a clang win of 5 to 11% and a gcc loss of up to 12% at four
million entries, because the two schedule the prefetches differently against the load that is
actually on the critical path. The ARM half of the question is unasked.

**A statistics facility.** Boost has one: `BOOST_UNORDERED_ENABLE_STATS` keeps running mean and
variance of probe lengths and comparisons per lookup, and indivi has `GroupStats` for the same
purpose. Every probe-length number in this post was produced by hand editing a copy of a header. Of
everything I read in another map, this is the only one that is a feature rather than a fix.

**F14VectorMap's string miss, which is the one column I cannot explain away.** It is the closest
relative `ankerl::unordered_dense` has, the only other dense map here with a four byte value index
in front of a contiguous vector, and overall it loses: 1.27x behind on integer keys and 1.71x on a
build. On a *string* lookup it is ahead. One map per binary, 20 million lookups at 32,000 entries,
three runs across a day agreeing to a fifth of a nanosecond: **the hit is a tie** (24.33 against
24.29 ns) and **the miss is 8 to 9% behind** (18.68 against 16.95). The hash is not it, since both
maps are handed the same one. Neither is the load factor, both holding 4,096 groups of 7.8 entries,
and neither is the value indirection, which F14Vector has too. What the counters leave is eight
instructions of ordinary difference between two probe loops, plus **1.3 more L1 fills** from [the
two index prefetches](#probe-assembly) that are issued before a fingerprint has been compared. On a
miss that matches nothing they fetch a line that is never read, and they stay anyway, because
dropping one costs gcc 12% at four million entries. Half of the rest is clang leaving the lookup out
of line for `std::string` keys where it inlines it for `uint64_t`, and force-inlining it costs gcc
16% on integer misses, so it is not applied.

**The string erase's 50 ns.** A dense erase hashes the moved element's key. For an integer that is
free, for a string it is about 50 ns, and it is the largest single avoidable cost I know of in this
library. The fix is a back-pointer per value, and it loses on the suite as a whole. Something
narrower, a back-pointer only when the key is expensive to hash, decided at compile time, has not
been tried.

# 21. What reading eighteen indexes changed my mind about [&#8593; contents](#contents){:.up} {#changed-my-mind}

Four things, and none of them is the one I expected.

**The miss is finished. The hit is not.** Stopping a miss early is the question every design in this
post is built around, and it is answered. With a group compare and an explicit test for "did
anything of my class overflow past here", [a probe visits between 1.01 and 1.06 groups](#drift),
fresh or long-churned, hit or miss. Every idea I took from another map to shorten it further
measured as noise or worse: [double hashing](#from-f14-probe), [an exact in-home
test](#counter-width), [finer counters](#counter-width), [a second fingerprint](#from-emhash8). The
hit is a different story. On a **hit**, the plainest index in this post executes [48 instructions
where mine executes 60](#still-on-the-table), and I cannot account for the difference. So the axis
with all the design ideas on it is closed, and the boring one is still open.

**What the eighteen agree on, if you are writing one.** Four things earn their keep in every map
here that has them. Compare **sixteen slots at once** rather than one, which is what turns a probe
from a run of coin flips into a single question, and in this post it is worth more than any probe
sequence, any fingerprint width and any of the other tuning. Answer "absent?" **explicitly**, with
an overflow bit or a counter, rather than by looking for an empty slot: that is [1.4 to 1.7x of a
miss](#summary-table) between two otherwise nearly identical SwissTables. Avoid **tombstones** if
the table will ever churn at a fixed size. Boost is the best of the tombstone designs and it is
still repairing itself with [an in-place rehash every 120,000 to 150,000 erase-insert
pairs](#boost-erase), and the family's failure mode is [a table that grows while its live count
stands still](#ixhtab). And **bound the probe**, because a design that stops only when its own
metadata says so will not stop at all on keys chosen to defeat it. [Two maps in this post, mine
included](#miss-bound), shipped without that bound.

**What survives a re-measurement is not what I would have guessed.** The structural differences
never move: iteration is an order of magnitude, memory at a 64 byte value is 1.6x, and a tombstone
design under fixed-size churn is a different *curve* rather than a different constant. The
differences between two maps of the same family are 3 to 15%, and those do move. The paired harness
got two changes' signs backwards in this post, and the size of two more badly wrong, all in exactly
that band. That is the uncomfortable part of publishing this, and also the useful part: **the family
is a decision you can take from a table like the ones above; the map inside the family is one to
take on your own workload, or not to bother taking at all.**

**Which index is fastest is not the question I would ask any more.** What I would ask is which one
you can still reason about when it is churning, when the hash is hostile, when the values are large,
and when the table has left cache. Those are the four places the ranking changes, and they change it
differently. [Question by question](#question-by-question) is as close to an answer as I have.

This got a lot longer than I planned when I started reading headers, and after all of it the honest
summary is that the miss is solved and the hit is not. Everything here is one machine and two
compilers, so the small numbers are mine rather than yours. Nevertheless, maybe you've learned a
trick or two, or come up with a better idea than any of the eighteen.

# 22. How the numbers were made, and how to remake them [&#8593; contents](#contents){:.up} {#how-measured}

Everything above was measured on one machine: a Ryzen 9 7950X, Fedora, clang 22.1.8 at `-O3
-DNDEBUG -std=c++20`, **default `-march`**, so plain x86-64, SSE2 and nothing newer. (C++20 is the
harness's dialect rather than any library's: F14 needs it, and every map then gets the same one.)
That last one is not a detail. `-march=native` silently upgrades these SSE2 intrinsics to AVX-512 on
this machine, `vpcmpeqb` into a mask register with no `pmovmskb` at all, so a profile taken that way
is not the code most callers run.

**Every map is given the same hash**, unordered_dense's wyhash, because what is being compared is
the index. Each library has its own way of being told a hash is already well mixed, and all three
had to be used: boost and unordered_dense 5.0 read a member typedef `is_avalanching`, folly reads
`folly_is_avalanching`. Without folly's, F14 puts an extra CRC32 step in front of every lookup and
is no longer running the same hash as everyone else. abseil XORs a per-table 16 bit seed into a
non-default hash, which is not something a caller can turn off, and does no other mixing.

**Boost and abseil also appear with their own hash**, as a control, because "same hash for all" is
the right way to compare indexes and it is *not* what a caller gets by typing the type name. For an
integer key `boost::hash<uint64_t>` and `absl::Hash<uint64_t>` are cheaper than this wyhash, which
shows up plainly in the tables. For a string it goes the other way.

**Every ratio is a geometric mean over five sizes spanning one doubling**, for the reason given
under [what a lookup is made of](#what-a-lookup-is-made-of): two maps with different maximum loads
double at different sizes, so their sawtooths are out of phase, and one size compares one map near
the top of its cycle with the other wherever its own cycle happened to be. It changes answers rather
than refining them. On unordered_dense's own suite, churn against boost read **19% in
unordered_dense's favour at one size and 22% in boost's over the octave**, and big-value churn 24%
and 20%. This is the one thing I would most like other people's benchmarks to adopt. Same-family
comparisons are safe however they are sampled, because two builds of the same map are in phase and
it cancels; cross-family ones are not.

**The alternatives run interleaved.** [nanobench](https://nanobench.ankerl.com)'s `compare()` runs
one epoch of each map per round, in one process, so a clock ramp or a noisy neighbour lands on all
of them and cancels out of the ratio. Measuring map A to completion and then map B is how two runs
of *identical* work came out 140% apart in an earlier version of my own sweep tool.

**Two independent runs of everything, and they mostly agree.** Of 378 integer ratios, 372 are within
5% of each other between the two runs, and the worst is 1.12, on iteration at a thousand entries.
The string ones are noisier, 309 of 336 within 5% and worst 1.18, because a string workload spends
most of itself in the hash and the allocator. Every number quoted above is the geometric mean of the
two runs, and I would not defend any single one of them to better than 5%.

**Anything under 10% is decided with one map per binary, and hardware counters.** A binary holding
several maps has a code layout that moves every time any of them changes, by more than the effect
being measured. I have watched a same-code control read 8% slower in one run and 13% faster in the
next, in a benchmark that never touches the map. `scripts/ab/maps_one.cpp` builds one binary per map
per workload for that reason, and every "instructions per lookup" number in this post comes from it.

**And the size of the translation unit is itself a variable, which I learned the hard way.** The
tables above put eighteen maps in one unit, the benchmark that scores my own map is ninety files of
test suite, and a caller's is one map plus their own code. Those are three different inlining
budgets, and a function sitting near the compiler's threshold compiles differently in each. Measured
on [one `always_inline` in unordered_dense](#compiler), the same change is 15% faster on a build in
ninety-file unit and 14 to 20% *slower* in the one-map unit, on 17 to 20% more instructions retired.
So the build column of [the workload tables](#same-workloads) is not quite what a caller gets from
any of these maps, mine included, and where a number here decides something I have taken the
instruction count rather than the time, because a translation unit cannot move that.

The clearest instance of that I have is [abseil's per-table seed](#borrowed). Paired, two headers in
one binary, it read **6% slower on builds, 6% on random misses and 3% on random hits**: three
workloads all pointing the same way, which is exactly what a real regression looks like. One map per
binary says it costs **zero cycles** on both lookup paths. The control in that same paired run, a
hash benchmark that never touches a map, read 2.7%. If I had stopped at the paired numbers I would
have written up a 4% lookup regression that does not exist. (Its 3.5% on a build is real, and is why
the seed is offered behind a switch rather than dismissed.)

**No workload replays.** Every lookup rng lives in a state that outlives the epochs. A benchmark
whose per-epoch batch is small enough to memorise will have its hit-or-miss sequence learned by a
TAGE-style predictor, which flatters whichever design has the most branches. Measured at **2.7x** on
a scalar robin hood probe, which is enough to reverse a ranking, and I have made this mistake twice
in two different tools.

**Churn inserts fresh keys.** A churn loop that recycles its insert keys from a small spare pool
under-reports probe-length drift by half, because a key that comes back soon tends to land in the
home it just left.

**And the allocator is tamed.** `mallopt(M_MMAP_THRESHOLD, 64 MB)`: a build from empty asks for
megabytes and gives them straight back, and glibc returns anything above its threshold to the OS, so
a benchmark that repeats the build faults the same pages in every time. That was 38% of the cycles
in the kernel, and it is worse than noise, because whether it is paid depends on what ran before in
the process.

To reproduce any of it:

```sh
# every map, every workload, three octaves, interleaved in one process
scripts/ab/maps.sh speed u64        # or str, or big for a 64 byte mapped value
scripts/ab/maps.sh memory u64
# every adapter checked against the group index, operation for operation
scripts/ab/maps.sh check u64
scripts/ab/maps.sh -s check u64     # ... and again under ASan and UBSan
# one map per binary, under perf stat
scripts/ab/maps_one.sh hit 50000 30000000
# groups visited per lookup: load, turnovers, writing lookups per churn round
scripts/ab/probe_length.sh 0.799 200 0
# bucketized against sliding-window placement, simulated, no map involved
clang++ -O2 -std=c++17 scripts/ab/placement.cpp -o placement && ./placement 0.799
# move_home on and off, one map per binary; the last argument 0 is the control
scripts/ab/move_home.sh miss 838860 20 1 4000000
```

`maps.sh` compiles in whatever it finds, and the environment variables it reads for the other
libraries' checkouts are documented at the top of it. Every adapter is checked against
`ankerl::unordered_dense` over 400,000 mixed operations before any timing is believed, which is what
caught Verstable's `vt_insert` being `insert_or_assign` rather than `try_emplace`. The honest
counterpart is `vt_get_or_insert`.

# Appendix: sources and versions [&#8593; contents](#contents){:.up} {#appendix}

Every code block above is quoted verbatim from one of these, at the commit given. Line numbers move;
the file and the symbol do not.

| map | version | quoted from | upstream |
|---|---|---|---|
| `ankerl::unordered_dense` 5.0 | branch `claude/group-index` | `include/ankerl/unordered_dense.h`: `basic_group`, `make_fingerprint_words`, `group_storage::block`, `probe`, `place_group`, `uncount`, `move_home` | [martinus/unordered_dense](https://github.com/martinus/unordered_dense) |
| `ankerl::unordered_dense` 4.11.0 | tag `v4.11.0` | same file: `bucket_type::standard`, `probe_scalar`, `probe_simd` | [martinus/unordered_dense](https://github.com/martinus/unordered_dense) |
| abseil `flat_hash_map` | 20250814.1 | `absl/container/internal/hashtable_control_bytes.h`: `ctrl_t` and its `static_assert`s, `GroupSse2Impl`. `absl/container/internal/raw_hash_set.h`: `H1`, `H2`, `probe_seq`, `find_large`, `CapacityToGrowth` | [abseil/abseil-cpp](https://github.com/abseil/abseil-cpp) |
| boost `unordered_flat_map` | 1.90 | `boost/unordered/detail/foa/core.hpp`: the `group15` design comment, `match`, `is_not_overflowed`, `mark_overflow`, `match_word`, `pow2_quadratic_prober`, `table_core::find` | [boostorg/unordered](https://github.com/boostorg/unordered) |
| folly F14 | `65749da`, 2026-09-04 | `folly/container/detail/F14Table.h`: `F14Chunk`, `splitHashImpl`, `probeDelta`, `findImpl` | [facebook/folly](https://github.com/facebook/folly) |
| emhash8, emilib | `20a28e8`, 2026-09-05 | `include/emhash/hash_table8.hpp`: `Index`, `EMH_EQHASH`, `EMH_NEW`, `find_filled_slot`. `include/emilib/emihmap1.hpp`: `State`, `hash_key2` | [ktprime/emhash](https://github.com/ktprime/emhash) |
| indivi `flat_umap`, `flat_wmap` | `27ff2ce`, 2025-08-12; the probe bound of [#2](https://github.com/gaujay/indivi_collection/issues/2) landed after it, in `9ff9dc6` | `src/indivi/detail/flat_utable.h`: `MetaGroup`, `match_word`, `get_overflow`, `dec_overflow`, `get_distance`, `find_impl`. `src/indivi/detail/flat_wtable.h`: `MetaWGroup` | [gaujay/indivi_collection](https://github.com/gaujay/indivi_collection) |
| Verstable | `dd83033`, 2025-05-06 | `verstable.h`: the metadatum masks, `vt_hashfrag`, `MAX_LOAD` | [JacksonAllan/Verstable](https://github.com/JacksonAllan/Verstable) |
| ihtab, ixhtab | `1405f8e`, 2026-06-26 | `ihtab.hpp`: the group constants, `do_1`, `rebuild`. `ixhtab.hpp:290` for the bug | [vnmakarov/ihtab](https://github.com/vnmakarov/ihtab) |
| `std::unordered_map` | libstdc++, gcc 16 | -- | -- |

The harness is `scripts/ab/maps.h`, `maps.cpp`, `maps_one.cpp`, `maps.sh` and `maps_one.sh` in the
unordered_dense repository, and the figures are generated by `scripts/ab/diagrams.py` and
`scripts/ab/mapsplot.py` in the same place, so every chart in this post can be redrawn from its CSV.

Thanks to the authors of all of these for writing headers that explain themselves. Boost's
`group15` comment, abseil's `static_assert`s, folly's note on why not linear probing and indivi's
saturation assertions are all better documentation than most papers, and about half of this post is
me reading them.
