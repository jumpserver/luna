<template>
  <n-tabs animated trigger="hover" size="large">
    <n-tab-pane
      v-for="(connectType, index) of connectConnectTypeComputed"
      :key="index"
      :name="connectType.name"
      :tab="connectType.name.toUpperCase()"
    >
      <n-form ref="formRef" size="large" label-placement="top">
        <n-grid :cols="24" :x-gap="24">
          <!-- 账号选择 -->
          <n-form-item-gi
            :span="24"
            :label="t('Select account')"
            :label-style="{ letterSpacing: '0.7px' }"
          >
            <n-select
              v-model:value="model.account"
              size="medium"
              :placeholder="t('Select account')"
              :options="accountOptions"
              @update:value="handleAccountSelect"
            />
          </n-form-item-gi>

          <!-- 密码 -->
          <n-form-item-gi
            :span="24"
            :label="t('Password')"
            :label-style="{ letterSpacing: '0.7px' }"
          >
            <n-grid :cols="24" :x-gap="24">
              <n-grid-item :span="18">
                <n-input
                  v-model:value="model.inputValue"
                  :placeholder="t('Please input password')"
                  clearable
                  size="medium"
                  type="password"
                  show-password-on="mousedown"
                />
              </n-grid-item>
              <n-grid-item
                :span="6"
                :style="{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }"
              >
                <n-checkbox size="medium">{{ t('Remember password') }}</n-checkbox>
              </n-grid-item>
            </n-grid>
          </n-form-item-gi>

          <!-- 连接方式 -->
          <n-form-item-gi
            :span="24"
            :label="t('Connect method')"
            :label-style="{ letterSpacing: '0.7px' }"
          >
            <n-card>
              <n-tabs animated size="medium" justify-content="center" type="segment">
                <n-tab-pane
                  v-for="(method, methodIndex) of connectType.connectMethods"
                  :name="method.label"
                  :key="methodIndex"
                >
                  <n-radio-group v-model:value="model.connect_options">
                    <n-space>
                      <n-radio
                        v-for="(item, indexItem) of method.methods"
                        :key="indexItem"
                        :value="item.value"
                        size="medium"
                      >
                        {{ item.label }}
                      </n-radio>
                    </n-space>
                  </n-radio-group>
                </n-tab-pane>
              </n-tabs>
            </n-card>
          </n-form-item-gi>

          <!-- 高级选项 -->
          <n-form-item-gi
            :span="24"
            :label-style="{ letterSpacing: '0.7px' }"
            :class="showAdvanced ? 'advanced-option' : ''"
          >
            <template #label>
              <n-grid :cols="24" :x-gap="24">
                <n-grid-item :span="22">
                  <span>{{ t('Advanced option') }}</span>
                </n-grid-item>
                <n-grid-item
                  :span="2"
                  :style="{ display: 'flex', justifyContent: 'flex-end', cursor: 'pointer' }"
                >
                  <n-icon :size="16" @click="handleShowAdvanced">
                    <ArrowUp v-if="showAdvanced" />
                    <ArrowDown v-else />
                  </n-icon>
                </n-grid-item>
              </n-grid>
            </template>

            <n-card
              v-show="!showAdvanced"
              :title="t('Backspace as Ctrl+H')"
              :header-style="{ fontSize: '12px !important' }"
            >
              <n-select
                v-model:value="model.backspaceAsCtrlH"
                size="medium"
                :placeholder="t('Select account')"
                :options="backspaceOptions"
              />
            </n-card>
          </n-form-item-gi>

          <!-- 记住选择-->
          <n-form-item-gi
            :span="24"
            :label-style="{ letterSpacing: '0.7px' }"
            class="remember-select"
          >
            <template #label>
              <n-grid :cols="24">
                <n-grid-item :span="12">
                  <span>{{ t('Remember select') }}</span>
                </n-grid-item>
                <n-grid-item
                  :span="12"
                  :style="{ display: 'flex', justifyContent: 'flex-end', cursor: 'pointer' }"
                >
                  <n-checkbox size="medium">
                    <n-text :style="{ fontSize: '12px !important' }">
                      {{ t('Automatic login next') }}
                    </n-text>
                  </n-checkbox>
                </n-grid-item>
              </n-grid>
            </template>
          </n-form-item-gi>

          <!-- 连接按钮-->
          <n-form-item-gi :span="24" justify="center">
            <n-button type="primary" round style="width: 100%" size="medium" @click="handleConnect">
              {{ t('Connect') }}
            </n-button>
          </n-form-item-gi>
        </n-grid>
      </n-form>
    </n-tab-pane>
  </n-tabs>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';

