<script setup lang="ts">
import type {
  FaceDeviceMode,
  FaceEngineConfig,
  FaceEngineStatus,
  FaceFlowAction,
  FaceFlowMode,
  FaceLivenessMode,
  FacePerson
} from "~/types/face";
import { desktopDialog, desktopFace, desktopOpener } from "~/shared/desktop/bridge";

definePageMeta({ layout: "default" });

const { t } = useI18n();
const toast = useToast();
const { addErrorToast } = useErrorToast();
const capture = useFaceCapture();
const cameraVideo = capture.video;
const cameraOverlay = capture.overlay;
const mode = ref<FaceFlowMode>("enroll");
const settingsOpen = ref(false);
const engineBusy = ref(false);
const engineReady = ref(false);
const engineStatus = ref<FaceEngineStatus | null>(null);
const people = ref<FacePerson[]>([]);
const eventLog = ref<Array<{ at: string; text: string; kind: string }>>([]);
const deleteTarget = ref<FacePerson | null>(null);
const deleting = ref(false);
const unlisteners: Array<() => void> = [];

const noAction = (): FaceFlowAction => ({ type: "none", url: "", method: "" });

const enrollForm = reactive({
  name: "",
  timeoutSeconds: 20,
  requiredSamples: 3
});

const authForm = reactive({
  targetId: "",
  timeoutSeconds: 15,
  threshold: 0.42,
  successAction: noAction(),
  failedAction: noAction()
});

const monitorForm = reactive({
  targetId: "",
  initTimeoutSeconds: 15,
  awayAfterSeconds: 5,
  threshold: 0.42,
  initFailedAction: noAction(),
  awayAction: noAction(),
  returnedAction: noAction()
});

const engineConfig = reactive<FaceEngineConfig>({
  device: "auto",
  model_name: "buffalo_l",
  model_root: null,
  recognition: {
    threshold: 0.42,
    det_size: [640, 640],
    max_faces: 8
  },
  liveness: {
    mode: "motion",
    threshold: 0.72,
    onnx_model_path: null,
    min_motion_score: 0.05,
    min_face_size: 80
  },
  debug: {
    enabled: false,
    draw_bbox: true,
    draw_landmarks: true,
    draw_liveness: true
  }
});

const cameraPolicy = reactive({
  mode: "any" as "any" | "allowlist",
  labelPattern: ""
});
const onnxModelPath = computed<string>({
  get: () => engineConfig.liveness.onnx_model_path || "",
  set: (value) => {
    engineConfig.liveness.onnx_model_path = value || null;
  }
});

function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
const tabs = computed(() => [
  { label: t("Face.Enrollment"), value: "enroll", icon: "i-lucide-scan-face" },
  { label: t("Face.Authentication"), value: "auth", icon: "i-lucide-shield-check" },
  { label: t("Face.Monitoring"), value: "monitor", icon: "i-lucide-eye" }
]);
const deviceModes = computed(() => [
  { label: t("Face.DeviceAuto"), value: "auto" as FaceDeviceMode },
  { label: "CPU", value: "cpu" as FaceDeviceMode },
  { label: "GPU", value: "gpu" as FaceDeviceMode }
]);
const livenessModes = computed(() => [
  { label: t("Face.LivenessMotion"), value: "motion" as FaceLivenessMode },
  { label: t("Face.LivenessOnnx"), value: "onnx" as FaceLivenessMode },
  { label: t("Face.LivenessHybrid"), value: "hybrid" as FaceLivenessMode },
  { label: t("Face.LivenessOff"), value: "off" as FaceLivenessMode }
]);
const cameraPolicies = computed(() => [
  { label: t("Face.CameraAny"), value: "any" },
  { label: t("Face.CameraAllowlist"), value: "allowlist" }
]);
const cameraItems = computed(() =>
  capture.cameras.value.map((camera) => ({ label: camera.label, value: camera.deviceId }))
);
const personItems = computed(() =>
  people.value.map((person) => ({ label: `${person.name} (${person.samples})`, value: person.person_id }))
);
const currentFlow = computed(() => capture.latest.value?.flow || null);
const primaryFace = computed(() => capture.latest.value?.faces[0] || null);
const flowColor = computed<"neutral" | "primary" | "success" | "warning" | "error">(() => {
  const status = currentFlow.value?.status || "";
  if (["auth_success", "monitor_started", "monitoring", "enrollment_complete"].includes(status)) return "success";
  if (["auth_failed", "monitor_init_failed", "enrollment_failed", "monitor_away_timeout"].includes(status)) {
    return "error";
  }
  if (status === "monitor_away_warning") return "warning";
  return capture.running.value ? "primary" : "neutral";
});
const statusLabel = computed(() => {
  const key = currentFlow.value?.status;
  return key ? t(`Face.Status.${key}`) : t("Face.Status.idle");
});
const engineStatusLabel = computed(() => {
  if (engineBusy.value) return t("Face.EngineStarting");
  if (!engineStatus.value?.available) return t("Face.EngineUnavailable");
  if (engineReady.value) return t("Face.EngineReady");
  return t("Face.EngineStopped");
});

