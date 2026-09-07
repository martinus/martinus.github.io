---
layout: post
title: The Index Structures of Fast C++ Hash Maps
subtitle: "What SwissTable, Boost, F14, emhash8, emilib, indivi, Verstable and unordered_dense put in front of their keys: every design read from its source, drawn to one scale, and measured on one machine"
---

<style>
/* Eighteen maps by seven workloads does not fit a phone; let the wide ones scroll sideways
   instead of being clipped. */
.blog-post table { display: block; width: fit-content; max-width: 100%; overflow-x: auto; }
</style>

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

`unordered_dense` appears here in two versions and both are mine: 4.11.0, which is the released
robin hood design, and 5.0, which replaces its index and is **unreleased at the time of writing**.
Take my measurements of my own map with whatever salt that deserves; everything in this post is
reproducible with the commands in [chapter 19](#how-measured).

Numbers appear where they make a design easier to understand, not as a ranking. They are all from
one desktop, every map is handed the same hash, and every ratio is a geometric mean over a range of
table sizes rather than a measurement at one size -- [chapter 19](#how-measured) says why that
matters more than it sounds like it should, and how to reproduce all of it.

# Contents {#contents}

**Part I: what an index has to do**

1. [Five questions every hash map index answers](#five-questions)
2. [What a lookup is made of](#what-a-lookup-is-made-of)
3. [Three families: flat, dense, node](#three-families)
4. [Per-slot metadata or per-group metadata](#per-slot-or-per-group)

**Part II: the designs**

{:start="5"}
5. [Robin hood with an ordered word: unordered_dense 4.11.0](#robin-hood)
6. [SwissTable: abseil's flat_hash_map](#swisstable)
7. [Boost's unordered_flat_map: fifteen slots and an overflow byte](#boost)
8. [Folly F14: one counter per chunk](#f14)
9. [emhash8: chaining through the index, and a fingerprint for free](#emhash8)
10. [emilib: a state byte per slot](#emilib)
11. [indivi: counters an erase can undo, and distance nibbles](#indivi)
12. [The group index: unordered_dense 5.0](#group-index)
13. [Two more, measured rather than read: Verstable and ihtab](#two-more)

**Part III: side by side**

{:start="14"}
14. [The summary table](#summary-table)
15. [What one lookup touches](#what-one-lookup-touches)
16. [The same workloads on every map](#same-workloads)
17. [Question by question](#question-by-question)

**Part IV**

{:start="18"}
18. [What is still on the table](#still-on-the-table)
19. [How the numbers were made, and how to remake them](#how-measured)
20. [Appendix: sources and versions](#appendix)

# 1. Five questions every hash map index answers {#five-questions}

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
  behind at all. That is folly's F14, `indivi::flat_umap` and `unordered_dense` 5.0.
- **Move the elements back** so the sequence is repaired: robin hood's *backward shift deletion*,
  which is `unordered_dense` 4.11.0.

And there is a way of not needing an answer at all: **thread a chain** through the metadata, so that
a lookup only ever visits keys that belong to it. That is what emhash8 and Verstable do.


A few more words I will use without explaining again: a **group** is the run of slots a map
compares in one instruction, usually 14, 15 or 16; a slot's **home** is the group or bucket its key
hashes to; **displacement** or **distance** is how far from home it ended up; the **load factor**
is how full the table is, and every map here has a maximum after which it doubles.

# 2. What a lookup is made of {#what-a-lookup-is-made-of}

Three things cost time in a hash map lookup, and it helps to know which one a design is spending.

1. **Dependent loads.** The hash produces the address of the metadata; the metadata produces the
   address of the key; on a dense map the key's index produces the address of the value. Nothing on
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

[![Cost of a hit against table size across one doubling: every map ramps up as it fills and drops when it doubles](/img/2026/hashmap-index/sawtooth.svg)](/img/2026/hashmap-index/sawtooth.svg)

That is a hit measured at fifty-seven table sizes from 1,673 to 3,636 entries, small enough that all
of it is in L1, so nothing in the picture is the cache. Every line ramps as the table fills and drops
when it doubles, and **the amplitude differs by more than a factor of two between designs**: within
the octave `unordered_dense` 4.11.0 swings 1.83x between its cheapest and dearest size, boost 1.52x,
abseil 1.35x and `unordered_dense` 5.0 1.25x. Robin hood has the largest tooth of any design in this
post, and [chapter 5](#robin-hood) says why.

Two things follow. A number quoted at one size is a number quoted at one arbitrary point of that
map's own tooth, and it can be 1.8x away from the same map's number one size along. And the maps do
not fall off the same cliff: this octave nearly hides that, because a maximum load of 0.8 and one of
0.875 happen to double at almost the same place for these sizes, but boost's slot count is not a
power of two and at larger sizes its tooth walks out of phase with everyone else's.

That is why every ratio in this post is a geometric mean over the five sizes drawn as large dots,
rather than a measurement at one of them. It is not a refinement; it changes answers. Measured on
`unordered_dense` 5.0 against boost, churn at a fixed size read 1.19 sampled at one size and
**0.78** averaged over the octave. The sign reversed.

# 3. Three families: flat, dense, node {#three-families}

Before the metadata, one decision splits the field: where the key and the value actually live.

[![Flat, dense and node maps, and what one lookup has to touch in each](/img/2026/hashmap-index/families.svg)](/img/2026/hashmap-index/families.svg)

Flat has the shortest chain and pays for it with every cost scaling in `sizeof(value_type)`, because
a hash-scattered slot is written whole. Dense writes four bytes there and appends the payload in
order, so iteration is an array walk and a large value costs the vector rather than the table, for
one more dependent load on every hit. Node maps keep references and iterators valid forever, and pay
an allocation per insert and a cache miss per lookup for it.

## Keys in the slots: flat

`absl::flat_hash_map`, `boost::unordered_flat_map`, `folly::F14ValueMap`, `indivi::flat_umap`,
emilib, Verstable. The `value_type` is stored in the slot the hash picked. A lookup that gets a
fingerprint match reads the key from the same group it just read the metadata from, so it is one
region and a short chain. That is the fastest possible hit.

What it costs is that *every* cost scales with `sizeof(value_type)`. Growth copies whole values into
hash-scattered slots. An empty slot occupies a full `value_type`. Iteration walks the whole slot
array, most of which is empty, so a flat map at load 0.5 reads twice the memory it has to. And
references and iterators are invalidated by any growth, because the values move.

## Keys in a vector: dense

`ankerl::unordered_dense`, `emhash8::HashMap`, `folly::F14VectorMap`, ihtab. The values live in a
contiguous array in insertion order, and the hash table holds an *index* into it rather than the
value. Iteration is a plain array walk over exactly the live entries. A 64 byte value costs the
vector rather than the table. Growth rehashes indices, not values.

**Four bytes is the usual index, and it is a choice rather than a law.** `folly::F14VectorMap` and
ihtab fix theirs at `uint32_t`. `unordered_dense` uses `uint32_t` and has a second bucket type,
`group_big`, whose index is a `size_t` for tables past four billion entries.
`emhash8::HashMap` is a `uint32_t` by default and a `uint16_t` or a `uint64_t` depending on how it
is compiled, and it stores *two* of them per bucket, because one of them is the chain link. And
[CPython's compact dict](https://mail.python.org/pipermail/python-dev/2012-December/123028.html),
which is the same idea outside C++, sizes its index to the table: one byte, two, four or eight. That
last one sounds like the obvious win and it is measured in [chapter 12](#group-index), where a 16 bit
index reads 0.986 -- a table small enough to be indexed in 16 bits has an index of at most 128 KB,
which is already in L2, so halving something that already fits buys nothing.

The price is one more dependent load on every hit: metadata, then index, then value. On a table
that fits in cache that is a few cycles; on a table that does not, it is a cache miss and a TLB
entry, and it is the one structural cost of the family. It is why boost is ahead of unordered_dense 5.0 on
a fresh lookup, and it is not going away.

The other price is subtler: erasing from the middle of a dense vector leaves a hole, so the usual
fix is to move the last element into it -- which means finding the *slot* that points at the moved
element, which means hashing its key again. For an integer key that is free (see
[chapter 12](#group-index)); for a string key it costs about 50 ns.

## Keys behind a pointer: node-based

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

# 4. Per-slot metadata or per-group metadata {#per-slot-or-per-group}

Within open addressing, the second decision is how much the map is willing to store per slot, and
whether the metadata is read one slot at a time or a group at a time.

**One byte per slot, sixteen at a time.** SwissTable and everything descended from it. A byte holds
seven or eight bits of hash plus an encoding of empty and deleted; sixteen bytes are one SSE2
register; one compare and one `movemask` give sixteen verdicts and one unpredictable branch instead
of sixteen. The cost is that a byte is not much room, so anything else the design wants -- overflow
information, a distance -- needs somewhere else to live.

**One byte per slot, and no groups at all.** `indivi::flat_wmap` reads sixteen bytes *unaligned*
starting at the home slot. It gives up any notion of a group boundary, which makes placement per
slot rather than per group, and it is the fastest map on a hit in [chapter 16](#same-workloads).

**More than a fingerprint per slot.** Robin hood's eight byte bucket carries a distance as well, so
a single compare orders buckets and a miss can stop on an inequality. Verstable's sixteen bits carry
a chain link. emhash8's two words carry a chain and a value index. These designs can answer
questions a byte cannot, and they pay for it in branches and in memory.

**A group, plus something on the side.** boost's sixteenth byte, F14's two counter bytes, indivi's
and unordered_dense's eight counters. This is where the answer to "when may a miss stop?" got
interesting in the last few years, and it is what [chapters 7](#boost), [8](#f14),
[11](#indivi) and [12](#group-index) are mostly about.

Read each chapter for two things: **how a miss stops**, and **what an erase leaves behind**. Those
two are one question asked from both ends, and no two of these maps answer it the same way.

# 5. Robin hood with an ordered word: unordered_dense 4.11.0 {#robin-hood}

This is my own map as it stood until a few days ago, and the design I have written about
[twice](/2016/09/15/very-fast-hashmap-in-c-part-1/)
[before](/2026/09/04/unordered-dense-four-buckets-at-a-time/). It is here because it is the best
robin hood table I know of and because the trick at the centre of it is, as far as I know, mine.

## Layout: distance above fingerprint, so one compare orders both

[![One 8 byte bucket: 24 bits of distance, 8 of fingerprint, 32 of value index](/img/2026/hashmap-index/rh-bucket.svg)](/img/2026/hashmap-index/rh-bucket.svg)

```cpp
struct standard {
    static constexpr std::uint32_t dist_inc = 1U << 8U;             // skip 1 byte fingerprint
    static constexpr std::uint32_t fingerprint_mask = dist_inc - 1; // mask for 1 byte of fingerprint

    std::uint32_t m_dist_and_fingerprint; // upper 3 byte: distance to original bucket. lower byte: fingerprint from hash
    std::uint32_t m_value_idx;            // index into the m_values vector.
};
```

Eight bytes per slot, and no key in them. The low byte is a fingerprint; the upper three bytes are
the distance from home, incremented by adding `dist_inc`, which is exactly `1 << 8`. Zero means the
bucket is empty; distance 1 means the key is at home.

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

## Backward shift deletion: no tombstones, ever

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
full one: a scalar robin hood probe swings 2.05 to 2.35x between the cheapest and dearest point of
one octave, where a group design swings 1.07 to 1.28x. [Chapter 16](#same-workloads) has the
same measurement for 4.11.0 with its vector probe.

## What carried into the group index, and what did not

Kept: the fingerprint from the low byte of the hash and the home from the top bits, so the two are
independent; the dense value vector; the 8 bit fingerprint width.

Dropped: the ordering, the shifts, and the sentinel padding at the end of the bucket array. What
replaced them is [chapter 12](#group-index).

# 6. SwissTable: abseil's flat_hash_map {#swisstable}

The design everything else in this post is measured against, whether or not it says so.
[abseil](https://abseil.io/about/design/swisstables)'s `raw_hash_set` is the original, and boost,
folly, indivi, emilib, ihtab and unordered_dense 5.0 are all answering questions it asked first.

## Layout: one control byte per slot, sixteen at a time

[![The hash split into H1 and H2, sixteen control bytes, and the slots](/img/2026/hashmap-index/swiss-group.svg)](/img/2026/hashmap-index/swiss-group.svg)

0x80 is empty and 0xFE a tombstone, both with the top bit set, so one sign test finds either; an
occupied byte is the tag with its top bit clear.

```cpp
enum class ctrl_t : int8_t {
  kEmpty = -128,   // 0b10000000
  kDeleted = -2,   // 0b11111110
  kSentinel = -1,  // 0b11111111
};
```

One byte per slot. An occupied byte holds **H2**, the top seven bits of the hash, with the top bit
clear. The three special values all have the top bit *set*, which is the point of them, and abseil
spells out why each one is the number it is in a run of `static_assert`s directly underneath:

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

## Tombstones and the 7/8 rule

An erase writes `kDeleted` -- unless both neighbours in the same group are empty, in which case it
can write `kEmpty` without breaking anyone's proof. So a table that churns at a fixed size fills
with tombstones, and `MaskEmpty()` stops finding anything, and misses get longer and longer. abseil
handles that by rehashing in place when an insert finds no growth left; the table does not get
bigger, but the tombstones go away and every probe sequence is rebuilt.

The maximum load factor is 7/8, so growth happens at capacity times 7/8.

## Good at, pays for

Good at: the shortest lookup of any design here on a fresh table -- one region, one dependent load
after the metadata, and the key right there. Fifteen years of tuning behind it. Small-table
optimizations recent versions add (a single-slot "small" mode with no probing at all) that nothing
else here has.

Pays for: tombstones. A table held at a constant size by erasing one and inserting one is the one
workload where SwissTable's answer to "gone?" is the weakest of the field, and it is the workload
[chapter 16](#same-workloads) measures on purpose.

## Measured in the group index: a per-table seed, which is nearly free

The seed is the one thing here aimed at an adversary rather than at a workload, and it is cheap
enough to be worth reporting precisely. Implemented the same way -- `mixed_hash` returns
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

## Measured in the group index: cache-line-aligned metadata

abseil's and boost's groups are cache-line-aligned, which they get for free because their metadata
is 16 bytes. This library's sixteen value indices are exactly 64 bytes, and glibc hands back large
allocations at 16 mod 64, so *every* group's indices straddle two cache lines. Giving the index
array a 64 byte aligned block type does exactly what you would expect on lookups (find and hit both
1.02x) and costs 4-5% on builds and churn, for a geometric mean of **0.993** -- a net loss. The
likely mechanism is conflict misses: with both arrays at power-of-two offsets, a group's metadata
and its indices collide in the same cache sets more often than when one of them is skewed.

# 7. Boost's unordered_flat_map: fifteen slots and an overflow byte {#boost}

[boost::unordered_flat_map](https://www.boost.org/doc/libs/latest/libs/unordered/doc/html/unordered/structures.html)
is a SwissTable descendant with one change that turns out to matter a great deal: it spends its
sixteenth metadata byte on the answer to "absent?" instead of on a sixteenth slot.

## Layout: group15 and the byte at the end

[![Fifteen reduced hash values and an overflow byte, and the bit it sets](/img/2026/hashmap-index/boost-group15.svg)](/img/2026/hashmap-index/boost-group15.svg)

Boost's header explains it better than I can paraphrase it:

```
 *   +---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+
 *   |ofw|h14|h13|h13|h11|h10|h09|h08|h07|h06|h05|h04|h03|h02|h01|h00|
 *   +---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+
 *
 * hi is 0 if the i-th element slot is avalaible, 1 to mark a sentinel and,
 * when the slot is occupied, a value in the range [2,255] obtained from the
 * element's original hash value.
 * ofw is the so-called overflow byte. If insertion of an element with hash
 * value h is tried on a full group, then the (h%8)-th bit of the overflow
 * byte is set to 1 and a further group is probed.
```

Two consequences, and the comment names both. First, **no value has to be reserved for a
tombstone**, so a reduced hash keeps log2(254) = 7.99 bits where a design that spends a bit on
available-or-deleted keeps seven. Second, and much more important:

```
 *   - When doing an unsuccessful lookup (i.e. the element is not present in
 *     the table), probing stops at the first non-overflowed group. Having 8
 *     bits for signalling overflow makes it very likely that we stop at the
 *     current group (this happens when no element with the same (h%8) value
 *     has overflowed in the group), saving us an additional group check even
 *     under high-load/high-erase conditions. It is critical that hash
 *     reduction is invariant under modulo 8 (see maybe_caused_overflow).
```

That last sentence is a lovely detail. The reduced hash is not `h & 0xFF`; 0 and 1 are reserved, so
they are remapped -- to 8 and 9 respectively, precisely so that the remap does not change `h % 8`
and the overflow bit a group consults is the same one an insert set. The remap is a 256 entry table
of pre-broadcast 32 bit words, which is the same trick unordered_dense 5.0 uses for its own fingerprint
word.

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

## An erase cannot clear a bit

Here is the cost of the overflow byte, and it is the exact mirror of what makes it good. An insert
sets a bit to say "someone of class *h*%8 passed through here". An erase cannot unset it, because
the bit is shared by every key of that class and there is no count -- the map does not know whether
some other key still needs it. So on a table held at a fixed size by erasing one and inserting one,
boost's overflow bits accumulate, misses walk further and further, and the only thing that clears
them is a rehash. Measured on unordered_dense's churn workload, boost's lookups degrade to
**1.31x** of their fresh cost and snap back on an in-place rehash it pays for roughly every third
round, at +7 ns per operation on the round that repairs. Its bucket count never changes while that
happens.

This is the same problem as SwissTable's tombstones, one level cheaper: boost pays it in probe
length rather than in occupancy, so it degrades more gently and recovers more cheaply.

## Good at, pays for

Good at: a lean 1.07 bytes of metadata per slot, a miss test that costs one `and` and one `test` and
is right seven eighths of the time even under heavy erasing, and no tombstone value to spend a bit
on. It is consistently among the two or three fastest maps here on every lookup workload.

Pays for: a churning table, and the fact that an erase leaves work for a future rehash.

## Measured in the group index: the miss bound, and the same fingerprint table

Two things went the other way. Boost's prober **terminates** -- `return step<=mask` -- and until
the review before release unordered_dense's group probe did not. It stopped only at a group whose
counter for the key's class was zero, on the argument that an exact counter puts a zero right after
the furthest entry of that class. The argument is wrong, because a counter counts entries that
overflowed past its group on *their* probe sequences, not on the one being walked. Eight chosen keys
are enough to make `contains()` on an absent key loop forever: fill a group, send one key of class 1
past it, erase the fillers -- the passer stays, so the counter stays -- and repeat for every group.
The fix is `|| delta == m_group_mask`, and by mechanism it is free: 83.6 to 82.7 instructions on a
hit, 69.5 to 67.6 on a miss, cycles and mispredictions unchanged. `indivi::flat_umap`, where the
counters came from, has the same hole, and the same eight keys hang it.

The other is the 256 entry table of pre-broadcast fingerprint words, which boost has and this
library had lost somewhere: building the word arithmetically is an and, a compare, a shift, an or
and a multiply on the critical path of every probe, placement and erase, and one L1 load is cheaper.
Paired, integer misses 1.05-1.06x on both compilers, big-value finds 1.14x under gcc.

# 8. Folly F14: one counter per chunk {#f14}

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

## A counter an erase can decrement

`outboundOverflowCount_` counts the keys that wanted this chunk and did not fit. An insert that
passes a full chunk increments it; **an erase of such a key decrements it again**. So unlike boost's
bit, it comes back down, and a table that churns at a fixed size does not degrade. That is the idea
unordered_dense's index is built on, and F14 got there first.

The two limits are in the comment. It **saturates at 254** and once saturated it never moves again,
so a pathological table can pin a chunk permanently. And there is exactly **one counter per chunk**,
which knows nothing about the hash class -- any overflow at all sends every later miss into that
chunk on to the next.

## Value, Node, Vector

F14 ships three maps over one table. `F14ValueMap` is flat. `F14NodeMap` is node-based.
`F14VectorMap` keeps the values in a contiguous vector behind 4 byte indices and is, as far as I
know, the only mainstream dense map besides this one and emhash8 -- the closest relative
`ankerl::unordered_dense` has. It is measured in [chapter 16](#same-workloads) alongside the rest,
and it is the row I was most curious about.

## Good at, pays for

Good at: a tombstone-free erase, which in 2019 nobody else had; double hashing, which shortens
probe sequences under load; three container shapes over one table.

Pays for: one class-blind counter per chunk, and a saturation point it cannot come back from. And
the table itself is more elaborate than the others here -- the chunk carries capacity bookkeeping,
so chunk 0 is special.

## Measured in the group index: what one counter costs against eight

This library keeps eight counters per group, one per fingerprint class, and folly's design is the
natural question: is one enough? It is measurable, and the answer is no by a distance. Building
unordered_dense 5.0 with a single class-blind counter per group, on a table at load 0.76 after 200
turnovers:

| counters per group | fresh miss | churned miss | misses continuing past home | score |
|---|---|---|---|---|
| 1, F14 style | 1.21 groups | 2.79 | 60% | **0.959** |
| 8, one byte each | 1.06 | 1.26 | 17.5% | 1.000 |
| 16 nibbles | 1.03 | 1.13 | 9.7% | 0.986 |
| 32 two-bit | 1.02 | 1.15 and rising | rising | 0.988 |

A shared counter does not know the fingerprint class, so *any* overflow past a group makes every
later miss into it carry on -- and in a churned table most groups have seen an overflow, so 60% of
misses continue. Its geometric mean over the benchmark suite is 0.959 and its churn workload 0.83.

The rest of that table is [chapter 12](#group-index)'s, and the short version is that eight one-byte
counters is the point where the counter is still a single aligned load and already knows the class.

## Measured in the group index: double hashing, which works and still loses

The other transferable thing here is the probe sequence, and it is aimed at a real weakness. Under a
triangular sequence every key homed in group *g* walks the same groups, so a **sibling** -- another
key that belongs in *g* and did not fit -- sits exactly where a later miss for *g* will look. That is
not a small share of the problem: about 80% of what the overflow counter fails to filter is siblings.

Double hashing breaks it. Taking the step from bits 8 to 15 of the hash -- which neither the group
(the top bits) nor the fingerprint (the low byte) uses -- and forcing it odd keeps the "visits every
group exactly once" property that the miss bound needs, and gives two siblings different tours. It
does exactly what it is supposed to. Groups visited per lookup, triangular against double hashed:

| | fresh miss | churned miss | fresh hit |
|---|---|---|---|
| load 0.760 | 1.052 to **1.035** | 1.061 to 1.050 | 1.031 to 1.027 |
| load 0.799 | 1.086 to **1.054** | 1.122 to 1.096 | 1.039 to 1.033 |

**A third of the excess, gone -- and it is slower.** Paired on the benchmark suite, random integer
misses read **0.915**, builds 0.950, big-value churn 0.970. One map per binary says why: **+4.6
instructions per lookup** and one more live register in the probe, the placement and the counter
walk, against 0.03 groups on a path five percent of misses reach. Branch misses actually improve
slightly, 0.108 to 0.093, and it does not matter.

It is the same answer as every other idea in this post that added work to a path that always runs.
The group compare and the counter have already taken the probe to 1.03 groups, so **the shape of the
sequence past home has nothing left to win.** Folly's comment is right about folly's map, where the
tour matters precisely because there is no per-class counter stopping a miss at home in the first
place.

# 9. emhash8: chaining through the index, and a fingerprint for free {#emhash8}

[emhash](https://github.com/ktprime/emhash) is a family of maps by ktprime; `emhash8::HashMap` is
the dense one, and it is the only map in this post that is not a SwissTable descendant *and* not
robin hood. It is coalesced chaining, and it is fast.

## Layout: {next, slot} per bucket, values packed in a vector

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

## The trick: hash bits above the mask

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

## One lookup

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

## Good at, pays for

Good at: a dense value vector, so iteration is an array walk and a large value costs the vector. The
free fingerprint. Short chains, because a chain holds only keys that share a home.

Pays for: **branches**. Every step of the loop is a data-dependent branch, and so is "is there a
chain at all". That is fine when the answer is nearly always no, and it is the reason emhash8's
misses are its weakest column in [chapter 16](#same-workloads) -- a miss has to reach the end of the
chain, and whether there is one is exactly the unpredictable question. And the eviction machinery
means an insert can move an existing key, which the group designs never do.

## Measured in the group index: a second fingerprint in the spare bits

emhash8's free fingerprint is the most tempting idea in this post to steal, because unordered_dense's
value index is also a `uint32_t` with spare high bits, and it is also loaded on every hit. Eight
bits there cost nothing until a table wants more than 2^24 slots.

Measured, it is a **0.975** on the geometric mean, and the losses are precisely on lookups:
find 0.912, big-value find 0.919, random hit 0.930, churn 0.915. The reason is the general shape
this whole exercise keeps running into: **a filter only pays where nothing cheaper filtered first.**
For emhash8 the trick is free because there is no group-level fingerprint and the word has to be
consulted anyway. Here the sixteen-way fingerprint compare has already rejected everything it is
going to reject, so a second check adds an xor, a shift and a compare to the dependent chain of
every lookup in order to avoid a value access on the 3% with a fingerprint collision.

# 10. emilib: a state byte per slot {#emilib}

`emilib::HashMap` (shipped in the same repository as emhash) is SwissTable with fewer tricks, and it
is here for exactly that reason: it is the shortest way to see what the tricks are worth.

[![emilib's state byte array and its slots](/img/2026/hashmap-index/emilib-state.svg)](/img/2026/hashmap-index/emilib-state.svg)

The home slot is rounded down to a multiple of sixteen, so a compare is always an aligned group and
a probe never straddles two of them.

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
design, and in [chapter 16](#same-workloads) it lands in the middle of the field, which is what a
clean implementation of the standard design should do.

# 11. indivi: counters an erase can undo, and distance nibbles {#indivi}

[indivi_collection](https://github.com/gaujay/indivi_collection) by Guillaume Aujay is where this
library's overflow counters come from, and it is the least known map in this post by a distance. Its
`flat_umap` is the design F14 pointed at, taken further.

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

Maximum load factor 0.875, quadratic probing at the group level.

## Erase by iterator without a hash: the nibbles

The distance nibbles are the other idea, and they are aimed at a specific operation. Given an
iterator, an ordinary open addressing map cannot erase without knowing where the key's home is, and
the only way to find that out is to hash the key again. With the distance stored, home is the
current group minus that many steps of the probe sequence, run backwards -- so `erase(iterator)`
needs no hash and no key access at all. For a `std::string` key that is a whole wyhash and a
dependent load saved.

## flat_wmap: the same without groups, and it wins the hit

`indivi::flat_wmap` is the sibling, and it is the surprise of the measurements. One metadata byte per
slot, no counters, tombstones, a maximum load of 0.8 -- and, in its own words, *"It doesn't group
buckets but still relies on SIMD operations for speed"*. There is no group alignment at all: the
sixteen byte window is read **unaligned, starting at the home bucket**.

```cpp
const uint8_t* group = &mGroups.data[index];   // index is the home *slot*, not a group
auto hfrags = MetaWGroup::load_hfrags(group);  // _mm_loadu_si128
int matchs = MetaWGroup::match_hfrag(hfrags, hash);
```

**It is the fastest map here on all-hit lookups at every size I measured** -- 0.71 at 32,000 entries
and 0.62 at 500,000. The most useful comparison is not with unordered_dense, though, but with its own sibling:
same author, same file layout, both flat, both SSE2, one grouped and one not.

| | hit | miss | build | churn |
|---|---|---|---|---|
| `flat_umap`, grouped | 0.82 | 0.97 | 1.62 | 0.69 |
| `flat_wmap`, ungrouped | **0.71** | **0.83** | 1.86 | 0.93 |

The ungrouped window is **1.13 to 1.42x faster on lookups** across the three octaves and
consistently slower on builds. That is the biggest single index effect I found in anyone else's map,
so it is worth knowing what causes it -- and the obvious answer is wrong.

**The window is not it.** The intuitive story is that slot-level placement gives a shorter
displacement distribution: a key takes the first free slot within sixteen of its home, where a
grouped map takes the first free slot in the group of sixteen its home falls in, and a *group* being
completely full is likelier than *no* free slot existing in a sliding window. That is true, and it is
worth almost nothing. Simulated with the same keys at the same load, windows visited per placement:

| load | bucketized | sliding |
|---|---|---|
| 0.760 | 1.0318 | 1.0238 |
| 0.790 | 1.0436 | 1.0352 |
| 0.799 | 1.0481 | **1.0396** |

Slot-level placement removes about a fifth of an excess that is already under 5%. For calibration,
that is a quarter of what moving displaced entries home is worth in
[chapter 12](#group-index), and that is worth a tenth of an in-cache miss and nothing out of cache.

**What causes it is instructions and metadata width.** One map per binary, all-hit lookups, the
grouped sibling against the ungrouped one:

| entries | `flat_umap` instructions | `flat_wmap` | `flat_umap` L1 misses | `flat_wmap` |
|---|---|---|---|---|
| 1,000 | 53.3 | **47.3** | 0.876 | **0.378** |
| 50,000 | 54.6 | **48.3** | 3.744 | **3.297** |
| 1,000,000 | 72.6 | **64.4** | 4.733 | **3.856** |

Six fewer instructions per hit at every size, and fewer cache lines touched **even at a thousand
entries, where the whole map is in L1** -- so it is not a footprint effect that shows up only when
the metadata array gets big. One byte of metadata per slot against two, and no overflow counter to
load on the way past. The alignment of the window is the most visible difference between the two
designs and the least important one.

What the ungrouped design pays is the other columns: tombstones, a slower build, and the widest
load-factor sawtooth of anything in this post -- at the 32,000 octave it swings 2.12x between its
cheapest and dearest point where the group designs swing 1.5 to 1.6x.

## Good at, pays for

Good at: the most information per slot of any flat map here (a fragment, a class counter's share,
and a distance), a tombstone-free erase that also knows the class, and an `erase(iterator)` that
costs no hash.

Pays for: two bytes per slot instead of one, and the bookkeeping -- an insert maintains counters and
distances, an erase undoes both.

## Measured in the group index: the counters, and the nibbles that did not follow

The counters are the ancestor of unordered_dense's, and what changed in the copy is small: the
fingerprint word remap (0 to 8, so that the class is unchanged), the fact that unordered_dense's
counters live in the same block as the value indices, and the **termination bound** indivi does not
have -- `find_impl` loops on `gIndex <= mGMask`, which the mask makes always true, so the eight
chosen keys of [chapter 7](#boost) hang it too.

The nibbles did not follow, and they were measured properly before being dropped. Implemented here
as a slot back-pointer per value (four extra bytes per entry) plus indivi's distance nibbles, so
that `erase(iterator)` needs no hash at all, on the one workload it exists for -- find, then
`erase(it)`, then insert, on a reserved table:

- with `std::string` keys, **1.10x faster**: 1006 to 888 instructions per round, one wyhash and two
  probes gone.
- with `uint64_t` keys, **1.10x slower**: 352 to 363 instructions. The saved hash is eight
  instructions and the back-pointer maintained on every insert costs more than that.
- on the benchmark suite, where every erase is by key and the back-pointer can only cost:
  geomean 0.959, integer build 0.831, big-value build 0.893, integer churn 0.900.
- memory 31 to 38 MB per million eight byte values.

So it is a real win for a real pattern, and the pattern needs an expensive key *and* an erase by
iterator, and a caller with both can call `erase(key)` with the hash their own `find` already paid
for.

# 12. The group index: unordered_dense 5.0 {#group-index}

This is what replaced [chapter 5](#robin-hood) in my own map a few days ago, and it is the design I
know best because I built it by measuring every alternative I could think of and keeping what won.
Most of this chapter is the alternatives.

## Layout: an 88 byte block

[![The 88 byte block: 16 fingerprints, 8 counters, 16 value indices, and the values vector](/img/2026/hashmap-index/group-block.svg)](/img/2026/hashmap-index/group-block.svg)

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
    // once every group has been looked at: see the note on termination above.
    if (group.m_overflows[counter] == 0 || delta == m_group_mask) {
        return {0, 0, false};
    }
    group_idx = next_group(group_idx, delta);
}
```

SwissTable's shape again, with three differences. The value index replaces the key in the slot, so
a hit costs one more dependent load. The miss test is a per-class counter. And there is a
termination bound, which is [chapter 7](#boost)'s story.

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
nothing and gained nothing. With `vceqq_u8` the same runner reads 1.48x on hits and 1.62x on misses.
The vector compare is not an optimization of the group design; it is the group design.

## Eight counters, by fingerprint class -- and the four other widths

An insert that finds its home group full increments the counter for its own class in every full
group it passes; an erase decrements the same ones. A miss stops at the first group whose counter
for its class is zero. That is indivi's idea, with F14's erase-decrement, and the question left over
is how wide the counters should be. All four other divisions of a group's eight counter bytes were
built and measured; the table is in [chapter 8](#f14) and the two directions off the shipped design
lose for opposite reasons.

**Coarser** (one shared counter, F14 style) does not know the class, so any overflow at all sends
every later miss on: 60% of churned misses continue, score 0.959.

**Finer** (sixteen nibbles) filters genuinely better -- 9.7% of churned misses continue against
17.5% -- at no memory cost, and still loses at 0.986, because a sub-byte counter is a
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

And the fifth point on the axis, an **exact** counter: a second set of eight per group holding
"entries of class *c* whose home **is** this group and which did not fit", which is Verstable's
in-home bit generalised. Measured before writing any of it, on an instrumented header that rebuilds
the exact answer offline by hashing every occupied slot: at load 0.79 after 200 turnovers it takes a
churned miss from 1.242 groups to 1.201. (That is the instrumentation whose churned baseline I later
failed to reproduce -- see [drift](#group-index) below. What it says is the *difference* between two
variants measured with one instrument, which is what matters here.) That is a quarter of what moving
displaced keys home is
worth, for eight more bytes per group and a second invariant to keep. **About 80% of what the
approximate counter fails to filter is siblings** -- keys that genuinely home in that group and
genuinely did not fit -- and both tests say "continue" for those, correctly. Being exact only
removes the strangers.

## The miss bound

`|| delta == m_group_mask`. A key that exists was placed within one cycle of its probe sequence, so
a walk that has seen every group can stop. It is in [chapter 7](#boost) because boost has it and this
did not, and it has a second effect worth knowing: it converts a missing or wrong erase decrement
from a hang into a silent slowdown. That fault used to be caught loudly -- counters only grew, a
miss found no zero, the test suite hung -- and now the table stays correct and gets slower. Which is
the right trade against a hostile hash, and it is why there is now a test that measures the
*lengthening* rather than an answer: the map is given a counting `KeyEqual`, and a table that
reached its contents by erasing a run of overflowing entries must compare a miss exactly as often as
a table built from the survivors directly.

## Erase: decrement, do not tombstone

An erase clears the fingerprint and walks the same sequence from home to the group the entry was
found in, decrementing each counter. Then, because the values are dense, it moves `m_values.back()`
into the hole -- which means finding the slot that points at the moved element, which means hashing
that key again and running a second probe.

That sounds expensive and for an integer key it is free. Measured at a million entries, an erase
plus an insert against a sequence with the same two cold probes and no move at all:

| | with the move | without |
|---|---|---|
| `uint64_t` keys | 57.0 ns | 56.2 ns |
| `std::string` keys | 410.4 ns | 377.7 ns |

Three things make it free for an integer: the moved element is always the back of the vector, which
in a churn loop is the same few cache lines and stays hot; `do_erase` prefetches it first, so the
load runs under the counter walk; and an integer hash is one multiply, so the group access it
produces issues early enough to overlap. For a string it costs about 50 ns, because wyhash over 8 to
135 bytes behind a heap pointer is a dependent load and then a long chain, and none of it overlaps.

The fix for that is a back-pointer per value, and it is [chapter 11](#indivi)'s rejected experiment:
it pays exactly where the hash is expensive (string churn 1.045, string insert-erase 1.024) and
costs everywhere the vector grows (integer build 0.953, big-value build 0.960), for 19% more memory
at an eight byte value.

## Drift, and moving home

Because nothing moves after it is placed, an entry that landed away from home while its home group
was full **stays there after the home empties again**. So a long-churned table probes further than a
freshly built one with the same contents. Groups visited per lookup, counted inside the probe, on a
reserved table churned 200 times through -- erasing a uniformly random live key and inserting one
the map has never held, at a constant size:

| | fresh | churned | + one writing hit per round | + four |
|---|---|---|---|---|
| load 0.760, per hit | 1.031 | 1.036 | 1.023 | **1.014** |
| load 0.760, per miss | 1.052 | 1.061 | 1.036 | **1.025** |
| load 0.799, per hit | 1.039 | 1.066 | 1.044 | **1.028** |
| load 0.799, per miss | 1.086 | **1.122** | 1.081 | **1.052** |

The drift is real, it saturates rather than growing (5, 20, 100 and 400 turnovers give 1.039, 1.036,
1.035 and 1.035 per hit at load 0.76), and it is worth about 0.036 groups on a miss at the fullest
point of the sawtooth and almost nothing at the emptiest.

That is the honest difference from a tombstone design, and it is smaller than a tombstone's -- but
it is not zero, and I had it written down as zero for a while, because "a churned table is identical
to a fresh one" is true of backward shift deletion and I carried it over. **It is also smaller than
I had it written down as second.** An earlier instrumentation of mine recorded 1.14 groups per hit
and 1.27 per miss at load 0.76, and I quoted those for weeks. Re-instrumenting the probe to produce
the table above reproduces its *fresh* figures to three digits and its churned ones nowhere near --
1.036 and 1.061 against 1.14 and 1.27 -- so either that harness churned differently in a way that
matters or the number was wrong. The two right-hand columns of the table are measured with the same
instrument as the rest of it and are the ones to use.

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

The two right-hand columns of the table above are what it does, and they say something better than
"it takes the drift back": with four writing hits per round **the churned table probes better than a
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

| entries | control, no writing hits | with one writing hit per round | on hits | on the churn round |
|---|---|---|---|---|
| 52,363 (in L2) | 0.951 | **1.107** | 1.041 | 1.012 |
| 838,860 (L3) | 0.998 | **1.101** | 1.003 | -- |
| 3,355,443 (past L3) | 0.997 | **1.099** | 0.991 | -- |

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
shape of anything in my benchmark suite, which is why the score reads 1.000 on this change and always
will.

The first measurement of it said 1.49x on misses and was wrong -- a paired run of two headers in one
binary, where the code layout of the losing side moved. Note that the control row above reads 0.951
at 52,363 entries, which is that same effect, still there, measured rather than guessed at. The rule
it leaves is in [chapter 19](#how-measured).

## Where the indices live: one array or two

The value indices used to be a second array beside the groups, and a comment in the header recorded
that the split had been tried against a merged block years ago and was 10% faster on a build. That
verdict came from a regime that no longer describes where the cost is, so it was re-tested: one 88
byte block, `struct block : Group` so every existing use of the metadata reads unchanged, no padding,
the same bytes in one allocation instead of two.

Memory is unchanged to the byte. The score moves 1.5-2.2% and finds move 4.4-5.3%, and the reason to
believe it is not the score but the counters -- one map per binary, all-hits lookups at 200000,
800000 and 4M entries, split against merged: **7% fewer instructions** (66.9 to 62.0 per lookup),
because the index is at a fixed offset from the group rather than a second address to compute;
**12-14% fewer L1 misses**; and **28% fewer dTLB misses at 4M** (5.30 to 3.79), because a lookup
touches two regions rather than three.

Two other layout questions on the same axis, both measured and both ties or losses. Splitting the
fingerprints and the counters into *two* arrays -- so that four groups' fingerprints fit a cache
line exactly, where a 24 byte group straddles one time in four -- is a tie both in cache and on a
20M entry table whose index is 37 MB (57.1 against 57.0 ns per hit). The straddle is free because
the second line is the adjacent one; the counter line is free because its address depends only on
the group, so it issues beside the fingerprint load rather than after it. And a 16 bit value index
for small maps -- CPython's compact dict, sized to the table -- measures **0.986** over the thirteen
workloads that fit under 2^16 entries, and the reason kills the adaptive version too: a map small
enough to be indexed in 16 bits has an index of at most 128 KB, which is already in L2, so halving
something that already fits buys nothing, and the maps whose index footprint hurts are exactly the
ones that need more than 16 bits.

## Growth: the pipelined rehash

Placement is shift-free, so a rehash can place in any order. The loop hashes sixteen elements ahead
of the one it places and prefetches the group each will land in. Below cache that is 1.26x for the
pipelining alone; above cache it is everything for strings, whose hash has work to hide a miss
behind -- 2.5x at 2M and 4M entries -- and nothing at all for integers at 176 MB, because that loop
is bound by the TLB rather than by latency (1.15 dTLB misses per placement on 4 KB pages, and a
prefetch cannot hide a page walk).

Two things around it are worth recording. A database-style **radix partition** of the elements by
the top bits of their group cuts the dTLB misses to 0.24 and halves the isolated loop from 4M
entries up -- and end to end it is indistinguishable, because the scratch array is fresh memory
every time and faulting it in costs about a microsecond a page, and a rehash is a minority of a
large build anyway. And the loop used to index the value container, `m_values[value_idx]`, which
cost clang **a memory latency per element**: placing an entry stores a `std::uint8_t` fingerprint,
that store may alias any object including the container's own data pointer, so the next iteration
had to reload the pointer before it could form the address of the next key -- and the random group
access could not start until that resolved. Walking with an iterator instead took the growth phase
from 10.43 ns per insert to 2.74 and the whole 200000 element build from 16.72 ms to 8.96. gcc had
disambiguated it on its own, which is exactly why comparing two compilers' absolute times is worth
doing.

## What the compiler decides

Two of the largest single numbers on this branch are not design changes at all.

`probe` is marked force-inline, because **gcc leaves it out of line in a large translation unit** --
its unit-growth budget runs out and the probe, bigger with the SWAR match, is what it stops inlining.
The whole design assumes the probe is inlined; the prefetch, the hoisted pointers and the early exit
only pay inside the caller. With the attribute, gcc's score against 4.11.0 went from 1.149 to
**1.244** with SSE2 and from 1.097 to 1.165 without, and the string lookups that were the one family
behind 4.11.0 came out ahead of it. clang measures 1.00 everywhere, having inlined it already.

And clang splits the insert path in two: `do_try_emplace` gets a six register prologue and calls
`do_place_element` out of line, which clang refuses to inline at cost 480 against a threshold of 250
(`vector::emplace_back` with `piecewise_construct` is 225 of that). Per insert on a reserved table,
net of the loop:

| compiler | unordered_dense, insert | boost | unordered_dense, `operator[]` on a present key |
|---|---|---|---|
| clang 22 | 128 instructions, 39 cycles | 64, 26.5 | 74 instructions |
| gcc 16 | 82 instructions, 26 cycles | 55, 23 | 68 instructions |

Forcing the inline takes the miss path to 100 instructions and 32 cycles and raises `operator[]` on
a *present* key from 74 to 88, because the merged function pays the placement code's register
pressure on the path that never places. Net geomean 1.012, every interval excluding parity, so it is
applied -- with the trade written above the attribute so it can be reversed knowingly.

## The hash it is given

A hash for a map is chosen on **latency**, not throughput, because its result is the address of the
group to probe and nothing after it can start. That sounds obvious and it orders candidates by more
than 2x. An AES-NI hash is a quarter faster in a hashing loop and, in the map, 9 to 37% slower on
every single workload -- worst (0.63x) on the one that cannot overlap anything, a random hit, and
least bad (0.91x) on a build, whose rehash hashes sixteen ahead. One hasher per binary, 30M
all-hits lookups: AES executes **fewer instructions** (5.15G against 5.35G) and takes **59% more
cycles**, IPC 1.30 down to 0.79. That is a dependency chain, not extra work.

Four further latency tunings of the string hash -- fewer length branches, the length out of the
finalizer, both -- looked decisive in a standalone harness (1.40x, clang and gcc agreeing to 0.02 ns)
and are worth exactly nothing in the map. The harness lied in a way worth naming: to make lengths
unpredictable it chained through key selection, `x = hash(keys[x & mask])`, which puts the key's
*length* on the dependency chain. A real lookup has no such edge -- the caller already holds the key,
so its length is known before the hash starts and only the bytes are loaded.

What did work is restructuring the block range so that every 16 byte block up to 144 bytes is mixed
independently and folded into one finalizer, instead of chaining blocks through the seed: latency is
one multiply plus the finalizer for any length in that range. Paired on the suite that is
`hashstr` 1.13, string misses 1.08, string insert-erase 1.09, string builds 1.07.

## Good at, pays for

Good at: no tombstones and a counter that comes back down, so a table that churns at a fixed size
degrades by 1 to 3% in probe length and then stops; the dense value vector, so iteration is an
array walk and a 64 byte value costs the vector rather than the table; 5.5 bytes of metadata per
slot; and a bound that makes a hostile hash slow rather than endless.

Pays for: one more dependent load on every hit than a flat map, which is the family cost and does
not go away; a rehash that has to move values as well as indices; and an erase that hashes the moved
element's key, which is free for an integer and about 50 ns for a string.

# 13. Two more, measured rather than read: Verstable and ihtab {#two-more}

Two C libraries that are not in anybody's benchmark round-up and should be. Both compile as C++
unchanged, so both went into the same binary as everything else.

## Verstable: a 16 bit word with a chain in it

[Verstable](https://github.com/JacksonAllan/Verstable) by Jackson Allan packs everything into two
bytes per bucket:

```c
#define VT_EMPTY               0x0000
#define VT_HASH_FRAG_MASK      0xF000 // 0b1111000000000000.
#define VT_IN_HOME_BUCKET_MASK 0x0800 // 0b0000100000000000.
#define VT_DISPLACEMENT_MASK   0x07FF // 0b0000011111111111, also denotes the displacement limit.
```

[![Verstable's 16 bit metadatum and the chain it threads](/img/2026/hashmap-index/verstable-word.svg)](/img/2026/hashmap-index/verstable-word.svg)

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
alternative in [chapter 12](#group-index), and what it is worth there is 2-3% in cache and nothing
out of it, because 80% of what a counter fails to filter is siblings, which an exact test also has
to follow.

**What it costs is branches, and that is the whole result.** One map per binary, 30M lookups at
50000 entries, from the counter table in [chapter 16](#same-workloads):

| | instructions | cycles | branch misses | L1 misses |
|---|---|---|---|---|
| miss, group index | 57.2 | 20.7 | 0.108 | 3.41 |
| miss, boost | 54.2 | 20.4 | 0.164 | 1.90 |
| miss, Verstable | **44.6** | **40.8** | **0.806** | 1.96 |

A Verstable miss executes **22% fewer instructions than a group probe and takes twice the cycles**.
The design delivers exactly what it advertises -- fewest instructions, fewest cache lines touched --
and hands all of it back at the branch predictor, because "is my home bucket a chain head, and how
long is the chain" is a data-dependent decision on every lookup where a group compare is not. At
load 0.9 about 59% of misses land on a chain head and have to walk it.

Its build is where it is weakest, and for a related reason: a rehash re-runs the whole insert for
every key, and an occupied home bucket calls `evict`, which re-hashes the occupant and walks *its*
chain. Growth costs it 143 instructions and 79 cycles per element against unordered_dense's 44 and 12,
at 2.398 branch misses per element against 0.132.

Memory is where it wins: 18 bytes per slot at a 0.9 maximum load is the leanest of everything here.

## ihtab: eight slots at half load

[ihtab](https://github.com/vnmakarov/ihtab) by Vladimir Makarov is an eight slot SSE group, and --
unusually -- it is a **dense** map like this one: elements are appended to an `els` array in
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
merged layout [chapter 12](#group-index) arrived at, at half the width. `EMPTY_H7` is `0xc0` and
`DELETED_H7` is `0x80`, chosen so that both have the top *two* bits set and `match_empty` is one
`movemask(g & (g << 1))`. Probing is linear over groups.

It is quick, and the reason is on the label: `LF_FACTOR / LF_DIVISOR` is **one half**, so a lookup
almost always lands in its home group and the tag compare is the whole probe. Buying probe length
with memory is available to every design in this post and is not an idea about the index -- it is the
same axis the two-bit counter sat on, filtering best when fresh.

The element array is never compacted: erased elements are marked in a `deleted` bitmap and
`els_bound` only grows, so a table that churns rebuilds itself periodically rather than filling a
hole. That has two measurable consequences, and both are in [chapter 16](#same-workloads). Memory
across a turnover goes 36.1 to **72.3** bytes per entry and stays there, because the table carries
one dead element for every live one until it rebuilds. And it is the one dense map here that does
*not* get the dense map's iteration: an iterator has to consult the deleted bit for every element,
and that branch stops the loop vectorising, so it iterates at 7.3x unordered_dense 5.0 rather than at 1.0.
Being dense buys the iteration only when the array holds live entries and nothing else.

## ixhtab, and the bug that a constant-size churn finds

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
halves the live occupancy of both halves, and nothing merges back. At a constant 50000 live elements
over 40 turnovers the heap goes **1.4 MB to 44.8 MB**, 29.5 to 938.9 bytes per element and still
doubling, and a hit goes from 8.2 ns to 17-30. `ihtab::rebuild()` has the same-shaped test and is
correct there, because both quantities describe the same single table.

Reported as [vnmakarov/ihtab#2](https://github.com/vnmakarov/ihtab/issues/2) with a reproducer. The
transferable part is not the bug, it is the test: **a workload that holds the element count exactly
constant while churning is the only one that can see this class of fault**, and it is the workload
most hash map benchmarks do not have.

# 14. The summary table {#summary-table}

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
| indivi `flat_umap` | quadratic over groups | **a per-class overflow counter** | no | no | 0.875 | **no** |
| indivi `flat_wmap` | quadratic, no groups | an empty byte in the window | **yes** | no | 0.80 | -- |
| Verstable | quadratic chain | **an exact in-home-bucket bit** | no | evicts at most one key | **0.90** | yes |
| ihtab | linear over groups | an empty tag in the group | **yes** | no | **0.50** | yes |
| unordered_dense 5.0 | triangular over groups | a per-class overflow counter | no | **only a hit inside a write, to its own home** | 0.80 | yes |
| `std::unordered_map` | **a linked list per bucket** | the end of the list | n/a | no | 1.0 | yes |

Three ways to read those tables.

**Down the "a miss stops on" column** is the last five years of hash map work. An empty slot is the
classic answer and it is what forces tombstones. Everything else in that column is an attempt to
answer the question without needing an empty slot: an ordering (2018), an overflow bit (2022), a
counter that an erase can undo (2019, and again in 2024 with the class split), an exact bit (2023).
The designs with **no** in the tombstone column are exactly the designs with something other than
"empty" in the miss column, and that is not a coincidence -- it is the same choice written twice.

**Down "metadata per slot"** is the memory the index costs before any key is stored. One byte is the
SwissTable floor; boost gets fifteen slots out of sixteen bytes; indivi spends two bytes to hold
three separate things. The dense maps look expensive here -- 5.5 or 8 bytes -- and are not, because
that is the only place they pay for the value's location, where a flat map pays for it by keeping
`sizeof(value_type)` of empty slot. [Chapter 16](#same-workloads) measures what it actually costs
per live entry, and the ordering is nearly the reverse of this column.

**Down "compared at once"** is what the branch predictor sees, and it explains more of the
measurements than anything else in either table. A design that asks one question of sixteen slots
has one unpredictable branch per group; a design that asks a question per slot, or walks a chain,
has one per element visited. Verstable executes 22% fewer instructions per miss than the group
index and takes twice as many cycles, entirely for this reason.

# 15. What one lookup touches {#what-one-lookup-touches}

The tables above are static. This is the same information as a picture of the *chain*: what a hit
has to wait for, in order, where every arrow is a load whose address the box before it produced.

[![The dependent load chain of a hit, per design](/img/2026/hashmap-index/lookup-touches.svg)](/img/2026/hashmap-index/lookup-touches.svg)

Every arrow is a load whose address the box before it produced, so nothing after it can start early.

Three things are worth taking from it.

**The dense designs have one more box.** Metadata, then a value index, then the value. That is the
family cost from [chapter 3](#three-families) and it is not recoverable by any amount of index
cleverness -- it is what the dense layout *is*. What varies is how bad the extra box is: in the group
index the index lives in the same 88 byte block as the fingerprints that produced it, so the second
load is usually in a cache line the first one already brought in, which is worth 28% of the dTLB
misses at four million entries. ihtab has the same arrangement. emhash8's index word carries the
index and the chain link together, so its extra box is folded into the first one, and it pays
elsewhere.

**Boxes at the same depth are not the same cost.** A group compare is one `movdqu`, one `pcmpeqb`
and one `pmovmskb` producing sixteen verdicts and one branch. A chain step is a load and a branch
the predictor has to guess. They occupy the same position in the picture and differ by a factor of
two in cycles, which is [chapter 13](#two-more)'s result.

**The chained designs have a variable number of boxes**, and the variability is the cost rather than
the average. emhash8's chains are short -- close to one at load 0.8 -- and Verstable's are short too.
What costs is that "is there a chain" and "is it over" are decisions, and at load 0.9 about 59% of
Verstable's misses land on a chain head.

# 16. The same workloads on every map {#same-workloads}

Eighteen maps for an integer key and sixteen for a string, seven workloads, three table sizes, three key and value shapes, all in one process with
the alternatives interleaved. Everything below is **time relative to `ankerl::unordered_dense` 5.0**,
so 1.00 is level with it and **below 1.00 is faster than it**. Every figure is the geometric mean of
five sizes spanning one doubling; [chapter 19](#how-measured) says why, and how to rerun any of it.

Seven workloads: **build** from empty with no reserve; **hit**, **miss** and **50% hits**, random
lookups on a freshly built table with an rng that never replays; **iterate**, summing every mapped
value; **churn**, erasing one and inserting one at a constant size, with a key the map has never
held; and **insert/erase**, a mix of `operator[]` and `erase` on a table that grows and shrinks.

## Integer keys

[![Every map on build, hit, churn and iterate, relative to the group index](/img/2026/hashmap-index/bench-u64.svg)](/img/2026/hashmap-index/bench-u64.svg)

`map<uint64_t, size_t>`, octave from 32,000 entries -- so the index is comfortably in L2 and the
values in L3, which is where most maps in most programs live:

| map | build | hit | miss | 50% hits | iterate | churn | insert/erase |
|---|---|---|---|---|---|---|---|
| unordered_dense 5.0 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| unordered_dense 4.11 | 2.32 | 1.52 | 1.57 | 1.42 | 1.04 | 1.46 | 1.38 |
| boost flat | 1.66 | **0.79** | **0.83** | **0.87** | 12.52 | **0.76** | **0.87** |
| boost flat, own hash | 1.68 | **0.80** | **0.83** | **0.87** | 10.67 | **0.75** | **0.89** |
| absl flat | 1.61 | **0.73** | 1.38 | **0.99** | 13.68 | 1.19 | 1.23 |
| absl flat, own hash | 1.12 | **0.76** | 1.43 | **0.94** | 14.68 | 1.19 | 1.23 |
| F14Value | 1.69 | **0.91** | 1.47 | 1.08 | 8.65 | 1.22 | 1.27 |
| F14Vector | 1.76 | 1.06 | 1.10 | 1.06 | 1.56 | 1.34 | 1.36 |
| emhash8 | 2.87 | 1.19 | 2.13 | 1.50 | 1.07 | 1.22 | 1.23 |
| emilib | 1.89 | 1.09 | 1.13 | 1.11 | 6.15 | **0.94** | 1.08 |
| indivi flat_umap | 1.62 | **0.82** | **0.97** | **0.89** | 6.25 | **0.69** | **0.86** |
| indivi flat_wmap | 1.86 | **0.71** | **0.83** | **0.82** | 9.68 | **0.93** | **0.94** |
| Verstable | 3.12 | 1.07 | 2.10 | 1.36 | 11.64 | 1.10 | 1.13 |
| ihtab | 1.08 | **0.99** | 1.08 | 1.03 | 7.32 | 1.13 | 1.11 |
| std::unordered_map | 5.54 | 1.91 | 3.97 | 2.23 | 34.16 | 2.08 | 2.08 |
| boost node | 4.45 | 1.15 | **0.86** | 1.14 | 14.28 | 1.35 | 1.39 |
| absl node | 3.95 | 1.06 | 1.38 | 1.12 | 15.54 | 1.90 | 1.68 |
| F14Node | 4.15 | 1.14 | 1.33 | 1.22 | 12.47 | 2.06 | 1.84 |

Read it by column and the chapters fall out of it.

**The miss column is the chapter 1 question, answered.** abseil is the fastest map here on a hit
(0.72) and the *slowest* of the group designs on a miss (1.38), because its miss has to find an empty
control byte and at load 7/8 that is often not in the home group. boost (0.82), indivi's `flat_umap`
(0.97) and unordered_dense 5.0 all stop at home almost always, because all three have an explicit test for
"did anything of my class overflow past here" rather than relying on an empty slot. That single
column is the whole reason the overflow byte and the overflow counter were invented, and it is worth
1.4 to 1.7x between two otherwise nearly identical SwissTables.

**The chained designs pay for the miss too, and more.** emhash8 at 2.11 and Verstable at 2.09 are the
two worst misses of any modern design here, and the counters below say it is not
instructions -- Verstable executes 22% *fewer* of them than unordered_dense 5.0 and takes twice the cycles.
A chain has to be walked to its end, and whether there is one is unpredictable.

**The iterate column is very nearly the family split.** 1.00 to 1.56 for the dense maps, 6 to 15x
for every flat map, 12 to 34x for the node maps -- the largest ratios in the post by a factor of ten,
and they come entirely from a flat map having to walk its empty slots. The exception is ihtab at
7.32, which is dense and iterates like a flat map anyway: its element array is append-only, so an
iterator has to consult a deleted-bitmap for every element, and that branch stops the loop
vectorising. Being dense buys the iteration only if the array holds live entries and nothing else.

**The build column has a surprise in it**, and it is not about the index: `absl flat, own hash`
builds at 1.12 where `absl flat` with unordered_dense's wyhash builds at 1.61. `absl::Hash<uint64_t>` is
much cheaper than a wyhash multiply for an integer key, and a build is the workload that hashes
most. Same map, same index, same everything -- 1.4x apart on the hash alone. It is the clearest
argument in this post for why the "same hash for all" convention needs the own-hash control beside
it.

At an octave from 500,000 entries -- the index out of L2, the values out of L3 -- the picture tilts:

| map | build | hit | miss | 50% hits | iterate | churn | insert/erase |
|---|---|---|---|---|---|---|---|
| unordered_dense 5.0 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| unordered_dense 4.11 | 2.05 | 1.46 | 1.51 | 1.47 | **1.00** | 1.27 | 1.21 |
| boost flat | 1.38 | **0.76** | **0.65** | **0.76** | 6.04 | **0.53** | **0.66** |
| boost flat, own hash | 1.37 | **0.77** | **0.65** | **0.75** | 5.74 | **0.53** | **0.66** |
| absl flat | 1.42 | **0.70** | **0.73** | **0.72** | 8.15 | **0.64** | **0.78** |
| absl flat, own hash | 1.08 | **0.70** | **0.75** | **0.71** | 8.33 | **0.64** | **0.77** |
| F14Value | 1.95 | **0.86** | 1.18 | **0.96** | 4.31 | **0.99** | 1.01 |
| F14Vector | 1.93 | 1.15 | 1.09 | 1.13 | 1.02 | 1.04 | 1.11 |
| emhash8 | 2.55 | 1.03 | 1.14 | 1.07 | **1.00** | **0.92** | **0.92** |
| emilib | 1.61 | **1.00** | **0.74** | **0.95** | 3.52 | **0.71** | **0.77** |
| indivi flat_umap | 1.39 | **0.81** | **0.85** | **0.83** | 3.60 | **0.55** | **0.70** |
| indivi flat_wmap | 1.75 | **0.64** | **0.60** | **0.63** | 4.65 | **0.63** | **0.58** |
| Verstable | 2.59 | **0.74** | **0.92** | **0.78** | 5.37 | **0.67** | **0.69** |
| ihtab | 1.28 | 1.00 | 1.11 | 1.05 | 2.92 | **0.70** | **0.78** |
| std::unordered_map | 5.99 | 1.72 | 3.47 | 2.08 | 60.40 | 1.84 | 1.89 |
| boost node | 4.83 | 1.15 | **0.80** | 1.11 | 29.51 | **0.96** | 1.12 |
| absl node | 4.48 | 1.05 | **0.93** | 1.04 | 15.91 | 1.12 | 1.19 |
| F14Node | 5.10 | 1.07 | 1.20 | 1.13 | 22.46 | 1.49 | 1.44 |

**The dense penalty grows with the table.** boost goes from 0.79 to 0.76 on a hit and from 0.82 to
**0.63** on a miss; abseil from 0.72 to 0.70 and from 1.38 to 0.72. That is the extra dependent load
of [chapter 3](#three-families) turning from a few cycles into a cache miss and a TLB entry, and it
is the one cost of the dense layout that no index work removes. It is also why boost's *miss*
improves so much: once every lookup is waiting on memory, the number of regions touched matters more
than which of them the probe stops at.

**And the load factor stops being the story.** `indivi::flat_wmap`, the fastest hit at every size, is
0.62 here -- but it is also the map with the widest sawtooth, and at the 32,000 octave its cheapest
and dearest points are 2.12x apart where the group designs are 1.5 to 1.6x apart. A number for it at
one size would have been worth very little.

## String keys

[![Every map on the string workloads, relative to the group index](/img/2026/hashmap-index/bench-str.svg)](/img/2026/hashmap-index/bench-str.svg)

`map<std::string, size_t>`, keys 8 to 135 bytes skewed towards short, octave from 32,000:

| map | build | hit | miss | 50% hits | iterate | churn | insert/erase |
|---|---|---|---|---|---|---|---|
| unordered_dense 5.0 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| unordered_dense 4.11 | 1.21 | 1.12 | **0.97** | 1.07 | 1.01 | 1.03 | 1.05 |
| boost flat | 1.41 | **0.87** | **0.84** | **0.88** | 4.08 | **0.87** | **0.87** |
| boost flat, own hash | 1.60 | 1.14 | 1.25 | 1.10 | 3.86 | **0.92** | 1.00 |
| absl flat | 1.25 | **0.92** | **0.98** | **0.88** | 5.08 | **0.93** | **0.96** |
| absl flat, own hash | 1.24 | **0.95** | **0.99** | **0.90** | 5.31 | **0.93** | **0.96** |
| F14Value | 1.36 | **0.98** | **0.99** | **0.95** | 3.48 | **0.93** | **1.00** |
| F14Vector | 1.24 | **0.97** | **0.88** | **0.96** | **0.99** | 1.01 | 1.01 |
| emhash8 | 1.73 | **0.96** | 1.12 | **0.98** | **0.96** | 1.09 | 1.10 |
| emilib | 1.55 | **0.94** | **0.92** | **0.96** | 3.39 | **0.91** | **0.98** |
| indivi flat_umap | 1.45 | **0.96** | 1.02 | **0.95** | 2.77 | **0.80** | **0.99** |
| indivi flat_wmap | 1.38 | **0.89** | **0.90** | **0.90** | 3.64 | **0.95** | **0.95** |
| std::unordered_map | 2.62 | 1.13 | 2.39 | 1.38 | 45.36 | 1.64 | 1.54 |
| boost node | 1.90 | **0.83** | **0.89** | **0.85** | 10.42 | 1.10 | 1.02 |
| absl node | 1.92 | **0.87** | 1.02 | **0.85** | 7.80 | 1.12 | 1.08 |
| F14Node | 1.70 | **0.87** | **0.97** | **0.85** | 8.42 | 1.08 | 1.09 |

**Nearly everything is within 15% of everything else**, because the hash and the key comparison are
most of the work and every map is being handed the same hash. That is worth saying plainly: for
string keys, the index you choose is close to irrelevant and the hash you choose is not.

Which is exactly what the own-hash control rows show. On this workload, with the hash a caller gets
by writing the type name and nothing else:

| | boost, this wyhash | boost, its own hash | abseil, this wyhash | abseil, its own hash |
|---|---|---|---|---|
| hit | 0.87 | **1.14** | 0.92 | 0.96 |
| miss | 0.85 | **1.26** | 0.98 | 0.99 |
| build | 1.43 | 1.61 | 1.25 | 1.24 |
| churn | 0.87 | 0.92 | 0.93 | 0.93 |

`boost::hash<std::string>` costs boost 31% on a hit and 48% on a miss and turns a map that is ahead
of unordered_dense 5.0 into one that is behind it. `absl::Hash<std::string>` costs abseil 1 to 4% and
changes nothing. So the often-quoted "boost is faster on string lookups" is a statement about boost
*given unordered_dense's hash*; out of the box it is not, and abseil's default is the one that holds up.
For an integer key it is the other way round: both defaults are cheaper than a wyhash multiply, and
abseil's is 1.4x cheaper on a build.

## A 64 byte mapped value

[![Every map with a 64 byte mapped value, relative to the group index](/img/2026/hashmap-index/bench-big.svg)](/img/2026/hashmap-index/bench-big.svg)

`map<uint64_t, some_64_byte_struct>`, octave from 32,000. This is the axis that separates flat from
dense and nothing else changes:

| map | build | hit | miss | 50% hits | iterate | churn | insert/erase |
|---|---|---|---|---|---|---|---|
| unordered_dense 5.0 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| unordered_dense 4.11 | 1.95 | 1.39 | 1.56 | 1.35 | **1.00** | 1.39 | 1.26 |
| boost flat | 1.73 | **0.90** | **0.83** | **0.94** | 4.07 | **0.75** | **0.84** |
| boost flat, own hash | 1.72 | **0.90** | **0.83** | **0.93** | 3.87 | **0.75** | **0.83** |
| absl flat | 1.22 | **0.81** | 1.40 | **0.83** | 3.07 | **0.88** | **0.95** |
| absl flat, own hash | **0.94** | **0.83** | 1.42 | **0.82** | 3.12 | **0.88** | **0.95** |
| F14Value | 1.76 | 1.05 | 1.56 | 1.07 | 3.35 | 1.13 | 1.17 |
| F14Vector | 1.78 | 1.08 | 1.10 | 1.08 | 1.02 | 1.17 | 1.19 |
| emhash8 | 2.53 | 1.04 | 2.16 | 1.13 | 1.05 | 1.09 | 1.02 |
| emilib | 1.76 | 1.10 | 1.14 | 1.14 | 2.81 | **0.89** | 1.00 |
| indivi flat_umap | 1.61 | **0.89** | **0.95** | **0.94** | 2.80 | **0.72** | **0.88** |
| indivi flat_wmap | 1.80 | **0.76** | **0.84** | **0.85** | 3.21 | **0.89** | **0.81** |
| std::unordered_map | 5.26 | 1.44 | 4.21 | 1.55 | 25.41 | 1.84 | 1.77 |
| boost node | 3.91 | 1.08 | **0.88** | 1.08 | 5.89 | 1.12 | 1.17 |
| absl node | 3.49 | 1.01 | 1.36 | 1.05 | 4.71 | 1.40 | 1.24 |
| F14Node | 3.55 | 1.05 | 1.33 | 1.10 | 4.82 | 1.67 | 1.42 |

**Building is 1.6 to 1.8x faster dense** than every flat map given the same hash, because growth
copies four byte indices rather than 72 byte slots, and **iteration is 2.8 to 4.1x faster dense**,
because there are no empty 72 byte slots to walk. Both gaps grow with the value. The one exception
in the build column is abseil with its own integer hash at 0.94, which is the same 1.4x hash effect
as in the integer table showing through a workload that is half hashing.

Against that, the flat maps keep their lookup and churn advantage -- boost is still 0.75 on churn --
so the trade is exactly what [chapter 3](#three-families) says it is, at the value size where it is
easiest to see.

## Memory

[![Bytes per entry with a 64 byte value, before and after churning](/img/2026/hashmap-index/memory-big.svg)](/img/2026/hashmap-index/memory-big.svg)

Bytes of heap per live entry, counted by `mallinfo2` around a build and then around a full turnover
of churn, geometric mean over the same octave. Two columns, because the second is the memory cost of
whatever an erase leaves behind.

| map | 8 byte value, steady | after churn | 64 byte value, steady | after churn |
|---|---|---|---|---|
| absl flat | **27.0** | 31.0 | 113.3 | 130.2 |
| indivi `flat_umap` | 28.6 | **28.6** | 114.9 | **114.9** |
| Verstable | 28.6 | **28.6** | -- | -- |
| boost flat | 29.2 | **29.2** | 122.1 | **122.1** |
| F14Value | 29.2 | **29.2** | 114.1 | **114.1** |
| emilib | 27.0 | **27.0** | 130.2 | **130.2** |
| indivi `flat_wmap` | 31.0 | 35.7 | 130.2 | 149.5 |
| unordered_dense 5.0 | 32.6 | **32.6** | **107.6** | **107.6** |
| F14Vector | 33.7 | **33.7** | 115.3 | **115.3** |
| ihtab | 36.1 | **72.3** | -- | -- |
| unordered_dense 4.11 | 37.3 | **37.3** | 112.3 | **112.3** |
| emhash8 | 38.0 | **38.0** | 117.0 | **117.0** |
| `std::unordered_map` | 43.6 | 43.6 | 108.4 | 108.4 |
| boost node | 47.7 | 47.7 | **95.4** | **95.4** |
| absl node | 46.5 | 48.6 | **94.2** | 96.3 |
| F14Node | 46.8 | 46.8 | **94.5** | **94.5** |

`uint64_t` keys, octave from 32,000 entries; the flat maps hold a 16 or 72 byte `value_type` and the
dense ones hold the same in a vector plus their index.

**At an eight byte value the flat maps win and it is close.** 27 to 29 bytes per entry against 32.6
for unordered_dense 5.0, which is one byte of metadata per slot at load 0.875 against 5.5 bytes at 0.8 --
plus the doubling overhang of a `std::vector`, which is what most of the gap actually is.

**At a 64 byte value the order reverses completely, and the node maps win.** A flat map pays for
every empty slot at the full width of the value: at load 0.875 that is 82 bytes of slot for 72 bytes
of data before any metadata. A dense map pays 72 bytes plus 5.5 of index. A node map pays 72 plus a
pointer plus the allocator's header and is the leanest of the three, which is the one column where
`std::unordered_map` is competitive with anything.

**The churn column is where tombstones show up as bytes.** Everything with `no` in the tombstone
column of [chapter 14](#summary-table) is flat across a turnover, to the byte. abseil goes 27.0 to
31.0 and 113.3 to 130.2, because its tombstones count against the growth budget and a churning table
therefore rehashes into a bigger one; `indivi::flat_wmap` does the same, 31.0 to 35.7. emilib has
tombstones and does *not* grow, because it counts only live elements against its limit -- so it pays
in probe length instead, which is the trade the other way round.

**And ihtab doubles**, 36.1 to 72.3 and stays there. Its element array is append-only and erased
elements are marked in a side bitmap rather than reclaimed, so a table that churns carries one dead
element for every live one until it rebuilds. That is a design choice rather than a fault -- unlike
its extendible-hashing sibling [`ixhtab`](#two-more), where the same property meets a bin-splitting
test that reads a table-wide count against a per-bin size and the memory does not stop growing at
all.

## Counters

Times are ratios; counters are not. One map per binary, `perf stat`, 30 million lookups on a table
of 50,000 entries -- the index in L1 and L2, so what is being counted is the *work*, not the memory
system. Per lookup:

| | ns | instructions | cycles | branch misses | L1 misses | IPC |
|---|---|---|---|---|---|---|
| **all hits** | | | | | | |
| indivi `flat_wmap` | **3.67** | **48.0** | **19.8** | 0.035 | 3.29 | 2.42 |
| absl flat | 4.00 | 56.1 | 21.4 | 0.044 | 3.52 | 2.62 |
| boost flat | 4.33 | 57.0 | 24.8 | 0.094 | 3.84 | 2.30 |
| indivi `flat_umap` | 4.33 | 54.3 | 23.8 | 0.065 | 3.73 | 2.28 |
| F14Value | 4.67 | 64.0 | 25.2 | **0.022** | 3.80 | 2.54 |
| ihtab | 5.33 | 53.8 | 28.7 | **0.022** | 3.23 | 1.87 |
| unordered_dense 5.0 | 5.67 | 60.5 | 29.4 | 0.065 | 4.22 | 2.06 |
| emilib | 5.67 | 73.1 | 32.2 | 0.099 | 2.86 | 2.27 |
| F14Vector | 6.00 | 68.1 | 32.1 | 0.024 | 3.95 | 2.12 |
| Verstable | 6.33 | 61.2 | 34.8 | **0.426** | 3.26 | 1.76 |
| emhash8 | 6.67 | **48.4** | 36.6 | **0.420** | 3.20 | 1.32 |
| unordered_dense 4.11 | 7.67 | 76.8 | 39.1 | 0.161 | 3.49 | 1.96 |
| `std::unordered_map` | 9.67 | **45.1** | 52.4 | 0.325 | 4.22 | 0.86 |
| **all misses** | | | | | | |
| F14Vector | **3.49** | 60.5 | **18.6** | 0.043 | 2.01 | 3.26 |
| indivi `flat_umap` | 3.53 | 52.1 | **18.6** | 0.108 | 1.98 | 2.80 |
| ihtab | 3.79 | 56.2 | 20.0 | 0.044 | 1.98 | 2.81 |
| boost flat | 4.16 | 54.2 | 20.4 | 0.164 | 1.90 | 2.66 |
| unordered_dense 5.0 | 4.19 | 57.2 | 20.7 | 0.108 | 3.41 | 2.76 |
| indivi `flat_wmap` | 4.82 | 49.3 | 25.8 | 0.302 | 2.11 | 1.91 |
| unordered_dense 4.11 | 5.73 | 72.8 | 28.4 | 0.163 | 2.49 | 2.57 |
| emilib | 6.02 | 75.6 | 32.1 | 0.420 | 1.92 | 2.35 |
| absl flat | 6.26 | 61.1 | 32.6 | 0.362 | 3.44 | 1.87 |
| emhash8 | 7.19 | **46.4** | 38.2 | 0.592 | 2.07 | 1.21 |
| Verstable | 7.58 | **44.6** | **40.8** | **0.806** | 1.96 | **1.09** |
| `std::unordered_map` | 12.61 | 52.9 | 68.0 | 0.649 | 3.43 | 0.78 |

**The bottom of the miss table is the whole argument of this post in four rows.** Verstable executes
**44.6 instructions and takes 40.8 cycles**; unordered_dense 5.0 executes 57.2 and takes 20.7. Twenty-eight
percent more work, in half the time, because 0.108 branch misses against 0.806 is about eleven
cycles of pipeline. emhash8 is the same shape. `std::unordered_map` is the same shape again with a
pointer chase on top: 52.9 instructions at an IPC of 0.78.

**abseil's miss is the one flat SwissTable that is expensive**, at 32.6 cycles against boost's 20.4
and 0.362 branch misses against 0.164 -- and [the assembly below](#probe-assembly) says why in two
instructions.

**And nobody is instruction-bound.** Every design here retires between 0.8 and 3.3 instructions a
cycle on a core that can do four; the ones near the top are waiting on the branch predictor, and at
a bigger table they will all be waiting on memory instead. At a million entries, the same all-hits
lookup:

| | ns | cycles | dTLB misses | L1 misses |
|---|---|---|---|---|
| indivi `flat_wmap` | **16.60** | **91.9** | 1.369 | 3.844 |
| boost flat | 17.03 | 87.4 | **1.335** | 4.388 |
| absl flat | 17.57 | 97.8 | 1.340 | 4.250 |
| ihtab | 19.17 | 106.7 | 1.864 | 3.705 |
| Verstable | 20.13 | 111.1 | 1.607 | 3.859 |
| F14Vector | 20.69 | 114.8 | 1.779 | 4.539 |
| indivi `flat_umap` | 21.45 | 118.9 | 1.603 | 4.727 |
| unordered_dense 5.0 | 22.64 | 111.8 | 1.910 | 4.879 |
| F14Value | 22.70 | 126.1 | 1.157 | 4.303 |
| emhash8 | 24.69 | 137.2 | 2.205 | 3.697 |
| boost node | 33.30 | 185.8 | 2.580 | 5.440 |

**The dTLB column is the family split**, and it is the clearest single number for the dense penalty:
1.33 to 1.37 misses per lookup for the flat maps that touch one region, 1.78 to 2.21 for the dense
ones that touch two, 2.58 for a node map that touches a heap allocation. On 4 KB pages a page walk
is not something a prefetch can hide, which is why huge pages are worth 22% here and nobody asks for
them ([chapter 18](#still-on-the-table)).

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
dependent load costs less than the picture in [chapter 15](#what-one-lookup-touches) suggests: the
value index is in the same block and the line is already on its way. On x86 that placement is
compiler-dependent and not tunable in both directions -- clang emits both prefetches before the
`movdqu` and gcc emits them after, and dropping one is a 5-11% clang win and a 12% gcc loss at four
million entries.

And **the match walk is the same three instructions everywhere** -- `tzcnt`, use the lane,
`lea`/`and` to clear it -- which is worth noticing because it is the part everyone gets right. All
the design difference is in the two instructions before and after it.

## Three ways to be fast

Put the counters beside the times and the field sorts into three strategies, none of which dominates.

**Fewest instructions.** Verstable, and emhash8 close behind. A chain visits only keys that belong
to this bucket, so in principle nothing is wasted -- and it loses, because every step is a branch.

**Fewest regions touched.** The flat SwissTables. One allocation, one dependent load after the
metadata, the key right there. This wins on a fresh hit at every size and wins by *more* the larger
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

# 17. Question by question {#question-by-question}

The five questions of [chapter 1](#five-questions), answered with the measurements, plus the
workloads that are not questions about the index but decide which map you want.

**A hit on a fresh table.** The flat SwissTables, and it is not close. One region, one dependent load
after the metadata, and the key is in the group. abseil and boost trade places depending on the hash
and the size; indivi is with them. The dense maps pay one more load and are 1.05 to 1.20x behind;
that is the family cost and no index trick recovers it.

**A miss on a fresh table.** Closer, and the counter designs do well, because a miss that stops at
its home group never touches a key at all -- the metadata compare is the whole lookup, and boost's
overflow bit, indivi's counter and unordered_dense's counter all stop there almost always. The chained
designs are worst here for the opposite reason: a miss has to reach the end of a chain, and whether
there is one is exactly the unpredictable question.

**A table that only churns.** This is where the answers to "gone?" separate. The designs whose miss
test comes back down -- F14's counter, indivi's, unordered_dense's -- hold their probe lengths. The
designs that leave something behind -- abseil's tombstones, boost's overflow bits, emilib's and
ihtab's tombstones -- get slower until a rehash, and pay for the rehash. Whether that shows in a
benchmark depends entirely on whether the benchmark holds the size constant; most do not.

**Iteration.** The dense maps, by an order of magnitude, and it is the single largest ratio anywhere
in this post. A dense map walks exactly the live entries in a contiguous array; a flat map walks the
whole slot array, and at load 0.5 that is twice the memory for the same elements. F14Vector and
emhash8 are here with `unordered_dense`; ihtab is not, because its array is append-only and its
iterator has to check a deleted bit per element.

**Large values.** The dense maps again, for the same reason from the other side: a flat map writes
`sizeof(value_type)` into a hash-scattered slot and copies all of it on every growth, where a dense
map writes four bytes there and appends the payload in order.

**Memory.** Nearly the reverse of the metadata-per-slot column of [chapter 14](#summary-table). A
flat map's cost per *live* entry is `sizeof(value_type) / load factor` plus a byte or two of
metadata, so its footprint is dominated by empty slots at the width of the value; a dense map's is
`sizeof(value_type)` exactly, plus its index at the width of a slot. That crosses over as the value
grows, and where it crosses is measured in [chapter 16](#same-workloads).

**Pointer stability.** Only the node maps, and only they can. If you need a reference to survive an
insert, nothing in the flat or dense families will do it and no amount of measurement changes that.
`unordered_dense::segmented_map` is a partial answer -- it keeps references valid by segmenting the
value vector -- and it is not the same guarantee, because the index still doubles beside itself.

**A hostile hash.** Every design here degrades to linear scanning of a probe sequence, which is fine.
The question is whether it *terminates*: `indivi::flat_umap` does not, and neither did unordered_dense 5.0
until a few days ago, and eight chosen keys are enough to hang either. abseil additionally salts each
table with a per-table seed, which is the only defence here aimed at an adversary rather than at an
accident -- and, measured in unordered_dense in [chapter 6](#swisstable), one that costs zero cycles on a
lookup, so the argument against it is about reproducible iteration order and not about speed.

**Erase by iterator.** indivi, because of the distance nibbles: no hash, no key access. Everything
else re-derives the home from the key.

**Small, short-lived maps.** The maps that allocate nothing until the first insert, and abseil's
recent single-element mode. Worth measuring if that is your workload, because the ranking there is
not the ranking anywhere else.

## Which one, then {#which-one}

If the values are small and the table is mostly read: a flat SwissTable, and
`boost::unordered_flat_map` or `absl::flat_hash_map` are both excellent. If you iterate, or the
values are large, or you want the memory of a dense layout: a dense map, and
`ankerl::unordered_dense` is mine so take the recommendation accordingly. If you need references to
stay valid: a node map, and prefer `boost::unordered_node_map` or `absl::node_hash_map` over
`std::unordered_map`, which is slow for reasons the standard requires.

I wrote [a quiz](/which-hash-map/) about this a few days ago, which asks the questions in an order
that gets to an answer faster than a table does.

# 18. What is still on the table {#still-on-the-table}

Things I know are worth something and have not done.

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

**Huge pages are worth 22% of a large lookup and nothing asks for them.** At 800000 entries and all
hits, unordered_dense 5.0 takes 1.48 dTLB misses and 7.03 L1 misses per lookup against boost's 0.89 and
5.15, while executing only 14% more instructions for 33% more cycles. A third of that gap is address
translation -- a dense map touches two regions per lookup where a flat map touches one.
`/sys/kernel/mm/transparent_hugepage/enabled` is `madvise` on this machine, which is a common
default, and neither the map nor the benchmark ever madvises, so all of it runs on 4 KB pages.
Handing both maps an allocator that `mmap`s 2 MB-aligned and `madvise(MADV_HUGEPAGE)`s: at 800000
entries unordered_dense goes 17.10 to 13.32 ns per hit and boost 9.75 to 7.58, both about 22%. At 200000
entries it is nothing. So it is free speed exactly in the regime a benchmark suite that builds
200000 entries cannot see, it does not change the ranking, and it belongs in an opt-in allocator
rather than in the container.

**Prefetching should probably be tuned per architecture and is not.** Boost tunes it and says so in
a comment: *"ARM architectures get a higher speedup when around the first half of the element slots
in a group are prefetched, whereas for Intel just the first cache line is best."* This library issues
the same two prefetches everywhere. On x86 I did chase it and there is nothing to tune that is right
for both compilers -- dropping the second prefetch is a clang win of 5-11% and a gcc loss of up to
12% at four million entries, because gcc emits the `movdqu` before the prefetches and clang emits
both prefetches before it, so under clang they take load-port slots in front of the load actually on
the critical path. The ARM half of the question is unasked.

**A statistics facility.** Boost has one -- `BOOST_UNORDERED_ENABLE_STATS` keeps running mean and
variance of probe lengths and comparisons per lookup with Welford's algorithm, and indivi has
`GroupStats` for the same purpose. Every probe-length number in this post was produced by hand
editing a copy of a header. A built-in equivalent is the one idea I read in another map that is a
feature rather than a fix.

**F14VectorMap deserves its own comparison.** It is the closest relative `ankerl::unordered_dense`
has and I have never seen the two put side by side properly. There is a row for it in
[chapter 16](#same-workloads), which is a start and not the same thing.

**The string erase's 50 ns.** A dense erase hashes the moved element's key. For an integer that is
free; for a string it is about 50 ns and it is the largest single avoidable cost I know of in this
library. The fix is a back-pointer per value and it loses on the suite as a whole. Something
narrower -- a back-pointer only when the key is expensive to hash, decided at compile time -- has not
been tried.

# 19. How the numbers were made, and how to remake them {#how-measured}

Everything above was measured on one machine: a Ryzen 9 7950X, Fedora, clang 22.1.8 at `-O3
-DNDEBUG -std=c++20`, **default `-march`** -- so plain x86-64, SSE2 and nothing newer. (C++20 is the
harness's dialect rather than any library's: F14 needs it, and every map then gets the same one.) That last one matters
more than it sounds: `-march=native` silently upgrades these SSE2 intrinsics to AVX-512 on this
machine, `vpcmpeqb` into a mask register with no `pmovmskb` at all, so a profile taken that way is
not the code most callers run.

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

**Every ratio is a geometric mean over five sizes spanning one doubling.** This is the thing I would
most like other people's benchmarks to adopt, because it changes answers rather than refining them.
A map doubles its slot array at one size and not at another; between doublings its load factor
sweeps from about a half up to its maximum. Two maps with different maximum loads double at
different sizes, so their sawtooths are out of phase and a measurement at one size compares one map
near the top of its cycle with the other wherever its own cycle happened to be. On unordered_dense's own
suite, against boost: churn at a fixed size read **1.19 at one size and 0.78 over the octave**, and
big-value churn 1.24 and 0.80 -- the sign reversed in both. Same-family comparisons are safe however
they are sampled, because two builds of the same map are in phase and it cancels; cross-family ones
are not.

**The alternatives run interleaved.** [nanobench](https://nanobench.ankerl.com)'s `compare()` runs one epoch of each map per round,
in one process, so a clock ramp or a noisy neighbour lands on all of them and cancels out of the
ratio. Measuring map A to completion and then map B is how two runs of *identical* work came out 140%
apart in an earlier version of my own sweep tool.

**Two independent runs of everything, and they mostly agree.** Of 378 integer ratios, 372 are within
5% of each other between the two runs and the worst is 1.12, on iteration at a thousand entries. The
string ones are noisier -- 309 of 336 within 5%, worst 1.18 -- because a string workload spends most
of itself in the hash and the allocator. Every number quoted above is the geometric mean of the two
runs, and I would not defend any single one of them to better than 5%.

**Anything under 10% is decided one map per binary, with hardware counters.** A binary holding
several maps has a code layout that moves every time any of them changes, by more than the effect
being measured -- I have watched a same-code control read 0.92 in one run and 1.13 in the next, in a
benchmark that never touches the map. `scripts/ab/maps_one.cpp` builds one binary per map per
workload for that reason, and every "instructions per lookup" number in this post comes from it.

The clearest instance of that I have is the per-table seed of [chapter 6](#swisstable). Paired, two
headers in one binary, it read **0.936 on builds, 0.940 on random misses and 0.968 on random hits** --
three workloads, all pointing the same way, which is exactly what a real regression looks like. One
map per binary says it costs **zero cycles** on both lookup paths. The control in that same paired
run, a hash benchmark that never touches a map, read 1.027. If I had stopped at the paired numbers I
would have written up a 4% regression that does not exist.

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
over 400000 mixed operations before any timing is believed, which is what caught Verstable's
`vt_insert` being `insert_or_assign` rather than `try_emplace`; the honest counterpart is
`vt_get_or_insert`.

# Appendix: sources and versions {#appendix}

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
| indivi `flat_umap`, `flat_wmap` | `27ff2ce`, 2025-08-12 | `src/indivi/detail/flat_utable.h`: `MetaGroup`, `match_word`, `get_overflow`, `dec_overflow`, `get_distance`, `find_impl`. `src/indivi/detail/flat_wtable.h`: `MetaWGroup` | [gaujay/indivi_collection](https://github.com/gaujay/indivi_collection) |
| Verstable | `dd83033`, 2025-05-06 | `verstable.h`: the metadatum masks, `vt_hashfrag`, `MAX_LOAD` | [JacksonAllan/Verstable](https://github.com/JacksonAllan/Verstable) |
| ihtab, ixhtab | `1405f8e`, 2026-06-26 | `ihtab.hpp`: the group constants, `do_1`, `rebuild`. `ixhtab.hpp:290` for the bug | [vnmakarov/ihtab](https://github.com/vnmakarov/ihtab) |
| `std::unordered_map` | libstdc++, gcc 16 | -- | -- |

The harness is `scripts/ab/maps.h`, `maps.cpp`, `maps_one.cpp`, `maps.sh` and `maps_one.sh` in the
`unordered_dense` repository, and the figures are generated by `scripts/ab/diagrams.py` and
`scripts/ab/mapsplot.py` in the same place, so every chart in this post can be redrawn from its CSV.

Thanks to the authors of all of these for writing headers that explain themselves. Boost's
`group15` comment, abseil's `static_assert`s, folly's note on why not linear probing and indivi's
saturation assertions are all better documentation than most papers, and about half of this post is
me reading them.
