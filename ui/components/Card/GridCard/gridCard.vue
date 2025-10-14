<template>
    <div class="grid grid-cols-[repeat(auto-fit,minmax(280px,_1fr))] gap-3 p-1">
        <Card
          v-for="(item, index) in props.visibleAssets"
          :key="item.id"
          :asset="item"
          @connect-asset="emits('connectAsset', item)"
          @context-trigger="emits('contextTrigger', $event)"
        />

        <template v-if="isAppending">
          <CardSkeletonCard :skeleton-count="appendSkeletonCount" />
        </template>
    </div>
</template>

<script setup lang="ts">
import Card from "./cardItem.vue";
import CardSkeletonCard from "./skeletonCard.vue";
import type { AssetItem } from "~/types";

const emits = defineEmits<{
  (e: "connectAsset", asset: AssetItem): void;
  (e: "contextTrigger", asset: AssetItem): void;
}>();

const props = defineProps<{
  visibleAssets: AssetItem[];
  isAppending: boolean;
  appendSkeletonCount: number;
}>();
</script>