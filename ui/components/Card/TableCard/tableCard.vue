<script setup lang="ts">
import type { AssetItem } from "~/types";
import type { TableColumn } from "@nuxt/ui";
import { h, resolveComponent } from "vue";

interface MenuItem {
  value?: string;
  label: string;
  icon: string;
  onClick: () => void;
  children?: MenuItem[];
}

const UButton = resolveComponent("UButton");
const UFieldGroup = resolveComponent("UFieldGroup");
const UDropdownMenu = resolveComponent("UDropdownMenu");

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
const {
  displayUser,
  displayProtocol,
  handleAssetRename,
  handleAssetConnection,
  handleAssetFavorite,
  handleAssetUnfavorite
} = useAssetAction();

const renameValue = ref("");
const contextMenuVisible = ref(false);
const contextMenuPosition = ref({ x: 0, y: 0 });
const renamingId = ref<string | null>(null);
const contextMenuAsset = ref<AssetItem | null>(null);
const renameInputEl = ref<HTMLInputElement | null>(null);
const actionMenuOpen = reactive<Record<string, boolean>>({});

/**
 * @description 下拉菜单选项
 * @param asset
 */
const buildMenuItems = (asset: AssetItem): MenuItem[] => {
  const protocols = (asset.permedProtocols || []).map((p: any) => p.name);
  const uniqueProtocols = Array.from(new Set(protocols));

  const items: MenuItem[] = [
    {
      value: "connect",
      label: t("ContextMenu.Connect"),
      icon: "i-lucide-plug",
      onClick: () => emits("connectTrigger", asset)
    },
    {
      label: t("ContextMenu.Edit"),
      icon: "solar:pen-new-square-linear",
      onClick: () => emits("editTrigger", asset)
    },
    {
      label: t("ContextMenu.Rename"),
      icon: "i-lucide-pencil",
      onClick: () => handleRenameTrigger(asset)
    },
    {
      label: asset.isFavorite ? t("ContextMenu.Unfavorite") : t("ContextMenu.Favorite"),
      icon: "i-lucide-star",
      onClick: () =>
        asset.isFavorite ? handleAssetUnfavorite(asset.id) : handleAssetFavorite(asset.id)
    }
  ];

  if (uniqueProtocols.length > 1) {
    const protocolItems: MenuItem[] = uniqueProtocols.map((name: string) => ({
      label: `${t("ContextMenu.Use")} ${name.toUpperCase()}`,
      icon: "i-lucide-plug",
      onClick: () =>
        handleAssetConnection(
          displayUser(asset.id, asset.permedAccounts!),
          asset.id,
          displayProtocol(asset.id, asset.permedProtocols!),
          asset.permedAccounts!,
          name
        )
    }));

    const moreConnect: MenuItem = {
      value: "moreConnect",
      label: t("ContextMenu.MoreConnect"),
      icon: "i-lucide-ellipsis",
      onClick: () => void 0,
      children: protocolItems
    };

    items.splice(1, 0, moreConnect);
  }

  return items;
};

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
  actionMenuOpen[asset.id] = false;

  // 等待 DOM 更新并在菜单关闭后的焦点还原阶段之后再聚焦
  nextTick(() => {
    renameInputEl.value?.focus();
  });
};

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
            "sm:text-sm font-medium truncate whitespace-nowrap  border-b border-primary focus:outline-none w-full",
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
      )
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
    }
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
    }
  },
  {
    id: "actions",
    header: () => t("AssetCard.Actions"),
    cell: ({ row }) => {
      const menuItems = buildMenuItems(row.original);

      return h(
        UFieldGroup,
        {
          size: "sm",
          class: "inline-flex rounded-md shadow-sm"
        },
        {
          default: () => [
            h(UButton, {
              color: "neutral",
              variant: "subtle",
              label: t("Common.Connect"),
              onClick: () => emits("connectAsset", row.original)
            }),
            h(
              UDropdownMenu,
              {
                items: menuItems,
                size: "sm",
                ui: { content: "w-48 p-1" },
                content: { onCloseAutoFocus: (e: Event) => e.preventDefault() },
                open: actionMenuOpen[row.original.id] || false,
                "onUpdate:open": (v: boolean) => (actionMenuOpen[row.original.id] = v)
              },
              {
                default: () =>
                  h(UButton, {
                    icon: "i-lucide-ellipsis",
                    color: "neutral",
                    variant: "outline",
                    "data-table-context-button": true
                  })
              }
            )
          ]
        }
      );
    },
    size: 200,
    minSize: 160,
    maxSize: 240
  }
];
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
  <AssetContextMenu
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
