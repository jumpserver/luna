<script setup lang="ts">
import type { ContextMenuItem } from "@nuxt/ui";
import type { PermedAccount, PermedProtocol } from "~/types/index";
import type { AssetItem } from "~/types";
import AssetIcon from "../AssetIcon/assetIcon.vue";

interface DetailRow {
  key: string;
  title: string;
  content: string;
  popover?: boolean;
  class?: string;
}

const props = withDefaults(
  defineProps<{
    asset: AssetItem;
  }>(),
  {
  }
);

const emits = defineEmits<{
  (e: "connectAsset", asset: AssetItem): void;
  (e: "contextTrigger", asset: AssetItem, event: MouseEvent): void;
}>();

const { t, locale } = useI18n();

/**
 * @description 处理右击事件
 */
const handleContextMenu = (event: MouseEvent) => {
  event.preventDefault();
  emits("contextTrigger", props.asset, event);
};

</script>

<template>
  <UPageCard
    class="w-full page-card shadow-sm"
    :highlight="false"
    :ui="{
      body: 'p-1 ',
      container: 'p-2 sm:p-2 '
    }"
  >
      <section class="w-full p-2" @dblclick="emits('connectAsset', props.asset)" @contextmenu="handleContextMenu">
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
                {{ props.asset.address }}
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
</template>
