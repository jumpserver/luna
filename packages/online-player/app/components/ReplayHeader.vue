<script setup lang="ts">
import type { Replay } from "#online-player/types";
import { formatLocalDateTime } from "#online-player/utils/time";

const props = defineProps<{
  replay: Replay;
}>();

const { t } = useI18n();

const chips = computed(() => {
  const items: { key: string; label: string; value: string; mono?: boolean }[] = [];
  if (props.replay.user) items.push({ key: "user", label: t("Replay.User"), value: props.replay.user });
  if (props.replay.asset) items.push({ key: "asset", label: t("Replay.Asset"), value: props.replay.asset });
  if (props.replay.account) items.push({ key: "account", label: t("Replay.Account"), value: props.replay.account });
  if (props.replay.date_start) {
    items.push({
      key: "start",
      label: t("Replay.StartTime"),
      value: formatLocalDateTime(props.replay.date_start),
      mono: true
    });
  }
  return items;
});
</script>

<template>
  <div class="replay-infobar">
    <div v-for="chip in chips" :key="chip.key" class="replay-info-section">
      <span class="replay-info-label">{{ chip.label }}</span>
      <span class="replay-info-value" :class="chip.mono ? 'font-mono tabular' : ''">{{ chip.value }}</span>
    </div>
  </div>
</template>
