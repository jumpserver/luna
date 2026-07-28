<script setup lang="ts">
const emit = defineEmits<{ upload: [files: File[]] }>();

const dragging = ref(false);
const uploadInput = ref<HTMLInputElement | null>(null);

function submit(files: FileList | null) {
  const items = files ? Array.from(files) : [];
  if (items.length) emit("upload", items);
}

function onDrop(event: DragEvent) {
  dragging.value = false;
  submit(event.dataTransfer?.files || null);
}

function onInput(event: Event) {
  const input = event.target as HTMLInputElement;
  submit(input.files);
  input.value = "";
}
</script>

<template>
  <div
    class="grid h-full min-h-0 place-items-center p-6"
    @dragenter.prevent="dragging = true"
    @dragover.prevent="dragging = true"
    @dragleave.prevent="dragging = false"
    @drop.prevent="onDrop"
  >
    <div
      class="flex w-full max-w-md flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center transition-colors"
      :class="dragging ? 'border-primary bg-primary/5' : 'border-default bg-elevated/30'"
    >
      <UIcon name="i-lucide-cloud-upload" class="size-9 text-muted" />
      <div>
        <p class="text-sm font-medium">拖动文件到这里</p>
        <p class="mt-1 text-xs text-muted">文件将批量上传到右侧当前 SFTP 目录</p>
      </div>
      <UButton size="sm" color="primary" variant="soft" icon="i-lucide-upload" @click="uploadInput?.click()">
        选择文件
      </UButton>
      <input ref="uploadInput" type="file" multiple class="hidden" @change="onInput" />
    </div>
  </div>
</template>
