<script setup lang="ts">
import type { ISearchOptions, SearchAddon } from "@xterm/addon-search";

const props = defineProps<{ searchAddon: SearchAddon }>();
const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();
const { darken, lighten } = useColor();

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
const drawerRef = ref<HTMLElement | null>(null);
const { width } = useElementSize(drawerRef);

const keyWordsSearch = (value: string) => {
  if (value) props.searchAddon.findNext(value, searchOptions);
};

const toggleSearchOption = (option: "caseSensitive" | "wholeWord" | "regex") => {
  searchOptions[option] = !searchOptions[option];
  if (searchKey.value) keyWordsSearch(searchKey.value);
};

const searchOptionButtons = [
  { key: "caseSensitive" as const, icon: "i-lucide-case-sensitive", label: t("CaseSensitive") || "Case sensitive" },
  { key: "wholeWord" as const, icon: "i-lucide-case-lower", label: t("MatchWholeWords") || "Whole words" },
  { key: "regex" as const, icon: "i-lucide-regex", label: t("UsingRegularExpressions") || "Regex" }
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
    class="absolute z-50 flex items-center gap-2 rounded-md p-2 shadow-md"
    :style="{ backgroundColor: lighten(10), top: '0.5rem', right: positionRight }"
  >
    <UInput
      v-model="searchKey"
      size="sm"
      class="min-w-48"
      :placeholder="t('Search') || 'Search'"
      @update:model-value="keyWordsSearch"
    />

    <UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-chevron-up" @click="props.searchAddon.findPrevious(searchKey, searchOptions)" />
    <UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-chevron-down" @click="props.searchAddon.findNext(searchKey, searchOptions)" />

    <div class="mx-1 h-6 w-px" :style="{ backgroundColor: darken(1) }" />

    <UButton
      v-for="option in searchOptionButtons"
      :key="option.key"
      color="neutral"
      variant="ghost"
      size="xs"
      :icon="option.icon"
      :class="searchOptions[option.key] ? 'bg-white/10' : ''"
      :title="option.label"
      @click="toggleSearchOption(option.key)"
    />

    <UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-x" @click="emit('close')" />
  </div>
</template>
