<script setup lang="ts">
import { useLocalCodex } from "~/composables/useLocalCodex";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { isDesktopRuntime } from "~/utils/runtime";
const messages = {
  en: {
    title: "Local Codex",
    enabled: "Use local Codex",
    hint: "Use your installed Codex for the workspace and terminal assistants. Other assistants keep using the server.",
    executable: "Codex executable",
    executableHint: "Enter a command on PATH or an absolute executable path, without arguments.",
    model: "Model",
    modelHint: "Leave empty to use the Codex default. Sign in with the Codex CLI first.",
    save: "Save",
    check: "Check installation",
    saved: "Saved. Existing AI conversations have been reset.",
    reset: "Saving changes stops active AI tasks and starts new conversations.",
    failed: "Local Codex configuration failed"
  },
  zh: {
    title: "本地 Codex",
    enabled: "使用本地 Codex",
    hint: "工作台助手和终端助手使用本机 Codex，其他助手继续使用服务器。",
    executable: "Codex 可执行文件",
    executableHint: "填写 PATH 中的命令或程序绝对路径，不包含命令参数。",
    model: "模型",
    modelHint: "留空使用 Codex 默认模型。请先在本机通过 Codex CLI 登录。",
    save: "保存",
    check: "检测安装",
    saved: "已保存，原有 AI 对话已重置。",
    reset: "保存更改会停止正在运行的 AI 任务，并开始新的对话。",
    failed: "本地 Codex 配置失败"
  }
};
const { t } = useI18n({
  useScope: "local",
  messages: {
    ...messages,
    zh_hant: messages.en,
    fr: messages.en,
    ja: messages.en,
    pt_br: messages.en,
    es: messages.en,
    ru: messages.en,
    ko: messages.en,
    vi: messages.en
  },
  fallbackLocale: "en"
});
const user = useUserInfoStore();
const codex = useLocalCodex();
const draft = reactive({ ...codex.settings.value });
watch(codex.settings, (value) => Object.assign(draft, value));
const busy = ref(false);
const notice = ref("");
const error = ref("");
async function run(check: boolean) {
  busy.value = true;
  notice.value = "";
  error.value = "";
  try {
    if (check) notice.value = (await codex.probe({ ...draft })).version;
    else {
      await codex.save({ ...draft });
      notice.value = t("saved");
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t("failed");
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <SettingsGroup v-if="isDesktopRuntime() && user.loggedIn" :title="t('title')" icon="i-lucide-bot">
    <SettingsRow :title="t('enabled')" :description="t('hint')">
      <USwitch v-model="draft.enabled" :disabled="busy" :aria-label="t('enabled')" />
    </SettingsRow>
    <SettingsRow :title="t('executable')" :description="t('executableHint')">
      <UInput v-model="draft.executable" :disabled="busy" :aria-label="t('executable')" class="w-64" />
    </SettingsRow>
    <SettingsRow :title="t('model')" :description="t('modelHint')">
      <UInput v-model="draft.model" :disabled="busy" :aria-label="t('model')" class="w-64" />
    </SettingsRow>
    <div class="space-y-2 p-4 text-xs text-muted">
      <p>{{ t("reset") }}</p>
      <p v-if="error" role="alert" class="text-error">{{ error }}</p>
      <p v-else-if="notice" role="status">{{ notice }}</p>
      <div class="flex gap-2">
        <UButton :label="t('save')" :loading="busy" @click="run(false)" />
        <UButton :label="t('check')" color="neutral" variant="outline" :disabled="busy" @click="run(true)" />
      </div>
    </div>
  </SettingsGroup>
</template>
