import { BehaviorSubject, of } from 'rxjs';
import { ConnectMethod, GlobalSetting, Setting } from '@app/model';
import { AppService } from '@app/services/app';
import { SettingService } from '@app/services/setting';
import { ElementAdvancedOptionComponent } from './advanced-option.component';

describe('RDP resolution compatibility', () => {
  let settings: SettingService;

  beforeEach(() => {
    // Avoid startup HTTP and DOM side effects; exercise the real preference loader below.
    settings = Object.create(SettingService.prototype);
    settings.setting = new Setting();
    settings.globalSetting = new GlobalSetting();
    settings.globalSetting$ = new BehaviorSubject(settings.globalSetting);
    settings.hasXPack = () => false;
    settings.setAppletConnectMethod = () => {};
    settings.setKeyboardLayout = () => {};
  });

  function open(component = 'lion', options = {}) {
    const result = new ElementAdvancedOptionComponent(settings);
    result.protocol = { name: 'rdp' } as any;
    result.connectMethod = new ConnectMethod('RDP', '', 'rdp', component);
    result.connectOption = options;
    result.ngOnInit();
    return result;
  }

  function resolution(component: ElementAdvancedOptionComponent) {
    return component.getOptionValue(component.advancedOptions.find(i => i.field === 'resolution'));
  }

  it('uses a lowercase default', () => {
    expect(settings.setting.graphics.rdp_resolution).toBe('auto');
  });

  it('keeps auto for a new user without saved preferences', async () => {
    settings['_localStorage'] = { get: () => null, set: () => {} } as any;
    settings['_http'] = { get: () => of({}) } as any;

    await settings.getSystemSetting();

    expect(resolution(open())).toBe('auto');
  });

  [
    ['Auto', 'auto'],
    [' AUTO ', 'auto'],
    ['', 'auto'],
    [null, 'auto'],
    [undefined, 'auto'],
    [42, 'auto'],
    ['invalid', 'auto'],
    ['1920x1080', '1920x1080']
  ].forEach(([value, expected]) => {
    it(`normalizes loaded preference ${JSON.stringify(value)} before caching it`, async () => {
      const localStorage = jasmine.createSpyObj('storage', ['get', 'set']);
      localStorage.get.and.returnValue({ graphics: { rdp_resolution: '1024x768' } });
      settings['_localStorage'] = localStorage;
      settings['_http'] = {
        get: () => of({ graphics: { ...new Setting().graphics, rdp_resolution: value } })
      } as any;

      await settings.getSystemSetting();

      expect(settings.setting.graphics.rdp_resolution).toBe(expected as string);
      expect(localStorage.set).toHaveBeenCalledWith(settings.settingKey, settings.setting);
    });
  });

  it('normalizes a local preference when the server has no graphics preference', async () => {
    settings['_localStorage'] = {
      get: () => ({ graphics: { ...new Setting().graphics, rdp_resolution: 'Auto' } }),
      set: () => {}
    } as any;
    settings['_http'] = { get: () => of({}) } as any;

    await settings.getSystemSetting();

    expect(settings.setting.graphics.rdp_resolution).toBe('auto');
  });

  it('preserves the user preference when loading public settings without the removed global default', async () => {
    settings.setting.graphics.rdp_resolution = '1920x1080';
    settings['_localStorage'] = { get: () => null } as any;
    settings['_http'] = { get: () => of(new GlobalSetting()) } as any;
    spyOn(settings, 'setLogo');
    spyOn(settings, 'setTitle');
    spyOn(settings, 'setFavicon');

    await settings.getPublicSettings();

    expect(settings.setting.graphics.rdp_resolution).toBe('1920x1080');
  });

  ['lion', 'razor'].forEach(method => {
    it(`shows auto and repairs an invalid remembered resolution for ${method}`, () => {
      const component = open(method, { resolution: 'invalid' });
      expect(resolution(component)).toBe('auto');
      expect(component.connectOption.resolution).toBe('auto');
    });

    it(`normalizes a remembered Auto without replacing it with the preference for ${method}`, () => {
      settings.setting.graphics.rdp_resolution = '1920x1080';
      const component = open(method, { resolution: 'Auto' });
      expect(resolution(component)).toBe('auto');
      expect(component.connectOption.resolution).toBe('auto');
    });

    it(`continues following the preference until an explicit selection for ${method}`, () => {
      const component = open(method);
      expect(resolution(component)).toBe('auto');
      expect(component.connectOption.resolution).toBeUndefined();

      settings.setting.graphics.rdp_resolution = '1366x768';
      component.onChange();
      expect(resolution(component)).toBe('1366x768');

      component.connectOption.resolution = '1600x900';
      component.onChange();
      expect(resolution(component)).toBe('1600x900');
    });

    it(`remembers a selected resolution when reopening the asset with ${method}`, () => {
      const component = open(method);
      component.connectOption.resolution = '1920x1080';
      component.onChange();

      const store = new Map();
      const app: AppService = Object.create(AppService.prototype);
      app['_localStorage'] = {
        set: (key, value) => store.set(key, JSON.parse(JSON.stringify(value))),
        get: key => store.get(key)
      } as any;
      spyOn(app, 'setAccountLocalAuth');
      const asset = { id: 'windows' } as any;
      app.setPreConnectData(asset, {
        account: { alias: 'administrator', has_secret: true },
        protocol: component.protocol,
        connectMethod: component.connectMethod,
        connectOption: component.connectOption
      } as any);

      const reopened = open(method, app.getPreConnectData(asset).connectOption);
      expect(resolution(reopened)).toBe('1920x1080');
    });
  });

  it('never falls back to a default that is absent from the choices', () => {
    settings.setting.graphics.rdp_resolution = 'invalid';
    expect(resolution(open())).toBe('auto');
  });

  it('preserves boolean false and the existing web fallback for other selects', () => {
    const component = open('tinker', { appletConnectMethod: 'invalid', use_sysdba: false });
    expect(component.connectOption.appletConnectMethod).toBe('invalid'); // Hidden without a license.
    expect(component.connectOption.use_sysdba).toBe(false);
    settings.hasXPack = () => true;
    const licensed = open('tinker', { appletConnectMethod: 'invalid', remote_microphone: false });
    expect(licensed.connectOption.appletConnectMethod).toBe('web');
    expect(licensed.connectOption.remote_microphone).toBe(false);
  });
});
