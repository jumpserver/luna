<script setup lang="ts">
import type { ContextMenuItem } from "@nuxt/ui";
import type { PermedAccount, PermedProtocol } from "~/types/index";

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
    zone: string;
    user: string;
    category: string;
    type: string;
    assetId: string;
    address: string;
    iconName: string;
    protocol: string;
    assetName: string;
    highlight: boolean;
    isActive: boolean;
    accounts?: PermedAccount[];
    protocols?: PermedProtocol[];
  }>(),
  {
    accounts: () => [],
    protocols: () => []
  }
);

const emits = defineEmits<{
  (e: "openEditModal"): void;
  (e: "contextTrigger", assetId: string): void;
}>();

const { t, locale } = useI18n();
const { handleAssetConnection, displayProtocol, handleAssetFavorite, getAssetDetail } =
  useAssetAction();

const contextMenuItems = computed<ContextMenuItem[][]>(() => {
  const protocols = (props.protocols || []).map((p: PermedProtocol) => p.name);
  const uniqueProtocols = Array.from(new Set(protocols));

  const moreConnectChildren: ContextMenuItem[] = uniqueProtocols.map((name: string) => ({
    label: `${t("ContextMenu.Use")} ${name.toUpperCase()}`,
    onClick: () => handleConnect(name)
  }));

  // 避免处理空数组
  if (moreConnectChildren.length === 0) {
    moreConnectChildren.push({
      label: t("Common.NoData"),
      disabled: true
    } as ContextMenuItem);
  }

  return [
    [
      // {
      //   label: t("ContextMenu.QuickConnect"),
      //   icon: "i-lucide-unplug",
      //   onClick: () => handleConnect(props.assetId)
      // },
      {
        label: t("ContextMenu.Connect"),
        icon: "i-lucide-plug",
        children: [moreConnectChildren]
      },
      {
        label: t("ContextMenu.Edit"),
        icon: "solar:pen-new-square-linear",
        onClick: () => openEditModal()
      },
      {
        label: t("ContextMenu.Rename"),
        icon: "i-lucide-pencil"
      },
      {
        label: t("ContextMenu.Favorite"),
        icon: "i-lucide-star",
        onClick: () => handleAssetFavorite(props.assetId)
      }
    ]
  ];
});


function handleConnect(protocolOverride?: string) {
  handleAssetConnection(
    props.user,
    props.assetId,
    displayProtocol(props.assetId, props.protocols!),
    props.accounts || [],
    protocolOverride
  );
}

/**
 * @description 打开 Edit 弹窗
 */
const openEditModal = () => {
  emits("openEditModal");
};

/**
 * @description 唤起右键菜单
 */
const handleContextOpen = (payload: boolean) => {
  if (payload) {
    getAssetDetail(props.assetId);
    emits("contextTrigger", props.assetId);
  }
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
    <UContextMenu
      size="sm"
      :items="contextMenuItems"
      :ui="{
        content: 'w-48 p-1'
      }"
      @update:open="handleContextOpen"
    >
      <section class="w-full p-2" @dblclick="getAssetDetail(props.assetId)">
        <div class="flex items-center justify-between w-full">
          <div class="flex items-center gap-3 flex-1 min-w-0">
            <AssetIcon :type="type" size="lg" />

            <div class="flex-1 min-w-0 overflow-hidden w-[120px]">
              <div class="text-xs-plus font-bold truncate whitespace-nowrap">
                {{ assetName }}
              </div>
              <div
                class="text-[13px] text-neutral-500 dark:text-neutral-400 truncate whitespace-nowrap"
              >
                {{ address }}
              </div>
            </div>
          </div>

          <div class="flex-shrink-0 ml-2">
            <UButton
              size="xs"
              color="primary"
              variant="solid"
              class="group btn-connect px-3"
              :disabled="!isActive"
              @click="getAssetDetail(props.assetId)"
            >
              {{ t("ContextMenu.Connect") }}
            </UButton>
          </div>
        </div>
      </section>
    </UContextMenu>
  </UPageCard>
</template>
