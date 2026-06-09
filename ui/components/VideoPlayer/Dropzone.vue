<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    compact?: boolean;
  }>(),
  {
    compact: false
  }
);

const emit = defineEmits<{
  "select-files": [File[]];
}>();

function handleDrop(event: DragEvent) {
  const files = Array.from(event.dataTransfer?.files || []);

  if (files.length > 0) {
    emit("select-files", files);
  }
}
</script>

<template>
  <label
    for="videoplayer-file-input"
    class="group relative flex h-full w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-3xl border border-dashed border-(--ui-border) bg-[radial-gradient(circle_at_top,_rgba(26,179,148,0.16),_transparent_46%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] text-center transition hover:border-(--ui-primary) hover:bg-[radial-gradient(circle_at_top,_rgba(26,179,148,0.22),_transparent_52%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))]"
    :class="props.compact ? 'min-h-0 px-5 py-6' : 'min-h-0 px-6 py-8 md:px-8 md:py-10'"
    @dragover.prevent
    @drop.prevent="handleDrop"
  >
    <div
      class="absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-(--ui-primary) to-transparent opacity-70"
    />
    <div
      class="mb-4 flex items-center justify-center rounded-2xl bg-black/20 text-(--ui-primary)"
      :class="props.compact ? 'h-14 w-14 text-3xl' : 'h-16 w-16 md:h-18 md:w-18 text-3xl md:text-4xl'"
    >
      <UIcon name="line-md:upload-loop" />
    </div>
    <h2
      class="font-semibold tracking-tight text-(--ui-text-highlighted)"
      :class="props.compact ? 'text-lg' : 'text-xl md:text-2xl'"
    >
      导入录像文件
    </h2>
    <p class="mt-3 max-w-xl text-(--ui-text-muted)" :class="props.compact ? 'text-xs leading-5' : 'text-sm leading-6'">
      支持拖入或选择 `.mp4 .gz .tar` 包。
    </p>
    <div :class="props.compact ? 'mt-5' : 'mt-6 md:mt-8'">
      <UButton color="neutral" variant="soft" :size="props.compact ? 'md' : 'lg'">选择文件</UButton>
    </div>
  </label>
</template>
