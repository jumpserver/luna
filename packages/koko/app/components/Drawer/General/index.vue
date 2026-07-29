<script setup lang="ts">
import mittBus from "#koko/utils/mittBus";

const { t } = useI18n();

const keyboardList = [
  { label: "Ctrl+C", value: "\x03", icon: "i-lucide-ban" },
  { label: t("koko.drawer.up"), value: "\x1B[A", icon: "i-lucide-arrow-up" },
  { label: t("koko.drawer.down"), value: "\x1B[B", icon: "i-lucide-arrow-down" },
  { label: t("koko.drawer.left"), value: "\x1B[D", icon: "i-lucide-arrow-left" },
  { label: t("koko.drawer.right"), value: "\x1B[C", icon: "i-lucide-arrow-right" }
];

function writeDataToTerminal(type: string) {
  mittBus.emit("write-command", { type });
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="text-sm font-medium">
      {{ t("koko.drawer.shortcutKeys") }}
    </div>
    <div class="grid grid-cols-2 gap-2">
      <button
        v-for="item in keyboardList"
        :key="item.label"
        type="button"
        class="rounded-lg border border-white/10 px-3 py-3 text-sm transition hover:border-white/20 hover:bg-white/5"
        @click="writeDataToTerminal(item.value)"
      >
        <div class="flex items-center justify-center gap-2">
          <UIcon :name="item.icon" class="size-4" />
          <span>{{ item.label }}</span>
        </div>
      </button>
    </div>
  </div>
</template>
