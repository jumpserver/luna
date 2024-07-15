<template>
  <n-tabs animated trigger="hover" size="large">
    <n-tab-pane
      v-for="(protocol, index) of permed_protocols"
      :key="index"
      :name="protocol.name"
      :tab="protocol.name.toUpperCase()"
    >
      <n-form ref="formRef" size="large" label-placement="top">
        <n-grid :cols="24" :x-gap="24">
          <n-form-item-gi :span="24" :label="t('Select account')">
            <n-select
              v-model:value="model.selectValue"
              :placeholder="t('Select account')"
              :options="assetCount"
            />
          </n-form-item-gi>

          <n-form-item-gi :span="24" :label="t('Password')">
            <n-grid :cols="24" :x-gap="24">
              <n-grid-item :span="18">
                <n-input
                  v-model:value="model.inputValue"
                  :placeholder="t('Please input password')"
                  clearable
                  type="password"
                  show-password-on="mousedown"
                />
              </n-grid-item>
              <n-grid-item :span="6" class="remember-password">
                <n-checkbox>{{ t('Remember password') }}</n-checkbox>
              </n-grid-item>
            </n-grid>
          </n-form-item-gi>
        </n-grid>
      </n-form>
    </n-tab-pane>
  </n-tabs>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps<{
  id: string;
  permedAccounts: any;
  permedProtocols: any;
}>();

const assetCount = computed(() => {
  //todo)) 类型
  const tempArr = [];
  props.permedAccounts.forEach((item: any) => {
    tempArr.push({
      label: item.username,
      value: item.username
    });
  });

  return tempArr!;
});

console.log(assetCount);
console.log(props);

const model = reactive({
  inputValue: '',
  selectValue: null
});
</script>

<style scoped lang="scss">
.remember-password {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}
</style>
