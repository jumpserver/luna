<script setup lang="ts">
import type {
  ChenGoApi,
  GoCatalogRelation,
  GoProgramSummary,
  GoProgramIntent,
  GoProgramDetail,
  GoProgramDefinition
} from "./api";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { writeClipboardText } from "~/utils/clipboard";
import { chenErrorText } from "~/chen/utils/errorMessages";

import { ChenGoError } from "./api";
import { objectKey } from "./catalogIdentity";
import { isProgramKind, programActions } from "./programActions";
import GoTriggerList from "./GoTriggerList.vue";

const props = defineProps<{
  api: ChenGoApi;
  sessionId: string;
  object: GoProgramSummary;
  ready: boolean;
  canCopy: boolean;
  revision: number;
  triggerCatalog: boolean;
}>();
const emit = defineEmits<{
  program: [object: GoProgramSummary];
  relation: [object: GoCatalogRelation];
  objectAction: [intent: GoProgramIntent];
}>();
const { t, te } = useI18n();
const toast = useToast();
const detail = ref<GoProgramDetail>();
const definition = ref<GoProgramDefinition>();
const detailError = ref("");
const definitionError = ref("");
const definitionOffsets = ref([0]);
const oversized = ref(false);
let pendingPage: AbortController | undefined;
const approvalRequired = ref(false);
const showTriggers = ref(false);
const refresh = ref(0);
const request = computed(() => ({ ref: props.object.ref, oid: props.object.oid }));
const visibleProperties = computed(() =>
  Object.fromEntries(
    Object.entries(detail.value?.properties || {}).filter(
      ([key]) => !["defaults_from_definition", "trigger_order_requires_choice"].includes(key)
    )
  )
);
const actions = computed(() =>
  programActions(
    detail.value || request.value,
    (detail.value?.actions || []).filter((action) => action !== "edit" || !oversized.value),
    props.ready,
    t,
    (intent) => emit("objectAction", intent)
  )
);
async function copyDefinition() {
  if (!props.canCopy || !definition.value?.text) return;
  try {
    await writeClipboardText(definition.value.text);
    toast.add({ title: t("Common.CopySuccess"), color: "success" });
  } catch {
    toast.add({ title: t("Common.CopyFailed"), color: "error" });
  }
}
function reportDefinitionError(cause: unknown) {
  const changed = cause instanceof ChenGoError && cause.status === 409;
  definitionError.value = changed ? t("Chen.ProgramDefinitionChanged") : chenErrorText(cause, t);
  approvalRequired.value =
    cause instanceof ChenGoError &&
    ["command_warning_confirmation_required", "command_review_required"].includes(cause.code);
}
async function turnDefinitionPage(next: boolean) {
  const source = definition.value;
  const history = definitionOffsets.value;
  const offset = next ? source?.next_offset : history.at(-2);
  if (!source?.version || offset === undefined || !props.ready || pendingPage) return;
  const cancel = new AbortController();
  pendingPage = cancel;
  definition.value = undefined;
  definitionError.value = "";
  try {
    const page = await props.api.catalogObjectDefinition(
      props.sessionId,
      { ref: source.ref, oid: source.oid },
      cancel.signal,
      { offset, version: source.version }
    );
    if (cancel.signal.aborted) return;
    if (page.version !== source.version || page.oid !== source.oid) {
      definitionError.value = t("Chen.ProgramDefinitionChanged");
      return;
    }
    definitionOffsets.value = next ? [...history, offset] : history.slice(0, -1);
    definition.value = page;
  } catch (cause) {
    if (!cancel.signal.aborted) reportDefinitionError(cause);
  } finally {
    if (pendingPage === cancel) pendingPage = undefined;
  }
}
function openRelated(related: NonNullable<GoProgramDetail["related"]>[number]) {
  const ref = related.ref;
  if (ref.kind === "table" || ref.kind === "view") emit("relation", ref);
  else if (isProgramKind(ref.kind)) {
    emit("program", {
      ref: { ...ref, kind: ref.kind },
      oid: related.oid,
      label: related.label,
      signature: related.signature
    });
  }
}
function propertyValue(value: GoProgramDetail["properties"][string]) {
  if (value === null) return "—";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return [value.schema, value.name].join(".");
  if (typeof value === "boolean") return t(value ? "Chen.GoV1Yes" : "Chen.GoV1No");
  return value;
}
function propertyLabel(key: string) {
  const label = `Chen.ProgramProperty.${key}`;
  return te(label) ? t(label) : key.replaceAll("_", " ");
}
watch(
  () => [props.sessionId, props.object, props.ready, props.revision, refresh.value],
  (_, __, onCleanup) => {
    const controller = new AbortController();
    const { signal } = controller;
    onCleanup(() => {
      controller.abort();
      pendingPage?.abort();
      pendingPage = undefined;
    });
    definitionOffsets.value = [0];
    oversized.value = false;
    detail.value = undefined;
    definition.value = undefined;
    detailError.value = "";
    definitionError.value = "";
    approvalRequired.value = false;
    if (!props.ready) return;
    void props.api.catalogObjectDetail(props.sessionId, request.value, signal).then(
      (value) => {
        if (!signal.aborted) detail.value = value;
      },
      (cause) => {
        if (!signal.aborted) detailError.value = chenErrorText(cause, t);
      }
    );
    void props.api.catalogObjectDefinition(props.sessionId, request.value, signal).then(
      (value) => {
        if (!signal.aborted) {
          oversized.value = value.status === "truncated";
          definition.value = value;
        }
      },
      (cause) => {
        if (!signal.aborted) reportDefinitionError(cause);
      }
    );
  },
  { immediate: true }
);
</script>

