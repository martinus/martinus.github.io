---
layout: post
title: The Index Structures of Fast C++ Hash Maps
subtitle: "What SwissTable, Boost, F14, emhash8, emilib, indivi, Verstable, ihtab and unordered_dense put in front of their keys: every design read from its source, drawn to one scale, and measured on one machine"
cover-img: /img/2026/hashmap-index/cover.png
share-img: /img/2026/hashmap-index/share.png
---

<style>
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
.blog-post table.grid th { font-weight: 400; padding: 3px 9px; white-space: nowrap; }
.blog-post table.grid thead th { font-weight: 600; }
.blog-post table.grid td { text-align: right; font-variant-numeric: tabular-nums; padding: 3px 9px; }
.blog-post table.grid td.na { color: #6b7280; }
.blog-post table.grid .f1 { background: #e8f1fd; }
.blog-post table.grid .f2 { background: #cfe3fb; }
.blog-post table.grid .f3 { background: #aed1f7; }
.blog-post table.grid .f4 { background: #8bbdf2; }
.blog-post table.grid .s1 { background: #fdf0e3; }
.blog-post table.grid .s2 { background: #fbdfc2; }
.blog-post table.grid .s3 { background: #f7c99b; }
.blog-post table.grid .s4 { background: #f2b273; }
.blog-post table .f1, .blog-post table .f2, .blog-post table .f3, .blog-post table .f4,
.blog-post table .s1, .blog-post table .s2, .blog-post table .s3, .blog-post table .s4 {
  padding-left: 6px; padding-right: 6px; }
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
   so the leanest cell is untinted and the rest deepen away from it. `data-invert` names the columns
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
  [].forEach.call(document.querySelectorAll('table.heat-par, table.heat-low'), function (t) {
    var par = t.classList.contains('heat-par');
    var inv = (t.getAttribute('data-invert') || '').split(',').map(function (s) { return s.trim(); });
    var head = [].map.call(t.querySelectorAll('thead th'), function (th) { return th.textContent.trim(); });
    var sections = [[]];
    [].forEach.call(t.querySelectorAll('tbody tr'), function (tr) {
      if (filled(tr) <= 1 && sections[sections.length - 1].length) { sections.push([]); }
      if (filled(tr) > 1) { sections[sections.length - 1].push(tr); }
    });
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
        cells.forEach(function (td, i) {
          var d = Math.abs(Math.log(vals[i] / ref) / Math.LN2), b = -1;
          if (d >= EDGE[0]) { b = 3; for (var k = 1; k < EDGE.length; k++) { if (d < EDGE[k]) { b = k - 1; break; } } }
          if (b >= 0) { td.className = (par && vals[i] < 1 ? FAST : SLOW)[b]; }
        });
      }
    });
  });
  }
}());
</script>

Every fast hash map is decided by a few bytes you never see. Before it touches a key it reads
something smaller: a control byte, a tag, a fingerprint, a distance, a counter. That metadata is
where the differences between the fast C++ hash maps live. The rest -- open addressing, a power of
two capacity, a good hash -- they all agree on.

This post reads the index of every fast C++ hash map I could get to compile, draws it to the same
scale, and asks each one the same five questions. It is meant as a reference: if you want to know
what `absl::flat_hash_map` does when a lookup misses, or why `boost::unordered_flat_map` slows down
in a table that only churns, or what folly's `outboundOverflowCount_` is for, the chapter is there
and it quotes the source. At the end there is a table with every design in it, and the same
workloads run on all of them on one machine.

unordered_dense appears here in two versions and both are mine: 4.11.0, which is the released
robin hood design, and 5.0, which replaces its index and is **unreleased at the time of writing**.
Take my measurements of my own map with whatever salt that deserves.

Numbers appear where they make a design easier to understand, not as a ranking. They are all from
one desktop, every map is handed the same hash, and every ratio is a geometric mean over a range of
table sizes rather than a measurement at one size, wherever it compares one map with another --
which matters more than it sounds like it should. [How the numbers were made](#how-measured) says why, and how to reproduce all of it.

**They come in two kinds, and it is worth knowing which one you are reading.** A number about a
*design* comes from running every map on the same workload, and it names the maps it compares. A
number about an *idea* comes from building that idea into unordered_dense 5.0 and measuring the
header against itself; those say so, and where one says **on the suite** it means the geometric mean
of the fifteen workloads of unordered_dense's own benchmark. The second kind says what an idea was
worth in one map, which is a weaker claim than what it is worth in general. The three chapters made
of it are gathered at the end: [what it took from the others](#borrowed),
[how it was built](#building), and [what it has not answered](#still-on-the-table).

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
    * [What it would take to steal this](#wmap-steal)
11. [The group index: unordered_dense 5.0](#group-index)
    * [Eight counters, by fingerprint class](#counters-by-class)
    * [The miss bound](#miss-bound)
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
    * [What reading eighteen of them changed my mind about](#changed-my-mind)

**How it was measured**

{:start="21"}
21. [How the numbers were made, and how to remake them](#how-measured)
22. [Appendix: sources and versions](#appendix)

# 1. Five questions every hash map index answers [&#8593; contents](#contents){:.up} {#five-questions}

Every map in this post is an [open addressing](https://en.wikipedia.org/wiki/Open_addressing) hash
table: the entries live in one flat array of slots, and a key that finds its slot taken looks for
another one nearby instead of going onto a linked list. Here is the shape of it, and the five
questions are the five things this picture has to decide.

[![An open addressing lookup: hash the key, take the home slot from some bits of it, compare the metadata, probe on](/img/2026/hashmap-index/hashmap-basics.svg)](/img/2026/hashmap-index/hashmap-basics.svg)

A lookup, an insert and an erase are all made of the same five questions, and every design below is
a different set of answers to them.

1. **Home: where does this key belong?** Some bits of the
   [hash](https://en.wikipedia.org/wiki/Hash_function) pick a slot or a group of slots. Which bits
   matters more than it looks: if the fingerprint and the home come from the same part of the hash
   they are correlated, and most designs here take them from opposite ends on purpose. Verstable's
   header says so outright, *"We take the highest four bits so that keys that map (via modulo) to
   the same bucket have distinct hash fragments."*

2. **Here? Is the key in this slot, or this group?** This is what the metadata is for. A
   **fingerprint** (also called a tag, a hash fragment, an H2, or a reduced hash value: the same
   idea under five names) is a handful of hash bits stored beside the slot. If it does not match,
   the key cannot be here, and the map has saved itself a load of the key and a comparison. If it
   does match, it is probably here, and the map goes and checks.

3. **Absent? When may a miss stop?** This is the question that separates the designs, and the one
   worth reading each chapter for. Something has to tell a probe that the key it is looking for is
   not further along. An **empty slot** does it: if the key existed it would have been placed at
   the first free slot on this sequence, so an empty slot proves absence. So does
   [robin hood](https://en.wikipedia.org/wiki/Hash_table#Robin_Hood_hashing)'s ordering, and
   boost's overflow bit, and F14's overflow counter, and Verstable's in-home-bucket bit. The
   answers cost different amounts and they are not equally exact.

4. **Where next? What does the probe sequence look like, and where does an insert land?**
   [Linear](https://en.wikipedia.org/wiki/Linear_probing),
   [quadratic](https://en.wikipedia.org/wiki/Quadratic_probing), triangular over groups,
   [double hashing](https://en.wikipedia.org/wiki/Double_hashing), or a chain threaded through the
   metadata itself.

5. **Gone: what does an erase leave behind?** The awkward one. If a map answers "absent" with "I
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

A few more words I will use without explaining again: a **group** is the run of slots a map
compares in one instruction, usually 14, 15 or 16; a slot's **home** is the group or bucket its key
hashes to; **displacement** or **distance** is how far from home it ended up; the **load factor**
is how full the table is, and every map here has a maximum after which it doubles.

# 2. What a lookup is made of [&#8593; contents](#contents){:.up} {#what-a-lookup-is-made-of}

Three things cost time in a hash map lookup, and it helps to know which one a design is spending.

1. **Dependent loads.** The hash produces the address of the metadata; the metadata produces the
   address of the key -- or, on a dense map, an index, which produces the key and the value
   together one link further along. Nothing on
   that chain can start early, so each link costs a full
   [cache miss](https://en.wikipedia.org/wiki/CPU_cache) once the table is bigger than the cache.
   This is the dominant cost for large tables, and it is why the number of *regions* a lookup
   touches matters as much as the number of bytes.

2. **Branch mispredictions.** A [branch](https://en.wikipedia.org/wiki/Branch_predictor) whose
   outcome is data-dependent and unpredictable costs about sixteen cycles when it is wrong. "Is
   this bucket occupied?" asked once per bucket is a coin flip; "did any of these sixteen
   fingerprints match?" asked once per group is not. That difference is most of the gap between the
   scalar designs and the [SIMD](https://en.wikipedia.org/wiki/Single_instruction,_multiple_data)
   ones, and it shows up again and again below.

3. **Instructions.** These are the cheapest of the three. A modern core retires four a cycle, and a
   lookup that waits on memory has slots to spare. A design that saves instructions on a path that
   is already stalled saves nothing, which is the reason several clever-looking ideas in this post
   lost.

There is a fourth thing that is not a cost but decides whether a measurement means anything.

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
tooth, and [the robin hood chapter](#robin-hood) says why. Those four are not the whole field --
[`indivi::flat_wmap`](#flat-wmap), which is not on this chart, swings wider than any of them -- and
an amplitude is only comparable to another taken on the same workload at the same sizes, which is
the trap the rest of this section is about.

Two things follow. A number quoted at one size is a number quoted at one arbitrary point of that
map's own tooth, and it can be 1.8x away from the same map's number one size along. And the teeth do
not line up: this octave nearly hides that, because a maximum load of 0.8 and one of 0.875 happen to
double at almost the same place for these sizes, but boost's slot count is not a power of two, and at
larger sizes its tooth walks out of phase with everyone else's.

That is why every ratio in this post is a geometric mean over the five sizes drawn as large dots,
rather than a measurement at one of them. It is not a refinement; it changes answers. Measured on
unordered_dense 5.0 against boost, churn at a fixed size read 19% in unordered_dense's favour
sampled at one size and **22% in boost's** averaged over the octave. The sign reversed.

**And the seven workloads, once, because they are named from here on.** **Build** from empty with no
reserve. **Hit**, **miss** and **50% hits**: random lookups on a freshly built table, with an rng
that never replays. **Iterate**, summing every mapped value. **Churn**, erasing one and inserting
one at a constant size, always with a key the map has never held. And **insert/erase**, a mix of
`operator[]` and `erase` on a table that grows and shrinks. Each is run on `map<uint64_t, size_t>`,
on `map<std::string, size_t>` with keys 8 to 135 bytes, and on a `uint64_t` key with a 64 byte
mapped value.

# 3. Three families: flat, dense, node [&#8593; contents](#contents){:.up} {#three-families}

Before the metadata, one decision splits the field: where the key and the value actually live.

[![Flat, dense and node maps, and what one lookup has to touch in each](/img/2026/hashmap-index/families.svg)](/img/2026/hashmap-index/families.svg)

Flat has the shortest chain and pays for it with every cost scaling in `sizeof(value_type)`, because
a hash-scattered slot is written whole. Dense writes four bytes there and appends the payload in
order, so iteration is an array walk and a large value costs the vector rather than the table, for
one more dependent load on every hit. Node maps keep references and iterators valid forever, and pay
an allocation per insert and a cache miss per lookup for it.

## Keys in the slots: flat {#flat-family}

`absl::flat_hash_map`, `boost::unordered_flat_map`, `folly::F14ValueMap`, `indivi::flat_umap`,
emilib, Verstable. The `value_type` is stored in the slot the hash picked. A lookup that gets a
fingerprint match reads the key from the same group it just read the metadata from, so it is one
region and a short chain. That is the fastest possible hit.

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
last one sounds like the obvious win, and building it into unordered_dense 5.0 measures **1.4%
slower** ([the borrowed ideas](#borrowed) has it): a table small enough to be indexed in 16 bits has
an index of at most 128 KB, which is already in L2, so halving something that already fits buys
nothing.

The price is one more dependent load on every hit: metadata, then index, then value. On a table
that fits in cache that is a few cycles; on a table that does not, it is a cache miss and a TLB
entry, and it is the one structural cost of the family. It is why boost is ahead of unordered_dense 5.0 on
a fresh lookup, and it is not going away.

The other price is subtler: erasing from the middle of a dense vector leaves a hole, so the usual
fix is to move the last element into it -- which means finding the *slot* that points at the moved
element, which means hashing its key again. For an integer key that is free and for a string key it
costs about 50 ns -- both measured in unordered_dense 5.0, in [its erase](#group-erase).

## Keys behind a pointer: node-based {#node-family}

[`std::unordered_map`](https://en.cppreference.com/w/cpp/container/unordered_map),
`boost::unordered_node_map`, `absl::node_hash_map`, `folly::F14NodeMap`. Each
element is its own heap allocation and the table holds pointers. What you buy is the strongest
guarantee available: references, pointers and iterators to an element stay valid for the element's
whole life, whatever else happens to the map. What you pay is an allocation per insert and a
pointer chase per lookup into memory the map does not control the layout of.

The three modern node maps are worth separating from `std::unordered_map`, because only the last one
is slow *by construction*. The standard requires a bucket interface -- `bucket(key)`,
`bucket_size(n)`, local iterators -- and a guarantee that a rehash happens only when the load factor
is exceeded. Together those force a bucket array of linked lists, and every conforming
implementation has one. The modern node maps keep a fast index (a SwissTable in abseil's case, a
`group15` in boost's, an F14 chunk in folly's) and put the node behind it, so everything in the
chapters below applies to them as well; they simply add one pointer chase and one allocation. In the
[measurements](#same-workloads) that is worth a lot on lookups and almost nothing on iteration.

# 4. Per-slot metadata or per-group metadata [&#8593; contents](#contents){:.up} {#per-slot-or-per-group}

Within open addressing, the second decision is how much the map is willing to store per slot, and
whether the metadata is read one slot at a time or a group at a time.

**One byte per slot, sixteen at a time.** SwissTable and everything descended from it. A byte holds
seven or eight bits of hash plus an encoding of empty and deleted; sixteen bytes are one SSE2
register; one compare and one `movemask` give sixteen verdicts and one unpredictable branch instead
of sixteen. The cost is that a byte is not much room, so anything else the design wants -- overflow
information, a distance -- needs somewhere else to live.

**One byte per slot, and no groups at all.** `indivi::flat_wmap` reads sixteen bytes *unaligned*
starting at the home slot. It gives up any notion of a group boundary, which makes placement per
slot rather than per group, and on integer keys it is the fastest map on a hit in
[the measurements](#same-workloads).

**More than a fingerprint per slot.** Robin hood's eight byte bucket carries a distance as well, so
a single compare orders buckets and a miss can stop on an inequality. Verstable's sixteen bits carry
a chain link. emhash8's two words carry a chain and a value index. These designs can answer
questions a byte cannot, and they pay for it in branches and in memory.

**A group, plus something on the side.** boost's sixteenth byte, F14's two counter bytes, indivi's
and unordered_dense 5.0's eight counters. This is where the answer to "when may a miss stop?" got
interesting in the last few years, and it is what the chapters on [boost](#boost), [F14](#f14),
[indivi](#indivi) and [the group index](#group-index) are mostly about.

One piece of vocabulary before the designs, because it turns up well before its own chapter does. When I
write **the group index** I mean the index unordered_dense 5.0 uses: sixteen one-byte fingerprints
and eight overflow counters per group of sixteen slots, with the value indices in the same block.
[Its own chapter](#group-index) takes it apart, and every design chapter before that one ends by
pointing forward to it, so the name has to arrive here.

Read each chapter for two things: **how a miss stops**, and **what an erase leaves behind**. Those
two are one question asked from both ends, and no two of these maps answer it the same way.

Where a design has an idea worth stealing, its chapter says so and
[the borrowed ideas](#borrowed) say what happened when I stole it: twelve of them, implemented in
unordered_dense 5.0 and measured, four kept, one optional, seven not.

# 5. Robin hood with an ordered word: unordered_dense 4.11.0 [&#8593; contents](#contents){:.up} {#robin-hood}

This is my own map as it stood up to 4.11.0, and the design I have written about
[twice](/2016/09/15/very-fast-hashmap-in-c-part-1/)
[before](/2026/09/04/unordered-dense-four-buckets-at-a-time/). It is here because it is the best
robin hood table I know of and because the trick at the centre of it is, as far as I know, mine.

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

Eight bytes per slot, and no key in them. Four of those eight are `m_dist_and_fingerprint`, and it
is that `uint32_t` the rest of this section is about: **its** low byte is the fingerprint and **its**
upper three bytes are the distance from home, incremented by adding `dist_inc`, which is exactly
`1 << 8`. Zero means the bucket is empty; distance 1 means the key is at home. The other four bytes
are `m_value_idx` and take no part in any of it.

Because the distance sits *above* the fingerprint in the same `uint32_t`, one integer compare
orders two buckets first by distance and then, as a tiebreak, by fingerprint. That is the whole
trick. Robin hood needs "am I further from home than the key sitting here?" and the fingerprint
check needs "are these the same eight hash bits?", and one comparison of one word answers both,
with the right precedence, for free. The ancestry is the *infobyte* and *hashbits* of my
[2016 post](/2016/09/21/very-fast-hashmap-in-c-part-2/) and then `robin_hood`; packing them into one
ordered word came later, and I have not seen it anywhere else.

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

Three outcomes per bucket. Equal is a fingerprint match worth comparing the key. **Greater is the
proof of absence**: the invariant is that distances never drop by more than one along a run, so if
the key we are looking for is further from home than the key sitting here, ours cannot be anywhere
ahead. Otherwise step on. An empty bucket is distance 0, which is less than any live
`dist_and_fingerprint`, so it falls out of the same comparison without a special case.

4.11.0 also has an SSE2 path that does the same thing to four consecutive buckets at once; that is
the subject of [the previous post](/2026/09/04/unordered-dense-four-buckets-at-a-time/) and it is
what makes this an honest comparison rather than a straw man. The scalar loop above is what runs
where SSE2 is not available, and it is the classic shape.

## Backward shift deletion: no tombstones, ever {#backward-shift}

An erase does not free the slot and walk away. It shifts the following run back down by one,
decrementing each distance, until it reaches a bucket at distance 1 or an empty one. The
invariant is restored exactly, so **a table that has churned for hours is byte for byte the table a
fresh build of the same contents would have produced**. No tombstones, no rehash to clean up, no
degradation. Among everything in this post only robin hood gives that unconditionally.

## Good at, pays for

Good at: the strongest possible answer to "gone?"; a compact 8 bytes per slot; a probe that stops on
a comparison rather than on an occupancy test.

Pays for: **a coin flip per bucket**. The scalar probe and the insert's shift loop both ask a
question whose answer is unpredictable, once per bucket. The scalar probe costs 1.14 branch
mispredictions per hit and the four-lane SSE2 one 0.19; the shift went from 0.61 mispredictions per
insert to 0.24 the same way. And the cost of a lookup rides the load factor harder than in any other
design here, because probe lengths in a robin hood table roughly double between an empty table and a
full one: on all-hit lookups a *scalar* robin hood probe swings 2.05 to 2.35x between the cheapest
and dearest point of an octave where a group design swings 1.07 to 1.28x. 4.11.0's vector probe
takes the worst of that back -- it is the 1.83x on
[the sawtooth chart above](#what-a-lookup-is-made-of), still the widest of the four maps drawn
there.

## What carried into the group index, and what did not {#rh-carried}

Into unordered_dense 5.0, that is; [the group index chapter](#group-index) is the whole of it, and
this is only the part that came from the design above.

Kept: the fingerprint from the low byte of the hash and the home from the top bits, so the two are
independent; the dense value vector; the 8 bit fingerprint width.

Dropped: the ordering, the shifts, and the sentinel padding at the end of the bucket array. What
replaced them is [the group index](#group-index).

# 6. SwissTable: abseil's flat_hash_map [&#8593; contents](#contents){:.up} {#swisstable}

The design everything else in this post is measured against, whether or not it says so.
[abseil](https://abseil.io/about/design/swisstables)'s `raw_hash_set` is where the shape comes from:
a group of slots, one byte of hash each, compared in a single SIMD instruction. Boost, folly,
indivi, emilib, ihtab and unordered_dense 5.0 are all variations on it, and the chapters that
follow are mostly about the one thing each of them changed.

## Layout: one control byte per slot, sixteen at a time

[![The hash split into H1 and H2, sixteen control bytes, and the slots](/img/2026/hashmap-index/swiss-group.svg)](/img/2026/hashmap-index/swiss-group.svg)

**Each control byte** describes exactly one slot: `kEmpty` if the slot is free, `kDeleted` if it
holds a tombstone, or **H2**, the top seven bits of the hash of the key that is in it. (`kSentinel`
is written once, at the end of the array, so that iteration knows where to stop.) The markers have
their top bit set and a tag has it clear, which is what lets one sign test separate "there is a key
here" from "there is not".

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
group comes from the low bits and the tag from the top seven -- the same independence robin hood
gets by taking the fingerprint from the bottom. A per-table 16 bit seed is XORed into a non-default
hash before either is taken, which is abseil's defence against a caller reusing one hash across many
tables.

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

That is the canonical SwissTable probe and it is worth reading twice, because six of the other maps
in this post are variations on these nine lines. `Match(h2)` is a broadcast, a `_mm_cmpeq_epi8` and
a `_mm_movemask_epi8`: sixteen slots, one 16 bit mask. Iterating the mask visits only the lanes that
could match. `MaskEmpty()` is the answer to "absent?" -- if any slot in this group is empty, the key
would have been placed at or before it, so it is not in the table.

The probe sequence is triangular, `offset += index; index += Width`, which visits every group in a
power-of-two array exactly once.

## Tombstones and the 7/8 rule {#swiss-tombstones}

An erase writes `kDeleted` -- unless both neighbours in the same group are empty, in which case it
can write `kEmpty` without breaking anyone's proof. So a table that churns at a fixed size fills
with tombstones, and `MaskEmpty()` stops finding anything, and misses get longer and longer. abseil
handles that by rehashing in place when an insert finds no growth left; the table does not get
bigger, but the tombstones go away and every probe sequence is rebuilt.

The maximum load factor is 7/8, so growth happens at capacity times 7/8.

## The small table: one element, and no allocation at all {#swiss-soo}

Recent abseil has something no other map here does, and it is aimed at a case a benchmark suite
almost never measures: the map that holds nothing, or one thing.

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
the `value_type` is no bigger than those pointers -- a `map<int, int>` gets it, a
`map<std::string, std::string>` does not. And the lookup on that table is not a probe at all:

```cpp
iterator find_small(const key_arg<K>& key) {
  return empty() || !equal_to(key, single_slot()) ? end() : single_iterator();
}
```

No control bytes, no group compare, no probe sequence: one key comparison. `find()` branches on
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

What it buys is an allocation, which is worth far more than a probe: a `map<int, int>` used as a
local scratch variable, or one held per node of a tree, costs a `malloc` and a `free` in every other
map in this post and costs nothing here. There is a second, smaller tier above it -- once a table
outgrows the single slot, capacities up to seven use a simplified algorithm
(`MaxSmallAfterSooCapacity`) rather than the general one.

**None of it shows in my measurements**, and that is worth being explicit about: the smallest table
[the measurements](#same-workloads) build holds a thousand entries, so every abseil number in this post is
from the general path. A workload of many tiny maps would rank the field differently, and abseil
would be the map to beat.

## Good at, pays for

Good at: the shortest dependent-load chain of any design here -- one region, one load after the
metadata, and the key right there. Years of tuning behind it, and the only small-table
optimization in the field.

Pays for: tombstones. A table held at a constant size by erasing one and inserting one is the one
workload where SwissTable's answer to "gone?" is the weakest of the field, and it is the workload
[the measurements](#same-workloads) include on purpose.

Two things from this chapter were tried inside unordered_dense 5.0 and are measured with the
others in [the borrowed ideas](#borrowed): the per-table seed, which costs nothing on a lookup, and
cache-line-aligning the metadata, which costs 0.7%.

# 7. Boost's unordered_flat_map: fifteen slots and an overflow byte [&#8593; contents](#contents){:.up} {#boost}

[boost::unordered_flat_map](https://www.boost.org/doc/libs/latest/libs/unordered/doc/html/unordered/structures.html)
is a SwissTable descendant with one change that turns out to matter a great deal: it spends its
sixteenth metadata byte on the answer to "absent?" instead of on a sixteenth slot.

## Layout: group15 and the byte at the end

[![Fifteen reduced hash values and an overflow byte, and the bit it sets](/img/2026/hashmap-index/boost-group15.svg)](/img/2026/hashmap-index/boost-group15.svg)

Fifteen of the sixteen bytes are one reduced hash value per slot. [Boost's header](https://github.com/boostorg/unordered/blob/develop/include/boost/unordered/detail/foa/core.hpp)
describes them as:

> `hi` is 0 if the i-th element slot is available, 1 to mark a sentinel and, when the slot is
> occupied, a value in the range [2,255] obtained from the element's original hash value.

**The sentinel is not a tombstone**, which is worth pausing on because the two words get used for
the same thing elsewhere. A tombstone is per slot and means "something was here and was erased";
boost has none. Boost's sentinel is a single byte written once at the very end of the *whole* slot
array -- `set_sentinel()` writes it into the last slot of the last group -- and it exists so that
iteration knows where to stop without carrying a separate end pointer. One byte in the table, not
one per erase.

The sixteenth byte of each group is the interesting one:

> `ofw` is the so-called overflow byte. If insertion of an element with hash value `h` is tried on a
> full group, then the `(h%8)`-th bit of the overflow byte is set to 1 and a further group is
> probed.

Two consequences, and the header names both. First, **no value has to be reserved for a tombstone**,
so a reduced hash keeps log2(254) = 7.99 bits where a design that spends one on
available-or-deleted keeps seven. Second, and much more important:

> When doing an unsuccessful lookup (i.e. the element is not present in the table), probing stops at
> the first non-overflowed group. Having 8 bits for signalling overflow makes it very likely that we
> stop at the current group (this happens when no element with the same `(h%8)` value has overflowed
> in the group), saving us an additional group check even under high-load/high-erase conditions. It
> is critical that hash reduction is invariant under modulo 8.

That last sentence is a lovely detail. The reduced hash is not `h & 0xFF`; 0 and 1 are reserved, so
they are remapped, to 8 and 9 respectively, precisely so that the remap does not change `h % 8` and
the overflow bit a group consults is the same one an insert set. The remap is a 256 entry table of
pre-broadcast 32 bit words -- **and that is the one I took for unordered_dense 5.0's own
fingerprint word. Boost had it first.**

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
is *aligned* -- `_mm_load_si128` rather than abseil's `loadu` -- because a group is 16 bytes and the
array is aligned, and the match masks off the overflow byte with `& 0x7FFF`.

`pow2_quadratic_prober` steps by `pos += ++step`, the same triangular progression as abseil's, and
`next()` returns false once `step > mask`, so a full-table walk terminates. Maximum load factor is
0.875.

## An erase cannot clear a bit {#boost-erase}

Here is the cost of the overflow byte, and it is the exact mirror of what makes it good. An insert
sets a bit to say "someone of class *h*%8 passed through here". An erase cannot unset it, because
the bit is shared by every key of that class and there is no count -- the map does not know whether
some other key still needs it. So on a table held at a fixed size by erasing one and inserting one,
boost's overflow bits accumulate, misses walk further and further, and the only thing that clears
them is a rehash. Measured with boost's own statistics facility, a table of 200,000 entries at load
0.81, erasing one and inserting one:

*Groups visited per miss; 1.00 would be a miss that never leaves its home group. The turnover points are chosen to straddle the in-place rehash rather than spaced evenly, because the shape being shown is the saw and not the average -- 0.62 and 1.25 are the rows just after a repair. Cells here and in the tables below are tinted by how far they are from the best value in their column -- or from parity, where the table is a ratio to unordered_dense -- so the colour never says anything the number does not.*

| erase-insert pairs, in turnovers of the table | groups visited per miss |
|---|---|
| 0.00, freshly built | 1.104 |
| 0.25 | 1.206 |
| 0.50 | 1.269 |
| 0.62 | 1.104 |
| 1.12 | 1.214 |
| 1.25 | 1.058 |
{: .heat-low}

**It is a saw, and the teeth are about two thirds of a turnover apart** -- at 200,000 entries, one
repair per 120,000 to 150,000 erase-insert pairs. The repair is an **in-place rehash**: the bucket
count is 245,759 before and after, so the table does not grow, it is rebuilt at the same size to
clear the bits.

(Those probe lengths are from a build with `BOOST_UNORDERED_ENABLE_STATS` defined, which adds
Welford accounting to every lookup and makes a miss take 10.4 ns instead of 3.9. The counts are
exact either way; the times below are from a build without it.)

## Why an overflow bit degrades more gently than a tombstone {#bit-vs-tombstone}

Both boost and abseil leave something behind that only a rehash clears, so it is fair to ask why one
is so much worse than the other. Same workload, same hash, same machine, a miss on a 200,000 entry
table, worst point over one turnover of erase-and-insert:

*Time per miss; the multiplier is the worst point over the fresh table.*

|  | miss, freshly built | worst over one turnover | bucket count |
|---|---|---|---|
| `boost::unordered_flat_map` | 3.91 ns | 5.71 ns (1.46x) | 245,759, unchanged |
| `absl::flat_hash_map` | 6.26 ns | 14.62 ns (2.34x) | 262,143, unchanged |

The difference is *what* the erase leaves behind, and it comes down to three things.

**A tombstone occupies a slot; an overflow bit does not.** After abseil erases, that slot is not
available to the next insert of any key -- it holds `kDeleted`, and only a rehash converts it back.
Boost's erase frees its slot completely: the very next key that lands in that group can have it. So
under churn abseil's table gets *effectively fuller* while its size stays the same, and everything
that a rising load factor costs, it pays.

**A tombstone stops every miss; a bit stops one in eight.** abseil's miss ends at the first group
containing an empty control byte, and a tombstone is not empty, so a single tombstone anywhere in a
group makes *every* miss that reaches that group continue -- whatever its hash. Boost's bit is one of
eight, chosen by `h % 8`, so a group that has overflowed for one class still stops seven eighths of
the misses arriving at it. That is the whole reason the overflow byte is a *byte* and not a flag.

**And a tombstone makes the miss longer in a second way**: the probe that continues has to
`Match(h2)` the next group and compare any key whose tag collides, where boost's continuation is
just another `test` against the next overflow byte until something matches. The 1.46x against 2.34x
is those three compounding.

What boost pays instead is that its bit is *approximate* in the other direction: it can be set by a
key that has since been erased, so boost's miss sometimes walks on for nothing where abseil's
tombstone at least marks a slot that really was used. That is a cost in probe length only, and
[the group index](#group-index)'s counters are what removes it -- a count can come back down where a bit
cannot.

## Good at, pays for

Good at: a lean 1.07 bytes of metadata per slot, a miss test that costs one `and` and one `test` and
is right seven eighths of the time even under heavy erasing, and no tombstone value to spend a bit
on. It is consistently among the two or three fastest maps here on every lookup workload.

Pays for: probe length under sustained churn -- 1.46x on a miss before the rehash that repairs it,
which the table above measures -- and the fact that an erase leaves that work for a future rehash to
do. Note what it does *not* pay: even at its worst point it is faster on the churn workload than the
map whose counters exist to remove the degradation, because it starts so far ahead.

Two of boost's ideas ended up in unordered_dense 5.0, its terminating prober and its
pre-broadcast fingerprint word table; [the borrowed ideas](#borrowed) say what each was worth.

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
least four bytes that is the most space-efficient capacity; twelve for four byte items, which makes
a chunk exactly one cache line. The tag is the top byte of the hash, forced to at least 1 so that 0
can mean empty.

**The low four bits of `control_` are the odd one out, and they belong to the table rather than to
the chunk.** Every other map here keeps "how many elements may I hold before I rehash" in the
container object; F14 keeps it in the metadata of **chunk 0** and nowhere else. `capacityScale` is
the per-chunk capacity, so the table's limit is `chunkCount * scale` -- for a multi-chunk table the
scale is `kDesiredCapacity`, twelve of the fourteen slots, and for a single-chunk table it is
whatever that one chunk was sized to (2, 6 or 14):

```cpp
static std::size_t computeCapacity(std::size_t chunkCount, std::size_t scale) {
  return (((chunkCount - 1) >> Chunk::kCapacityScaleShift) + 1) * scale;
}
```

It is written once, by `computeChunkCountAndScale` when the chunk array is allocated, and read on
the insert path to decide whether this insert is the one that rehashes. Two reasons to put it there.
It **costs nothing**: those four bits of chunk 0's `control_` are unused, because
`hostedOverflowCount` only needs the top four, so the field is free storage that a container member
would not be -- and `sizeof(F14ValueMap)` is something folly cares about, since these maps get held
by the million. And a nonzero scale doubles as the marker that says "this is a real chunk array and
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

`probeDelta` is `2 * hp.second + 1` -- twice the tag plus one, so it is odd and therefore coprime
with the power-of-two chunk count. That is double hashing: two keys that land in the same chunk take
*different* tours, where quadratic or linear probing gives them the same one. Folly says why, in a
comment that is a direct answer to abseil and boost:

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
passes a full chunk increments it; **an erase of such a key decrements it again**. So unlike boost's
bit, it comes back down, and a table that churns at a fixed size does not degrade. That is the idea
unordered_dense **5.0**'s index is built on -- 4.11.0 is robin hood and has no counters at all --
and F14 got there first.

The two limits are in the comment. It **saturates at 254** and once saturated it never moves again,
so a pathological table can pin a chunk permanently. And there is exactly **one counter per chunk**,
which knows nothing about the hash class -- any overflow at all sends every later miss into that
chunk on to the next.

## Value, Node, Vector {#f14-variants}

F14 ships three maps over one table. `F14ValueMap` is flat. `F14NodeMap` is node-based.
`F14VectorMap` keeps the values in a contiguous vector behind 4 byte indices and is, as far as I
know, the only mainstream dense map besides this one and emhash8 -- the closest relative
`ankerl::unordered_dense` has. Its items are four bytes, so it gets the twelve-slot chunk: tags,
counters and indices in exactly one cache line. It is measured in [the measurements](#same-workloads)
alongside the rest, and [what is still on the table](#still-on-the-table) says what the comparison found.

## Good at, pays for

Good at: a tombstone-free erase, which in 2019 nobody else had; double hashing, which shortens
probe sequences under load; three container shapes over one table.

Pays for: one class-blind counter per chunk, and a saturation point it cannot come back from. And
the table itself is more elaborate than the others here -- the chunk carries capacity bookkeeping,
so chunk 0 is special.

Two of F14's ideas were tried in unordered_dense 5.0 and neither survived, the single counter
and the double hashing; [the borrowed ideas](#borrowed) have both, with the numbers.

# 9. indivi: counters an erase can undo, and distance nibbles [&#8593; contents](#contents){:.up} {#indivi}

[indivi_collection](https://github.com/gaujay/indivi_collection) by Guillaume Aujay is where
unordered_dense 5.0's overflow counters come from, and it is the least known map in this post by a
distance. Its `flat_umap` is [F14](#f14)'s overflow counter taken further: one counter per hash
class instead of one per group.

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

Two bytes of metadata per slot, in three arrays that are one 32 byte struct. The fragments are a
SwissTable group. The eight `oflws` are **one counter per hash class**: an insert that passes a full
group increments the counter for its own `hash & 7`, and an erase of that key decrements it again.
The sixteen four-bit `dists` record how far each slot's key is from its home group.

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

That is strictly better than boost's overflow byte on a churning table -- a count comes back down
where a bit cannot -- and strictly better than F14's single counter on a fresh one, because it
knows the class. Like F14's it saturates, at 255, and indivi's own assertion message is honest about
what that means: *"Overflow counter saturated: tombstone will remain until rehash."*

Maximum load factor 0.875, and the same triangular probe over groups as boost, abseil and
unordered_dense 5.0 -- `gIndex = (gIndex + (++delta)) & mGMask`, which is boost's
`pos=(pos+step)&mask` line for line.

## Erase by iterator without a hash: the nibbles {#indivi-nibbles}

The distance nibbles are the other idea, and they are aimed at a specific operation. Given an
iterator, an ordinary open addressing map cannot erase without knowing where the key's home is, and
the only way to find that out is to hash the key again. With the distance stored, home is the
current group minus that many steps of the probe sequence, run backwards -- so `erase(iterator)`
needs no hash and no key access at all. For a `std::string` key that is a whole wyhash and a
dependent load saved.

## Good at, pays for

Good at: the most information per slot of any flat map here (a fragment, a class counter's share,
and a distance), a tombstone-free erase that also knows the class, and an `erase(iterator)` that
costs no hash.

Pays for: two bytes per slot instead of one, and the bookkeeping -- an insert maintains counters and
distances, an erase undoes both.

unordered_dense 5.0's counters are indivi's, and its distance nibbles were tried there and
dropped; [the borrowed ideas](#borrowed) have both.

And the same author ships a second map that throws all of this away -- the counters, the distances,
the groups themselves -- and is faster on every lookup than this one. That is the next chapter.

# 10. indivi flat_wmap: the window that beats the group [&#8593; contents](#contents){:.up} {#flat-wmap}

The fastest map in this post on an integer hit is not a SwissTable, does not group its slots, and is
by the same author as the one in the chapter before. `indivi::flat_wmap` is `flat_umap`'s sibling --
same repository, same file structure, same SSE2 -- with the groups taken out, and it beats it by
1.13 to 1.42x on lookups. It is the largest single index effect I found in anyone else's code, so it
gets its own chapter, and the answer to *why* is not the one the design advertises.

## Layout: one byte per slot, and a window rather than a group {#wmap-layout}

[![One metadata byte per slot, the sixteen-byte window read unaligned at the home slot, and the duplicated tail that makes it legal](/img/2026/hashmap-index/wmap-window.svg)](/img/2026/hashmap-index/wmap-window.svg)

One byte per slot, and that is the whole of the metadata -- no counters, no distances, no second
array. The byte is a seven bit hash fragment or one of two markers, and the values they take are
chosen so that a *signed* compare separates them:

```cpp
static constexpr uint8_t EMPTY_FRAG{ 0x7F };     // 127
static constexpr uint8_t TOMBSTONE_FRAG{ 0x7E }; // 126
static constexpr uint8_t SETMAX_FRAG{ 0x7D };    // 125
```

Every occupied slot holds a fragment that is `< 126` as `int8_t`, every free one holds 126 or 127,
so `match_available` is one `_mm_cmpgt_epi8` against 125 and `match_set` one `_mm_cmplt_epi8`
against 126. The fragment comes from the *low* byte of the hash through a 256 entry table of
pre-broadcast words -- boost's trick, and the one [the group index](#group-index) also took -- which
here does double duty, because it is also what remaps a hash byte that would collide with the two
markers.

The home is a **slot**, not a group: `hash_position` is `hash >> shift`, the top bits, and the
sixteen bytes compared are the sixteen bytes *starting at that slot*, read with `_mm_loadu_si128`.
There is no alignment anywhere in the design. What makes that legal at the end of the array is the
same trick abseil uses for a different purpose: the metadata is over-allocated by sixteen bytes that
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

Three things in that loop are worth naming. The lane index is added to the *slot*, not to a group
base -- `valIdx = (index + idx) & mGMask` -- so a match in lane 0 is the home slot itself and the
value array wraps where the metadata array duplicates. The miss stops on an **empty** fragment, so
this is a tombstone design and pays what tombstone designs pay under churn. And the probe steps by
`(++delta) * 16`: triangular, but in units of sixteen slots, so the second window begins where the
first ended rather than at the next aligned group.

Placement is the mirror of it. `unchecked_insert` takes `match_available` on the same unaligned
window and puts the key in the **first free slot within sixteen of its home**, where a grouped map
must take the first free slot in the one group its home falls in. That is the difference the design
is *for*, and it is measurable, and it turns out not to be where the speed comes from.

## Why it is faster, and it is not the window {#wmap-why}

*Time relative to unordered_dense 5.0, lower is faster; bold is the better of the two.*

|  | hit | miss | build | churn |
|---|---|---|---|---|
| `flat_umap`, grouped | 0.82 | 0.97 | **1.62** | **0.69** |
| `flat_wmap`, ungrouped | **0.71** | **0.83** | 1.86 | 0.93 |
{: .heat-par}

The ungrouped window is **1.13 to 1.42x faster on lookups** across the three octaves and
consistently slower on builds. That is the biggest single index effect I found in anyone else's map,
so it is worth knowing what causes it -- and the obvious answer is wrong.

**The window is not it.** The intuitive story is that slot-level placement gives a shorter
displacement distribution: a key takes the first free slot within sixteen of its home, where a
grouped map takes the first free slot in the group of sixteen its home falls in, and a *group* being
completely full is likelier than *no* free slot existing in a sliding window. That is true, and it is
worth almost nothing. Simulated with the same keys at the same load, windows visited per placement:

*Sixteen-slot windows visited per placement, lower is better; bold is the better of the two.*

| load | bucketized | sliding |
|---|---|---|
| 0.760 | 1.0318 | **1.0238** |
| 0.790 | 1.0436 | **1.0352** |
| 0.799 | 1.0481 | **1.0396** |
{: .heat-low}

Slot-level placement removes about a fifth of an excess that is already under 5%. For calibration,
that is a quarter of what moving displaced entries home is worth in
[the group index](#drift), and that is worth about a tenth of a miss at every table size.

**What causes it is instructions and metadata width.** One map per binary, all-hit lookups, the
grouped sibling against the ungrouped one:

*Per hit, lower is better; bold is the better of each pair.*

| entries | `flat_umap` instructions | `flat_wmap` | `flat_umap` L1 misses | `flat_wmap` |
|---|---|---|---|---|
| 1,000 | 53.3 | **47.3** | 0.876 | **0.378** |
| 50,000 | 54.6 | **48.3** | 3.744 | **3.297** |
| 1,000,000 | 72.6 | **64.4** | 4.733 | **3.856** |
{: .heat-low}

Six fewer instructions per hit at every size, and fewer cache lines touched **even at a thousand
entries, where the whole map is in L1** -- so it is not a footprint effect that shows up only when
the metadata array gets big. One byte of metadata per slot against two, and no overflow counter to
load on the way past. The alignment of the window is the most visible difference between the two
designs and the least important one.

## Good at, pays for {#wmap-pays}

Good at: the fastest integer hit and miss measured here, at one byte of metadata per slot -- the
leanest index in the post that still compares sixteen slots at once. Slot-level placement, so a
displaced key lands as close to home as any design here puts it.

Pays for: tombstones, and everything that follows from them -- a miss that stops on an empty
fragment degrades under churn, and a rehash is what repairs it. A slower build than its grouped
sibling at every size. And the widest load-factor sawtooth of anything in this post: at the 32,000
octave a hit swings 2.12x between the cheapest and dearest point of the octave, where the group
designs swing 1.5 to 1.6x, so a number quoted for it at one size is worth less than for anything
else here.

## What it would take to steal this {#wmap-steal}

The measurements above compare two people's maps, which cannot separate the window from everything
else that differs between them. So I built both layouts over one implementation -- same value
vector, same hash, same fingerprint encoding, same load factor, same tombstones, same growth, same
erase, same SSE2 helpers -- differing in the home unit and the probe step and nothing else, one
variant per binary, both cross-checked against `std::unordered_map` before anything was timed.

**The window wins the lookup, and it wins it at the branch predictor rather than in the cache.**
Per operation at 200,000 entries, aligned groups against the sliding window:

*One index per binary, per operation, lower is better; bold is the better of the two.*

|  | instructions | cycles | branch misses | L1 misses |
|---|---|---|---|---|
| hit, aligned groups | 71.9 | 56.8 | 0.198 | **4.615** |
| hit, sliding window | **70.5** | **53.6** | **0.167** | 4.852 |
| miss, aligned groups | 70.1 | 47.9 | 0.518 | **2.810** |
| miss, sliding window | **67.4** | **44.0** | **0.436** | 3.018 |
{: .heat-low}

16% fewer branch misses on both, three to four fewer cycles -- and **more** L1 misses, because an
unaligned sixteen byte load straddles two cache lines where an aligned one does not. In time, over
three sizes and three runs: hits 1 to 5% faster, and a miss 13% faster at 200,000 entries.

**The miss number is against the wrong baseline, though, and it is worth saying so rather than
banking it.** Neither variant has overflow counters, because there is no group in the ungrouped one
to hang them on -- so both stop a miss on an *empty slot*, and the grouped variant is
[the group index](#group-index) with the counters taken out, which is precisely the path they exist
for. Windows visited per miss: at 200,000 entries and load 0.76, **1.2962 grouped against 1.2246
window**; at a million and load 0.48, 1.0060 against 1.0027. The shipped index visits **1.046** on a
fresh miss at any load, because a counter stops it at home. So the 13% is the window leaving the
first window slightly less often *when the miss test is an empty slot*, and where a miss already
stops at home it evaporates -- at a million entries the window is 2% *slower* on a miss. The hit
advantage is the robust one: 1 to 5%, and still 7% at a million where both variants visit 1.000
windows, so that part is addressing and instructions rather than probe length.

**And it loses churn, for a reason worth having.** At a million entries the window variant ends a
churn run with **4,194,304 slots against 2,097,152** -- one extra doubling -- and 24% slower churn.
Counting where placements land says why: **15.8% of the window's placements reuse a tombstone
against the grouped variant's 33.8%**. `ctz` takes the lowest available lane, which for a window is
the home slot itself and for a group is the group's lane 0 -- a fixed position that all sixteen of
that group's homes probe first, so it is tombstoned and reused constantly, where a window's first
lane is different for every home and is more often a slot that has never been used. Burning fresh
slots is what drives a load factor counting live plus tombstones, so it buys an extra growth.

**And a dense map built on this structure, measured against the shipped one.** Variant 1 above
already is that map -- a sliding window, one metadata byte per slot, a `uint32` index in front of a
dense value vector -- so I added a third variant that is `ankerl::unordered_dense` itself behind the
same interface, running the identical workload code. It reproduces the production harness to within
1% on a build, which is the check that the workloads are honest.

*Per operation, median of three runs, lower is better; bold is the best of the three.*

|  | grouped, tombstones | window, dense | unordered_dense 5.0 |
|---|---|---|---|
| build, 200,000 | 16.69 | 16.66 | **9.10** |
| hit, 200,000 | 8.62 | 7.74 | **6.77** |
| miss, 200,000 | 7.76 | 6.65 | **4.72** |
| churn, 1M | 65.71 | 83.87 | **62.01** |
| bytes per entry, 1M | 27.26 | **27.26** | 28.31 |
{: .heat-low}

**Read the third column as a prototype against a tuned library, not as a design comparison.** The
build gap is 83 to 143% and almost none of it is the index -- the shipped map hashes sixteen
elements ahead when it grows and the prototype rebuilds one at a time -- and the lookup gap is the
merged block and the prefetches. The design question is the first column against the second, same
author and same afternoon, and that is the comparison this section is built on.

That is the answer to whether [the group index](#group-index) should adopt it, and the chain is what
makes it no. A sliding window means no per-group counters, because there is no group to hang them
on; no counters means the miss stops on an empty slot; and that means tombstones -- which is the
property [churn](#same-workloads) exists to protect. It also means giving up the merged 88 byte
block, worth 7% of a lookup's instructions and 28% of its dTLB misses at four million entries, since
sixteen fingerprints starting at an arbitrary slot are not contiguous in it. Thirteen percent of a
miss at one size does not buy all of that.

**The mechanism is the part worth keeping, and it is testable on its own.** The claim was that `ctz`
takes the lowest free lane -- which for a window is the home slot, different for every key, and for
an aligned group is lane 0, shared by all sixteen of that group's homes. So transplant exactly that
one property: give the *grouped* variant a per-key starting lane from bits 8 to 11 of the hash,
rotate the available mask by it, change nothing else. It costs a rotate on the insert path and
affects no lookup at all, because a group is compared whole either way.

*Churn at a million entries, three runs each; the middle column is the grouped variant with only the
starting lane changed.*

|  | grouped | grouped, per-key start lane | sliding window |
|---|---|---|---|
| tombstones recycled | **33.8%** | 16.3% | 15.8% |
| slots after the run | **2,097,152** | 4,194,304 | 4,194,304 |
| churn | **67.2 ns** | 87.5 ns | 83.9 ns |
{: .heat-low}

One property moved and the whole behaviour moved with it, onto the window's numbers. **And the
direction is the opposite of the intuition:** spreading the preferred lane does not relieve
contention, it destroys recycling, and contending on one lane is the *feature*. A tombstone appears
wherever a key was; if every key prefers lane 0 then lane 0 is where the keys are, so lane 0 is
where the tombstones are, so the next placement lands on one instead of consuming a fresh slot.
Concentration is what makes a tombstone design recycle at all.

That is a fact about [abseil](#swisstable) and [emilib](#emilib), which both take the lowest lane and
should keep doing so, and it is the reason a window -- whose first lane is the home slot by
construction -- cannot recycle well. It is not a fact about
[the group index](#group-index), which has no tombstones to recycle: an erase there writes a
fingerprint of zero, a genuinely empty slot, and lane position cannot affect a lookup that compares
all sixteen at once.

**And none of this explains why `flat_wmap` is fast**, which is worth being clear about because the
prototype invites the conclusion that it should. Both of its variants are dense -- a value index
between the metadata and the key -- and carry the same metadata width, on purpose, so that the
window is the only thing varying. `flat_wmap` is *flat*, with the key in the slot the window found,
and it carries **one** metadata byte per slot where this map carries 5.5 and its own grouped sibling
carries two. Those are the differences [the counters](#counters) already attribute it to: 48.0
instructions per hit against `flat_umap`'s 54.3 and unordered_dense's 60.5. The window is the
smallest of the three, and it is the only one this map could have taken.

# 11. The group index: unordered_dense 5.0 [&#8593; contents](#contents){:.up} {#group-index}

This is what replaced [robin hood](#robin-hood) in my own map in 5.0, and it is the design I
know best because I built it by measuring every alternative I could think of and keeping what won.
Most of this chapter is the alternatives. Two things are deliberately elsewhere: the ideas it took
from the other maps, which have [a chapter of their own](#borrowed), and [how it grows, what the
compilers make of it and which hash it is handed](#building), because none of that is about the
index.

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
byte is zero is remapped to 8, which keeps the low three bits -- the counter class -- unchanged.
That remap is boost's, and so is the way it is done:

```cpp
[[nodiscard]] constexpr auto make_fingerprint_words() -> std::array<std::uint32_t, 256> {
    auto t = std::array<std::uint32_t, 256>{};
    for (std::uint32_t i = 0; i < 256; ++i) {
        t[i] = (i == 0 ? 8U : i) * 0x01010101U;
    }
    return t;
}
```

The fingerprint is stored pre-broadcast into all four bytes of a `uint32_t`, so the SSE2 compare
needs a `movd` and a `pshufd` rather than a real byte broadcast, and building it is one L1 load
rather than five instructions on the critical path of every probe, placement and erase.

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

SwissTable's shape again, with three differences. The value index replaces the key in the slot, so
a hit costs one more dependent load. The miss test is a per-class counter. And there is a
termination bound, which is [boost](#boost)'s story.

`match_fingerprint` has three backends. [SSE2](https://en.wikipedia.org/wiki/SSE2) is `_mm_cmpeq_epi8` and `_mm_movemask_epi8`, sixteen
lanes into sixteen bits. NEON has no movemask, and the cheap stand-in -- compare, then a narrowing
shift -- puts the sixteen answers one nibble apart in a 64 bit word, so the mask type and a lane
stride are named once and `first_lane()` divides by the stride; testing a mask, taking the lowest
lane and clearing it with `m & (m - 1)` are then written once for all three backends. The fallback
is [SWAR](https://en.wikipedia.org/wiki/SWAR), eight bytes at a time:

```cpp
[[nodiscard]] static auto match_zero_bytes(std::uint64_t x) -> unsigned {
    static constexpr auto lows = UINT64_C(0x7F7F7F7F7F7F7F7F);
    static constexpr auto highs = UINT64_C(0x8080808080808080);
    auto const zeros = ~(((x & lows) + lows) | x) & highs;
    return static_cast<unsigned>(((zeros >> 7U) * UINT64_C(0x0102040810204080)) >> 56U);
}
```

The more familiar `(x - ones) & ~x & highs` is two operations shorter and wrong here: a zero byte
borrows from the next one, which marks a `0x01` sitting above a `0x00` as a match as well. That is
harmless for a probe, which verifies every candidate against the key, and not harmless at all for
the empty slot an insert picks. The multiply gathers the eight high bits into eight adjacent ones.

Adding NEON was worth a lot on ARM, and the reason is worth stating because it is the opposite of
the usual one. On a Neoverse N2, SWAR against 4.11.0's *scalar* probe was **behind** on every lookup
-- word-at-a-time was replacing a robin hood probe that was never vectorised there either, so it lost
nothing and gained nothing. With `vceqq_u8` the same runner reads 1.48x of 4.11.0 on hits and 1.62x on misses.
The vector compare is not an optimization of the group design; it is the group design.

## Eight counters, by fingerprint class {#counters-by-class}

An insert that finds its home group full increments the counter for its own class in every full
group it passes; an erase decrements the same ones. A miss stops at the first group whose counter
for its class is zero. That is indivi's idea with F14's erase-decrement, and the one question it
leaves open is how wide a counter should be: one shared counter per group, eight bytes, sixteen
nibbles, thirty-two two-bit counters, or an exact one. All five were built and measured, in
[the borrowed ideas](#borrowed); the short version is that a byte per class is the point where the
counter is still a single aligned load and already knows the class, and that about 80% of what it
fails to filter is **siblings** -- keys whose home *is* this group and which genuinely did not fit,
so they walk the same sequence a later miss for it walks -- which an exact counter has to follow as
well.

## The miss bound {#miss-bound}

`|| delta == m_group_mask`: a key that exists was placed within one cycle of its probe sequence, so
a walk that has seen every group can stop. [Boost](#boost)'s prober has always had it -- `return
step<=mask` -- and until the review before release this one did not. It stopped only at a group
whose counter for the key's class was zero, on the argument that an exact counter puts a zero right
after the furthest entry of that class. The argument is wrong, because a counter counts entries that
overflowed past its group on *their* probe sequences, not on the one being walked. Eight chosen keys
are enough to make `contains()` on an absent key loop forever: fill a group, send one key of class 1
past it, erase the fillers -- the passer stays, so the counter stays -- and repeat for every group.
Any hash the caller controls reaches it, and the default hash with chosen keys does too. By
mechanism the bound is free: on a 200,000 entry table, 83.6 to 82.7 instructions on a hit and 69.5 to
67.6 on a miss, cycles and mispredictions unchanged. `indivi::flat_umap`, where the counters came from, had the same hole;
[reported](https://github.com/gaujay/indivi_collection/issues/2), it was fixed the same day.

The bound has a second effect worth knowing: it converts a missing or wrong erase decrement
from a hang into a silent slowdown. That fault used to be caught loudly -- counters only grew, a
miss found no zero, the test suite hung -- and now the table stays correct and gets slower. Which is
the right trade against a hostile hash, and it is why there is now a test that measures the
*lengthening* rather than an answer: the map is given a counting `KeyEqual`, and a table that
reached its contents by erasing a run of overflowing entries must compare a miss exactly as often as
a table built from the survivors directly.

## Erase: decrement, do not tombstone {#group-erase}

An erase clears the fingerprint and walks the same sequence from home to the group the entry was
found in, decrementing each counter. Then, because the values are dense, it moves `m_values.back()`
into the hole -- which means finding the slot that points at the moved element, which means hashing
that key again and running a second probe.

That sounds expensive and for an integer key it is free. Measured at a million entries, an erase
plus an insert against a sequence with the same two cold probes and no move at all:

*Time per erase-and-insert.*

|  | with the move | without |
|---|---|---|
| `uint64_t` keys | 57.0 ns | 56.2 ns |
| `std::string` keys | 410.4 ns | 377.7 ns |

Three things make it free for an integer: the moved element is always the back of the vector, which
in a churn loop is the same few cache lines and stays hot; `do_erase` prefetches it first, so the
load runs under the counter walk; and an integer hash is one multiply, so the group access it
produces issues early enough to overlap. For a string it costs about 50 ns, because wyhash over 8 to
135 bytes behind a heap pointer is a dependent load and then a long chain, and none of it overlaps.

The fix for the string case is a slot back-pointer per value, indivi's distance nibbles taken to
their conclusion, and it is [measured and rejected in the borrowed ideas](#borrowed): a tenth
faster exactly where the hash is expensive, and a loss everywhere the vector grows.

## Drift, and moving home {#drift}

Because nothing moves after it is placed, an entry that landed away from home while its home group
was full **stays there after the home empties again**. So a long-churned table probes further than a
freshly built one with the same contents. Groups visited per lookup, counted inside the probe, on a
reserved table churned 200 times through -- erasing a uniformly random live key and inserting one
the map has never held, at a constant size:

*Groups visited per lookup, lower is better; bold is the best in each row.*

|  | fresh | churned | + one writing hit per round | + four |
|---|---|---|---|---|
| **per hit** |  |  |  |  |
| load 0.760 | 1.031 | 1.036 | 1.023 | **1.014** |
| load 0.799 | 1.039 | 1.066 | 1.044 | **1.028** |
| **per miss** |  |  |  |  |
| load 0.760 | 1.052 | 1.061 | 1.036 | **1.025** |
| load 0.799 | 1.086 | 1.122 | 1.081 | **1.052** |
{: .heat-low}

The drift is real, it saturates rather than growing (5, 20, 100 and 400 turnovers give 1.039, 1.036,
1.035 and 1.035 per hit at load 0.76), and it is worth about 0.036 groups on a miss at the fullest
point of the sawtooth and almost nothing at the emptiest.

That is the honest difference from a tombstone design, and it is small -- but it is not zero, and
I have had it wrong in both directions. For a while I had it written down as zero, because "a
churned table is identical to a fresh one" is true of backward shift deletion and I carried it over.
Then an earlier instrumentation recorded 1.14 groups per hit and 1.27 per miss at load 0.76, and I
quoted those for weeks; re-instrumenting the probe for the table above reproduces its *fresh*
figures to three digits and its churned ones nowhere near, so either that harness churned
differently in a way that matters or the number was wrong. Every column of the table above comes
from one instrument, and those are the figures to use.

Two repairs were measured. **Pulling a displaced sibling home on erase**: when an erase frees a slot
and any counter is nonzero, look one group along for an entry whose home is this one and move it
back. It works -- half the drift, one step deep, 1.24M pull-backs in 10M erases -- and it costs 20 ns
per erase, because at load 0.76 *some* counter of the freed group is nonzero on 46% of erases, and
each of those hashes two or three candidate keys to find out. It buys 0.4-0.6 ns per lookup in cache
and nothing at all out of it, since a one-step displacement lands in the adjacent block that the
spatial prefetcher already brought in. Break-even at thirty to fifty lookups per erase. Not kept.

**The lazy version is kept.** The entry a hit just found is the one candidate whose home is known
without another hash -- the probe computed it -- and whether the home has room is one `match_empty`
on a group the probe just visited. So `move_home` runs on every hit inside a path that already
writes (`try_emplace`, `operator[]`, `insert`, `emplace`, `insert_or_assign`) and nowhere else. It is
deliberately not in `find()`, const or not: callers treat a non-const `find` on a shared map as
read-only, and writing there would make it a data race.

The two right-hand columns are what `move_home` does, and they say something better than "it takes
the drift back": with four writing hits per round **the churned table probes better than a
fresh one** -- 1.014 groups per hit against 1.031, and 1.025 per miss against 1.052, at load 0.76.
`move_home` does not merely undo the displacement churn caused, it keeps pulling entries towards
home that the original build had left away from it, so a table that is *used* is more compact than
one that was only built. It converges rather than plateauing, because every displaced entry that is
touched again goes home.

What it is worth in time is the interesting part, because the drift it takes back is so small that I
doubted it was worth anything at all. One map per binary, the same header with `move_home` turned
into a no-op beside it, a table at load 0.80 churned through and then timed on its own. **The control
is the row that matters**: with no writing lookups `move_home` never fires, so the two binaries have
to measure the same, and whatever they differ by there is code layout to be subtracted.

*Time with `move_home` relative to time without it, lower is faster -- the same convention as every other ratio in this post. The control column has to read 1.00, and what it reads instead is code layout to be subtracted. Bold is the best in each row.*

| entries | control, no writing hits | on misses, one writing hit per round | on hits | on the churn round |
|---|---|---|---|---|
| 52,363 (in L2) | 1.052 | **0.903** | 0.961 | 0.988 |
| 838,860 (L3) | 1.002 | **0.908** | 0.997 | -- |
| 3,355,443 (past L3) | 1.003 | **0.910** | 1.009 | -- |
{: .heat-par}

So: **about a tenth of a miss, at every size**, nothing on a hit, and nothing paid on the writing
path that earns it. I expected it to fade out of cache -- one step of displacement lands in the
adjacent block, which the prefetcher already has -- and it does not.

The counters say why it does not, and it is not the extra group visit. Per lookup at 52,363 entries,
the same two binaries: with no writing hits, **27.59 cycles and 0.2118 branch misses against 27.52
and 0.2116**, identical as the control demands; with one writing hit per round, **25.58 and 0.1591
against 28.93 and 0.2177**, on instruction counts that barely move. A quarter of the branch misses
go, on 0.04 fewer groups per miss. **Most of what drift costs is the stop-or-continue branch becoming
unpredictable**, and a branch does not get cheaper because the table left the cache.

What that does *not* say is that it helps everybody. `move_home` runs only on a hit inside a path
that writes, so a program that only reads gets exactly nothing -- the control column *is* that
program. And the gain is entirely on misses. The shape it pays for is a map that churns at a fixed
size, is written to by key, and is asked about keys that are not there: a real shape, and not the
shape of anything in my benchmark suite, which is why the suite reads exactly level on this change
and always will.

The first measurement of it said 1.49x on misses and was wrong -- a paired run of two headers in one
binary, where the code layout of the losing side moved. Note that the control column above reads
1.052 at 52,363 entries where it has to read 1.00, which is that same effect, still there, measured
rather than guessed at. The rule
it leaves is in [how the numbers were made](#how-measured).

## Where the indices live: one array or two {#one-array-or-two}

The value indices used to be a second array beside the groups, and a comment in the header recorded
that the split had been tried against a merged block years ago and was 10% faster on a build. That
verdict came from a regime that no longer describes where the cost is, so it was re-tested: one 88
byte block, `struct block : Group` so every existing use of the metadata reads unchanged, no padding,
the same bytes in one allocation instead of two.

Memory is unchanged to the byte. The suite moves 1.5-2.2% and its finds 4.4-5.3%, and the reason to
believe it is not the suite but the counters -- one map per binary, all-hits lookups at 200,000,
800,000 and 4M entries, split against merged: **7% fewer instructions** (66.9 to 62.0 per lookup),
because the index is at a fixed offset from the group rather than a second address to compute;
**12-14% fewer L1 misses**; and **28% fewer dTLB misses at 4M** (5.30 to 3.79), because a lookup
touches two regions rather than three.

One other layout question on the same axis, measured and a tie. Splitting the
fingerprints and the counters into *two* arrays -- so that four groups' fingerprints fit a cache
line exactly, where a 24 byte group straddles one time in four -- is a tie both in cache and on a
20M entry table whose index is 37 MB (57.1 against 57.0 ns per hit). The straddle is free because
the second line is the adjacent one; the counter line is free because its address depends only on
the group, so it issues beside the fingerprint load rather than after it.

## Good at, pays for

Good at: no tombstones and a counter that comes back down, so a table that churns at a fixed size
degrades by 1 to 3% in probe length and then stops; the dense value vector, so iteration is an
array walk and a 64 byte value costs the vector rather than the table; 5.5 bytes of metadata per
slot; and a bound that makes a hostile hash slow rather than endless.

Pays for: one more dependent load on every hit than a flat map, which is the family cost and does
not go away; a rehash that has to move values as well as indices; and an erase that hashes the moved
element's key, which is free for an integer and about 50 ns for a string.

# 12. Chains instead of probes: emhash8 and Verstable [&#8593; contents](#contents){:.up} {#chains}

Two designs answer "absent?" without a probe sequence at all. They thread a **chain** through the
metadata, so a lookup visits only keys that belong to its own bucket and a miss ends where the
chain does. One is C++ and dense, the other is C and flat, and they arrive at the same cost from
opposite directions.

## emhash8: chaining through the index, and a fingerprint for free {#emhash8}

[emhash](https://github.com/ktprime/emhash) is a family of maps by ktprime; `emhash8::HashMap` is
the dense one. It is coalesced chaining, and it is fast.

### Layout: {next, slot} per bucket, values packed in a vector

[![emhash8's index: a next pointer and a slot word, and the chain they thread](/img/2026/hashmap-index/emhash8-index.svg)](/img/2026/hashmap-index/emhash8-index.svg)

```cpp
struct Index {
    size_type next;
    size_type slot;
};
```

Eight bytes per bucket, no key, no fingerprint byte -- and a dense `_pairs` vector for the values,
exactly like unordered_dense's. `next` is the bucket where this bucket's chain continues; `slot` is
where the value is.

Every key whose home is bucket *b* is on one list starting at *b*. A key that arrives to find its
home occupied by a **stranger** -- a key whose own home is elsewhere -- evicts the stranger to
another bucket and takes the head for itself, so a chain always starts at its own home. That is
[coalesced hashing](https://en.wikipedia.org/wiki/Coalesced_hashing) with main-bucket kickout, and it means a lookup walks only keys that share its
home, never a stranger's.

### The trick: hash bits above the mask

```cpp
#define EMH_EQHASH(n, key_hash) ((static_cast<size_type>(key_hash) & ~_mask) == (_index[n].slot & ~_mask))
#define EMH_NEW(key, val, bucket, key_hash) \
    new (_pairs + _num_filled) value_type(key, val); \
    _etail = bucket; \
    _index[bucket] = {bucket, _num_filled++ | (static_cast<size_type>(key_hash) & ~_mask)}
```

The `slot` word has to be big enough to index the values, and the table has fewer slots than the
word can hold, so **everything above `log2(bucket count)` is spare and gets filled with hash bits**.
That is a fingerprint that costs no memory and no extra load, because the word is on the critical
path anyway -- and it is *wider the smaller the table is*, which is exactly the right direction,
since a small table has more spare bits and a large one needs fewer of them to be discriminating.
[CPython's compact dict](https://mail.python.org/pipermail/python-dev/2012-December/123028.html) stores its indices in 1, 2, 4 or 8 bytes for the same reason from the other
end.

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

The answer to "absent?" is **the end of the chain**, and because the chain holds only keys that
belong to this bucket it is short -- most buckets have no chain at all. There is no probe sequence
in the usual sense and no group compare anywhere.

### Good at, pays for

Good at: a dense value vector, so iteration is an array walk and a large value costs the vector. The
free fingerprint. Short chains, because a chain holds only keys that share a home.

Pays for: **branches**. Every step of the loop is a data-dependent branch, and so is "is there a
chain at all". That is fine when the answer is nearly always no, and it is the reason emhash8's
misses are its weakest column in [the measurements](#same-workloads), and [the counters](#counters) say why -- a miss has to reach the end of the
chain, and whether there is one is exactly the unpredictable question. And the eviction machinery
means an insert can move an existing key, which the group designs never do.

The free fingerprint was tried in unordered_dense 5.0 and lost, for a reason worth reading in
[the borrowed ideas](#borrowed).

## Verstable: a 16 bit word with a chain in it {#verstable}

[Verstable](https://github.com/JacksonAllan/Verstable) by Jackson Allan is a C library that is in
nobody's benchmark round-up and should be; it compiles as C++ unchanged, so it went into the same
binary as everything else. It packs everything into two bytes per bucket:

```c
#define VT_EMPTY               0x0000
#define VT_HASH_FRAG_MASK      0xF000 // 0b1111000000000000.
#define VT_IN_HOME_BUCKET_MASK 0x0800 // 0b0000100000000000.
#define VT_DISPLACEMENT_MASK   0x07FF // 0b0000011111111111, also denotes the displacement limit.
```

[![Verstable's two metadata bytes, to bit scale: a 4 bit fragment, an in-home bit and an 11 bit displacement, and the chain they thread](/img/2026/hashmap-index/verstable-word.svg)](/img/2026/hashmap-index/verstable-word.svg)

Four bits of hash fragment taken from the *top* of the hash, because the bucket comes from the
bottom -- the same independence every design here arranges some way. One bit saying "the key sitting
here belongs here". Eleven bits of quadratic displacement to the next key in *this bucket's* chain.

So every key homed at a bucket sits on one linked list threaded through otherwise-unused buckets,
and a lookup visits **only** buckets holding keys that belong to it. Key and value are inline in a
flat bucket array, both arrays out of one `malloc`, maximum load 0.9, tombstone-free, and an insert
evicts at most one key to keep the invariant that a chain starts at its home.

The in-home bit is the most interesting single idea in this post, because it is the **exact** answer
to "absent?": either a key that belongs here is here, or none is, and there is nothing to be
approximate about. Every counter design above is a hint by comparison. It is measured as an
alternative in [the borrowed ideas](#borrowed): 2 to 3% in cache and nothing out of it, because what
an approximate counter gets wrong is mostly keys that really do belong to the group it is guarding,
and an exact test has to follow those too.

**What it costs is branches, and that is the whole result.** One map per binary, 30M lookups at
50,000 entries, from [the counter table](#counters):

*Per miss at 50,000 entries, lower is better; bold is the best in each column.*

|  | instructions | cycles | branch misses | L1 misses |
|---|---|---|---|---|
| miss, group index | 57.2 | 20.7 | **0.108** | 3.41 |
| miss, boost | 54.2 | **20.4** | 0.164 | **1.90** |
| miss, Verstable | **44.6** | 40.8 | 0.806 | 1.96 |
{: .heat-low}

A Verstable miss executes **22% fewer instructions than a group probe and takes twice the cycles**.
The design delivers exactly what it advertises -- fewest instructions, fewest cache lines touched --
and hands all of it back at the branch predictor, because "is my home bucket a chain head, and how
long is the chain" is a data-dependent decision on every lookup where a group compare is not. At
load 0.9 about 59% of misses land on a chain head and have to walk it.

Its build is where it is weakest, and for a related reason: a rehash re-runs the whole insert for
every key, and an occupied home bucket calls `evict`, which re-hashes the occupant and walks *its*
chain. Growth costs it 143 instructions and 79 cycles per element against unordered_dense's 44 and 12,
at 2.398 branch misses per element against 0.132.

Memory is where it does well: 18 bytes per slot at a 0.9 maximum load puts it with abseil and emilib
at the lean end of [the memory table](#memory), ahead of boost and every dense map.

# 13. The plain SwissTables: emilib and ihtab [&#8593; contents](#contents){:.up} {#plain}

Two implementations of the standard design, with fewer moving parts than anything else in the post.
They are here because a clean version of the standard design is the baseline every trick above has
to beat, and because one of them is dense in a way that shows what being dense does and does not
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

One state byte per slot: empty, deleted, and 253 fingerprint values above them. A flat slot array. Two
things distinguish it. The home slot is **rounded down to a multiple of the group size** --

```cpp
main_bucket -= main_bucket % simd_bytes;
```

-- so a compare is always an aligned group and a probe never straddles two of them, which is what
emilib buys with the alignment that abseil spends on cloned bytes. And the fingerprint is
`key_hash % 253 + EFILLED` -- a real modulo rather than a bit slice, which costs a multiply per
lookup but uses every value between the two markers.

Tombstones, so it degrades under churn like SwissTable does. Nothing here transferred into the group
index, and that is not a criticism: it is a clean, small, readable implementation of the standard
design, and in [the measurements](#same-workloads) it lands in the middle of the field, which is what a
clean implementation of the standard design should do.

## ihtab: eight slots at half load {#ihtab}

[ihtab](https://github.com/vnmakarov/ihtab) by Vladimir Makarov is the other C library here, also
absent from every round-up and also compiled as C++ unchanged. It is an eight slot SSE group, and
-- unusually -- it is a **dense** map like this one: elements are appended to an `els` array in
insertion order and the group holds indices into it.

[![ihtab's group: 8 tags, 8 indices, and an element array that is never compacted](/img/2026/hashmap-index/ihtab-group.svg)](/img/2026/hashmap-index/ihtab-group.svg)

```c
static constexpr unsigned int GROUP_SIZE = 8;
static constexpr size_t GROUP_BYTES = GROUP_SIZE * (1 + sizeof(ind_t));
static constexpr unsigned char EMPTY_H7 = 0xc0;
static constexpr unsigned char DELETED_H7 = 0x80;
static constexpr unsigned int LF_FACTOR = 1;
static constexpr unsigned int LF_DIVISOR = 2;
```

Forty bytes per eight slots: eight tags, then eight `uint32_t` indices, in one block -- the same
merged layout [the group index](#group-index) arrived at, at half the width. `EMPTY_H7` is `0xc0` and
`DELETED_H7` is `0x80`, chosen so that both have the top *two* bits set and `match_empty` is one
`movemask(g & (g << 1))`. Probing is linear over groups.

It is quick, and the reason is on the label: `LF_FACTOR / LF_DIVISOR` is **one half**, so a lookup
almost always lands in its home group and the tag compare is the whole probe. Buying probe length
with memory is available to every design in this post and is not an idea about the index -- it is the
same axis the two-bit counter sat on, filtering best when fresh. It is also a choice that works: it
builds faster at the 32,000 octave than every map here but this one, and its integer miss is among the three quickest in
[the counter table](#counters). Half the load factor is a blunt instrument and it is not a
*cheap* one, but it is not a naive one either.

The element array is never compacted: erased elements are marked in a `deleted` bitmap and
`els_bound` only grows, so a table that churns rebuilds itself periodically rather than filling a
hole. That has two measurable consequences, and both are in [the measurements](#same-workloads). Memory
across a turnover goes 36.1 to **72.3** bytes per entry and stays there, because the table carries
one dead element for every live one until it rebuilds. And it is the one dense map here that does
*not* get the dense map's iteration: an iterator has to consult the deleted bit for every element,
and that branch stops the loop vectorising, so it iterates at 7.3x unordered_dense 5.0 rather than at 1.0.
Being dense buys the iteration only when the array holds live entries and nothing else.

## ixhtab, and the bug that a constant-size churn finds {#ixhtab}

`ixht::ixhtab` puts extendible hashing on top -- a directory of bins, each an `ihtab` with sixteen
bit indices, split once a bin fills. Measuring it on the churn workload made it stand out
immediately, and the reason is a bug:

```c
if (2 * els_num >= indexes_size)  // ixhtab.hpp:290
```

`els_num` is the **whole table's** live count; `indexes_size` is **one bin's** index size. For any
table bigger than a single bin that is always true, so the code splits instead of compacting in
place -- and since a deleted slot is never reclaimed, a bin fills its element array from tombstones
alone however few of its elements are live. Each bin then splits about once per turnover, each split
halves the live occupancy of both halves, and nothing merges back. At a constant 50,000 live elements
over 40 turnovers the heap goes **1.4 MB to 44.8 MB**, 29.5 to 938.9 bytes per element and still
doubling, and a hit goes from 8.2 ns to 17-30. `ihtab::rebuild()` has the same-shaped test and is
correct there, because both quantities describe the same single table.

Reported as [vnmakarov/ihtab#2](https://github.com/vnmakarov/ihtab/issues/2) with a reproducer. The
transferable part is not the bug, it is the test: **a workload that holds the element count exactly
constant while churning is the only one that can see this class of fault**, and it is the workload
most hash map benchmarks do not have.

# 14. The summary table [&#8593; contents](#contents){:.up} {#summary-table}

Everything above, in two tables. The first is what the index *is*; the second is how it behaves. The
bold cell in each row is the choice that makes that design what it is.

**What the metadata is**

| map | keys live | metadata per slot | compared at once | fingerprint | empty / deleted |
|---|---|---|---|---|---|
| unordered_dense 4.11.0 | dense | 8 B | 1, or 4 with SSE2 | 8 bits, low byte | **distance 0 / none** |
| abseil `flat_hash_map` | flat | **1 B** | 16 | 7 bits, top | −128 / −2 |
| boost `unordered_flat_map` | flat | 1.07 B | 15 | ~8 bits (2..255), low byte | 0 / **none** |
| folly F14 | flat, dense or node | 1.14 B | 14 | 8 bits, top | 0 / **none** |
| emhash8 | dense | 8 B | 1 | **the spare high bits of the index word** | `next < 0` / none |
| emilib | flat | 1 B | 16 | hash mod 253 | −128 / −127 |
| indivi `flat_umap` | flat | **2 B** | 16 | 8 bits | 0 / none |
| indivi `flat_wmap` | flat | 1 B | **16, unaligned from the home slot** | 7 bits | 0x7F / 0x7E |
| Verstable | flat | 2 B | 1 | **4 bits, top** | 0 / none |
| ihtab | dense | 5 B | 8 | 7 bits, top | 0xc0 / 0x80 |
| unordered_dense 5.0 | dense | 5.5 B | 16 | 8 bits, low byte | 0 / **none** |
| `std::unordered_map` | node | 8 B (a pointer) | 1 | **none** | null / none |
| boost / abseil / F14 node | node | as the flat sibling | as the flat sibling | as the flat sibling | as the flat sibling |

**How it behaves**

| map | probe | a miss stops on | tombstones | moves after placement | max load | bounded on a hostile hash |
|---|---|---|---|---|---|---|
| unordered_dense 4.11.0 | linear | **the distance ordering** | no | **shifts on insert and erase** | 0.80 | yes |
| abseil `flat_hash_map` | triangular over groups | an empty byte in the group | **yes** | no | 0.875 | yes |
| boost `unordered_flat_map` | triangular over groups | **an overflow bit for its hash class** | no | no | 0.875 | yes |
| folly F14 | **double hashing** | an outbound counter of zero | no | no | 0.857 | yes |
| emhash8 | **coalesced chain** | the end of the chain | no | **evicts a stranger from its home** | 0.80 | yes |
| emilib | linear over aligned groups | an empty byte in the group | **yes** | no | 0.833 | yes |
| indivi `flat_umap` | triangular over groups | **a per-class overflow counter** | no | no | 0.875 | since 2026-09 |
| indivi `flat_wmap` | triangular in steps of 16 slots, from the home slot | an empty byte in the window | **yes** | no | 0.80 | not checked |
| Verstable | quadratic chain | **an exact in-home-bucket bit** | no | evicts at most one key | **0.90** | yes |
| ihtab | linear over groups | an empty tag in the group | **yes** | no | **0.50** | yes |
| unordered_dense 5.0 | triangular over groups | a per-class overflow counter | no | **only a hit inside a write, to its own home** | 0.80 | yes |
| `std::unordered_map` | **a linked list per bucket** | the end of the list | n/a | no | 1.0 | yes |

Three ways to read those tables.

**Down the "a miss stops on" column** is the last decade of hash map work. An empty slot is the
classic answer and it is what forces tombstones. Everything else in that column is an attempt to
answer the question without needing an empty slot: an ordering (2018), an overflow bit (2022), a
counter that an erase can undo (2019, and again in 2024 with the class split), an exact bit (2023).
The designs with **no** in the tombstone column are exactly the designs with something other than
"empty" in the miss column, and that is not a coincidence -- it is the same choice written twice.

**Down "metadata per slot"** is the memory the index costs before any key is stored. One byte is the
SwissTable floor; boost gets fifteen slots out of sixteen bytes; indivi spends two bytes to hold
three separate things. The dense maps look expensive here -- 5.5 or 8 bytes -- and are not, because
that is the only place they pay for the value's location, where a flat map pays for it by keeping
`sizeof(value_type)` of empty slot. [The memory table](#memory) measures what it actually costs per
live entry: at an eight byte value this column is roughly the answer, and at a large one it is
turned on its head.

**Down "compared at once"** is what the branch predictor sees, and it explains more of the
measurements than anything else in either table. A design that asks one question of sixteen slots
has one unpredictable branch per group; a design that asks a question per slot, or walks a chain,
has one per element visited. Verstable executes 22% fewer instructions per miss than the group
index and takes twice as many cycles, entirely for this reason.

## What one lookup touches {#what-one-lookup-touches}

The tables above are static. This is the same information as a picture of the *chain*: what a hit
has to wait for, in order. Every arrow is a load whose address the box before it produced, so
nothing after it can start early.

[![The dependent load chain of a hit, per design](/img/2026/hashmap-index/lookup-touches.svg)](/img/2026/hashmap-index/lookup-touches.svg)

Three things are worth taking from it.

**The dense designs have one more box.** Metadata, then a value index, then the value. That is the
family cost from [the three families](#three-families) and it is not recoverable by any amount of index
cleverness -- it is what the dense layout *is*. What varies is how bad the extra box is: in the group
index the index lives in the same 88 byte block as the fingerprints that produced it, so the second
load is usually in a cache line the first one already brought in, which is worth 28% of the dTLB
misses at four million entries. ihtab has the same arrangement. emhash8's index word carries the
index and the chain link together, so its extra box is folded into the first one, and it pays
elsewhere.

**Boxes at the same depth are not the same cost.** A group compare is one `movdqu`, one `pcmpeqb`
and one `pmovmskb` producing sixteen verdicts and one branch. A chain step is a load and a branch
the predictor has to guess. They occupy the same position in the picture and differ by a factor of
two in cycles, which is [the chains chapter](#chains)'s result.

**The chained designs have a variable number of boxes**, and the variability is the cost rather than
the average. emhash8's chains are short -- close to one at load 0.8 -- and Verstable's are short too.
What costs is that "is there a chain" and "is it over" are decisions, and at load 0.9 about 59% of
Verstable's misses land on a chain head.

# 15. The same workloads on every map [&#8593; contents](#contents){:.up} {#same-workloads}

Eighteen maps for an integer key and sixteen for a string -- Verstable and ihtab are the two that
drop out, both C libraries whose buckets are `malloc`ed and never constructed, so a key has to be
trivially copyable -- seven workloads, three key and value shapes, all in one process with the alternatives interleaved. Everything below is **time relative to
`ankerl::unordered_dense` 5.0**, so 1.00 is level with it and **below 1.00 is faster than it**, and
every figure is the geometric mean of five sizes spanning one doubling.
[How the numbers were made](#how-measured) says why, and how to rerun any of it.

Those seven workloads are the ones named [in chapter 2](#what-a-lookup-is-made-of).

## Integer keys {#integer-keys}

[![Every map on build, hit, churn and iterate, relative to the group index](/img/2026/hashmap-index/bench-u64.svg)](/img/2026/hashmap-index/bench-u64.svg)

`map<uint64_t, size_t>`, octave from 32,000 entries -- so the index is comfortably in L2 and the
values in L3, which is where most maps in most programs live:

*Time relative to unordered_dense 5.0: 0.80 is 20% faster, 1.50 is 50% slower. Lower is faster; bold is the fastest map in each column. The tint says the same thing again -- blue where a map beats unordered_dense, amber where it does not, deeper the further from parity -- so the colour is never carrying anything the number does not.*

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
<tr><th scope="row">unordered_dense 5.0</th>
<td><b>1.00</b></td>
<td>1.00</td>
<td>1.00</td>
<td>1.00</td>
<td><b>1.00</b></td>
<td>1.00</td>
<td>1.00</td>
</tr>
<tr><th scope="row">unordered_dense 4.11</th>
<td class="s4">2.32</td>
<td class="s3">1.52</td>
<td class="s3">1.57</td>
<td class="s3">1.42</td>
<td>1.04</td>
<td class="s3">1.46</td>
<td class="s2">1.38</td>
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

Read it by column and the chapters fall out of it.

**The miss column is the third of the five questions, answered.** abseil is the fastest of the grouped SwissTables on a hit
(0.73) and the *slowest* of the flat SwissTables on a miss (1.38), because its miss has to find an empty
control byte and at load 7/8 that is often not in the home group. boost (0.83), indivi's `flat_umap`
(0.97) and unordered_dense 5.0 all stop at home almost always, because all three have an explicit test for
"did anything of my class overflow past here" rather than relying on an empty slot. That single
column is the whole reason the overflow byte and the overflow counter were invented, and it is worth
1.4 to 1.7x between two otherwise nearly identical SwissTables.

**And the churn column does not say what the design chapters say, which is worth stopping on.**
Boost is 0.76 here and 0.53 at half a million entries, and [its own chapter](#boost-erase) has its
misses degrading 1.46x under exactly this workload. Both are true: what degrades is *probe length*,
measured in groups, and boost degrades from so far ahead that it is still the faster map when it
gets there. What a counter that comes back down buys is not a faster churn -- it is that the number
does not move at all, and that no rehash has to be scheduled to make it stop moving. A map picked
for tail latency cares about the second thing; a map picked for throughput on this workload should
read the column and pick boost.

**The chained designs pay for the miss too, and pay more.** emhash8 at 2.13 and Verstable at 2.10
are the two worst misses of any modern design here, and [the counters below](#counters) say it is
not the instructions: a chain has to be walked to its end, and whether there is one is
unpredictable.

**The iterate column is very nearly the family split.** 1.00 to 1.56 for the dense maps, 6 to 15x
for every flat map, 12 to 34x for the node maps -- the largest ratios in the post by a factor of ten,
and they come entirely from a flat map having to walk its empty slots. The exception is ihtab at
7.32, which is dense and iterates like a flat map anyway, for the reason
[its own section](#ihtab) gives: its element array is append-only, so an iterator has to test a
deleted bit per element.

**The build column has a surprise in it**, and it is not about the index: `absl flat, own hash`
builds at 1.12 where `absl flat` with unordered_dense's wyhash builds at 1.61. `absl::Hash<uint64_t>` is
much cheaper than a wyhash multiply for an integer key, and a build is the workload that hashes
most. Same map, same index, same everything -- 1.4x apart on the hash alone. It is the clearest
argument in this post for why the "same hash for all" convention needs the own-hash control beside
it.

At an octave from 500,000 entries -- the index out of L2, the values out of L3 -- the picture tilts:

*Time relative to unordered_dense 5.0, lower is faster; bold is the fastest map in each column.*

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
<tr><th scope="row">unordered_dense 5.0</th>
<td><b>1.00</b></td>
<td>1.00</td>
<td>1.00</td>
<td>1.00</td>
<td>1.00</td>
<td>1.00</td>
<td>1.00</td>
</tr>
<tr><th scope="row">unordered_dense 4.11</th>
<td class="s4">2.05</td>
<td class="s3">1.46</td>
<td class="s3">1.51</td>
<td class="s3">1.47</td>
<td><b>1.00</b></td>
<td class="s2">1.27</td>
<td class="s2">1.21</td>
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
**0.65** on a miss; abseil from 0.73 to 0.70 and from 1.38 to 0.73. That is the extra dependent load
of [the dense family](#three-families) turning from a few cycles into a cache miss and a TLB entry, and it
is the one cost of the dense layout that no index work removes. It is also why boost's *miss*
improves so much: once every lookup is waiting on memory, the number of regions touched matters more
than which of them the probe stops at.

**And the load factor stops being the story.** `indivi::flat_wmap`, the fastest integer hit at every
size, is
0.64 here -- and it is also the map with [the widest sawtooth in the post](#flat-wmap), 2.12x across the
32,000 octave where the group designs are 1.5 to 1.6x. A number for it at one size would have been
worth very little.

## String keys {#string-keys}

[![Every map on the string workloads, relative to the group index](/img/2026/hashmap-index/bench-str.svg)](/img/2026/hashmap-index/bench-str.svg)

`map<std::string, size_t>`, keys 8 to 135 bytes skewed towards short, octave from 32,000:

*Time relative to unordered_dense 5.0, lower is faster; bold is the fastest map in each column.*

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
<tr><th scope="row">unordered_dense 5.0</th>
<td><b>1.00</b></td>
<td>1.00</td>
<td>1.00</td>
<td>1.00</td>
<td>1.00</td>
<td>1.00</td>
<td>1.00</td>
</tr>
<tr><th scope="row">unordered_dense 4.11</th>
<td class="s2">1.21</td>
<td class="s1">1.12</td>
<td>0.97</td>
<td class="s1">1.07</td>
<td>1.01</td>
<td>1.03</td>
<td>1.05</td>
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
because the hash and the key comparison are most of the work and every map is being handed the same
hash. (`std::unordered_map` at 2.39 on a miss is the exception, and boost given its own hash at 1.25
is the control, which the next table is about.) That is worth saying plainly: for string keys, the
index you choose is close to irrelevant and the hash you choose is not.

One number in that table is not what it looks like. F14Vector's **0.88** on the miss is a paired
figure, and a paired harness cannot resolve a gap that size --
[measured one map per binary](#still-on-the-table) the hit is a tie and the miss is 8 to 9%, which
is the figure to quote.

Which is exactly what the own-hash control rows show. On this workload, with the hash a caller gets
by writing the type name and nothing else:

*Time relative to unordered_dense 5.0, lower is faster; bold is the best in each row.*

|  | boost, this wyhash | boost, its own hash | abseil, this wyhash | abseil, its own hash |
|---|---|---|---|---|
| hit | **0.87** | 1.14 | 0.92 | 0.95 |
| miss | **0.84** | 1.25 | 0.98 | 0.99 |
| build | 1.41 | 1.60 | 1.25 | **1.24** |
| churn | **0.87** | 0.92 | 0.93 | 0.93 |
{: .heat-par}

`boost::hash<std::string>` costs boost 31% on a hit and 49% on a miss and turns a map that is ahead
of unordered_dense 5.0 into one that is behind it. `absl::Hash<std::string>` costs abseil 1 to 4% and
changes nothing. So the often-quoted "boost is faster on string lookups" is a statement about boost
*given unordered_dense's hash*; out of the box it is not, and abseil's default is the one that holds up.
For an integer key it goes the other way, though only for one of them: `absl::Hash<uint64_t>` is
1.4x cheaper on a build and shows plainly in the integer table, where `boost::hash<uint64_t>` is a
wash against this wyhash to within a percent.

## A 64 byte mapped value {#big-value}

[![Every map with a 64 byte mapped value, relative to the group index](/img/2026/hashmap-index/bench-big.svg)](/img/2026/hashmap-index/bench-big.svg)

`map<uint64_t, some_64_byte_struct>`, octave from 32,000. This is the axis that separates flat from
dense and nothing else changes:

*Time relative to unordered_dense 5.0, lower is faster; bold is the fastest map in each column.*

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
<tr><th scope="row">unordered_dense 5.0</th>
<td>1.00</td>
<td>1.00</td>
<td>1.00</td>
<td>1.00</td>
<td>1.00</td>
<td>1.00</td>
<td>1.00</td>
</tr>
<tr><th scope="row">unordered_dense 4.11</th>
<td class="s3">1.95</td>
<td class="s2">1.39</td>
<td class="s3">1.56</td>
<td class="s2">1.35</td>
<td><b>1.00</b></td>
<td class="s2">1.39</td>
<td class="s2">1.26</td>
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

**Building is 1.6 to 1.8x faster dense** than boost, F14Value, emilib and indivi given the same hash,
because growth copies four byte indices rather than 72 byte slots, and **iteration is 2.8 to 4.1x
faster dense**, because there are no empty 72 byte slots to walk. Both gaps grow with the value. The
exception in the build column is abseil, at 1.22 with this wyhash and 0.94 with its own integer
hash: the same 1.4x hash effect as in the integer table, showing through a workload that is half
hashing.

Against that, the flat maps keep their lookup and churn advantage -- boost is still 0.75 on churn --
so the trade is exactly what [the three families](#three-families) says it is, at the value size where it is
easiest to see.

## Memory {#memory}

[![Bytes per entry with a 64 byte value, before and after churning](/img/2026/hashmap-index/memory-big.svg)](/img/2026/hashmap-index/memory-big.svg)

Bytes of heap per live entry, counted by `mallinfo2` around a build and then around a full turnover
of churn, geometric mean over the same octave. Two columns, because the second is the memory cost of
whatever an erase leaves behind.

*Bytes of heap per live entry, lower is better; bold is the leanest in each column. Rows are grouped by family -- flat, then dense, then node -- and sorted within each group, so a number out of order down the page is a family boundary rather than a mistake.*

| map | 8 byte value, steady | after churn | 64 byte value, steady | after churn |
|---|---|---|---|---|
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

`uint64_t` keys, octave from 32,000 entries; the flat maps hold a 16 or 72 byte `value_type` and the
dense ones hold the same in a vector plus their index. Verstable and ihtab have no 64 byte figure
because the adapter that measures memory holds the mapped value by value and neither library's C
interface takes one that large without changes I did not make.

**At an eight byte value the flat maps win and it is close.** 27 to 29 bytes per entry against 32.6
for unordered_dense 5.0, which is one byte of metadata per slot at load 0.875 against 5.5 bytes at 0.8 --
plus the doubling overhang of a `std::vector`, which is what most of the gap actually is. That last
part is a knob rather than a property: the value container is a template parameter, and one that
grows by 1.5x instead of 2 measures **10% less per entry, for 14% of the build** (and 13% less at a
64 byte value, for 19%). Those figures come from a separate experiment with its own baseline -- 33.2
and 113.3 bytes per entry where this table reads 32.6 and 107.6 -- so read the percentages against
the rows above rather than the absolutes. Level with boost on memory, at the cost of the build,
which is the column unordered_dense leads the field on -- which is why 2 is still the default, and why the trade is
available to anyone whose scarce resource is the other one. Every map here doubles, incidentally:
folly's much-quoted 1.406 growth factor binds only on an explicit `reserve`, never on insertion.

**At a 64 byte value the order reverses completely, and the node maps win.** A flat map pays for
every empty slot at the full width of the value: at load 0.875 that is 82 bytes of slot for 72 bytes
of data before any metadata. A dense map pays 72 bytes plus 5.5 of index. A node map pays 72 plus a
pointer plus the allocator's header and is the leanest of the three, which is the one column where
`std::unordered_map` is competitive with anything.

**The churn column is where tombstones show up as bytes.** Everything with `no` in the tombstone
column of [the summary table](#summary-table) is flat across a turnover, to the byte. abseil goes 27.0 to
31.0 and 113.3 to 130.2, because its tombstones count against the growth budget and a churning table
therefore rehashes into a bigger one; `indivi::flat_wmap` does the same, 31.0 to 35.7. emilib has
tombstones and does *not* grow, because it counts only live elements against its limit -- so it pays
in probe length instead, which is the trade the other way round.

**And ihtab doubles**, 36.1 to 72.3, and stays there: its append-only element array again, carrying
one dead element for every live one until it rebuilds. That is a design choice rather than a fault
-- unlike its extendible-hashing sibling [ixhtab](#ixhtab), where the same property meets a
bin-splitting test that compares a table-wide count against a per-bin size, and the memory does not
stop growing at all.

# 16. Where the time actually goes [&#8593; contents](#contents){:.up} {#where-the-time-goes}

The tables above are ratios, and a ratio can only tell you which map was quicker. These are the
counters underneath them -- instructions, cycles, branch misses, cache lines -- one map per binary
so that nothing in the measurement depends on what else was compiled beside it, and then the three
instructions that separate the three answers to "absent?", read out of the binaries. It is the same
field as the chapter before, asked why instead of how much.

## Counters {#counters}

Times are ratios; counters are not. These are their own campaign, so their absolute nanoseconds are
not the ones in [chapter 7's degradation table](#bit-vs-tombstone) or in
[the huge-pages note](#still-on-the-table) -- different sizes, different binaries, different days.
One map per binary, `perf stat`, 30 million lookups on a table of 50,000 entries -- the index in L1 and L2, so what is being counted is the *work*, not the memory
system. Per lookup:

*Per lookup, lower is better except IPC; bold is the best in each column of each half. The ns column of the upper half is quantised to a third of a nanosecond by the harness's timer, which is why several maps read exactly level there; the cycle counts are the ones with the resolution to separate them.*

|  | ns | instructions | cycles | branch misses | L1 misses | IPC |
|---|---|---|---|---|---|---|
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

**The bottom of the miss table is the whole argument of this post in four rows.** Verstable executes
**44.6 instructions and takes 40.8 cycles**; unordered_dense 5.0 executes 57.2 and takes 20.7. Twenty-eight
percent more work, in half the time, because 0.108 branch misses against 0.806 is about eleven
cycles of pipeline. emhash8 is the same shape. `std::unordered_map` is the same shape again with a
pointer chase on top: 52.9 instructions at an IPC of 0.78.

**The two flat SwissTables that answer a miss with an empty byte are the expensive ones**, which is
the mechanism rather than a coincidence: abseil 32.6 cycles and 0.362 branch misses, emilib 32.1 and
0.420, against boost's 20.4 and 0.164 -- and [the assembly below](#probe-assembly) says why in two
instructions.

**And nobody is instruction-bound.** Every design here retires between 0.8 and 3.3 instructions a
cycle on a core that can do four; the ones near the top are waiting on the branch predictor, and at
a bigger table they will all be waiting on memory instead. At a million entries, the same all-hits
lookup:

*Per lookup at a million entries, lower is better; bold is the best in each column.*

|  | ns | cycles | dTLB misses | L1 misses |
|---|---|---|---|---|
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

**The dTLB column is the family split**, and it is the clearest single number for the dense penalty:
1.16 to 1.61 misses per lookup for the flat maps that touch one region, 1.78 to 2.21 for the dense
ones that touch two, 2.58 for a node map that touches a heap allocation. On 4 KB pages a page walk
is not something a prefetch can hide, which is why huge pages are worth 22% here and nobody asks for
them ([what is still on the table](#still-on-the-table)).

## The probe loops, in assembly {#probe-assembly}

The three answers to "absent?" are three instructions, and you can read them straight out of the
binaries. All three are the tail of the same loop -- broadcast the fingerprint, compare sixteen
bytes, `pmovmskb`, walk the matches -- and they differ only in what happens when the mask is empty.
Compiled with clang 22 at `-O3`, default `-march`, one map per binary, from the all-hits lookup
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

Three things are visible here that no table shows.

The **miss test** is two vector instructions and a branch in abseil, one memory `test` in boost, one
`cmp` against an immediate zero in the group index -- and abseil's, unlike the other two, has to
consult *all sixteen bytes* rather than one. That is the mechanism behind the 1.38 in the miss
column.

The group index's **two prefetches are issued before the metadata load**, which is why its extra
dependent load costs less than [the picture of what one lookup touches](#what-one-lookup-touches)
suggests: the value index is in the same block and the line is already on its way. On x86 that
placement is compiler-dependent and not tunable in both directions -- clang emits both prefetches
before the `movdqu` and gcc emits them after, and dropping one is a 5-11% clang win and a 12% gcc
loss at four million entries.

And **the match walk is the same three instructions everywhere** -- `tzcnt`, use the lane,
`lea`/`and` to clear it -- which is worth noticing because it is the part everyone gets right. All
the design difference is in the two instructions before and after it.

## Three ways to be fast {#three-ways}

Put those counters beside the times from [the chapter before](#same-workloads) and the field sorts
into three strategies, none of which dominates.

**Fewest instructions.** Verstable, and emhash8 close behind. A chain visits only keys that belong
to this bucket, so in principle nothing is wasted -- and it loses, because every step is a branch.

**Fewest regions touched.** The flat SwissTables. One allocation, one dependent load after the
metadata, the key right there. On integer keys this wins a fresh hit at every size and wins by *more* the larger
the table gets, which is the one trend in this post that does not reverse.

**Fewest unpredictable branches.** The group designs. One question per sixteen slots, whatever the
group holds, and the answer to "absent?" arranged so that a miss usually stops at home. This wins in
cache and on anything that erases, and it is what the last five years of hash map work has mostly
been about.

The reason none of them dominates is that they are strong against different costs, and which cost
dominates depends on the table size. In L1 and L2 the branch predictor is the bottleneck and the
group designs win; past L3 the memory system is, and the map that touches one region wins. The
dense maps are on the wrong side of that second one by construction, and on the right side of every
column that involves iterating, growing, or a value bigger than a pointer.

# 17. Question by question [&#8593; contents](#contents){:.up} {#question-by-question}

What the measurements say, workload by workload. The first three items are
[questions 3 and 5](#five-questions) -- when may a miss stop, and what does an erase leave behind --
which are the two the designs actually disagree about; the rest are not questions about the index at
all, and decide which map you want anyway.

**A hit on a fresh table.** On integer keys, the flat SwissTables, and it is not close. (On string
keys nothing is: the fastest hit there is a *node* map, boost's, and the spread across the modern
maps is 15%.) One region, one dependent load
after the metadata, and the key is in the group. abseil and boost trade places depending on the hash
and the size; indivi is with them. The dense maps pay one more load for it: against the fastest flat
map in the same table unordered_dense 5.0 is 1.41x behind at 32,000 entries and 1.56x at 500,000,
and against its own flat sibling F14Vector is 1.16x behind F14Value. That is the family cost and no
index trick recovers it.

**A miss on a fresh table.** Closer, and in cache the counter designs do well, because a miss that
stops at its home group never touches a key at all -- the metadata compare is the whole lookup, and boost's
overflow bit, indivi's counter and unordered_dense's counter all stop there almost always. The chained
designs are worst here for the opposite reason: a miss has to reach the end of a chain, and whether
there is one is exactly the unpredictable question. Past L3 the order changes and the counters stop
being what decides it -- at half a million entries `flat_wmap` is 0.60, boost 0.65, abseil 0.73 and
emilib, which has tombstones, 0.74 -- because by then every design is waiting on memory and what
counts is how many regions it touches.

**A table that only churns.** This is where the answers to "gone?" separate. The designs whose miss
test comes back down -- F14's counter, indivi's, unordered_dense's -- hold their probe lengths. The
designs that leave something behind -- abseil's tombstones, boost's overflow bits, emilib's and
ihtab's tombstones -- get slower until a rehash, and pay for the rehash. Whether that shows in a
benchmark depends entirely on whether the benchmark holds the size constant; most do not. It is a
statement about the *shape* of the curve and not about the winner: boost degrades 1.46x on a miss
and is still ahead of unordered_dense on the churn workload at every size, because it begins there.
Counters buy a flat line, not a lower one.

**Iteration.** The dense maps, by an order of magnitude, and it is the single largest ratio anywhere
in this post. A dense map walks exactly the live entries in a contiguous array; a flat map walks the
whole slot array, and at load 0.5 that is twice the memory for the same elements. F14Vector and
emhash8 are here with unordered_dense; ihtab is not, because its array is append-only and its
iterator has to check a deleted bit per element.

**Large values.** The dense maps again, for the same reason from the other side: a flat map writes
`sizeof(value_type)` into a hash-scattered slot and copies all of it on every growth, where a dense
map writes four bytes there and appends the payload in order.

**Memory.** At a large mapped value, nearly the reverse of the metadata-per-slot column of
[the summary table](#summary-table); at an eight byte one, close to the same order. A
flat map's cost per *live* entry is `sizeof(value_type) / load factor` plus a byte or two of
metadata, so its footprint is dominated by empty slots at the width of the value; a dense map's is
`sizeof(value_type)` exactly, plus its index at the width of a slot. That crosses over as the value
grows, and where it crosses is measured in [the measurements](#same-workloads).

**Pointer stability.** Only the node maps, and only they can. If you need a reference to survive an
insert, nothing in the flat or dense families will do it and no amount of measurement changes that.
`unordered_dense::segmented_map` is a partial answer -- it keeps references valid by segmenting the
value vector -- and it is not the same guarantee, because the index still doubles beside itself.

**A hostile hash.** Every design here degrades to linear scanning of a probe sequence, which is fine.
The question is whether it *terminates*: `indivi::flat_umap` did not until
[September 2026](https://github.com/gaujay/indivi_collection/issues/2), and neither did unordered_dense 5.0 until the review before its release; eight
chosen keys were enough to hang either. abseil
additionally salts each table with a per-table seed, which is the only defence here aimed at an
adversary rather than at an accident -- and, [measured in unordered_dense](#borrowed), one that costs
zero cycles on a lookup, so the argument against it is about reproducible iteration order and not
about speed.

**Erase by iterator.** indivi, because of the distance nibbles: no hash, no key access. Everything
else re-derives the home from the key.

**Small, short-lived maps.** The maps that allocate nothing until the first insert, and abseil's
[single-element mode](#swisstable), which makes an empty or one-entry map allocate nothing at all.
Worth measuring if that is your workload, because the ranking there is
not the ranking anywhere else.

## Which one, then {#which-one}

If the values are small and the table is mostly read: a flat SwissTable, and
`boost::unordered_flat_map` or `absl::flat_hash_map` are both excellent. If you iterate, or the
values are large, or you want the memory of a dense layout: a dense map, and
`ankerl::unordered_dense` is mine so take the recommendation accordingly. If you need references to
stay valid: a node map, and prefer `boost::unordered_node_map` or `absl::node_hash_map` over
`std::unordered_map`, which is slow for reasons the standard requires.

I wrote [a quiz](/which-hash-map/) about this, which asks the questions in an order that gets to an
answer faster than a table does.

# 18. What unordered_dense 5.0 took from the others, and what each idea was worth [&#8593; contents](#contents){:.up} {#borrowed}

**This is the narrowest chapter in the post, and the one where I am not a reporter.** Every design
above was read with one question in mind: is there something in it that belongs in
[the group index](#group-index)? Twelve ideas were then built into unordered_dense 5.0 and measured
against the same header without them. Four are in the shipped index, one is there behind a switch,
and seven are not -- and the seven are the more interesting part, because a negative result with a
mechanism behind it says more about a design than a positive one does.

**Read a row as "unordered_dense 5.0 already had a way of doing this", not as "this was a bad
idea".** Nothing here is a verdict on an idea, and still less on the map it came from. It is what
one idea was worth in *one* map, whose layout, value indirection, maximum load and probe had already
decided most of what there was to decide -- and that is the mechanism behind several of the seven:
an idea earns its keep in its own map because nothing cheaper filtered first, and earns nothing here
because the group compare and the counter already had. In its own map it is not slower by 4%; it is
the reason that map is fast.

**And the list runs the other way too.** Every part of this index worth having came from somewhere
on it: the counters are [indivi](#indivi)'s, the erase that decrements them is [folly](#f14)'s, the
pre-broadcast fingerprint word and the prober that terminates are [boost](#boost)'s, and the group
of sixteen fingerprints compared in one instruction, which everything else here sits on, is
[abseil](#swisstable)'s. What is mine is the arrangement, and the measuring; the shoulders are
theirs.

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

"On the suite" is the geometric mean of the fifteen workloads of unordered_dense's own benchmark,
each row measured paired against the same header with that one change taken out. Where a number
needs more than a row, it is below.

**Read the small rows with the caveat this post spends [chapter 20](#how-measured) earning.** A
paired harness cannot resolve a few percent, and six of these rows are a few percent. Most of them
do not rest on it: the terminating probe is settled by instruction counts, the seed and double
hashing by one map per binary, the counter widths and the exact in-home test by probe lengths
counted inside the header, the nibbles by instructions per round. Three do -- the second
fingerprint, the cache-line-aligned metadata and the narrow value index, at 2.5%, 0.7% and 1.4% --
and those three are best read as "measured, did not pay for itself, not re-tested on a better
instrument" rather than as settled.

## From boost: the fingerprint word table, and a probe that terminates {#from-boost}

The 256 entry table of pre-broadcast fingerprint words, which [boost](#boost) has and
unordered_dense had lost somewhere: building the word arithmetically is an and, a compare, a
shift, an or and a multiply on the critical path of every probe, placement and erase, and one L1
load is cheaper. Paired, integer misses 5 to 6% faster on both compilers, big-value finds 14% faster
under gcc.

The other thing taken from boost is its terminating prober, and that one is a correctness fix
rather than an optimization: it is [the miss bound](#group-index), with the eight keys that showed
it was missing.

## From folly F14, and then from Verstable: how wide should the counter be {#counter-width}

The group index keeps eight one-byte counters per group, one per fingerprint class, and folly's
design asks the obvious question: is one enough? It is measurable, and so are the other directions
off the shipped design. Every division of a group's eight counter bytes was built, on a table at
load 0.76 after 200 turnovers:

*Groups visited per miss, the share of misses that leave home, and time on the suite relative to the shipped design: lower is better throughout, bold is the best in each column. The churned column here is the older instrumentation, the one whose absolute figures [the drift section](#drift) retracts -- it reads 1.26 groups where the instrument used everywhere else reads 1.06. The four rows are measured against each other on one instrument and are comparable to each other; do not read them against a number from another section.*

| counters per group | fresh miss | churned miss | misses continuing past home | time on the suite |
|---|---|---|---|---|
| 1, F14 style | 1.21 groups | 2.79 | 60% | 1.043 |
| 8, one byte each | 1.06 | 1.26 | 17.5% | **1.000** |
| 16 nibbles | 1.03 | **1.13** | **9.7%** | 1.014 |
| 32 two-bit | **1.02** | 1.15 and rising | rising | 1.012 |
{: .heat-low}

A shared counter does not know the fingerprint class, so *any* overflow past a group makes every
later miss into it carry on -- and in a churned table most groups have seen an overflow, so 60% of
misses continue. It is 4% slower over the benchmark suite and 20% slower on churn.

**Finer** (sixteen nibbles) filters genuinely better -- 9.7% of churned misses continue against
17.5% -- at no memory cost, and still loses, by 1.4%, because a sub-byte counter is a
load-mask-compare on the read and a read-modify-write on the increment, paid on *every* lookup, to
save a group hop that was already rare. Two-bit counters filter best of all when fresh (1.3%
continue) and are the worst under churn, because their maximum of 3 is reached constantly and a
saturated counter never comes back down. A byte per class is the point where the counter is a single
aligned load and still knows the class.

Two more variants on the same axis. Consulting a *different* class at each step of the probe
(`(fp + d) & 7`) is exactly a no-op, as the arithmetic says it must be: a displaced sibling adds the
same *d* the miss does, so if they agree at step 0 they agree everywhere. Three fresh hash bits per
step does break that lockstep and takes the churned miss from 1.262 groups to 1.238 -- and measures
as noise, because it is 2% of the probe work on a path 17.5% of churned misses reach.

And the fifth point on the axis, from [Verstable](#verstable): an **exact** counter, a second set of
eight per group holding "entries of class *c* whose home **is** this group and which did not fit",
which is its in-home bit generalised. Measured before writing any of it, on an instrumented header
that rebuilds the exact answer offline by hashing every occupied slot: at load 0.79 after 200
turnovers it takes a churned miss from 1.242 groups to 1.201. That is a quarter of what moving
displaced keys home is worth, for eight more bytes per group and a second invariant to keep. (The
churned baseline of that instrument is one I later failed to reproduce -- see [drift](#drift)
in the group index chapter -- but what matters here is the *difference* between two variants
measured with one instrument.) **About 80% of what the approximate counter fails to filter is
siblings** -- keys that genuinely home in that group and genuinely did not fit -- and both tests say
"continue" for those, correctly. Being exact only removes the strangers.

## From folly F14: double hashing instead of a triangular probe {#from-f14-probe}

The other transferable thing in [F14](#f14) is the probe sequence, and it is aimed at a real
weakness here. Under a
triangular sequence every key homed in group *g* walks the same groups, so a [sibling](#counters-by-class)
sits exactly where a later miss for *g* will look. That is
most of the problem: it is the same 80% the exact counter above could not remove either.

Double hashing breaks it. Taking the step from bits 8 to 15 of the hash -- which neither the group
(the top bits) nor the fingerprint (the low byte) uses -- and forcing it odd keeps the "visits every
group exactly once" property that the miss bound needs, and gives two siblings different tours. It
does exactly what it is supposed to. Groups visited per lookup, triangular against double hashed:

*Groups visited per lookup, lower is better; the second number of each pair is double hashing.*

|  | fresh miss | churned miss | fresh hit |
|---|---|---|---|
| load 0.760 | 1.052 to **1.035** | 1.061 to 1.050 | 1.031 to 1.027 |
| load 0.799 | 1.086 to **1.054** | 1.122 to 1.096 | 1.039 to 1.033 |

**A third of the excess, gone -- and it is slower.** Paired on the benchmark suite, random integer
misses come out **9% slower**, builds 5%, big-value churn 3%. One map per binary says why: **+4.6
instructions per lookup** and one more live register in the probe, the placement and the counter
walk, against 0.03 groups on a path five percent of misses reach. Branch misses actually improve
slightly, 0.108 to 0.093, and it does not matter.

It is the same answer as every other idea in this post that added work to a path that always runs.
The group compare and the counter have already taken the probe to 1.03 groups, so **the shape of the
sequence past home has nothing left to win.** Folly's comment is right about folly's map, where the
tour matters precisely because there is no per-class counter stopping a miss at home in the first
place.

## From emhash8: a second fingerprint in the spare index bits {#from-emhash8}

[emhash8](#emhash8)'s free fingerprint is the most tempting idea in this post to steal, because
unordered_dense's value index is also a `uint32_t` with spare high bits, and it is also loaded on
every hit. Eight bits there cost nothing until a table wants more than 2^24 slots.

Measured, it is **2.5% slower** on the geometric mean, and the losses are precisely on lookups:
find 9%, big-value find 8%, random hit 7%, churn 8.5%. The reason is the general shape
this whole exercise keeps running into: **a filter only pays where nothing cheaper filtered first.**
For emhash8 the trick is free because there is no group-level fingerprint and the word has to be
consulted anyway. Here the sixteen-way fingerprint compare has already rejected everything it is
going to reject, so a second check adds an xor, a shift and a compare to the dependent chain of
every lookup in order to avoid a value access on the 3% with a fingerprint collision.

## From indivi: the counters themselves, and the nibbles that did not follow {#from-indivi}

[indivi](#indivi)'s counters are the ancestor of these, and what changed in the copy is small: the
fingerprint word remap (0 to 8, so that the class is unchanged), the fact that unordered_dense's
counters live in the same block as the value indices, and the **termination bound**, which indivi lacked
until [it was reported](https://github.com/gaujay/indivi_collection/issues/2) -- `find_impl` looped on `gIndex <= mGMask`, which the mask makes always
true -- and has had since September 2026.

The nibbles did not follow, and they were measured properly before being dropped. Implemented here
as a slot back-pointer per value (four extra bytes per entry) plus indivi's distance nibbles, so
that `erase(iterator)` needs no hash at all, on the one workload it exists for -- find, then
`erase(it)`, then insert, on a reserved table:

- with `std::string` keys, **1.10x faster**: 1006 to 888 instructions per round, one wyhash and two
  probes gone.
- with `uint64_t` keys, **1.10x slower**: 352 to 363 instructions. The saved hash is eight
  instructions and the back-pointer maintained on every insert costs more than that.
- on the benchmark suite, where every erase is by key and the back-pointer can only cost: 4%
  slower on the geometric mean, integer build 17% slower, big-value build 11%, integer churn 10%.
- memory 31 to 38 MB per million eight byte values.

So it is a real win for a real pattern, and the pattern needs an expensive key *and* an erase by
iterator, and a caller with both can call `erase(key)` with the hash their own `find` already paid
for.

## From abseil: a per-table seed {#from-abseil-seed}

[abseil](#swisstable) mixes a seed of its own into every hash so that keys chosen against a known
hash cannot be aimed at a particular table. It is the one idea in this post aimed at an adversary
rather than at a workload, and it is cheap enough to be worth reporting precisely. Implemented here
the same way -- `mixed_hash` returns
`hash ^ m_seed`, with the seed scrambled from the table's own address, so two live tables differ and
ASLR makes two processes differ -- it costs, one map per binary at 50,000 entries, **one instruction
and zero cycles** per lookup: 21.4 cycles against 21.4 on a miss and 29.6 against 29.6 on a hit, ns
per operation identical to two decimals. On a *build* it costs 3.5% (7.13 to 7.38 ns per element),
because the pipelined rehash is latency-bound and the xor lands between the hash and the group
address.

What makes it a feature rather than a patch is the rest. The seed has to travel with the index it
built, through both allocator-aware constructors, both branches of the move assignment, the copy
assignment and `swap` -- six sites, and the test suite failed in 85 places until all six were right,
which is a good sign for the suite and a fair statement of the surface area. Eleven tests then still
fail because they assert that `mixed_hash` returns an avalanching hash *unchanged*, which a seed
contradicts by design. And iteration order stops being reproducible between runs.

So: worth having behind a switch, not worth making the default, because the cost is paid by everyone
and the threat is not everyone's. abseil makes the opposite call, and it is defensible -- it is a
library used at a scale where somebody is always feeding you keys.

## From abseil and boost: cache-line-aligned metadata {#from-aligned}

[abseil](#swisstable)'s and [boost](#boost)'s groups are cache-line-aligned, which they get for free
because their metadata is 16 bytes. Measured while the value indices were still a separate array:
a group's sixteen indices are exactly 64 bytes, and glibc hands back large allocations at 16 mod
64, so *every* group's indices straddled two cache lines. Giving the index
array a 64 byte aligned block type does exactly what you would expect on lookups (find and hit both
2% faster) and costs 4-5% on builds and churn, for a net **0.7% loss** on the geometric mean. The
likely mechanism is conflict misses: with both arrays at power-of-two offsets, a group's metadata
and its indices collide in the same cache sets more often than when one of them is skewed.

## From CPython: a value index narrower than 32 bits {#from-cpython}

[CPython's compact dict](https://mail.python.org/pipermail/python-dev/2012-December/123028.html)
sizes its index to the table, one byte, two, four or eight. The equivalent here is a group type with
a `uint16_t` index, which makes the block 3.5 bytes per slot instead of 5.5 and puts two groups'
indices in one cache line. Over the thirteen workloads of the suite that fit under 2^16 entries it
is **1.4% slower**, with only random integer hits (3% faster) and string finds (2%) ahead and churn
and big-value finds 3 to 4% behind -- and the reason kills the adaptive version too. A map small
enough to be indexed in 16 bits has an index of at most 128 KB, which is already in L2, so halving
something that already fits buys nothing, the narrow loads cost a zero-extension on every use, and
the maps whose index footprint actually hurts are exactly the ones that need more than 16 bits.

# 19. Building the group index: growth, the compiler, the hash [&#8593; contents](#contents){:.up} {#building}

The three sections here are about unordered_dense 5.0 and not about its index: how it grows,
what the two compilers do to it, and what hash it is handed. They are here rather than in
[the group index chapter](#group-index) because a reader of the reference does not need them, and a
reader who wants to know where the group index's build and lookup times actually come from does.

## Growth: the pipelined rehash {#pipelined-rehash}

Placement is shift-free, so a rehash can place in any order. The loop hashes sixteen elements ahead
of the one it places and prefetches the group each will land in. While the index still fits in cache
that is 1.26x for the pipelining alone; once it does not it is everything for strings, whose hash
has work to hide a miss
behind -- 2.5x at 2M and 4M entries -- and nothing at all for integers at 176 MB, because that loop
is bound by the TLB rather than by latency (1.15 dTLB misses per placement on 4 KB pages, and a
prefetch cannot hide a page walk).

**Nobody else has one, and it does not transfer.** Folly prefetches the *source* values of the chunk
it is about to hash (`prefetchBeforeRehash`) and then places each one synchronously; abseil solves a
different problem in `GrowToNextCapacity`, moving the elements that stay in their home group of the
doubled array straight across and encoding the ones that would probe as `(h2, source_offset, h1)`
into a stack buffer for a second pass, so nothing is hashed twice; boost, indivi, emhash8, emilib,
Verstable and ihtab hash and place one element at a time with no prefetch at all. Ported into a copy
of boost's `unchecked_rehash` -- sixteen elements of lookahead, prefetching the destination group
and all four cache lines of its slots -- it is a wash to a loss: under clang 6.5 to 7.0 ns per
element at 200,000 integer entries and 10.6 to 11.1 at a million, under gcc 10.2 to 7.0 and 10.4 to
10.2, where the one real gain is gcc's straight loop being 1.5x slower than clang's on the same
source and the restructuring taking it to clang's floor.

The reason is that the two loops are not bound by the same thing. Per element rehashed at a million
`uint64_t` entries, `perf stat`: **boost 97.5 instructions and 110.9 cycles, unordered_dense 51.9
and 46.7**, on the same 3.7 to 3.8 L1 load misses. A flat map's rehash *moves the `value_type`* into a
hash-scattered slot -- that is where the extra instructions go, and the random writes that follow
are write-allocate misses a load prefetch does not help -- where a dense map's moves a four byte
index and leaves the values where they are. The lookahead hides a load's latency behind a hash
chain, and boost's growth is not waiting on a load.

Two things around it are worth recording, and the first is what a rehash is *not* bound by. A
database-style **radix partition** of the elements by the top bits of their group cuts the dTLB
misses to 0.24 and halves the isolated loop from 4M entries up -- and end to end it is
indistinguishable, because the scratch array is fresh memory every time and faulting it in costs
about a microsecond a page, and a rehash is a minority of a large build anyway. Ported into boost,
where growth is three quarters of a build rather than a quarter, it fails the same way and further:
1.7 to 2x slower at every size with a fresh scratch, a 19% win on the isolated rehash at four million
integer entries once the scratch is kept warm across rehashes, and a 5 to 10% *slower* build, because
a build doubles twenty-odd times and the scratch grows with it.

The second is a single line of source. The loop used to index the value container,
`m_values[value_idx]`, which cost clang **a memory latency per element**: placing an entry stores a
`std::uint8_t` fingerprint,
that store may alias any object including the container's own data pointer, so the next iteration
had to reload the pointer before it could form the address of the next key -- and the random group
access could not start until that resolved. Walking with an iterator instead took the growth phase
from 10.43 ns per insert to 2.74 and the whole 200,000 element build from 16.72 ms to 8.96. gcc had
disambiguated it on its own, which is exactly why comparing two compilers' absolute times is worth
doing.

## What the compiler decides {#compiler}

Two of the largest single numbers on this branch are not design changes at all.

`probe` is marked force-inline, because **gcc leaves it out of line in a large translation unit** --
its unit-growth budget runs out and the probe, bigger with the SWAR match, is what it stops inlining.
The whole design assumes the probe is inlined; the prefetch, the hoisted pointers and the early exit
only pay inside the caller. With the attribute, gcc's lead over 4.11.0 went from 1.15x to
**1.24x** with SSE2 and from 1.10x to 1.17x without, and the string lookups that were the one family
behind 4.11.0 came out ahead of it. clang measures 1.00 everywhere, having inlined it already.

And clang splits the insert path in two: `do_try_emplace` gets a six register prologue and calls
`do_place_element` out of line, which clang refuses to inline at cost 480 against a threshold of 250
(`vector::emplace_back` with `piecewise_construct` is 225 of that). Per insert on a reserved table,
net of the loop:

*Per operation on a reserved table, net of the benchmark loop, lower is better. The first two
columns are an insert that places; the third is `operator[]` on a key that is already there, which
never places.*

| compiler | unordered_dense, insert | boost, insert | unordered_dense, `operator[]` on a present key |
|---|---|---|---|
| clang 22 | 128 instructions, 39 cycles | 64, 26.5 | 74 instructions |
| gcc 16 | 82 instructions, 26 cycles | 55, 23 | 68 instructions |

Forcing the inline takes the miss path to 100 instructions and 32 cycles and raises `operator[]` on
a *present* key from 74 to 88, because the merged function pays the placement code's register
pressure on the path that never places. Paired on the benchmark suite that came out 1.2% faster with
every interval excluding parity, so the attribute went in.

**Then I took it out, and put it back the same day.** That is the most useful thing in this
chapter, so here is the whole of it. The paired harness compiles both headers into *one translation
unit*, which is the condition under which a compiler runs out of inlining budget, so making one
header smaller changes what is inlined in **both**; it cannot see this class of change and it gets
the sign wrong. Re-measured one header per binary, the scored suite is **1.7% faster under clang and
3.9% under gcc without the attribute** -- and per workload in that binary, `build64` is **15% faster
without it** and `buildbig` 16%, against churn 7 to 9% slower. On that I removed it.

**That was still the wrong instrument, and the reason is a rule I did not have.** The scored
benchmark is ~90 translation units of test suite -- the largest unit anyone compiles this header
into, and one whose inlining budget is already spent, so an `always_inline` in it displaces
something else. A caller's translation unit holds one map. Measured *that* way, building from empty,
with the attribute against without:

*One map per binary, building from empty, lower is better.*

| entries | with the attribute | without | instructions with | without |
|---|---|---|---|---|
| 32,000 | **251,633 ns** | 287,833 | **5.08M** | 5.98M |
| 200,000 | **1,749,840 ns** | 2,087,600 | **28.09M** | 33.71M |
| 1,000,000 | **13,064,800 ns** | 15,670,600 | **162.3M** | 190.4M |

**14 to 20% slower without it at every size**, and the instruction counts are what settle it,
because neither code layout nor drift can move them: 17 to 20% more work retired. The eighteen-map
binary agrees, at 17% slower on a build at 32,000.

The order it happened in is the uncomfortable part. When I removed the attribute I had two readings:
the paired one, which said keep it, and the ~90-unit one-header-per-binary one, which said remove it
and which I had just finished arguing was the better instrument. I removed it. The two readings that
say the removal hurt -- the eighteen-map binary and the one-map binary -- I took *afterwards*, while
re-measuring something else entirely, and the eighteen-map one I dismissed on sight as an artefact of
its own translation unit. It was not; it was the only harness in the room whose answer matched a
caller's.

So the attribute is in the header, and the rule it leaves is narrower than "one map per binary":
**the translation unit's *size* decides what an `always_inline` is worth, a benchmark binary is the
largest unit anyone compiles into, and an instruction count is the only number in the argument that
none of it moves.** What the attribute costs is unchanged and is written above it in the header -- a
`try_emplace` on a key that is already there goes from 48.4 instructions to 73.2. That is a later
measurement than the table above and in a binary holding one map rather than the whole suite, so it
is a bigger penalty on smaller numbers; the mechanism is the same one either way. The merged
function pays the placement code's register pressure on the path that never places. It is simply
smaller than 17% of a build.

## The hash it is given {#the-hash}

A hash for a map is chosen on **latency**, not throughput, because its result is the address of the
group to probe and nothing after it can start. That sounds obvious and it orders candidates by more
than 2x. An AES-NI hash is a quarter faster in a hashing loop and, inside unordered_dense, 9 to 37%
slower on every single workload -- worst (37%) on the one that cannot overlap anything, a random hit, and
least bad (9%) on a build, whose rehash hashes sixteen ahead. One hasher per binary, 30M
all-hits lookups: AES executes **fewer instructions** (5.15G against 5.35G) and takes **59% more
cycles**, IPC 1.30 down to 0.79. That is a dependency chain, not extra work.

Four further latency tunings of the string hash -- fewer length branches, the length out of the
finalizer, both -- looked decisive in a standalone harness (1.40x, clang and gcc agreeing to 0.02 ns)
and are worth exactly nothing inside unordered_dense. The harness lied in a way worth naming: to make lengths
unpredictable it chained through key selection, `x = hash(keys[x & mask])`, which puts the key's
*length* on the dependency chain. A real lookup has no such edge -- the caller already holds the key,
so its length is known before the hash starts and only the bytes are loaded.

What did work is restructuring the block range so that every 16 byte block up to 144 bytes is mixed
independently and folded into one finalizer, instead of chaining blocks through the seed: latency is
one multiply plus the finalizer for any length in that range. Paired on the suite that is
13% faster in a hashing loop, 8% on string misses, 9% on string insert-erase, 7% on string builds.

# 20. What is still on the table [&#8593; contents](#contents){:.up} {#still-on-the-table}

Things I know are worth something and have not done. They are all about my own map, with one
exception: huge pages, where boost gains as much as unordered_dense does and the entry says so.

**Twelve instructions per hit, and I do not know where they go.** This is the one new thing writing
this post handed me, and it came from a map I had never heard of. At 50,000 entries, all hits, one
map per binary: `indivi::flat_wmap` executes **48.3 instructions** and `ankerl::unordered_dense`
**60.8**, and the gap is there at 1,000 entries (47.3 against 59.4) and at a million (64.4 against
73.9) too. Some of it is structural and is not coming back -- the value index is a load a flat map
does not do. The rest is not obviously structural: one byte of metadata per slot against 5.5, no
counter load on the path, and slot addressing instead of group-and-lane arithmetic. Twelve
instructions on a path that retires two per cycle is four or five cycles, which is 15% of a hit in
cache. I went looking for the answer in the probe *sequence* and in the window *alignment* and both
were dead ends; the answer, if there is one, is in the instruction stream.

**It is not inlining**, which is the first guess and the one thing here that has been measured
twice: force-inlining the lookup moves cycles and leaves the instruction count exactly where it was,
both on the string path in the F14Vector bullet below and on an insert. What is left is the register
allocator. On identical source clang executes 106.8 instructions per reserved insert where gcc
executes 68.9, and 142 against 110 on a string miss, because clang spills the probe's loop state at
function entry where gcc sinks the same spills into the fingerprint-match branch that a miss never
takes. That is the same order as the twelve, and the cheap experiment -- both maps under gcc, one
per binary -- is one I have not run.

**Huge pages are worth 22% of a large lookup and nothing asks for them.** At 800,000 entries and all
hits, unordered_dense 5.0 takes 1.48 dTLB misses and 7.03 L1 misses per lookup against boost's 0.89 and
5.15, while executing only 14% more instructions for 33% more cycles. A third of that gap is address
translation -- a dense map touches two regions per lookup where a flat map touches one.
`/sys/kernel/mm/transparent_hugepage/enabled` is `madvise` on this machine, which is a common
default, and neither map nor the benchmark ever madvises, so all of it runs on 4 KB pages.
Handing both maps an allocator that `mmap`s 2 MB-aligned and `madvise(MADV_HUGEPAGE)`s: at 800,000
entries unordered_dense goes 17.10 to 13.32 ns per hit and boost 9.75 to 7.58, both about 22%. At
200,000 entries it is nothing. So it is free speed exactly in the regime unordered_dense's own
suite, whose largest table is 200,000 entries, cannot see, it does not change the ranking, and it belongs in an opt-in allocator
rather than in the container.

**Prefetching should probably be tuned per architecture and is not.** Boost tunes it and says so in
a comment: *"ARM architectures get a higher speedup when around the first half of the element slots
in a group are prefetched, whereas for Intel just the first cache line is best."* unordered_dense
5.0 issues the same two prefetches everywhere. On x86 I did chase it and there is nothing to tune
that is right for both compilers -- dropping the second prefetch is a clang win of 5-11% and a gcc
loss of up to 12% at four million entries, because gcc emits the `movdqu` before the prefetches and
clang emits
both prefetches before it, so under clang they take load-port slots in front of the load actually on
the critical path. The ARM half of the question is unasked.

**A statistics facility.** Boost has one -- `BOOST_UNORDERED_ENABLE_STATS` keeps running mean and
variance of probe lengths and comparisons per lookup with Welford's algorithm, and indivi has
`GroupStats` for the same purpose. Every probe-length number in this post was produced by hand
editing a copy of a header. A built-in equivalent is the one idea I read in another map that is a
feature rather than a fix.

**F14VectorMap's string miss, which is the one column I cannot explain away.** It is the closest
relative `ankerl::unordered_dense` has -- the only other dense map here with the same four byte
value index in front of the same contiguous vector -- so it is the fairest index comparison in the
post. Over everything it is 1.27x behind on integer keys and 1.71x behind on a build, and it loses
every integer workload. On a *string* lookup it is ahead, and that is the interesting part.

One map per binary, 20 million lookups at 32,000 entries, run three times over a day and across a
header change and its revert, agreeing to a fifth of a nanosecond: **the hit is a tie** -- 24.33,
24.33 and 24.53 ns against 24.29, 24.22 and 24.51 -- and **the miss is 8 to 9% behind**, 18.68,
18.59 and 18.79 against 16.95, 17.14 and 17.00. Three explanations are ruled out by construction. The hash
is not it: the harness hands F14 this map's wyhash and `perf record` puts the identical
`wyhash::hash` symbol at 44% of both profiles. The load factor is not it: both hold 4,096 groups of
7.8 entries at that size. And the value indirection cannot be it, because F14Vector has one too.

What the counters say is that the miss costs two things, and the shape of the index is neither.
**Eight more instructions** (139.6 against 131.7), which is ordinary difference between two probe
loops. And **1.3 more L1 fills** (5.21 against 3.93), which are [the two index
prefetches](#probe-assembly) issued before the fingerprints have even been compared: on a miss that
matches nothing they fetch a line that is never read. They stay, because dropping one costs gcc 12%
at four million entries. Note what is *not* on that list -- on a miss this map mispredicts *less*
than F14Vector (1.06 branch misses against 1.14), and on a hit it executes *fewer* instructions
(167.6 against 172) and still only draws.

Half of what is left is clang leaving this map's lookup out of line for `std::string` keys where it
inlines it for `uint64_t`; force-inlining it takes the miss from 103.8 to 99.1 cycles at an
identical instruction count -- and then costs gcc 16% on integer misses, so it is not applied. And
the twelve-slot, one-cache-line chunk that looked like F14Vector's structural advantage is worth
exactly nothing when rebuilt here: 1.4 fewer L1 misses per lookup, because the lines it saves were
already being prefetched, and 5 to 7% lost on churn.

**Re-measured on 2026-09-08, and the way it did not move is worth recording.** The paired harness,
re-run a day later, reported the string lookup gap halving -- every one of its nine lookup cells
moved this map's way, geomean 0.92 to 0.96. The three per-binary runs above say otherwise: nothing
moved. The paired figure did, which is what it does at this magnitude -- and in the same pair of
runs it also reported this map's integer *build* 15% slower for a change that
[turned out to be 17% of a build in the other direction](#compiler).

**The string erase's 50 ns.** A dense erase hashes the moved element's key. For an integer that is
free; for a string it is about 50 ns and it is the largest single avoidable cost I know of in this
library. The fix is a back-pointer per value and it loses on the suite as a whole. Something
narrower -- a back-pointer only when the key is expensive to hash, decided at compile time -- has not
been tried.

## What reading eighteen of them changed my mind about {#changed-my-mind}

Three things, and none of them is the one I expected.

**The index is nearly done.** Between the group compare and a counter that stops a miss at home, a
probe visits 1.03 groups on a fresh table and 1.06 on a churned one, and every idea I took from
another map to shorten it further -- double hashing, an exact in-home test, finer counters, a second
fingerprint -- measured as noise or worse. What is left of a lookup is a hash, a cache miss and a key
comparison, and none of those is the index's to fix.

**The differences between these maps are smaller than the differences between measurements of them.**
The paired harness got two changes' signs backwards in this post and the size of two more badly
wrong, always between 3 and 15% -- which is also the size of most of the gaps in the tables above. That is the uncomfortable part of publishing
this: a good half of the ordering here would survive a re-run, and I could not tell you in advance
which half.

**And the interesting question is no longer which index is fastest.** It is which one you can still
reason about when it is churning, when the hash is hostile, when the values are large, and when the
table has left cache -- because those are the four places the ranking changes, and they change it
differently.

# 21. How the numbers were made, and how to remake them [&#8593; contents](#contents){:.up} {#how-measured}

Everything above was measured on one machine: a Ryzen 9 7950X, Fedora, clang 22.1.8 at `-O3
-DNDEBUG -std=c++20`, **default `-march`** -- so plain x86-64, SSE2 and nothing newer. (C++20 is the
harness's dialect rather than any library's: F14 needs it, and every map then gets the same one.)
That last one matters more than it sounds: `-march=native` silently upgrades these SSE2 intrinsics
to AVX-512 on this machine, `vpcmpeqb` into a mask register with no `pmovmskb` at all, so a profile
taken that way is not the code most callers run.

**Every map is given the same hash**, unordered_dense's wyhash, because what is being compared is the
index. Each library has its own way of being told a hash is already well mixed, and all three had to
be used: boost and unordered_dense 5.0 read a member typedef `is_avalanching`, folly reads
`folly_is_avalanching`, and without folly's, F14 puts an extra CRC32 step in front of every lookup
and is no longer running the same hash as everyone else. abseil XORs a per-table 16 bit seed into a
non-default hash, which is not something a caller can turn off, and does no other mixing.

**Boost and abseil also appear with their own hash**, as a control, because "same hash for all" is
the right way to compare indexes and it is *not* what a caller gets by typing the type name. For an
integer key `boost::hash<uint64_t>` and `absl::Hash<uint64_t>` are cheaper than this wyhash, which
shows up plainly in the tables. For a string it goes the other way.

**Every ratio is a geometric mean over five sizes spanning one doubling**, for the reason given under
[what a lookup is made of](#what-a-lookup-is-made-of): two maps with different maximum loads double at
different sizes, so their sawtooths are out of phase and one size compares one map near the top of
its cycle with the other wherever its own cycle happened to be. It changes answers rather than
refining them -- on unordered_dense's own suite, churn against boost read **19% in
unordered_dense's favour at one size and 22% in boost's over the octave**, big-value churn 24% and
20% -- and it is the thing I would most like other people's benchmarks to adopt. Same-family comparisons are safe however they are sampled, because
two builds of the same map are in phase and it cancels; cross-family ones are not.

**The alternatives run interleaved.** [nanobench](https://nanobench.ankerl.com)'s `compare()` runs one epoch of each map per round,
in one process, so a clock ramp or a noisy neighbour lands on all of them and cancels out of the
ratio. Measuring map A to completion and then map B is how two runs of *identical* work came out 140%
apart in an earlier version of my own sweep tool.

**Two independent runs of everything, and they mostly agree.** Of 378 integer ratios, 372 are within
5% of each other between the two runs and the worst is 1.12, on iteration at a thousand entries. The
string ones are noisier -- 309 of 336 within 5%, worst 1.18 -- because a string workload spends most
of itself in the hash and the allocator. Every number quoted above is the geometric mean of the two
runs, and I would not defend any single one of them to better than 5%.

**Anything under 10% is decided with one map per binary, and hardware counters.** A binary holding
several maps has a code layout that moves every time any of them changes, by more than the effect
being measured -- I have watched a same-code control read 8% slower in one run and 13% faster in the
next, in a benchmark that never touches the map. `scripts/ab/maps_one.cpp` builds one binary per map
per workload for that reason, and every "instructions per lookup" number in this post comes from it.

**And the size of the translation unit is itself a variable, which I learned the hard way.** The
tables above put eighteen maps in one unit; the benchmark that scores my own map is ninety files of
test suite; a caller's is one map and their own code. Those are three different inlining budgets,
and a function sitting near the compiler's threshold compiles differently in each -- measured on
[one `always_inline` in this map](#compiler), the same change is 15% faster on a build in the
ninety-file unit and 14 to 20% *slower* in the one-map unit, on 17 to 20% more instructions retired.
So the build column of [the workload tables](#same-workloads) is not quite what a caller gets from
any of these maps, mine included, and where a number here decides something I have taken the
instruction count rather than the time, because a translation unit cannot move that.

The clearest instance of that I have is [abseil's per-table seed](#borrowed). Paired, two
headers in one binary, it read **6% slower on builds, 6% on random misses and 3% on random hits** --
three workloads, all pointing the same way, which is exactly what a real regression looks like. One
map per binary says it costs **zero cycles** on both lookup paths. The control in that same paired
run, a hash benchmark that never touches a map, read 2.7%. If I had stopped at the paired numbers I
would have written up a 4% lookup regression that does not exist. (Its 3.5% on a build is real, and
is why the seed is offered behind a switch rather than dismissed.)

**No workload replays.** Every lookup rng lives in a state that outlives the epochs. A benchmark
whose per-epoch batch is small enough to memorise will have its hit-or-miss sequence learned by a
TAGE-style predictor, which flatters whichever design has the most branches: measured at **2.7x** on
a scalar robin hood probe, which is enough to reverse a ranking, and I have made this mistake twice
in two different tools.

**Churn inserts fresh keys.** A churn loop that recycles its insert keys from a small spare pool
under-reports probe-length drift by half, because a key that comes back soon tends to land in the
home it just left.

**And the allocator is tamed.** `mallopt(M_MMAP_THRESHOLD, 64 MB)`: a build from empty asks for
megabytes and gives them straight back, and glibc returns anything above its threshold to the OS, so
a benchmark that repeats the build faults the same pages in every time -- 38% of the cycles in the
kernel, and worse than noise, because whether it is paid depends on what ran before in the process.

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

`maps.sh` compiles in whatever it finds; the environment variables it reads for the other libraries'
checkouts are documented at the top of it. Every adapter is checked against `ankerl::unordered_dense`
over 400,000 mixed operations before any timing is believed, which is what caught Verstable's
`vt_insert` being `insert_or_assign` rather than `try_emplace`; the honest counterpart is
`vt_get_or_insert`.

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
