<template>
    <div class="grid grid-cols-[repeat(auto-fit,minmax(280px,_1fr))] gap-3 p-1">
        <Card
          v-for="(item, index) in props.visibleAssets"
          :key="item.id"
          :asset="item"
          @context-trigger="(asset, event) => emits('contextTrigger', asset, event)"
          @connect-asset="emits('connectAsset', item)"
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
  (e: "contextTrigger", asset: AssetItem, event: MouseEvent): void;
  (e: "connectAsset", asset: AssetItem): void;
}>();

const props = defineProps<{
  visibleAssets: AssetItem[];
  isAppending: boolean;
  appendSkeletonCount: number;
}>();
</script>