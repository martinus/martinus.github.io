---
layout: post
title: The Index Structures of Fast C++ Hash Maps
subtitle: "Or how I read the source of nine hash map libraries to find out what my own map should steal"
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

For the 5.0 release of `ankerl::unordered_dense` I replaced its robin hood index with a new design.
Before writing it, I read the source of every fast C++ hash map I could find. What surprised me was
where the maps actually differ. Most of them use open addressing, a power-of-two table and the same
16 byte SIMD compare. But with the same hash and the same keys, `absl::flat_hash_map` still needs
**1.7x the time** of `boost::unordered_flat_map` to look up a key that is not in the table.
The difference is a few bytes of metadata per group of slots, and what those bytes can tell a
lookup about a key that is not there.

This post goes through twelve index designs from nine libraries. For each one: how the metadata
is laid out, how a lookup walks it, and what an erase leaves behind. Then all of them on the same
seven workloads on one machine, with hardware counters that say why the numbers come out the way
they do. The last part is about my own map: which ideas it took from the others, and which ones I
built, measured and dropped.

Obviously I am biased here, because two of the maps are mine. `ankerl::unordered_dense` 4.11.0 is
the old robin hood design, and 5.0 is the new one, which I call **the group index** in this post.
Everything else is someone else's work, quoted from their source at the versions listed in
[the appendix](#appendix). Every map is handed the same hash, except two control rows where boost
and abseil use their own. Every number comes from one Ryzen 9 7950X. [How the numbers were
made](#how-measured) has the details.

**This is a rewritten version, from 2nd October 2026.** The first version was published on 9th
September, before 5.0 was released (the current release is 5.2.0). Since then, several numbers
about my own map turned out wrong, mostly because two of my harnesses churned the table with
sequential keys instead of random ones. [Corrections](#errata) lists everything that changed. The
workload tables measure the header that became 5.0.0. On my benchmarks, 5.2.0 measures within 1.4%
of 5.0.0, except for a 2% faster integer build.

There are three ways to read this:

- **The short version:** [the summary table](#summary-table) has every design in two tables, and
  [question by question](#question-by-question) says which family of map fits which use.
- **One design:** every design chapter stands alone and has the same four parts: the layout, one
  lookup, what an erase leaves behind, and what the design is good at and pays for.
- **All of it:** top to bottom. Chapters 1 and 2 define the words and the numbers that everything
  else uses.

# Contents {#contents}

**What an index has to do**

1. [Five questions every hash map index answers](#five-questions)
2. [What a lookup costs, and how to read the numbers](#what-a-lookup-is-made-of)
3. [Three families: flat, dense, node](#three-families)
4. [Per-slot metadata or per-group metadata](#per-slot-or-per-group)

**The designs**, from the SwissTable baseline to the designs that change one thing about it

{:start="5"}
5. [SwissTable: abseil's flat_hash_map](#swisstable)
6. [Two plain SwissTables: emilib and ihtab](#plain)
7. [Boost's unordered_flat_map: an overflow byte instead of a sixteenth slot](#boost)
8. [Folly F14: one overflow counter per chunk](#f14)
9. [indivi flat_umap: one overflow counter per hash class](#indivi)
10. [indivi flat_wmap: abseil's window, and one byte per slot](#flat-wmap)
11. [Chains instead of probes: emhash8 and Verstable](#chains)
12. [Robin hood: unordered_dense 4.11.0](#robin-hood)
13. [The group index: unordered_dense 5.0](#group-index)

**Side by side**

{:start="14"}
14. [The summary table](#summary-table)
15. [The same workloads on every map](#same-workloads)
16. [Where the time goes: counters and assembly](#where-the-time-goes)
17. [Question by question](#question-by-question)

**My own map**

{:start="18"}
18. [What unordered_dense 5.0 took from the others, and what it dropped](#borrowed)
19. [Building the group index: growth, the compiler, the hash](#building)
20. [What is still open](#still-on-the-table)

**The end**

{:start="21"}
21. [What reading twelve index designs changed my mind about](#changed-my-mind)
22. [How the numbers were made](#how-measured)
23. [Appendix: sources and versions](#appendix)
24. [Corrections](#errata)

# 1. Five questions every hash map index answers [&#8593; contents](#contents){:.up} {#five-questions}

Every map in this post except `std::unordered_map` is an
[open addressing](https://en.wikipedia.org/wiki/Open_addressing) hash table. All entries live in one
array of slots. A key whose slot is taken looks for another free slot nearby, instead of going onto
a linked list. Here is the shape of it:

[![An open addressing lookup: hash the key, take the home slot from some bits of it, compare the metadata, probe on](/img/2026/hashmap-index/hashmap-basics.svg)](/img/2026/hashmap-index/hashmap-basics.svg)

Every lookup, insert and erase in such a table has to answer the same five questions. Each design
in this post is a different set of answers.

1. **Home: where does this key belong?** Some bits of the
   [hash](https://en.wikipedia.org/wiki/Hash_function) pick a slot, or a group of slots. It matters
   which bits. The fingerprint (question 2) also comes from the hash. If both come from the same bits,
   they are correlated: all keys in one home would share a fingerprint. So most designs take
   them from opposite ends of the hash. Verstable's header says it directly: *"We take the highest
   four bits so that keys that map (via modulo) to the same bucket have distinct hash fragments."*

2. **Here: is the key in this slot, or in this group?** That is what the metadata is for. A
   **fingerprint** is a few bits of the hash stored next to the slot. The libraries call it a tag,
   a hash fragment, H2 or a reduced hash value, and it is the same thing every time. If the
   fingerprint does not match, the key cannot be in this slot, and the map saves loading and
   comparing the key. If it matches, the key is probably here and the map compares the key.

3. **Absent: when may a lookup for a missing key stop?** This is the question that separates the
   designs the most. The classic answer is an **empty slot**. An insert puts a key into the first
   free slot along its probe sequence. So if the lookup reaches an empty slot, the key would have
   been there or earlier. Other answers are robin hood's ordering, boost's overflow bit, the
   overflow counters of F14, indivi and unordered_dense 5.0, and Verstable's in-home-bucket bit.
   They cost different amounts, and not all of them are exact.

4. **Next: where does the probe go after the home is full?**
   [Linear](https://en.wikipedia.org/wiki/Linear_probing),
   [quadratic](https://en.wikipedia.org/wiki/Quadratic_probing), triangular over groups (steps of
   1, 2, 3, ... groups),
   [double hashing](https://en.wikipedia.org/wiki/Double_hashing), or a linked chain stored inside
   the metadata.

5. **Gone: what does an erase leave behind?** If a lookup stops at the first empty slot, then an
   erase cannot simply make a slot empty. Every key that was placed further along the same probe
   sequence would become unreachable.

There are four answers to that last question, and which one a map picks decides most of how it
behaves:

- Leave a **tombstone**: a marker that means "deleted, but keep looking". Lookups walk over it,
  inserts may reuse it, and a rehash removes all of them once there are too many. abseil, emilib,
  ihtab and `indivi::flat_wmap` do this. abseil and `flat_wmap` write a plain empty slot instead
  when they can prove that no lookup ever walked past it.
- **Set an overflow bit** that says "some key of this hash class probed past here". An erase never
  clears it, because a single bit cannot know whether another key still needs it. Only a rehash
  clears it. This is `boost::unordered_flat_map`.
- **Count** the keys that probed past, and decrement the count on erase, so the count is exact
  again afterwards. This is folly's F14, `indivi::flat_umap` and unordered_dense 5.0. Keys that were
  placed away from home stay there though, and [chapter 13](#drift) measures what that costs.
- **Move the following keys back** so the probe sequence has no gap: robin hood's *backward shift
  deletion*, which unordered_dense 4.11.0 does.

And there is a way to avoid the question: **store a chain** in the metadata. Then a lookup only
visits keys with the same home and stops at the end of the chain. emhash8 and Verstable do that.

These are the words used everywhere below:

- **Group:** the run of slots a map compares with one SIMD instruction: 8 to 16, and 16 in most
  designs.
- **Home:** the slot or group a key hashes to. **Displacement** is how far from home it ended up.
- **Load factor:** live entries divided by slots. Every map here has a maximum, and doubles its
  table when it gets there.
- **Overflow:** a key that did not fit into its home group and was placed further along.
- **Hash class:** some maps split the keys into eight classes by three bits of the hash, so that
  an overflow bit or counter only speaks for one eighth of the keys.
- **Churn:** erase one key and insert a new one, so the table stays at a constant size. One
  **turnover** is as many erase-insert pairs as the table has entries.
- **Hit** and **miss:** a lookup whose key is in the table, and one whose key is not.

# 2. What a lookup costs, and how to read the numbers [&#8593; contents](#contents){:.up} {#what-a-lookup-is-made-of}

Three things cost time in a hash map lookup, and it helps to know which one a design is spending.

1. **Dependent loads.** The hash gives the address of the metadata, and the metadata gives the
   address of the key. A dense map (chapter 3) has one more step: the metadata gives an index, and
   the index gives the address of the key and the value. None of these loads can start before the
   previous one finishes. So each one costs a full
   [cache miss](https://en.wikipedia.org/wiki/CPU_cache) once the table no longer fits in the
   cache. For large tables this is the main cost, which means the number of separate memory regions
   a lookup touches matters as much as the number of bytes.

2. **Branch mispredictions.** A [branch](https://en.wikipedia.org/wiki/Branch_predictor) that
   depends on unpredictable data costs about 16 cycles each time the CPU guesses wrong. "Is this
   slot occupied?" asked once per slot is a coin flip. "Did any of these 16 fingerprints match?"
   asked once per group is nearly always "no" on a miss, which the CPU predicts well. Most of the
   gap between the designs that check one slot at a time and the
   [SIMD](https://en.wikipedia.org/wiki/Single_instruction,_multiple_data) ones comes from this.

3. **Instructions.** The cheapest of the three. The lookups measured here run between 0.8 and 3.3
   instructions per cycle, below what the CPU can do, because they spend most cycles waiting.
   Saving instructions on a path that is already waiting saves nothing, and several ideas in this
   post lost for exactly that reason.

## The numbers depend on where in the growth cycle you measure {#sawtooth}

A map doubles its slot array whenever it reaches its maximum load factor. Between two doublings
the load factor climbs from half of the maximum (e.g. 0.4 for a maximum of 0.8) up to the maximum,
then drops back. Lookups get slower as the table fills, so the cost of a map plotted against its
size is a **sawtooth**:

[![Cost of a hit against table size across one doubling: every map ramps up as it fills and drops when it doubles](/img/2026/hashmap-index/sawtooth.svg)](/img/2026/hashmap-index/sawtooth.svg)

This chart is the time of a hit, `uint64_t` keys, at 57 table sizes from 1,673 to 3,636 entries.
That is small enough to stay in the L2 cache, so the shape comes from the load factor and not from
cache misses. Every line climbs as the table fills and drops when it doubles. How far it climbs
depends on the design. Between its cheapest and its most expensive size, unordered_dense 4.11.0
changes by 1.84x, boost by 1.57x, abseil by 1.41x and unordered_dense 5.0 by 1.25x. Robin hood
has the largest swing of these four, and [its chapter](#robin-hood) says why. These swings are only
comparable with each other because they come from the same workload at the same sizes.

Two things follow from that. First, a number measured at one table size is a random point on that
map's own sawtooth. It can be up to 1.84x away from the same map at another size between the
same two doublings. Second, two maps do not double at the same size: boost doubles 2.5% later than
unordered_dense, and abseil about 9% later, at every size. So a comparison at one size can catch one
map at its peak and the other one in its trough.

So every ratio between two maps in this post is a **geometric mean over five table sizes spread
over one doubling**: the sizes are *n*, *n* x 2^(1/5), and so on up to *n* x 2^(4/5). I call this
range an **octave**, and name it by its smallest size. E.g. "the 32,000 octave" means the five sizes
from 32,000 to about 55,700 entries. This changes results, not only their precision. On the churn
workload, boost needed 1.19x the time of unordered_dense 5.0 at one size, and 0.78x averaged over
the octave. The sign of the comparison flipped.

Unfortunately five sizes are not always enough either. Later I swept 50 sizes per octave. For churn
against boost, the ten different five-size subsets of that sweep gave ratios between 0.74 and 1.02,
depending only on which size they started at. All 50 together gave 0.81. For hits the ten
subsets stayed between 0.75 and 0.78. For two versions of the same map the sawtooths are in phase,
and five sizes are good to about 1%. So: **ratios between different maps in this post can be off by
up to a quarter on churn, and by a few percent on lookups.** I note it where it matters.

## The seven workloads

These names are used everywhere from here on:

- **build:** insert into an empty map, without `reserve`, so the map grows as it goes.
- **hit:** look up keys that are in the table, picked at random.
- **miss:** look up keys that are not in the table.
- **50% hits:** half of each.
- **iterate:** walk over every element and sum the mapped values.
- **churn:** erase a random key and insert another one, at a constant size. The inserted keys come
  from a separate pool as large as the table, so an erased key comes back at the earliest one
  turnover later.
- **insert/erase:** a mix of `operator[]` and `erase` on a table that grows and shrinks.

The lookups run on a freshly built table, with random keys that never repeat a sequence (a
repeated sequence gets learned by the branch predictor). Each lookup picks its key independently,
so the CPU works on several lookups at once. That means the lookup numbers are **throughput, not
latency**. They say how many lookups per second a loop gets done, not how long one lookup takes
when the next one has to wait for it. [Corrections](#errata) shows that the difference is up to 3x
at a million entries, and that it does not rank the maps the same way.

Every workload runs with three key and value types: `map<uint64_t, size_t>` (integer keys),
`map<std::string, size_t>` with keys of 8 to 135 bytes, mostly short (string keys), and a
`uint64_t` key with a 64 byte mapped value (big value).

## How to read a number in this post

- **Ratios against unordered_dense 5.0.** The workload tables give each map's time divided by the
  time of unordered_dense 5.0 on the same workload, as the geometric mean over one octave. 1.00 is
  the same speed. 0.80 means the map needs 80% of the time, so it is faster. 1.50 means it needs 50%
  more time. Lower is always faster.
- **"1.46x" of one thing against another** is a ratio of times too: the first takes 1.46 times as
  long, or the change makes it 1.46 times slower. I say which way it goes each time.
- **Groups visited per lookup.** For the group designs I count how many groups a lookup reads.
  1.00 means every lookup was decided in its home group. 1.10 means one lookup in ten read a second
  group, on average.
- **Per-lookup counters** (instructions, cycles, branch misses, cache misses) come from
  `perf stat` on a binary that contains only one map, divided by the number of lookups. The
  section [one map per binary](#how-measured) says why.
- **"The suite"** is the benchmark of unordered_dense itself: 15 workloads, combined by geometric
  mean. It is only used in chapter 18, to compare a changed version of my map against the shipped
  one.

# 3. Three families: flat, dense, node [&#8593; contents](#contents){:.up} {#three-families}

Before the metadata, one decision splits the field: where the keys and values live.

[![Flat, dense and node maps, and what one lookup has to touch in each](/img/2026/hashmap-index/families.svg)](/img/2026/hashmap-index/families.svg)

- **Flat** maps store each key and value inside the slot array. A lookup has the shortest chain of
  loads, but everything scales with `sizeof(value_type)`, since empty slots have the full size
  too.
- **Dense** maps store keys and values in a separate vector, packed and in insertion order, and the
  slot holds a 4 byte index into it. Iterating is a walk over an array of exactly the live entries,
  and a large value costs memory only once per entry. The price is one more dependent load on every
  hit.
- **Node** maps allocate each entry on its own and the table holds pointers. Pointers and
  references to an entry stay valid as long as the entry exists. The price is one allocation per
  insert and one more pointer to follow per lookup.

## Keys in the slots: flat {#flat-family}

`absl::flat_hash_map`, `boost::unordered_flat_map`, `folly::F14ValueMap`, `indivi::flat_umap` and
`flat_wmap`, emilib and Verstable store the `value_type` in the slot the hash picked. When a
fingerprint matches, the map knows the slot's address from the hash and the position of the match.
So a hit needs one metadata load and then one slot load, with nothing in between.

The cost is that everything scales with `sizeof(value_type)`. Growing the table moves every value
into a new hash-scattered slot. An empty slot takes as much memory as a full one. Iterating walks
the whole slot array, including the empty slots. These are an eighth to more than half of it, so at
load 0.5 a flat map reads twice the memory it would need. And growing invalidates all references
and iterators, because the values move.

## Keys in a vector: dense {#dense-family}

`ankerl::unordered_dense`, `emhash8::HashMap`, `folly::F14VectorMap` and ihtab store the values in
one contiguous array, in insertion order until the first erase. The hash table holds an index into
that array. Iterating is a plain array walk over exactly the live entries. A 64 byte value makes
the vector bigger, not the table. And growing the table only rehashes the 4 byte indices, the
values do not move.

**The index is usually 4 bytes, but that is a choice.** `folly::F14VectorMap` and ihtab always use
`uint32_t`. unordered_dense uses `uint32_t`, and has a second bucket type, `group_big`, with a
`size_t` index for more than 2^32 entries. `emhash8::HashMap` uses a `uint32_t` by default, can be
compiled with a 16 or 64 bit one, and stores two of them per bucket because one is the chain link.
[CPython's compact dict](https://mail.python.org/pipermail/python-dev/2012-December/123028.html),
the same idea outside of C++, picks 1, 2, 4 or 8 bytes depending on the table size. That sounds like
a clear win, but [built into unordered_dense](#from-cpython) a 16 bit index was 1.4% slower. A
table small enough for 16 bit indices has an index of at most about 450 KB, which already fits in
the 1 MB L2 cache.

The price of the dense layout is one more dependent load on every hit: metadata, then index, then
the value. When the table fits in the cache that costs a few cycles. When it does not, it is one
more cache miss and one more TLB entry. This is the one structural cost of the family. It is one
of two reasons why boost is ahead of unordered_dense 5.0 on a lookup in a fresh table. The other
one is size: the group index has 5.5 bytes of metadata per slot against boost's 1.07. So it leaves
each cache level at a table about five times smaller, and that costs on misses too.

There is a second price. Erasing from the middle of the vector leaves a hole, and the usual fix is
to move the last element into it. Then the slot that pointed to the moved element has to be found
and updated, which means hashing its key again. For an integer key that costs about 7 ns at a
million entries, for a string key about 50 ns ([measured in unordered_dense](#group-erase)).

## Keys behind a pointer: node {#node-family}

[`std::unordered_map`](https://en.cppreference.com/w/cpp/container/unordered_map),
`boost::unordered_node_map`, `absl::node_hash_map` and `folly::F14NodeMap` allocate every element
on its own and store pointers. You need references that never go stale? Then this is the family:
pointers and references to an element stay valid for the element's whole life, whatever happens to
the map. Iterators do not survive a rehash, though. The price is an allocation per insert, and a
pointer to follow per lookup into memory whose layout the map does not control.

`std::unordered_map` is different from the other three because the standard forces its shape. It
has to provide a bucket interface (`bucket(key)`, `bucket_size(n)`, local iterators) and may only
rehash when the load factor is exceeded. Together that means an array of linked lists, and every
conforming implementation has one. The modern node maps instead keep a fast index (a SwissTable in
abseil, a `group15` in boost, an F14 chunk in folly) and put the node pointer into its slot. So
everything about indexes below applies to them too, plus one pointer to follow and one allocation.
In [the measurements](#same-workloads) node maps cost the most on build (1.2x to 3.5x the time of
their flat sibling) and on iteration (1.1x to 5x). On an integer hit they need up to 1.5x the time
of the flat sibling, and on a string hit about the same.

# 4. Per-slot metadata or per-group metadata [&#8593; contents](#contents){:.up} {#per-slot-or-per-group}

Within open addressing, the second decision is how much metadata to store per slot, and whether a
lookup reads it one slot at a time or a whole group at a time.

- **One byte per slot, read 16 at a time.** SwissTable and everything based on it. The byte holds 7
  or 8 bits of the hash plus a code for empty and deleted, and 16 of them fit one SSE2 register.
  One compare and one `movemask` give 16 answers and one branch, instead of 16 branches. The cost
  is that one byte is not much room, so anything else the design wants to store, e.g. overflow
  information or a distance, needs space elsewhere. There are two ways to pick the 16 bytes. abseil
  and `indivi::flat_wmap` read the 16 bytes that start at the key's home slot, wherever that is.
  boost, emilib, F14, `indivi::flat_umap` and unordered_dense 5.0 split the table into fixed,
  aligned groups, and the home is a group.
- **More than a fingerprint per slot.** Robin hood's 8 byte bucket also stores the distance from
  home, so one compare can stop a lookup. Verstable's 16 bits store a chain link. emhash8's two
  words store a chain link and a value index. These designs answer questions a byte cannot, and
  they pay for it in branches and in memory.
- **A group, plus something next to it.** boost's 16th byte, F14's two counter bytes, and the eight
  counters per group in indivi and unordered_dense 5.0. This is where the answer to "when may a
  miss stop?" moved in the last few years. It is what the chapters on [boost](#boost),
  [F14](#f14), [indivi](#indivi) and [the group index](#group-index) are about.

When reading the design chapters, look for two things: **how a miss stops**, and **what an erase
leaves behind**. They are one question seen from both ends, and no two of these maps answer it the
same way. Where a design has an idea I tried in my own map, its chapter says so, and
[chapter 18](#borrowed) has what each one measured.

# 5. SwissTable: abseil's flat_hash_map [&#8593; contents](#contents){:.up} {#swisstable}

Every other design in this post is measured against this one, whether it says so or not. The shape
comes from [abseil](https://abseil.io/about/design/swisstables)'s `raw_hash_set`: one byte of hash
per slot, and 16 of those bytes compared with one SIMD instruction. Boost, folly, indivi, emilib,
ihtab and unordered_dense 5.0 are all variations of it. Most of the chapters after this one are
about the one thing each of them changed.

## Layout: one control byte per slot, 16 compared at once

[![The hash split into H1 and H2, sixteen control bytes, and the slots](/img/2026/hashmap-index/swiss-group.svg)](/img/2026/hashmap-index/swiss-group.svg)

Each slot has one **control byte**. It is `kEmpty` if the slot is free, `kDeleted` if it holds a
tombstone, or **H2**, the top seven bits of the key's hash, if the slot is occupied. `kSentinel` is
written once at the end of the array, so that iteration knows where to stop. All markers have the
top bit set and H2 has it clear, so one sign test separates "there is a key here" from "there is
not".

```cpp
enum class ctrl_t : int8_t {
  kEmpty = -128,   // 0b10000000
  kDeleted = -2,   // 0b11111110
  kSentinel = -1,  // 0b11111111
};
```

abseil explains why each marker has the value it has, in a list of `static_assert`s right below:

```cpp
static_assert(
    ctrl_t::kSentinel == static_cast<ctrl_t>(-1),
    "ctrl_t::kSentinel must be -1 to elide loading it from memory into SIMD "
    "registers (pcmpeqd xmm, xmm)");
static_assert(ctrl_t::kEmpty == static_cast<ctrl_t>(-128),
              "ctrl_t::kEmpty must be -128 to make the SIMD check for its "
              "existence efficient (psignb xmm, xmm)");
```

The home comes from **H1**, which in the current version is simply the whole hash, masked to the
table size. That gives a home *slot*, not a group. The 16 control bytes a lookup compares are the 16
that start at the home slot, wherever that is. They are loaded with the unaligned `_mm_loadu_si128`.
To make that work at the end of the array, the first 15 control bytes are copied once more after the
last one. The home comes from the low bits and H2 from the top seven, so the two are independent.
abseil also mixes a 16 bit per-table seed into the hash. Its comment says that is to randomize the
iteration order per table, so that no program can come to depend on it.

## One lookup: match H2, then look for an empty slot

```cpp
auto seq = probe(common(), hash);
const h2_t h2 = H2(hash);
const ctrl_t* ctrl = control();
while (true) {
#ifndef ABSL_HAVE_MEMORY_SANITIZER
  absl::PrefetchToLocalCache(slot_array() + seq.offset());
#endif
  Group g{ctrl + seq.offset()};
  for (uint32_t i : g.Match(h2)) {
    if (ABSL_PREDICT_TRUE(equal_to(key, slot_array() + seq.offset(i))))
      return iterator_at(seq.offset(i));
  }
  if (ABSL_PREDICT_TRUE(g.MaskEmpty())) return end();
  seq.next();
  // an assertion left out here
}
```

This is the standard SwissTable probe, and six other maps in this post are variations of these
lines. The prefetch at the top asks for the first slots of the window before the control bytes are
even compared, so the slot load starts early. `Match(h2)` broadcasts H2 into a register and compares
it against all 16 control bytes (`_mm_cmpeq_epi8`, then `_mm_movemask_epi8`). That gives a 16 bit
mask with one bit per slot that might hold the key. Only those slots are checked. `MaskEmpty()`
answers "absent?": if any slot in this group is empty, the key would have been placed there or
earlier, so it is not in the table.

The probe sequence is triangular: `index_ += Width; offset_ += index_`, so the window moves by 16,
32, 48, ... slots. In a power-of-two array that visits every 16-slot window position once before it
repeats.

## Tombstones, and the in-place rehash {#swiss-tombstones}

An erase writes `kDeleted`. It writes `kEmpty` instead only if no 16 slot window that contains the
erased slot can ever have been full. Then no key can have probed past the slot. So a table that
churns at a fixed size slowly fills up with tombstones, `MaskEmpty()` finds fewer empty slots, and
misses walk further and further. abseil handles this when an insert finds no room left. If the
table is at most 25/32 full, it rehashes in place. The table does not get bigger, but all
tombstones are removed and every key is placed again. Otherwise it doubles.

The maximum load factor is 7/8.

## The small table: one element, and no allocation at all {#swiss-soo}

Recent abseil has something no other map here has, and it targets a case that benchmarks almost
never measure: a map that holds nothing, or one single element.

A `flat_hash_map` with capacity 1 does not allocate. Its one element lives **inside the map object
itself**, in the bytes that otherwise hold the pointer to the heap:

```cpp
constexpr size_t SooCapacity() { return 1; }
constexpr bool IsSmallCapacity(size_t capacity) { return capacity <= 1; }

constexpr static bool SooEnabled() {
  return PolicyTraits::soo_enabled() &&
         sizeof(slot_type) <= sizeof(HeapOrSoo) &&
         alignof(slot_type) <= alignof(HeapOrSoo);
}
```

`HeapOrSoo` is a union of the heap pointers and one slot, so this works only when the `value_type`
is no bigger than those pointers. A `map<int, int>` gets it, a `map<std::string, std::string>` does
not. A lookup in such a table does not probe at all:

```cpp
iterator find_small(const key_arg<K>& key) {
  return empty() || !equal_to(key, single_slot()) ? end() : single_iterator();
}
```

No control bytes, no group compare, no probe, just one key comparison. It is one element and not
two on purpose, and the header says why:

```cpp
// We only allow a maximum of 1 SOO element, which makes the implementation
// much simpler. Complications with multiple SOO elements include:
// - Satisfying the guarantee that erasing one element doesn't invalidate
//   iterators to other elements ...
// - In order to prevent user code from depending on iteration order for small
//   tables, we would need to randomize the iteration order somehow.
```

What it saves is an allocation, and that is worth much more than a probe. A `map<int, int>` used as
a local scratch variable, or one per node of a tree, costs a `malloc` and a `free` in every other
map in this post. In abseil it costs nothing. Above that there is a second step: tables with a
capacity of up to 7 use a simpler algorithm than the general one.

**None of this shows in my measurements.** The smallest table in [the
measurements](#same-workloads) holds 1,000 entries, so every abseil number in this post comes from
the general path. A workload of many tiny maps would rank the field differently, and there abseil
would be the map to beat.

## Good at, pays for

Good at: the shortest chain of dependent loads of any design here: the metadata, then the slot
with the key, and that slot is already prefetched. Years of tuning, and the only small-table
optimization in the field that avoids the allocation.

Pays for: tombstones. Take a table that is held at a fixed size by erasing one and inserting one.
On that workload, SwissTable's answer to "gone?" is the weakest in the field.

I tried the per-table seed in unordered_dense 5.0, and did not keep it. [Chapter
18](#from-abseil-seed) has the numbers.

# 6. Two plain SwissTables: emilib and ihtab [&#8593; contents](#contents){:.up} {#plain}

Two implementations of the standard design with fewer moving parts than anything else here. They
are the baseline every trick in the following chapters has to beat. One of them is also a dense
map, and shows what being dense does and does not buy.

## emilib: a state byte per slot {#emilib}

`emilib::HashMap`, from the same repository as emhash, is a SwissTable with fewer tricks.

[![emilib's state byte array and its slots](/img/2026/hashmap-index/emilib-state.svg)](/img/2026/hashmap-index/emilib-state.svg)

```cpp
enum State : int8_t {
    EEMPTY = -128,
    EDELETE = EEMPTY + 1,
    EFILLED = EDELETE + 1,
    ESENTINEL = 127,
};
```

One state byte per slot: empty, deleted, and 253 fingerprint values above them, in front of a flat
slot array. Two things are different from abseil. First, the home slot is **rounded down to a
multiple of the group size**:

```cpp
main_bucket -= main_bucket % simd_bytes;
```

So every compare reads an aligned group, where abseil starts its 16 bytes at any slot and needs
the copied bytes at the end of the array. Second, the fingerprint is `key_hash % 253 + EFILLED`,
a real modulo instead of some bits. That costs a multiply per lookup, but uses every value between
the markers.

It has tombstones, so it slows down under churn like abseil does. In [the
measurements](#same-workloads) it lands in the middle of the field, which is where a clean, small
implementation of the standard design should land.

## ihtab: eight slots at half load {#ihtab}

[ihtab](https://github.com/vnmakarov/ihtab) by Vladimir Makarov is a small library, with a C and
a C++ header, that I have not seen in any benchmark comparison. I used the C++ one. It uses groups
of eight slots. Unusually, it is a **dense** map like unordered_dense: elements are appended to an
`els` array in insertion order, and the group holds indices into it.

[![ihtab's group: 8 tags, 8 indices, and an element array that is never compacted](/img/2026/hashmap-index/ihtab-group.svg)](/img/2026/hashmap-index/ihtab-group.svg)

```c
static constexpr unsigned int GROUP_SIZE = 8;
static constexpr size_t GROUP_BYTES = GROUP_SIZE * (1 + sizeof(ind_t));
static constexpr unsigned char EMPTY_H7 = 0xc0;
static constexpr unsigned char DELETED_H7 = 0x80;
static constexpr unsigned int LF_FACTOR = 1;
static constexpr unsigned int LF_DIVISOR = 2;
```

40 bytes per eight slots: eight tags, then eight `uint32_t` indices, in one block. That is the same
layout [the group index](#group-index) ended up with, at half the width. A live tag is 7 bits, so
its top bit is clear. `DELETED_H7` (`0x80`) has only the top bit set, and `EMPTY_H7` (`0xc0`) the top
two. So `g & (g << 1)` has the top bit set exactly in the empty slots, and `match_empty` is one
`movemask` of that. The probe is linear over groups.

It is quick, and the reason is in the constants: `LF_FACTOR / LF_DIVISOR` is a **maximum load
factor of one half**. A lookup nearly always ends in its home group, so the tag compare is the
whole probe. Trading memory for shorter probes is available to every design here, so it is not an
idea about the index. It works, though. ihtab builds faster in the 32,000 octave than every map
here except unordered_dense 5.0. It also has one of the three fastest integer misses in [the
counter table](#counters).

The element array is never compacted. An erase sets a bit in a `deleted` bitmap, and `els_bound`
only grows, so a churning table rebuilds itself from time to time instead of filling holes. That
has two consequences, and both show in [the measurements](#same-workloads). First, after one
turnover of churn the memory per entry doubles, from 35.3 to **70.6** bytes, and stays there. The
table carries one dead element for every live one until it rebuilds. Second, ihtab is the one
dense map here that does *not* iterate like one. The iterator has to check the deleted bit of
every element, and that branch stops the compiler from vectorizing the loop. It iterates at
7.95x the time of unordered_dense 5.0, where the other dense maps are between 1.00 and 1.48. Being
dense only gives fast iteration if the array holds nothing but live entries.

## ixhtab, and a bug that only constant-size churn finds {#ixhtab}

`ixht::ixhtab` puts extendible hashing on top of ihtab: a directory of bins, each one an `ihtab`
with 16 bit indices, and a bin is split in two when it fills up. On the churn workload it behaved
differently from everything else, and the reason was a bug:

```c
if (2 * els_num >= indexes_size)  // ixhtab.hpp:290
```

`els_num` is the live count of the **whole table**, but `indexes_size` is the index size of **one
bin**. For any table larger than one bin that comparison is always true, so the code splits the bin
instead of compacting it. A deleted slot is never reused, so a bin fills its element array with
dead entries alone, however few live entries it has. Each bin then splits about once per turnover,
each split halves the live occupancy of both halves, and nothing ever merges back. At a constant
50,000 live elements over 40 turnovers the heap grows from **1.4 MB to 44.8 MB** (29.5 to 938.9
bytes per element, and still doubling). A hit goes from 8.2 ns to somewhere between 17 and 30 ns.
`ihtab::rebuild()` has a test of the same shape and is correct, because there both numbers describe
the same table.

I reported it as [vnmakarov/ihtab#2](https://github.com/vnmakarov/ihtab/issues/2) with a
reproducer. The part worth taking away is the test: **only a workload that keeps the element count
exactly constant while churning can see this kind of bug**. Most hash map benchmarks do not have
one.

# 7. Boost's unordered_flat_map: an overflow byte instead of a sixteenth slot [&#8593; contents](#contents){:.up} {#boost}

[boost::unordered_flat_map](https://www.boost.org/doc/libs/latest/libs/unordered/doc/html/unordered/structures.html#structures_open_addressing_containers)
is a SwissTable with one change that matters a lot: it spends the 16th metadata byte of each group
on the answer to "absent?" instead of on a 16th slot.

## Layout: 15 slots, and a byte at the end

[![Fifteen reduced hash values and an overflow byte, and the bit it sets](/img/2026/hashmap-index/boost-group15.svg)](/img/2026/hashmap-index/boost-group15.svg)

15 of the 16 bytes hold one reduced hash value per slot. [Boost's
header](https://github.com/boostorg/unordered/blob/develop/include/boost/unordered/detail/foa/core.hpp)
describes them like this:

> `hi` is 0 if the i-th element slot is avalaible, 1 to mark a sentinel and, when the slot is
> occupied, a value in the range [2,255] obtained from the element's original hash value.

**The sentinel is not a tombstone.** A tombstone marks one slot whose key was erased, and boost has
none. The sentinel is a single byte for the whole table, written into the last group of the
metadata array. With it, iteration knows where to stop without a separate end pointer.

The 16th byte of each group is the interesting one:

> `ofw` is the so-called overflow byte. If insertion of an element with hash value `h` is tried on a
> full group, then the `(h%8)`-th bit of the overflow byte is set to 1 and a further group is
> probed.

That has two consequences, and the header names both. First, **no value is reserved for a
tombstone**, so the reduced hash has 254 possible values, or 7.99 bits. The saving is smaller than
it sounds: reserving one more value for a tombstone would still leave 253 values, 7.98 bits. What a
tombstone really costs is the encoding around it. abseil uses the whole top bit of its control
byte for the markers, so that "empty or deleted" is one SIMD test on insert. That is what leaves
it seven bits of hash instead of eight. Second, and this matters more:

> When doing an unsuccessful lookup (i.e. the element is not present in the table), probing stops at
> the first non-overflowed group. Having 8 bits for signalling overflow makes it very likely that we
> stop at the current group (this happens when no element with the same `(h%8)` value has overflowed
> in the group), saving us an additional group check even under high-load/high-erase conditions. It
> is critical that hash reduction is invariant under modulo 8.

The last sentence hides a nice detail. The reduced hash is the low byte of the hash, but 0 and 1
are reserved, so those two are mapped to 8 and 9. That mapping does not change `h % 8`, so a lookup
checks the same overflow bit that the insert set. The mapping is a table of 256 entries, each
already broadcast into a 32 bit word ready for the SIMD compare. indivi uses the same kind of table
with only 0 remapped, and unordered_dense 5.0 uses indivi's version. **The idea is boost's.**

## One lookup: match, then check the overflow bit

```cpp
prober pb(pos0);
do{
  auto pos=pb.get();
  auto pg=arrays.groups()+pos;
  auto mask=pg->match(hash);
  if(mask){
    auto p=elements+pos*N;
    BOOST_UNORDERED_PREFETCH_ELEMENTS(p,N);
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

This is SwissTable's shape, with `is_not_overflowed` where abseil has `MaskEmpty` (the statistics
macros are left out above). When a fingerprint matches, boost prefetches the group's slots before it
compares the first key. Boost's groups are fixed and aligned, so the metadata load is *aligned*
(`_mm_load_si128`), where abseil's 16 bytes start at any slot and need `loadu`. The match result is
masked with `& 0x7FFF` so the overflow byte never counts as a slot.

`pow2_quadratic_prober` steps by `pos += ++step`, the same triangular sequence as abseil's, and
`next()` returns false once `step > mask`. So even a lookup that never finds a reason to stop ends
after visiting every group. The maximum load factor is 0.875.

## An erase cannot clear a bit {#boost-erase}

The overflow byte has a cost, and it is the mirror image of what makes it good. An insert sets a
bit that says "some key of class *h* % 8 passed through here". An erase cannot clear it. The bit is
shared by every key of that class and there is no count, so the map does not know whether another
key still needs it. On a table that churns at a fixed size, boost's overflow bits
accumulate, misses walk further, and only a rehash clears them.

Boost knows this and limits it. When an erase removes a key from a group whose overflow bit for
that key's class is set, it lowers the table's maximum load by one. That key might have caused the
overflow. Under churn the maximum load drops step by step, until an insert reaches it and
triggers a rehash, which clears all bits. Boost's source calls this the anti-drift mechanism.
Measured with boost's own statistics on a table of 200,000 entries at load 0.81, churned with
erase-insert pairs:

*Groups an unsuccessful lookup reads, on average. 1.00 means every miss stopped in its home group,
1.50 would mean half of the misses read a second group. One turnover is 200,000 erase-insert pairs.
The sample points are not evenly spaced, they are placed before and after the two in-place
rehashes, which is where the number moves. Tinted cells, here and in every other table, are
coloured by how far they are from the best value in their column, or from 1.00 in tables of ratios
against unordered_dense 5.0.*

| erase-insert pairs, in turnovers | groups read per miss |
|---|---:|
| 0.00, freshly built | 1.104 |
| 0.25 | 1.206 |
| 0.50 | 1.269 |
| 0.62 | 1.104 |
| 1.12 | 1.214 |
| 1.25 | 1.058 |
{: .heat-low}

**The number climbs and then drops back.** It climbs while the overflow bits accumulate, from 1.104
groups per miss on the fresh table to 1.269 after half a turnover. Then the anti-drift mechanism
triggers a rehash, the number drops back (to 1.104 after the first rehash, to 1.058 after the
second), and the climb starts again. That happened twice in this run, once every 120,000 to 150,000
erase-insert pairs. The bucket count is 245,759 before and after, so the table does not grow: boost
rebuilds it at the same size, into new arrays, to clear the bits.

These probe lengths come from a build with `BOOST_UNORDERED_ENABLE_STATS` defined, which adds
bookkeeping to every lookup and makes a miss take 10.4 ns instead of 3.9 ns. The counts are exact
either way. The times below are from a normal build.

## Why an overflow bit degrades more gently than a tombstone {#bit-vs-tombstone}

Both boost and abseil leave something behind on erase that only a rehash clears. So why is one so
much worse than the other? Same workload, same hash, same machine, a miss on a table of 200,000
entries, and the worst point during one turnover of churn. The two tables are not equally full,
because their capacities differ: boost is at load 0.81, abseil at 0.76.

*Time per miss on a table of 200,000 integer keys. The number in parentheses is the worst point
divided by the fresh table.*

|  | miss, freshly built | worst during one turnover | bucket count |
|---|---:|---:|---:|
| `boost::unordered_flat_map` | 3.91 ns | 5.71 ns (1.46x) | 245,759, unchanged |
| `absl::flat_hash_map` | 6.26 ns | 14.62 ns (2.34x) | 262,143, unchanged |

The difference is in *what* an erase leaves behind, and it comes down to two things.

**Both give up capacity, at different rates.** A later insert can reuse a tombstone, because abseil
places a key into the first empty *or* deleted slot. But the erase itself does not give the capacity
back. `OverwriteFullAsDeleted()` leaves the counter of remaining room alone, so every tombstone
counts against the load factor until a rehash. Boost lowers its maximum load only when the erased
key's class bit is set in its group, which boost's own comment estimates at about 16% of the keys.
So under churn abseil behaves as if its table were much fuller than it is, and pays what a higher
load factor costs.

**A miss stops at an empty slot, and an erase does not create one.** abseil's miss ends at the
first window with an empty control byte. An erase writes `kDeleted`, which is not empty. So churn
keeps using up empty slots through inserts and makes few new ones, and misses walk further as the
supply runs out. Boost stops a miss on the overflow bit instead, and the bit is one of eight picked
by `h % 8`. A group that has overflowed for one class still stops the other seven eighths of the
misses. That is why the overflow byte is a byte and not a single flag.

In exchange, boost's bit is *approximate* the other way round. It can be set by a key that has been
erased since, so a boost miss sometimes walks on for nothing. That costs probe length only, and an
overflow counter that an erase decrements removes it, as the next chapters show.

## Good at, pays for

Good at: 1.07 bytes of metadata per slot (16 bytes for 15 slots), a miss test that costs one `and`
and one `test`, and no tombstone value to spend a bit on. It is among the two or three fastest maps
here on every integer lookup workload.

Pays for: longer probes under constant churn (a miss takes up to 1.46x the time before the rehash
repairs it), and periodic rehashes at the same size. It does not lose the churn workload because of
it, though: boost churns faster than unordered_dense 5.0 at every size I measured, because it starts
so far ahead.

unordered_dense 5.0 has three things that boost had first: the table of pre-broadcast fingerprint
words (in indivi's version), the probe that ends after visiting every group (I only found it
missing in a review), and the prefetch on MSVC. [Chapter 18](#from-boost) has what they were
worth.

# 8. Folly F14: one overflow counter per chunk [&#8593; contents](#contents){:.up} {#f14}

[folly](https://github.com/facebook/folly)'s F14 is the first design I know of that made a
SwissTable without tombstones, and it did that with a counter instead of a bit.

## Layout: 14 tags, a hosted count, an outbound count

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

F14 calls a group a **chunk**. It has 14 tags instead of 15 or 16, because with 16 byte alignment
and items of at least four bytes that is the most space-efficient size. For four byte items it is
12, which makes a chunk exactly one cache line. The tag is the top byte of the hash, forced to be at
least 1 so that 0 can mean empty.

**The low four bits of `control_` in chunk 0 belong to the whole table.** Most maps here keep
"how many elements may I hold before I rehash" in the container object, and abseil keeps it in its
heap block right before the control bytes. F14 stores it in the metadata of **chunk 0**, and nowhere
else. For 14-slot chunks it is a per-chunk capacity, so the table's limit is `chunkCount * scale`.
For a table with more than one chunk the scale is 12 of the 14 slots, and for a single-chunk table
it is whatever that one chunk was sized to (2, 6 or 14):

```cpp
static std::size_t computeCapacity(std::size_t chunkCount, std::size_t scale) {
  return (((chunkCount - 1) >> Chunk::kCapacityScaleShift) + 1) * scale;
}
```

It is written once when the chunk array is allocated, and read on insert to decide whether this
insert has to rehash. There are two reasons to put it there. First, it **costs no memory**. The
hosted overflow count only needs the top four bits of `control_`, so the low four are free in every
chunk. `sizeof(F14ValueMap)` matters to folly, where these maps are held by the million.
Second, a nonzero scale also marks chunk 0 as the end of iteration, which walks the chunks
downwards.

## One lookup: double hashing instead of a triangular probe

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

`probeDelta` is `2 * tag + 1`. That is always odd, and therefore visits every chunk of a
power-of-two array once. This is double hashing: two keys with the same home chunk but different
tags take *different* paths, where linear or triangular probing sends them down the same one.
Folly explains it in a comment, which reads like a direct answer to abseil and boost:

```cpp
// We could also implement probing strategies that resulted in the same
// tour for every key initially assigned to a chunk (linear probing or
// quadratic), but that results in longer probe lengths.  In particular,
// the cache locality wins of linear probing are not worth the increase
// in probe lengths (extra work and less branch predictability) in
// our experiments.
```

## A counter that an erase can decrement {#f14-counter}

`outboundOverflowCount_` counts the keys whose home is this chunk, or that passed through it, and
did not fit. An insert that passes a full chunk increments it, and **an erase of such a key
decrements it again**. Unlike boost's bit it comes back down, so a table that churns at a fixed size
does not degrade. unordered_dense 5.0's index is built on that idea, and F14 had it first.

The comment also names the two limits. The counter **stops at 254** and then never changes again,
so a pathological table can block a chunk for good. And there is **one counter per chunk** that
knows nothing about hash classes. So once any key has overflowed past a chunk, every later miss in
that chunk has to walk on to the next.

## Value, Node, Vector {#f14-variants}

F14 ships three maps on top of one table. `F14ValueMap` is flat, `F14NodeMap` is node-based, and
`F14VectorMap` keeps the values in a contiguous vector behind 4 byte indices. As far as I know, it
is one of the few widely used dense maps, together with `ankerl::unordered_dense` and emhash8. That
makes it the closest relative of unordered_dense. Its items are four bytes, so it gets the 12-slot
chunk, with tags, counters and indices in exactly one cache line.

## Good at, pays for

Good at: an erase without tombstones, which in 2019 no other SwissTable-style map had. Also double
hashing, which shortens probes under load, and three container shapes on top of one table.

Pays for: one counter per chunk that does not know the hash class, and a saturation point it
cannot come back from. The table is also more complicated than the others here, since chunks carry
capacity bookkeeping and chunk 0 is special.

I tried both the single counter and the double hashing in unordered_dense 5.0, and kept neither.
[Chapter 18](#counter-width) has the numbers.

# 9. indivi flat_umap: one overflow counter per hash class [&#8593; contents](#contents){:.up} {#indivi}

[indivi_collection](https://github.com/gaujay/indivi_collection) by Guillaume Aujay is the least
known library in this post, and it is where the overflow counters of unordered_dense 5.0 come from.
Its `flat_umap` takes [F14](#f14)'s overflow counter one step further: one counter per hash class
instead of one per group.

## Layout: 16 fragments, 8 counters, 16 distance nibbles

[![indivi's 32 byte metadata group: fragments, overflow counters and distance nibbles](/img/2026/hashmap-index/indivi-metagroup.svg)](/img/2026/hashmap-index/indivi-metagroup.svg)

```cpp
struct alignas(32) MetaGroup
{
  alignas(16) unsigned char hfrags[16] = {}; // 1-Byte hash fragments (0 means empty)
  unsigned char oflws[8] = {}; // 1-Byte dual overflow counters (modulo 8, i.e. n and n+8 entries)
  unsigned char dists[8] = {}; // 4-bits distance counters from original bucket (low/high, modulo 8)
};
```

Two bytes of metadata per slot, in one 32 byte struct. The 16 fragments work like a SwissTable
group. The 8 `oflws` are **one counter per hash class**. An insert that passes a full group
increments the counter of its own class, `hash & 7`. An erase of that key decrements it again.
The 16 four-bit `dists` store how many probe steps each slot's key is away from its home group.

## One lookup, and a miss that stops on a counter

The probe has the SwissTable shape, with `get_overflow(hash) == 0` where abseil has `MaskEmpty()`:

```cpp
unsigned char get_overflow(std::size_t hash) const noexcept
{
  std::size_t pos = hash & 0x07;
  return oflws[pos];
}

void dec_overflow(std::size_t hash) noexcept
{
  std::size_t pos = hash & 0x07;
  if (oflws[pos] != 255) // not saturated
  {
    INDIVI_UTABLE_ASSERT(oflws[pos]);
    --oflws[pos];
  }
}
```

On a churning table that is better than boost's overflow byte, because a count can go back down
where a bit cannot. On a fresh table it is better than F14's single counter, because it knows the
class. Like F14's, it saturates, at 255, and indivi's own assertion message says plainly what that
means: *"Overflow counter saturated: tombstone will remain until rehash."*

The maximum load factor is 0.875. The probe is the same triangular walk over groups as in
boost, abseil and unordered_dense 5.0: `gIndex = (gIndex + (++delta)) & mGMask` is boost's
`pos=(pos+step)&mask`, line for line.

## Erase by iterator without a hash: the nibbles {#indivi-nibbles}

The distance nibbles are for one operation. To erase an element, a map with overflow counters has
to decrement the counters in every group between the key's home and its slot. So it has to know the
home. With only an iterator, the way to get the home is to hash the key again. With the distance
stored, the home is the current group minus that many steps of the probe sequence. So
`erase(iterator)` needs no hash and does not even touch the key, which for a `std::string` key saves
a whole hash and a dependent load.

## Good at, pays for

Good at: the most information per slot of any flat map here (a fragment, a share of a class
counter, and a distance), an erase without tombstones that also knows the class, and an
`erase(iterator)` without a hash.

Pays for: two bytes per slot instead of one, plus the bookkeeping: an insert updates counters and
distances, and an erase undoes both.

unordered_dense 5.0's counters are indivi's. I also tried the distance nibbles, and dropped them.
Both are in [chapter 18](#from-indivi). The same author ships a second map that throws all of this
away: the counters, the distances and the aligned groups. It is faster on every lookup column of my
measurements. That is the next chapter.

# 10. indivi flat_wmap: abseil's window, and one byte per slot [&#8593; contents](#contents){:.up} {#flat-wmap}

The fastest map in this post on an integer hit comes from the same author as the last chapter.
`indivi::flat_wmap` is `flat_umap`'s sibling: same repository, same file structure, same SSE2 code.
But its index works like abseil's: one byte per slot, a 16 byte window that starts at the home slot
instead of fixed groups, and tombstones instead of counters. In [the workload
tables](#same-workloads) it is 1.07x to 1.38x faster than `flat_umap` on every lookup column. That
is the largest difference between two index designs I found in anyone else's code. The obvious
reason for it, the window, turned out to be a small one.

## Layout: one byte per slot, and a window instead of a group {#wmap-layout}

[![One metadata byte per slot, the sixteen-byte window read unaligned at the home slot, and the duplicated tail that makes it legal](/img/2026/hashmap-index/wmap-window.svg)](/img/2026/hashmap-index/wmap-window.svg)

One byte per slot, and that is all of the metadata: no counters, no distances, no second array. The
byte holds either a hash fragment or one of two markers, and the marker values are chosen so that a
*signed* compare separates them:

```cpp
static constexpr uint8_t EMPTY_FRAG{ 0x7F };     // 127
static constexpr uint8_t TOMBSTONE_FRAG{ 0x7E }; // 126
static constexpr uint8_t SETMAX_FRAG{ 0x7D };    // 125
```

Every occupied slot holds a fragment that is below 126 as a signed byte, and every free slot holds
126 or 127. So "which slots are free" is one `_mm_cmpgt_epi8` against 125, and "which are
occupied" one `_mm_cmplt_epi8` against 126. The fragment is the *low* byte of the hash. It is looked
up in a table of 256 pre-broadcast words like boost's, which also maps the two marker values to
other values. That leaves 254 possible fragments, nearly 8 bits.

The home is a **slot**. It comes from the top bits of the hash. The 16 bytes compared are the 16
bytes *starting at that slot*, read with the unaligned `_mm_loadu_si128`. The metadata has 16 extra
bytes at the end that repeat the first 16, so a window that starts at the last slot is still one
load. That is the same window abseil uses, for the same reason. The differences to abseil are
small: an 8 bit fragment from the low byte instead of 7 bits from the top, the home from the top bits
instead of the bottom, and a maximum load of 0.8 instead of 0.875.

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

The lane number is added to the home *slot*, so a match in lane 0 is the home slot itself. A miss
stops at an **empty** fragment, so this is a tombstone design and pays what tombstone designs pay
under churn. And the probe steps by `(++delta) * 16`: triangular in units of 16 slots, like
abseil's.

Inserts work the same way. A key goes into the **first free slot within 16 slots of its home**,
where `flat_umap` puts it into the first free slot of the one aligned group its home is in.

## The speed comes from the instructions, not the window {#wmap-why}

The two siblings are the cleanest comparison I have in someone else's code: one author, one
repository, one set of intrinsics. `flat_umap` has aligned groups, two bytes of metadata per slot and
overflow counters. `flat_wmap` has a window, one byte per slot and tombstones. From the integer table
at the 32,000 octave:

*Time relative to unordered_dense 5.0, lower is faster. Bold marks the faster of the two.*

|  | hit | miss | build | churn |
|---|---:|---:|---:|---:|
| `flat_umap`, aligned groups | 0.82 | 0.92 | **1.62** | **0.70** |
| `flat_wmap`, window | **0.72** | **0.83** | 1.88 | 0.94 |
{: .heat-par}

Faster on both lookups, slower on both workloads that write.

**The obvious explanation is the window, and it explains little.** It goes like this. With a window,
a key takes the first free slot within 16 of its home. A grouped map needs a free slot in one
particular group. A whole group being full is more likely than a window having no free slot at all,
so keys end up closer to home. That is true, and it buys almost nothing. I simulated both placements
with the same keys at the same load:

*16-slot windows or groups visited per placement, lower is better. Bold marks the better of the two.
This is a simulation of placement only, no map is involved.*

| load | aligned groups | window from the home slot |
|---:|---:|---:|
| 0.760 | 1.0318 | **1.0238** |
| 0.790 | 1.0436 | **1.0352** |
| 0.799 | 1.0481 | **1.0396** |

The window removes about a fifth of an excess that is already below 5%.

**What does explain it is the number of instructions, and the width of the metadata.** One map per
binary, all lookups are hits:

*Per hit, lower is better. Bold marks the better of each pair. "L1 misses" counts L1 data cache
misses.*

| entries | `flat_umap` instructions | `flat_wmap` instructions | `flat_umap` L1 misses | `flat_wmap` L1 misses |
|---:|---:|---:|---:|---:|
| 1,000 | 53.3 | **47.3** | 0.876 | **0.378** |
| 50,000 | 54.6 | **48.3** | 3.744 | **3.297** |
| 1,000,000 | 72.6 | **64.4** | 4.733 | **3.856** |

Six to eight fewer instructions per hit at every size, and fewer cache misses **even at 1,000
entries, where the whole map fits in L1**. So it is not an effect of a large metadata array. It
comes from one byte of metadata per slot instead of two, and from having no overflow counter to
read on the way. The window is the most visible difference between the two designs, and the least
important one.

## Good at, pays for {#wmap-pays}

Good at: the fastest integer hit measured here at both table sizes, and the fastest integer miss at
the 500,000 octave (at 32,000 it ties with boost). One byte of metadata per slot, the leanest index
in this post together with abseil's. A displaced key lands as close to its home as in any design
here.

Pays for: tombstones, and everything that comes with them: a miss that stops on an empty fragment
gets slower under churn, and only a rehash repairs it. Building is slower than its grouped sibling's
at every size. And it has the widest sawtooth I measured: across 57 sizes of the 32,000 octave, a hit
changes by **2.91x** between its cheapest and its most expensive size. So a number measured at one
size says less about it than about any other map here.

I built the window into a copy of unordered_dense 5.0 to see what it would be worth there.
[Chapter 18](#wmap-steal) has the result, and an effect I did not expect.

# 11. Chains instead of probes: emhash8 and Verstable [&#8593; contents](#contents){:.up} {#chains}

Two designs answer "absent?" without a probe sequence. They store a **chain** in the metadata, so a
lookup only visits keys with the same home, and a miss ends where the chain ends. One is C++ and
dense, the other is C and flat. Both end up paying in the same place.

## emhash8: a chain through the index, and a free fingerprint {#emhash8}

[emhash](https://github.com/ktprime/emhash) is a family of maps by ktprime, and `emhash8::HashMap`
is the dense one. It uses coalesced chaining, and it is fast.

### Layout: {next, slot} per bucket, values in a vector

[![emhash8's index: a next pointer and a slot word, and the chain they thread](/img/2026/hashmap-index/emhash8-index.svg)](/img/2026/hashmap-index/emhash8-index.svg)

```cpp
struct Index {
    size_type next;
    size_type slot;
};
```

Eight bytes per bucket, no key and no fingerprint byte, plus a dense `_pairs` array for the
values, like unordered_dense's vector. `next` is the bucket where this bucket's chain continues, and
`slot` is the position of the value in the vector.

All keys whose home is bucket *b* are on one list that starts at *b*. If a new key finds its home
taken by a key whose own home is elsewhere, it moves that key to another bucket and takes the home
for itself. So a chain always starts at its home. That is
[coalesced hashing](https://en.wikipedia.org/wiki/Coalesced_hashing), and a lookup only ever walks
keys that share its home.

### The trick: hash bits above the mask

```cpp
#define EMH_EQHASH(n, key_hash) ((static_cast<size_type>(key_hash) & ~_mask) == (_index[n].slot & ~_mask))
#define EMH_NEW(key, val, bucket, key_hash) \
    new (_pairs + _num_filled) value_type(key, val); \
    _etail = bucket; \
    _index[bucket] = {bucket, _num_filled++ | (static_cast<size_type>(key_hash) & ~_mask)}
```

The `slot` word has to be big enough to index all values, and the table has fewer slots than the
word can count. So **all bits above `log2(bucket count)` are unused, and emhash8 fills them with
hash bits**. That fingerprint costs no memory and no extra load, since the word is read anyway. It
also gets *wider the smaller the table is*: with 2^24 buckets, 8 bits of a 32 bit word are left,
with 2^16 buckets 16 bits.

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
    // a prefetch of the next value left out here
    if (nbucket == next_bucket) return _num_filled;          // end of chain: absent
    next_bucket = nbucket;
}
```

The answer to "absent?" is **the end of the chain**. The chain holds only keys with this home, so
it is short, and most buckets have no chain at all. There is no group compare anywhere.

### Good at, pays for

Good at: a dense value vector, so iteration is an array walk and a large value only costs the
vector. The free fingerprint. Short chains, because a chain holds only keys that share a home.

Pays for: **branches**. Every step of the chain is a branch that depends on the data, and so is the
question whether there is a chain at all. Such a branch is only cheap when its answer is nearly
always the same. That is also why the miss is emhash8's weakest lookup column in [the measurements](#same-workloads) (2.12,
so more than twice the time of unordered_dense 5.0). [The counters](#counters) show it: a miss has to
reach the end of the chain, and whether there is a chain is exactly the question the CPU cannot
predict. The eviction also means that inserting a new key can relocate another key's index entry.

I tried the free fingerprint in unordered_dense 5.0, and it lost. [Chapter 18](#from-emhash8) says
why.

## Verstable: a 16 bit word with a chain in it {#verstable}

[Verstable](https://github.com/JacksonAllan/Verstable) by Jackson Allan is a C library that I have
not seen in any benchmark comparison, which is a pity. It compiles as C++ unchanged, so it went into
the same binary as everything else. It packs all of its metadata into two bytes per bucket:

```c
#define VT_EMPTY               0x0000
#define VT_HASH_FRAG_MASK      0xF000 // 0b1111000000000000.
#define VT_IN_HOME_BUCKET_MASK 0x0800 // 0b0000100000000000.
#define VT_DISPLACEMENT_MASK   0x07FF // 0b0000011111111111, also denotes the displacement limit.
                                      // (rest of the comment left out)
```

[![Verstable's two metadata bytes, to bit scale: a 4 bit fragment, an in-home bit and an 11 bit displacement, and the chain they thread](/img/2026/hashmap-index/verstable-word.svg)](/img/2026/hashmap-index/verstable-word.svg)

Four bits of fingerprint, taken from the *top* of the hash because the bucket comes from the
bottom. One bit that says "the key in this bucket belongs here". And 11 bits that hold the
quadratic displacement to the next key of *this bucket's* chain.

So all keys with the same home bucket are on one linked list, stored in buckets that are otherwise
unused. A lookup visits *only* buckets that hold keys with its home. Keys and values are stored
in a flat bucket array, both arrays come from one `malloc`, the maximum load factor is 0.9, and
there are no tombstones. An insert moves at most one other key, to keep the rule that a chain starts
at its home.

The in-home bit is my favourite idea in this post. It gives the **exact** answer to
"absent?": either a key that belongs here is here, or no key that belongs here exists. Every counter
design is only a hint in comparison. [Chapter 18](#counter-width) estimates what an exact test
would be worth in unordered_dense.

**It pays with branches.** One map per binary, 30 million lookups on a table of 50,000 entries,
from [the counter table](#counters):

*Per miss, at 50,000 entries. Lower is better. Bold is the best in each column.*

|  | instructions | cycles | branch misses | L1 misses |
|---|---:|---:|---:|---:|
| unordered_dense 5.0 | 57.2 | 21.0 | **0.108** | 3.27 |
| boost | 54.3 | **20.8** | 0.164 | **1.89** |
| Verstable | **46.5** | 42.1 | 0.808 | 1.96 |
{: .heat-low}

A Verstable miss needs **19% fewer instructions than unordered_dense 5.0, and twice the cycles**.
The design does what it promises, few instructions and few cache lines, and then loses it at the
branch predictor. "Is my home bucket the start of a chain, and how long is it?" is a data-dependent
decision on every lookup, where a group compare is not. The 0.7 extra branch misses per lookup cost
about 11 cycles, half of the difference. At its maximum load of 0.9, about 59% of misses start on a
chain that they have to walk.

The build is its weakest column, for a related reason. A rehash runs the whole insert again for
every key. An occupied home bucket calls `evict`, which hashes the key that is there again and
walks *its* chain. Rehashing costs Verstable 143 instructions and 79 cycles per element, against 44
and 12 in unordered_dense 5.0. A whole build of 200,000 entries has 2.398 branch misses per element
against 0.132.

It does well on memory. Counted as bytes allocated, it needs 27.9 bytes per entry for an 8 byte
value. That is second only to abseil (26.4), tied with `flat_umap` and just ahead of boost (28.5), see [the
memory table](#memory).

# 12. Robin hood: unordered_dense 4.11.0 [&#8593; contents](#contents){:.up} {#robin-hood}

This is my own map as it was up to 4.11.0. I have written about the design
[twice](/2016/09/15/very-fast-hashmap-in-c-part-1/)
[before](/2026/09/04/unordered-dense-four-buckets-at-a-time/). It is the old design that the group
index replaced, and the trick at the centre of it is, as far as I know, mine.

## Layout: the distance above the fingerprint, so one compare orders both

[![One bucket to byte scale, 3 bytes of distance, 1 of fingerprint and 4 of value index, and a run of buckets before and after an insert](/img/2026/hashmap-index/rh-bucket.svg)](/img/2026/hashmap-index/rh-bucket.svg)

```cpp
struct standard {
    static constexpr std::uint32_t dist_inc = 1U << 8U;             // skip 1 byte fingerprint
    static constexpr std::uint32_t fingerprint_mask = dist_inc - 1; // mask for 1 byte of fingerprint

    std::uint32_t m_dist_and_fingerprint; // upper 3 byte: distance to original bucket. lower byte: fingerprint from hash
    std::uint32_t m_value_idx;            // index into the m_values vector.
};
```

Eight bytes per slot, and no key in them. The four bytes of `m_value_idx` are the index into the
value vector. The other four are `m_dist_and_fingerprint`, and this section is about them. The low
byte is the fingerprint. The upper three bytes are the distance from home, counted in steps of
`dist_inc`, which is `1 << 8`. Zero means the bucket is empty, and distance 1 means the key is in
its home bucket.

[Robin hood hashing](https://en.wikipedia.org/wiki/Hash_table#Robin_Hood_hashing) keeps the keys
along a run of buckets sorted by their distance from home. An insert that is further from its home
than the key it meets takes that bucket, and the other key moves on. So a lookup needs to ask "am I
further from home than the key in this bucket?", and the fingerprint check needs to ask "are these
the same eight hash bits?". Because the distance sits above the fingerprint in the same
`uint32_t`, **one integer compare answers both**, with the right priority, for free. The idea is
from my [2016 post](/2016/09/21/very-fast-hashmap-in-c-part-2/), where the distance and a few hash
bits share one byte, and `robin_hood` does the same. 4.x widened it to a 32 bit word with 24 bits of
distance and a whole byte of fingerprint.

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

Three outcomes per bucket. **Equal** means the fingerprints match and the key is worth comparing.
**Greater is the proof of absence**: along a run the keys are sorted by their home bucket. If the
key in this bucket is closer to its home than our key would be here, every key from here on has a
later home than ours. Ours cannot be among them. **Less** means step on. An empty bucket has
distance 0, which is smaller than any live `dist_and_fingerprint`, so it ends the lookup through the
same comparison, with no special case.

4.11.0 also has an SSE2 path that does the same for four buckets at once, which is the subject of
[the previous post](/2026/09/04/unordered-dense-four-buckets-at-a-time/). The measurements of 4.11.0
in this post use that path. The scalar loop above runs without SSE2, for `bucket_type::big` and
segmented maps, and as the fallback after a fingerprint collision.

## Backward shift deletion: no tombstones, ever {#backward-shift}

An erase does not just free the slot. It moves the following buckets back by one, decrementing each
distance, until it reaches a bucket at distance 1 or an empty one. That restores the sorted order
exactly. So **after hours of churn every distance and fingerprint is what a fresh build of the same
contents would produce** (only the order of the values in the vector differs). No tombstones, no
rehash to clean up, and probe lengths do not drift. Of all designs here, only robin hood gives that
in every case.

## Good at, pays for

Good at: the strongest possible answer to "gone?", a compact 8 bytes per slot, and a probe that
stops on a comparison instead of on an occupancy test.

Pays for: **a coin flip per bucket**. The scalar probe and the insert's shift loop both ask a
question with an unpredictable answer once per bucket. The scalar probe has 1.14 branch
mispredictions per hit, and the 4-bucket SSE2 probe 0.19. The insert's shift went from 0.61 to 0.24
mispredictions per insert the same way. Also, robin hood probe lengths roughly double between an
empty and a full table, so a lookup follows the load factor more than in any other design here.
In one sweep over many octaves of hits, the scalar probe of 4.8.1 changed by 2.05 to 2.35x between
the cheapest and the most expensive size of an octave. The group index changed by 1.07 to
1.28x. The SSE2 probe of 4.11.0 takes some of that back: it is the 1.84x in [the sawtooth
chart](#sawtooth), still the largest of the four maps there.

Three things carried over into [the group index](#group-index): the fingerprint from the low byte
of the hash and the home from the top bits, the 8 bit fingerprint, and the dense value vector. The
sorted order, the shifts, and the padding at the end of the bucket array did not.

# 13. The group index: unordered_dense 5.0 [&#8593; contents](#contents){:.up} {#group-index}

This is the index that replaced [robin hood](#robin-hood) in my map in 5.0. I know this design best,
because I built it by measuring every alternative I could think of and keeping what won. It is a
SwissTable group with indivi's per-class overflow counters, boost's fingerprint table, and a dense
value vector behind it. The ideas I took from other maps, and the ones I tried and dropped, are in
[chapter 18](#borrowed). How it grows, what the compilers do with it and which hash it uses are in
[chapter 19](#building).

## Layout: an 88 byte block per 16 slots

[![The 88 byte block to byte scale, then its 16 fingerprints, 8 counters and 16 value indices, and the values vector](/img/2026/hashmap-index/group-block.svg)](/img/2026/hashmap-index/group-block.svg)

Simplified from `basic_group` and `group_storage::block` in the 5.0.0 header:

```cpp
template <typename ValueIdx>
struct basic_group {
    using value_idx_type = ValueIdx;
    std::array<std::uint8_t, 16> m_fingerprints; // one per slot; 0 is an empty slot
    std::array<std::uint8_t, 8> m_overflows;     // how many entries with (fingerprint & 7) == i probed past this group
};

// what the index array is made of
struct block : basic_group<std::uint32_t> {
    std::array<std::uint32_t, 16> m_index;       // where in the value vector each slot's element is
};

std::vector<block> m_blocks;                     // 24 + 64 = 88 bytes per group, one array, no padding
```

Sixteen fingerprints, eight overflow counters and sixteen value indices: 88 bytes per 16 slots,
**5.5 bytes per slot**, in one allocation. The value index sits next to the fingerprints it belongs
to, at a fixed offset. That was not how the design started, and [what merging them was
worth](#one-array-or-two) is measured below. For more than 2^32 entries there is `group_big`, whose
indices are `size_t`, which makes a block 152 bytes.

The group comes from the top bits of the hash and the fingerprint from the low byte, so the two are
independent. A fingerprint of 0 means empty, so a hash whose low byte is 0 gets fingerprint 8
instead. That keeps the low three bits unchanged, and those three bits pick the overflow counter
(the hash class). The mapping is boost's, and so is the way it is done:

```cpp
[[nodiscard]] constexpr auto make_fingerprint_words() -> std::array<std::uint32_t, 256> {
    auto t = std::array<std::uint32_t, 256>{};
    for (std::uint32_t i = 0; i < 256; ++i) {
        t[i] = (i == 0 ? 8U : i) * 0x01010101U;
    }
    return t;
}
```

Each entry holds the fingerprint already copied into all four bytes of a `uint32_t`. The SSE2
compare then needs a `movd` and a `pshufd` instead of a real byte broadcast. Building the word
is one L1 load instead of five instructions. That is on the critical path of every lookup, insert
and erase.

## One lookup

The loop from `probe_from`, slightly shortened:

```cpp
auto const* groups = m_buckets.data();
while (true) {
    prefetch_index(groups, group_idx);
    auto const& group = groups[group_idx];
    auto lanes = match_fingerprint(group, word);
    while (lanes != 0) {
        auto const lane = first_lane(lanes);
        auto const value_idx = group.m_index[lane];
        if (m_equal(key, get_key(m_values[value_idx]))) {
            return {group_idx, value_idx, static_cast<std::uint8_t>(lane), true};
        }
        lanes &= lanes - 1;
    }
    // Not here if nothing of this class ever overflowed past this group, and not anywhere
    // once every group has been looked at.
    if (group.m_overflows[counter] == 0 || delta == m_group_mask) {
        return {0, 0, 0, false};
    }
    group_idx = next_group(group_idx, delta);
}
```

That is SwissTable's shape again, with three differences. The slot holds a value index instead of
the key, so a hit needs one more dependent load. A miss stops when the counter for its class is 0.
And the walk stops after it has seen every group, like boost's.

**A fourth difference is where the loop starts.** When comparing two keys is a function call, e.g.
`memcmp` for a `std::string`, everything the loop keeps in registers has to survive that call. So
the compiler sets up a stack frame and saves the counter, the mask, the delta, the hash and the
fingerprint word before the first group is compared. On a fresh table only about 3% of lookups ever
leave their home group. So every lookup pays for that frame, for a path almost none of them take.
{: #probe-split}

So the home group is compared inline, and everything after it is in a separate function
(`probe_past_home`) that is reached by a tail call. That is only done for key types whose
comparison really is a call, which `detail::key_compare_is_call<Key>` decides. Where the comparison
is a register compare there is nothing to save, and a split would only add a call. It saves 8 to
9% of the instructions of a `std::string` miss under clang, and about as much of its time. A string
hit gains less than 2%, and the integer code is identical with and without it.

`match_fingerprint` has three versions. With [SSE2](https://en.wikipedia.org/wiki/SSE2) it is
`_mm_cmpeq_epi8` and `_mm_movemask_epi8`: 16 compares into a 16 bit mask. NEON on ARM has no
movemask, and the usual replacement (a compare, then a narrowing shift) puts the 16 answers 4 bits
apart in a 64 bit word. So the mask type and the distance between two lanes are defined once per
version, and `first_lane()` divides by that distance. Testing a mask, finding the lowest lane and
clearing it with `m & (m - 1)` is then written once for all three versions. The fallback without
SIMD is [SWAR](https://en.wikipedia.org/wiki/SWAR), eight bytes at a time in a normal register:

```cpp
[[nodiscard]] static auto match_zero_bytes(std::uint64_t x) -> unsigned {
    static constexpr auto lows = UINT64_C(0x7F7F7F7F7F7F7F7F);
    static constexpr auto highs = UINT64_C(0x8080808080808080);
    auto const zeros = ~(((x & lows) + lows) | x) & highs;
    return static_cast<unsigned>(((zeros >> 7U) * UINT64_C(0x0102040810204080)) >> 56U);
}
```

The better known `(x - ones) & ~x & highs` is two operations shorter, and wrong here. A zero byte
borrows from the byte above it, so a `0x01` right above a `0x00` is also reported as zero. For a
lookup that does no harm, since every candidate is compared against the key anyway. For an insert
looking for an empty slot it would be a bug. The multiply at the end collects the eight high bits
into eight adjacent bits.

NEON was worth a lot on ARM. On a Neoverse N2, the SWAR version was behind 4.11.0's *scalar* robin
hood probe on four of the lookup workloads and level on the rest. With `vceqq_u8`, the same machine
measures 4.11.0 at 1.48x the time of 5.0 on integer hits and 1.62x on integer misses. So the vector
compare is where the group design gets its speed, it is not an extra optimization on top.

## Eight counters, one per hash class {#counters-by-class}

An insert that finds its home group full increments the counter for its own class in every full
group it passes, and an erase decrements the same counters. A miss stops at the first group whose
counter for its class is 0. The per-class counters and their decrement on erase both come from
indivi, and F14 had the version with one counter per group before that.

That leaves the question of how wide a counter should be: one shared counter per group, eight
bytes, sixteen 4 bit counters, thirty-two 2 bit counters, or an exact one. [Chapter
18](#counter-width) has the measurements. In short, a byte per class is the point where the counter
is still one aligned load and already knows the class. Also, about 80% of the misses that a counter
fails to stop are caused by **siblings**. These are keys whose home *is* this group and that did
not fit. So they are further along the very same probe sequence a later miss walks. An exact
counter would have to send the miss on for those too.

## A probe that never ends, and the bound that stops it {#miss-bound}

A miss that stops on a counter can fail in a way a miss that stops on an empty slot cannot. If every
counter along its probe sequence is nonzero, nothing ever tells it to stop. Building that state
needs one key per group. Fill a group, send one key of class 1 past it, then erase the keys that
filled the group. The key that passed stays, and so does the counter it incremented. Do that for
every group, and `contains()` on a missing key of class 1 loops forever. In a table of eight groups
that takes eight chosen keys. Any hash the caller controls can get there, and so can the default
hash with keys chosen for it.

So the probe needs a second exit that does not depend on the counters: `|| delta == m_group_mask`.
A key that exists was placed within one pass over its probe sequence, so a walk that has seen every
group can stop. [Boost](#boost)'s prober always had this (`return step<=mask`), and the 5.0
development branch did not, until the review before release. The argument for leaving it out was
that the counters put a 0 right after the furthest entry of each class. That argument is wrong: a
counter counts the entries that passed its group on *their own* probe sequences, not on the one
being walked. `indivi::flat_umap`, where the counters came from, had the same hole. I
[reported](https://github.com/gaujay/indivi_collection/issues/2) it and it was fixed the same day.

The bound is free: on a table of 200,000 entries it went from 83.6 to 82.7 instructions per hit
and from 69.5 to 67.6 per miss, with the same cycles and branch misses. It has one side effect. A
bug in the erase's counter decrement used to hang the test suite, which is loud, and now it only
makes lookups slower, which is quiet. Against a hostile hash that is the right way round, for a test
suite it is the wrong one. So unordered_dense now has a test that measures how *much longer* a miss
probes, instead of only checking its answer.

## Erase: decrement, do not tombstone {#group-erase}

An erase clears the fingerprint and walks the probe sequence from home to the group the entry was
in, decrementing each counter on the way. Nothing is left behind. Then, because the values are
dense, it moves `m_values.back()` into the hole. The slot that points at the moved element has to
be updated, and finding it means hashing the moved element's key and running a second probe.

That sounds expensive. I measured it at a million entries: an erase plus an insert, against a
sequence that has the same two uncached probes and no move:

*Time per erase-and-insert at a million entries. The "without" column does a find, an insert and an
erase of the last element, so it does one operation more than "with the move". The difference
between the columns is therefore smaller than the cost of the move itself.*

|  | with the move | without |
|---|---:|---:|
| `uint64_t` keys | 57.0 ns | 56.2 ns |
| `std::string` keys | 410.4 ns | 377.7 ns |

After accounting for the extra operation, the second hash and probe cost about 7 ns for an integer
key and about 50 ns for a string key. The integer case is cheap for three reasons. The moved element
is always the last one in the vector, which in a churn loop stays in the cache. `do_erase`
prefetches it first, so that load runs while the counters are decremented. And an integer hash is
one multiply, so its group access starts early enough to overlap. For a string, the hash over 8 to
135 bytes behind a heap pointer is a dependent load and then a long chain of work, and none of it
overlaps.

The fix for the string case would be to store, next to every value, the slot that points at it.
[Chapter 18](#from-indivi) has that measured: about 10% faster exactly where the hash is
expensive, and slower everywhere the vector grows.

## Drift, and moving keys home {#drift}

Nothing moves after it is placed. So an entry that landed away from home because its home group was
full **stays there after the home group has room again**. A table that has churned for a long
time probes further than a fresh table with the same number of entries. I counted the groups each
lookup reads, inside the probe, on a table that was churned 200 turnovers long. Each erase removes a
random key, and each insert adds a new random key, so the size stays constant:

*Groups read per lookup, 4,096 groups. "Writing hits" are lookups through `operator[]` that find
their key; each round of churn is one erase, one insert and that many writing hits.*

| load factor | fresh | churned | churned, 1 writing hit per round | churned, 4 writing hits per round |
|---|---:|---:|---:|---:|
| **per hit** |  |  |  |  |
| 0.76 | 1.031 | 1.136 | 1.094 | 1.056 |
| 0.80 | 1.039 | 1.204 | -- | -- |
| **per miss** |  |  |  |  |
| 0.76 | 1.052 | 1.265 | 1.163 | 1.099 |
| 0.80 | 1.086 | 1.432 | 1.279 | -- |
{: .heat-low}

**The drift is real, and not small.** At load 0.76 a churned table reads 10% more groups per hit
and 20% more per miss than a fresh one. Near the maximum load of 0.8 it is 16% and 32%. The first
version of this post said the drift was 1 to 3% and stopped growing. That came from a harness that
replaced erased keys with sequential numbers, which the hash spreads so evenly over the groups that
the table barely drifts. With random keys it is the table above.

**Repairing it on erase costs too much.** On every erase, the map could look one group further for
an entry whose home is the group that just got a free slot, and move it back. That costs 20 ns per
erase to save 0.4 to 0.6 ns per lookup. The reason is that at this load *some* counter of the freed
group is nonzero on 46% of erases. Each of those has to hash two or three keys to find a candidate.

**Repairing it lazily is cheap, and that is what 5.0 does.** When a lookup finds its key, the probe
already knows the key's home group, without a second hash. Whether that home has room is one
`match_empty` on a group the probe has already read. So `move_home` moves the found entry back home
if there is room, on every hit inside an operation that writes anyway: `try_emplace`, `operator[]`,
`insert`, `emplace`, `insert_or_assign` and `merge`. It is deliberately not in `find()`, const or
not: callers treat a non-const `find` on a shared map as read-only, and writing there would be a
data race.

The two right-hand columns of the table are what `move_home` does. With one writing hit per round it
takes back about 40% of the drift of a hit and half of the drift of a miss. With four writing hits
per round it takes back about 80% of both. It does not get the table back to fresh.

How much that is worth in time had to be measured, because a few hundredths of a group did not look
like much. I compiled the same header twice, once with `move_home` turned into a no-op, one map per
binary. A table at load 0.80 was churned 40 turnovers long and then timed on its own:

*Time with `move_home` divided by time without it, lower is faster. The control column has no
writing hits, so `move_home` never runs, and the two binaries should measure the same.*

| entries | control, no writing hits | miss, 1 writing hit per round | hit | the churn round itself |
|---|---:|---:|---:|---:|
| 52,363 (in L2) | 1.000 | **0.771** | 0.912 | 0.927 |
| 838,860 (in L3) | 0.998 | **0.782** | 0.986 | -- |
| 3,355,443 (larger than L3) | 0.994 | **0.792** | 0.983 | -- |
{: .heat-par}

So `move_home` makes a miss on a churned table **1.26x to 1.30x faster, at every size**. The churn
round itself gets 8% faster, because its own inserts and erases also probe the drifted table. I
expected the gain to fade once the table no longer fits in the cache. One step of displacement
lands in the next block, and the prefetcher already loads that. It does not fade.

The CPU counters say why. At 52,363 entries with one writing hit per round, `move_home` removes 35%
of the branch misses of the whole run (12.6 million against 19.3 million), 18% of the cycles, and
only 5.5% of the instructions. **Most of what drift costs is that the branch "stop here or
continue?" becomes unpredictable**, and a branch does not get cheaper when the table leaves the
cache.

Unfortunately it does not help every program. `move_home` only runs on a hit inside an operation
that writes, so a program that only reads gets nothing, and the control column is that program. And
the gain is mostly on misses. It pays for one kind of program: one that churns a map at a fixed
size, writes to it by key, and also asks it for keys that are not there. A deduplicating set, a
cache with negative lookups, or a `++m[key]` counter over a sliding window have that shape. None of
the workloads in my benchmark suite does, which is why the suite measures exactly level on this
change.

## Where the indices live: one array or two {#one-array-or-two}

The value indices used to be a second array next to the groups. A comment in the header said the
split had been measured against a merged block years ago and was 10% faster on a build. That was
measured under a different design, so I measured it again: one 88 byte block, no padding, the same
bytes in one allocation instead of two.

Memory is the same to the byte. On the suite, merging is 1.5 to 2.2% faster overall and 4.4 to 5.3%
faster on its find workloads. The counters say more: one map per binary, all lookups hits, at
200,000, 800,000 and 4 million entries. Merged executes **7% fewer instructions** (62.0 against
66.9 per lookup), because the index is at a fixed offset from the group instead of at a second
address to compute. It also has **12 to 14% fewer L1 misses**, and at 4 million entries **28% fewer
dTLB misses** (3.79 against 5.30 per lookup), because a lookup touches two regions of memory instead
of three.

A related question came out even. Putting the fingerprints and the counters into two separate
arrays makes four groups' fingerprints fit exactly into one cache line. A 24 byte group crosses a
line boundary one time in four. It measures the same in cache and on a table of 20 million entries
(57.1 against 57.0 ns per hit). Crossing a line is free because the second line is the next one,
which the CPU fetches anyway. The separate counter array is free because its address only depends
on the group. So its load starts together with the fingerprint load instead of after it.

## Good at, pays for

Good at: no tombstones, and counters that go back down, so constant churn never needs a rehash to
repair the table. Churn does make probes longer, by about 10% per hit and 20% per miss at load 0.76,
and `move_home` takes much of that back for keys that are written to. The dense value vector, so
iteration is an array walk and a 64 byte value costs the vector and not the table. 5.5 bytes of
metadata per slot. And a bound that turns a hostile hash into a slow table instead of an endless
loop.

Pays for: one more dependent load on every hit than a flat map. That is the cost of the family, and
it does not go away. A value vector that doubles on its own schedule, and that extra capacity is
most of what unordered_dense costs in memory against a flat map with an 8 byte value. And an erase
that hashes the moved element's key again, about 7 ns for an integer and 50 ns for a string.

# 14. The summary table [&#8593; contents](#contents){:.up} {#summary-table}

All of the design chapters in two tables. The first one is what the index *is*, the second one is
how it behaves. The bold cell in each row is the choice that makes that design what it is.

**What the metadata is**

| map | keys live | metadata per slot | compared at once | fingerprint | empty / deleted marker |
|---|---|---:|---|---|---|
| abseil `flat_hash_map` | flat | **1 B** | **16, starting at the home slot** | 7 bits, top | −128 / −2 |
| emilib | flat | 1 B | 16, aligned | hash mod 253 | −128 / −127 |
| ihtab | dense | 5 B | 8, aligned | 7 bits, top | 0xc0 / 0x80 |
| boost `unordered_flat_map` | flat | 1.07 B | 15, aligned | 8 bits (2..255), low byte | 0 / **none** |
| folly F14 | flat, dense or node | 1.14 B | 14, aligned | 8 bits, top | 0 / **none** |
| indivi `flat_umap` | flat | **2 B** | 16, aligned | 8 bits | 0 / none |
| indivi `flat_wmap` | flat | 1 B | 16, starting at the home slot | 8 bits (254 values), low byte | 0x7F / 0x7E |
| emhash8 | dense | 8 B | 1 | **the unused high bits of the index word** | `next < 0` / none |
| Verstable | flat | 2 B | 1 | **4 bits, top** | 0 / none |
| unordered_dense 4.11.0 | dense | 8 B | 1, or 4 with SSE2 | 8 bits, low byte | **distance 0 / none** |
| unordered_dense 5.0 | dense | 5.5 B | 16, aligned | 8 bits, low byte | 0 / **none** |
| `std::unordered_map` | node | 8 B (a pointer) | 1 | **none** | null / none |
| boost / abseil / F14 node maps | node | as the flat sibling | as the flat sibling | as the flat sibling | as the flat sibling |

**How it behaves**

| map | probe | a miss stops on | tombstones | moves after placement | max load | ends on a hostile hash |
|---|---|---|---|---|---:|---|
| abseil `flat_hash_map` | triangular, in steps of 16 slots | an empty byte in the window | **yes** | no | 0.875 | yes |
| emilib | linear over aligned groups | an empty byte in the group | **yes** | no | 0.833 | yes |
| ihtab | linear over groups | an empty tag in the group | **yes** | no | **0.50** | yes |
| boost `unordered_flat_map` | triangular over groups | **an overflow bit for its hash class** | no | no | 0.875 | yes |
| folly F14 | **double hashing** | an overflow counter of zero | no | no | 0.857 | yes |
| indivi `flat_umap` | triangular over groups | **an overflow counter for its hash class** | no | no | 0.875 | since September 2026 |
| indivi `flat_wmap` | triangular, in steps of 16 slots | an empty byte in the window | **yes** | no | 0.80 | not checked |
| emhash8 | **coalesced chain** | the end of the chain | no | **moves a key out of a new key's home** | 0.80 | yes |
| Verstable | quadratic chain | **an exact in-home-bucket bit** | no | moves at most one key | **0.90** | yes |
| unordered_dense 4.11.0 | linear | **the distance ordering** | no | **shifts on insert and erase** | 0.80 | yes |
| unordered_dense 5.0 | triangular over groups | an overflow counter for its hash class | no | **only a hit inside a write, to its own home** | 0.80 | yes |
| `std::unordered_map` | **a linked list per bucket** | the end of the list | n/a | no | 1.0 | yes |

The "metadata per slot" for boost is 16 bytes for 15 slots, for F14 16 bytes for 14 slots, and for
unordered_dense 5.0 88 bytes for 16 slots. F14's maximum load is 12 of 14 slots. "Ends on a hostile
hash" means that a lookup still terminates when keys are chosen so that every counter or bit along
the probe sequence says "continue".

There are three ways to read these tables.

**Down the "a miss stops on" column** is the last decade of hash map work. An empty slot is the
classic answer, and it is what forces tombstones. Everything else in that column is a way to answer
the question without an empty slot: an ordering (robin hood), a counter that an erase can decrement
(F14 in 2019, per hash class in indivi in 2024), an overflow bit (boost in 2022), an exact bit
(Verstable in 2023). The designs with **no** in the tombstone column are exactly the designs with
something other than "empty" in the miss column. That is no coincidence, it is the same choice
written twice.

**Down "metadata per slot"** is the memory the index costs before any key is stored. One byte is the
SwissTable minimum, boost gets 15 slots out of 16 bytes, and indivi spends two bytes to hold three
things. The dense maps look expensive here at 5.5 or 8 bytes, but this is where they pay for knowing
where the value is. A flat map pays for the same thing by keeping a whole empty `sizeof(value_type)`
in every empty slot. [The memory section](#memory) measures what it costs per live entry. With an 8
byte value this column is roughly the answer. With a 64 byte value the order turns around.

**Down "compared at once"** is what the branch predictor sees, and it explains more of the
measurements than anything else in either table. A design that asks one question of 16 slots has
one unpredictable branch per group. A design that asks a question per slot, or walks a chain, has
one per element it visits. A Verstable miss needs 19% fewer instructions than one in
unordered_dense 5.0 and twice the cycles, and about half of that difference is branch misses.

## What one lookup touches {#what-one-lookup-touches}

The tables above are static. The picture below draws the same information as the chain of loads a
hit has to wait for. The hash is arithmetic, and every box after it is a load whose address comes
from the box before it, so none of them can start early. One of those loads is cheaper than the
others and is marked amber. In the group index and in ihtab, the value index is in the same block as
the fingerprints. So by the time it is needed, it is usually already in the cache. Every other load
in the picture goes to a different region of memory.

[![The chain of loads a hit waits on, per design, grouped by family](/img/2026/hashmap-index/lookup-touches.svg)](/img/2026/hashmap-index/lookup-touches.svg)

**A flat map waits for two loads, and a dense one for three.** That third box is [the family
cost](#three-families), and no index design can remove it, because it is what the dense layout *is*.
What varies is how much it costs. In the group index and in ihtab the amber box is usually in the
cache already. F14Vector's index is a separate array and costs a full load.

**Two dense designs avoid it by not having a separate index.** unordered_dense 4.11.0's bucket word
holds the distance, the fingerprint and the value index together, and emhash8's index word holds the
chain link and the value index. So both are dense, and still wait for only two loads. They pay
elsewhere: eight bytes per slot for one, and a chain to walk for the other.

**Also, boxes at the same depth do not cost the same.** A group compare is one `movdqu`, one
`pcmpeqb` and one `pmovmskb`: 16 answers and a single branch. A chain step is a load plus a branch
the CPU has to guess. That is why the designs marked "+1 per chain step" lose even when the chains
are short.

# 15. The same workloads on every map [&#8593; contents](#contents){:.up} {#same-workloads}

Sixteen maps for integer keys and fourteen for string keys, plus two control rows each where boost
and abseil use their own hash. Seven workloads, three key and value types, all maps in one process
with the measurements interleaved. Verstable and ihtab are missing from the string tables: both
allocate raw memory and never construct a key, so the key has to be trivially copyable.

Everything below is **time relative to `ankerl::unordered_dense` 5.0**, so 1.00 is the same speed
and **below 1.00 is faster**. Each number is the geometric mean over the five sizes of one octave.
[Chapter 2](#what-a-lookup-is-made-of) explains the octave, the workloads and the error that five
sizes leave on churn, and [chapter 22](#how-measured) explains how to rerun all of it.

## Integer keys {#integer-keys}

[![Every map on build, hit, churn and iterate, relative to the group index](/img/2026/hashmap-index/bench-u64.svg)](/img/2026/hashmap-index/bench-u64.svg)

`map<uint64_t, size_t>`, 32,000 octave. The index of unordered_dense fits in L2, and the values in
L3:

*Time relative to unordered_dense 5.0: 0.80 is 20% less time, 1.50 is 50% more. Lower is faster.
Bold is the fastest map in each column. Blue cells are faster than unordered_dense 5.0, amber cells
slower.*

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
<td class="s4">2.33</td>
<td class="s3">1.52</td>
<td class="s3">1.55</td>
<td class="s3">1.42</td>
<td><b>0.98</b></td>
<td class="s3">1.47</td>
<td class="s3">1.43</td>
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
<td class="s3">1.69</td>
<td class="f2">0.80</td>
<td class="f2"><b>0.83</b></td>
<td class="f1">0.87</td>
<td class="s4">10.19</td>
<td class="f2">0.77</td>
<td class="f1">0.92</td>
</tr>
<tr><th scope="row">boost flat, own hash</th>
<td class="s3">1.68</td>
<td class="f2">0.80</td>
<td class="f2">0.83</td>
<td class="f1">0.87</td>
<td class="s4">10.45</td>
<td class="f2">0.77</td>
<td class="f1">0.91</td>
</tr>
<tr><th scope="row">absl flat</th>
<td class="s3">1.62</td>
<td class="f2">0.75</td>
<td class="s3">1.42</td>
<td class="f1">0.93</td>
<td class="s4">14.36</td>
<td class="s2">1.19</td>
<td class="s2">1.28</td>
</tr>
<tr><th scope="row">absl flat, own hash</th>
<td class="s1">1.12</td>
<td class="f2">0.77</td>
<td class="s3">1.43</td>
<td class="f1">0.94</td>
<td class="s4">13.04</td>
<td class="s2">1.19</td>
<td class="s2">1.28</td>
</tr>
<tr><th scope="row">F14Value</th>
<td class="s3">1.71</td>
<td class="f1">0.93</td>
<td class="s3">1.47</td>
<td class="s1">1.07</td>
<td class="s4">8.43</td>
<td class="s2">1.24</td>
<td class="s2">1.32</td>
</tr>
<tr><th scope="row">F14Vector</th>
<td class="s3">1.77</td>
<td class="s1">1.07</td>
<td class="s1">1.10</td>
<td class="s1">1.08</td>
<td class="s3">1.48</td>
<td class="s2">1.35</td>
<td class="s2">1.38</td>
</tr>
<tr><th scope="row">emhash8</th>
<td class="s4">2.88</td>
<td class="s2">1.20</td>
<td class="s4">2.12</td>
<td class="s3">1.51</td>
<td>1.00</td>
<td class="s2">1.23</td>
<td class="s2">1.27</td>
</tr>
<tr><th scope="row">emilib</th>
<td class="s3">1.91</td>
<td class="s1">1.10</td>
<td class="s1">1.12</td>
<td class="s1">1.10</td>
<td class="s4">5.07</td>
<td class="f1">0.93</td>
<td class="s1">1.10</td>
</tr>
<tr><th scope="row">indivi flat_umap</th>
<td class="s3">1.62</td>
<td class="f2">0.82</td>
<td class="f1">0.92</td>
<td class="f1">0.88</td>
<td class="s4">6.11</td>
<td class="f3"><b>0.70</b></td>
<td class="f1"><b>0.89</b></td>
</tr>
<tr><th scope="row">indivi flat_wmap</th>
<td class="s3">1.88</td>
<td class="f2"><b>0.72</b></td>
<td class="f2">0.83</td>
<td class="f2"><b>0.82</b></td>
<td class="s4">9.15</td>
<td class="f1">0.94</td>
<td>0.97</td>
</tr>
<tr><th scope="row">Verstable</th>
<td class="s4">3.14</td>
<td class="s1">1.08</td>
<td class="s4">2.05</td>
<td class="s2">1.38</td>
<td class="s4">11.03</td>
<td class="s1">1.09</td>
<td class="s1">1.16</td>
</tr>
<tr><th scope="row">ihtab</th>
<td class="s1">1.10</td>
<td>1.00</td>
<td class="s1">1.10</td>
<td>1.02</td>
<td class="s4">7.95</td>
<td class="s1">1.13</td>
<td class="s1">1.13</td>
</tr>
<tr><th scope="row">std::unordered_map</th>
<td class="s4">5.55</td>
<td class="s3">1.88</td>
<td class="s4">4.04</td>
<td class="s4">2.23</td>
<td class="s4">32.53</td>
<td class="s4">2.13</td>
<td class="s4">2.14</td>
</tr>
<tr><th scope="row">boost node</th>
<td class="s4">4.53</td>
<td class="s1">1.15</td>
<td class="f1">0.87</td>
<td class="s1">1.12</td>
<td class="s4">13.82</td>
<td class="s2">1.38</td>
<td class="s3">1.46</td>
</tr>
<tr><th scope="row">absl node</th>
<td class="s4">3.94</td>
<td class="s1">1.06</td>
<td class="s2">1.39</td>
<td class="s1">1.11</td>
<td class="s4">16.37</td>
<td class="s3">1.88</td>
<td class="s3">1.75</td>
</tr>
<tr><th scope="row">F14Node</th>
<td class="s4">4.15</td>
<td class="s1">1.15</td>
<td class="s2">1.34</td>
<td class="s2">1.22</td>
<td class="s4">11.96</td>
<td class="s4">2.06</td>
<td class="s3">1.90</td>
</tr>
</tbody>
</table>

Read it column by column, and the design chapters show up in it.

**The miss column is the "absent?" question.** abseil is faster on a hit than boost and `flat_umap`
(0.75), and slower than both on a miss (1.42). Its miss has to find an empty control byte, and at
load 7/8 that is often not in the first window. boost (0.83), `flat_umap` (0.92) and unordered_dense
5.0 almost always stop at home. They have an explicit test for "did a key of my class overflow past
here", and do not need an empty slot. Between otherwise similar SwissTables that is worth 1.4x to
1.7x on a miss.

**The churn column does not say what you might expect from the design chapters.** Boost is at 0.77
here and 0.52 in the 500,000 octave, although [its own chapter](#bit-vs-tombstone) shows its misses
getting up to 1.46x slower under exactly this workload. Both are true. Boost starts so far ahead
that it is still the faster map at its worst point. The counters of unordered_dense 5.0 do not keep
the probe length flat either. After long churn its misses read 1.27 groups at load 0.76 ([chapter
13](#drift)). That is about as much as boost's worst point of 1.27, except that boost's then drops
back with its next rehash. For throughput on this workload, read the column and take boost. Keep in
mind that five sizes per octave can be off by up to a quarter on churn between different maps.

**The chained designs lose on the miss.** emhash8 at 2.12 and Verstable at 2.05 have the slowest
misses of any modern design here, and [the counters below](#counters) show that the instructions
are not the reason. A chain has to be walked to its end, and whether there is one at all is not
predictable.

**The iterate column is nearly the family split.** 0.98 to 1.48 for the dense maps, 5 to 14x for
every flat map, 12 to 33x for the node maps. Those are by far the largest ratios in this post, and
they come entirely from a flat map having to walk its empty slots. The exception is ihtab at 7.95,
which is dense and still iterates like a flat map, because its iterator has to [check a deleted bit
per element](#ihtab).

**The build column has a surprise in it**, and the index has nothing to do with it. `absl flat, own
hash` builds at 1.12, where `absl flat` with unordered_dense's hash builds at 1.62.
`absl::Hash<uint64_t>` is much cheaper than unordered_dense's multiply-based hash for an integer key,
and a build hashes more than any other workload. Same map, same index, and 1.45x apart on the hash
alone. That is why the control rows with each map's own hash are there.

In the 500,000 octave the picture shifts. These tables are 13.1 MB at the smallest size and 24.3 MB
at the largest (index plus values of unordered_dense), against 32 MB of L3 for the core the
benchmark runs on. So the index no longer fits in L2, and the index and the values compete for L3:

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
<td class="s3">1.47</td>
<td class="s3">1.50</td>
<td class="s3">1.49</td>
<td><b>1.00</b></td>
<td class="s2">1.26</td>
<td class="s2">1.26</td>
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
<td class="f2">0.78</td>
<td class="f3">0.69</td>
<td class="f2">0.76</td>
<td class="s4">6.16</td>
<td class="f3"><b>0.52</b></td>
<td class="f3">0.70</td>
</tr>
<tr><th scope="row">boost flat, own hash</th>
<td class="s2">1.37</td>
<td class="f2">0.78</td>
<td class="f3">0.70</td>
<td class="f2">0.76</td>
<td class="s4">6.22</td>
<td class="f3">0.52</td>
<td class="f3">0.69</td>
</tr>
<tr><th scope="row">absl flat</th>
<td class="s3">1.42</td>
<td class="f2">0.73</td>
<td class="f2">0.77</td>
<td class="f2">0.74</td>
<td class="s4">8.83</td>
<td class="f3">0.64</td>
<td class="f2">0.81</td>
</tr>
<tr><th scope="row">absl flat, own hash</th>
<td class="s1">1.07</td>
<td class="f2">0.72</td>
<td class="f2">0.78</td>
<td class="f2">0.72</td>
<td class="s4">8.72</td>
<td class="f3">0.64</td>
<td class="f2">0.81</td>
</tr>
<tr><th scope="row">F14Value</th>
<td class="s3">1.95</td>
<td class="f1">0.88</td>
<td class="s2">1.17</td>
<td>0.95</td>
<td class="s4">4.56</td>
<td>1.02</td>
<td class="s1">1.06</td>
</tr>
<tr><th scope="row">F14Vector</th>
<td class="s3">1.92</td>
<td class="s1">1.16</td>
<td class="s1">1.09</td>
<td class="s1">1.12</td>
<td>1.02</td>
<td>1.02</td>
<td class="s1">1.15</td>
</tr>
<tr><th scope="row">emhash8</th>
<td class="s4">2.57</td>
<td>1.04</td>
<td class="s1">1.13</td>
<td class="s1">1.06</td>
<td>1.00</td>
<td class="f1">0.91</td>
<td>0.96</td>
</tr>
<tr><th scope="row">emilib</th>
<td class="s3">1.62</td>
<td>1.04</td>
<td class="f2">0.80</td>
<td>0.98</td>
<td class="s4">3.69</td>
<td class="f3">0.70</td>
<td class="f2">0.81</td>
</tr>
<tr><th scope="row">indivi flat_umap</th>
<td class="s2">1.38</td>
<td class="f2">0.82</td>
<td class="f1">0.88</td>
<td class="f2">0.82</td>
<td class="s4">3.89</td>
<td class="f3">0.55</td>
<td class="f2">0.73</td>
</tr>
<tr><th scope="row">indivi flat_wmap</th>
<td class="s3">1.75</td>
<td class="f3"><b>0.63</b></td>
<td class="f3"><b>0.64</b></td>
<td class="f3"><b>0.64</b></td>
<td class="s4">4.95</td>
<td class="f3">0.62</td>
<td class="f3"><b>0.61</b></td>
</tr>
<tr><th scope="row">Verstable</th>
<td class="s4">2.58</td>
<td class="f2">0.75</td>
<td class="f1">0.94</td>
<td class="f2">0.80</td>
<td class="s4">5.63</td>
<td class="f3">0.66</td>
<td class="f2">0.73</td>
</tr>
<tr><th scope="row">ihtab</th>
<td class="s2">1.28</td>
<td>1.01</td>
<td class="s1">1.09</td>
<td>1.04</td>
<td class="s4">3.54</td>
<td class="f3">0.68</td>
<td class="f2">0.81</td>
</tr>
<tr><th scope="row">std::unordered_map</th>
<td class="s4">6.04</td>
<td class="s3">1.73</td>
<td class="s4">3.46</td>
<td class="s4">2.10</td>
<td class="s4">64.43</td>
<td class="s3">1.89</td>
<td class="s3">1.94</td>
</tr>
<tr><th scope="row">boost node</th>
<td class="s4">4.86</td>
<td class="s1">1.16</td>
<td class="f2">0.84</td>
<td class="s1">1.11</td>
<td class="s4">31.14</td>
<td class="f1">0.95</td>
<td class="s2">1.17</td>
</tr>
<tr><th scope="row">absl node</th>
<td class="s4">4.54</td>
<td class="s1">1.07</td>
<td>0.96</td>
<td>1.04</td>
<td class="s4">16.99</td>
<td class="s1">1.10</td>
<td class="s2">1.27</td>
</tr>
<tr><th scope="row">F14Node</th>
<td class="s4">5.09</td>
<td class="s1">1.08</td>
<td class="s2">1.20</td>
<td class="s1">1.14</td>
<td class="s4">23.76</td>
<td class="s3">1.47</td>
<td class="s3">1.50</td>
</tr>
</tbody>
</table>

**The cost of the dense layout grows with the table.** boost goes from 0.80 to 0.78 on a hit and
from 0.83 to **0.69** on a miss, abseil from 0.75 to 0.73 and from 1.42 to 0.77. The extra dependent
load of [the dense family](#three-families) turns from a few cycles into a cache miss, and the
larger metadata of the group index leaves L2 earlier. When every lookup waits for memory, the number
of regions it touches matters more than where the probe stops. That is also why abseil's miss
improves so much.

**`indivi::flat_wmap` has the fastest integer hit in both octaves**, 0.63 here. It also has [the
widest sawtooth](#flat-wmap) of the maps I measured, so a single number at a single size would say
little about it.

## String keys {#string-keys}

[![Every map on the string workloads, relative to the group index](/img/2026/hashmap-index/bench-str.svg)](/img/2026/hashmap-index/bench-str.svg)

`map<std::string, size_t>`, keys of 8 to 135 bytes, mostly short, 32,000 octave:

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
<td class="s2">1.23</td>
<td class="s1">1.12</td>
<td>1.04</td>
<td class="s1">1.09</td>
<td>1.00</td>
<td>1.04</td>
<td class="s1">1.06</td>
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
<td class="s3">1.43</td>
<td class="f1">0.87</td>
<td class="f1"><b>0.90</b></td>
<td class="f1">0.89</td>
<td class="s4">4.17</td>
<td class="f1">0.88</td>
<td class="f1"><b>0.89</b></td>
</tr>
<tr><th scope="row">boost flat, own hash</th>
<td class="s3">1.65</td>
<td class="s1">1.15</td>
<td class="s2">1.34</td>
<td class="s1">1.12</td>
<td class="s4">3.99</td>
<td class="f1">0.93</td>
<td>1.02</td>
</tr>
<tr><th scope="row">absl flat</th>
<td class="s2">1.26</td>
<td class="f1">0.93</td>
<td class="s1">1.06</td>
<td class="f1">0.90</td>
<td class="s4">5.35</td>
<td class="f1">0.94</td>
<td>0.97</td>
</tr>
<tr><th scope="row">absl flat, own hash</th>
<td class="s2">1.25</td>
<td>0.96</td>
<td class="s1">1.05</td>
<td class="f1">0.92</td>
<td class="s4">5.23</td>
<td class="f1">0.93</td>
<td>0.97</td>
</tr>
<tr><th scope="row">F14Value</th>
<td class="s2">1.40</td>
<td>0.99</td>
<td class="s1">1.06</td>
<td>0.97</td>
<td class="s4">3.44</td>
<td class="f1">0.94</td>
<td>1.01</td>
</tr>
<tr><th scope="row">F14Vector</th>
<td class="s2">1.26</td>
<td>0.98</td>
<td class="f1">0.94</td>
<td>0.97</td>
<td>1.00</td>
<td>1.02</td>
<td>1.03</td>
</tr>
<tr><th scope="row">emhash8</th>
<td class="s3">1.75</td>
<td>0.97</td>
<td class="s2">1.21</td>
<td>1.00</td>
<td><b>0.98</b></td>
<td class="s1">1.10</td>
<td class="s1">1.12</td>
</tr>
<tr><th scope="row">emilib</th>
<td class="s3">1.59</td>
<td>0.95</td>
<td>0.98</td>
<td>0.97</td>
<td class="s4">3.48</td>
<td class="f1">0.92</td>
<td>0.99</td>
</tr>
<tr><th scope="row">indivi flat_umap</th>
<td class="s3">1.44</td>
<td>0.96</td>
<td class="s1">1.08</td>
<td>0.95</td>
<td class="s4">2.83</td>
<td class="f2"><b>0.80</b></td>
<td>0.99</td>
</tr>
<tr><th scope="row">indivi flat_wmap</th>
<td class="s3">1.41</td>
<td class="f1">0.90</td>
<td>0.97</td>
<td class="f1">0.91</td>
<td class="s4">3.64</td>
<td class="f1">0.93</td>
<td>0.96</td>
</tr>
<tr><th scope="row">std::unordered_map</th>
<td class="s4">2.64</td>
<td class="s1">1.15</td>
<td class="s4">2.52</td>
<td class="s3">1.41</td>
<td class="s4">45.97</td>
<td class="s3">1.64</td>
<td class="s3">1.56</td>
</tr>
<tr><th scope="row">boost node</th>
<td class="s3">1.93</td>
<td class="f2"><b>0.83</b></td>
<td class="f1">0.92</td>
<td class="f1"><b>0.86</b></td>
<td class="s4">10.27</td>
<td class="s1">1.10</td>
<td>1.03</td>
</tr>
<tr><th scope="row">absl node</th>
<td class="s3">1.94</td>
<td class="f1">0.88</td>
<td class="s1">1.08</td>
<td class="f1">0.86</td>
<td class="s4">8.20</td>
<td class="s1">1.13</td>
<td class="s1">1.09</td>
</tr>
<tr><th scope="row">F14Node</th>
<td class="s3">1.72</td>
<td class="f1">0.87</td>
<td>1.04</td>
<td class="f1">0.87</td>
<td class="s4">8.28</td>
<td class="s1">1.09</td>
<td class="s1">1.10</td>
</tr>
</tbody>
</table>

**On hit, miss and churn, nearly all of the modern maps are within 15% of each other.** The hash and
the key comparison are most of the work, and every map is handed the same hash. `std::unordered_map`
at 2.52 on a miss is the exception, and boost with its own hash at 1.34 is the control that the
table below is about. So for string keys the index you pick matters little, and the hash you pick
matters a lot.

F14Vector has the fastest string miss of the dense maps, at **0.94**, which is within what this
harness can resolve. Measured one map per binary at 32,000 entries, unordered_dense needs 129.7
instructions per string miss against F14Vector's 132.7, and 18.01 ns against 17.61: fewer
instructions, 2.3% more time. Before [the probe split](#probe-split) it was 8 to 9% behind on both.
What is left is **1.2 more L1 misses per lookup**. They come from the two prefetches of the index
that unordered_dense issues before any fingerprint is compared. On a miss that matches nothing, they
fetch a line that is never read. They stay, because dropping either one changes nothing measurable
on either compiler, from 50,000 to 16 million entries.

The control rows show how much the hash matters. Here is the same workload with the hash you get
when you only write the type name:

*Time relative to unordered_dense 5.0, lower is faster, bold is the fastest in each row.*

|  | boost, unordered_dense's hash | boost, its own hash | abseil, unordered_dense's hash | abseil, its own hash |
|---|---:|---:|---:|---:|
| hit | **0.87** | 1.15 | 0.93 | 0.96 |
| miss | **0.90** | 1.34 | 1.06 | 1.05 |
| build | 1.43 | 1.65 | 1.26 | **1.25** |
| churn | **0.88** | 0.93 | 0.94 | 0.93 |
{: .heat-par}

`boost::hash<std::string>` makes boost 32% slower on a hit and 49% slower on a miss. That turns a
map that is ahead of unordered_dense 5.0 into one that is behind it. `absl::Hash<std::string>` makes
abseil 3% slower on a hit, and about 1% faster on miss, build and churn. So "boost is faster on
string lookups" is true for boost *with unordered_dense's hash*. Out of the box it is not, and
abseil's default hash is the one that holds up. For an integer key it goes the other way, for one of
the two. `absl::Hash<uint64_t>` builds 1.45x faster in the integer table, while
`boost::hash<uint64_t>` is within 1% of unordered_dense's hash.

## A 64 byte mapped value {#big-value}

[![Every map with a 64 byte mapped value, relative to the group index](/img/2026/hashmap-index/bench-big.svg)](/img/2026/hashmap-index/bench-big.svg)

`map<uint64_t, some_64_byte_struct>`, 32,000 octave. Only the size of the value changed, and that
is the axis that separates flat from dense:

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
<td class="s3">1.98</td>
<td class="s2">1.38</td>
<td class="s3">1.54</td>
<td class="s2">1.36</td>
<td><b>0.99</b></td>
<td class="s2">1.39</td>
<td class="s2">1.27</td>
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
<td class="s3">1.72</td>
<td class="f1">0.90</td>
<td class="f2">0.83</td>
<td class="f1">0.94</td>
<td class="s4">3.89</td>
<td class="f2">0.76</td>
<td class="f2">0.84</td>
</tr>
<tr><th scope="row">boost flat, own hash</th>
<td class="s3">1.71</td>
<td class="f1">0.90</td>
<td class="f2"><b>0.83</b></td>
<td class="f1">0.95</td>
<td class="s4">3.90</td>
<td class="f2">0.76</td>
<td class="f2">0.84</td>
</tr>
<tr><th scope="row">absl flat</th>
<td class="s2">1.23</td>
<td class="f2">0.80</td>
<td class="s2">1.40</td>
<td class="f2">0.83</td>
<td class="s4">3.10</td>
<td class="f1">0.89</td>
<td>0.95</td>
</tr>
<tr><th scope="row">absl flat, own hash</th>
<td class="f1"><b>0.93</b></td>
<td class="f2">0.83</td>
<td class="s2">1.38</td>
<td class="f2"><b>0.82</b></td>
<td class="s4">3.12</td>
<td class="f1">0.89</td>
<td class="f1">0.95</td>
</tr>
<tr><th scope="row">F14Value</th>
<td class="s3">1.74</td>
<td class="s1">1.06</td>
<td class="s3">1.53</td>
<td class="s1">1.07</td>
<td class="s4">3.36</td>
<td class="s1">1.14</td>
<td class="s2">1.17</td>
</tr>
<tr><th scope="row">F14Vector</th>
<td class="s3">1.77</td>
<td class="s1">1.07</td>
<td class="s1">1.09</td>
<td class="s1">1.07</td>
<td>1.02</td>
<td class="s2">1.18</td>
<td class="s2">1.18</td>
</tr>
<tr><th scope="row">emhash8</th>
<td class="s4">2.58</td>
<td>1.04</td>
<td class="s4">2.09</td>
<td class="s1">1.12</td>
<td>1.05</td>
<td class="s1">1.10</td>
<td>1.03</td>
</tr>
<tr><th scope="row">emilib</th>
<td class="s3">1.75</td>
<td class="s1">1.10</td>
<td class="s1">1.11</td>
<td class="s1">1.14</td>
<td class="s4">2.79</td>
<td class="f1">0.90</td>
<td>1.01</td>
</tr>
<tr><th scope="row">indivi flat_umap</th>
<td class="s3">1.62</td>
<td class="f1">0.89</td>
<td class="f1">0.94</td>
<td class="f1">0.94</td>
<td class="s4">2.78</td>
<td class="f2"><b>0.73</b></td>
<td class="f1">0.87</td>
</tr>
<tr><th scope="row">indivi flat_wmap</th>
<td class="s3">1.79</td>
<td class="f2"><b>0.76</b></td>
<td class="f2">0.83</td>
<td class="f2">0.85</td>
<td class="s4">3.20</td>
<td class="f1">0.89</td>
<td class="f2"><b>0.81</b></td>
</tr>
<tr><th scope="row">std::unordered_map</th>
<td class="s4">5.34</td>
<td class="s3">1.44</td>
<td class="s4">4.27</td>
<td class="s3">1.56</td>
<td class="s4">25.07</td>
<td class="s3">1.83</td>
<td class="s3">1.76</td>
</tr>
<tr><th scope="row">boost node</th>
<td class="s4">3.95</td>
<td class="s1">1.08</td>
<td class="f1">0.87</td>
<td class="s1">1.08</td>
<td class="s4">5.87</td>
<td class="s1">1.12</td>
<td class="s2">1.18</td>
</tr>
<tr><th scope="row">absl node</th>
<td class="s4">3.47</td>
<td>1.00</td>
<td class="s2">1.36</td>
<td>1.02</td>
<td class="s4">4.74</td>
<td class="s2">1.40</td>
<td class="s2">1.24</td>
</tr>
<tr><th scope="row">F14Node</th>
<td class="s4">3.63</td>
<td class="s1">1.05</td>
<td class="s2">1.34</td>
<td class="s1">1.10</td>
<td class="s4">4.72</td>
<td class="s3">1.65</td>
<td class="s3">1.43</td>
</tr>
</tbody>
</table>

**The dense maps build 1.6 to 1.8x faster** than boost, F14Value, emilib and indivi with the same
hash. When the table grows, a dense map moves its values once, in order, as the vector grows, and
rebuilds an index of 5.5 bytes per slot. A flat map moves every 72 byte slot to a new hashed
address. **The dense maps also iterate 2.8 to 3.9x faster**, because there are no empty 72 byte
slots to walk over. abseil is the exception in the build column, at 1.23 with unordered_dense's
hash and 0.93 with its own. That is the same hash effect as in the integer table, about 1.3x here.

boost, abseil and indivi keep their advantage on lookups and churn, with boost at 0.76 on churn.
F14Value and emilib do not. So the trade is the one [the three families](#three-families)
describes, at the value size where it is easiest to see.

## Memory {#memory}

[![Bytes per entry with a 64 byte value: what each map asked for beside what the kernel backed](/img/2026/hashmap-index/memory-big.svg)](/img/2026/hashmap-index/memory-big.svg)

Memory has two reasonable answers, and they disagree about which map wins, so both are here.
**Bytes asked for** is what the map allocated and did not free, counted by intercepting `malloc`,
`mmap` and `aligned_alloc`. **Peak resident bytes** is what the kernel actually had to provide at
the highest point, read from `VmHWM`. The first is the number to argue about a design with, the
second is the number a machine runs out of. Both are the geometric mean over the 32,000 octave,
`uint64_t` keys. The "after churn" columns are measured after one full turnover of churn, so they
show the memory cost of whatever an erase leaves behind.

*Bytes allocated per live entry, lower is better, bold is the leanest in each column. Rows are
grouped by family (flat, then dense, then node) and sorted within each group.*

| map | 8 byte value | after churn | 64 byte value | after churn |
|---|---:|---:|---:|---:|
| absl flat | **26.4** | 30.3 | 113.3 | 130.2 |
| Verstable | 27.9 | **27.9** | -- | -- |
| indivi `flat_umap` | 27.9 | **27.9** | 114.9 | 114.9 |
| boost flat | 28.5 | 28.5 | 122.1 | 122.1 |
| F14Value | 28.5 | 28.5 | 114.1 | 114.1 |
| indivi `flat_wmap` | 30.3 | 34.8 | 130.2 | 149.5 |
| emilib | 30.3 | 30.3 | 130.2 | 130.2 |
| unordered_dense 5.0 | 31.8 | 31.8 | 107.6 | 107.6 |
| F14Vector | 32.9 | 32.9 | 115.3 | 115.3 |
| ihtab | 35.3 | 70.6 | -- | -- |
| unordered_dense 4.11 | 36.4 | 36.4 | 112.3 | 112.3 |
| emhash8 | 37.1 | 37.1 | 117.0 | 117.0 |
| `std::unordered_map` | 44.4 | 44.4 | 108.4 | 108.4 |
| absl node | 46.2 | 48.3 | **94.2** | 96.3 |
| F14Node | 46.5 | 46.5 | 94.5 | **94.5** |
| boost node | 47.4 | 47.4 | 95.4 | 95.4 |
{: .heat-low}

*Peak resident bytes per live entry, same maps, same order.*

| map | 8 byte value | after churn | 64 byte value | after churn |
|---|---:|---:|---:|---:|
| Verstable | 42.6 | 62.1 | -- | -- |
| emilib | 45.5 | 63.5 | 242.1 | 261.5 |
| F14Value | 48.7 | 68.2 | 218.3 | 237.8 |
| absl flat | 48.8 | 75.0 | 218.1 | 271.5 |
| boost flat | 52.7 | 75.5 | 236.8 | 275.4 |
| indivi `flat_umap` | 54.9 | 72.9 | 225.8 | 243.6 |
| indivi `flat_wmap` | 58.6 | 85.8 | 256.8 | 315.3 |
| emhash8 | **39.1** | 57.0 | 166.0 | 185.2 |
| unordered_dense 5.0 | 42.0 | **54.0** | 166.5 | 178.2 |
| unordered_dense 4.11 | 42.0 | 61.3 | 158.9 | 178.2 |
| ihtab | 49.4 | 126.5 | -- | -- |
| F14Vector | 50.6 | 70.0 | 188.0 | 207.3 |
| F14Node | 39.6 | 57.2 | **84.9** | **104.1** |
| absl node | 45.3 | 65.7 | 89.4 | 111.2 |
| boost node | 45.4 | 65.5 | 91.2 | 112.7 |
| `std::unordered_map` | 46.1 | 63.7 | 108.1 | 127.3 |
{: .heat-low}

The flat maps store a 16 or 72 byte `value_type` per slot, the dense ones store the same in a vector
plus their index. Verstable and ihtab have no 64 byte numbers. The adapter that measures memory
stores the mapped value directly, and neither library's C interface takes one that large without
changes I did not make.

**Counted in bytes allocated, with an 8 byte value, the flat maps win, and it is close.** 26 to 30
bytes per entry against 31.8 for unordered_dense 5.0. That is one byte of metadata per slot at load
0.875, against 5.5 bytes at 0.8. On top of that comes the extra capacity of a `std::vector` that
doubles, and that is where most of the difference comes from. That extra capacity is a setting, not
a property of the design. The value container is a template parameter. One that grows by 1.5x
instead of 2x measures **10% less memory per entry, and builds 14% slower** (13% less memory and 19%
slower with a 64 byte value). Those two numbers come from a separate experiment with its own
baseline, so only the percentages carry over to the tables above. It gets the memory to about
boost's level and pays with the build, which is the column unordered_dense leads, so 2x stays the
default. By the way, every map here doubles: folly's often-quoted growth factor of 1.406 only
applies to an explicit `reserve`, never to inserts.

**Counted in resident pages, the order changes.** abseil asks for 26.4 bytes per entry and occupies
48.8, where unordered_dense asks for 31.8 and occupies 42.0. A map that doubles frees its old array,
and glibc does not return that memory to the kernel, so it stays resident and counts at the peak.
What a flat map frees is its whole slot array at `sizeof(value_type)` per slot. What a dense map
frees is an index of 5.5 bytes per slot and a vector of values. **The ratio between the two tables
sorts the maps by family more cleanly than any other number in this post:**

*Peak resident bytes divided by bytes allocated, per family.*

| family | 8 byte value | 64 byte value |
|---|---|---|
| node | 0.85 to 1.04x | 0.90 to 1.00x |
| dense | 1.05 to 1.55x | 1.41 to 1.63x |
| flat | 1.50 to 1.97x | 1.86 to 1.97x |
{: .heat-low}

Below 1.00 is not a mistake. The allocated count charges each allocation with `malloc_usable_size`
plus glibc's eight byte header, which rounds up a little more than the pages do for many small
allocations.

**With a 64 byte value the node maps win, in both tables.** A flat map pays for every empty slot at
the full width of the value. At load 0.875 that is 82 bytes of slot for 72 bytes of data, before any
metadata. A dense map pays 72 bytes, plus about 7 bytes of index, plus the extra capacity of the
vector. A node map pays 72 bytes plus a pointer plus the allocator's header. The node maps ask for
94.2 to 108.4 bytes per entry and occupy 84.9 to 108.1. unordered_dense asks for 107.6 and occupies
166.5, and the flat maps ask for 113 to 130 and occupy 218 to 315. This is the one column where
`std::unordered_map` keeps up with anything.

**The churn column is where tombstones show up as bytes, and only the allocated table shows it
cleanly.** Every map with "no" in the tombstone column of [the summary table](#summary-table) stays
the same across a turnover, to the byte. abseil goes from 26.4 to 30.3 and from 113.3 to 130.2. Its
tombstones count against the load factor. When the table is too full to rehash in place it doubles,
so the average over the octave rises. `indivi::flat_wmap` does the same, 30.3 to 34.8. emilib has
tombstones and does *not* grow, because it only counts live elements against its limit. It pays in
probe length instead. In resident pages every map rises across a turnover, by 29 to 54% with an 8
byte value and by 7 to 25% with a 64 byte value. The reason is that churn is itself a stream of
allocations and frees that leaves the heap larger. So that table cannot show the effect.

**And ihtab doubles**, 35.3 to 70.6 bytes allocated and 49.4 to 126.5 resident (2.6x), and stays
there. That is the element array that only grows, carrying one dead element for every live one until
it rebuilds. That is a design choice, not a bug. In its sibling [ixhtab](#ixhtab) the same property
meets a test that compares a count for the whole table against the size of one bin. There the memory
never stops growing.

# 16. Where the time goes: counters and assembly [&#8593; contents](#contents){:.up} {#where-the-time-goes}

The tables above are ratios, and a ratio only says which map was faster. This chapter has the CPU
counters behind them: instructions, cycles, branch misses and cache misses. They come from one map
per binary, so that nothing depends on what else was compiled into the same program. After that come
the instructions that implement the three answers to "absent?", read straight from the binaries.

## Counters {#counters}

These runs are separate from the workload tables, so their nanoseconds are not comparable with other
tables in this post. `perf stat`, 30 million lookups on a table of 50,000 `uint64_t` keys. At that
size the index is in L1 and L2, and what gets counted is the work of the lookup more than the memory
system:

*Per lookup, lower is better except for IPC (instructions per cycle). Bold is the best in each
column of each half.*

|  | ns | instructions | cycles | branch misses | L1 misses | IPC |
|---|---:|---:|---:|---:|---:|---:|
| **all hits** |  |  |  |  |  |  |
| indivi `flat_wmap` | **3.70** | 50.1 | **19.5** | 0.035 | 3.29 | 2.56 |
| absl flat | 4.01 | 56.2 | 21.1 | 0.044 | 3.51 | **2.66** |
| boost flat | 4.76 | 57.0 | 25.1 | 0.096 | 3.84 | 2.27 |
| indivi `flat_umap` | 4.75 | 55.4 | 25.3 | 0.066 | 3.74 | 2.19 |
| F14Value | 4.95 | 64.0 | 26.4 | **0.022** | 3.80 | 2.43 |
| ihtab | 5.42 | 53.8 | 29.0 | **0.022** | 3.23 | 1.86 |
| unordered_dense 5.0 | 5.61 | 60.5 | 29.8 | 0.065 | 4.22 | 2.03 |
| emilib | 6.05 | 73.1 | 32.2 | 0.099 | **2.86** | 2.27 |
| F14Vector | 6.05 | 68.1 | 32.3 | 0.024 | 3.95 | 2.11 |
| Verstable | 6.59 | 57.4 | 34.7 | 0.434 | 3.26 | 1.66 |
| emhash8 | 6.97 | 48.4 | 36.9 | 0.419 | 3.20 | 1.31 |
| unordered_dense 4.11 | 9.07 | 93.3 | 48.3 | 0.161 | 3.49 | 1.93 |
| `std::unordered_map` | 9.81 | **45.1** | 52.5 | 0.324 | 4.22 | 0.86 |
| **all misses** |  |  |  |  |  |  |
| indivi `flat_umap` | **3.43** | 54.0 | **18.0** | 0.109 | 1.98 | 3.00 |
| F14Vector | 3.49 | 60.5 | 18.3 | **0.043** | 2.01 | **3.31** |
| boost flat | 3.98 | 54.3 | 20.8 | 0.164 | **1.89** | 2.61 |
| ihtab | 3.94 | 56.2 | 20.8 | 0.044 | 1.98 | 2.70 |
| unordered_dense 5.0 | 4.01 | 57.2 | 21.0 | 0.108 | 3.27 | 2.72 |
| indivi `flat_wmap` | 4.96 | 51.3 | 26.1 | 0.301 | 2.11 | 1.96 |
| absl flat | 6.01 | 61.1 | 31.7 | 0.360 | 3.44 | 1.93 |
| emilib | 6.12 | 75.6 | 32.2 | 0.419 | 1.92 | 2.35 |
| unordered_dense 4.11 | 6.62 | 90.3 | 34.8 | 0.162 | 2.48 | 2.59 |
| emhash8 | 7.22 | **46.4** | 38.1 | 0.592 | 2.08 | 1.22 |
| Verstable | 7.96 | 46.5 | 42.1 | 0.808 | 1.96 | 1.10 |
| `std::unordered_map` | 12.83 | 52.8 | 68.3 | 0.647 | 3.43 | 0.77 |
{: .heat-low data-invert="IPC"}

**The bottom of the miss table has the main argument of this post in four rows.** Verstable needs
**46.5 instructions and 42.1 cycles**, unordered_dense 5.0 needs 57.2 instructions and 21.0 cycles:
23% more work in half the time. 0.108 against 0.808 branch misses explains about half of that, at
roughly 16 cycles per miss. emhash8 has the same shape, and `std::unordered_map` has it again, plus a
pointer to follow: 52.8 instructions at 0.77 instructions per cycle.

**The two flat SwissTables that stop a miss on an empty byte are the slow ones.** abseil needs 31.7
cycles at 0.360 branch misses, and emilib 32.2 at 0.419, against boost's 20.8 and 0.164. [The
assembly below](#probe-assembly) shows where that comes from.

**No design here is limited by its instructions.** All of them run between 0.8 and 3.3 instructions
per cycle. The ones near the top wait for the branch predictor, and on a bigger table they all wait
for memory instead. Here is the same all-hits lookup at a million entries. That is still not larger
than the last level cache on this machine: 32 MB of L3 serve the core the benchmark runs on, and a
million entries are 26 MB for unordered_dense and 32 MB for boost.

*Per lookup at a million entries, lower is better, bold is the best in each column. These are
throughput numbers, and the table mostly fits in L3.*

|  | ns | cycles | dTLB misses | L1 misses |
|---|---:|---:|---:|---:|
| boost flat | **15.26** | **82.8** | 1.366 | 4.226 |
| indivi `flat_wmap` | 15.66 | 85.2 | 1.348 | 3.681 |
| absl flat | 16.37 | 88.9 | 1.339 | 4.069 |
| Verstable | 18.32 | 99.4 | 1.600 | 3.619 |
| indivi `flat_umap` | 19.84 | 107.9 | 1.596 | 4.550 |
| ihtab | 19.86 | 108.0 | 1.860 | 3.590 |
| F14Vector | 20.10 | 109.3 | 1.776 | 4.371 |
| F14Value | 21.47 | 116.7 | **1.150** | 4.127 |
| unordered_dense 5.0 | 21.94 | 119.4 | 1.907 | 4.664 |
| emhash8 | 23.88 | 129.8 | 2.189 | **3.492** |
| boost node | 31.70 | 172.7 | 2.510 | 5.176 |
{: .heat-low}

**The dTLB column splits the families**, and it is the clearest single number for what the dense
layout costs. The flat maps that touch one region need 1.15 to 1.60 TLB misses per lookup, the
dense ones that touch two need 1.78 to 2.19, and a node map that follows a pointer to a heap
allocation needs 2.51. With 4 KB pages, a prefetch cannot hide a page table walk.

### Huge pages {#huge-pages}

A dense map touches two regions per lookup where a flat map touches one, and that shows in the TLB.
At 800,000 entries and all hits, unordered_dense has 1.48 dTLB misses per lookup against boost's
0.89. Take an allocator that `mmap`s 2 MB aligned blocks and asks for huge pages with
`madvise(MADV_HUGEPAGE)`. With it, unordered_dense goes from 17.10 to 13.32 ns per hit, and boost
from 9.75 to 7.58, both about 22% faster. That allocator is now an optional header of
unordered_dense. It helps the *build* even more than the lookup: an integer build is **1.53x faster
at 200,000 entries, 1.73x at 800,000 and 1.56x at four million**. The reason is that a growing
vector touches every new page, and 2 MB pages mean 512 times fewer page faults. For integer keys
below about 200,000 entries it does nothing, since no allocation reaches 2 MB. A string build
already gains 1.17x at 50,000 entries, because its value vector does. It is not the default, and
should not be: it is a decision for the whole process, it changes the allocator type, and how much
it gains depends on the machine.

## The probe loops, in assembly {#probe-assembly}

The three answers to "absent?" end up as a few instructions, and you can read them straight from the
binaries. All three are the end of the same loop: broadcast the fingerprint, compare 16 bytes,
`pmovmskb`, walk the matches. They differ only in what happens when the mask is empty. Compiled with
clang 22 at `-O3`, default `-march`, one map per binary, from the all-hits lookup loop. `...` marks
instructions left out.

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
  add    rdx,rdi                 ; else the next window
```

**boost**: one byte test against a bit computed once.

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

**unordered_dense 5.0**: one byte compare against zero.

```nasm
  prefetcht0 BYTE PTR [r13+r10*1+0x40]  ; the block's second and last cache lines,
  prefetcht0 BYTE PTR [r13+r10*1+0x57]  ; issued before the fingerprints are even loaded
  movdqu xmm1,XMMWORD PTR [r13+r10*1+0x0]
  pcmpeqb xmm1,xmm0
  pmovmskb r10d,xmm1
  test   r10d,r10d
  je     .no_match
  ...
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

Three things show here that no table shows.

The **miss test** is two vector instructions and a branch in abseil, one memory `test` in boost, and
one `cmp` against zero in unordered_dense. abseil's looks at all 16 bytes, where the other two look
at one. That is the 1.42 in the miss column.

unordered_dense issues **its two prefetches before the metadata load**, so its extra dependent load
costs less than [the picture of what a lookup touches](#what-one-lookup-touches) suggests. The cache
line with the value index is already on its way. clang puts both prefetches before the `movdqu` and
gcc after it. Dropping either one is within 3% on both compilers at every size I measured, so there
is nothing to tune here on x86.

And **the walk over the matches is the same three steps everywhere**: `tzcnt`, use the lane, then
`lea`/`and` to clear it. All of the design differences sit in the instructions before and after it.

## Three ways to be fast {#three-ways}

Put those counters next to the times from [chapter 15](#same-workloads), and the field sorts into
three strategies. None of them wins everywhere.

**Fewest instructions.** On a miss, emhash8 and Verstable (46.4 and 46.5). A chain only visits keys
with the same home, so in principle nothing is wasted. They still lose, because every step of the
chain is a branch.

**Fewest regions touched.** The flat SwissTables: one allocation, one load after the metadata, and
the key is right there. On integer keys this wins a fresh hit in both octaves, and wins by more the
larger the table gets. That holds for throughput. When each lookup has to wait for the one before
it, the dense map is ahead at a million entries ([corrections](#errata)).

**Fewest unpredictable branches.** The group designs. One question per 16 slots, whatever the group
holds, and the answer to "absent?" arranged so that a miss usually stops at home. This wins in cache
and on anything that erases, and it is what most of the hash map work of the last years has been
about.

None of them wins everywhere because each is strong against a different cost, and which cost
matters depends on the table size. While the table fits in L1 and L2, the branch predictor is the
bottleneck, so the group designs win. Once the index leaves L2, memory is the bottleneck, so the map
that touches one region wins. The dense maps are on the wrong side of that by construction, and on
the right side of every column that iterates, grows, or stores a value bigger than a pointer.

# 17. Question by question [&#8593; contents](#contents){:.up} {#question-by-question}

What the measurements say, situation by situation. The second and third items are [questions 3 and
5](#five-questions): when may a miss stop, and what does an erase leave behind. Those are the two
where the designs really differ. Most of the others are not questions about the index at all, and
they decide which map you want anyway.

**A hit on a fresh table.** On integer keys the flat SwissTables, by a good margin. On string keys
there is no margin at all: the fastest string hit is a node map, boost's, and the modern maps are
within 15% of each other. A flat map has one region and one load after the metadata. abseil and
boost trade places depending on the hash and the size, and indivi is right there with them. The
dense maps pay one more load. The fastest flat map is 1.39x faster than unordered_dense 5.0 in the
32,000 octave and 1.59x in the 500,000 octave. F14Vector needs 1.15x the time of its own flat
sibling F14Value. That is the cost of the family, and no index trick removes it.

**A miss on a fresh table.** Closer, and in cache the counter designs do well. A miss that stops in
its home group never touches a key, so the metadata compare is the whole lookup. boost's overflow
bit, indivi's counter and unordered_dense's counter nearly always stop there. The chained designs
are the slowest, because a miss has to reach the end of a chain, and whether there is one is the
unpredictable question. Once the index leaves L2 the order changes, and the stop test no longer
decides it. In the 500,000 octave `flat_wmap` is at 0.64, boost 0.69, abseil 0.77, and emilib, which
has tombstones, 0.80. There every design waits for memory, and what counts is how many regions it
touches.

**A table that only churns.** This is where the answers to "gone?" separate. abseil, emilib and
ihtab leave tombstones, boost leaves overflow bits, and all of them get slower until a rehash and
then pay for the rehash. The counter designs leave their counters exact. But keys that were moved
away from home stay there, so their probes get longer too. unordered_dense 5.0 goes from 1.05 to
1.27 groups per miss at load 0.76, and `move_home` takes back part of it for keys that are written
to. I did not measure the drift of F14 and indivi. Whether a benchmark shows any of this depends on
whether it holds the size constant, and most do not. And none of it decides the winner: boost gets
1.46x slower on a miss and is still ahead of unordered_dense on churn at every size.

**Iteration.** The dense maps, by an order of magnitude, the largest ratio anywhere in this post. A
dense map walks exactly the live entries in one array. A flat map walks the whole slot array, and at
load 0.5 that is twice the memory for the same elements. F14Vector and emhash8 are as fast as
unordered_dense. ihtab is not, because its array keeps erased elements and the iterator has to check
a bit for each one.

**Large values.** The dense maps again, for the same reason from the other side. A flat map moves
every `value_type` to a new hashed address on every growth, where a dense map moves the values once,
in order, and rebuilds a small index.

**Memory.** With a large mapped value, roughly the reverse of the "metadata per slot" column of [the
summary table](#summary-table), and with an 8 byte value roughly the same order. A flat map costs
`sizeof(value_type) / load factor` per live entry plus a byte or two of metadata, so all of its
overhead is empty slots at the full width of the value. A dense map costs `sizeof(value_type)` times
the extra capacity of its vector (1x to 2x), plus its index. The two cross over as the value grows,
and [the memory section](#memory) shows where.

**Pointer stability.** Only the node maps. If a reference has to survive an insert, nothing in the
flat or dense families will do, whatever the measurements say. `unordered_dense::segmented_map` is
a partial answer: it keeps references valid on insert by storing the values in segments that never
move. Its index still doubles, and its iterators are not stable.

**A hostile hash.** Every design here degrades to a long probe, which is fine. The question is
whether it ends. `indivi::flat_umap` did not until [September
2026](https://github.com/gaujay/indivi_collection/issues/2), and unordered_dense 5.0 did not until a
review shortly before its release. Eight chosen keys were enough to hang either one. abseil also
mixes a per-table seed into every hash. Its stated purpose is a random iteration order, but it also
means that keys chosen against a known hash do not line up the same way in every table. No other map
here has one, unordered_dense included. [Built into unordered_dense](#from-abseil-seed) it costs
nothing on a lookup and 3.5% on a build. So the argument against it is the build cost and the lost
reproducible iteration order, which every user would pay for.

**Erase by iterator.** A map that does not need the home of the erased key can erase without a hash:
the tombstone maps, boost, and `indivi::flat_umap` thanks to its distance nibbles. unordered_dense,
F14 and the chained designs compute the home from the key again.

**Small, short-lived maps.** The maps that allocate nothing until the first insert, plus abseil's
[single-element mode](#swiss-soo), which makes an empty or one-element map allocate nothing at all
when the element fits in 16 bytes. Measure it if that is your workload, because the ranking there
is not the ranking anywhere else.

## Which one, then {#which-one}

Small values and a table that is mostly read? Take a flat SwissTable: `boost::unordered_flat_map` is
fast on every integer lookup and on churn in my measurements, and `absl::flat_hash_map` has the best
hash out of the box. You iterate a lot, or the values are large? Take a dense map, and
`ankerl::unordered_dense` is mine, so take that recommendation with the bias in mind. You need
references to stay valid? Take a node map, and prefer `boost::unordered_node_map` or
`absl::node_hash_map` over `std::unordered_map`, which is slow for reasons the standard requires.

I also wrote [a quiz](/which-hash-map/) about this. It asks the questions in an order that gets to
an answer faster than a table does.

# 18. What unordered_dense 5.0 took from the others, and what it dropped [&#8593; contents](#contents){:.up} {#borrowed}

I read every design above with one question in mind: is there something in it that belongs in [the
group index](#group-index)? Thirteen ideas came out of that. I built twelve of them into
unordered_dense 5.0 and measured eleven against the same header without them. The twelfth only
matters on MSVC, which I cannot benchmark. The thirteenth I estimated from probe lengths. Four are
in the shipped index, nine are not. The nine are the more interesting part, because a negative
result with a mechanism behind it says more about a design than a positive one.

**Read a "no" as "unordered_dense already had a way to do this", not as "this is a bad idea".** An
idea that is 4% slower here is often exactly what makes the map it comes from fast.

**And it works the other way round too.** Every part of the group index that is worth having came
from one of these maps. The counters and their decrement on erase are [indivi](#indivi)'s. The
table of pre-broadcast fingerprint words is [boost](#boost)'s idea. The group of 16 fingerprints
compared with one instruction is [abseil](#swisstable)'s, and everything else here builds on it.
What is mine is the combination, and the measuring.

| idea | from | measured | kept |
|---|---|---|---|
| one overflow counter per hash class, decremented on erase | [indivi](#indivi) (F14 has one per chunk) | it is the design | **yes** |
| the table of pre-broadcast fingerprint words | [boost](#boost), in indivi's version | integer misses 5 to 6% faster | **yes** |
| a probe that ends after every group was seen | [boost](#boost) had it; I found it missing in a review | free, by instruction count | **yes** |
| a real prefetch on MSVC | [boost](#boost) | not measurable here, no MSVC benchmarks | **yes** |
| a per-table seed | [abseil](#swisstable) | no cost on a lookup, 3.5% slower build | no |
| one counter per group instead of eight | [folly F14](#f14) | 4% slower on the suite | no |
| double hashing instead of a triangular probe | [folly F14](#f14) | churned misses 1.07 to 1.18x faster, a fresh integer hit up to 5% slower under clang | no |
| a second fingerprint in the unused index bits | [emhash8](#emhash8) | 2.5% slower on the suite | no |
| distance nibbles, with a back-pointer from value to slot | [indivi](#indivi) | 4% slower on the suite | no |
| cache-line-aligned value indices | [boost](#boost)'s aligned groups | 0.7% slower on the suite | no |
| a 16 bit value index | CPython's compact dict | 1.4% slower on the suite | no |
| a 16 slot window from the home slot | [abseil](#swisstable), [`flat_wmap`](#flat-wmap) | hits 1 to 5% faster, churn 24% slower at a million entries | no |
| an exact in-home test | [Verstable](#verstable) | estimated 6 to 7% of a churned miss, not built | no, open |

"On the suite" is the geometric mean over the 15 workloads of unordered_dense's own benchmark, each
measured paired against the same header without the change. "4% slower" means a ratio of 0.96. Where
a number needs more than a row, it is below.

Most of these rows do not rest on the paired measurement alone: instruction counts, one map per
binary, or probe lengths back them up. Three rest only on it: the second fingerprint, the aligned
value indices and the 16 bit index. Read those as "measured, did not pay for itself, not measured
again with a better method". That matters, because two results of the paired harness did not survive
a better measurement. The per-table seed measured 4% slower on lookups paired, but costs nothing
when measured one map per binary. Double hashing measured 9% slower on integer misses paired, but is
level when measured one header per binary.

## From boost: the fingerprint table, the probe bound, the MSVC prefetch {#from-boost}

[boost](#boost) has a table of 256 pre-broadcast fingerprint words. At some point unordered_dense
5.0 computed the word with arithmetic instead: an and, a compare, a shift, an or and a multiply. All
of that is on the critical path of every lookup, insert and erase. One L1 load is cheaper.
Measured paired, the table makes random integer misses 5 to 6% faster on both compilers, and finds
with 64 byte values 14% faster under gcc. unordered_dense uses indivi's version of the table, which
only remaps 0, because unordered_dense needs no sentinel value.

The probe bound is a correctness fix, not an optimization: [the miss bound](#miss-bound), with the
keys that showed it was missing. Boost always had it.

The third one is small: unordered_dense had no prefetch at all on MSVC, because its prefetch macro
was only defined for gcc and clang. Boost spells it out for MSVC on x86-64 and ARM64, and
unordered_dense now does the same. I have no MSVC benchmark, so this one is not measured.

## From folly F14, and from Verstable: how wide should a counter be {#counter-width}

The group index keeps eight one-byte counters per group, one per hash class. Folly's design asks
the obvious question: is one counter enough? That is measurable, and so are the other directions.
I built and measured every way to divide a group's eight counter bytes, on a table at load 0.76,
fresh and after 200 turnovers of churn with random keys:

*Groups read per miss, the share of churned misses that continue past their home group, and the
time on the suite relative to the shipped design. Lower is better throughout. Bold is the best in
each column.*

| counters per group | fresh miss | churned miss | churned misses that continue | time on the suite |
|---|---:|---:|---:|---:|
| 1, as in F14 | 1.21 | 2.79 | 60% | 1.043 |
| 8 of one byte, as shipped | 1.06 | 1.26 | 17.5% | **1.000** |
| 16 of 4 bits | 1.03 | **1.13** | **9.7%** | 1.014 |
| 32 of 2 bits | **1.02** | 1.15 and rising | rising | 1.012 |

A shared counter does not know the hash class, so *any* overflow past a group makes every later miss
in that group continue. In a churned table most groups have seen an overflow, so 60% of misses
continue. That is 4% slower on the suite and 20% slower on churn.

**Finer** counters, sixteen 4 bit ones, do filter better at no memory cost: 9.7% of churned misses
continue, against 17.5%. They still lose, by 1.4%. A counter smaller than a byte needs a load, a
mask and a compare to read, and a read-modify-write to increment. That is paid on *every* lookup, to
save a group visit that was already rare. Two-bit counters filter best of all on a fresh table (1.3%
continue) and are the worst under churn. Their maximum of 3 is reached all the time, and a saturated
counter never comes back down. A byte per class is the point where the counter is a single aligned
load and still knows the class.

Two more variants on the same axis. Reading a *different* class's counter at each step of the probe,
`(fingerprint + step) & 7`, changes exactly nothing. The arithmetic says it must: a displaced
sibling adds the same step as the miss does, so if they agree at step 0 they agree everywhere. Three
fresh hash bits per step do break that, and take the churned miss from 1.262 to 1.238 groups. That
still measures as noise, because it is 2% of the probe work on a path only 17.5% of churned misses
reach.

The fifth point on this axis comes from [Verstable](#verstable): an **exact** test. That would be a
second set of eight counters per group. They count "keys of class *c* whose home *is* this group and
that did not fit". This is Verstable's in-home bit generalised. I did not build it. Instead I
computed the exact answer offline, by hashing every key in an instrumented table. At load 0.763 after
200 turnovers it takes a churned miss from 1.159 to 1.134 groups, and at load 0.793 from 1.242 to
1.201. **About 80% of the misses that the approximate counter fails to stop are caused by
siblings**: keys whose home really is this group and that really did not fit. Both tests say
"continue" for them, and both are right. Being exact only removes the rest.

Scaled from what `move_home` is worth per group it saves, the exact counter would make a churned miss
6 to 7% faster, and do nothing on a fresh table. It costs eight more bytes per group (88 to 96), a
write to the home group on many inserts and erases, and a second counter that has to stay
consistent with the first. I did not take it, but the gap is larger than I first thought, so it is
on the list of [open questions](#still-on-the-table).

## From folly F14: double hashing instead of a triangular probe {#from-f14-probe}

The other idea worth taking from [F14](#f14) is its probe sequence, and it targets a real weakness of
the group index. With a triangular sequence, every key whose home is group *g* walks the same
groups, so a [sibling](#counters-by-class) sits exactly where a later miss for *g* will look.
Double hashing breaks that, because two keys of the same group get different steps.

It does what it promises. I tried the step from bits 8 to 15 of the hash, and later folly's own
`2 * fingerprint + 1`. Odd steps keep the property that every group is visited exactly once, which
the miss bound needs:

*Groups read per lookup, 4,096 groups, triangular probe followed by double hashing, churned tables
after 200 turnovers with random keys.*

| load | fresh miss | churned hit | churned miss |
|---|---:|---:|---:|
| 0.76 | 1.052 to **1.036** | 1.136 to **1.113** | 1.265 to **1.174** |
| 0.799 | 1.086 to **1.054** | 1.204 to **1.162** | 1.432 to **1.268** |

In time, one header per binary: misses on a churned table get 1.07 to 1.18x faster, depending on
size and compiler, and the suite is within 0.1%. The cost is a fresh integer hit, up to 5% slower under
clang, and 3.6% (clang) to 7% (gcc) more instructions on the suite's integer find.

Where those instructions come from is the interesting part. The triangular walk only needs the group
and the step counter. A step computed from the key is a third value that has to stay in a register
during the walk. For an integer key the compiler computes it before the home group is even
compared, so the hit path pays for it. I tried seven probe sequences and five ways to compute the
step. Every one of them either keeps that third value alive or makes the compiler generate
something worse. All of the gain is in the first step after home: a full group sending all its
overflow to the one next group is what makes a churned walk long.

**So the triangular sequence stays, as a trade I declined, not as a dead idea.** It costs every
integer hit a little to make churned misses faster. A probe sequence whose step needs no extra value
would change that.

The first version of this post said double hashing was 9% slower on integer misses, and that the
probe had "nothing left to win". Both came from the paired harness and from a churn harness that used
sequential keys, and neither survived the measurement above.

## From emhash8: a second fingerprint in the unused index bits {#from-emhash8}

[emhash8](#emhash8)'s free fingerprint is the most tempting idea in this post, because
unordered_dense's value index is also a `uint32_t` with unused high bits, and it is also loaded on
every hit. Eight bits there cost nothing until a table has more than 2^24 slots.

It measured **2.5% slower** on the suite, and the losses are exactly on lookups: find 9%, find with
64 byte values 8%, random hits 7%, churn 8.5%. A filter only pays where nothing cheaper has filtered
first. For emhash8 the fingerprint is free, because it has no group-level fingerprint and has to
read the word anyway. In the group index the 16-way fingerprint compare has already rejected
everything it is going to reject. A second check only adds an xor, a shift and a compare to the
dependent chain of every lookup. All it saves is a value access on the few lookups with a
fingerprint collision.

## From indivi: the counters, and the nibbles that did not follow {#from-indivi}

The counters are [indivi](#indivi)'s, and little changed in the copy: the same fingerprint word
table with 0 remapped to 8, the same per-class counters with their decrement on erase. Two things
differ. unordered_dense keeps the counters in the same block as the value indices. And it has the
probe bound, which indivi lacked until [I reported it](https://github.com/gaujay/indivi_collection/issues/2):
`find_impl` looped on `gIndex <= mGMask`, which the mask makes always true. indivi has had the bound
since September 2026.

The distance nibbles did not follow, and I measured them before dropping them. In unordered_dense
they need a back-pointer per value, the slot that points at it (four more bytes per entry), plus
indivi's distance nibbles. With both, `erase(iterator)` needs no hash at all. On the one workload
they are for, find, then `erase(it)`, then insert, on a reserved table:

- with `std::string` keys, **1.10x faster**: 1,006 to 888 instructions per round, one hash and two
  probes less.
- with `uint64_t` keys, **1.10x slower**: 352 to 363 instructions per round. The saved hash is eight
  instructions, and maintaining the back-pointer on every insert costs more than that.
- on the suite, where every erase is by key and the back-pointer can only cost: 4% slower overall,
  integer build 1.20x slower, build with 64 byte values 1.12x, integer churn 1.11x.
- memory: 38 MB instead of 31 MB per million entries with an 8 byte value.

So it is a real win for a real pattern. But the pattern needs an expensive key *and* an erase by
iterator, and a program with both can call `erase(key)` and pay the hash once.

**I tested the back-pointer alone again where it should help most, and it still did not pay.** An
erase hashes the key of the moved element, which costs about 50 ns for a string, the largest
avoidable cost I knew of in the library. The suite above only has string tables that fit in the
cache, where that second hash is cheapest. So I measured it at larger sizes. Erasing a string key is
**9 to 11% faster at every size** with the back-pointer, and the time saved grows with the table: 5.4
ns at 50,000 entries, **40.8 ns at four million**. Unfortunately every erased element had to be
inserted first. The back-pointer costs every insert a store, and the value vector a second array to
grow. The integer build gets 6.9 to 23.3% slower. **Churn comes out even**: it erases one and
inserts one, which is what a real cache does. The gain on the erase and the cost on the insert are
the same size.

## From abseil: a per-table seed {#from-abseil-seed}

[abseil](#swisstable) mixes a seed of its own into every hash. Its stated purpose is a random
iteration order per table. A side effect is that keys chosen against a known hash do not line up
the same way in every table. **unordered_dense 5.0 does not have one.** I built it as a prototype,
and this section is what the measurement said.

In the prototype `mixed_hash` returned `hash ^ m_seed`, with the seed scrambled from the table's own
address, so two tables differ and ASLR makes two processes differ. One map per binary at 50,000
entries, that costs **one instruction and zero cycles** per lookup: 21.4 against 21.4 cycles on a
miss, 29.6 against 29.6 on a hit. On a *build* it costs 3.5%, 7.13 to 7.38 ns per element, because
the pipelined rehash waits on latency and the xor sits between the hash and the group address.

To make it a feature and not a patch, the seed has to travel with the index it built, through both
allocator-aware constructors, both branches of the move assignment, the copy assignment and `swap`.
That is six places, and the test suite failed in 85 places until all six were right, which says
something good about the test suite. Eleven tests then still failed. Ten check that `mixed_hash`
returns an avalanching hash *unchanged*, which a seed contradicts on purpose, and one steers keys into
specific groups. And iteration order is no longer reproducible between runs.

So it is not in unordered_dense 5.0. Everyone would pay for it, and not everyone has an adversary.
abseil decides the other way, which makes sense for a library used at a scale where somebody always
feeds it bad keys. If you need it, you can pass a seeded hash yourself. The map takes the hash as a
template parameter. It uses its result as is if the hash declares `is_avalanching`, and mixes it
otherwise.

## From boost: cache-line-aligned value indices {#from-aligned}

Boost's groups are 16 bytes and aligned, so they never cross a cache line. I measured the same for
the value indices, while they were still a separate array. A group's 16 indices are exactly 64
bytes. glibc returns large allocations at an address that is 16 bytes past a multiple of 64, so
*every* group's indices crossed two cache lines. A 64 byte aligned type for the index array made
lookups 2% faster, and builds and churn 4 to 5% slower, for a net **0.7% loss** on the suite. The
likely reason is cache conflicts: with both arrays at power-of-two offsets, a group's metadata and
its indices land in the same cache sets more often. Since then the indices live in the 88 byte block,
so this question no longer exists in this form.

## From CPython: a value index narrower than 32 bits {#from-cpython}

[CPython's compact dict](https://mail.python.org/pipermail/python-dev/2012-December/123028.html)
picks the size of its index from the table size: one byte, two, four or eight. The equivalent here is
a group type with a `uint16_t` index, which makes the block 3.5 bytes per slot instead of 5.5 and
puts two groups' indices in one cache line. On the 13 workloads of the suite that fit below 2^16
entries it is **1.4% slower**. Only random integer hits (3% faster) and string finds (2%) gain, and
churn and finds with 64 byte values lose 3 to 4%. The reason also rules out the adaptive version. A
table small enough for 16 bit indices has an index of at most about 450 KB, which is already in L2.
Making it smaller buys nothing. Each narrow load also costs a zero-extension, and the tables whose
index size really hurts are exactly the ones that need more than 16 bits.

## From abseil and flat_wmap: a window instead of a group {#wmap-steal}

Comparing two people's maps cannot separate the window from everything else that differs between
them. So I built both layouts on top of one implementation: the same value vector, hash, fingerprint
encoding, load factor, tombstones, growth, erase and SSE2 code. Only the home (a group or a slot)
and the probe step differ. One variant per binary, and both were checked against
`std::unordered_map` before anything was timed.

**The window wins a lookup at the branch predictor, not in the cache.** At 200,000 entries it needs
one to three fewer instructions and three to four fewer cycles per lookup, and has **16% fewer branch
misses** on both a hit and a miss. It has *more* L1 misses while doing so, because an unaligned 16
byte load can cross two cache lines where an aligned one cannot. In time, hits are 1 to 5% faster.
Misses look better too, but only against this baseline. Neither variant has overflow counters (the
window has no group to put them in), so both stop a miss on an empty slot, where [the shipped
index](#group-index) stops on a counter at home. Against that, close to nothing is left on a miss.

**And it loses churn, for a reason I did not expect.** At a million entries the window ends a churn
run with one extra doubling of the table and 24% slower churn. The reason is that **only 15.8% of
its inserts reuse a tombstone, against 33.8% for the grouped variant**. To check that this is the
cause, I gave the *grouped* variant a starting lane that depends on the key, instead of always using
the lowest free lane, and changed nothing else. Its reuse dropped to 16.3%, and it ended with the
same table size as the window.

**That is the opposite of what I expected.** Spreading the preferred lane destroys the reuse of
tombstones instead of reducing contention, so contending on one lane is the *feature*. A tombstone
appears where a key was. If every key in a group prefers lane 0, lane 0 is where the tombstones are,
and the next insert lands on one instead of using a fresh slot. A window cannot do that, because its
first lane is the home slot, which is different for every key. The group index does not care either
way: it has no tombstones, and it compares all 16 lanes at once, so the lane a key lands in never
changes a lookup.

**So: no.** Without groups there is nowhere to put per-group counters. Without counters a miss has to
stop on an empty slot, which means tombstones, which is exactly what churn punishes. A window would
also break up the 88 byte block, since 16 fingerprints that start at any slot are not stored together
with their indices any more. That block is worth 7% of a lookup's instructions and 28% of its dTLB
misses at four million entries. A few percent of a hit does not pay for all that.

# 19. Building the group index: growth, the compiler, the hash [&#8593; contents](#contents){:.up} {#building}

This chapter is about unordered_dense 5.0 more than about its index: how it grows, what the two
compilers do with it, and which hash it uses. You do not need it to understand the group index, but
it explains where the build and lookup times of [chapter 15](#same-workloads) come from.

## Growth: the pipelined rehash {#pipelined-rehash}

Only growth rebuilds the index, because nothing degrades in a way that needs a repair rehash. When
the maximum load is reached the block array doubles and every entry is placed again. That is the
cheap half of the map, because **the values do not move**. `m_values` is not touched, and the loop
only writes a fingerprint byte and a 4 byte index per entry. A flat map moves every `value_type`
into a new hashed slot. Per element rehashed, at a million `uint64_t` entries, measured
with `perf stat`: boost needs 97.5 instructions and 110.9 cycles, unordered_dense **51.9 and 46.7**,
with the same 3.7 to 3.8 L1 misses. Most of that difference comes from the dense layout, not from a
clever loop.

The loop itself has it easy, for two reasons that come from the group index and not from the dense
vector. Placing an entry never shifts another, so entries can be placed in **any order**. And every
key is known to be unique, so no key is ever compared, and the value vector is only read to hash the
keys. What is left per element is a hash and a walk to the first empty lane:

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

The counters come out of the same walk. An entry that passes a full group increments that group's
counter for its class, exactly as an insert does. So the counters are rebuilt by the pass that
places the entries, and there is no second pass.

The two halves of each element want opposite things. The hash is a chain of dependent instructions
that would like to run far ahead. The placement is a random write into an array that may not be in
the cache. Done one element at a time, each waits for the other. So the loop keeps **a ring of 16
hashes** and stays that far ahead of itself. Before it places element *i*, it hashes element *i* +
16 and prefetches the first two cache lines of the block that element will land in.

```cpp
auto const fetch = [&](std::size_t i) -> void {
    auto const mh = mixed_hash(get_key(*it));
    ++it;
    ring[i] = mh;
    prefetch_block(groups, static_cast<std::size_t>(mh >> shifts));
};
```

In the cache, decoupling the two halves is worth **1.26x** on its own (2.05 to 1.63 ns per element at
200,000 entries). Out of the cache what pays is the prefetch, and only when the hash takes long
enough to hide the cache miss behind. A string rehash at four million entries goes from **30.6 to
12.4 ns per element**. An integer rehash at 176 MB goes from 12.6 to 12.5, so nothing. That loop is
not waiting for memory latency but for the TLB, with 1.15 dTLB misses per placement on 4 KB pages.
No prefetch hides a page table walk. Below 200,000 entries the ring costs a little in one size
band: a gcc integer build up to 4.2% slower between about 40 and 500 KB of index. It stays anyway.

The TLB is the one thing left in this loop, and it cannot be fixed inside it. Sorting the elements
by the top bits of their target group first, as databases do, cuts the dTLB misses to 0.24 per
placement. It nearly halves the loop at four million entries (10.29 to 5.34 ns per element).
Unfortunately, inside a build it is worth 0 to 7% above 32 MB and nothing below. The reason is
that a rehash is a small part of a large build. Also, the scratch memory it needs is fresh memory
that has to be faulted in, at about a microsecond per page, every time the table doubles. I did not
keep it. What the loop
wants is 2 MB pages, which is [the optional allocator](#huge-pages), and a library cannot ask for
those on the caller's behalf.

Two details of how the loop is written come from the same fact about aliasing. It walks `m_values`
with an **iterator** instead of an index, and it holds the group pointer, the mask and the shift in
local variables instead of calling `place_group`. Placing an entry stores a `std::uint8_t`
fingerprint. A byte store may alias any object at all, including the value vector's own data
pointer and everything else reached through `this`. So after each placement, an indexed read has to
load that pointer again before it can compute the address of the next key. That made the whole
rehash wait one memory latency per element, because the random group access cannot start before that
load. With the iterator, the growth phase went from **10.43 to 2.74 ns per insert** under clang, and
a build of 200,000 elements from 16.72 ms to 8.96 ms. gcc did not move at all, because it had already
worked out on its own that the pointers do not alias.

A lookahead like this sounds like something every map would have, but as far as I can see none of
the others does. Folly prefetches the *source* values of the chunk it is about to hash, and then
places them one at a time. abseil's growth moves the elements that stay in their home window of the
doubled array straight across. It collects the others in a buffer for a second pass, so nothing is
hashed twice. Boost, indivi, emhash8, emilib, Verstable and ihtab hash and place one element at a time
with no prefetch at all. I ported the ring into a copy of boost's rehash. It is the same speed or
slower there, except for a 1.5x gain for gcc at 200,000 integer keys, which comes from different code
generation and not from the ring. The instruction counts above say why: boost's loop is not waiting
for a load, it does twice the work. So most of the win here comes from the map being dense, and the
rest from a loop that has nothing to wait for.

## What the compiler decides {#compiler}

Two of the largest single numbers in unordered_dense 5.0 are not design changes at all.

`probe` is marked force-inline, because **gcc does not inline it in a large translation unit**. gcc's
budget for code growth in one unit runs out, and the probe is what it stops inlining. The whole
design assumes the probe is inlined: the prefetch and the early exit only pay inside the caller.
With the attribute, gcc's lead over 4.11.0 on the suite went from 1.15x to **1.24x** with SSE2, and
from 1.10x to 1.17x without. clang measures the same either way, because it inlined it already.

clang also leaves the insert path out of line where gcc inlines it. Per insert on a reserved table
at 50,000 entries, one map per binary, unordered_dense 5.0:

| compiler | unordered_dense, insert | boost, insert | unordered_dense, `operator[]` on a present key |
|---|---|---|---|
| clang 22 | 96.4 instructions, 33.8 cycles | 82.9 instructions, 21.3 cycles | 84.7 instructions |
| gcc 16 | 67.5 instructions, 25.0 cycles | 57.0 instructions, 16.9 cycles | 90.9 instructions |

**The obvious explanation is that clang saves the probe's registers at function entry where gcc only
saves them on the rare path. It is wrong, and counting the instructions showed it.**
`valgrind --tool=callgrind --dump-instr=yes` counts every instruction, and the first line of that
count is the answer. clang pays **15 instructions of function prologue and epilogue per insert** (six
pushes, six pops, a stack adjustment on each side and a `ret`, plus the call), where gcc pays one.
And **clang pays the same 15 on boost**. So this is not about this map's probe, it is the cost of
the function call itself.

**A profile removes all of it.** Built with profile-guided optimization, clang goes from 96.4 to
69.3 instructions per insert (and from 34.0 to 17.5 cycles in that run), and boost from 82.9 to
57.8 instructions. gcc, which had already inlined, gains nothing. After PGO, clang and gcc execute
the same work on this map. So the instruction gap between clang and gcc is a missing profile and
nothing else, which is why the six source changes I tried against it did not move it. A header
library cannot ship a PGO build, but at least this says where not to look next.

**What is left is about 11 instructions**, unordered_dense against boost: 69.3 against 57.8 under
clang with PGO, and 67.5 against 57.0 under gcc. That is the second walk. unordered_dense first
probes to find that the key is not there, and then walks again to find the empty slot. Boost's probe
instead returns the position to insert at.

**And that is an in-cache result only.** At four million entries the two are within 3% on both
compilers, with unordered_dense at 0.80 dTLB misses per insert against boost's 1.37. A **string**
insert turns it around: 491 instructions under clang against boost's 454, and **27.3 ns against
34.9**, 21% faster with 8% more instructions.

**I removed the `always_inline` on the placement once, based on a measurement, and put it back the
same day based on a better one.** The suite compiles about 90 test files into one benchmark binary.
That is the largest translation unit anyone compiles this header into, and its inlining budget is
already used up. So an `always_inline` there pushes something else out: the suite measured 1.7%
(clang) and 3.9% (gcc) faster *without* the attribute. A real program's translation unit holds one
map. Measured that way, building from empty, clang:

*One map per binary, build from empty, unordered_dense 5.0, clang 22. Lower is better.*

| entries | with the attribute | without | instructions with | instructions without |
|---:|---:|---:|---:|---:|
| 32,000 | **251,633 ns** | 287,833 ns | **5.08M** | 5.98M |
| 200,000 | **1,749,840 ns** | 2,087,600 ns | **28.09M** | 33.71M |
| 1,000,000 | **13,064,800 ns** | 15,670,600 ns | **162.3M** | 190.4M |

**14 to 20% slower without it at every size**, with 17 to 20% more instructions. The instruction
counts settle it, because neither code layout nor noise can move them.

Moving the attribute one function outward, to `do_try_emplace`, changes nothing: the binaries
differ, the measurements are identical. The outermost function without the attribute is the one that
pays the call, and there is always one. You cannot inline your way into the caller's loop from inside
a header. 5.1 and 5.2 changed the shape of the insert path since: the hit and the common placement
are now inlined into the caller, and only the walk past the home group is a call. Measured again on
that shape, the attribute makes clang's integer build 1.19 to 1.22x faster, and changes nothing for
gcc.

So the rule this leaves is narrower than "one map per binary": **the size of the translation unit
decides what an `always_inline` is worth. A benchmark binary is often the largest unit anyone
compiles a header into. And an instruction count is the only number in the argument that none of it
moves.**

## The hash it is given {#the-hash}

A hash for a map should be chosen for **latency**, not throughput. Its result is the address of
the group to probe, and nothing after it can start until it is there. That sounds
obvious, and it changes the ranking of hashes by more than 2x. An AES-NI based hash was a quarter
faster in a hashing loop, and needed 1.10x to 1.59x the time on every workload inside
unordered_dense. The worst case is a random hit, which cannot overlap with anything. The mildest is a
build, whose rehash hashes 16 elements ahead. With one hash per binary and 30 million all-hit
lookups, AES executes **fewer instructions** (5.15G against 5.35G) and takes **59% more cycles**. That
is a dependency chain, not extra work.

**So unordered_dense uses its own hash, derived from wyhash and rewritten for latency.** It does not
produce wyhash's values any more, and 5.0 renamed it accordingly (`detail::hash_bytes`). Compared to
upstream wyhash there are four changes, all of them shortening the dependent chain rather than
removing work:

- **8 to 16 bytes: two overlapping 8 byte reads**, instead of building two words out of four 4 byte
  reads and shifts. That one is [rapidhash](https://github.com/Nicoshev/rapidhash)'s.
- **17 to 144 bytes: every 16 byte block mixed on its own**, with its own pair of secrets, and all
  of them combined with xor before one final mix. wyhash chains the blocks through `seed`, so a 48
  byte key used to be three multiplies in a row before the final mix could start. Now it is one
  multiply plus the final mix at any length in that range.
- **Above 192 bytes: six independent lanes** instead of three, so the chain of multiplies over a
  long key is half as long.
- **An independent tail** above 48 bytes: the last 16 bytes are mixed from secrets alone, so that
  work runs next to the lanes instead of after them.

Three of those were already in 4.x. 5.0 added the independent blocks from 17 to 144 bytes. None of it
drops a multiply. The block range is two dependent multiplies, and the second one only exists to fix
the bits that a single product leaves weak. Removing it fails an avalanche test at every length, so
it stays, even though it is on the critical path.

Here is what that is worth against the hash each other library ships. Same keys, same process, every
hash interleaved round by round. Latency is measured by writing one byte of each result into *the
next key before it is hashed*, so no two hashes can overlap and each one waits for the last.

*Latency in ns per hash, lower is better, bold is the fastest at each length. `mix` uses the keys of
the string workloads, 8 to 135 bytes and mostly short, so the length dispatch is as unpredictable as
in a real table. Every number includes the cost of the chain itself, which a hash that does no work
(`size ^ first byte`) measures at 1.51 to 1.55 ns. Median of three runs in fresh processes, which
agreed within 0.9% in every cell.*

| hash | 8 B | 16 B | 32 B | 64 B | 128 B | 256 B | mix |
|---|---:|---:|---:|---:|---:|---:|---:|
| unordered_dense 5.0 | 5.60 | 5.59 | 5.99 | 6.41 | **7.33** | **9.50** | **6.29** |
| unordered_dense 4.11.0 | 5.58 | 5.59 | 6.74 | **6.29** | 8.68 | 9.50 | 6.94 |
| `absl::Hash` | **5.23** | **4.84** | **5.03** | 6.98 | 8.66 | 11.14 | 6.35 |
| `boost::hash` | 6.16 | 9.55 | 10.02 | 10.68 | 12.27 | 18.91 | 9.48 |
| `folly::hasher` | 8.02 | 13.06 | 13.08 | 17.83 | 27.51 | 32.52 | 15.51 |
{: .heat-low}

[![Latency of five string hashes against key length, 4 to 1024 bytes: unordered_dense 5.0 and 4.11.0, absl::Hash, boost::hash and folly::hasher](/img/2026/hashmap-index/hash-latency.svg)](/img/2026/hashmap-index/hash-latency.svg)

The shape is a staircase, because every one of these hashes picks a different code path depending on
the length. The steps are where they switch: boost and folly at 16 bytes, unordered_dense at 16
and then every 16 bytes up to 144, abseil at 32. The marked band is where the keys of the string
workloads are, which is also where most real keys are. Everything to the right of it matters more for
a hash benchmark than for a map. The two slow lines leave the top of the chart near the end: at a
kilobyte boost is at 66.9 ns and folly at 59.7.

Minus the cost of the chain, on `mix`: **4.8 ns for unordered_dense's hash and for abseil's, 5.4 for
4.11.0's, 8.0 for boost's and 14.0 for folly's**. Every percentage below is net of that chain cost.

**`absl::Hash` is the one to beat, and up to 32 bytes it wins.** Its latency is 9 to 22% lower than
unordered_dense's at 8, 16 and 32 bytes, and 12 to 23% higher at 64, 128 and 256. On `mix`, which is
mostly short keys, the two are the same within noise. That is why abseil's own-hash control rows in
[the workload tables](#same-workloads) barely move.

**`boost::hash<std::string>` takes 1.7x as long**, and that is the whole of boost's own-hash column.
It turns a map that is 13% faster than unordered_dense on a string hit into one that is 15% slower.
Boost's index is excellent, and its default string hash is what a caller actually gets.

**`folly::hasher<std::string>` takes 2.9x as long**, which surprised me. It is `SpookyHashV2`, a 2012
design built for throughput on long inputs, and F14 uses it for every string key unless you pass a
different hash. Of these five it has the highest latency at every length I measured, twice boost's at
128 bytes.

**And the latency rewrite in 5.0 is worth 12% on `mix`, all of it between 17 and 144 bytes.** 4.11.0
is the same below 17 bytes, where the short path did not change, and the same at 256 bytes, where the
lane loop did not change. The 17% at 32 bytes and the 23% at 128 come from the independent blocks
alone. It also lost 3% at 64 bytes, the price of mixing a block that the chained version would have
folded into the seed for free.

In throughput the order is the same, with wider gaps: on `mix`, 2.22 ns for unordered_dense's hash,
2.25 for abseil's, 2.37 for 4.11.0's, 4.48 for boost's and 8.80 for folly's. That is what most hash
benchmarks report, and it is not what a map pays.

**One warning about measuring this**, because I got it wrong first. Four more latency tunings (fewer
length branches, the length out of the final mix, and both together) looked like a clear win in a
standalone benchmark: 1.40x, with clang and gcc agreeing to 0.02 ns. Inside the map they were worth
exactly nothing. That benchmark made lengths unpredictable by chaining through the *choice of key*,
`x = hash(keys[x & mask])`, which puts the key's **length and address** on the dependency chain. A
real lookup has no such dependency, because the caller already holds the key: its length is known
before hashing starts, and only the bytes have to be loaded. The table above chains through the
key's *contents* for that reason.

# 20. What is still open [&#8593; contents](#contents){:.up} {#still-on-the-table}

Things I know are worth something and have not done, all about my own map.

**Ten instructions per hit, and I do not know where they go.** At 50,000 entries, all hits, one map
per binary: `indivi::flat_wmap` executes **50.1 instructions** per hit and unordered_dense 5.0
**60.5**. The gap holds at 1,000 entries and at a million. Part of it is structural and is not coming
back, since the value index is a load a flat map does not do. The rest is one byte of metadata per
slot against 5.5, no counter on the path, and addressing by slot instead of by group and lane. At
2.03 instructions per cycle, ten instructions are about 5 of the 29.8 cycles of a hit in cache, so
roughly 17%. I looked at the probe sequence and at the alignment of the window, and both were dead
ends. If there is an answer, it is in the instruction stream.

**Inlining is not it**, which is the first guess, and I measured it twice: force-inlining the lookup
moves cycles and leaves the instruction count where it was. The register allocator is not it either.
The clang/gcc gap on the insert path looked like a register allocation problem, and turned out to be
[the function call](#compiler), which a profile removes completely. The cheap experiment left is to
build both maps under gcc, one per binary, and I have not run it.

**A churned miss.** The group index probes 1.27 groups per miss at load 0.76 after long churn,
against 1.05 fresh. Two things are known to help: double hashing makes such a miss 1.07 to 1.18x faster, and
an exact in-home counter would take an estimated 6 to 7% off. Both cost something everywhere else,
and I [declined double hashing](#from-f14-probe) for that. The exact counter was never built and
timed, and it should be before I call the counter design finished.

**Prefetching on ARM.** Boost tunes its prefetch per architecture, and says so in a comment: *"ARM
architectures get a higher speedup when around the first half of the element slots in a group are
prefetched, whereas for Intel just the first cache line is best."* unordered_dense issues the same
two prefetches everywhere. On x86 I found nothing to tune: dropping either one is within 3% on both
compilers, at every size from 50,000 to 16 million entries. ARM is not measured.

# 21. What reading twelve index designs changed my mind about [&#8593; contents](#contents){:.up} {#changed-my-mind}

Four things, and none of them is the one I expected.

**A fresh miss is nearly finished. A churned miss and the hit are not.** Stopping a miss early is the
question every design in this post is built around. With a 16-slot compare and an explicit test for
"did a key of my class overflow past here", a probe on a fresh table reads 1.03 to 1.09 groups. That
part is done. After long churn it is 1.27 groups per miss at load 0.76 and 1.43 at 0.8, so that part
is not. `move_home` takes much of it back, double hashing more, and both cost something elsewhere.
The first version of this post said the miss was finished, on numbers from a harness that churned in
sequential keys. And on a **hit**, the simplest index in this post executes [50 instructions where
mine executes 60](#still-on-the-table), and I cannot explain the difference.

**What the twelve designs agree on, if you write one.** Four things pay off in every map here that
has them. Compare **16 slots at once** instead of one. That turns a probe from a series of coin flips
into one question. It is worth more than any probe sequence, any fingerprint width or any other
tuning in this post. Answer "absent?" **explicitly**, with an overflow bit or a counter, instead of
looking for an empty slot. Between otherwise similar SwissTables, that is
[1.4 to 1.7x of a miss](#integer-keys). Do not leave **tombstones or overflow bits** behind if the
table will churn at a fixed size. Boost is the best of the designs that leave something behind, and
it still [rebuilds itself every
120,000 to 150,000 erase-insert pairs](#boost-erase). The failure mode of the family is [a table
that grows while its live count stands still](#ixhtab). And **bound the probe**, because a design
that stops only when its own metadata says so will not stop at all on keys chosen to defeat it. [Two
maps in this post](#miss-bound), mine included, were missing that bound until recently.

**What survives a second measurement is not what I would have guessed.** The structural differences
never moved. Iteration differs by an order of magnitude. With a 64 byte value, memory differs by 1.4x
allocated and 3x resident between the leanest node map and the fattest flat map. A design that
leaves tombstones is a different *curve* under fixed-size churn, not a different constant. The
differences between two maps of the same family are 3 to 15%, and those do move. In this post the
paired harness got the sign of two changes wrong: the per-table seed and double hashing. A churn
harness with sequential keys showed a quarter of the real drift. All of it was in exactly that range.
That is the uncomfortable part of publishing this, and also the useful part: **the family is a
decision you can make from tables like the ones above. Which map inside the family is one to measure
on your own workload, or not to bother with at all.**

**Which index is fastest is not the question I would ask any more.** I would ask which one I can
still reason about when it churns, when the hash is hostile, when the values are large, and when the
table no longer fits in the cache. Those are the four places where the ranking changes, and each of
them changes it differently. [Question by question](#question-by-question) is as close to an answer
as I have.

This got a lot longer than I planned when I started reading headers, and the rewrite did not make it
much shorter. Everything here is one machine and two compilers, so the small numbers are mine and
not necessarily yours. Nevertheless, maybe you have learned a trick or two, or come up with a better
idea than any of the twelve.

# 22. How the numbers were made [&#8593; contents](#contents){:.up} {#how-measured}

Everything was measured on one machine: a Ryzen 9 7950X, Fedora, clang 22.1.8 at `-O3 -DNDEBUG
-std=c++20`, and **default `-march`**, so plain x86-64 with SSE2 and nothing newer. C++20 is the
benchmark's choice, not any library's: F14 needs it, so every map gets it. The `-march` matters. On
this machine `-march=native` silently turns these SSE2 intrinsics into AVX-512 (`vpcmpeqb` into a
mask register, no `pmovmskb` at all). A profile taken that way is not the code most programs run.

**Every map gets the same hash**, unordered_dense's own, because what is compared is the index.
Each library has its own way of being told that a hash is already well mixed, and I had to use
each one. Boost and unordered_dense read a member typedef `is_avalanching`, folly reads
`folly_is_avalanching`. Without folly's, F14 adds its own mixing step in front of every lookup (a
multiply at the default `-march`, CRC32 with SSE4.2). So it no longer runs the same hash as
everyone else. abseil mixes its per-table seed into every hash, which a caller cannot turn off, and
does no other mixing.

**Boost and abseil also appear with their own hash**, as a control. "Same hash for all" is the right
way to compare indexes, and it is *not* what a caller gets by writing the type name. For an integer
key `absl::Hash<uint64_t>` is much cheaper than unordered_dense's hash, and `boost::hash<uint64_t>`
about the same. For a string it goes the other way.

**Every ratio is a geometric mean over five sizes spread over one doubling**, for the reason in
[chapter 2](#sawtooth). Two maps with different maximum loads double at different sizes, so a
comparison at one size compares random points of two cycles. Five sizes are enough for two versions
of the same map, where the cycles are in phase. Between different maps, a later sweep of 50 sizes
showed that five sizes can be off by up to a quarter on churn and a few percent on lookups. If you
compare maps of different designs, use more sizes.

**The maps run interleaved.** [nanobench](https://nanobench.ankerl.com)'s `compare()` runs one round
of each map in turn, in one process. A changing clock speed or a noisy neighbour then hits all of
them and cancels out of the ratios. Measuring map A to the end and then map B is how two runs of
*identical* code once came out 140% apart in an earlier version of my own tool.

**Five independent runs of everything, combined by the median.** Not the mean: one bad run would
pull the mean, and finding bad runs is what the extra runs are for. One did turn up. Integer
`insert/erase` at 32,000 entries read 29.44, 24.52, 26.82, 26.64 and 26.73 ns on the map itself.
That is a 20% spread where its twenty neighbours span 2%, and the first two runs were the two
extremes. To say how much the medians can be trusted, I recomputed every ratio with one of the five
runs left out.
**Leaving out any one run moves no integer ratio by more than 4.3%, no big-value ratio by more than
3.0%, and no string ratio by more than 6.8%.** Strings vary more because a string workload spends
most of its time in the hash and the allocator. I would not defend any single number in this post
to better than 5%.

**Anything below 10% is decided with one map per binary, and hardware counters.** A binary with
several maps has a code layout that changes whenever any of them changes, by more than the effect
being measured. I have seen a control that does not touch any map read 8% slower in one run and 13%
faster in the next. `scripts/ab/maps_one.cpp` builds one binary per map and workload for that reason,
and every "instructions per lookup" number in this post comes from it.

**The size of the translation unit is a variable too, which I learned the hard way.** The workload
tables put 16 maps and 2 control rows into one unit, the benchmark suite of unordered_dense compiles
about 90 files into one, and a program usually has one map plus its own code. Those are three
different inlining budgets, and a function close to the compiler's limit compiles differently in
each. Take [one `always_inline` in unordered_dense](#compiler): removing it made the suite 1.7 to
3.9% faster, and made a build in a unit with one map 14 to 20% slower. So the build column of [the workload
tables](#same-workloads) is not quite what a program gets from any of these maps, mine included.
Where a number in this post decides something, I used the instruction count instead of the time,
because the unit cannot move that.

The clearest example of that is [abseil's per-table seed](#from-abseil-seed). Paired, two headers in
one binary, it read **6% slower on builds, 6% on random misses and 3% on random hits**. Three
workloads all pointed the same way, which is exactly what a real regression looks like. One map per
binary says it costs **zero cycles** on both lookups. The control in the same paired run, a hash
benchmark that never touches a map, read 2.7%. If I had stopped at the paired numbers I would have
reported a 4% lookup regression that does not exist. Its 3.5% on a build is real, and part of why I
did not take the seed.

**The lookup workloads measure throughput, not latency.** Each lookup draws its key from a random
number generator, so several lookups run at the same time. A program that looks up in a loop gets
the same overlap, which is why I measure it this way. A dependent chain of lookups is a different
number, up to 3x slower on a flat map at a million entries, and [the corrections](#errata) have both.
The ratios between maps are still fair, because every map is measured the same way, but the two
measures do not rank the maps the same.

**No workload repeats a sequence.** The state of each lookup's random number generator carries over
between rounds. If a benchmark's batch of keys per round is small enough to memorize, the branch
predictor learns its hit-or-miss pattern. That flatters the design with the most branches. I
measured that at **2.7x** on a scalar robin hood probe, enough to reverse a ranking. I made this
mistake twice in two different tools.

**Churn uses random keys.** A churn loop that recycles its keys soon after erasing them under-reports
the drift by half, because a key that comes back soon tends to land in the home it just left. A churn
loop that inserts *sequential* keys under-reports it even more, because the hash spreads sequential
numbers almost perfectly evenly over the groups. Two of my probe-length harnesses did that, and the
first version of this post quoted a quarter of the real drift because of it.

**Memory is measured twice, because there are two reasonable answers.** `count_alloc.h` intercepts
`malloc`, `calloc`, `realloc`, `aligned_alloc`, `posix_memalign` and `mmap`, and counts what the map
allocated and did not free. It charges `malloc_usable_size` plus glibc's eight byte header instead of
the requested size, because counting the request makes every node map look cheaper than a dense one.
All six functions matter. emilib calls `malloc` directly, so counting only `operator new` reports it
at zero. Missing `aligned_alloc` reports ihtab at 8.3 bytes per entry instead of 35.3. `max_rss.h`
reads `VmHWM` in a forked child instead, which is what the kernel actually provided. The fork is
needed: glibc does not return a grown heap, so a second fill in the same process reuses resident
pages and reads far below what the map allocated. The tool's own overhead is subtracted too. The
fork and the reads of `/proc` fault in about 128 KB. That is 0.5% of a half-million entry table, and
128 bytes per entry of a thousand-entry one. That is why there is no thousand-entry memory column.

**And the allocator is tamed.** `mallopt(M_MMAP_THRESHOLD, 64 MB)`: a build from empty asks for
megabytes and returns them. glibc gives anything above its threshold back to the operating system,
so a benchmark that repeats the build faults in the same pages every time. That was 38% of the
cycles spent in the kernel. It is worse than noise, because whether it is paid depends on what ran
before in the same process.

To reproduce any of it, from the unordered_dense repository:

```sh
# every map, every workload, three octaves, interleaved in one process
scripts/ab/maps.sh speed u64        # or str, or big for a 64 byte mapped value
scripts/ab/maps.sh memory u64
# every adapter checked against unordered_dense, operation for operation
scripts/ab/maps.sh check u64
scripts/ab/maps.sh -s check u64     # ... and again under ASan and UBSan
# one map per binary, under perf stat
scripts/ab/maps_one.sh hit 50000 30000000
# groups read per lookup: load, turnovers, writing hits per round
scripts/ab/probe_length.sh 0.76 200 0
# grouped against window placement, simulated, no map involved
clang++ -O2 -std=c++17 scripts/ab/placement.cpp -o placement && ./placement 0.799
# move_home on and off, one map per binary: workload, entries, turnovers, writing hits per round, lookups
scripts/ab/move_home.sh miss 838860 40 1 4000000
scripts/ab/move_home.sh miss 838860 40 0 4000000   # the control: no writing hits
```

`maps.sh` compiles in whichever libraries it finds, and the environment variables for their
locations are documented at the top of it. Every adapter is checked against `ankerl::unordered_dense`
over 400,000 mixed operations before any timing is believed. That is what found that Verstable's
`vt_insert` behaves like `insert_or_assign`, not `try_emplace`, and that `vt_get_or_insert` is the
right equivalent.

# Appendix: sources and versions [&#8593; contents](#contents){:.up} {#appendix}

Every code block above is quoted from one of these, at the version given, with left out parts marked.
Line numbers move. The file and the symbol do not.

| map | version | quoted from | upstream |
|---|---|---|---|
| `ankerl::unordered_dense` 5.0 | tag `v5.0.0`; measured on `db03cc4`, which differs only in the name of the hash | `include/ankerl/unordered_dense.h`: `basic_group`, `make_fingerprint_words`, `group_storage::block`, `probe_from`, `place_group`, `uncount`, `move_home`, `fill_buckets_from_values` | [martinus/unordered_dense](https://github.com/martinus/unordered_dense) |
| `ankerl::unordered_dense` 4.11.0 | tag `v4.11.0` | same file: `bucket_type::standard`, `probe_scalar`, `probe_simd` | [martinus/unordered_dense](https://github.com/martinus/unordered_dense) |
| abseil `flat_hash_map` | 20250814.1 | `absl/container/internal/hashtable_control_bytes.h`: `ctrl_t` and its `static_assert`s, `GroupSse2Impl`. `absl/container/internal/raw_hash_set.h`: `H1`, `H2`, `probe_seq`, `find_large`, `CapacityToGrowth` | [abseil/abseil-cpp](https://github.com/abseil/abseil-cpp) |
| boost `unordered_flat_map` | 1.90 | `boost/unordered/detail/foa/core.hpp`: the `group15` design comment, `match`, `is_not_overflowed`, `mark_overflow`, `maybe_caused_overflow`, `recover_slot`, `pow2_quadratic_prober`, `table_core::find` | [boostorg/unordered](https://github.com/boostorg/unordered) |
| folly F14 | `65749da`, 2026-09-04 | `folly/container/detail/F14Table.h`: `F14Chunk`, `splitHashImpl`, `probeDelta`, `findImpl` | [facebook/folly](https://github.com/facebook/folly) |
| emhash8, emilib | `20a28e8`, 2026-09-05 | `include/emhash/hash_table8.hpp`: `Index`, `EMH_EQHASH`, `EMH_NEW`, `find_filled_slot`. `include/emilib/emihmap1.hpp`: `State`, `hash_key2` | [ktprime/emhash](https://github.com/ktprime/emhash) |
| indivi `flat_umap`, `flat_wmap` | `27ff2ce`, 2025-08-12; the probe bound of [#2](https://github.com/gaujay/indivi_collection/issues/2) landed after it, in `9ff9dc6` | `src/indivi/detail/flat_utable.h`: `MetaGroup`, `match_word`, `get_overflow`, `dec_overflow`, `get_distance`, `find_impl`. `src/indivi/detail/flat_wtable.h`: `MetaWGroup` | [gaujay/indivi_collection](https://github.com/gaujay/indivi_collection) |
| Verstable | `dd83033`, 2025-05-06 | `verstable.h`: the metadata masks, `vt_hashfrag`, `MAX_LOAD` | [JacksonAllan/Verstable](https://github.com/JacksonAllan/Verstable) |
| ihtab, ixhtab | `1405f8e`, 2026-06-26 | `ihtab.hpp`: the group constants, `do_1`, `rebuild`. `ixhtab.hpp:290` for the bug | [vnmakarov/ihtab](https://github.com/vnmakarov/ihtab) |
| `std::unordered_map` | libstdc++, gcc 16 | -- | -- |

The benchmark is `scripts/ab/maps.h`, `maps.cpp`, `maps_one.cpp`, `maps.sh` and `maps_one.sh` in the
unordered_dense repository, with `max_rss.h` and `count_alloc.h` behind the memory tables. The figures
are generated by `scripts/ab/diagrams.py` and `scripts/ab/mapsplot.py` in the same place, so every
chart in this post can be redrawn from its CSV. Every measurement of my own map is also written down
in [`notes/index-design.md`](https://github.com/martinus/unordered_dense/blob/main/notes/index-design.md),
the negative results included.

Thanks to the authors of all of these for writing headers that explain themselves. Boost's `group15`
comment, abseil's `static_assert`s, folly's note on why not linear probing and indivi's saturation
assertions are better documentation than most papers. About half of this post is me reading them.

# Corrections [&#8593; contents](#contents){:.up} {#errata}

## 2nd October 2026: rewritten, and these numbers changed

I rewrote the whole post for readability, and checked every claim again against the sources and my
notes. These are the corrections that change a conclusion:

- **The drift of a churned table was under-reported by about 4x.** Two of my harnesses replaced
  erased keys with sequential numbers, which the hash spreads almost perfectly over the groups. With
  random keys a churned table reads 1.136 groups per hit and 1.265 per miss at load 0.76, not 1.036
  and 1.061. The first version said the drift was 1 to 3% and stopped growing, that `move_home` made a
  churned table better than a fresh one, and that "the miss is finished". None of that holds.
- **`move_home` is worth 1.26 to 1.30x on a churned miss**, not 1.10x, and also makes the churn round
  8% faster.
- **Double hashing is not 9% slower.** That was a paired measurement. One header per binary it is
  within 0.1% on the suite, makes churned misses 1.07 to 1.18x faster and costs a fresh integer hit up to 5%
  under clang. It is still not in the map, now as a trade I declined.
- **The exact in-home counter** is estimated at 6 to 7% of a churned miss, not 2 to 3%, and it was
  never built. The first version said it was measured.
- **Dropping one of the two index prefetches** is within 3% on both compilers. The first version said
  it was a 5 to 11% clang win and a 12% gcc loss. The 12% was for dropping both.
- **abseil does not use aligned groups.** Its 16 control bytes start at the home slot, like
  `flat_wmap`'s window. The `flat_wmap` chapter was built on the opposite claim, and I rewrote it.
- **Boost does not repair itself with an in-place rehash on a timer.** An erase from an overflowed
  group lowers its maximum load, and that triggers a rehash at the same size. Boost's erase also does
  not free capacity outright, as the first version said.
- **Credits:** the per-class counters and their decrement on erase are both indivi's. The table of
  pre-broadcast fingerprint words is boost's idea, and unordered_dense uses indivi's version of it.
  The probe bound was found missing in a review and only then found in boost. What unordered_dense
  took directly from boost is the MSVC prefetch.
- **unordered_dense 5.0 is released** (5.0.0 on 14th September 2026, 5.2.0 now), and its hash is no
  longer called wyhash, because it does not produce wyhash's values.
- **The sawtooth chart is in L2**, not in L1.
- **Five sizes per octave are not enough between different maps.** Churn ratios can be off by up to
  a quarter. The first version recommended five sizes as the method.

On top of those there are smaller fixes all through the post: numbers that did not match their own
table, quoted code with parts left out without a mark, a few wrong mechanism details (ihtab's empty
and deleted markers, abseil's erase and rehash conditions, F14's capacity scale), and wording.

## 14th September 2026: two things a reader found

A reader raised two things. One was wrong, the other was never said.

**Wrong: the cache sentences.** Three places put a table past a cache level that it fits in. The
machine has 64 MB of L3 as two 32 MB halves, and the measured process is pinned to one core, so
**32 MB** is what it gets. `map<uint64_t, size_t>`, index plus values:

| entries | index | values | total |
|---:|---:|---:|---:|
| 500,000 | 5.50 MB | 7.63 MB | **13.1 MB** |
| 870,550 | 11.00 MB | 13.28 MB | **24.3 MB** |
| 1,000,000 | 11.00 MB | 15.26 MB | **26.3 MB** |

So [the 500,000 octave](#integer-keys) does not put the values out of L3. The million-entry table
in [chapter 16](#counters) is not the case where every design waits for main memory. Two million
entries is the first size clearly past L3, and four million, which several measurements here use,
is well past it.

**Never said: these are throughput numbers.** Every lookup workload draws its key from a random
number generator, so several lookups are in flight at once, and what comes out is throughput. That
is what a program looking up in a loop gets, and it is a fair thing to measure. It is not the latency
of a single lookup, and the post never said which one it was.

Measured both ways, same map, same keys, where the dependent version takes each key from the value
the last lookup returned and nothing else differs:

*Nanoseconds per hit, `map<uint64_t, uint64_t>`, one core, all keys present.*

| | 1M dependent | 1M independent | 4M dependent | 4M independent | 16M dependent | 16M independent |
|---|---:|---:|---:|---:|---:|---:|
| unordered_dense 5.0 | 16.63 | 12.24 | 56.62 | 38.73 | 93.33 | 45.25 |
| `boost::unordered_flat_map` | 22.02 | 7.26 | 81.27 | 20.45 | 101.21 | 27.79 |
{: .heat-low}

For boost, dependent lookups are 3.0x slower at a million entries and 4.0x at four million. For
unordered_dense, 1.4x and 1.5x.

**The two measures do not rank the maps the same way, and the published one is the less flattering
one for my map.** In throughput boost is 1.69x faster on an integer hit at a million entries. With
dependent lookups unordered_dense is ahead, 16.63 ns against 22.02. A flat map has one region and one
dependent load, so there is more for the CPU to overlap. A dense map's second load is already on the
critical chain and gains less. That is not an excuse for having left it unlabelled.

The benchmark that runs both is `scripts/ab/latency.cpp` in the unordered_dense repository. Thanks to
the reader who asked. The other half of the complaint, that this post is longer than it needs to
be, is also fair.