const appendEvent = (text: string, kind = "info") => {
  eventLog.value.unshift({ at: new Date().toLocaleTimeString(), text, kind });
  if (eventLog.value.length > 100) eventLog.value.length = 100;
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const refreshEngineStatus = async () => {
  if (!isDesktopRuntime()) return;
  try {
    engineStatus.value = await desktopFace.status();
    engineReady.value = Boolean(engineStatus.value.engine_initialized);
    if (engineReady.value) people.value = await desktopFace.listPeople();
  } catch (error) {
    engineStatus.value = { available: false, running: false, error: errorMessage(error) };
  }
};

const configureEngine = async () => {
  engineBusy.value = true;
  try {
    const result = await desktopFace.configure(plain(engineConfig));
    engineStatus.value = result;
    engineReady.value = true;
    people.value = result.people || [];
    authForm.threshold = engineConfig.recognition.threshold;
    monitorForm.threshold = engineConfig.recognition.threshold;
    settingsOpen.value = false;
    appendEvent(t("Face.EngineReady"), "success");
  } catch (error) {
    addErrorToast({
      title: t("Face.EngineStartFailed"),
      description: errorMessage(error),
      icon: "i-lucide-circle-x",
      duration: 6000
    });
    throw error;
  } finally {
    engineBusy.value = false;
  }
};

const ensureEngine = async () => {
  if (!engineReady.value) await configureEngine();
};

const refreshCameras = async () => {
  try {
    await capture.refreshCameras(true);
  } catch (error) {
    addErrorToast({
      title: t("Face.CameraFailed"),
      description: errorMessage(error),
      icon: "i-lucide-video-off",
      duration: 5000
    });
  }
};

const policyPayload = () => ({
  mode: cameraPolicy.mode,
  allowedDeviceIds: cameraPolicy.mode === "allowlist" ? [capture.selectedDeviceId.value] : [],
  allowedLabels: [],
  labelPattern: cameraPolicy.labelPattern.trim()
});

const targetPerson = (personId: string) => people.value.find((person) => person.person_id === personId);

const startCurrentFlow = async () => {
  try {
    await ensureEngine();
    if (!capture.cameras.value.length) await refreshCameras();
    if (!capture.selectedDeviceId.value) throw new Error(t("Face.CameraRequired"));

    if (mode.value === "enroll") {
      if (!enrollForm.name.trim()) throw new Error(t("Face.NameRequired"));
      await capture.start({
        mode: "enroll",
        name: enrollForm.name.trim(),
        timeoutSeconds: enrollForm.timeoutSeconds,
        requiredSamples: enrollForm.requiredSamples,
        cameraPolicy: policyPayload(),
        debug: engineConfig.debug.enabled,
        actions: {}
      });
    } else if (mode.value === "auth") {
      const person = targetPerson(authForm.targetId);
      if (!person) throw new Error(t("Face.PersonRequired"));
      await capture.start({
        mode: "auth",
        targetId: person.person_id,
        targetName: person.name,
        timeoutSeconds: authForm.timeoutSeconds,
        threshold: authForm.threshold,
        cameraPolicy: policyPayload(),
        debug: engineConfig.debug.enabled,
        actions: plain({
          auth_success: authForm.successAction,
          auth_failed: authForm.failedAction
        })
      });
    } else {
      const person = targetPerson(monitorForm.targetId);
      if (!person) throw new Error(t("Face.PersonRequired"));
      await capture.start({
        mode: "monitor",
        targetId: person.person_id,
        targetName: person.name,
        timeoutSeconds: monitorForm.initTimeoutSeconds,
        awayAfterSeconds: monitorForm.awayAfterSeconds,
        threshold: monitorForm.threshold,
        cameraPolicy: policyPayload(),
        debug: engineConfig.debug.enabled,
        actions: plain({
          monitor_init_failed: monitorForm.initFailedAction,
          monitor_away_timeout: monitorForm.awayAction,
          monitor_returned: monitorForm.returnedAction
        })
      });
    }
    appendEvent(t("Face.FlowStarted", { mode: tabs.value.find((item) => item.value === mode.value)?.label }));
  } catch (error) {
    addErrorToast({
      title: t("Face.FlowStartFailed"),
      description: errorMessage(error),
      icon: "i-lucide-circle-x",
      duration: 5000
    });
  }
};

const pickOnnxModel = async () => {
  const selected = await desktopDialog.open({
    multiple: false,
    filters: [{ name: "ONNX", extensions: ["onnx"] }]
  });
  if (typeof selected === "string") engineConfig.liveness.onnx_model_path = selected;
};

const confirmDeletePerson = async () => {
  if (!deleteTarget.value) return;
  deleting.value = true;
  try {
    const result = await desktopFace.removePerson(deleteTarget.value.person_id);
    people.value = result.people;
    if (authForm.targetId === deleteTarget.value.person_id) authForm.targetId = "";
    if (monitorForm.targetId === deleteTarget.value.person_id) monitorForm.targetId = "";
    appendEvent(t("Face.PersonDeleted", { name: deleteTarget.value.name }), "warning");
    deleteTarget.value = null;
  } catch (error) {
    addErrorToast({ title: t("Face.DeleteFailed"), description: errorMessage(error), icon: "i-lucide-circle-x" });
  } finally {
    deleting.value = false;
  }
};

onMounted(async () => {
  if (!isDesktopRuntime()) return;
  await Promise.all([refreshEngineStatus(), capture.refreshCameras(false).catch(() => [])]);
  unlisteners.push(
    await desktopFace.onFlowEvent(({ payload }) => {
      appendEvent(t(`Face.Event.${payload.event}`, { name: payload.target_name || "" }), payload.event);
      if (payload.event === "enrollment_complete") {
        void desktopFace.listPeople().then((items) => {
          people.value = items;
          enrollForm.name = "";
        });
      }
      if (payload.event === "monitor_away_warning") {
        toast.add({
          title: t("Face.Status.monitor_away_warning"),
          description: t("Face.Event.monitor_away_warning", { name: payload.target_name || "" }),
          color: "warning",
          icon: "i-lucide-triangle-alert",
          duration: 5000
        });
      }
    }),
    await desktopFace.onRedirect(({ payload }) => {
      if (payload.url.startsWith("/")) void navigateTo(payload.url);
      else void desktopOpener.openUrl(payload.url);
    }),
    await desktopFace.onMethod(({ payload }) => {
      appendEvent(t("Face.MethodExecuted", { method: payload.method }), "method");
    }),
    await desktopFace.onActionResult(({ payload }) => {
      const result = payload as { ok?: boolean; status?: number; error?: string };
      appendEvent(
        result.ok
          ? t("Face.ApiSucceeded", { status: result.status || 200 })
          : t("Face.ApiFailed", { error: result.error || result.status || "-" }),
        result.ok ? "success" : "error"
      );
    })
  );
});

onBeforeUnmount(() => {
  unlisteners.splice(0).forEach((unlisten) => unlisten());
});
</script>

<template>
  <div class="h-full min-h-0 overflow-auto p-3 sm:p-5">
    <div class="mx-auto flex w-full max-w-[1440px] flex-col gap-4">
      <header class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-xl font-semibold text-highlighted">{{ t("Face.Title") }}</h1>
          <p class="mt-1 text-sm text-muted">{{ t("Face.Description") }}</p>
        </div>
        <div class="flex items-center gap-2">
          <UBadge :color="engineReady ? 'success' : engineStatus?.available ? 'neutral' : 'error'" variant="soft">
            {{ engineStatusLabel }}
          </UBadge>
          <UButton
            v-if="engineStatus?.available && !engineReady"
            icon="i-lucide-power"
            size="sm"
            :loading="engineBusy"
            :label="t('Face.StartEngine')"
            @click="configureEngine"
          />
          <UButton
            icon="i-lucide-settings-2"
            color="neutral"
            variant="outline"
            size="sm"
            :label="t('Face.EngineSettings')"
            :disabled="capture.running.value"
            @click="settingsOpen = true"
          />
        </div>
      </header>

      <UAlert
        v-if="!isDesktopRuntime()"
        color="warning"
        variant="soft"
        icon="i-lucide-monitor-smartphone"
        :title="t('Face.DesktopRequired')"
      />
      <UAlert
        v-else-if="engineStatus && !engineStatus.available"
        color="error"
        variant="soft"
        icon="i-lucide-package-x"
        :title="t('Face.EngineUnavailable')"
        :description="engineStatus.error"
      >
        <template #actions>
          <code class="select-all rounded bg-black/10 px-2 py-1 text-xs dark:bg-white/10">
            {{ engineStatus.setupCommand }}
          </code>
        </template>
      </UAlert>

      <div class="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)]">
        <section class="overflow-hidden rounded-lg border border-default bg-default">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-default px-3 py-2.5">
            <div class="flex min-w-0 items-center gap-2">
              <USelect
                v-model="capture.selectedDeviceId.value"
                :items="cameraItems"
                value-key="value"
                label-key="label"
                :placeholder="t('Face.SelectCamera')"
                class="w-64 max-w-full"
                :disabled="capture.running.value || capture.starting.value"
              />
              <UButton
                icon="i-lucide-refresh-cw"
                color="neutral"
                variant="ghost"
                :title="t('Face.RefreshCamera')"
                :aria-label="t('Face.RefreshCamera')"
                :disabled="capture.running.value"
                @click="refreshCameras"
              />
            </div>
            <UBadge :color="flowColor" variant="soft">{{ statusLabel }}</UBadge>
          </div>

          <div class="relative aspect-[4/3] w-full overflow-hidden bg-black">
            <video ref="cameraVideo" muted playsinline class="absolute inset-0 size-full object-contain" />
            <canvas ref="cameraOverlay" class="pointer-events-none absolute inset-0 size-full object-contain" />
            <div
              v-if="!capture.running.value && !capture.starting.value"
              class="absolute inset-0 grid place-items-center text-sm text-white/60"
            >
              <div class="flex flex-col items-center gap-2">
                <UIcon name="i-lucide-scan-face" class="size-10" />
                <span>{{ t("Face.CameraIdle") }}</span>
              </div>
            </div>
            <div
              v-if="currentFlow"
              class="absolute inset-x-3 bottom-3 rounded-md bg-black/70 px-3 py-2 text-white backdrop-blur-sm"
            >
              <div class="flex items-center justify-between gap-3 text-sm font-medium">
                <span>{{ statusLabel }}</span>
                <span v-if="currentFlow.challenge" class="text-xs text-white/70">
                  {{ currentFlow.challenge.text }}
                </span>
              </div>
              <p class="mt-1 text-xs text-white/75">{{ currentFlow.detail }}</p>
            </div>
          </div>

          <div class="grid gap-3 border-t border-default px-3 py-3 sm:grid-cols-3">
            <div>
              <p class="text-xs text-muted">{{ t("Face.Recognition") }}</p>
              <p class="mt-1 truncate text-sm font-medium text-highlighted">
                {{ primaryFace?.name || t("Face.NoFace") }}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted">{{ t("Face.Similarity") }}</p>
              <p class="mt-1 text-sm font-medium text-highlighted">
                {{ primaryFace ? `${(primaryFace.similarity * 100).toFixed(1)}%` : "-" }}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted">{{ t("Face.Liveness") }}</p>
              <p class="mt-1 text-sm font-medium text-highlighted">
                {{
                  primaryFace?.liveness
                    ? primaryFace.liveness.is_live
                      ? t("Face.Passed")
                      : t("Face.Pending")
                    : currentFlow?.phase === "monitoring"
                      ? t("Face.CompletedOnce")
                      : "-"
                }}
              </p>
            </div>
          </div>
        </section>

        <section class="flex min-h-[560px] flex-col rounded-lg border border-default bg-default">
          <div class="border-b border-default p-3">
            <UTabs
              v-model="mode"
              :items="tabs"
              value-key="value"
              label-key="label"
              :content="false"
              color="neutral"
              variant="pill"
              :disabled="capture.running.value || capture.starting.value"
            />
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto p-4">
            <div v-if="mode === 'enroll'" class="space-y-4">
              <UFormField :label="t('Face.PersonName')" required>
                <UInput v-model="enrollForm.name" class="w-full" :placeholder="t('Face.PersonNamePlaceholder')" />
              </UFormField>
              <div class="grid gap-3 sm:grid-cols-2">
                <UFormField :label="t('Face.EnrollTimeout')">
                  <UInput v-model.number="enrollForm.timeoutSeconds" type="number" min="5" max="120" class="w-full" />
                </UFormField>
                <UFormField :label="t('Face.RequiredSamples')">
                  <UInput v-model.number="enrollForm.requiredSamples" type="number" min="1" max="8" class="w-full" />
                </UFormField>
              </div>

              <div v-if="people.length" class="border-t border-default pt-4">
                <div class="mb-2 flex items-center justify-between">
                  <h2 class="text-sm font-medium text-highlighted">{{ t("Face.RegisteredPeople") }}</h2>
                  <UBadge color="neutral" variant="soft">{{ people.length }}</UBadge>
                </div>
                <div class="max-h-48 space-y-1 overflow-y-auto">
                  <div
                    v-for="person in people"
                    :key="person.person_id"
                    class="flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-elevated"
                  >
                    <div class="min-w-0">
                      <p class="truncate text-sm font-medium">{{ person.name }}</p>
                      <p class="text-xs text-muted">{{ t("Face.SampleCount", { count: person.samples }) }}</p>
                    </div>
                    <UButton
                      icon="i-lucide-trash-2"
                      color="error"
                      variant="ghost"
                      size="xs"
                      :title="t('Common.Delete')"
                      :aria-label="t('Common.Delete')"
                      :disabled="capture.running.value"
                      @click="deleteTarget = person"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div v-else-if="mode === 'auth'" class="space-y-4">
              <UFormField :label="t('Face.TargetPerson')" required>
                <USelect
                  v-model="authForm.targetId"
                  :items="personItems"
                  value-key="value"
                  label-key="label"
                  :placeholder="t('Face.SelectPerson')"
                  class="w-full"
                />
              </UFormField>
              <div class="grid gap-3 sm:grid-cols-2">
                <UFormField :label="t('Face.AuthTimeout')">
                  <UInput v-model.number="authForm.timeoutSeconds" type="number" min="5" max="120" class="w-full" />
                </UFormField>
                <UFormField :label="t('Face.RecognitionThreshold')">
                  <UInput
                    v-model.number="authForm.threshold"
                    type="number"
                    min="0.1"
                    max="0.99"
                    step="0.01"
                    class="w-full"
                  />
                </UFormField>
              </div>
              <div class="space-y-3 border-t border-default pt-4">
                <FaceActionEditor v-model="authForm.successAction" :label="t('Face.AuthSuccessAction')" />
                <FaceActionEditor v-model="authForm.failedAction" :label="t('Face.AuthFailedAction')" />
              </div>
            </div>

            <div v-else class="space-y-4">
              <UFormField :label="t('Face.TargetPerson')" required>
                <USelect
                  v-model="monitorForm.targetId"
                  :items="personItems"
                  value-key="value"
                  label-key="label"
                  :placeholder="t('Face.SelectPerson')"
                  class="w-full"
                />
              </UFormField>
              <div class="grid gap-3 sm:grid-cols-3">
                <UFormField :label="t('Face.MonitorInitTimeout')">
                  <UInput
                    v-model.number="monitorForm.initTimeoutSeconds"
                    type="number"
                    min="5"
                    max="120"
                    class="w-full"
                  />
                </UFormField>
                <UFormField :label="t('Face.AwayAfter')">
                  <UInput
                    v-model.number="monitorForm.awayAfterSeconds"
                    type="number"
                    min="1"
                    max="600"
                    class="w-full"
                  />
                </UFormField>
                <UFormField :label="t('Face.RecognitionThreshold')">
                  <UInput
                    v-model.number="monitorForm.threshold"
                    type="number"
                    min="0.1"
                    max="0.99"
                    step="0.01"
                    class="w-full"
                  />
                </UFormField>
              </div>
              <UAlert
                color="info"
                variant="soft"
                icon="i-lucide-shield-check"
                :description="t('Face.MonitorLivenessOnce')"
              />
              <div class="space-y-3 border-t border-default pt-4">
                <FaceActionEditor v-model="monitorForm.initFailedAction" :label="t('Face.MonitorInitFailedAction')" />
                <FaceActionEditor v-model="monitorForm.awayAction" :label="t('Face.MonitorAwayAction')" />
                <FaceActionEditor v-model="monitorForm.returnedAction" :label="t('Face.MonitorReturnedAction')" />
              </div>
            </div>
          </div>

          <div class="flex items-center justify-end gap-2 border-t border-default p-3">
            <UButton
              v-if="capture.running.value || capture.starting.value"
              icon="i-lucide-square"
              color="error"
              variant="soft"
              :label="t('Face.Stop')"
              @click="capture.stop"
            />
            <UButton
              v-else
              icon="i-lucide-play"
              :loading="capture.starting.value || engineBusy"
              :disabled="!isDesktopRuntime() || engineStatus?.available === false"
              :label="t('Face.Start')"
              @click="startCurrentFlow"
            />
          </div>
        </section>
      </div>

      <section class="rounded-lg border border-default bg-default">
        <div class="flex items-center justify-between border-b border-default px-3 py-2.5">
          <h2 class="text-sm font-medium text-highlighted">{{ t("Face.EventLog") }}</h2>
          <UButton
            icon="i-lucide-trash-2"
            color="neutral"
            variant="ghost"
            size="xs"
            :disabled="!eventLog.length"
            :title="t('Common.Clear')"
            :aria-label="t('Common.Clear')"
            @click="eventLog = []"
          />
        </div>
        <div class="max-h-40 overflow-y-auto px-3 py-2 font-ui-mono text-xs">
          <p v-if="!eventLog.length" class="py-2 text-muted">{{ t("Face.NoEvents") }}</p>
          <div v-for="(event, index) in eventLog" :key="`${event.at}-${index}`" class="flex gap-3 py-1">
            <span class="shrink-0 text-muted">{{ event.at }}</span>
            <span :class="event.kind.includes('failed') || event.kind === 'error' ? 'text-error' : 'text-default'">
              {{ event.text }}
            </span>
          </div>
        </div>
      </section>
    </div>

    <UModal v-model:open="settingsOpen" :title="t('Face.EngineSettings')" :ui="{ content: 'max-w-2xl' }">
      <template #body>
        <div class="space-y-5">
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField :label="t('Face.ComputeDevice')">
              <USelect
                v-model="engineConfig.device"
                :items="deviceModes"
                value-key="value"
                label-key="label"
                class="w-full"
              />
            </UFormField>
            <UFormField :label="t('Face.ModelName')">
              <UInput v-model="engineConfig.model_name" class="w-full" />
            </UFormField>
            <UFormField :label="t('Face.DefaultThreshold')">
              <UInput
                v-model.number="engineConfig.recognition.threshold"
                type="number"
                min="0.1"
                max="0.99"
                step="0.01"
                class="w-full"
              />
            </UFormField>
            <UFormField :label="t('Face.LivenessMode')">
              <USelect
                v-model="engineConfig.liveness.mode"
                :items="livenessModes"
                value-key="value"
                label-key="label"
                class="w-full"
              />
            </UFormField>
            <UFormField :label="t('Face.LivenessThreshold')">
              <UInput
                v-model.number="engineConfig.liveness.threshold"
                type="number"
                min="0"
                max="1"
                step="0.01"
                class="w-full"
              />
            </UFormField>
            <UFormField :label="t('Face.MinFaceSize')">
              <UInput
                v-model.number="engineConfig.liveness.min_face_size"
                type="number"
                min="40"
                max="400"
                class="w-full"
              />
            </UFormField>
          </div>

          <UFormField
            v-if="engineConfig.liveness.mode === 'onnx' || engineConfig.liveness.mode === 'hybrid'"
            :label="t('Face.AntiSpoofModel')"
          >
            <UFieldGroup class="w-full">
              <UInput v-model="onnxModelPath" readonly class="min-w-0 flex-1" />
              <UButton color="neutral" variant="outline" icon="i-lucide-folder-open" @click="pickOnnxModel" />
            </UFieldGroup>
          </UFormField>

          <div class="grid gap-3 border-t border-default pt-4 sm:grid-cols-2">
            <UFormField :label="t('Face.CameraPolicy')">
              <USelect
                v-model="cameraPolicy.mode"
                :items="cameraPolicies"
                value-key="value"
                label-key="label"
                class="w-full"
              />
            </UFormField>
            <UFormField v-if="cameraPolicy.mode === 'allowlist'" :label="t('Face.CameraLabelPattern')">
              <UInput v-model="cameraPolicy.labelPattern" class="w-full" placeholder="JumpCam|Vendor Camera" />
            </UFormField>
          </div>

          <div class="space-y-3 border-t border-default pt-4">
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="text-sm font-medium text-highlighted">{{ t("Face.DebugMode") }}</p>
                <p class="text-xs text-muted">{{ t("Face.DebugModeDescription") }}</p>
              </div>
              <USwitch v-model="engineConfig.debug.enabled" />
            </div>
            <div v-if="engineConfig.debug.enabled" class="flex flex-wrap gap-4 text-sm">
              <UCheckbox v-model="engineConfig.debug.draw_bbox" :label="t('Face.DrawBox')" />
              <UCheckbox v-model="engineConfig.debug.draw_landmarks" :label="t('Face.DrawLandmarks')" />
              <UCheckbox v-model="engineConfig.debug.draw_liveness" :label="t('Face.DrawLiveness')" />
            </div>
          </div>

          <UAlert
            v-if="engineConfig.liveness.mode === 'motion'"
            color="warning"
            variant="soft"
            icon="i-lucide-triangle-alert"
            :description="t('Face.MotionWarning')"
          />
          <UAlert
            v-if="cameraPolicy.mode === 'allowlist'"
            color="info"
            variant="soft"
            icon="i-lucide-camera"
            :description="t('Face.CameraPolicyWarning')"
          />
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="outline" :label="t('Common.Cancel')" @click="settingsOpen = false" />
        <UButton :loading="engineBusy" :label="t('Face.ApplyAndRestart')" @click="configureEngine" />
      </template>
    </UModal>

    <UModal
      :open="Boolean(deleteTarget)"
      :title="t('Face.DeletePerson')"
      :description="t('Face.DeletePersonConfirm', { name: deleteTarget?.name || '' })"
      @update:open="(open) => !open && (deleteTarget = null)"
    >
      <template #footer>
        <UButton color="neutral" variant="outline" :label="t('Common.Cancel')" @click="deleteTarget = null" />
        <UButton color="error" :loading="deleting" :label="t('Common.Delete')" @click="confirmDeletePerson" />
      </template>
    </UModal>
  </div>
</template>
