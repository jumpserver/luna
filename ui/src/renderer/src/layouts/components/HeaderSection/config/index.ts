import type { SelectOption } from 'naive-ui';

export const layoutOption = [
  {
    label: 'Grid',
    value: 'grid',
  },
  {
    label: 'List',
    value: 'list',
  },
];

export const sortOption: Array<SelectOption> = [
  {
    value: 'name',
    label: 'A-z',
  },
  {
    value: '-name',
    label: 'Z-a',
  },
  {
    value: '-date_updated',
    label: 'Newest to oldest',
  },
  {
    value: 'date_updated',
    label: 'Oldest to newest',
  },
];

export const createOption: Array<SelectOption> = [
  {
    label: 'New Group',
    value: 'new-group',
  },
  {
    label: 'Import',
    value: 'import',
  },
];

export const themeOptions: Array<SelectOption> = [
  {
    label: 'Dark',
    value: 'dark',
  },
  {
    label: 'Light',
    value: 'light',
  },
];
