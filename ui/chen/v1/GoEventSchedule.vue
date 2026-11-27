<script setup lang="ts">
import type { GoProgramDetail, GoProgramRef } from "./api";
import { computed, reactive } from "vue";
import { useI18n } from "vue-i18n";
import { qualifiedObjectName, quoteIdentifier } from "./workspace";

const props = defineProps<{
  target: GoProgramRef;
  dialect: string;
  detail?: GoProgramDetail;
  edit: boolean;
}>();
const emit = defineEmits<{ definition: [sql: string] }>();
const { t } = useI18n();
const properties = props.detail?.properties || {};
const field = (key: string) => (typeof properties[key] === "string" ? (properties[key] as string) : "");
const timestamp = (key: string) => (field(key) ? `'${field(key).replaceAll("'", "''")}'` : "");
const interval = field("interval_value");
const initial = {
  mode: field("event_type") === "RECURRING" ? "EVERY" : "AT",
  at: timestamp("execute_at") || "CURRENT_TIMESTAMP + INTERVAL 1 DAY",
  interval: /^\d+$/.test(interval) ? interval : interval ? `'${interval.replaceAll("'", "''")}'` : "1",
  unit: field("interval_field") || "DAY",
  starts: timestamp("starts"),
  ends: timestamp("ends"),
  preserve: field("on_completion") === "PRESERVE",
  status: "unchanged",
  user: "",
  host: "",
  comment: "",
  body: ""
};
const draft = reactive({ ...initial });
const units = [
  "YEAR",
  "QUARTER",
  "MONTH",
  "WEEK",
  "DAY",
  "HOUR",
  "MINUTE",
  "SECOND",
  "YEAR_MONTH",
  "DAY_HOUR",
  "DAY_MINUTE",
  "DAY_SECOND",
  "HOUR_MINUTE",
  "HOUR_SECOND",
  "MINUTE_SECOND"
];
function schedule(s: typeof draft) {
  if (s.mode === "AT") return s.at.trim() && `AT ${s.at.trim()}`;
  if (!s.interval.trim() || !units.includes(s.unit)) return "";
  return [
    "EVERY",
    s.interval.trim(),
    s.unit,
    s.starts.trim() && `STARTS ${s.starts.trim()}`,
    s.ends.trim() && `ENDS ${s.ends.trim()}`
  ]
    .filter(Boolean)
    .join(" ");
}
const sql = computed(() => {
  const when = schedule(draft);
  if (!props.target.name || !when || !!draft.user !== !!draft.host) return "";
  const q = (s: string) => quoteIdentifier(s, props.dialect);
  const definer = draft.user ? ` DEFINER = ${q(draft.user)}@${q(draft.host)}` : "";
  const clauses = [];
  if (!props.edit || schedule(initial) !== when) clauses.push(`ON SCHEDULE ${when}`);
  if (!props.edit || draft.preserve !== initial.preserve)
    clauses.push(`ON COMPLETION ${draft.preserve ? "PRESERVE" : "NOT PRESERVE"}`);
  if (draft.status !== "unchanged") clauses.push(draft.status);
  if (draft.comment.trim()) clauses.push(`COMMENT ${draft.comment.trim()}`);
  if (draft.body.trim()) clauses.push(`DO ${draft.body.trim()}`);
  if ((!props.edit && !draft.body.trim()) || (!clauses.length && !definer)) return "";
  return [
    `${(props.edit ? "ALTER" : "CREATE") + definer} EVENT ${qualifiedObjectName(props.target, props.dialect)}`,
    ...clauses
  ].join("\n");
});
</script>

<template>
  <details class="rounded border border-default p-3 text-sm">
    <summary class="cursor-pointer font-medium">{{ t("Chen.ProgramSchedule") }}</summary>
    <div class="mt-3 grid grid-cols-2 gap-3">
      <UFormField :label="t('Chen.ProgramSchedule')">
        <USelect v-model="draft.mode" :items="['AT', 'EVERY']" />
      </UFormField>
      <UFormField v-if="draft.mode === 'AT'" label="AT"><UInput v-model="draft.at" class="w-full" /></UFormField>
      <UFormField v-else label="EVERY">
        <div class="flex gap-2">
          <UInput v-model="draft.interval" class="min-w-0" />
          <USelect v-model="draft.unit" :items="units" />
        </div>
      </UFormField>
      <template v-if="draft.mode === 'EVERY'">
        <UFormField label="STARTS"><UInput v-model="draft.starts" class="w-full" /></UFormField>
        <UFormField label="ENDS"><UInput v-model="draft.ends" class="w-full" /></UFormField>
      </template>
      <UFormField :label="t('Chen.Status')">
        <USelect
          v-model="draft.status"
          :items="[
            { value: 'unchanged', label: field('status') || t('Chen.Default') },
            { value: 'ENABLE', label: 'ENABLE' },
            { value: 'DISABLE', label: 'DISABLE' }
          ]"
        />
      </UFormField>
      <UCheckbox v-model="draft.preserve" class="self-end" label="ON COMPLETION PRESERVE" />
      <p class="col-span-2 text-xs text-muted">
        {{ t("Chen.ProgramEventTimeZone", { zone: field("time_zone") || t("Chen.Console") }) }}
      </p>
      <UFormField :label="t('Chen.ProgramDefinerUser')"><UInput v-model="draft.user" class="w-full" /></UFormField>
      <UFormField :label="t('Chen.ProgramDefinerHost')"><UInput v-model="draft.host" class="w-full" /></UFormField>
      <UFormField class="col-span-2" :label="t('Chen.ProgramCommentSql')">
        <UInput
          v-model="draft.comment"
          class="w-full font-mono"
          :placeholder="edit ? t('Chen.ProgramKeepValue') : undefined"
        />
      </UFormField>
      <UFormField class="col-span-2" :label="t('Chen.ProgramEventBody')">
        <UTextarea
          v-model="draft.body"
          class="w-full font-mono"
          :rows="4"
          :placeholder="edit ? t('Chen.ProgramKeepValue') : undefined"
        />
      </UFormField>
      <UButton
        class="justify-self-start"
        size="xs"
        variant="soft"
        :disabled="!sql"
        :label="t('Chen.ProgramUseSchedule')"
        @click="emit('definition', sql)"
      />
    </div>
  </details>
</template>
