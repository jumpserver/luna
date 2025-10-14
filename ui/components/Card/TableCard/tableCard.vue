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
    cell: ({ row }) => h("div", { 
      class: "max-w-[200px] truncate", 
      title: row.original.name 
    }, row.original.name),
    size: 200,
    minSize: 150,
    maxSize: 300
  },
  {
    accessorKey: "address",
    header: () => t("AssetCard.Address"),
    cell: ({ row }) => h("div", { 
      class: "max-w-[150px] truncate", 
      title: row.original.address 
    }, row.original.address),
    size: 150,
    minSize: 120,
    maxSize: 200
  },
  {
    id: "user",
    header: () => t("AssetCard.User"),
    cell: ({ row }) => {
      const userText = displayUser(row.original.id, row.original.permedAccounts!);
      return h("div", { 
        class: "max-w-[120px] truncate", 
        title: userText 
      }, userText);
    },
    size: 120,
    minSize: 100,
    maxSize: 150
  },
  {
    id: "protocol",
    header: () => t("AssetCard.Protocol"),
    cell: ({ row }) => {
      const protocolText = displayProtocol(row.original.id, row.original.permedProtocols!);
      return h("div", { 
        class: "max-w-[100px] truncate", 
        title: protocolText 
      }, protocolText);
    },
    size: 100,
    minSize: 80,
    maxSize: 120
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
      ),
    size: 100,
    minSize: 80,
    maxSize: 120
  },
  {
    id: "actions",
    header: () => t("AssetCard.Actions"),
    cell: ({ row }) =>
      h("div", { 
        class: "inline-flex rounded-md shadow-sm" 
      }, [
        h(UButton, {
          size: "xs",
          color: "primary",
          variant: "outline",
          label: t("Common.Connect"),
          class: "rounded-r-none border-r-0 rounded-none",
          onClick: () => emits("connectAsset", row.original)
        }),
        h(UButton, {
          icon: "i-lucide-ellipsis",
          size: "xs",
          color: "primary",
          variant: "outline",
          class: "rounded-l-none rounded-none border-l-0",
          "data-table-context-button": true,
          onClick: (event: MouseEvent) => showDropdown(row.original, event)
        })
      ]),
    size: 180,
    minSize: 160,
    maxSize: 200
  }
];
</script>

<template>
  <UCard variant="outline" class="w-full overflow-hidden">
    <div class="overflow-x-auto">
      <UTable
        sticky
        :data="props.items"
        :columns="columns"
        class="w-full min-w-[800px] table-fixed"
        :ui="{ 
          tr: 'hover:bg-muted/50',
          th: 'whitespace-nowrap',
          td: 'whitespace-nowrap'
        }"
      />
    </div>
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