<template>
  <section
    class="flex min-h-0 flex-1 flex-col text-xs"
    :class="{ 'select-none': !canCopy }"
    @copy="
      (event) => {
        if (!canCopy) event.preventDefault();
      }
    "
  >
    <header class="flex min-h-(--workspace-sub-tab-height) shrink-0 items-center gap-1 border-b border-default px-3">
      <UIcon
        :name="object.ref.kind === 'trigger' ? 'i-lucide-zap' : 'i-lucide-braces'"
        class="size-4 shrink-0 text-muted"
      />
      <h2 class="min-w-0 flex-1 truncate font-medium" :title="object.signature || object.label">
        {{ object.signature || object.label }}
      </h2>
      <UButton
        v-for="action in actions"
        :key="action.label"
        :label="action.label"
        :icon="action.icon"
        size="xs"
        color="neutral"
        variant="ghost"
        :disabled="action.disabled"
        @click="action.onSelect"
      />
      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        icon="i-lucide-refresh-cw"
        :aria-label="t('Chen.GoV1Refresh')"
        :disabled="!ready"
        @click="refresh++"
      />
    </header>
    <div class="min-h-0 flex-1 space-y-4 overflow-auto px-4 py-3">
      <p class="text-muted">
        {{
          [object.ref.database, object.ref.schema, t(`Chen.ProgramKind.${object.ref.kind}`)].filter(Boolean).join(" · ")
        }}
      </p>
      <p v-if="!ready" role="status" class="text-warning">{{ t("Chen.GoV1CatalogStale") }}</p>
      <p v-else-if="detailError" role="alert" class="text-error">{{ detailError }}</p>
      <p v-else-if="!detail" role="status" class="text-muted">{{ t("Chen.GoV1Loading") }}</p>
      <template v-if="detail">
        <dl v-if="detail.properties" class="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-5 gap-y-1.5">
          <template v-for="(value, key) in visibleProperties" :key="key">
            <dt class="text-muted">{{ propertyLabel(String(key)) }}</dt>
            <dd class="whitespace-pre-wrap break-words">{{ propertyValue(value) }}</dd>
          </template>
        </dl>
        <table v-if="detail.parameters?.length" class="w-full border-collapse text-left">
          <caption class="mb-2 text-left font-medium">{{ t("Chen.ProgramParameters") }}</caption>
          <thead class="border-b border-default text-muted">
            <tr>
              <th
                v-for="key in ['Name', 'ProgramMode', 'GoV1DataType', 'Default']"
                :key="key"
                scope="col"
                class="px-2 py-1 font-medium"
              >
                {{ t("Chen." + key) }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="parameter in detail.parameters" :key="parameter.position" class="border-b border-default">
              <td class="px-2 py-1">{{ parameter.name || "#" + parameter.position }}</td>
              <td class="px-2 py-1">{{ parameter.mode }}</td>
              <td class="px-2 py-1">{{ parameter.data_type }}</td>
              <td class="px-2 py-1">
                {{
                  parameter.default ??
                  t(
                    parameter.has_default || definition?.default_positions?.includes(parameter.position)
                      ? "Chen.GoV1Yes"
                      : "Chen.GoV1No"
                  )
                }}
              </td>
            </tr>
          </tbody>
        </table>
        <nav v-if="detail.related?.length" class="flex flex-wrap gap-1" :aria-label="t('Chen.ProgramRelated')">
          <UButton
            v-for="item in detail.related"
            :key="
              objectKey(
                item.ref.kind === 'table' || item.ref.kind === 'view'
                  ? item.ref
                  : { ...item, ref: item.ref as GoProgramSummary['ref'] }
              )
            "
            size="xs"
            variant="link"
            :label="[item.ref.schema, item.signature || item.label].join(' · ')"
            @click="openRelated(item)"
          />
        </nav>
        <div v-if="object.ref.kind === 'function' && triggerCatalog && detail.oid">
          <UButton
            size="xs"
            variant="ghost"
            color="neutral"
            icon="i-lucide-zap"
            :aria-expanded="showTriggers"
            :label="t('Chen.ProgramRelatedTriggers')"
            @click="showTriggers = !showTriggers"
          />
          <GoTriggerList
            v-if="showTriggers"
            :api="api"
            :session-id="sessionId"
            :ready="ready"
            :database="object.ref.database"
            :revision="revision"
            :function-oid="detail.oid"
            @program="emit('program', $event)"
          />
        </div>
      </template>
      <section>
        <div class="mb-2 flex items-center gap-2">
          <h3 class="font-medium">{{ t("Chen.Definition") }}</h3>
          <UButton
            v-if="definition?.text && canCopy"
            size="xs"
            variant="ghost"
            color="neutral"
            icon="i-lucide-copy"
            :aria-label="t('Common.Copy')"
            @click="copyDefinition"
          />
        </div>
        <div v-if="definitionError" role="alert">
          <p>{{ definitionError }}</p>
          <UButton
            v-if="approvalRequired && detail"
            variant="soft"
            :label="t('Chen.ProgramAction.readDefinition')"
            @click="emit('objectAction', { ref: detail.ref, oid: detail.oid, action: 'readDefinition' })"
          />
        </div>
        <p v-else-if="!definition && ready" role="status" class="text-muted">{{ t("Chen.GoV1Loading") }}</p>
        <template v-else-if="definition">
          <p v-if="definition.status === 'restricted' || definition.status === 'unsupported'" class="text-muted">
            {{ t("Chen.ProgramDefinitionUnavailable") }}
          </p>
          <template v-else>
            <template v-if="definition.status === 'truncated'">
              <template v-if="definition.next_offset !== undefined || definitionOffsets.length > 1">
                <p class="text-warning">{{ t("Chen.ProgramPagedDefinition") }}</p>
                <div class="my-1 flex items-center gap-2">
                  <UButton
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    icon="i-lucide-chevron-left"
                    :aria-label="t('Chen.GoV1Previous')"
                    :disabled="definitionOffsets.length < 2"
                    @click="turnDefinitionPage(false)"
                  />
                  <span>{{ t("Chen.ProgramDefinitionPage", { page: definitionOffsets.length }) }}</span>
                  <UButton
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    icon="i-lucide-chevron-right"
                    :aria-label="t('Chen.GoV1Next')"
                    :disabled="definition.next_offset === undefined"
                    @click="turnDefinitionPage(true)"
                  />
                </div>
              </template>
              <p v-else class="text-warning">{{ t("Chen.GoOverviewDDLTruncated") }}</p>
            </template>
            <details v-if="definition.environment && Object.keys(definition.environment).length" class="mb-2">
              <summary class="cursor-pointer">{{ t("Chen.ProgramEnvironment") }}</summary>
              <dl class="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1 py-2">
                <template v-for="(value, key) in definition.environment" :key="key">
                  <dt class="text-muted">{{ key }}</dt>
                  <dd class="break-words">{{ value }}</dd>
                </template>
              </dl>
            </details>
            <p v-if="definition.source" class="text-muted">{{ definition.source }}</p>
            <pre class="mt-1 whitespace-pre-wrap break-words rounded border border-default p-3">{{
              definition.text
            }}</pre>
          </template>
        </template>
      </section>
    </div>
  </section>
</template>
