<script setup lang="ts">
import type { ChenGoApi, GoCatalogInspect, GoCatalogObject, GoSession } from "./api";
import type { GoColumnAction } from "./schemaSql";
import type { QueryContext } from "./workspace";
import type { ChenCreateTableColumn } from "~/chen/types";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { onBeforeRouteLeave } from "vue-router";
import { chenCreateTableTypes } from "~/chen/utils/createTableSql";
import { chenErrorText } from "~/chen/utils/errorMessages";
import {
  buildChenCreateIndexSql,
  buildChenDropIndexSql,
  chenIndexMethods,
  chenSupportsIndexDdl
} from "~/chen/utils/indexSql";
import { registerSiteLeaveGuard } from "~/composables/useSiteAccountSwitch";
import { newChenRequestId } from "./requestId";
import { canAlterColumnDefinition, columnChangeSql, createTableSql, droppableIndexes } from "./schemaSql";

const props = defineProps<{
  session: GoSession;
  api: ChenGoApi;
  context: QueryContext;
  object?: GoCatalogObject;
  mode: "create" | "alter" | "index";
  transferSql: (sql: string, execute: boolean) => boolean;
}>();
const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();
const tableName = ref("");
const columns = ref<ChenCreateTableColumn[]>([]);
const metadata = ref<GoCatalogInspect>();
const busy = ref(false);
const error = ref("");
const preview = ref(false);
const action = ref<GoColumnAction>("add");
const chosen = ref("");
const name = ref("");
const type = ref(chenCreateTableTypes(props.session.dialect)[0]!);
const size = ref("");
const nullable = ref(true);
const indexAction = ref("create");
const indexName = ref("");
const indexColumns = ref<string[]>([]);
const unique = ref(false);
const method = ref("");
const types = computed(() => chenCreateTableTypes(props.session.dialect));
const columnTypes = computed(() => [
  ...(!types.value.includes(type.value) ? [{ label: type.value, value: type.value, disabled: true }] : []),
  ...types.value.map((value) => ({ label: value, value }))
]);
const original = computed(() => metadata.value?.columns.find((column) => column.name === chosen.value));
const indexNames = computed(() => (metadata.value ? droppableIndexes(metadata.value) : []));
const title = computed(() =>
  t(props.mode === "create" ? "Chen.CreateTable" : props.mode === "alter" ? "Chen.GoWriteAlter" : "Chen.Indexes")
);
const actions = computed<{ label: string; value: GoColumnAction }[]>(() => [
  { label: t("Chen.AddColumn"), value: "add" },
  { label: t("Chen.GoWriteRenameColumn"), value: "rename" },
  { label: t("Chen.Delete"), value: "drop" },
  ...(canAlterColumnDefinition(props.session.dialect)
    ? [{ label: t("Chen.GoWriteColumnDefinition"), value: "alter" as const }]
    : [])
]);
const definition = computed(() => {
  try {
    if (props.mode !== "create" && (!metadata.value || metadata.value.truncated))
      return { sql: "", error: t("Chen.GoV1MetadataPartial") };
    if (props.mode === "create")
      return {
        sql: createTableSql(
          { database: props.context.database, schema: props.context.schema, name: tableName.value, kind: "table" },
          columns.value,
          props.session.dialect
        ),
        error: ""
      };
    if (props.mode === "alter")
      return {
        sql: columnChangeSql(props.object!, props.session.dialect, action.value, original.value, {
          name: name.value,
          type: type.value,
          size: size.value,
          nullable: nullable.value
        }),
        error: ""
      };
    if (indexAction.value === "drop" && !indexNames.value.includes(indexName.value))
      return { sql: "", error: t("Chen.GoWriteProtectedIndexesHint") };
    return {
      sql:
        indexAction.value === "drop"
          ? buildChenDropIndexSql(props.object!.schema, props.object!.name, indexName.value, props.session.dialect)
          : buildChenCreateIndexSql(
              {
                schema: props.object!.schema,
                table: props.object!.name,
                name: indexName.value,
                columns: indexColumns.value,
                unique: unique.value,
                method: method.value
              },
              props.session.dialect
            ),
      error: ""
    };
  } catch (cause) {
    return { sql: "", error: chenErrorText(cause, t) };
  }
});
function addColumn() {
  columns.value.push({
    id: newChenRequestId(),
    name: "",
    type: types.value[0]!,
    size: "",
    nullable: false,
    primaryKey: false
  });
}
// Compare editable values, including invalid input and row order, never generated SQL or row IDs.
function snapshot() {
  if (props.mode === "create")
    return JSON.stringify([
      tableName.value,
      columns.value.map(({ name, type, size, nullable, primaryKey }) => [name, type, size, nullable, primaryKey])
    ]);
  if (props.mode === "alter")
    return JSON.stringify(
      action.value === "rename"
        ? [name.value]
        : action.value === "drop"
          ? []
          : [name.value, type.value, size.value, nullable.value]
    );
  return JSON.stringify(
    indexAction.value === "drop" ? [indexName.value] : [indexName.value, indexColumns.value, unique.value, method.value]
  );
}
addColumn();
const baseline = ref(snapshot());
const dirty = computed(
  () => (props.mode === "alter" && action.value === "drop" && !!chosen.value) || snapshot() !== baseline.value
);
const confirming = ref(false);
const editorBody = ref<HTMLElement>();
const keepEditingButton = ref<{ $el: HTMLButtonElement }>();
let previousFocus: HTMLElement | null = null;
let discardResolver: ((value: boolean) => void) | undefined;
const controller = new AbortController();
let transferred = false;
function current() {
  return !controller.signal.aborted && !transferred;
}
function confirmDiscard(): Promise<boolean> {
  if (!current() || discardResolver) return Promise.resolve(false);
  if (!dirty.value) return Promise.resolve(true);
  previousFocus =
    typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null;
  confirming.value = true;
  return new Promise((resolve) => {
    discardResolver = resolve;
  });
}
function finishDiscard(value: boolean) {
  confirming.value = false;
  const resolve = discardResolver;
  discardResolver = undefined;
  resolve?.(value && current());
}
function focusKeepEditing(event: Event) {
  event.preventDefault();
  keepEditingButton.value?.$el.focus();
}
function restoreFocus(event: Event) {
  event.preventDefault();
  if (previousFocus?.isConnected) previousFocus.focus();
  else editorBody.value?.querySelector<HTMLElement>("input, button, [tabindex='0']")?.focus();
}
async function requestClose() {
  if ((await confirmDiscard()) && current()) emit("close");
}
function resetColumnInput() {
  if (action.value === "add") {
    name.value = "";
    type.value = types.value[0]!;
    size.value = "";
    nullable.value = true;
  } else if (original.value) {
    name.value = original.value.name;
    const match = /^([^()]+)(?:\(([^()]+)\))?$/.exec(original.value.data_type);
    const nativeType = match?.[1] || original.value.data_type;
    type.value = types.value.find((item) => item.toLowerCase() === nativeType.toLowerCase()) || nativeType;
    size.value = match?.[2] || "";
    nullable.value = original.value.nullable;
  }
  baseline.value = snapshot();
  preview.value = false;
}
async function changeAction(value: GoColumnAction) {
  if (value === action.value || (value !== "add" && !metadata.value) || !(await confirmDiscard())) return;
  action.value = value;
  resetColumnInput();
}
async function changeChosen(value: string) {
  if (value === chosen.value || !(await confirmDiscard())) return;
  chosen.value = value;
  resetColumnInput();
}
async function changeIndexAction(value: string) {
  if (value === indexAction.value || !(await confirmDiscard())) return;
  indexAction.value = value;
  indexName.value = "";
  indexColumns.value = [];
  unique.value = false;
  method.value = "";
  baseline.value = snapshot();
  preview.value = false;
}
// The parent keys each editor by its target. Invalidate immediately as well, before Vue unmounts it.
watch(
  () =>
    JSON.stringify([
      props.session.id,
      props.context.database,
      props.context.schema,
      props.object?.database,
      props.object?.schema,
      props.object?.name,
      props.object?.kind,
      props.mode
    ]),
  () => {
    controller.abort();
    finishDiscard(false);
  },
  { flush: "sync" }
);
onMounted(async () => {
  if (!props.object) return;
  busy.value = true;
  try {
    const result = await props.api.catalogInspect(
      props.session.id,
      props.object.schema,
      props.object.name,
      controller.signal
    );
    if (!current()) return;
    metadata.value = result;
    // Initial selection must not reset the add-column input typed while metadata was loading.
    chosen.value = result.columns[0]?.name || "";
  } catch (cause) {
    if (current()) error.value = chenErrorText(cause, t);
  } finally {
    if (current()) busy.value = false;
  }
});
const unregisterSiteLeaveGuard = registerSiteLeaveGuard(confirmDiscard);
onBeforeRouteLeave(confirmDiscard);
onBeforeUnmount(() => {
  controller.abort();
  finishDiscard(false);
  unregisterSiteLeaveGuard();
});
function transfer(sql: string, execute: boolean) {
  if (!current() || props.session.state !== "ready") return;
  if (props.transferSql(sql, execute)) transferred = true;
  else error.value = t("Chen.GoSchemaCloseTransferFailed");
}
async function nativeDefinition() {
  if (
    !props.object ||
    busy.value ||
    props.session.state !== "ready" ||
    !props.session.permissions.can_copy ||
    !props.session.permissions.can_paste
  )
    return;
  busy.value = true;
  try {
    const ddl = await props.api.catalogDdl(props.session.id, props.object.schema, props.object.name, controller.signal);
    if (!current()) return;
    if (!ddl.text) throw new Error(t("Chen.NotSupported"));
    // Check after the request too: the user may have edited while it was in flight.
    if (
      !(await confirmDiscard()) ||
      !current() ||
      !props.session.permissions.can_copy ||
      !props.session.permissions.can_paste
    )
      return;
    // Opening native CREATE text must never turn it into an accidental execution.
    transfer(
      `-- ${t("Chen.GoWriteNativeDdlHint")}\n${ddl.text
        .split("\n")
        .map((line) => `-- ${line}`)
        .join("\n")}\n\n`,
      false
    );
  } catch (cause) {
    if (current()) error.value = chenErrorText(cause, t);
  } finally {
    if (current()) busy.value = false;
  }
}
function execute() {
  if (!preview.value || !definition.value.sql || busy.value || confirming.value) return;
  transfer(definition.value.sql, true);
}
defineExpose({ dirty, confirmDiscard });
</script>

