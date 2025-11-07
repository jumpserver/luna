<script setup lang="ts">
import type { AssetItem } from "~/types";
import { useAssetAction } from "~/composables/useAssetAction";

const props = withDefaults(
  defineProps<{
    asset: AssetItem;
  }>(),
  {}
);

const emits = defineEmits<{
  (e: "connectAsset", asset: AssetItem): void;
  (e: "contextTrigger", asset: AssetItem): void;
  (e: "editTrigger", asset: AssetItem): void;
  (e: "connectTrigger", asset: AssetItem): void;
}>();

const { t } = useI18n();

const renameValue = ref("");
const isRenaming = ref(false);
const contextMenuVisible = ref(false);
const contextMenuPosition = ref({ x: 0, y: 0 });
const renameInputRef = ref<HTMLInputElement | null>(null);

const { handleAssetRename } = useAssetAction();

const displayAddressLine = computed(() => {
  return props.asset.displayAddressLine || `${props.asset.address} ${props.asset.type}`;
});

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

/**
 * @description 处理开始重命名
 */
const handleRenameTrigger = (asset: AssetItem) => {
  if (asset.id !== props.asset.id) return;

  isRenaming.value = true;
  renameValue.value = props.asset.name || "";

  nextTick(() => renameInputRef.value?.focus());
};

/**
 * @description 提交重命名
 */
const submitRename = () => {
  const name = renameValue.value.trim();

  if (!name || name === props.asset.name) {
    isRenaming.value = false;
    return;
  }

  handleAssetRename(props.asset.id, name);

  isRenaming.value = false;
};

/**
 * @description 取消重命名
 */
const cancelRename = () => {
  isRenaming.value = false;
};
</script>

<template>
  <UPageCard
    class="w-full page-card hover:shadow-lg/30 hover:shadow-primary-500/50 transition-shadow duration-300 ease-out"
    :ui="{
      body: 'p-1 ',
      container: 'p-0 sm:p-0 '
    }"
  >
    <section class="w-full p-4" @dblclick="emits('connectAsset', props.asset)" @contextmenu="handleContextMenu">
      <div class="flex items-center justify-between w-full">
        <div class="flex items-center gap-3 flex-1 min-w-0">
          <CardAssetIcon :type="props.asset.type" size="lg" />

          <div class="flex-1 min-w-0 overflow-hidden w-[120px]">
            <div v-if="!isRenaming" class="text-xs-plus font-bold truncate whitespace-nowrap">
              {{ props.asset.name }}
            </div>

            <input
              v-else
              ref="renameInputRef"
              v-model="renameValue"
              class="text-xs-plus font-bold truncate whitespace-nowrap bg-transparent border-b border-primary focus:outline-none w-full"
              autocapitalize="off"
              autocorrect="off"
              spellcheck="false"
              style="text-transform: none"
              @keyup.enter.stop="submitRename"
              @keyup.esc.stop="cancelRename"
              @blur="submitRename"
            />

            <UTooltip arrow :text="displayAddressLine">
              <span
                class="text-[13px] text-neutral-500 dark:text-neutral-400 truncate whitespace-nowrap cursor-pointer"
              >
                {{ displayAddressLine }}
              </span>
            </UTooltip>
          </div>
        </div>

        <div class="shrink-0 ml-2">
          <UButton
            size="xs"
            color="primary"
            variant="soft"
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

  <AssetContextMenu
    :asset="props.asset"
    :visible="contextMenuVisible"
    :x="contextMenuPosition.x"
    :y="contextMenuPosition.y"
    @update:visible="contextMenuVisible = $event"
    @context-trigger="handleContextTrigger"
    @edit-trigger="emits('editTrigger', props.asset)"
    @connect-trigger="emits('connectTrigger', props.asset)"
    @rename-trigger="handleRenameTrigger"
  />
</template>
