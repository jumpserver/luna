<script setup lang="ts">
import type {
  ChenGoApi,
  GoProgramArgument,
  GoProgramDefinition,
  GoProgramDraft,
  GoProgramDetail,
  GoProgramIntent,
  GoProgramPlan,
  GoProgramRequest,
  GoProgramRef,
  GoSession
} from "./api";
import type { QueryContext, QueryWorkspaceTab } from "./workspace";
import { chenErrorText } from "~/chen/utils/errorMessages";
import { ChenGoError } from "./api";
import GoEventSchedule from "./GoEventSchedule.vue";
import { quoteIdentifier, resultLoadingLocked } from "./workspace";

const props = defineProps<{
  session: GoSession;
  api: ChenGoApi;
  intent: GoProgramIntent;
  restored?: GoProgramDraft;
  queries: QueryWorkspaceTab[];
  createConsole: (context: QueryContext) => Promise<QueryWorkspaceTab | undefined>;
  applyPlan: (query: QueryWorkspaceTab, plan: GoProgramPlan, consoleId: string, draft?: GoProgramDraft) => boolean;
}>();
const emit = defineEmits<{ close: []; reopen: [draft: GoProgramDraft] }>();
const { t } = useI18n();
const { action, ref: target } = props.intent;
const name = ref(target.name);
const table = ref(target.table || "");
const resolvedOid = ref(props.intent.oid);
const reloadBaseline = ref(0);
const baselineChanged = ref(false);
const conflict = ref<GoProgramRef>();
const conflictLabel = computed(() => {
  const found = conflict.value;
  if (!found) return "";
  const quote = (id: string) => quoteIdentifier(id, props.session.dialect);
  const name = [found.schema, found.table, found.name]
    .filter((id): id is string => !!id)
    .map(quote)
    .join(".");
  if (props.session.dialect !== "postgresql" || !["function", "procedure"].includes(found.kind)) return name;
  const args = (found.input_types || []).map((type) => [quote(type.schema), quote(type.name)].join("."));
  return `${name}(${args.join(", ")})`;
});
const triggerFunction = ref("");
const triggerSchema = ref(target.schema);
const mysqlFamily = ["mysql", "mariadb", "oceanbase-mysql"].includes(props.session.dialect);
const state = ref(mysqlFamily ? "DISABLE" : "O");
const definition = ref(props.restored?.definition || "");
const detail = ref<GoProgramDetail>();
const original = ref<GoProgramDefinition>();
const args = ref<GoProgramArgument[]>([]);
const appendTrigger = ref(false);
const resultColumns = ref<NonNullable<GoProgramRequest["result_columns"]>>([]);
const anonymousRecord = computed(
  () =>
    props.session.dialect === "postgresql" &&
    target.kind === "function" &&
    detail.value?.properties.return_type === "record" &&
    !detail.value.parameters?.some((p) => ["OUT", "TABLE", "INOUT"].includes(p.mode))
);
const inputs = computed(() =>
  (detail.value?.parameters || []).filter((p) => ["IN", "INOUT", "VARIADIC"].includes(p.mode))
);
const currentRef = computed(() =>
  action === "create"
    ? {
        ...target,
        name: name.value,
        ...(target.kind === "trigger" ? { table: table.value } : {})
      }
    : target
);
const boundConsole = props.intent.consoleId || props.restored?.consoleId;
const candidates = computed(() =>
  props.queries
    .filter(
      (q) =>
        q.kind !== "preview" &&
        !q.pinnedSource &&
        q.console?.database === target.database &&
        q.console.state === "ready" &&
        (!boundConsole || q.console.id === boundConsole)
    )
    .map((q) => ({
      label: `${q.title} · ${q.console?.schema || target.database}`,
      value: q.id,
      disabled: resultLoadingLocked(q)
    }))
);
const selected = ref(
  props.queries.find((q) => q.console?.id === props.restored?.consoleId && props.restored)?.id ||
    candidates.value.find((c) => !c.disabled)?.value ||
    ""
);
const query = computed(() =>
  props.queries.find((q) => q.id === selected.value && candidates.value.some((item) => item.value === q.id))
);
const busy = ref(false);
const loading = ref(false);
const error = ref("");
const preview = ref<GoProgramPlan>();
const dirty = ref(!!props.restored);
const discard = ref(false);
const confirmCommit = ref(false);
const ready = computed(
  () => props.session.state === "ready" && query.value?.console?.state === "ready" && !resultLoadingLocked(query.value)
);
const endsAt = ref(false);
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
const request = computed<GoProgramRequest>(() => ({
  action,
  ref: currentRef.value,
  oid: resolvedOid.value,
  ...(props.intent.cursor ? { cursor: props.intent.cursor } : {}),
  ...(anonymousRecord.value && resultColumns.value.length ? { result_columns: resultColumns.value } : {}),
  ...(action === "create" || action === "edit" ? { definition: definition.value } : {}),
  ...(action === "edit" ? { baseline: original.value?.version } : {}),
  ...(action === "edit" && detail.value?.properties.trigger_order_requires_choice && appendTrigger.value
    ? { confirm_trigger_append: true }
    : {}),
  ...(action === "invoke"
    ? {
        arguments: args.value.map((a) => ({
          mode: a.mode,
          ...(a.mode === "value" ? { value: a.value ?? "" } : {}),
          ...(a.mode !== "default" && a.actual_type ? { actual_type: a.actual_type } : {})
        }))
      }
    : {}),
  ...(action === "setState" ? { state: state.value } : {}),
  ...(action === "rename" ? { new_name: name.value } : {})
}));
const states = computed(() =>
  mysqlFamily
    ? ["ENABLE", "DISABLE"]
    : ["O", "D", "R", "A"].map((value) => ({ value, label: t(`Chen.ProgramTriggerState.${value}`) }))
);
const template = computed(() => {
  if (action !== "create") return "";
  const quote = (identifier: string) => quoteIdentifier(identifier, props.session.dialect);
  const qualified = (schema: string, identifier: string) => `${quote(schema)}.${quote(identifier)}`;
  const object = qualified(target.schema, name.value);
  if (mysqlFamily) {
    switch (target.kind) {
      case "procedure":
        return `CREATE PROCEDURE ${object}()
BEGIN

END;`;
      case "function":
        return `CREATE FUNCTION ${object}() RETURNS INTEGER
DETERMINISTIC
RETURN NULL;`;
      case "trigger":
        return `CREATE TRIGGER ${object} BEFORE INSERT ON ${qualified(target.schema, table.value)}
FOR EACH ROW
BEGIN

END;`;
      case "event":
        return `CREATE EVENT ${object}
ON SCHEDULE AT CURRENT_TIMESTAMP + INTERVAL 1 DAY
DO
BEGIN

END;`;
    }
  }
  if (props.session.dialect !== "postgresql") return "";
  switch (target.kind) {
    case "function":
      return `CREATE FUNCTION ${object}() RETURNS void\nLANGUAGE plpgsql AS $$\nBEGIN\n\nEND;\n$$;`;
    case "procedure":
      return `CREATE PROCEDURE ${object}()\nLANGUAGE plpgsql AS $$\nBEGIN\n\nEND;\n$$;`;
    case "trigger":
      return `CREATE TRIGGER ${quote(name.value)} BEFORE INSERT ON ${qualified(target.schema, table.value)}\nFOR EACH ROW EXECUTE PROCEDURE ${qualified(triggerSchema.value, triggerFunction.value)}();`;
    default:
      return "";
  }
});
watch(
  template,
  (next, prior) => {
    if (!definition.value || definition.value === prior) definition.value = next;
  },
  { immediate: true, flush: "sync" }
);
const valid = computed(
  () =>
    ready.value &&
    !busy.value &&
    !loading.value &&
    !baselineChanged.value &&
    !!currentRef.value.name &&
    (action !== "rename" || (!!name.value && name.value !== target.name)) &&
    (action !== "invoke" || !!detail.value) &&
    (action !== "edit" || (original.value?.status === "complete" && !!original.value.version)) &&
    (!["create", "edit"].includes(action) || !!definition.value.trim())
);
let generation = 0;
watch(
  [request, () => query.value?.console?.id, () => query.value?.console?.transaction?.revision],
  () => {
    generation++;
    conflict.value = undefined;
    preview.value = undefined;
    confirmCommit.value = false;
  },
  { deep: true, flush: "sync" }
);
watch(
  [() => query.value?.console?.id, reloadBaseline],
  async ([consoleId, reload], _, cleanup) => {
    const cancel = new AbortController();
    cleanup(() => cancel.abort());
    detail.value = undefined;
    original.value = undefined;
    baselineChanged.value = false;
    appendTrigger.value = false;
    const identity = { ref: target, oid: reload ? undefined : props.intent.oid };
    resolvedOid.value = identity.oid;
    error.value = "";
    loading.value = false;
    if (!consoleId || !(["edit", "invoke"].includes(action) || (action === "setState" && mysqlFamily))) return;
    loading.value = true;
    try {
      if (
        action === "invoke" ||
        (mysqlFamily && target.kind === "event") ||
        (action === "edit" && props.session.dialect === "mariadb" && target.kind === "trigger")
      ) {
        const result = await props.api.consoleObjectDetail(consoleId, identity, cancel.signal);
        if (cancel.signal.aborted) return;
        if (
          action === "invoke" &&
          result.properties.defaults_from_definition &&
          result.actions.includes("definition")
        ) {
          try {
            const source = await props.api.consoleObjectDefinition(consoleId, identity, cancel.signal);
            if (cancel.signal.aborted) return;
            if (source.status === "complete" && source.default_positions) {
              for (const p of result.parameters || []) {
                if (source.default_positions.includes(p.position)) p.has_default = true;
              }
            }
          } catch {
            // Accounts may still call a procedure with explicit arguments when its source is restricted.
            if (cancel.signal.aborted) return;
          }
        }
        detail.value = result;
        if (action === "setState") state.value = result.properties.status === "ENABLED" ? "DISABLE" : "ENABLE";
        if (action === "invoke")
          args.value = inputs.value.map((p) => ({
            mode: p.has_default ? "default" : "value",
            value: "",
            ...(p.type_kind === "p" ? { actual_type: { schema: "pg_catalog", name: "" } } : {})
          }));
      }
      if (action === "edit") {
        const result = await props.api.consoleObjectDefinition(consoleId, identity, cancel.signal);
        if (cancel.signal.aborted) return;
        resolvedOid.value = result.oid;
        original.value = result;
        if (result.status === "complete" && !dirty.value) definition.value = result.text || "";
        else if (result.status !== "complete") error.value = t("Chen.ProgramDefinitionUnavailable");
      }
    } catch (cause) {
      if (!cancel.signal.aborted) {
        error.value = chenErrorText(cause, t);
        baselineChanged.value =
          action === "edit" &&
          cause instanceof ChenGoError &&
          ["catalog_not_found", "catalog_object_changed"].includes(cause.code) &&
          !props.restored?.currentStatus;
      }
    } finally {
      if (!cancel.signal.aborted) loading.value = false;
    }
  },
  { immediate: true }
);
async function addConsole() {
  if (boundConsole) return;
  busy.value = true;
  try {
    const q = await props.createConsole({ database: target.database, schema: target.schema });
    if (q?.console) selected.value = q.id;
    else error.value = q?.error || t("Chen.GoV1ConnectionLost");
  } finally {
    busy.value = false;
  }
}
async function prepare() {
  const consoleId = query.value?.console?.id;
  if (!valid.value || !consoleId) return;
  const current = ++generation;
  busy.value = true;
  error.value = "";
  try {
    const plan = await props.api.previewProgram(consoleId, request.value);
    if (current !== generation) return;
    preview.value = plan;
    clearTimeout(expiryTimer);
    endsAt.value = Date.parse(plan.expires_at) <= Date.now();
    expiryTimer = setTimeout(
      () => {
        endsAt.value = true;
      },
      Math.max(0, Date.parse(plan.expires_at) - Date.now())
    );
  } catch (cause) {
    if (current === generation) {
      error.value = chenErrorText(cause, t);
      if (cause instanceof ChenGoError && cause.code === "object_changed") {
        if (action === "edit") baselineChanged.value = true;
        const found = cause.conflictRef;
        const requested = currentRef.value;
        if (
          action === "create" &&
          found?.kind === requested.kind &&
          found.database === requested.database &&
          found.schema === requested.schema &&
          found.name === requested.name &&
          found.table === requested.table
        ) {
          conflict.value = found;
        }
      }
    }
  } finally {
    busy.value = false;
  }
}
function editConflict() {
  const found = conflict.value;
  const consoleId = query.value?.console?.id;
  if (!found || !consoleId) return;
  const pgRoutine = props.session.dialect === "postgresql" && ["function", "procedure"].includes(found.kind);
  // The native parser verifies the complete qualified target and input signature before replacement.
  const sql = pgRoutine
    ? definition.value.replace(/^(\s*)CREATE(?=\s+(?:FUNCTION|PROCEDURE)\b)/i, "$1CREATE OR REPLACE")
    : definition.value;
  emit("reopen", { intent: { action: "edit", ref: found, consoleId }, consoleId, definition: sql });
}
function apply() {
  if (
    !valid.value ||
    !preview.value ||
    !query.value?.console ||
    endsAt.value ||
    (preview.value.requires_implicit_commit && !confirmCommit.value)
  )
    return;
  const draft =
    action === "edit" || action === "create"
      ? {
          intent: { action, ref: currentRef.value, oid: resolvedOid.value },
          consoleId: query.value.console.id,
          definition: action === "create" || definition.value !== original.value?.text ? definition.value : "",
          // Store only operation names. Recovery of server-sourced SQL checks the current grant on the owning console.
          stepCommands: preview.value.steps.map(
            (step) =>
              step.sql
                .trimStart()
                .match(/^[a-z]+/i)?.[0]
                .toUpperCase() || ""
          ),
          requiresRecovery: !!preview.value.recovery || !!props.restored?.recoveryExecutionId,
          recoveryExecutionId: preview.value.recovery ? undefined : props.restored?.recoveryExecutionId
        }
      : undefined;
  if (props.applyPlan(query.value, preview.value, query.value.console.id, draft)) emit("close");
}
function recreateOriginal() {
  const saved = props.restored;
  if (!saved?.original?.text || saved.original.status !== "complete" || !query.value?.console) return;
  emit("reopen", {
    intent: { action: "create", ref: target },
    consoleId: query.value.console.id,
    recoveryExecutionId: saved.recoveryExecutionId,
    definition: saved.original.text
  });
}
function close() {
  if (dirty.value) discard.value = true;
  else emit("close");
}
onBeforeUnmount(() => {
  generation++;
  clearTimeout(expiryTimer);
});
defineExpose({ dirty });
</script>