import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
// import { SelectOption } from 'naive-ui';
import { ArrowDown, ArrowUp } from '@vicons/ionicons5';
import { useGlobalStore } from '@/stores/modules/global.ts';
import { checkPreConnectDataForAuto, getPreConnectData, setPreConnectData } from './helper/index';
import {
  Account,
  ConnectData,
  connectMethodItem,
  Protocol
} from '@/components/ConnectionDialog/types';

const globalStore = useGlobalStore();

const { t } = useI18n();
const { connectMethods } = storeToRefs(globalStore);

const props = defineProps<{
  id: string;
  permedAccounts: any;
  permedProtocols: any;
}>();

const showAdvanced = ref(false);
const modelAccount = ref<Account>({});
const model = reactive({
  account: '',
  asset: props.id,
  connect_options: '',
  input_username: '',
  protocol: '',

  inputValue: '',
  selectValue: null,
  checkedValue: null,
  backspaceAsCtrlH: 'true'
});

const backspaceOptions = [
  {
    label: '是',
    value: 'true'
  },
  {
    label: '否',
    value: 'false'
  }
];
const connectMethodTypes = [
  { value: 'web', label: 'Web', methods: [] },
  { value: 'native', label: t('Native'), methods: [] },
  { value: 'applet', label: t('Applet'), methods: [] },
  { value: 'virtual_app', label: t('VirtualApp'), methods: [] }
];

const accountOptions = computed(() => {
  return props.permedAccounts.map((item: any) => {
    return {
      ...item,
      label: item.username,
      value: item.username
    };
  });
});

console.log('accountOptions', accountOptions);
// 整合 连接方式 tab 数据
const connectConnectTypeComputed = computed(() => {
  return props.permedProtocols.map((protocol: Protocol) => {
    const filteredConnectMethods = connectMethodTypes
      .map(type => {
        return {
          ...type,
          methods: connectMethods.value[protocol.name].filter(
            (method: connectMethodItem) => type.value === method.type
          )
        };
      })
      .filter(type => type.methods.length > 0);

    return {
      name: protocol.name,
      connectMethods: filteredConnectMethods
    };
  });
});

const handleShowAdvanced = () => {
  showAdvanced.value = !showAdvanced.value;
};

const handleAccountSelect = (value: string, option: Account) => {
  delete option.value;
  delete option.label;

  console.log(value, option);
  modelAccount.value = option;
};

const getConnectData = () => {
  const preConnectData = getPreConnectData(props.id) as ConnectData;
  const isValid = checkPreConnectDataForAuto(props.permedAccounts, preConnectData);

  if (isValid) {
    return Promise.resolve(preConnectData);
  } else {
    return Promise.reject(false);
  }
};
getConnectData();

const handleConnect = async () => {
  setPreConnectData(props.id, model);
  // const connectInfo = await getConnectData();
  // if (!connectInfo) {
  // }
  // console.log('connectInfo', connectInfo);
};

// console.log('connectConnectTypeComputed', connectConnectTypeComputed);
</script>

<style scoped lang="scss">
:deep(.n-form-item-feedback-wrapper) {
  min-height: 20px;
}

// 高级选项部分样式修改
:deep(.advanced-option) {
  .n-form-item-label {
    margin-bottom: 25px;
  }

  .n-form-item-blank,
  .n-form-item-feedback-wrapper {
    display: none !important;
  }
}

// 记住选择样式修改
:deep(.remember-select) {
  .n-form-item-blank {
    display: none;
  }
}

.remember-password,
.advanced_option {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}
</style>
