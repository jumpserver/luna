<script setup lang="ts">
const items = ref(['Backlog', 'Todo', 'In Progress', 'Done']);
const value = ref('Backlog');
</script>

<template>
  <UCard variant="outline" class="mt-4">
    <div class="flex flex-col gap-4">
      <section class="flex items-center gap-2 w-full">
        <div class="flex items-center justify-center rounded-md p-2">
          <UIcon name="i-lucide-square-terminal" class="text-4xl" />
        </div>

        <div class="flex flex-col">
          <span class="text-lg font-bold">SSH</span>

          <span class="text-sm text-gray-500">
            SSH 是 Secure Shell
            的缩写，是一种网络协议，用于在计算机之间安全地传输数据。
          </span>
        </div>
      </section>

      <section>
        <UFormField label="选择默认应用程序">
          <USelect v-model="value" :items="items" class="w-full" />
        </UFormField>
      </section>
    </div>
  </UCard>
</template>
