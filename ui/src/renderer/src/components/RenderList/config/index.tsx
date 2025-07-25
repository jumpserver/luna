import type { DataTableColumns } from 'naive-ui';
import type { IListItem } from '@renderer/components/MainSection/interface';

import { useI18n } from 'vue-i18n';
import { NButton, NButtonGroup, NTag } from 'naive-ui';
import { Cable, EllipsisVertical } from 'lucide-vue-next';

export const getColumns = (): DataTableColumns<IListItem> => {
  const { t } = useI18n();

  return [
    {
      title: t('Common.AssetName'),
      key: 'name',
      width: 300,
    },
    {
      title: t('Common.Address'),
      key: 'address',
    },
    {
      title: t('Common.Organization'),
      key: 'org_name',
      width: 200,
      render: (row) => {
        return (
          <NTag bordered={false} round type="info" size="small" class="tracking-widest">
            {row.org_name}
          </NTag>
        );
      },
    },
    {
      title: 'Action',
      key: 'actions',
      align: 'center',
      render: _row => (
        <NButtonGroup class="items-center">
          <NButton round quaternary>
            <Cable size={16} class="mr-2" />
            连接
          </NButton>

          <NButton round size="small" quaternary>
            <EllipsisVertical size={16} />
          </NButton>
        </NButtonGroup>
      ),
    },
  ];
};
