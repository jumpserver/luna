import log from 'electron-log';
import icon from '../../resources/JumpServer.ico?asset';

import * as fs from 'fs';
import * as path from 'path';

import { execFile } from 'child_process';
import { Conf, useConf } from 'electron-conf/main';
import { electronApp, is, optimizer } from '@electron-toolkit/utils';
import { app, BrowserWindow, ipcMain, session, shell } from 'electron';

process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';

const defaults = {
  windowBounds: {
    width: 1280,
    height: 800
  },
  defaultSetting: {
    theme: 'light',
    layout: 'list',
    language: 'en'
  }
};
const sitesCookies = new Map<string, Electron.Cookie[]>();

let mainWindow: BrowserWindow | null = null;
let jms_sessionid = '';
let jms_csrftoken = '';

let openMainWindow = true;

// prettier-ignore
const platform = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux';

let conf = new Conf({ defaults: defaults! });

const setDefaultProtocol = () => {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('jms', process.execPath, [path.resolve(process.argv[1])]);
    }
  } else {
    app.setAsDefaultProtocolClient('jms');
  }
};

const handleUrl = (url: string) => {
  openMainWindow = false;
  handleClientPullUp(url);
};

const handleArgv = (argv: string[]) => {
  const offset = app.isPackaged ? 1 : 2;
  const url = argv.find((arg, i) => i >= offset && arg.startsWith('jms'));
  if (url) handleUrl(url);
};

const handleClientPullUp = (url: string) => {
  if (url) {
    let subPath = process.resourcesPath;
    if (is.dev && !process.env.IS_TEST) {
      subPath = 'bin';
    }
    if (process.platform === 'linux') {
      switch (process.arch) {
        case 'x64':
          subPath += '/linux-amd64';
          break;
        case 'arm':
        case 'arm64':
          subPath += '/linux-arm64';
          break;
      }
    } else if (process.platform === 'darwin') {
      subPath += '/darwin';
    } else {
      subPath += '/windows';
    }
    const exeFilePath = path.join(subPath, 'JumpServerClient');
    execFile(exeFilePath, [url], error => {
      if (error) {
        console.log(error);
      }
    });
  }
};

function updateUserConfigIfNeeded() {
  const userConfigPath = path.join(app.getPath('userData'), 'config.json');

  let subPath = path.join(process.resourcesPath);

  if (is.dev) {
    subPath = 'bin';
  }

  const defaultConfigPath = path.join(subPath, 'config.json');

  let userConfig: Record<string, any> = {};
  let defaultConfig: Record<string, any> = {};

  try {
    defaultConfig = JSON.parse(fs.readFileSync(defaultConfigPath, 'utf8'));
  } catch (err) {
    console.error('无法读取默认配置:', err);
    return;
  }

  if (!fs.existsSync(userConfigPath)) {
    // 初次运行，直接复制
    fs.copyFileSync(defaultConfigPath, userConfigPath);
    return;
  }

  try {
    userConfig = JSON.parse(fs.readFileSync(userConfigPath, 'utf8'));
  } catch (err) {
    console.warn('用户配置读取失败，覆盖为默认配置');
    fs.copyFileSync(defaultConfigPath, userConfigPath);
    return;
  }

  const defaultVersion = defaultConfig.version || 1;
  const userVersion = userConfig.version || 1;

  if (defaultVersion > userVersion) {
    const mergedConfig = {
      ...userConfig,
      ...defaultConfig,
      version: defaultVersion,
      protocol: defaultConfig.protocol,
      type: defaultConfig.type,
      arg_format: defaultConfig.arg_format,
      autoit: defaultConfig.autoit
    };

    try {
      fs.writeFileSync(userConfigPath, JSON.stringify(mergedConfig, null, 2), 'utf8');
    } catch (err) {
      console.error('写入用户配置失败:', err);
    }
    conf = new Conf({ defaults: JSON.parse(fs.readFileSync(userConfigPath, 'utf8')) });
  }
}

