<script setup lang="ts">
import type { ISearchOptions, SearchAddon } from "@xterm/addon-search";

const props = defineProps<{ searchAddon: SearchAddon }>();
const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();

const searchOptions = reactive<ISearchOptions>({
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  decorations: {
    matchBorder: "#ff8c00",
    matchOverviewRuler: "#ffff00",
    activeMatchBackground: "#ffa500",
    activeMatchBorder: "#ff8c00",
    activeMatchColorOverviewRuler: "#ffa500"
  }
});

const searchKey = ref("");
const gutterWidth = 16;
const drawerRef = shallowRef<HTMLElement | null>(null);
const { width } = useElementSize(drawerRef);

const keyWordsSearch = (value: string) => {
  if (value) void props.searchAddon.findNext(value, searchOptions);
};

const toggleSearchOption = (option: "caseSensitive" | "wholeWord" | "regex") => {
  searchOptions[option] = !searchOptions[option];
  if (searchKey.value) keyWordsSearch(searchKey.value);
};

const searchOptionButtons = [
  { key: "caseSensitive" as const, icon: "i-lucide-case-sensitive", label: t("koko.search.caseSensitive") },
  { key: "wholeWord" as const, icon: "i-lucide-case-lower", label: t("koko.search.wholeWords") },
  { key: "regex" as const, icon: "i-lucide-regex", label: t("koko.search.regex") }
];

const positionRight = computed(() => {
  const w = width.value;
  if (!drawerRef.value || w === 0) return `${gutterWidth}px`;
  const clamped = Math.min(800, Math.max(600, Math.round(w)));
  return `calc(${clamped}px + ${gutterWidth}px)`;
});

watch(searchKey, (value) => {
  if (!value) {
    props.searchAddon.clearDecorations();
    props.searchAddon.clearActiveDecoration();
  }
});

onMounted(() => {
  drawerRef.value = document.getElementById("drawer-inner-target");
});

useMutationObserver(
  () => document.body,
  () => {
    const el = document.getElementById("drawer-inner-target");
    if (el !== drawerRef.value) drawerRef.value = el;
  },
  { childList: true, subtree: true }
);
</script>

<template>
  <div
    class="absolute top-2 z-50 flex items-center gap-2 rounded-md border border-[var(--app-border-strong)] bg-[var(--app-surface-overlay)] p-2 text-[var(--app-fg)] shadow-md"
    :style="{ right: positionRight }"
  >
    <UInput
      v-model="searchKey"
      size="sm"
      class="min-w-48"
      :placeholder="t('koko.actions.search')"
      @update:model-value="keyWordsSearch"
    />

    <UButton
      color="neutral"
      variant="ghost"
      size="xs"
      icon="i-lucide-chevron-up"
      @click="void props.searchAddon.findPrevious(searchKey, searchOptions)"
    />
    <UButton
      color="neutral"
      variant="ghost"
      size="xs"
      icon="i-lucide-chevron-down"
      @click="void props.searchAddon.findNext(searchKey, searchOptions)"
    />

    <div class="mx-1 h-6 w-px bg-[var(--app-border-strong)]" />

    <UButton
      v-for="option in searchOptionButtons"
      :key="option.key"
      color="neutral"
      variant="ghost"
      size="xs"
      :icon="option.icon"
      :class="searchOptions[option.key] ? 'bg-[var(--app-hover-strong)]' : ''"
      :title="option.label"
      @click="toggleSearchOption(option.key)"
    />

    <UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-x" @click="void emit('close')" />
  </div>
</template>
