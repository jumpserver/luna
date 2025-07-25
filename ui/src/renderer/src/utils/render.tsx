import type { Component } from 'vue';

import { NIcon } from 'naive-ui';

export const renderIcon = (icon: Component) => {
  return <NIcon component={icon} />;
};
