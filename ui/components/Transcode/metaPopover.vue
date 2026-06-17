<script setup lang="ts">
import type { ReplayMetadata } from "~/store/modules/transcode";

defineProps<{
  metadata: ReplayMetadata
}>();

const { t } = useI18n();

const formatMetaDate = (raw: string | undefined | null): string => {
  if (!raw) return "-";
  const str = raw.trim();
  if (!str) return "-";

  const m = str.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?\s*(Z|[+-]\d{2}:?\d{2})?$/
  );
  if (!m) return str;

  const [, Y, M, D, h, mi, s, _ms, tzRaw] = m;
  const ms = (_ms ?? "").slice(0, 3).padEnd(3, "0");
  const utcMs = Date.UTC(
    Number(Y),
    Number(M) - 1,
    Number(D),
    Number(h),
    Number(mi),
    Number(s),
    Number(ms)
  );

  let localMs = utcMs;
  if (tzRaw && tzRaw !== "Z") {
    const sign = tzRaw[0] === "-" ? -1 : 1;
    const digits = tzRaw.slice(1).replace(/:/g, "");
    const offH = Number(digits.slice(0, 2)) || 0;
    const offM = Number(digits.slice(2, 4)) || 0;
    localMs = utcMs - sign * (offH * 60 + offM) * 60_000;
  }

  const d = new Date(localMs);
  if (isNaN(d.getTime())) return str;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
</script>

<template>
  <UPopover :arrow="true">
    <UButton
      icon="i-lucide-info"
      color="neutral"
      variant="link"
      size="xs"
      class="p-0 text-gray-400 hover:text-primary"
    />

    <template #content>
      <dl class="grid min-w-[260px] grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 px-4 py-3 text-xs">
        <dt class="font-medium text-gray-500 dark:text-gray-400">
          {{ t("Transcode.MetaUser") }}
        </dt>
        <dd class="break-all text-gray-800 dark:text-gray-200">
          {{ metadata.user || "-" }}
        </dd>

        <dt class="font-medium text-gray-500 dark:text-gray-400">
          {{ t("Transcode.MetaAsset") }}
        </dt>
        <dd class="break-all text-gray-800 dark:text-gray-200">
          {{ metadata.asset || "-" }}
        </dd>

        <dt class="font-medium text-gray-500 dark:text-gray-400">
          {{ t("Transcode.MetaAccount") }}
        </dt>
        <dd class="break-all text-gray-800 dark:text-gray-200">
          {{ metadata.account || "-" }}
        </dd>

        <dt class="font-medium text-gray-500 dark:text-gray-400">
          {{ t("Transcode.MetaRemoteAddr") }}
        </dt>
        <dd class="break-all text-gray-800 dark:text-gray-200">
          {{ metadata.remote_addr || "-" }}
        </dd>

        <dt class="font-medium text-gray-500 dark:text-gray-400">
          {{ t("Transcode.MetaProtocol") }}
        </dt>
        <dd class="break-all text-gray-800 dark:text-gray-200">
          {{ (metadata.protocol || "-").toUpperCase() }}
        </dd>

        <dt class="font-medium text-gray-500 dark:text-gray-400">
          {{ t("Transcode.MetaDateStart") }}
        </dt>
        <dd class="break-all text-gray-800 dark:text-gray-200">
          {{ formatMetaDate(metadata.date_start) }}
        </dd>

        <dt class="font-medium text-gray-500 dark:text-gray-400">
          {{ t("Transcode.MetaDateEnd") }}
        </dt>
        <dd class="break-all text-gray-800 dark:text-gray-200">
          {{ formatMetaDate(metadata.date_end) }}
        </dd>
      </dl>
    </template>
  </UPopover>
</template>
