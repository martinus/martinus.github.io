---
layout: post
title: Which C++ Hashmap Should You Actually Use?
subtitle: Eight containers, fifteen workloads, and a little quiz that asks what your code does
---

Every few months somebody asks me which C++ hashmap is the fastest, and the honest answer is
that the question is malformed. There is no fastest one. There is a fastest one *for what your
code does*, and the same container can be the best and the worst choice on the same machine
depending on whether you iterate.

So instead of another table, I built something that asks.

> **[Which C++ hash map should you actually use?](/which-hash-map/)** — seven questions, eight
> containers, and a measured number behind every claim.

It scores eight containers as you answer, shows you all eight ranked at the end with the reason
each landed where it did, and shows you every weight it used to get there.

## What is in it

`ankerl::unordered_dense::map`, `boost::unordered_flat_map`, `boost::unordered_node_map`,
`boost::unordered_map`, `absl::flat_hash_map`, `absl::node_hash_map`, `tsl::robin_map` and
`std::unordered_map`.

All eight run interleaved in a single process, with the same hash, over the fifteen workloads
in [unordered_dense/scripts/ab](https://github.com/martinus/unordered_dense/tree/main/scripts/ab).
Interleaving matters more than it sounds: it means machine drift lands on every candidate
equally instead of on whichever one happened to run last. Memory is a separate run, one map per
process, reading the high-water mark out of `/proc/self/status`.

Versions: unordered_dense v4.11.0, Boost 1.92.0, Abseil 20260107.1, tsl::robin_map 1.4.0,
libstdc++ 16, clang 22.1.8, on a Ryzen 9 7950X.

## Four things I did not expect

**The summary number depends entirely on which workloads you put in the basket.** Over all
fifteen, `unordered_dense` leads and `boost::unordered_flat_map` is 1.21x behind it. Drop the two
that iterate, and it flips: boost-flat is 1.10x *ahead*. Counting first places says the same
thing more bluntly — boost-flat is quickest on eight of the fifteen, `unordered_dense` on four.
Two workloads carry the whole geometric mean, because iteration is the one axis where a dense
map wins by a factor rather than by a percentage.

**Abseil and Boost do not behave alike, even though they are the same family.** I expected them
to be near-interchangeable. Instead Abseil iterates about 20% faster and pays
about 1.5x as much for a miss — and this is not noise, because the identical trade shows up in
both pairs: 1.60x for flat against flat, 1.50x for node against node. If your lookups mostly hit, Abseil. If they mostly miss,
Boost.

**`boost::unordered_map` builds slower than `std::unordered_map`.** It is a drop-in replacement
that is 1.30x quicker overall, so I assumed it would win everywhere. It does not: 12.73 ms
against 11.48 for 200k `uint64_t` keys, and 41.14 against 38.32 for strings. Its wins are in
lookup, iteration and churn — filling it up is not one of them.

**Flat maps briefly double their memory, and with a big value that hurts.** A million entries
with a 64-byte value peak at 205 MB for boost-flat and 218 MB for Abseil, against 94 MB for the
node maps, which never hold two copies because they grow by appending pointers. If your table is
large and your value is fat, the node maps use less than half the memory of the flat ones.

## About the obvious problem

I wrote one of the eight. So the fair question is whether the quiz is rigged, and I have tried
to make that checkable rather than asking you to trust me.

Every weight is printed on the page, together with the maximum each container can reach, so you
can see whether one of them wins on breadth rather than on merit. The weights are derived from
the measurements — the size of a weight is proportional to the size of the measured gap — which
is how `unordered_dense` ends up scoring *four* on lookups against boost-flat's five, because
the measured difference there is 16% and not a factor. Where the top two land within a point,
the result says so instead of picking one. And the basket-dependence above is stated on the page
itself, in `unordered_dense`'s own list of what it costs you, because that is the strongest
argument against it and hiding it would be the fastest way to make the rest untrustworthy.

Two checks worth mentioning: all eight produce byte-identical results on every workload, so they
are demonstrably doing the same work; and Boost recognises the shared hash as avalanching and
therefore skips its own mixing step, so sharing a hash does not quietly tax anybody.

## Caveats, as always

One machine, one compiler, one standard library, single-threaded, and fifteen workloads that I
chose. `std::unordered_map`'s numbers are libstdc++'s and would look different elsewhere. None
of the eight is thread-safe and the quiz does not ask about concurrency, which is the largest
thing missing.

And the usual: your workload is not my workload. The quiz narrows eight choices down to one
worth trying first. It does not replace measuring the thing you actually built — if the
difference matters enough to ask the question, it matters enough to benchmark.

**[Try it here.](/which-hash-map/)**
