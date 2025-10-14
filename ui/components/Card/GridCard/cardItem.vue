<script setup lang="ts">
import type { AssetItem } from "~/types";
import AssetIcon from "../AssetIcon/assetIcon.vue";
import ContextMenu from "../../AssetContextMenu/contextMenu.vue";

const props = withDefaults(
  defineProps<{
    asset: AssetItem;
  }>(),
  {
  }
);

const emits = defineEmits<{
  (e: "connectAsset", asset: AssetItem): void;
  (e: "contextTrigger", asset: AssetItem): void;
}>();

const { t, locale } = useI18n();

// Context menu 状态
const contextMenuVisible = ref(false);
const contextMenuPosition = ref({ x: 0, y: 0 });

/**
 * @description 处理右击事件
 */
const handleContextMenu = (event: MouseEvent) => {
  event.preventDefault();
  contextMenuPosition.value = { x: event.clientX, y: event.clientY };
  contextMenuVisible.value = true;
};

/**
 * @description 处理上下文事件
 */
const handleContextTrigger = (asset: AssetItem) => {
  emits("contextTrigger", asset);
};

</script>

<template>
  <UPageCard
    class="w-full page-card shadow-sm hover:shadow-md dark:hover:shadow-gray-700"
    :ui="{
      body: 'p-1 ',
      container: 'p-0 sm:p-0 '
    }"
  >
    <section class="w-full p-4" @dblclick="emits('connectAsset', props.asset)" @contextmenu="handleContextMenu">
      <div class="flex items-center justify-between w-full">
        <div class="flex items-center gap-3 flex-1 min-w-0">
          <AssetIcon :type="props.asset.type" size="lg" />

          <div class="flex-1 min-w-0 overflow-hidden w-[120px]">
            <div class="text-xs-plus font-bold truncate whitespace-nowrap">
              {{ props.asset.name }}
            </div>
            <div
              class="text-[13px] text-neutral-500 dark:text-neutral-400 truncate whitespace-nowrap"
            >
              {{ props.asset.address }} {{ props.asset.type }}
            </div>
          </div>
        </div>

        <div class="flex-shrink-0 ml-2">
          <UButton
            size="xs"
            color="primary"
            variant="solid"
            class="group btn-connect px-3"
            :disabled="!props.asset.isActive"
            @click="emits('connectAsset', props.asset)"
          >
            {{ t("ContextMenu.Connect") }}
          </UButton>
        </div>
      </div>
    </section>
  </UPageCard>

  <!-- Context Menu -->
  <ContextMenu
    :asset="props.asset"
    :visible="contextMenuVisible"
    :x="contextMenuPosition.x"
    :y="contextMenuPosition.y"
    @update:visible="contextMenuVisible = $event"
    @context-trigger="handleContextTrigger"
  />
</template>
