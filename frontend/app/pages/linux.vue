<script setup lang="ts">
/**
 * @description 哨兵进入视口：预取下一页
 */
// useIntersectionObserver(
//   sentinelRef,
//   ([entry]) => {
//     if (entry!.isIntersecting && hasMore.value && !isLoading.value) {
//       fetchNextPage();
//     }
//   },
//   { root: scrollRef, rootMargin: '200px', threshold: 0 }
// );

// useInfiniteScroll(scrollRef, () => fetchNextPage(), {
//   distance: 200,
//   canLoadMore: () => hasMore.value && !isLoading.value,
// });
</script>

<template>
  <div>
    <BasePage type="linux" />
  </div>
</template>
