<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import type { AssetItem, PermedProtocol } from "~/types";
import { h, resolveComponent } from "vue";
import ContextMenu from "../../AssetContextMenu/contextMenu.vue";

const UButton = resolveComponent("UButton");
const UBadge = resolveComponent("UBadge");

const emits = defineEmits<{
  (e: "connectAsset", asset: AssetItem): void;
  (e: "contextTrigger", asset: AssetItem): void;
}>();

const props = defineProps<{
  items: AssetItem[];
}>();

const { t } = useI18n();
const { displayUser, displayProtocol } = useAssetAction();

// Context menu 状态
const contextMenuVisible = ref(false);
const contextMenuAsset = ref<AssetItem | null>(null);
const contextMenuPosition = ref({ x: 0, y: 0 });

/**
 * @description 处理上下文事件
 */
const handleContextTrigger = (asset: AssetItem) => {
  emits("contextTrigger", asset);
};

/**
 * @description 显示下拉菜单
 */
const showDropdown = (asset: AssetItem, event: MouseEvent) => {
  event.preventDefault();
  contextMenuAsset.value = asset;
  contextMenuPosition.value = { x: event.clientX, y: event.clientY };
  contextMenuVisible.value = true;
};


const columns: TableColumn<AssetItem>[] = [
  {
    accessorKey: "assetName",
    header: () => t("AssetCard.AssetName"),
    cell: ({ row }) => row.original.name
  },
  {
    accessorKey: "address",
    header: () => t("AssetCard.Address")
  },
  {
    id: "user",
    header: () => t("AssetCard.User"),
    cell: ({ row }) => displayUser(row.original.id, row.original.permedAccounts!)
  },
  {
    id: "protocol",
    header: () => t("AssetCard.Protocol"),
    cell: ({ row }) => displayProtocol(row.original.id, row.original.permedProtocols!)
  },
  {
    id: "status",
    header: () => t("AssetCard.Status"),
    cell: ({ row }) =>
      h(
        UBadge,
        {
          variant: "subtle",
          color: row.original.isActive ? "success" : "error"
        },
        () => (row.original.isActive ? t("Common.Active") : t("Common.Inactive"))
      )
  },
  {
    id: "actions",
    header: () => t("AssetCard.Actions"),
    cell: ({ row }) =>
      h("div", { class: "flex gap-2" }, [
        h(UButton, {
          size: "xs",
          color: "primary",
          variant: "outline",
          label: t("Common.Connect"),
          onClick: () => emits("connectAsset", row.original)
        }),
        h(UButton, {
          icon: "i-lucide-ellipsis",
          size: "xs",
          color: "primary",
          variant: "outline",
          "data-table-context-button": true,
          onClick: (event: MouseEvent) => showDropdown(row.original, event)
        })
      ])
  }
];
</script>

<template>
  <UCard variant="outline" class="w-full">
    <UTable
      sticky
      :data="props.items"
      :columns="columns"
      class="flex-1"
      :ui="{ tr: 'hover:bg-muted/50' }"
    />
  </UCard>

  <!-- Context Menu -->
  <ContextMenu
    v-if="contextMenuAsset"
    :asset="contextMenuAsset"
    :visible="contextMenuVisible"
    :x="contextMenuPosition.x"
    :y="contextMenuPosition.y"
    @update:visible="contextMenuVisible = $event"
    @context-trigger="handleContextTrigger"
  />
</template>
