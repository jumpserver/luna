<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { ChenGoApi, GoConsole } from "./api";
import type { ChenSqlDialect } from "~/chen/utils/sqlDialect";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { chenErrorText } from "~/chen/utils/errorMessages";
import { quoteIdentifier } from "./workspace";

const props = defineProps<{ api: ChenGoApi; console: GoConsole; dialect: ChenSqlDialect; disabled: boolean }>();
const emit = defineEmits<{ select: [sql: string] }>();
const { t } = useI18n();
const open = ref(false);
const names = ref<string[]>([]);
const cursor = ref<string>();
const loading = ref(false);
const error = ref("");
let request: AbortController | undefined;
const switchCommand = {
  mysql: "USE",
  mariadb: "USE",
  "oceanbase-mysql": "USE",
  clickhouse: "USE",
  sqlserver: "USE",
  postgresql: "SET search_path TO",
  oracle: "ALTER SESSION SET CURRENT_SCHEMA =",
  "oceanbase-oracle": "ALTER SESSION SET CURRENT_SCHEMA =",
  db2: "SET CURRENT SCHEMA =",
  dameng: "SET SCHEMA"
} satisfies Record<ChenSqlDialect, string>;
const current = computed(() =>
  switchCommand[props.dialect] === "USE" ? props.console.database : props.console.schema
);
const label = (name: string) =>
  props.dialect === "postgresql" && props.console.database ? `${props.console.database}.${name}` : name;

function select(name: string) {
  if (props.disabled || name === current.value || !names.value.includes(name)) return;
  const identifier = quoteIdentifier(
    props.dialect === "clickhouse" ? name.replaceAll("\\", "\\\\") : name,
    props.dialect
  );
  emit("select", `${switchCommand[props.dialect]} ${identifier}`);
}

async function load() {
  if (props.disabled || !open.value || loading.value) return;
  const controller = new AbortController();
  request = controller;
  loading.value = true;
  error.value = "";
  try {
    const page = await props.api.consoleContexts(props.console.id, cursor.value, controller.signal);
    if (controller.signal.aborted) return;
    names.value = [...names.value, ...page.items];
    cursor.value = page.has_more ? page.next_cursor : undefined;
  } catch (cause) {
    if (!controller.signal.aborted) error.value = chenErrorText(cause, t);
  } finally {
    if (!controller.signal.aborted) loading.value = false;
  }
}

watch(open, (value) => {
  request?.abort();
  loading.value = false;
  names.value = [];
  cursor.value = undefined;
  error.value = "";
  if (value) void load();
});
watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) open.value = false;
  }
);
onBeforeUnmount(() => request?.abort());

const items = computed<DropdownMenuItem[]>(() => {
  const choices: DropdownMenuItem[] = [...new Set([current.value, ...names.value].filter(Boolean))].map((name) => ({
    label: label(name),
    type: "checkbox",
    checked: name === current.value,
    disabled: props.disabled || name === current.value,
    onSelect: () => select(name)
  }));
  if (loading.value) choices.push({ label: t("Chen.Loading"), disabled: true, loading: true });
  else if (error.value || cursor.value)
    choices.push({
      label: t(error.value ? "Chen.GoV1Retry" : "Chen.GoV1LoadMore"),
      description: error.value || undefined,
      onSelect: (event) => {
        event.preventDefault();
        void load();
      }
    });
  else if (!choices.length) choices.push({ label: t("Chen.NoDatabaseContext"), disabled: true });
  return choices;
});
</script>

<template>
  <UDropdownMenu
    v-model:open="open"
    :items="items"
    :content="{ align: 'end' }"
    :ui="{ content: 'w-max min-w-(--reka-dropdown-menu-trigger-width) max-w-80' }"
  >
    <UButton
      class="ml-auto max-w-64"
      icon="i-lucide-database"
      trailing-icon="i-lucide-chevron-down"
      size="sm"
      color="neutral"
      variant="soft"
      :disabled="disabled"
      :label="current ? label(current) : t('Chen.Context')"
      :title="
        props.console.transaction?.manual
          ? t('Chen.Errors.transaction_control_sql')
          : current
            ? label(current)
            : t('Chen.Context')
      "
      :ui="{ label: 'text-dimmed' }"
    />
  </UDropdownMenu>
</template>