<template>
  <UModal
    :open="true"
    :title="t('Chen.ProgramAction.' + action) + ' · ' + t('Chen.ProgramKind.' + target.kind)"
    :ui="{ content: 'max-w-3xl' }"
    @update:open="(open: boolean) => !open && close()"
  >
    <template #body>
      <div
        class="space-y-3 text-sm"
        @input="dirty = true"
        @paste.capture="(event) => !session.permissions.can_paste && event.preventDefault()"
        @copy.capture="(event) => !session.permissions.can_copy && event.preventDefault()"
        @cut.capture="(event) => !session.permissions.can_copy && event.preventDefault()"
      >
        <p class="break-all font-mono">
          {{ [target.database, target.schema, target.table, target.name].filter(Boolean).join(" / ") }}
        </p>
        <UFormField :label="t('Chen.Console')">
          <div class="flex gap-2">
            <USelect v-model="selected" class="min-w-0 flex-1" :items="candidates" :disabled="busy" />
            <UButton
              v-if="!boundConsole"
              icon="i-lucide-plus"
              variant="soft"
              :label="t('Chen.GoV1NewConnection')"
              :disabled="busy"
              @click="addConsole"
            />
          </div>
        </UFormField>
        <UFormField v-if="action === 'create' || action === 'rename'" :label="t('Chen.Name')">
          <UInput v-model="name" class="w-full" />
        </UFormField>
        <template v-if="action === 'create' && target.kind === 'trigger'">
          <UFormField :label="t('Chen.TableName')"><UInput v-model="table" :disabled="!!target.table" /></UFormField>
          <div v-if="!mysqlFamily" class="flex gap-2">
            <UFormField :label="t('Chen.GoV1Schema')"><UInput v-model="triggerSchema" /></UFormField>
            <UFormField :label="t('Chen.ProgramKind.function')"><UInput v-model="triggerFunction" /></UFormField>
          </div>
        </template>
        <p v-if="restored?.currentStatus === 'absent_or_hidden'" role="status" class="text-warning">
          {{ t("Chen.ProgramMissing") }}
        </p>
        <dl v-if="restored?.environment" class="grid grid-cols-[max-content_1fr] gap-x-3">
          <template v-for="(value, key) in restored.environment" :key="key">
            <dt>{{ key }}</dt>
            <dd>{{ value }}</dd>
          </template>
        </dl>
        <details v-if="restored?.original?.text && restored.original.text !== original?.text">
          <summary>{{ t("Chen.ProgramSavedOriginal") }}</summary>
          <pre class="max-h-40 overflow-auto">{{ restored.original.text }}</pre>
        </details>
        <details v-if="action === 'edit' && original?.status === 'complete'" :open="!!reloadBaseline || !!restored">
          <summary>{{ t("Chen.ProgramOriginal") }}</summary>
          <pre class="max-h-40 overflow-auto">{{ original.text }}</pre>
        </details>
        <div v-if="action === 'edit' && detail?.properties.trigger_order_requires_choice" class="space-y-1">
          <p class="text-warning">{{ t("Chen.ProgramTriggerOrder") }}</p>
          <UCheckbox
            v-model="appendTrigger"
            :label="t('Chen.ProgramTriggerAppend')"
            @update:model-value="dirty = true"
          />
        </div>
        <GoEventSchedule
          v-if="
            mysqlFamily &&
            target.kind === 'event' &&
            (action === 'create' || (action === 'edit' && detail && original?.status === 'complete'))
          "
          :key="query?.console?.id"
          :target="currentRef"
          :dialect="session.dialect"
          :detail="detail"
          :edit="action === 'edit'"
          @definition="
            (sql) => {
              definition = sql;
              dirty = true;
            }
          "
        />
        <UButton
          v-if="mysqlFamily && action === 'edit' && restored?.original?.status === 'complete' && restored.original.text"
          size="xs"
          variant="soft"
          :label="t('Chen.ProgramRestoreCreate')"
          @click="recreateOriginal"
        />
        <UFormField v-if="action === 'create' || action === 'edit'" :label="t('Chen.Definition')">
          <UTextarea
            v-if="
              action === 'create' || original?.status === 'complete' || restored?.currentStatus === 'absent_or_hidden'
            "
            v-model="definition"
            class="w-full font-mono"
            :rows="9"
            spellcheck="false"
            :disabled="loading || (action === 'edit' && original?.status !== 'complete')"
          />
        </UFormField>
        <p v-if="mysqlFamily && ['create', 'edit'].includes(action)" class="text-xs text-muted">
          {{ t("Chen.ProgramDelimiter") }}
        </p>
        <template v-if="action === 'invoke'">
          <UFormField
            v-for="(p, i) in inputs"
            :key="p.position"
            :label="(p.name || '$' + p.position) + ' · ' + p.mode + ' · ' + p.data_type"
          >
            <div v-if="args[i]" class="flex gap-2">
              <USelect
                v-model="args[i]!.mode"
                :items="[
                  { value: 'value', label: t('Chen.Value') },
                  { value: 'null', label: 'NULL' },
                  ...(p.has_default ? [{ value: 'default', label: 'DEFAULT' }] : [])
                ]"
                @update:model-value="dirty = true"
              />
              <UInput
                v-if="args[i]!.mode === 'value'"
                v-model="args[i]!.value"
                class="flex-1"
                :aria-label="p.name || '$' + p.position"
              />
            </div>
            <div v-if="args[i]?.actual_type && args[i]?.mode !== 'default'" class="mt-1 flex gap-2">
              <UInput v-model="args[i]!.actual_type!.schema" :aria-label="t('Chen.GoV1Schema')" />
              <UInput
                v-model="args[i]!.actual_type!.name"
                :placeholder="t('Chen.GoV1DataType')"
                :aria-label="t('Chen.GoV1DataType')"
              />
            </div>
          </UFormField>
        </template>
        <div v-if="anonymousRecord" class="space-y-2">
          <UButton
            variant="soft"
            size="xs"
            icon="i-lucide-plus"
            :label="t('Chen.ProgramRecordColumn')"
            :disabled="resultColumns.length >= 100"
            @click="
              resultColumns.push({ name: '', type: { schema: 'pg_catalog', name: '' } });
              dirty = true;
            "
          />
          <div v-for="(col, index) in resultColumns" :key="index" class="flex gap-2">
            <UInput v-model="col.name" :placeholder="t('Chen.ColumnName')" :aria-label="t('Chen.ColumnName')" />
            <UInput v-model="col.type.schema" :aria-label="t('Chen.Schema')" />
            <UInput v-model="col.type.name" :placeholder="t('Chen.Type')" :aria-label="t('Chen.Type')" />
            <UButton
              icon="i-lucide-x"
              variant="ghost"
              :aria-label="t('Chen.Delete')"
              @click="resultColumns.splice(index, 1)"
            />
          </div>
        </div>
        <UFormField v-if="action === 'setState'" :label="t('Chen.Status')">
          <USelect v-model="state" :items="states" @update:model-value="dirty = true" />
        </UFormField>
        <p v-if="loading">{{ t("Chen.GoV1Loading") }}</p>
        <p v-if="error" class="whitespace-pre-wrap text-error" role="alert">{{ error }}</p>
        <UButton
          v-if="baselineChanged"
          size="xs"
          variant="soft"
          :disabled="busy || loading"
          :label="t('Chen.ProgramReloadDraft')"
          @click="
            dirty = true;
            reloadBaseline++;
          "
        />
        <UButton
          v-if="conflict"
          size="xs"
          variant="soft"
          :disabled="busy || loading"
          :label="t('Chen.ProgramEditExisting', { object: conflictLabel })"
          @click="editConflict"
        />
        <section v-if="preview" class="space-y-2">
          <p>
            {{ t(preview.manual ? "Chen.Transaction.Manual" : "Chen.Transaction.Auto") }} · {{ preview.ref.database }}
          </p>
          <template v-if="action === 'invoke'">
            <p v-if="preview.execution_user">{{ t("Chen.ProgramExecutionUser", { user: preview.execution_user }) }}</p>
            <p class="text-xs text-muted">{{ t("Chen.ProgramInvokeScope") }}</p>
          </template>
          <UCheckbox
            v-if="preview.requires_implicit_commit"
            v-model="confirmCommit"
            :label="t('Chen.Transaction.ImplicitDescription')"
          />
          <p v-if="mysqlFamily && action === 'edit' && preview.steps.length > 1" class="text-warning">
            {{ t("Chen.ProgramRebuildImpact") }}
          </p>
          <ol class="list-decimal space-y-2 pl-5">
            <li v-for="(step, index) in preview.steps" :key="index">
              <pre class="overflow-auto whitespace-pre-wrap">{{ step.sql }}</pre>
            </li>
          </ol>
          <p v-if="endsAt" class="text-warning">{{ t("Chen.ProgramExpired") }}</p>
        </section>
      </div>
    </template>
    <template #footer>
      <template v-if="discard">
        <span>{{ t("Chen.DiscardUnsavedChanges") }}</span>
        <UButton variant="ghost" :label="t('Common.Cancel')" @click="discard = false" />
        <UButton color="error" :label="t('Chen.Discard')" @click="emit('close')" />
      </template>
      <template v-else>
        <UButton variant="ghost" :label="t('Common.Cancel')" @click="close" />
        <UButton variant="soft" :label="t('Chen.GoV1Preview')" :loading="busy" :disabled="!valid" @click="prepare" />
        <UButton
          :color="action === 'drop' ? 'error' : 'primary'"
          :label="t('Chen.Apply')"
          :disabled="!valid || !preview || endsAt || (preview.requires_implicit_commit && !confirmCommit)"
          @click="apply"
        />
      </template>
    </template>
  </UModal>
</template>
