import { ElementConnectComponent } from './connect.component';

describe('ElementConnectComponent', () => {
  let component: ElementConnectComponent;
  let i18n: jasmine.SpyObj<any>;
  let message: jasmine.SpyObj<any>;

  beforeEach(() => {
    i18n = jasmine.createSpyObj('I18nService', ['instant']);
    i18n.instant.and.callFake(key => key);
    message = jasmine.createSpyObj('NzMessageService', ['error']);
    component = new ElementConnectComponent(
      null,
      null,
      null,
      null,
      null,
      null,
      i18n,
      message,
      null,
      null
    );
  });

  it('shows an asset-specific message when the granted asset returns 404', () => {
    component['handleAssetDetailError']({
      status: 404,
      error: { detail: '对象对象不存在' }
    });

    expect(message.error).toHaveBeenCalledWith(
      'Asset not found or You have no permission to access it, please refresh asset tree',
      { nzDuration: 5000 }
    );
  });

  it('shows an asset-specific message for object-does-not-exist errors', () => {
    component['handleAssetDetailError']({
      status: 400,
      error: { code: 'object_does_not_exist', detail: '对象对象不存在' }
    });

    expect(message.error).toHaveBeenCalledWith(
      'Asset not found or You have no permission to access it, please refresh asset tree',
      { nzDuration: 5000 }
    );
  });

  it('keeps meaningful backend details for other errors', () => {
    component['handleAssetDetailError']({
      status: 500,
      error: { detail: 'Vault is unavailable' }
    });

    expect(message.error).toHaveBeenCalledWith('Vault is unavailable', { nzDuration: 5000 });
  });
});
