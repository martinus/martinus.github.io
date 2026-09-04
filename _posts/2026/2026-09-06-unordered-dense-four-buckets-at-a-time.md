---
layout: post
title: Four Buckets at a Time
subtitle: A year of making ankerl::unordered_dense faster, with the SSE2 part explained for people who have never written an intrinsic
---

[`ankerl::unordered_dense`](https://github.com/martinus/unordered_dense) is my C++ hash map. It
has been stable for years, and this year it got the most performance work since I wrote it.
Random lookups with integer keys run **1.6x faster** than they did in January, insert and erase
**1.25x**, and the string find, insert, build and churn workloads gained 14 to 17%. Most of that comes from one idea: the
probe now reads **four buckets at once** with SSE2 instead of one at a time, and the insert and
erase paths do the same with their shifting.

This post is the whole story: how the map is laid out, why the old lookup was slow, what SSE2
actually does (in enough detail that you can read the code without having used it before), how
the numbers were measured, how it compares to `boost::unordered_flat_map`, and the list of
things that did *not* work. The benchmark also lied to me several times along the way, and
those are worth telling too.

All measurements are on a Ryzen 9 7950X with clang 22 at `-O3`, default `-march` (so plain
x86-64: SSE2 and nothing newer), and Boost 1.90 with the same hash function on both sides.

# What a dense map looks like

The map is two arrays. The values live in a `std::vector<std::pair<Key, T>>` in insertion order,
which is what makes iteration a plain array walk and is where the "dense" in the name comes from.
The hash table proper is a separate array of **8 byte buckets**, and a bucket holds no key at
all: only where its value is, and enough of the hash to avoid going there for nothing.

[![The two arrays: 8 byte buckets pointing into the values vector](/img/2026/unordered-dense/layout.svg)](/img/2026/unordered-dense/layout.svg)

The first 32 bits of a bucket, `m_dist_and_fingerprint`, pack two things. The low byte is a
**fingerprint**, 8 bits of the hash. The high 24 bits are the **distance** from the bucket the key
originally hashed to, its home: a key sitting at home has distance 1, a key pushed one bucket
along has distance 2, and 0 means the bucket is empty. Because the distance is in the high bits,
one integer compare orders buckets first by distance and then by fingerprint.

The table is a [robin hood](https://en.wikipedia.org/wiki/Hash_table#Robin_Hood_hashing) table:
along any run of occupied buckets, distances never drop by more than one, and an insert that
finds a bucket occupied by a key *closer to its home than we are to ours* takes the bucket and
pushes that key on. This invariant is what makes an unsuccessful lookup cheap. Walking from the
home bucket, we carry the `dist_and_fingerprint` our key *would* have at each step. The moment a
bucket holds something **less** than that, we know the key is absent: had it been inserted, it
would have taken this bucket. So a probe has exactly three outcomes per bucket: equal (a
fingerprint match, go compare the key), less (the key is not here, stop), or neither (keep
going).

# The lookup, before

Here is the probe as it stood in January, stripped of the unrolling:

```cpp
while (true) {
    if (dist_and_fingerprint == bucket->m_dist_and_fingerprint) {
        if (m_equal(key, m_values[bucket->m_value_idx].first)) {
            return found;
        }
    } else if (dist_and_fingerprint > bucket->m_dist_and_fingerprint) {
        return not_found;                 // robin hood: nothing further can be ours
    }
    dist_and_fingerprint += dist_inc;     // one step further from home
    bucket = &m_buckets[next(bucket_idx)];
}
```

It is short, it is what I would write again, and it has a problem that took me embarrassingly
long to see: it **branches once per bucket**, and the answer at each bucket is a coin flip.

A modern CPU does not wait to see where a branch goes. It guesses, runs ahead on the guess, and
if the guess was wrong it throws away everything it did since and starts over, which on this
machine costs around 16 cycles. The guess comes from a predictor that learns patterns in the
history of branch outcomes, and it is remarkably good at anything with a pattern. But *where in
the chain a key turns up* has no pattern. Most keys sit at home, some one bucket along, a few
two. Every lookup replays the same two branches and the predictor has nothing to learn from.

`perf stat` puts a number on it. Ten million lookups of keys that are all in a map of 50000
`uint64_t` entries:

```
$ perf stat -e cycles,instructions,branches,branch-misses ./perfrun base hit
   754,455,827  cycles
   582,677,522  instructions
    85,773,145  branches
    11,350,176  branch-misses
```

That is **1.14 mispredictions per lookup**. The same workload against `boost::unordered_flat_map`
gives 0.12. At 16 cycles each, the mispredictions alone are 18 of the 75 cycles a lookup takes
here, and they hurt more than that, because a mispredict also drains the pipeline of the
*next* lookup that out-of-order execution had already started.

Boost's number is low because its probe does not ask one bucket at a time. It loads a group of
metadata, compares all of it in one instruction, and branches **once on the result**. The
outcome of that branch does not depend on *where* the match was, only on *whether* there was
one, and for a lookup that hits the answer is nearly always yes. I wanted that property, and the
bucket layout above turns out to allow it.

# SSE2, for people who have never used it

SSE2 is the vector instruction set that every x86-64 CPU has had since the first one in 2003, so
it needs no compiler flag and no runtime check. It gives you sixteen 128 bit registers and
instructions that treat a register as several **lanes** of the same width and do the same thing
to every lane at once. Four 32 bit lanes is the width that matters here, because a bucket is two
32 bit fields and a lookup wants to examine four of them.

In C++ you reach these through *intrinsics*: functions from `<emmintrin.h>` that map one to one
onto instructions, with a `__m128i` type for a register holding integers. Intel's
[Intrinsics Guide](https://www.intel.com/content/www/us/en/docs/intrinsics-guide/index.html)
documents every one of them, with the exact lane semantics. Every one used in the
map is in this table, and there are only a dozen.

| intrinsic | what it does |
|---|---|
| `_mm_loadu_si128(p)` | load 16 bytes from `p`, any alignment |
| `_mm_storeu_si128(p, v)` | store 16 bytes |
| `_mm_set1_epi32(x)` | put `x` in all four lanes |
| `_mm_setr_epi32(a,b,c,d)` | four lanes with four values, in that order |
| `_mm_add_epi32(a, b)`, `_mm_sub_epi32` | add or subtract, lane by lane |
| `_mm_cmpeq_epi32(a, b)` | lane by lane: all ones where equal, all zeros elsewhere |
| `_mm_and_si128`, `_mm_or_si128`, `_mm_andnot_si128` | bitwise, over all 128 bits |
| `_mm_shuffle_ps(a, b, sel)` | build a register from any two lanes of `a` and any two of `b` |
| `_mm_slli_si128(v, n)`, `_mm_srli_si128` | shift the *whole register* by `n` bytes |
| `_mm_movemask_ps(v)` | take the top bit of each lane and pack them into a 4 bit integer |

Two of these carry the whole design. `_mm_cmpeq_epi32` turns a question into a lane full of
ones or zeros, and `_mm_movemask_ps` turns four lanes into four bits of an ordinary integer,
where `countr_zero` (the `tzcnt` instruction) tells you the *lowest* set bit in one step. Ask
four questions with one instruction, get four answers as an integer, pick the first yes: that is
the entire trick. Everything else is plumbing.

One oddity you will see in the code: `_mm_movemask_ps` and `_mm_shuffle_ps` are officially
*float* instructions, so the integer register gets cast to `__m128` and back with
`_mm_castsi128_ps`. The casts compile to nothing. SSE2 simply never got an integer version of
those two, and the float ones do exactly what is needed on 32 bit lanes.

# The probe, four buckets at a time

A lookup now loads the four buckets starting at the key's home, and for each lane compares
against what the key would carry *in that bucket*: its `dist_and_fingerprint` at home in lane 0,
one distance more in lane 1, and so on. Equal is a fingerprint match. Less is the robin hood
proof of absence. The **lowest lane that is either** decides, and it is found with one
`countr_zero`.

[![Walking through one lookup: four buckets, two compares, one mask, one decision](/img/2026/unordered-dense/probe.svg)](/img/2026/unordered-dense/probe.svg)

Reading the buckets is the first bit of plumbing. Two loads fetch four buckets, but each 16 byte
load holds two *whole* buckets, so its four lanes are `[dist·fp, index, dist·fp, index]`, and
the compare wants the four `dist·fp` values side by side in one register. That is a shuffle:

```cpp
template <int Field>   // 0: m_dist_and_fingerprint, 1: m_value_idx
static auto gather(Bucket const* gp) -> __m128i {
    // d = dist·fp, i = index; lanes written low to high, lane 0 first
    auto lo = _mm_loadu_si128(reinterpret_cast<__m128i const*>(gp));      // [d0 i0 d1 i1]
    auto hi = _mm_loadu_si128(reinterpret_cast<__m128i const*>(gp + 2));  // [d2 i2 d3 i3]
    // result lanes 0 and 1 come from lo, lanes 2 and 3 from hi. With Field = 0:
    // lo[0] lo[2] hi[0] hi[2] = [d0 d1 d2 d3]. With Field = 1: [i0 i1 i2 i3].
    return _mm_castps_si128(_mm_shuffle_ps(_mm_castsi128_ps(lo), _mm_castsi128_ps(hi),
                                           _MM_SHUFFLE(2 + Field, Field, 2 + Field, Field)));
}
```

So `gather<0>` returns the four `dist·fp` values, `[d0 d1 d2 d3]`, and `gather<1>` the four
indices. The selector needs a word, because `_MM_SHUFFLE` reads backwards. `_mm_shuffle_ps`
always fills result lanes 0 and 1 from its first argument and lanes 2 and 3 from its second; the
selector says *which* lane of that argument each one takes, and the macro takes them in the
order `_MM_SHUFFLE(lane3, lane2, lane1, lane0)`, highest first, the way you would write the bits
of a number. So `_MM_SHUFFLE(2 + Field, Field, 2 + Field, Field)` means: lane 0 of the result is
`lo[Field]`, lane 1 is `lo[2 + Field]`, lane 2 is `hi[Field]`, lane 3 is `hi[2 + Field]`. Read
left to right it looks like it starts with the high lane, and it does, because that is the
macro's convention and not the data's.

With that, the probe is this. I have left out the casts and the `NOLINT`s; the real thing is
`probe_simd` in [the header](https://github.com/martinus/unordered_dense/blob/main/include/ankerl/unordered_dense.h), and the change
as a whole is [PR #211](https://github.com/martinus/unordered_dense/pull/211).

The step numbers in the comments are the ones in the figure above.

```cpp
// Step 3, done once: what the key would carry in each of the four buckets from home.
// set1 puts the key's dist·fp in all four lanes; setr adds 0, 1, 2, 3 distances to them,
// so with dist·fp = 1·5B the lanes hold [1·5B 2·5B 3·5B 4·5B].
auto expected = _mm_add_epi32(_mm_set1_epi32(dist_and_fingerprint),
                              _mm_setr_epi32(0, dist_inc, 2 * dist_inc, 3 * dist_inc));
auto const step = _mm_set1_epi32(4 * dist_inc);   // four more distances, for the next window

while (true) {
    // Steps 1 and 2: the four buckets from bucket_idx, and their dist·fp side by side.
    auto const* gp = m_buckets.data() + bucket_idx;
    auto d = gather<0>(gp);                     // [d0 d1 d2 d3]

    // Step 4a: a lane is all ones where the bucket holds exactly what the key would carry
    // there, which is a fingerprint match at the right distance.
    auto eqv = _mm_cmpeq_epi32(d, expected);
    // Step 4b: a lane's top bit is set where the bucket holds *less*, because the subtraction
    // went negative. That is the robin hood proof that the key is absent.
    auto lessv = _mm_sub_epi32(d, expected);
    // Step 5: movemask takes the top bit of each lane and packs them into an integer, bit 0
    // for lane 0. `candidates` has a bit for every lane that decided either way, `less` only
    // for the "absent" ones.
    auto candidates = _mm_movemask_ps(_mm_castsi128_ps(_mm_or_si128(eqv, lessv)));
    auto less       = _mm_movemask_ps(_mm_castsi128_ps(lessv));

    if (candidates != 0) {
        // Step 6: the lowest lane that decided is the answer, because buckets further along
        // cannot hold the key if an earlier one already proved it absent.
        auto j = countr_zero(candidates);       // 0b1110 -> 1
        if ((less >> j) & 1) {
            // that lane said "less": the key is not in the table, and this is where an insert
            // would put it
            return not_found_at(bucket_idx + j);
        }
        // that lane said "equal": a fingerprint match, so compare the actual key
        auto value_idx = gp[j].m_value_idx;
        if (m_equal(key, m_values[value_idx].first)) {
            return found(value_idx);
        }
        // fingerprint collision, rare: carry on one bucket at a time from lane j + 1
        return probe_scalar(key, /* from lane j + 1 on */);
    }
    // nothing decided in these four: the next four buckets, each four distances further
    bucket_idx += 4;
    expected = _mm_add_epi32(expected, step);
}
```

A few things worth pointing at:

- **"Less" costs no compare.** Both values are far below 2<sup>31</sup>, so `bucket - expected`
  is negative exactly when the bucket holds less, and `_mm_movemask_ps` reads sign bits. One
  subtraction gives the "less" lanes, one compare gives the "equal" lanes, an `or` gives
  "either", and both masks come out as integers.
- **One data dependent branch.** `candidates != 0` is almost always true: a chain longer than
  four buckets is rare at 80% load. The branch that follows, hit or miss, is the caller's own
  uncertainty, and it would have been paid on `it != end()` anyway. What is gone is the branch
  *per bucket*, the one whose outcome depended on the position of the hit.
- **The array grew three sentinel buckets.** A window of four read from the last bucket would
  run off the end, so the array carries three extra buckets that hold a `dist_and_fingerprint`
  no key can expect and no real bucket can be less than. A window passes over them as it would
  over occupied buckets that are not the answer, and only where a window decides *nothing* does
  the probe wrap to bucket zero, by handing over to the scalar probe. `bucket_count()` does not
  count them.
- **The key comparison happens outside the vector code.** On a fingerprint collision, the rare
  case where the fingerprint matched but the key did not, the probe continues in the scalar loop
  from the next bucket rather than going back around. An earlier version kept the vector state
  alive across the key comparison, and for string keys that made the compiler spill all of it
  around `bcmp` on every hit.
- **Not every configuration gets this.** The vector probe needs the default `std::vector` bucket
  storage and the standard 8 byte bucket. The segmented and custom bucket containers, the big
  bucket type, and non-x86 targets keep the scalar path. ARM has the same four lane compares
  in NEON and is the obvious next step.

## What it bought

[![Cycles, instructions and mispredictions per lookup: scalar probe, SSE2 probe, boost](/img/2026/unordered-dense/perf-lookup.svg)](/img/2026/unordered-dense/perf-lookup.svg)

Per lookup, all hits, the mispredictions went from 1.14 to 0.19, the instructions from 58 to
96, and the cycles from 75 to 48. That instruction count is the price: the vector probe's
irreducible core is about sixteen instructions before it can decide anything, where the scalar
probe's first bucket was three. It is a trade of instructions for mispredictions, and the model
that predicted every variant I tried to within a cycle or two is

> cycles per operation ≈ 16 × mispredictions + instructions / 3.5

which is what says 38 more instructions are worth paying for 0.95 fewer mispredictions. That
model was fit on tables that sit in L2. The 50000 entry table here is bigger than that, and the
saving is larger than the model predicts, because a branch that waits on a slow load and then
turns out to be wrong also throws away the next lookup's loads, which the CPU had already
started. On lookups that all miss the trade is smaller, because the scalar probe usually
stopped at the first bucket and had less to mispredict. On the benchmark's find workload, half hits and half misses
against a map growing to 50000 entries, it is 1.6x over January.

The same window serves inserts (`try_emplace` probes first, and where the probe stops is where
the key goes) and erases, and it fixed the last part of an erase too. Erasing swaps the last value
into the hole it leaves in the values vector, so the bucket pointing at that last value has to be
found and repointed. That scan now matches value indices four at a time with `gather<1>`.

# The same trick for inserting and erasing

With the probe done ([PR #213](https://github.com/martinus/unordered_dense/pull/213) has the rest of this section), `perf` said
inserts and erases were still paying 0.6 mispredictions each,
and the branch was in the robin hood shift. Placing a key into an occupied bucket pushes the
occupant along, and that one may push the next; the loop asks "is this bucket occupied" once per
bucket. Measured over eight million inserts into a table at its load factor, 73% shift nothing,
11% shift one bucket, and the rest tail off. A coin flip per bucket, again.

[![Inserting into a window of four: an empty mask, everything moved one along, and a blend](/img/2026/unordered-dense/shift.svg)](/img/2026/unordered-dense/shift.svg)

The vector version reads the four buckets at the place, asks "empty?" of all four with one
compare, and `countr_zero` on the mask says how long the run of occupied buckets is: 0 to 3. Then
it builds what the window *would* look like if every bucket moved one along. `_mm_slli_si128`
shifts the whole register by 8 bytes, which moves bucket 0 into bucket 1's position in one
instruction; the new bucket is `or`ed into lane 0, and a lane of `dist_inc` constants adds one
distance to every bucket that moved:

```cpp
auto empty = _mm_movemask_ps(_mm_castsi128_ps(_mm_cmpeq_epi32(dists, _mm_setzero_si128())));
if (empty != 0) {
    auto run = countr_zero(empty);            // occupied buckets before the first empty: 0..3
    // [new, b0, b1, b2], the old ones one distance further from home
    auto moved_lo = _mm_add_epi32(_mm_or_si128(_mm_slli_si128(lo, 8), fresh),
                                  _mm_setr_epi32(0, 0, inc, 0));
    auto moved_hi = _mm_add_epi32(_mm_or_si128(_mm_slli_si128(hi, 8), _mm_srli_si128(lo, 8)),
                                  _mm_setr_epi32(inc, 0, inc, 0));
    // lanes 0..run take the moved contents, the rest keep what they had
    auto keep_lo = keep[run].lo;              // all ones in the lanes that move
    auto keep_hi = keep[run].hi;
    lo = _mm_or_si128(_mm_and_si128(keep_lo, moved_lo), _mm_andnot_si128(keep_lo, lo));
    hi = _mm_or_si128(_mm_and_si128(keep_hi, moved_hi), _mm_andnot_si128(keep_hi, hi));
    _mm_storeu_si128(gp, lo);
    _mm_storeu_si128(gp + 2, hi);
    return;
}
// a run of four or more, or the last buckets before the sentinels: the loop as before
```

The last three lines before the stores are a **blend**: `(mask & new) | (~mask & old)`, lane by
lane. SSE4.1 has an instruction for that; SSE2 does it with three. The masks come from a tiny
constant table indexed by `run`, four rows of 32 bytes.

Erase is the mirror image. The four buckets *after* the victim are read, "is this bucket
displaced" (distance two or more) is asked of all four at once, the run of displaced buckets
moves back by one with distance one less, and the bucket where the run ends becomes the empty
one. This is backward shift deletion, which leaves the table exactly as if the erased key had
never been inserted, and it is the reason there are no tombstones anywhere in this map.

Per operation on a reserved table of 200000 `uint64_t` keys, hardware counters over eight
million of each:

| | mispredictions | cycles | instructions |
|---|---|---|---|
| insert, scalar shift | 0.61 | 52.4 | 101.5 |
| insert, vector shift | **0.24** | **46.3** | 126 |
| erase, scalar shift | 0.60 | 63.6 | 106.4 |
| erase, vector shift | **0.26** | **54.5** | 132.7 |

Same shape as the probe: more instructions, fewer mispredictions, fewer cycles. The gain grows
with the chains there are to shift, so it is 27% on a table erased from full to empty at 10000
entries and 7% at 200000. A two lane version was tried first and lost to this one, because its
second slot was still a branch.

# Compared with Boost's flat map

[Boost's flat map](https://www.boost.org/doc/libs/latest/libs/unordered/doc/html/unordered/structures.html#structures_open_addressing_containers)
is the container I measure against, because it is the fastest open addressing
table I know of and because its design is the other answer to the same question. It is a
[SwissTable](https://abseil.io/about/design/swisstables) descendant: slots are grouped in
fifteens, each group has a 16 byte metadata word, and a lookup compares the whole word against
the key's reduced hash in one instruction.

[![Boost's 16 byte metadata word for 15 slots, against this map's 32 byte window for 4](/img/2026/unordered-dense/boost-group.svg)](/img/2026/unordered-dense/boost-group.svg)

Put side by side it is clear why Boost wins a fresh lookup. One 16 byte compare gives it **15
verdicts**; this map's 32 byte window gives **4**, because half of every bucket is the index into
the values vector. Boost's keys also live right next to the metadata, one load away, where here a
hit is bucket, then index, then value: two dependent loads. On lookups that all hit Boost is at
28 cycles against this map's 48, and 1.21x ahead on the benchmark's 50/50 find. That is what is
left of the gap after this year, down from 1.94x in January.

Boost also never moves an element once placed. There is no robin hood, no shift on insert and
no shift on erase. That is why an insert into Boost costs only 0.10 mispredictions; the vector
shifts brought this map from 0.61 down to 0.24, better, but still above a table that has nothing
to shift. So on a fresh table Boost is ahead on every lookup and insert workload with small
values, and it is worth being clear about that.

What the index buys is everything else:

- **Iteration.** The values are a vector. Boost walks its groups, and on the benchmark's
  iterate-while-modifying workloads it runs at 10 to 28% of this map's speed.
- **Large values.** A flat map writes the whole value into a hash scattered slot, and every
  cost it has scales with `sizeof(value_type)`. A dense map writes 8 bytes there and appends the
  payload in order. With a 64 byte mapped value, building 200000 entries is **1.3x faster**
  here than in Boost, and peak memory for a million entries is 101 MB against 205.
- **Strings.** Building a map of 200000 string keys is 1.23x faster here, for the same reason
  in a smaller way: `std::string` is 32 bytes.
- **A table that only churns.** Boost's erase frees the slot, but it cannot clear the *overflow
  bits* that inserts probing past the group left behind, so its unsuccessful lookups probe
  further and further as a table churns until a rehash cleans up. Measured on a table held at 200000 entries by erasing one and inserting one:
  Boost's lookups degrade to 1.31x of their fresh cost and snap back on an in-place rehash it
  pays for every third round, while this map's stay flat within the noise for two million
  operations. That is backward shift deletion doing what it promises, and it narrows the gap
  from 1.71x on fresh all-hit lookups to 1.32x on sustained churn.

Neither map is the right one for every workload, which is why I built
[a quiz](/which-hash-map/) about that a few days ago rather than another ranking. The comparison is
fair in one respect that matters: both maps use this library's hash, and Boost's
`hash_is_avalanching` trait is honoured, so it skips its own mixing step exactly as it would for
its own hash. That interop is [one of this year's smaller changes](https://github.com/martinus/unordered_dense/pull/186).

# The hash

Three changes to the string hash, a descendant of [wyhash](https://github.com/wangyi-fudan/wyhash),
all from July ([#165](https://github.com/martinus/unordered_dense/pull/165) and [#166](https://github.com/martinus/unordered_dense/pull/166)):

- **Six lanes for long inputs.** The main loop processed 48 bytes per iteration with three
  independent accumulators; it now does 96 with six, which halves the length of the multiply
  chain for keys over 192 bytes. Below that the extra accumulators cost more to set up and fold
  than they save, so the threshold was moved up after measuring it.
- **An independent tail.** The final mix used to depend on the seed chain. For inputs over 48
  bytes the last 16 bytes are now mixed with secret constants only, so that work runs in
  parallel with the lane loops and a single dependent mix finishes.
- **Two 8 byte reads for 8 to 16 byte keys**, overlapping, instead of assembling the two words
  from four 4 byte reads with shifts. This is what [rapidhash](https://github.com/Nicoshev/rapidhash) does for short inputs, and it
  was the one place rapidhash was ahead; for anything over 24 bytes the hash here is faster
  than rapidhash v3, which is why it was not swapped for it.

[![Hash latency by key length, January against now](/img/2026/unordered-dense/hash-latency.svg)](/img/2026/unordered-dense/hash-latency.svg)

Latency chained, each hash waiting on the previous one, it is 8% faster for short keys, 11 to
19% faster for 64 to 200 bytes, and 9% at a kilobyte. Hashing is a third of a string lookup, so this is
where a good share of the string workloads' 15% came from.

# The benchmark lied, five times

The score I optimise for is the geometric mean of fifteen workloads. It is a single number,
which makes it easy to chase, and this year it turned out to be measuring the wrong things in
several ways at once. Each of these was found because a change that should have helped did
not, and each changed what the benchmark rewards.

1. **The find workload replayed.** Its search rng was reset to the insertion rng's seed, so its
   sequence of hits and misses repeated every run, and a branch predictor with a long history
   learned half of it: 0.6 mispredictions per lookup where a random sequence costs more than
   double. That rewarded branchy probing and hid most of what the SSE2 probe gains. The workload
   now decides every lookup with an rng of its own ([#211](https://github.com/martinus/unordered_dense/pull/211)).
2. **Every string key was 200 bytes.** The hash dispatches on length, and one length makes that
   dispatch perfectly predictable: 0.01 mispredictions per hash on a fixed length against 0.31
   on lengths spread from 4 to 200. It also put every key on the heap. Keys now run from 8 to
   135 bytes, skewed short, the way real keys are ([#213](https://github.com/martinus/unordered_dense/pull/213)).
3. **The integer keys hashed to a lattice.** The insert-erase workload used small sequential
   values as keys, and the hash of a `uint64_t` is one multiply, so the top bits of multiples
   of a small integer walked a lattice: 10000 keys landed at most one to a bucket, 82% of erases
   moved nothing, and the vector shifts above first read as *losses*. Keys are now scrambled
   through a bijection first ([#213](https://github.com/martinus/unordered_dense/pull/213)).
4. **Nothing grew a table.** Building a map of a million entries costs 52% more than building
   it after a `reserve`, all of it rehashing, and no scored workload paid it. A build-from-empty
   workload was added, and it showed at once that growth is where this map is weakest against
   Boost ([#213](https://github.com/martinus/unordered_dense/pull/213)).
5. **Nothing churned.** Every workload measured a fresh table, which is systematically kind to a
   design that trades erase quality for lookup speed. The churn workload above was added, and it
   is the one where backward shift deletion gets to show what it is for ([#215](https://github.com/martinus/unordered_dense/pull/215)).

And a sixth that was not the benchmark's fault: the build workload was measuring the kernel. A
build asks for megabytes and gives them back, glibc returns anything above its mmap threshold to
the OS, and every repetition faulted the same pages in again: 38% of the cycles were kernel
time, at 2000 page faults per build, and whether it was paid depended on what had run *before*
in the process. Raising `M_MMAP_THRESHOLD` and `M_TRIM_THRESHOLD` so the arena is kept took the
build from 6.6 ms to 3.8 ms and made the number the same whatever ran first
([#216](https://github.com/martinus/unordered_dense/pull/216)).

# What did not work

The list is long, and it is in
[`CLAUDE.md`](https://github.com/martinus/unordered_dense/blob/main/CLAUDE.md#optimization-dead-ends-verified-with-paired-ab-runs-re-test-before-assuming-they-still-hold)
in the repository with the measurements, so that neither I nor anyone else re-tries them without
new evidence. The ones that taught me something:

- **Force-inlining the hash** into the map: icache and register pressure cost more than the
  call saved.
- **A branchless scalar lookup**, unconditional key compare plus a conditional move: the
  speculative value load doubled the cache misses on the half of lookups that miss. Catastrophic,
  1.6x slower.
- **Prefetching** the value in the probe, or the moved element's home bucket in erase:
  out-of-order execution already hides those latencies.
- **An AES-NI hash** (a port of [gxhash](https://github.com/ogxd/gxhash)): 30% *slower* on 200 byte keys. Its serial `aesenc` chain
  has worse latency, and latency is what the string loop pays for. Fewer instructions do not
  help a chain.
- **Aligned groups of four** instead of a window starting at home: left the "nothing decided,
  next group" branch random. **Two branches to decide** (scalar home bucket, then the vector for
  the rest): mispredicted *more* than one vector decision, although each branch is more biased.
- **Four attempts at the rehash loop** ([#217](https://github.com/martinus/unordered_dense/pull/217)). It costs 21 to 26 cycles per element at every size from
  L1 to L3, and what bounds it is not memory but an in-core chain: each element's loads sit
  behind the previous element's stores through the bucket array. Adding 11 cycles of artificial
  latency between the probe load and the store address added 17 cycles per element. Nothing that
  shortens the *data* side of a store moves it, and vectorising the probe there made it 1.4x
  slower, because the store address then waited on the window load.

# Also this year

Not everything was about speed. Reserving, rehashing and growing on insert all used to release
the old bucket array before asking for the new one, so a failed allocation left values with no
buckets to find them by; they now [build the new array first](https://github.com/martinus/unordered_dense/pull/183), and a failure
leaves the table exactly as it was ([#182](https://github.com/martinus/unordered_dense/issues/182)). The segmented vector's
[allocator handling was fixed](https://github.com/martinus/unordered_dense/pull/173), and Daniel Kral found and fixed
[a quadratic case](https://github.com/martinus/unordered_dense/pull/188) in its block index growth. There is a
[mutation testing tool](https://github.com/martinus/unordered_dense/tree/main/scripts/mutate) now, which found
[seven promises the tests were not checking](https://github.com/martinus/unordered_dense/pull/192); the fuzz targets
[run under libFuzzer and AFL++ nightly](https://github.com/martinus/unordered_dense/blob/main/.github/workflows/fuzz.yml); and there is
[a valgrind leg](https://github.com/martinus/unordered_dense/pull/201) in CI. Releases: [4.9.0](https://github.com/martinus/unordered_dense/releases/tag/v4.9.0) through
[4.9.2](https://github.com/martinus/unordered_dense/releases/tag/v4.9.2) in August, [4.10.0](https://github.com/martinus/unordered_dense/releases/tag/v4.10.0) with the SSE2
probe and [4.11.0](https://github.com/martinus/unordered_dense/releases/tag/v4.11.0) with the vector shifts in September.

# How this was measured, and how you can

The tool I would not do this without is a **paired, interleaved A/B**.
[`scripts/ab/run.sh`](https://github.com/martinus/unordered_dense/tree/main/scripts/ab) in the repository builds the working tree's header against any git revision of itself in *one*
binary, by renaming the baseline into a second namespace, and runs both on the same workloads
interleaved in the same slice of time with [nanobench](https://nanobench.ankerl.com)'s
`compare()`. Machine drift cancels out of the ratio and you get a confidence interval on it. A
desktop drifts by a few percent over minutes, and run-to-run noise is 1 to 2%, so anything
under 5% measured the old way, before and after in separate runs, is a coin flip. Every number
in this post with an "x" on it came out of that harness, with the January header as the
baseline and Boost as a third contender:

[![The year, workload by workload: throughput relative to the January header, with boost for scale](/img/2026/unordered-dense/year-ab.svg)](/img/2026/unordered-dense/year-ab.svg)

The second tool is [`perf stat`](https://perfwiki.github.io/main/) with
`-e cycles,instructions,branch-misses` on a runner that does one
workload and nothing else. It is what separates "more instructions" from "more mispredictions",
and with the cost model above it predicted the outcome of most experiments before the A/B
confirmed them. Two cautions from using it. A harness that erases the same keys in the same
order every repetition reports 0.003 mispredictions per erase and no gain from any of this,
because the predictor learns the order; shuffle per repetition. And a tight loop with nothing in
it but the function under test resolves large changes only: the hash microbenchmark in the A/B
reported the new hash 10% *slower* in the paired binary and 8 to 20% faster in separate ones,
because which of the two gets the better code layout mattered more than the hash. Check small
changes against the map workloads, where the hash is a third of the work and layout luck
averages out.

The code is at [github.com/martinus/unordered_dense](https://github.com/martinus/unordered_dense).
If you have an ARM machine and an afternoon, the NEON port of the four lane window is waiting.
