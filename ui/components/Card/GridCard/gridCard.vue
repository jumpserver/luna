<script setup lang="ts">
import type { AssetItem } from "~/types";
import Card from "./cardItem.vue";

const props = defineProps<{
  visibleAssets: AssetItem[]
  isAppending: boolean
  appendSkeletonCount: number
}>();

const emits = defineEmits<{
  (e: "connectAsset", asset: AssetItem): void
  (e: "contextTrigger", asset: AssetItem): void
  (e: "editTrigger", asset: AssetItem): void
  (e: "connectTrigger", asset: AssetItem): void
}>();
</script>

<template>
  <div class="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-3 p-1">
    <Card
      v-for="item in props.visibleAssets"
      :key="item.id"
      :asset="item"
      @connect-asset="emits('connectAsset', item)"
      @context-trigger="emits('contextTrigger', $event)"
      @edit-trigger="emits('editTrigger', item)"
      @connect-trigger="emits('connectTrigger', item)"
    />
  </div>
</template>