<template>
  <UModal
    :open="true"
    :dismissible="!confirming"
    :title="title"
    :description="[context.database, context.schema, object?.name].filter(Boolean).join(' / ')"
    :ui="{ content: 'sm:max-w-5xl' }"
    @update:open="
      (value) => {
        if (!value) requestClose();
      }
    "
  >
    <template #body>
      <div
        ref="editorBody"
        class="space-y-4"
        @copy.capture="
          (event) => {
            if (!session.permissions.can_copy) event.preventDefault();
          }
        "
        @paste.capture="
          (event) => {
            if (!session.permissions.can_paste) event.preventDefault();
          }
        "
      >
        <p v-if="error" role="alert" class="text-sm text-error">{{ error }}</p>
        <p v-if="busy" class="text-xs text-muted">{{ t("Chen.LoadingTableMetadata") }}</p>
        <template v-if="!preview">
          <template v-if="mode === 'create'">
            <UFormField :label="t('Chen.TableName')"><UInput v-model="tableName" class="w-full" /></UFormField>
            <div class="max-h-[50vh] overflow-auto">
              <table class="w-full text-left text-xs">
                <thead>
                  <tr>
                    <th>{{ t("Chen.Name") }}</th>
                    <th>{{ t("Chen.Type") }}</th>
                    <th>{{ t("Chen.LengthPrecision") }}</th>
                    <th>NULL</th>
                    <th>PK</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="column in columns" :key="column.id">
                    <td class="py-1 pr-2"><UInput v-model="column.name" size="xs" /></td>
                    <td class="pr-2"><USelect v-model="column.type" :items="types" size="xs" /></td>
                    <td class="pr-2"><UInput v-model="column.size" size="xs" /></td>
                    <td class="pr-2"><UCheckbox v-model="column.nullable" :disabled="column.primaryKey" /></td>
                    <td class="pr-2">
                      <UCheckbox
                        :model-value="column.primaryKey"
                        @update:model-value="
                          (value) => {
                            column.primaryKey = value === true;
                            if (column.primaryKey) column.nullable = false;
                          }
                        "
                      />
                    </td>
                    <td>
                      <UButton
                        icon="i-lucide-trash-2"
                        size="xs"
                        color="neutral"
                        variant="ghost"
                        :aria-label="t('Chen.Delete')"
                        @click="columns = columns.filter((item) => item.id !== column.id)"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <UButton
              icon="i-lucide-plus"
              size="xs"
              color="neutral"
              variant="soft"
              :label="t('Chen.AddColumn')"
              @click="addColumn"
            />
          </template>
          <template v-else-if="mode === 'alter'">
            <USelect
              :model-value="action"
              :items="actions"
              :disabled="!metadata"
              class="w-full"
              @update:model-value="changeAction"
            />
            <UFormField v-if="action !== 'add'" :label="t('Chen.Column')">
              <USelect
                :model-value="chosen"
                :items="metadata?.columns.map((column) => column.name) || []"
                class="w-full"
                @update:model-value="changeChosen"
              />
            </UFormField>
            <UFormField v-if="action === 'add' || action === 'rename'" :label="t('Chen.Name')">
              <UInput v-model="name" class="w-full" />
            </UFormField>
            <div v-if="action === 'add' || action === 'alter'" class="grid grid-cols-2 gap-3">
              <UFormField :label="t('Chen.Type')">
                <USelect v-model="type" :items="columnTypes" class="w-full" />
              </UFormField>
              <UFormField :label="t('Chen.LengthPrecision')"><UInput v-model="size" class="w-full" /></UFormField>
              <UCheckbox v-model="nullable" :label="t('Chen.Nullable')" />
            </div>
            <p v-if="action !== 'add' && original" class="text-xs text-muted">
              {{ t("Chen.GoWriteOriginalType") }}: {{ original.data_type }}
            </p>
            <p v-if="action === 'alter' && !types.includes(type)" class="text-xs text-warning">
              {{ t("Chen.GoWriteUnsupportedType") }}
            </p>
            <p v-if="!canAlterColumnDefinition(session.dialect)" class="text-xs text-muted">
              {{ t("Chen.GoWritePreserveDefinition") }}
            </p>
            <UButton
              icon="i-lucide-file-code-2"
              size="xs"
              variant="soft"
              color="neutral"
              :label="t('Chen.GoWriteNativeDdl')"
              :disabled="busy || !session.permissions.can_copy || !session.permissions.can_paste"
              @click="nativeDefinition"
            />
          </template>
          <template v-else>
            <p v-if="!chenSupportsIndexDdl(session.dialect)" class="text-xs text-warning">
              {{ t("Chen.IndexChangesNotSupported") }}
            </p>
            <USelect
              :model-value="indexAction"
              :items="[
                { label: t('Chen.CreateIndex'), value: 'create' },
                { label: t('Chen.DropIndex'), value: 'drop' }
              ]"
              class="w-full"
              @update:model-value="changeIndexAction"
            />
            <UFormField :label="t('Chen.IndexName')">
              <USelect v-if="indexAction === 'drop'" v-model="indexName" :items="indexNames" class="w-full" />
              <UInput v-else v-model="indexName" class="w-full" />
            </UFormField>
            <template v-if="indexAction === 'create'">
              <UFormField :label="t('Chen.Columns')">
                <USelectMenu
                  v-model="indexColumns"
                  multiple
                  :items="metadata?.columns.map((column) => column.name) || []"
                  class="w-full"
                />
              </UFormField>
              <UCheckbox v-model="unique" :label="t('Chen.UniqueIndex')" />
              <USelect
                v-if="chenIndexMethods(session.dialect).length"
                :model-value="method || 'default'"
                :items="[
                  { label: 'DEFAULT', value: 'default' },
                  ...chenIndexMethods(session.dialect).map((value) => ({ label: value, value }))
                ]"
                class="w-full"
                @update:model-value="(value) => (method = value === 'default' ? '' : value)"
              />
            </template>
            <p class="text-xs text-muted">{{ t("Chen.GoWriteProtectedIndexesHint") }}</p>
            <UButton
              size="xs"
              variant="soft"
              color="neutral"
              :label="t('Chen.GoWriteNativeDdl')"
              :disabled="busy || !session.permissions.can_copy || !session.permissions.can_paste"
              @click="nativeDefinition"
            />
          </template>
        </template>
        <div v-else class="space-y-3">
          <p class="text-sm">{{ t("Chen.GoWriteDdlConfirm") }}</p>
          <pre class="max-h-[55vh] overflow-auto rounded bg-elevated p-3 font-ui-mono text-xs">{{
            definition.sql
          }}</pre>
        </div>
        <p v-if="!definition.sql" class="text-xs text-muted">{{ definition.error }}</p>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" :label="t('Common.Cancel')" @click="requestClose" />
        <UButton
          v-if="preview"
          color="neutral"
          variant="soft"
          :label="t('Chen.GoWriteBack')"
          @click="preview = false"
        />
        <UButton
          :label="t(preview ? 'Chen.ApplyChanges' : 'Chen.PreviewAndSave')"
          :disabled="!definition.sql || busy || session.state !== 'ready'"
          @click="preview ? execute() : (preview = true)"
        />
      </div>
    </template>
  </UModal>
  <UModal
    :open="confirming"
    :title="t('Chen.DiscardUnsavedChanges')"
    :description="t('Chen.GoSchemaCloseHint')"
    :content="{
      onOpenAutoFocus: focusKeepEditing,
      onCloseAutoFocus: restoreFocus,
      onEscapeKeyDown: (event: KeyboardEvent) => event.stopPropagation()
    }"
    @update:open="
      (value) => {
        if (!value) finishDiscard(false);
      }
    "
  >
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          ref="keepEditingButton"
          color="neutral"
          variant="soft"
          :label="t('Chen.GoSchemaCloseKeepEditing')"
          @click="finishDiscard(false)"
        />
        <UButton color="error" :label="t('Chen.Discard')" @click="finishDiscard(true)" />
      </div>
    </template>
  </UModal>
</template>