const createWindow = async (): Promise<void> => {
  const windowBounds =
    (conf.get('windowBounds') as { width: number; height: number }) || defaults.windowBounds;

  mainWindow = new BrowserWindow({
    width: windowBounds.width,
    height: windowBounds.height,
    show: false,
    frame: false, // 无边框窗口
    center: true,
    autoHideMenuBar: true,
    title: 'JumpServer Client',
    titleBarStyle: 'hidden',
    ...(process.platform === 'linux' ? { icon } : { icon }),
    ...(process.platform !== 'darwin' ? { titleBarOverlay: true } : {}),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false
    }
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show();
  });

  mainWindow.webContents.setWindowOpenHandler(details => {
    try {
      shell.openExternal(details.url);
    } catch (err) {
      log.error('Failed to open external URL:', err);
    }
    return { action: 'deny' };
  });

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = details.responseHeaders;

    // 移除 'Cross-Origin-Opener-Policy' 头
    delete headers?.['Cross-Origin-Opener-Policy'];

    // 添加允许跨域 cookie 的头
    headers!['Access-Control-Allow-Credentials'] = ['true'];

    callback({
      cancel: false,
      responseHeaders: headers
    });
  });

  mainWindow.on('close', () => {
    try {
      if (!mainWindow?.isDestroyed()) {
        const bounds = mainWindow?.getBounds();
        conf.set('windowBounds', bounds);
      }
    } catch (error) {
      console.error('Error saving window bounds:', error);
    }
  });

  mainWindow.on('resize', () => {
    try {
      if (!mainWindow?.isDestroyed()) {
        const bounds = mainWindow?.getBounds();
        conf.set('windowBounds', bounds);
      }
    } catch (error) {
      console.error('Error saving window bounds on resize:', error);
    }
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.webContents.openDevTools();

    await mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
};

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

// @ts-ignore
app.on('second-instance', (_event: Event, argv: string[]) => {
  if (process.platform === 'win32' || process.platform === 'linux') {
    handleArgv(argv);
  }
  if (mainWindow && openMainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('open-url', (_, url: string) => {
  handleUrl(url);
});
app.once('ready', () => {
  updateUserConfigIfNeeded();
});

app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.jumpserver');

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    //允许私有证书
    event.preventDefault();
    callback(true);
  });

  conf.registerRendererListener();

  useConf();

  setDefaultProtocol();

  if (process.platform === 'win32' || process.platform === 'linux') {
    handleArgv(process.argv);
  }

  log.info('whenReady openMainWindow: ', openMainWindow);

  if (openMainWindow) {
    await createWindow();
    setTitleBar(conf.get('defaultSetting.theme') as string);
  } else {
    app.quit();
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0 && openMainWindow) createWindow();
  });

  if (is.dev) {
    if (process.platform === 'win32' || process.platform === 'linux') {
      process.on('message', data => {
        if (data === 'graceful-exit') {
          app.quit();
        }
      });
    } else {
      process.on('SIGTERM', () => {
        app.quit();
      });
    }
  }
});

app.on('window-all-closed', () => {
  app.quit();
});

