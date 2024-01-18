---
layout: post
title: Comprehensive C++ Hashmap Benchmarks 2022
subtitle: Where I've spent way too much time creating benchmarks of C++ hashmaps
cover-img: /img/2022/wanderfalke_edit.jpg
---

It's been over 3 years since I've spent considerable time finding [the best C++ hashmap](/2019/04/01/hashmap-benchmarks-01-overview/). After several requests I finally gave in and redid the benchmark with state of C++ hashmaps as of August 2022. This took much more work than I initially anticipated, mostly due to the fact that benchmarks take a looong time, and writing everything up and creating a representation that is actually useful takes even more time. Thanks everyone who
annoyingly kept asking me for updates :wink:

> TL;DR: [Here are the benchmark results!](#benchmark-results-table)


# Table of Contents <!-- omit in toc -->

- [Benchmark Infrastructure](#benchmark-infrastructure)
  - [Hardware](#hardware)
  - [Software](#software)
- [Benchmarks](#benchmarks)
  - [Stable References](#stable-references)
  - [Modifying Numbers Benchmarks](#modifying-numbers-benchmarks)
    - [Copy](#copy)
    - [Insert then Erase 100M int](#insert-then-erase-100m-int)
    - [Random Insert & Access uint64_t](#random-insert--access-uint64_t)
    - [Random Insert & Erase uint64_t](#random-insert--erase-uint64_t)
  - [Access & Find Benchmarks](#access--find-benchmarks)
    - [Iterate](#iterate)
    - [Find 1 – 200 uint64_t](#find-1--200-uint64_t)
    - [Find 1 – 2000 uint64_t](#find-1--2000-uint64_t)
    - [Find 1 – 500k uint64_t](#find-1--500k-uint64_t)
  - [Modifying String Benchmarks](#modifying-string-benchmarks)
    - [Random Insert & Erase string](#random-insert--erase-string)
  - [Find String Benchmarks](#find-string-benchmarks)
    - [Find 1 – 100k string](#find-1--100k-string)
    - [Find 1 – 1M string](#find-1--1m-string)
  - [Other](#other)
    - [Memory Usage](#memory-usage)
  - [Combined Results](#combined-results)
    - [Geometric Mean Number Find](#geometric-mean-number-find)
    - [Geometric Mean String Find](#geometric-mean-string-find)
    - [Geometric Mean All](#geometric-mean-all)
- [Benchmark Results Table](#benchmark-results-table)
- [Result Analysis](#result-analysis)
  - [Containers](#containers)
    - [absl::flat_hash_map ↑](#abslflat_hash_map-)
    - [absl::node_hash_map ↑](#abslnode_hash_map-)
    - [ankerl::unordered_dense::map ↑](#ankerlunordered_densemap-)
    - [boost::multi_index::hashed_unique ↑](#boostmulti_indexhashed_unique-)
    - [boost::unordered_map ↑](#boostunordered_map-)
    - [boost::unordered_map & PoolAllocator ↑](#boostunordered_map--poolallocator-)
    - [boost::unordered_map & boost::container::pmr::unsynchronized_pool_resource ↑](#boostunordered_map--boostcontainerpmrunsynchronized_pool_resource-)
    - [emhash7::HashMap ↑](#emhash7hashmap-)
    - [emhash8::HashMap ↑](#emhash8hashmap-)
    - [folly::F14NodeMap ↑](#follyf14nodemap-)
    - [folly::F14ValueMap ↑](#follyf14valuemap-)
    - [fph::DynamicFphMap ↑](#fphdynamicfphmap-)
    - [gtl::btree_map ↑](#gtlbtree_map-)
    - [gtl::flat_hash_map ↑](#gtlflat_hash_map-)
    - [gtl::node_hash_map ↑](#gtlnode_hash_map-)
    - [gtl::parallel_flat_hash_map ↑](#gtlparallel_flat_hash_map-)
    - [gtl::parallel_node_hash_map ↑](#gtlparallel_node_hash_map-)
    - [jg::dense_hash_map ↑](#jgdense_hash_map-)
    - [robin_hood::unordered_flat_map ↑](#robin_hoodunordered_flat_map-)
    - [robin_hood::unordered_node_map ↑](#robin_hoodunordered_node_map-)
    - [ska::bytell_hash_map ↑](#skabytell_hash_map-)
    - [ska::flat_hash_map ↑](#skaflat_hash_map-)
    - [spp::sparse_hash_map ↑](#sppsparse_hash_map-)
    - [std::unordered_map ↑](#stdunordered_map-)
    - [std::unordered_map & PoolAllocator ↑](#stdunordered_map--poolallocator-)
    - [std::unordered_map & std::pmr::unsynchronized_pool_resource ↑](#stdunordered_map--stdpmrunsynchronized_pool_resource-)
    - [tsl::hopscotch_map ↑](#tslhopscotch_map-)
    - [tsl::robin_map ↑](#tslrobin_map-)
    - [tsl::sparse_map ↑](#tslsparse_map-)
  - [Hashes](#hashes)
    - [std::hash ↑](#stdhash-)
    - [boost::hash ↑](#boosthash-)
    - [absl::Hash ↑](#abslhash-)
    - [ankerl::unordered_dense::hash ↑](#ankerlunordered_densehash-)
    - [robin_hood::hash ↑](#robin_hoodhash-)
    - [mumx ↑](#mumx-)
- [Conclusion](#conclusion)
- [Errata](#errata)

This time I have evaluated 29 different hashmaps, and also added several variants with special allocators. Each of these was combined with 6 differend hashes, resulting in 174 different combinations to benchmark. Each of these combinations was evaluated in 11 different benchmarks, totaling in 1914 benchmark evaluations. This almost doubles the number of benchmarks from my evaluation in 2019. 

# Benchmark Infrastructure

## Hardware
* All benchmarks ran on an Intel i7-8700, locked at 3200 MHz.
* The benchmarks ran on an [isolated core dedicated to benchmarking](https://pyperf.readthedocs.io/en/latest/system.html)
* I disabled frequency scaling and turbo boost.
* the PC was kept completely idle otherwise while running the benchmarks.

## Software

* I used Manjaro Linux with an up to date kernel.
* All benchmarks are done with clang++ 13, which at that time was the default compiler on Manjaro Linux.
* I used the compile flags `-O3 -march=native`.
* Each benchmark was run multiple times, and I'm using the median to get rid of any potential outliers.



# Benchmarks

## Stable References

The hashmaps can be divided into two types: ones where the inserted elements always reside at the same location, thus pointers & references to the elements are stable, and ones where elements can be shuffled around. This is usually the case in open address hashing.

Hashmaps with no reference stability tend to be faster because they can usually get rid of one memory indirection and can better optimize for cache locality and allocations.

## Modifying Numbers Benchmarks

### Copy

This benchmark first creates a map `uint64_t` &rarr; `uint64_t` with 1M random entries. 
This map is then copied 200 times into a brand new map, and copied 200 times into an existing map.

```cpp
for (size_t n = 0; n < 200; ++n) {
    Map<uint64_t, uint64_t> m = mapForCopy;
}
Map<uint64_t, uint64_t> m;
for (size_t n = 0; n < 200; ++n) {
    m = mapForCopy;
}
```

There is some minor modification steps added so the compiler can't optimize the copy away. [Full sourcecode of Copy](https://github.com/martinus/map_benchmark/blob/master/src/benchmarks/Copy.cpp).

### Insert then Erase 100M int

This benchmarks bulk insertion and bulk erase:

1. Insert 100 million random `int` into a `Map<int, int>`.
1. Clear all entries with `clear()`.
1. Reinsert 100 million random `int` into the same cleared map.
1. Remove all of the inserted entries one by one until the map is empty again.
1. Destruct the empty map.

100 million int-int pairs take at least 1526 MB. It is interesting to see how much overhead the maps have here, and how they deal with resizing their data. `clear()` is interesting too, for flat maps it might be possible to optimize for data that is trivially destructible, then clear() can be very fast. Reinsertion is interesting to see if a map reuses initialized memory, and if it can gain any speed from that. Removing elements one by one is interesting to see removal performance - some maps need to rearrange entries (e.g. robin-hood based maps) which might slow down their performance. 

### Random Insert & Access uint64_t

This inserts random elements into a map, but with bounded random numbers. The bencharked loop looks like this:

```cpp
Map<int, int> map;
for (size_t i = 0; i < 50'000'000; ++i) {
    checksum += ++map[rng(max_rng)];
}
```

I is an adapted benchmark from attractivechaos' [Revisiting hash table performance](https://attractivechaos.wordpress.com/2018/01/13/revisiting-hash-table-performance/) code.

Here `rng(max_rng)` creates a random number in the range [0, max_rng(. If max_rng is small, not many elements will be inserted but most of them will be accessed. If max_rng is large, mostly new elements will be inserted.

In fact the benchmark is run 4 times, with different max_rng settings:

* 5% distinct: `max_rng = 50M * 5% = 250k`, so many values will be duplicates. After 50 million iterations, all 250k elements are inserted. So most map operations will be accesses.
* 25% distinct: `max_rng = 50M * 25% = 12.5M`. More inserts, less modifications.
* 50% distinct: `max_rng = 50M * 50% = 25M`. Note that due to randomness not all numbers from 0-25M will be inserted. Here the final map's size contains 21.6M entries. So actually its about 43% of the value range instead of 50%.
* 100% distinct: Here we make use of the full range of `int`, so 2^32 numbers are available. Practically all operations are new insertions.

### Random Insert & Erase uint64_t

The core of the benchmark is this loop:

```cpp
Map<uint64_t, uint64_t> map;
for (size_t i = 0; i < 50'000'000; ++i) {
    map.emplace(rng() & bitMask, i);
    map.erase(rng() & bitMask);
}
```

On first glance it looks similar to the previous benchmark, but it bechmarks something completely different. Each iteration it randomly inserts an element, and then randomly erases an element. Instead of using a maximum number for the random number generator, here I am using a bit mask to extract several bits. The purpose of this is to ensure the maps work still well, even when numbers are not sequentially or small and don't always change in the lower bits.

This benchmark loop is repeated 6 times. Initially, 4 random bits are set in bitMask. After each benchmark 4 additional bits are set, thus the number of available random numbers increases and the map will find a larger equilibrium. Here is the list of bitMasks used in the benchmark:

1. `1001000000000000000000000000000000000000000100000000000000001000` 4 bits set, 16 distinct numbers. Equilibrium will be around 16/2 = 8 entries, so the map stays very small.
2. `1001000000000010001100000000000000000000000101000000000000001000` 8 bits set, 256 distinct numbers. Averaging 128 entries.
3. `1001000000000110001100000000000000010000000101100000000000001001` 12 bits set, 4096 distinct numbers, averaging 2048 entries
4. `1001000000000110001100000001000000010000000101110000000100101001` 16 bits set, 65k distinct numbers, 32.8k entries equilibrium.
5. `1101100000000110001100001001000000010000000101110001000100101001` 20 bits set, 1M distinct numbers, 524k entries equilibrium.
6. `1101100000001110001100001001001000010000100101110001000100101011` 24 bits set, 16.8M distinct numbers, 8.4M entries equilibrium.

So the map's average size increases by a factor of 16 each benchmark. Ideally a hashmap has O(1) amortized operations, so the speed should be constant regardless the size. This is unfortunately not the case, mostly due to lots and lots of cache misses the larger you get.

## Access & Find Benchmarks

### Iterate

Iteration benchmark works like this: I create a `Map<uint64_t, uint64_t>`,  and each time I insert one random element the whole map is iterated. Once 50k elements are inserted, elements are removed one by one and each time the map is iterated again. In total, exactly 2.5 billion entries are iterated.

```cpp
Map<uint64_t, uint64_t> map;

auto const initialRngState = rng.state();

// measure insert than iterate whole map
for (size_t n = 0; n < num_iters; ++n) {
    map[rng()] = n;
    for (auto const& keyVal : map) {
        result += keyVal.second;
    }
}

// reset rng back to inital state
rng.state(initialRngState);

// measure erase than iterate whole map
for (size_t n = 0; n < num_iters; ++n) {
    map.erase(rng());
    for (auto const& keyVal : map) {
        result += keyVal.second;
    }
}
```

### Find 1 – 200 uint64_t

In many use cases `find` performance is probably considered the most important benchmark. This benchmark was tricky to implement, as it should be as unbiased as possible. It does the following:

* Lookup with different probability of being found: 0%, 25%, 50%, 75%, and 100% success ratio, to measure get a broad spectrum of lookup probability.
* Lookups with different amount of data in the map, to make sure we have a wide range of fullness factors.
* Lookups with different bitmasks of the entry, to make sure we are not biased towards small numbers. 

In detail, it works this way:

1. Each iteration, 4 random entries are created in a `Map<size_t, size_t>`. Depending on the desired lookup probability, 0, 1, 2, 3, or all 4 entries will be chosen either from a unique random number generator, or one with the same initial seed used for the lookups. Additionally, the order of these 4 entries is shuffled to introduce even more randomness.
1. After insertion, a number of lookups are performed, and when an entry is found it's value is accessed.
1. Repeat until the map is full.

Here, we perform 5 million lookups for every 4 inserts, until the map contains 200 elements.

### Find 1 – 2000 uint64_t

Same as benchmark **Find 1 - 200 uint64_t**, but with 500k lookups every 4 inserts until the map contains 2000 entries.

### Find 1 – 500k uint64_t

Same as benchmark **Find 1 - 200 uint64_t**, but with 1000 lookups every 4 inserts until the map contains 500k entries. Note that there is a overhead measured with the find benchmark, namely inserting. In my tests this overhead is minimal and negligable to find results. E.g. for `jg::dense_hash_map` which has very fast find and very slow inserts, the overhead is only ~0.49%.

## Modifying String Benchmarks

### Random Insert & Erase string

This benchmark is very similar to **Random Insert & Erase uint64_t**. It constantly inserts and removes random strings. The benchmark is run with different sizes of `std::string`: 7, 8, 13, 100, and 1000 bytes. Each time a string is inserted or queried, only the last few bytes are modified. That means if two hashes of the string are the same, `std::equal` will have to check quite a few bytes, especially for longer strings. Since comparisons and hashing takes much longer for longer strings, I have adapted the runtime for each benchmark:

* 7 bytes: 20M iterations
* 8 bytes: 20M iterations
* 13 bytes: 20M iterations
* 100 bytes: 12M iterations
* 1000 bytes: 6M iteratons

The benchmark code looks like this. It takes great care that the random string is not unnecessarily copied or recreated.

```cpp
std::string str(string_length, 'x');

Map<std::string, std::string> map;
for (size_t i = 0; i < max_n; ++i) {    
    // create an entry.
    randomize(str);
    map[str];

    // find and erase entry.
    randomize(str);
    auto it = map.find(str);
    if (it != map.end()) {
        ++verifier;
        map.erase(it);
    }
}
```

## Find String Benchmarks

### Find 1 – 100k string

This benchmark is practically the same as the uint64_t find benchmarks, except that it uses 100 byte long `std::string`. There are 1000 lookups every 4 inserts, until 100k entries are inserted.

### Find 1 – 1M string

Same as **Find 1 - 100k string**, but with 13 bytes long strings, 200 lookups every 4 inserts until 1M strings are in the map.

## Other

### Memory Usage

Each benchmark is run in a separate process, and I measure the peak resident set size for each benchmark. The number presented here calculates the geometric mean of the two very memory-heavy benchmarks, **Insert then Erase 100M int** and **Random Insert & Erase uint64_t**.

Flat maps tend to have a bad maximum memory behavior, because whenever data has to be relocated they allocate a temporary array that's twice the size of the existing data, then move data over to the new array, and after that they erase the memory.

So for a fill factor of 80%, the worst case for peak memory usage (Insert one element after the map is full) is `m = numElements / 0.8 * 3`, which gives an overhead of 275%.

## Combined Results

### Geometric Mean Number Find

The geometric mean of the number related find benchmarks
**Find 1 – 200 uint64_t**, **Find 1 – 2000 uint64_t**, **Find 1 – 500k uint64_t**. Thus, if you only care about search performance for integral types, this is your most important result.

### Geometric Mean String Find

The geometric mean of `std::string` find benchmarks **Find 1 – 100k string**, **Find 1 – 1M string**. If searching for `std::string` is all you care about, look at the top results here.

### Geometric Mean All

The geometric mean of all benchmarks, including memory usage. If you are interested overall speed in a wide range of scenarios, have a look at the top results here.



# Benchmark Results Table

Each column shows benchmark runtime normalized to 100 for the best performer. So 100 means fastest (or lowest memory), 110 means 10% slower than the fastest. The last 3 rows show summarized results. Click a row for sorting, enter text in map/hash field for filtering.

<link href="https://unpkg.com/tabulator-tables/dist/css/tabulator_semanticui.min.css" rel="stylesheet">
<script type="text/javascript" src="https://unpkg.com/tabulator-tables/dist/js/tabulator.min.js"></script>
<style>
.tabulator .tabulator-header .tabulator-col.tabulator-sortable[aria-sort="ascending"] {
  background-color: #DAE1E7;
}
.tabulator .tabulator-header .tabulator-col.tabulator-sortable[aria-sort="descending"] {
  background-color: #DAE1E7;
}
.tabulator.compact.very .tabulator-tableholder .tabulator-table .tabulator-row .tabulator-cell {
  padding:.4em .1em
}
.martinus_big_table {
  width: 90vw;
  position: relative;
  left: calc(-45vw + 50%);
}
.martinus_highlight {
    font-weight: bolder;
}
</style>
<a name="table" />
<div id="table_map_benchmark" class="martinus_big_table ui very compact black celled table" />
<script type="text/javascript" src="/files/2022/map_benchmark.js"></script>

# Result Analysis

## Containers

<a name="absl__flat_hash_map"/>

### absl::flat_hash_map [↑](#table)

Google's Abseil's `absl::flat_hash_map` stores `value_type` directly in the slot array, and Google recommends these for general use. They were brand new in 2019 and pushed the boundary on what's possible to achieve for unordered_maps. It uses several interesting optimizations, described in [CppCon 2017: Matt Kulukundis “Designing a Fast, Efficient, Cache-friendly Hash Table, Step by Step](https://www.youtube.com/watch?v=ncHmEUmJZf4).

The Good
: 3 years ago `absl::flat_hash_map` was one of the fastest maps. It still is quite fast, and seems to perform especially well for large maps. This map and `gtl::flat_hash_map`, which is based on that map, are the fastest in the **Find 1 – 500k uint64_t** benchmark. Other find benchmarks are reasonably fast too, especially for strings.

The Bad
: Copying and iterating the map is comparatively slow. The map is highly sensitive to the used hash, and benchmarks are incredibly slow (timeout) when bad hash is used. E.g. `std::hash` or `boost::hash` for number types.

About
: Website: [https://abseil.io/docs/cpp/guides/container](https://abseil.io/docs/cpp/guides/container), Tested version: [736458b5 (master)](https://github.com/abseil/abseil-cpp), License: `Apache License 2.0`


<a name="absl__node_hash_map"/> 

### absl::node_hash_map [↑](#table)

Google's [absl::node_hash_map](https://abseil.io/docs/cpp/guides/container) is a near drop-in replacement for `std::unordered_map` with stable pointers & references. Bound to be a bit slower than `absl::flat_hash_map` due to the indirection.

The Good
: Being node based pointers & references are stable. Search performance is still very good, there is only little slowdown compared to `absl::flat_hash_map`. 

The Bad
: Memory usage, copying, inserting elements is very slow, even much slower than `std::unordered_map`.

About
: Website: [https://abseil.io/docs/cpp/guides/container](https://abseil.io/docs/cpp/guides/container), Tested version: [736458b5 (master)](https://github.com/abseil/abseil-cpp), License: `Apache License 2.0`

 
<a name="ankerl__unordered_dense__map" /> 

### ankerl::unordered_dense::map [↑](#table)

Full disclaimer: I'm the author! This map is designed to be very fast, simple, but still feature rich. It achieves that by combining ideas from `robin_hood::unordered_flat_map` and using a simple `std::vector` as storage. Iteration is therefore as fast as it gets since all data is stored linearly in memory. I consider this implementation as a successor of my old robin_hood map.

The Good
: The map is an excellent allrounder. Search is very fast, string search is fastest in one benchmark. Iteration speed is unbeatable because all the data lies in a contiguous block of memory. It has support for custom allocators, custom containers, and fancy pointers. It is e.g. possible to simply replace the internally used `std::vector` with other types to make use of shared memory.

The Bad
: Removing an element can be relatively slow, since it requires two lookups because the map keeps a densely stored vector at all times.

About
: Website: [https://github.com/martinus/unordered_dense](https://github.com/martinus/unordered_dense), Tested version: [v1.0.2](https://github.com/martinus/unordered_dense), License: `MIT License`


<a name="boost__multi_index__hashed_unique" />

### boost::multi_index::hashed_unique [↑](#table)

Boost's [boost::multi_index](https://www.boost.org/doc/libs/1_80_0/libs/multi_index/doc/index.html) library is extremely powerful. You can use multiple indices at once. In this benchmark I'm just using `boost::multi_index::hashed_unique` to see how well it performs.

The Good
: Lookup is reasonably fast, and memory usage is ok. If you need multiple indices for the same data this is the most user friendly choice.

The Bad
: Copying the map is really slow - a whopping 100 (hundred) times slower than `ankerl::unordered_dense::map`.

About
: Website: [https://www.boost.org/doc/libs/1_80_0/libs/multi_index/doc/index.html](https://www.boost.org/doc/libs/1_80_0/libs/multi_index/doc/index.html), Tested version: [1.80.0](https://github.com/boostorg/boost), License: `Boost Software License 1.0`


<a name="boost__unordered_map" /> 

### boost::unordered_map [↑](#table)

In version 1.80 there has been a complete rewrite of `boost::unordered_map`. That was actually the main reason why I have decided to redo this whole benchmark. It comes with extensive documentation and [benchmarks](https://www.boost.org/doc/libs/1_80_0/libs/unordered/doc/html/unordered.html#benchmarks). I took the opportunity to test the map, and also try it with different allocators as my initial experiments indicated quite a big performance difference with a specialized allocator.

The Good
: Compared to `std::unordered_map`, lookup is almost twice as fast! This is a huge improvement, given the limitations the maps are under (stable references, and keeping the bucket API). If you need high compatibility with `std::unordered_map`, this is the best choice.

The Bad
: Insert, erase, copy are relatively slow and memory usage is quite high.

About
: Website: [https://www.boost.org/doc/libs/1_80_0/libs/multi_index/doc/index.html](https://www.boost.org/doc/libs/1_80_0/libs/multi_index/doc/index.html), Tested version: [1.80.0](https://github.com/boostorg/boost), License: `Boost Software License 1.0`


<a name="boost__unordered_map_PoolAllocator" />

### boost::unordered_map & PoolAllocator [↑](#table)

The `PoolAllocator` is a custom allocator for node based containers. Since boost::unordered_map is node based, it has to allocate one node for each element. Thus it can potentially gain a lot from a custom allocator. I actually wrote `PoolAllocator` for Bitcoin, where an `std::unordered_map` is heavily used and using this `PoolAllocator` [speeds up initial block indexing significantly](https://github.com/bitcoin/bitcoin/pull/25325).

The Good
: Memory usage is reduced quite a lot, and copying the map is more than twice as fast.

The Bad
: For some reason search performance is quite a bit slower. Theoretically using a different allocator shouldn't make any difference, but at least in my benchmarks search performance for small maps are much slower.

About
: Website: [https://github.com/martinus/map_benchmark/blob/master/src/app/pool.h](https://github.com/martinus/map_benchmark/blob/master/src/app/pool.h), Tested version: `644b2fa (master)`, License: `MIT License`


<a name="boost__unordered_map_unsynchronized_pool_resource" />

### boost::unordered_map & boost::container::pmr::unsynchronized_pool_resource [↑](#table)

Boost comes with its own implementation of [Polymorphic Memory Resources](https://www.boost.org/doc/libs/1_80_0/doc/html/container/cpp_conformance.html#container.cpp_conformance.polymorphic_memory_resources), which should behave similar to `PoolAllocator`. And it does in most cases, except the `Copy` benchmark, here PoolAllocator is quite a bit faster.

The Good
: It's boost's own implementation, and it gives a big speedup for inserting elements, and is also much faster than a plain `boost::unordered_map` when many inserts & erase happen. Using this custom allocator also brings down memory usage quite a lot, because it doesn't have to pay the malloc overhead for each node.

The Bad
: The time to copy the map is about the same than without a custom allocator. In comparison, with `PoolAllocator` the performnace here is almost doubled, this looks like a lost opportunity to me!

About
: Website: [https://www.boost.org/doc/libs/1_80_0/libs/multi_index/doc/index.html](https://www.boost.org/doc/libs/1_80_0/libs/multi_index/doc/index.html), Tested version: [1.80.0](https://github.com/boostorg/boost), License: `Boost Software License 1.0`


<a name="emhash7__HashMap" /> 

### emhash7::HashMap [↑](#table)

These are very high performance hashmaps and the author is constantly updating them. There are different versions of the maps with different propertices concerning performance vs. memory. This map has very fast iteration speed.

The Good
: One of the fastest map. It is fastest for insert & erase, and find is also extremely fast. 

The Bad
: It's a bit slower than the best for `std::string` keys, but overall its a very fast implementation.

About
: Website: [https://github.com/ktprime/emhash](https://github.com/ktprime/emhash), Tested version: `9a3f7189 (master)`, License: `MIT License`


<a name="emhash8__HashMap" />

### emhash8::HashMap [↑](#table)

This variant from ktprime has behaves similar to `emhash7::Hash`, but requires less memory.

The Good
: Very fast iteration speed, search & insert is very fast. Low memory usage.

The Bad
: Erase is slower than emhash7, but it's still quite good.

About
: Website: [https://github.com/ktprime/emhash](https://github.com/ktprime/emhash), Tested version: `9a3f7189 (master)`, License: `MIT License`


<a name="folly__F14NodeMap" /> 

### folly::F14NodeMap [↑](#table)

A supposedly high performance hashmap implementation from Facebook / Meta. It stores values indirectly, calling malloc for each node. Also see `folly::F14ValueMap`

The Good
: Relatively good search performance, Insert & erase is not ok-ish.

The Bad
: Memory usage is high. It's a large dependency.

About
: Website: [https://github.com/facebook/folly](https://github.com/facebook/folly), Tested version: `v2022.06.27.00`, License: `Apache License 2.0`

<a name="folly__F14ValueMap" /> 

### folly::F14ValueMap [↑](#table)

A supposedly high performance hashmap implementation from Facebook / Meta. It stores values directly. Also see `folly::F14NodeMap`

The Good
: Overall relatively fast search, and very low memory usage.

The Bad
: It's a big dependency

About
: Website: [https://github.com/facebook/folly](https://github.com/facebook/folly), Tested version: `v2022.06.27.00`, License: `Apache License 2.0`


<a name="fph__DynamicFphMap" /> 

### fph::DynamicFphMap [↑](#table)

A very interesting new contender: This hashmap implementation uses a perfect hash, thus it doesn't have any collisions. This should make it extremely fast for lookups, but with a potentially high overhead for insert/removal. 

The Good
: Find is extremely fast, regardless of the hash. In fact, `std::hash` or `boost::hash` is best here even with their bad hash quality.

The Bad
: Insert and erase and copying the map is very very slow, the slowest in the benchmark. Memory usage is very high. I'd say this map is good for stable data that is never modified, and when you can afford the high memory usage.

About
: Website: [https://github.com/renzibei/fph-table/tree/noseed](https://github.com/renzibei/fph-table/tree/noseed), Tested version: `1a613aba (noseed)`, License: `none specified`


<a name="gtl__btree_map" /> 

### gtl::btree_map [↑](#table)

Containers from greg's template library. This is actually not a hashmap at all, but it is an ordered container much like `std::map`. They store multiple elements per node which should make them faster because it is a more cache-friendly layout. I added this one to see if it is possible if non-hashmap implementations could compete in this benchmark.

The Good
: Memory usage is excellent, this container has the lowest memory usage of all. Insert & erase are of medium speed.

The Bad
: Lookup is very slow.

About
: Website: [https://github.com/greg7mdp/gtl](https://github.com/greg7mdp/gtl), Tested version: `v1.1.2`, License: `Apache License 2.0`


<a name="gtl__flat_hash_map" /> 

### gtl::flat_hash_map [↑](#table)

A hashmap implementation based on Google's Abseil. It lists changes to the original implementation [here](https://github.com/greg7mdp/gtl/blob/main/docs/hmap.md#changes-to-abseils-hashmaps). This one is the flat variant.

The Good
: This has very similar performance characteristics to `absl::flat_hash_map`, with the added bonus that it also works well for bad hashes like `std::hash` and `boost::hash`. This is a single-header file.

The Bad
: Same as for `absl::flat_hash_map`, copy & iterating is relatively slow.

About
: Website: [https://github.com/greg7mdp/gtl](https://github.com/greg7mdp/gtl), Tested version: `v1.1.2`, License: `Apache License 2.0`


<a name="gtl__node_hash_map" />

###  gtl::node_hash_map [↑](#table)

The node hashmap based on google abseil's `absl::node_hash_map`. It lists changes to the original implementation [here](https://github.com/greg7mdp/gtl/blob/main/docs/hmap.md#changes-to-abseils-hashmaps). 

The Good
: Performance is very similar to `absl::node_hash_map`. For some reason copying is a bit faster. It works well with `std::hash` and `boost::hash`.

The Bad
: Copying & iterating is still slow, insert & erase are slow. Memory usage is quite high.

About
: Website: [https://github.com/greg7mdp/gtl](https://github.com/greg7mdp/gtl), Tested version: `v1.1.2`, License: `Apache License 2.0`


<a name="gtl__parallel_flat_hash_map" /> 

### gtl::parallel_flat_hash_map [↑](#table)

The parallel variants of the hashmaps have reduced peak memory usage and multithreading support. This is done by splitting up the data into multiple sub-hashmaps. See [Parallel hash containers provided by gtl](https://github.com/greg7mdp/gtl/blob/main/docs/phmap.md) for more information.

The Good
: Memory usage is very good, copying is a bit faster than `gtl::flat_hash_map`. It has nice thread safety properties, see [here](https://github.com/greg7mdp/gtl/blob/main/docs/phmap.md#thread-safety).

The Bad
: Search is a bit slower than the non-parallel variant. It's still fast though.

About
: Website: [https://github.com/greg7mdp/gtl](https://github.com/greg7mdp/gtl), Tested version: `v1.1.2`, License: `Apache License 2.0`


<a name="gtl__parallel_node_hash_map" /> 

### gtl::parallel_node_hash_map [↑](#table)

The parallel variants of the hashmaps have reduced peak memory usage and multithreading support. This is done by splitting up the data into multiple sub-hashmaps. See [Parallel hash containers provided by gtl](https://github.com/greg7mdp/gtl/blob/main/docs/phmap.md) for more information.

The Good
: Copying is a bit faster than `gtl::flat_hash_map`. It has nice thread safety properties, see [here](https://github.com/greg7mdp/gtl/blob/main/docs/phmap.md#thread-safety).

The Bad
: Memory usage is not really much better due to the node overhead. This is the slowerst variant in terms of find speed.

About
: Website: [https://github.com/greg7mdp/gtl](https://github.com/greg7mdp/gtl), Tested version: `v1.1.2`, License: `Apache License 2.0`


<a name="jg__dense_hash_map" />

### jg::dense_hash_map [↑](#table)

A simple replacement for `std::unordered_map` with better performance but loose stable addressing as a trade-off. The author has [nice blog posts about the hashmap's properties](https://jguegant.github.io/blogs/tech/dense-hash-map.html#dense-hash-map).

The Good
: Most operations are really fast, and since data is densly stored iteration is very fast too. For small number of elements (200-2000) this is actually the fastest map!

The Bad
: For larger maps the search is still fast but not the best. String search is ok but not among the best performer.

About
: Website: [https://github.com/Jiwan/dense_hash_map](https://github.com/Jiwan/dense_hash_map), Tested version: `74277fc4 (master)`, License: `MIT License`


<a name="robin_hood__unordered_flat_map" />

### robin_hood::unordered_flat_map [↑](#table)

Full disclaimer: I'm the author! This is a flat map that is very fast, and I have spent considerable time optimizing it. At that point though it has become hard for me to further support it, and will only provide bug fixes. I consider `ankerl::unordered_dense::map` its successor!

The Good
: Search for numbers is quite fast, inserting & erasing is very good.

The Bad
: Iteration is relatively slow, search for numbers could be better. Due to the design when bad hash quality is used it can overflow though (throws `std::overflow_error`). In my own usage, which is quite heavy, this never happened to me. There are reports from users though where it happened. I've stopped developing it in favor of `ankerl::unordered_dense::map`.

About
: Website: [https://github.com/martinus/robin-hood-hashing](https://github.com/martinus/robin-hood-hashing), Tested version: `3.11.5`, License: `MIT License`


<a name="robin_hood__unordered_node_map" />

### robin_hood::unordered_node_map [↑](#table)

Similar to `robin_hood::unordered_flat_map`, but with stable references & pointers. To make this fast it uses a specialized allocator implementation. At that point though it has become hard for me to further support it, and will only provide bug fixes. I consider `ankerl::unordered_dense::map` its successor!

The Good
: It's really fast and memory usage is quite low. For a node based container iteration is quite good.

The Bad
: Due to the design when bad hash quality is used it can overflow though (throws `std::overflow_error`). In my own usage, which is quite heavy, this never happened to me. There are reports from users though where it happened. I've stopped developing it in favor of `ankerl::unordered_dense::map`.

About
: Website: [https://github.com/martinus/robin-hood-hashing](https://github.com/martinus/robin-hood-hashing), Tested version: `3.11.5`, License: `MIT License`


<a name="ska__bytell_hash_map" /> 

### ska::bytell_hash_map [↑](#table)

This map was developed by Malte Skarupke in response to Google's `absl::flat_hash_map`. It is described with benchmarks in the blog post [A new fast hash table in response to Google’s new fast hash table](https://probablydance.com/2018/05/28/a-new-fast-hash-table-in-response-to-googles-new-fast-hash-table/). 

The Good
: Insert & erase is very fast, find speed is ok. Memory usage is quite good, the same as `robin_hood::unordered_flat_map`. I suspect it too uses 1 byte overhead per entry and a default fill rate of 80%.

The Bad
: Iteration is slow. The map has not received any updates in the last 4 years.

About
: Website: [https://github.com/skarupke/flat_hash_map](https://github.com/skarupke/flat_hash_map), Tested version: `2c468743 (master)`, License: `Boost Software License 1.0`


<a name="ska__flat_hash_map" /> 

### ska::flat_hash_map [↑](#table)

This map came before `ska::bytell_hash_map` and is described in Malte Skarupke's blog post [I Wrote The Fastest Hashtable](https://probablydance.com/2017/02/26/i-wrote-the-fastest-hashtable/)

The Good
: Search performanc is really good, especially for small number of entries.

The Bad
: Contrary to its claims it is not the fastest hashtable in any of my benchmarks. Iteration speed is very slow, 26 times slower than the top hash maps. Memory usage is very high.

About
: Website: [https://github.com/skarupke/flat_hash_map](https://github.com/skarupke/flat_hash_map), Tested version: `2c468743 (master)`, License: `Boost Software License 1.0`


<a name="spp__sparse_hash_map" /> 

### spp::sparse_hash_map [↑](#table)

The map is derived from Google's [sparsehash](https://github.com/sparsehash/sparsehash) implementation, but with a modernized C++11 interface. 

The Good
: Memory usage is very low. Iteration speed is good. Find performance is quite good for such a compact hashmap.

The Bad
: Copy is relatively slow, I'm pretty sure this could be optimized.

About
: Website: [https://github.com/greg7mdp/sparsepp](https://github.com/greg7mdp/sparsepp), Tested version: `1.22`, License: `modified MIT`


<a name="std__unordered_map" /> 

### std::unordered_map [↑](#table)

This is the golden standard to which every implementation likes to compare against.

The Good
: It's the standard. It is rock solid, and for most use cases fast enough.

The Bad
: Slow across the board. There is no benchmark where the map is fast compared to most of the competitors.

About
: Website: [https://gcc.gnu.org/onlinedocs/libstdc++/](https://gcc.gnu.org/onlinedocs/libstdc++/), Tested version: `v3`, License: [modified GPL](https://gcc.gnu.org/onlinedocs/libstdc++/manual/license.html)


<a name="std__unordered_map__PoolAllocator" /> 

### std::unordered_map & PoolAllocator [↑](#table)

`PoolAllocator` provides a generic allocator that works especially well for node based maps like `std::unordered_map`. 

The Good
: Copying the map becomes about twice as fast with the allocator. Memory usage drops quite a bit. There is some change in find performance, sometimes it's faster with the pool, sometimes slower. 

The Bad
: Initialization is a bit more complex, requiring one additional line of code to initialize the `PoolAllocator`.

About
: Website: [https://github.com/martinus/map_benchmark/blob/master/src/app/pool.h](https://github.com/martinus/map_benchmark/blob/master/src/app/pool.h), Tested version: `644b2fa (master)`, License: `MIT License`


<a name="std__unordered_map__unsynchronized_pool_resource" />

### std::unordered_map & std::pmr::unsynchronized_pool_resource [↑](#table)

Theoretically `std::pmr::unsynchronized_pool_resource` should behave very similar to `PoolAllocator`, but it comes from the standard library and requires support for polymorphic memory resources. This is in the C++17 standard, but not everyone implements this.

The Good
: Same as for `PoolAllocator` find is mostly unaffected, and memory usage is lower.

The Bad
: Iteration speed is slowed down significantly. Theoretically this shouldn't make any difference, but it does. Copying the map also got slower.

About
: Website: [https://gcc.gnu.org/onlinedocs/libstdc++/](https://gcc.gnu.org/onlinedocs/libstdc++/), Tested version: `v3`, License: [modified GPL](https://gcc.gnu.org/onlinedocs/libstdc++/manual/license.html)


<a name="tsl__hopscotch_map" />

### tsl::hopscotch_map [↑](#table)

Hashmap based on hopscotch method. This method should be cache friendly and is relatively similar to `google::dense_hash_map`. 

The Good
: Insert & erase is very fast. Search performance is ok but not stellar. Memory usage is ok-ish.

The Bad
: General performance is not too bad, but also not good. 

About
: Website: [https://github.com/Tessil/hopscotch-map](https://github.com/Tessil/hopscotch-map), Tested version: `v2.3.0`, License: `MIT license `


<a name="tsl__robin_map" />

### tsl::robin_map [↑](#table)

A map implemented that makes use of robin hood's backward shift deletion.

The Good
: When a proper hash is used (anything except `std::hash` or `boost::hash`), insert & erase performance is top.

The Bad
: It is very sensitive with the hash quality, and times out in my random insert & erase benchmarks with `std::hash` and `boost::hash`. Memory usage is very high. `std::string` search is ok but not the fastest. Iteration speed is very slow.

About
: Website: [https://github.com/Tessil/robin-map](https://github.com/Tessil/robin-map), Tested version: `1.0.1`, License: `MIT License`


<a name="tsl__sparse_map" /> 

### tsl::sparse_map [↑](#table)

A map based on Google's `google::sparse_hash_map`, which also makes it similar to `spp::sparse_hash_map`. 

The Good
: Excellent low memory usage, only `gtl::btree_map` is better. For such a low memory usage search performance is very good. Copy is fast too.

The Bad
: As with `tsl::robin_map` this implementation highly depends on a good quality hash. My benchmarks time out with `std::hash` and `boost::hash`.

About
: Website: [https://github.com/Tessil/sparse-map](https://github.com/Tessil/sparse-map), Tested version: `v0.6.2`, License: `MIT license`

## Hashes

I have benchmarked all hashmaps with a combination of different hashes. All the hashes have a generic implementation, but they can be basically differenciated into two different modes:

* Calculating a hash of an integral type (`int`, `size_t`, `uint64_t`, ...)
* Calculating a hash of a string (`std::string`, `std::string_view`, ...)

Many hashmap implementation depend on a reasonably good hash, where *reasonably good* usually means that it has sufficiently good [avalanching](https://en.wikipedia.org/wiki/Avalanche_effect) so that changes in the input have an effect on the storage location in the hashmap.

Unfortunately `std::hash` and `boost::hash` use the identity function for integral types. This is obviously very fast to calculate (simply return the input value), but has no avalanching properties whatsoever. Depending on the input value this can be disastrous for the hashmap performance. It can make the difference between 1 second and 10 minutes runtime. Most of these problems can be found when operating with numbers where only the upper bits change while the lower bits stay constant.


<a name="std__hash" /> 

### std::hash [↑](#table)

Integral Types
: Most implementations use the identity hash, which makes them incredible fast and incredible bad. Identity hash works for some hashmap implementations, either by design or because they contain mitigation measures. E.g. `ankerl::unordered_dense::map` specifically implements additional mixer when it believes hashes are of bad quality. Many maps don't have these mitigation steps. Thus many of my benchmarks time out for the maps `absl::flat_hash_map`, `absl::node_hash_map`, `emhash7::HashMap`, `emhash8::HashMap`, `jg::dense_hash_map`, `spp::sparse_hash_map`, `tsl::hopscotch_map`, `tsl::robin_map`, `tsl::sparse_map`. Here are some hashes and the corresponding hash values. You can see that any hashmap that depends on the lower or upper bits to change on different input might not get what they want:
  * `0x0000000000000000` &rarr; `0x0000000000000000` `0000000000000000000000000000000000000000000000000000000000000000`
  * `0x0000000000000001` &rarr; `0x0000000000000001` `0000000000000000000000000000000000000000000000000000000000000001`
  * `0x0000000000000002` &rarr; `0x0000000000000002` `0000000000000000000000000000000000000000000000000000000000000010`
  * `0x0001000000000000` &rarr; `0x0001000000000000` `0000000000000001000000000000000000000000000000000000000000000000`
  * `0x0002000000000000` &rarr; `0x0002000000000000` `0000000000000010000000000000000000000000000000000000000000000000`
  * `0x0004000000000000` &rarr; `0x0004000000000000` `0000000000000100000000000000000000000000000000000000000000000000`
  * `0x0001000000000001` &rarr; `0x0001000000000001` `0000000000000001000000000000000000000000000000000000000000000001`
  * `0x0002000000000001` &rarr; `0x0002000000000001` `0000000000000010000000000000000000000000000000000000000000000001`
  * `0x0004000000000001` &rarr; `0x0004000000000001` `0000000000000100000000000000000000000000000000000000000000000001`

Note that [Microsoft's implementation of the STL uses the fnv1a algorithm](https://github.com/microsoft/STL/blob/main/stl/inc/type_traits#L2143). This is a very simple hash with ok-ish quality and very bad performance. [See godbolt for a comparison](https://godbolt.org/z/Pz9TEfcYe).

String Types
: String hashing performance is ok for libstdc++.

<a name="boost__hash" /> 

### boost::hash [↑](#table)

Integral Types
: Uses identity hash, therefore it should behave here exactly the same as `std::hash`. The same maps timeout: `absl::flat_hash_map`, `absl::node_hash_map`, `emhash7::HashMap`, `emhash8::HashMap`, `jg::dense_hash_map`, `spp::sparse_hash_map`, `tsl::hopscotch_map`, `tsl::robin_map`, `tsl::sparse_map`. As with `std::hash`, the hash values have no avalanching.
  * `0x0000000000000000` &rarr; `0x0000000000000000` `0000000000000000000000000000000000000000000000000000000000000000`
  * `0x0000000000000001` &rarr; `0x0000000000000001` `0000000000000000000000000000000000000000000000000000000000000001`
  * `0x0000000000000002` &rarr; `0x0000000000000002` `0000000000000000000000000000000000000000000000000000000000000010`
  * `0x0001000000000000` &rarr; `0x0001000000000000` `0000000000000001000000000000000000000000000000000000000000000000`
  * `0x0002000000000000` &rarr; `0x0002000000000000` `0000000000000010000000000000000000000000000000000000000000000000`
  * `0x0004000000000000` &rarr; `0x0004000000000000` `0000000000000100000000000000000000000000000000000000000000000000`
  * `0x0001000000000001` &rarr; `0x0001000000000001` `0000000000000001000000000000000000000000000000000000000000000001`
  * `0x0002000000000001` &rarr; `0x0002000000000001` `0000000000000010000000000000000000000000000000000000000000000001`
  * `0x0004000000000001` &rarr; `0x0004000000000001` `0000000000000100000000000000000000000000000000000000000000000001`

String Types
: String hashing performance is slow! It's much slower than `std::hash` and it seems to use by far the slowest string hashing algorithm of all hashes that I tested.

<a name="absl__Hash" /> 

### absl::Hash [↑](#table)

Integral Types
: This mixes the numbers well and has good avalanching properties. It is also fast, works well with all hashmaps. Here are some inputs and the corresponding hash values (in hex and in bits)
  * `0x0000000000000000` &rarr; `0x9a21db8e77112ea2` `1001101000100001110110111000111001110111000100010010111010100010`
  * `0x0000000000000001` &rarr; `0x3801ed914ce8fc3a` `0011100000000001111011011001000101001100111010001111110000111010`
  * `0x0000000000000002` &rarr; `0xd5e1f799a1a0d391` `1101010111100001111101111001100110100001101000001101001110010001`
  * `0x0001000000000000` &rarr; `0xc78a3c6e611a3b6a` `1100011110001010001111000110111001100001000110100011101101101010`
  * `0x0002000000000000` &rarr; `0xf4f29e4e1be30032` `1111010011110010100111100100111000011011111000110000000000110010`
  * `0x0004000000000000` &rarr; `0x4fc7420e2ffd79c3` `0100111111000111010000100000111000101111111111010111100111000011`
  * `0x0001000000000001` &rarr; `0x656a0a715ae3e9f2` `0110010101101010000010100111000101011010111000111110100111110010`
  * `0x0002000000000001` &rarr; `0x92d2a851201ad2aa` `1001001011010010101010000101000100100000000110101101001010101010`
  * `0x0004000000000001` &rarr; `0xeda774111404ab5a` `1110110110100111011101000001000100010100000001001010101101011010`

String Types
: String hashing performance is very fast, I believe it is based on `wyhash`.


<a name="ankerl__unordered_dense__hash" />

### ankerl::unordered_dense::hash [↑](#table)

A very fast hash across the board, with good avalanching properties. Note that this always returns an `uint64_t` and not a `size_t` like `std::hash`, so it produces the same 64bit numbers also on 32bit systems (and might be relatively slow on these). It also adds a property `using is_avalanching = void;` to the hash which makes it possible for hashmap implementations to differentiate their behavior based on the quality of the hash they are getting. This is used in `ankerl::unordered_dense::map`.

Integral Types
: This hash uses a very simple but effective mixer. It performs a 128bit multiplication of the input with a constant and then XOR's the input. It produces good avalanching (at least good enough for hashmaps to perform well), and can be calculated extremely fast. It usually compiles down to 4 assembly instructions (`movabs`, `mov`, `mul`, `xor`. See [godbolt example](https://godbolt.org/z/b36Kr8oYj)). Note that for the input 0 the output is also 0. I believe it has worse mixing quality than the hash used in `absl::Hash`, but it is faster and generally good enough.
  * `0x0000000000000000` &rarr; `0x0000000000000000` `0000000000000000000000000000000000000000000000000000000000000000`
  * `0x0000000000000001` &rarr; `0x9e3779b97f4a7c15` `1001111000110111011110011011100101111111010010100111110000010101`
  * `0x0000000000000002` &rarr; `0x3c6ef372fe94f82b` `0011110001101110111100110111001011111110100101001111100000101011`
  * `0x0001000000000000` &rarr; `0x7c159e3779b97f4a` `0111110000010101100111100011011101111001101110010111111101001010`
  * `0x0002000000000000` &rarr; `0xf82b3c6ef372fe94` `1111100000101011001111000110111011110011011100101111111010010100`
  * `0x0004000000000000` &rarr; `0xf05678dde6e5fd29` `1111000001010110011110001101110111100110111001011111110100101001`
  * `0x0001000000000001` &rarr; `0x1a4ce78e06f3035e` `0001101001001100111001111000111000000110111100110000001101011110`
  * `0x0002000000000001` &rarr; `0x966045d78c388280` `1001011001100000010001011101011110001100001110001000001010000000`
  * `0x0004000000000001` &rarr; `0x8e89016499af813f` `1000111010001001000000010110010010011001101011111000000100111111`

String Types
: This uses [wyhash](https://github.com/wangyi-fudan/wyhash). This is an extremely fast hash for both small and large strings with very high hashing quality. The code size is also relatively small which makes inlining easier for the compiler.


<a name="robin_hood__hash" /> 

### robin_hood::hash [↑](#table)

Integral Types
: The hash of `robin_hood::unordered_map` has gone through quite a bit of evolution. Currently it is basically murmurhash3. It is relatively fast and should have relatively good avalanching properties.
  * `0x0000000000000000` &rarr; `0x0000000000000000` `0000000000000000000000000000000000000000000000000000000000000000`
  * `0x0000000000000001` &rarr; `0xff51afd792fd5b26` `1111111101010001101011111101011110010010111111010101101100100110`
  * `0x0000000000000002` &rarr; `0xfea35fafa5fab64d` `1111111010100011010111111010111110100101111110101011011001001101`
  * `0x0001000000000000` &rarr; `0x64b8f6aaf43afb55` `0110010010111000111101101010101011110100001110101111101101010101`
  * `0x0002000000000000` &rarr; `0xc971ed55e875f6aa` `1100100101110001111011010101010111101000011101011111011010101010`
  * `0x0004000000000000` &rarr; `0x92e3daab50ebed55` `1001001011100011110110101010101101010000111010111110110101010101`
  * `0x0001000000000001` &rarr; `0x640aa68281b95f8c` `0110010000001010101001101000001010000001101110010101111110001100`
  * `0x0002000000000001` &rarr; `0xc8c39d2d1e43425b` `1100100011000011100111010010110100011110010000110100001001011011`
  * `0x0004000000000001` &rarr; `0x92358a834ff5498c` `1001001000110101100010101000001101001111111101010100100110001100`

String Types
: Uses a slightly streamlined MurmurHash2 hash which is quite compact and fast.


<a name="mumx" />

### mumx [↑](#table)

Simple hash that uses exactly the same algorithm as `ankerl::unordered_dense::hash` for integral types (but with a different multiplier constatn), and reverts to `std::hash` for all other types.

Integral Types
: Same as `ankerl::unordered_dense::hash`, avalanching is good.
  * `0x0000000000000000` &rarr; `0x0000000000000000` `0000000000000000000000000000000000000000000000000000000000000000`
  * `0x0000000000000001` &rarr; `0x2ca7aea0ebd71d49` `0010110010100111101011101010000011101011110101110001110101001001`
  * `0x0000000000000002` &rarr; `0x594f5d41d7ae3a92` `0101100101001111010111010100000111010111101011100011101010010010`
  * `0x0001000000000000` &rarr; `0x1d492ca7aea0ebd7` `0001110101001001001011001010011110101110101000001110101111010111`
  * `0x0002000000000000` &rarr; `0x3a92594f5d41d7ae` `0011101010010010010110010100111101011101010000011101011110101110`
  * `0x0004000000000000` &rarr; `0x7524b29eba83af5c` `0111010100100100101100101001111010111010100000111010111101011100`
  * `0x0001000000000001` &rarr; `0x49f082074577f69e` `0100100111110000100000100000011101000101011101111111011010011110`
  * `0x0002000000000001` &rarr; `0x6739f7efb696cae7` `0110011100111001111101111110111110110110100101101100101011100111`
  * `0x0004000000000001` &rarr; `0xa1cb1c3e5154b215` `1010000111001011000111000011111001010001010101001011001000010101`

String Types
: Same as `std::hash`.


# Conclusion

This benchmark, [like the last one](/2019/04/01/hashmap-benchmarks-05-conclusion/), was a lot more effort than I originally anticipated. Redoing the benchmark took my computer weeks, and I've completely revamped the presentation with the big table which hopefully is easier to browse and search than the charts I've done in the last benchmark. I had a look at each hashmap, the different hashes, and tried to figure out why they behave one way or the other.

So what's actually the best map to choose? As you saw above, it depends. There are a lot of excellent implementations to choose from, each with different properties. I can't give any advice here. Although I've spent a lot of time making the benchmarks as good as possible, they might not necessarily represent your real world needs.

All of the work here is available as open source here: [https://github.com/martinus/map_benchmark](https://github.com/martinus/map_benchmark)

If you like my work, I'd really appreciate it if you can [become my sponsor](https://github.com/sponsors/martinus)!

# Errata

2022-09-07
* I claimed that `std::hash` always uses identity hash. That's not true, Microsoft's STL uses fnv1a.

2022-09-08 
* I wrote that absl::Hash is the slowest for `std::string`. This is totally not true, that statement should have gone to `boost::hash`.
