<script setup lang="ts">
interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
}

const { t } = useI18n();
const messages = ref<ChatMessage[]>([]);
const draft = ref("");
const sending = ref(false);
const listRef = ref<HTMLElement | null>(null);

const scrollToBottom = () => {
  nextTick(() => {
    const el = listRef.value;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  });
};

const sendMessage = async () => {
  const content = draft.value.trim();
  if (!content || sending.value) return;

  messages.value.push({
    id: `${Date.now()}-user`,
    role: "user",
    content
  });
  draft.value = "";
  scrollToBottom();

  sending.value = true;
  try {
  // ponytail: placeholder reply until AI backend is wired
    await new Promise((resolve) => setTimeout(resolve, 400));
    messages.value.push({
      id: `${Date.now()}-assistant`,
      role: "assistant",
      content: t("RightPanel.AIPlaceholderReply")
    });
    scrollToBottom();
  } finally {
    sending.value = false;
  }
};
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div ref="listRef" class="min-h-0 flex-1 overflow-y-auto px-3 py-3">
      <UEmpty
        v-if="messages.length === 0"
        icon="i-lucide-sparkles"
        size="sm"
        variant="naked"
        :title="t('RightPanel.AIEmptyTitle')"
        :description="t('RightPanel.AIEmptyDescription')"
      />

      <div v-else class="flex flex-col gap-3">
        <div
          v-for="message in messages"
          :key="message.id"
          class="flex"
          :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
        >
          <div
            class="max-w-[92%] rounded-2xl px-3 py-2 text-[12px] leading-5"
            :class="message.role === 'user'
              ? 'bg-primary/12 text-gray-800 dark:text-gray-100'
              : 'bg-black/5 text-gray-700 dark:bg-white/8 dark:text-gray-200'"
          >
            {{ message.content }}
          </div>
        </div>
      </div>
    </div>

    <form class="shrink-0 border-t border-gray-200 p-3 dark:border-white/10" @submit.prevent="sendMessage">
      <div class="relative">
        <UTextarea
          v-model="draft"
          :rows="2"
          autoresize
          :maxrows="5"
          :placeholder="t('RightPanel.AIInputPlaceholder')"
          class="w-full"
          :ui="{ base: 'text-[12px] pb-9 pr-10' }"
          @keydown.enter.exact.prevent="sendMessage"
        />
        <UButton
          type="submit"
          color="primary"
          variant="soft"
          size="xs"
          icon="i-lucide-send"
          class="absolute bottom-1.5 right-1.5"
          :loading="sending"
          :disabled="!draft.trim()"
          :aria-label="t('RightPanel.AISend')"
        />
      </div>
    </form>
  </div>
</template>
