<script lang="ts" setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import CardContainer from "@/lion/components/CardContainer/index.vue";

const props = defineProps<{
  isRemoteApp: boolean
}>();

const emit = defineEmits(["combineKeys"]);

const { t } = useI18n();

const combinationKeys = [
  { keys: ["65307"], name: "Esc" },
  { keys: ["65480"], name: "F11" },
  { keys: ["65507", "65513", "65535"], name: "Ctrl+Alt+Delete" },
  { keys: ["65507", "65513", "65288"], name: "Ctrl+Alt+Backspace" },
  { keys: ["65515", "100"], name: "Windows+D" },
  { keys: ["65515", "101"], name: "Windows+E" },
  { keys: ["65515", "114"], name: "Windows+R" },
  { keys: ["65515", "120"], name: "Windows+X" },
  { keys: ["65515"], name: "Windows" },
  { keys: ["65513", "65289"], name: "Alt+Tab" }
];

const remoteAppCombinationKeys = [{ keys: ["65513", "65289"], name: "Alt+Tab" }];

const keyboardList = computed(() => {
  const keys = props.isRemoteApp ? remoteAppCombinationKeys : combinationKeys;
  return keys.map((item) => ({
    label: item.name,
    click: () => emit("combineKeys", item.keys)
  }));
});
</script>

<template>
  <CardContainer :title="t('AvailableShortcutKey')">
    <div class="grid grid-cols-2 gap-2">
      <UButton v-for="item in keyboardList" :key="item.label" color="neutral" variant="soft" block @click="item.click">
        {{ item.label }}
      </UButton>
    </div>
  </CardContainer>
</template>
