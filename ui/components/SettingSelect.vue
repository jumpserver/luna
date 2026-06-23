<script setup lang="ts" generic="T extends string | number | boolean">
interface SettingSelectItem {
  id: T
  label: string
}

const props = defineProps<{
  modelValue: T
  items: SettingSelectItem[]
  ariaLabel?: string
}>();

const emit = defineEmits<{
  (event: "update:modelValue", value: T): void
}>();

const selectedIndex = computed(() => {
  const index = props.items.findIndex((item) => item.id === props.modelValue);
  return index < 0 ? "" : String(index);
});

const handleChange = (event: Event) => {
  const index = Number((event.target as HTMLSelectElement).value);
  const item = props.items[index];
  if (item) emit("update:modelValue", item.id);
};
</script>

<template>
  <div class="relative inline-flex min-w-0 items-center">
    <select
      :value="selectedIndex"
      :aria-label="ariaLabel"
      class="h-7 w-full appearance-none rounded-md border border-black/10 bg-white/75 py-0 pr-7 pl-2 text-xs text-gray-800 shadow-sm outline-none transition hover:bg-white focus:border-primary/50 focus:ring-2 focus:ring-primary/15 dark:border-white/10 dark:bg-white/10 dark:text-gray-100 dark:hover:bg-white/15"
      @change="handleChange"
    >
      <option v-for="(item, index) in items" :key="String(item.id)" :value="index">
        {{ item.label }}
      </option>
    </select>
    <UIcon
      name="i-lucide-chevrons-up-down"
      class="pointer-events-none absolute right-2 size-3 text-gray-400 dark:text-gray-500"
    />
  </div>
</template>
