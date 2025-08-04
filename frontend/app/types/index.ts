import type { DropdownMenuItem } from '@nuxt/ui';

type ActionType = 'action' | 'select';

export interface ActionItem {
  key: string;
  iconName: string;
  tooltipLabel: string;
  type: ActionType;
  selectItems?: DropdownMenuItem[];
  onClick?: () => void;
}
