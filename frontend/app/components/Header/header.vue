<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';
import type { ActionItem } from '~/types/index';

type LocaleCode = (typeof locales.value)[number]['code'];

const emits = defineEmits<{
  (e: 'collapse'): void;
}>();

const colorMode = useColorMode();
const { t, setLocale, locales, locale } = useI18n();

const collapsed = ref(false);
const currentLocale = ref(locale.value);
const supportLanguages = ref<DropdownMenuItem[]>([]);

const isDarkMode = computed(() => colorMode.value === 'dark');

const computedSwitchMode = computed<ActionItem>(() => {
  return {
    iconName: isDarkMode.value ? 'i-lucide-sun' : 'i-lucide-moon',
    tooltipLabel: isDarkMode.value
      ? t('ToolTips.LightMode')
      : t('ToolTips.DarkMode'),
    onClick: toggleDarkMode,
  };
});

watch(
  currentLocale,
  (newLocale) => {
    supportLanguages.value = locales.value.map((locale) => ({
      label: locale.name,
      value: locale.code,
      type: 'checkbox' as const,
      checked: locale.code === newLocale,
      onUpdateChecked: (checked: boolean) => {
        if (checked) {
          changeLocale(locale.code);
          currentLocale.value = locale.code; // 触发 watch
        }
      },
    }));
  },
  { immediate: true }
);

function toggleDarkMode() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark';
}

function changeLocale(payload: LocaleCode) {
  setLocale(payload);
}

const handleCollapse = () => {
  collapsed.value = !collapsed.value;
  emits('collapse');
};

const handleWindowDrag = async (event: MouseEvent) => {
  if (event.button !== 0) return;

  try {
    const windows = await useTauriWindowGetAllWindows();
    windows.forEach((window) => {
      window.startDragging();
    });
  } catch (error) {
    console.error(error);
  }
};

const items = ref(['Backlog', 'Todo', 'In Progress', 'Done']);
const value = ref('Backlog');

const dropItems = ref<DropdownMenuItem[][]>([
  [
    {
      label: 'Profile',
      icon: 'i-lucide-user',
    },
    {
      label: 'Billing',
      icon: 'i-lucide-credit-card',
    },
    {
      label: 'Settings',
      icon: 'i-lucide-cog',
      kbds: [','],
    },
    {
      label: 'Keyboard shortcuts',
      icon: 'i-lucide-monitor',
    },
  ],
  [
    {
      label: 'Team',
      icon: 'i-lucide-users',
    },
    {
      label: 'Invite users',
      icon: 'i-lucide-user-plus',
      children: [
        [
          {
            label: 'Email',
            icon: 'i-lucide-mail',
          },
          {
            label: 'Message',
            icon: 'i-lucide-message-square',
          },
        ],
        [
          {
            label: 'More',
            icon: 'i-lucide-circle-plus',
          },
        ],
      ],
    },
    {
      label: 'New team',
      icon: 'i-lucide-plus',
      kbds: ['meta', 'n'],
    },
  ],
  [
    {
      label: 'GitHub',
      icon: 'i-simple-icons-github',
      to: 'https://github.com/nuxt/ui',
      target: '_blank',
    },
    {
      label: 'Support',
      icon: 'i-lucide-life-buoy',
      to: '/components/dropdown-menu',
    },
    {
      label: 'API',
      icon: 'i-lucide-cloud',
      disabled: true,
    },
  ],
  [
    {
      label: 'Logout',
      icon: 'i-lucide-log-out',
      kbds: ['shift', 'meta', 'q'],
    },
  ],
]);
</script>

<template>
  <div
    :style="{
      backgroundColor: colorMode.value === 'dark' ? '#18181b' : '#F5F5F5',
    }"
    class="flex items-center justify-between h-12 px-4 cursor-pointer"
    @mousedown="handleWindowDrag"
  >
    <section class="flex items-center h-full ml-20">
      <UIcon
        :name="
          collapsed ? 'i-lucide-panel-left-open' : 'i-lucide-panel-left-close'
        "
        class="size-5 ml-16 cursor-pointer"
        @click="handleCollapse"
      />

      <USelect
        v-model="value"
        :items="items"
        size="sm"
        placeholder="Default"
        class="w-36 ml-6"
      />
    </section>

    <section class="flex items-center h-full gap-3 mr-2">
      <UDropdownMenu arrow size="sm" :items="supportLanguages">
        <UButton
          icon="i-lucide-globe"
          size="sm"
          color="neutral"
          variant="soft"
          class="rounded-lg"
          :title="t('ToolTips.SwitchLanguage')"
        />
      </UDropdownMenu>

      <UPopover mode="hover" arrow>
        <UButton
          :icon="computedSwitchMode.iconName"
          size="sm"
          color="neutral"
          variant="soft"
          class="rounded-lg"
          @click.prevent="computedSwitchMode.onClick"
        />

        <template #content>
          <span class="m-2 inline-flex text-xs-plus">
            {{ computedSwitchMode.tooltipLabel }}
          </span>
        </template>
      </UPopover>

      <UDropdownMenu
        :items="dropItems"
        :ui="{
          content: 'w-48',
        }"
      >
        <UAvatar size="sm" src="https://github.com/benjamincanac.png" />
      </UDropdownMenu>
    </section>
  </div>
</template>