ipcMain.on('update-titlebar-overlay', (_, theme) => {
  setTitleBar(theme);
});
ipcMain.on('open-client', (_, url) => {
  handleClientPullUp(url);
});
ipcMain.on('get-platform', function (event) {
  event.sender.send('platform-response', platform);
});
ipcMain.on('get-app-version', function (event) {
  event.sender.send('app-version-response', app.getVersion());
});
ipcMain.on('user-login', async (_, site) => {
  const loginWindow = new BrowserWindow({
    width: 600,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const loginUrl = `${site}/core/auth/login/?next=%2Fui%2F`;

  loginWindow.loadURL(loginUrl);

  loginWindow.webContents.on('will-redirect', async (_, url) => {
    if (url.includes('/ui')) {
      try {
        // 获取目标站点的cookies
        const targetCookies = await session.defaultSession.cookies.get({
          url: site
        });

        const csrfTokenCookie = targetCookies.find(cookie => cookie.name.includes('csrftoken'));
        const sessionIdCookie = targetCookies.find(cookie => cookie.name.includes('sessionid'));

        jms_csrftoken = csrfTokenCookie?.value || '';
        jms_sessionid = sessionIdCookie?.value || '';

        // cookies 设置到主窗口域名，以便跨域请求时使用
        const currentUrl = mainWindow?.webContents.getURL();
        const urlObj = new URL(currentUrl || '');
        const siteUrl = `${urlObj.protocol}//${urlObj.host}`;

        const isMainWindowSecure = siteUrl.startsWith('https');
        const isTargetSiteSecure = site.startsWith('https');

        for (const cookie of targetCookies) {
          try {
            // 设置到主窗口域名（用于存储和管理）
            const mainWindowCookieOptions: any = {
              url: siteUrl,
              name: cookie.name,
              value: cookie.value,
              path: cookie.path || '/',
              httpOnly: false,
              secure: isMainWindowSecure,
              sameSite: 'lax' as const
            };

            if (cookie.expirationDate) {
              mainWindowCookieOptions.expirationDate = cookie.expirationDate;
            }

            await session.defaultSession.cookies.set(mainWindowCookieOptions);

            // 同时设置到目标站点域名（用于API请求）
            const targetSiteCookieOptions: any = {
              url: site,
              name: cookie.name,
              value: cookie.value,
              path: cookie.path || '/',
              httpOnly: cookie.httpOnly || false,
              secure: isTargetSiteSecure,
              sameSite: isTargetSiteSecure ? 'no_restriction' : 'lax'
            };

            if (cookie.expirationDate) {
              targetSiteCookieOptions.expirationDate = cookie.expirationDate;
            }

            await session.defaultSession.cookies.set(targetSiteCookieOptions);
          } catch (error) {
            console.error(`设置 cookie 失败: ${cookie.name}`, error);
          }
        }

        // 存储cookie集合到内存中，使用site+sessionId作为复合key
        const userKey = `${site}:${jms_sessionid}`;
        sitesCookies.set(userKey, targetCookies);

        mainWindow?.webContents.send('set-login-credentials', {
          session: jms_sessionid,
          csrfToken: jms_csrftoken,
          site: site, // 传递目标站点给渲染进程作为API baseURL
          allCookies: targetCookies
        });

        loginWindow.close();
      } catch (error) {
        console.error('处理 cookies 失败:', error);
      }
    }
  });
});

ipcMain.handle('get-site-cookies', async (_, site, sessionId) => {
  const userKey = `${site}:${sessionId}`;
  return sitesCookies.get(userKey) || [];
});

ipcMain.handle('restore-cookies', async (_, { site, sessionId, csrfToken, allCookies }) => {
  if (sessionId && csrfToken && site) {
    try {
      // 只清理主窗口域名的现有cookies，不清理目标站点域名的cookies
      const mainWindowUrl = mainWindow?.webContents.getURL();
      if (mainWindowUrl) {
        const existingCookies = await session.defaultSession.cookies.get({
          url: mainWindowUrl
        });

        for (const cookie of existingCookies) {
          await session.defaultSession.cookies.remove(mainWindowUrl, cookie.name);
        }
      }

      jms_sessionid = sessionId;
      jms_csrftoken = csrfToken;

      if (allCookies && allCookies.length > 0) {
        const mainWindowUrl = mainWindow?.webContents.getURL();

        if (mainWindowUrl) {
          const urlObj = new URL(mainWindowUrl);
          const mainSiteUrl = `${urlObj.protocol}//${urlObj.host}`;
          const isMainWindowSecure = mainSiteUrl.startsWith('https');
          const isTargetSiteSecure = site.startsWith('https');

          for (const cookie of allCookies) {
            try {
              // 设置到主窗口域名（用于存储和管理）
              const mainWindowCookieOptions: any = {
                url: mainSiteUrl,
                name: cookie.name,
                value: cookie.value,
                path: cookie.path || '/',
                httpOnly: false,
                secure: isMainWindowSecure,
                sameSite: 'lax' as const
              };

              if (cookie.expirationDate) {
                mainWindowCookieOptions.expirationDate = cookie.expirationDate;
              }

              await session.defaultSession.cookies.set(mainWindowCookieOptions);

              // 设置到目标站点域名（用于API请求），直接覆盖
              const targetSiteCookieOptions: any = {
                url: site,
                name: cookie.name,
                value: cookie.value,
                path: cookie.path || '/',
                httpOnly: cookie.httpOnly || false,
                secure: isTargetSiteSecure,
                sameSite: isTargetSiteSecure ? 'no_restriction' : 'lax'
              };

              if (cookie.expirationDate) {
                targetSiteCookieOptions.expirationDate = cookie.expirationDate;
              }

              await session.defaultSession.cookies.set(targetSiteCookieOptions);
            } catch (error) {
              console.error(`设置 cookie 失败: ${cookie.name}`, error);
            }
          }
        }
      }

      return { success: true, site };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        site
      };
    }
  }
});

ipcMain.on('clear-site-cookies', async (_, site, sessionId) => {
  if (site && sessionId) {
    try {
      const mainWindowUrl = mainWindow?.webContents.getURL();
      if (mainWindowUrl) {
        const existingCookies = await session.defaultSession.cookies.get({
          url: mainWindowUrl
        });

        for (const cookie of existingCookies) {
          await session.defaultSession.cookies.remove(mainWindowUrl, cookie.name);
        }
      }

      const userKey = `${site}:${sessionId}`;
      sitesCookies.delete(userKey);
    } catch (error) {
      console.error('清理站点 cookie 失败:', error);
    }
  }
});

const setTitleBar = (theme: string) => {
  if (mainWindow && process.platform !== 'darwin') {
    theme === 'dark'
      ? mainWindow.setTitleBarOverlay({
          color: '#00000000',
          symbolColor: '#fff'
        })
      : mainWindow.setTitleBarOverlay({
          color: '#00000000',
          symbolColor: '#000'
        });
  }
};
