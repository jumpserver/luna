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
  (e: "editTrigger", asset: AssetItem): void;
  (e: "connectTrigger", asset: AssetItem): void;
}>();

const props = defineProps<{
  items: AssetItem[];
}>();

const { t } = useI18n();
const { displayUser, displayProtocol, handleAssetRename } = useAssetAction();

const contextMenuVisible = ref(false);
const contextMenuAsset = ref<AssetItem | null>(null);
const contextMenuPosition = ref({ x: 0, y: 0 });

const renamingId = ref<string | null>(null);
const renameValue = ref("");
const renameInputEl = ref<HTMLInputElement | null>(null);

/**
 * @description 处理上下文事件
 */
const handleContextTrigger = (asset: AssetItem) => {
  emits("contextTrigger", asset);
};

/**
 * @description 触发重命名
 */
const handleRenameTrigger = (asset: AssetItem) => {
  renamingId.value = asset.id;
  renameValue.value = asset.name || "";
  contextMenuVisible.value = false;

  nextTick(() => renameInputEl.value?.focus());
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
    cell: ({ row }) => {
      if (renamingId.value === row.original.id) {
        return h("input", {
          ref: (el: any) => (renameInputEl.value = el as HTMLInputElement),
          value: renameValue.value,
          class:
            "text-xs sm:text-sm font-medium truncate whitespace-nowrap bg-transparent border-b border-primary focus:outline-none w-full",
          autocapitalize: "off",
          autocorrect: "off",
          spellcheck: false,
          style: { textTransform: "none" },
          onInput: (e: InputEvent) =>
            (renameValue.value = (e.target as HTMLInputElement).value || ""),
          onKeyup: (e: KeyboardEvent) => {
            if (e.key === "Enter") submitRename(row.original.id);
            if (e.key === "Escape") cancelRename();
          },
          onBlur: () => submitRename(row.original.id)
        });
      }

      return h(
        "div",
        {
          class: "truncate",
          title: row.original.name
        },
        row.original.name
      );
    },
    size: 100,
    minSize: 80,
    maxSize: 200
  },
  {
    accessorKey: "address",
    header: () => t("AssetCard.Address"),
    cell: ({ row }) =>
      h(
        "div",
        {
          class: "truncate",
          title: row.original.address
        },
        row.original.address
      ),
    size: 100,
    minSize: 80,
    maxSize: 250
  },
  {
    id: "user",
    header: () => t("AssetCard.User"),
    cell: ({ row }) => {
      const userText = displayUser(row.original.id, row.original.permedAccounts!);
      return h(
        "div",
        {
          class: "truncate",
          title: userText
        },
        userText
      );
    },
    size: 120,
    minSize: 80,
    maxSize: 180
  },
  {
    id: "protocol",
    header: () => t("AssetCard.Protocol"),
    cell: ({ row }) => {
      const protocolText = displayProtocol(row.original.id, row.original.permedProtocols!);
      return h(
        "div",
        {
          class: "truncate",
          title: protocolText
        },
        protocolText
      );
    },
    size: 100,
    minSize: 70,
    maxSize: 150
  },
  {
    id: "actions",
    header: () => t("AssetCard.Actions"),
    cell: ({ row }) =>
      h(
        "div",
        {
          class: "inline-flex gap-0 rounded-md shadow-sm"
        },
        [
          h(UButton, {
            size: "xs",
            color: "primary",
            variant: "outline",
            label: t("Common.Connect"),
            class: "rounded-none ring-0 border-1",
            onClick: () => emits("connectAsset", row.original)
          }),
          h(UButton, {
            icon: "i-lucide-ellipsis",
            size: "xs",
            color: "primary",
            variant: "outline",
            class: "rounded-none ring-0 border-1 border-l-0",
            "data-table-context-button": true,
            onClick: (event: MouseEvent) => showDropdown(row.original, event)
          })
        ]
      ),
    size: 180,
    minSize: 140,
    maxSize: 220
  }
];

function submitRename(id: string) {
  const name = (renameValue.value || "").trim();

  if (!renamingId.value) return;

  const oldName = props.items.find((a) => a.id === id)?.name || "";

  if (!name || name === oldName) {
    renamingId.value = null;
    return;
  }

  handleAssetRename(id, name);
  renamingId.value = null;
}

function cancelRename() {
  renamingId.value = null;
}
</script>

<template>
  <UCard
    variant="outline"
    class="w-full overflow-hidden"
    :ui="{
      body: 'p-1 sm:p-1'
    }"
  >
    <div class="overflow-x-auto">
      <UTable
        sticky
        :data="props.items"
        :columns="columns"
        class="w-full table-auto overflow-y-auto h-[calc(100vh-7rem)]"
        :ui="{
          tr: 'hover:bg-muted/50',
          th: 'whitespace-nowrap text-xs sm:text-sm',
          td: 'whitespace-nowrap text-xs sm:text-sm'
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
    @edit-trigger="emits('editTrigger', contextMenuAsset as AssetItem)"
    @connect-trigger="emits('connectTrigger', contextMenuAsset as AssetItem)"
    @rename-trigger="handleRenameTrigger"
  />
</template>
