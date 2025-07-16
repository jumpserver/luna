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

// 文件系统存储相关
const COOKIES_DIR = path.join(app.getPath('userData'), 'cookies');
const sitesCookies = new Map<string, Electron.Cookie[]>();

// 确保cookies目录存在
const ensureCookiesDir = () => {
  try {
    if (fs.existsSync(COOKIES_DIR)) {
      const stats = fs.statSync(COOKIES_DIR);
      if (!stats.isDirectory()) {
        // 如果存在同名文件，先删除
        fs.unlinkSync(COOKIES_DIR);
        log.info(`Removed existing file at cookies path: ${COOKIES_DIR}`);
      }
    }

    if (!fs.existsSync(COOKIES_DIR)) {
      fs.mkdirSync(COOKIES_DIR, { recursive: true });
      log.info(`Created cookies directory: ${COOKIES_DIR}`);
    }
  } catch (error) {
    log.error('Failed to ensure cookies directory:', error);
    throw error;
  }
};

// 获取cookies文件路径
const getCookiesFilePath = (site: string, sessionId: string): string => {
  const sanitizedSite = site.replace(/[^a-zA-Z0-9.-]/g, '_');
  const fileName = `${sanitizedSite}_${sessionId}.json`;
  return path.join(COOKIES_DIR, fileName);
};

// 保存cookies到文件
const saveCookiesToFile = (
  site: string,
  sessionId: string,
  cookies: Electron.Cookie[]
): boolean => {
  try {
    ensureCookiesDir();

    // 确认目录正确创建
    if (!fs.existsSync(COOKIES_DIR) || !fs.statSync(COOKIES_DIR).isDirectory()) {
      log.error('Cookies directory is not available for saving');
      return false;
    }

    const filePath = getCookiesFilePath(site, sessionId);
    const cookieData = {
      site,
      sessionId,
      cookies,
      timestamp: Date.now(),
      version: 1
    };
    fs.writeFileSync(filePath, JSON.stringify(cookieData, null, 2), 'utf8');
    log.info(`Cookies saved to file: ${filePath}`);
    return true;
  } catch (error) {
    log.error('Failed to save cookies to file:', error);
    return false;
  }
};

// 从文件加载cookies
const loadCookiesFromFile = (site: string, sessionId: string): Electron.Cookie[] | null => {
  try {
    const filePath = getCookiesFilePath(site, sessionId);
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const fileContent = fs.readFileSync(filePath, 'utf8');
    const cookieData = JSON.parse(fileContent);

    // 验证数据结构
    if (cookieData.site === site && cookieData.sessionId === sessionId && cookieData.cookies) {
      log.info(`Cookies loaded from file: ${filePath}`);
      return cookieData.cookies;
    }

    return null;
  } catch (error) {
    log.error('Failed to load cookies from file:', error);
    return null;
  }
};

// 删除cookies文件
const deleteCookiesFile = (site: string, sessionId: string): boolean => {
  try {
    const filePath = getCookiesFilePath(site, sessionId);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      log.info(`Cookies file deleted: ${filePath}`);
      return true;
    }
    return false;
  } catch (error) {
    log.error('Failed to delete cookies file:', error);
    return false;
  }
};

// 获取所有保存的cookies文件信息
const getAllSavedCookies = (): Array<{ site: string; sessionId: string; timestamp: number }> => {
  try {
    ensureCookiesDir();

    // 再次确认目录存在且是目录
    if (!fs.existsSync(COOKIES_DIR)) {
      log.warn('Cookies directory does not exist after ensuring');
      return [];
    }

    const stats = fs.statSync(COOKIES_DIR);
    if (!stats.isDirectory()) {
      log.error('Cookies path exists but is not a directory');
      return [];
    }

    const files = fs.readdirSync(COOKIES_DIR);
    const cookieFiles: Array<{ site: string; sessionId: string; timestamp: number }> = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const filePath = path.join(COOKIES_DIR, file);
          const fileContent = fs.readFileSync(filePath, 'utf8');
          const cookieData = JSON.parse(fileContent);

          if (cookieData.site && cookieData.sessionId) {
            cookieFiles.push({
              site: cookieData.site,
              sessionId: cookieData.sessionId,
              timestamp: cookieData.timestamp || 0
            });
          }
        } catch (error) {
          log.error(`Failed to parse cookies file ${file}:`, error);
        }
      }
    }

    return cookieFiles;
  } catch (error) {
    log.error('Failed to get all saved cookies:', error);
    return [];
  }
};

// 清理cookies目录（如果存在问题）
const cleanupCookiesDir = () => {
  try {
    if (fs.existsSync(COOKIES_DIR)) {
      const stats = fs.statSync(COOKIES_DIR);
      if (!stats.isDirectory()) {
        // 如果是文件，删除它
        fs.unlinkSync(COOKIES_DIR);
        log.info('Removed invalid cookies file');
      } else {
        // 如果是目录，检查是否为空或包含无效文件
        const files = fs.readdirSync(COOKIES_DIR);
        for (const file of files) {
          const filePath = path.join(COOKIES_DIR, file);
          try {
            if (file.endsWith('.json')) {
              // 尝试解析JSON文件
              const content = fs.readFileSync(filePath, 'utf8');
              JSON.parse(content);
            }
          } catch (error) {
            // 删除无效的JSON文件
            fs.unlinkSync(filePath);
            log.info(`Removed invalid cookies file: ${file}`);
          }
        }
      }
    }

    // 确保目录存在
    ensureCookiesDir();
    return true;
  } catch (error) {
    log.error('Failed to cleanup cookies directory:', error);
    return false;
  }
};

// 在应用启动时加载所有保存的cookies
const loadAllSavedCookies = () => {
  try {
    // 首先清理并确保目录正确创建
    cleanupCookiesDir();

    const savedCookies = getAllSavedCookies();

    for (const { site, sessionId } of savedCookies) {
      const cookies = loadCookiesFromFile(site, sessionId);
      if (cookies) {
        const userKey = `${site}:${sessionId}`;
        sitesCookies.set(userKey, cookies);
        log.info(`Loaded cookies for ${userKey} from file`);
      }
    }

    log.info(`Loaded ${savedCookies.length} saved cookie sessions`);
  } catch (error) {
    log.error('Failed to load saved cookies:', error);
  }
};

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
  loadAllSavedCookies(); // 在应用启动时加载所有保存的cookies
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

        // cookies 只设置到主窗口域名，避免第三方cookie警告
        const currentUrl = mainWindow?.webContents.getURL();
        const urlObj = new URL(currentUrl || '');
        const siteUrl = `${urlObj.protocol}//${urlObj.host}`;
        const isMainWindowSecure = siteUrl.startsWith('https');

        // 检查是否为file协议，file协议不支持cookie
        const isFileProtocol = urlObj.protocol === 'file:';

        if (!isFileProtocol) {
          // 只有在非file协议下才设置cookie到本地
          for (const cookie of targetCookies) {
            try {
              // 只设置到主窗口域名（用于存储和管理）
              const mainWindowCookieOptions: any = {
                url: siteUrl,
                name: cookie.name,
                value: cookie.value,
                path: cookie.path || '/',
                httpOnly: false, // 确保不是HttpOnly，避免覆盖错误
                secure: isMainWindowSecure,
                sameSite: 'lax' as const
              };

              if (cookie.expirationDate) {
                mainWindowCookieOptions.expirationDate = cookie.expirationDate;
              }

              await session.defaultSession.cookies.set(mainWindowCookieOptions);
            } catch (error) {
              console.error(`设置 cookie 失败: ${cookie.name}`, error);
            }
          }
        }

        // 设置webRequest拦截器，自动为目标站点请求添加cookie
        // 移除activeInterceptors限制，每次都重新设置以确保使用最新的sessionId
        session.defaultSession.webRequest.onBeforeSendHeaders(
          { urls: [site + '/*'] },
          (details, callback) => {
            if (isFileProtocol) {
              // 在file协议下，使用当前的sessionId获取cookie
              const userKey = `${site}:${jms_sessionid}`;
              const cookies = sitesCookies.get(userKey) || [];
              if (cookies.length > 0) {
                const cookieString = cookies
                  .map(cookie => `${cookie.name}=${cookie.value}`)
                  .join('; ');
                details.requestHeaders['Cookie'] = cookieString;
              }
              callback({ requestHeaders: details.requestHeaders });
            } else {
              // 在http协议下，从localhost获取cookie
              session.defaultSession.cookies
                .get({ url: siteUrl })
                .then(cookies => {
                  if (cookies.length > 0) {
                    const cookieString = cookies
                      .map(cookie => `${cookie.name}=${cookie.value}`)
                      .join('; ');
                    details.requestHeaders['Cookie'] = cookieString;
                  }
                  callback({ requestHeaders: details.requestHeaders });
                })
                .catch(error => {
                  console.error('获取cookie失败:', error);
                  callback({ requestHeaders: details.requestHeaders });
                });
            }
          }
        );

        // 存储cookie集合到内存中，使用site+sessionId作为复合key
        const userKey = `${site}:${jms_sessionid}`;
        sitesCookies.set(userKey, targetCookies);

        // 同时保存到文件系统
        saveCookiesToFile(site, jms_sessionid, targetCookies);

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

  // 先从内存中获取
  let cookies = sitesCookies.get(userKey);

  // 如果内存中没有，尝试从文件加载
  if (!cookies) {
    const filesCookies = loadCookiesFromFile(site, sessionId);
    if (filesCookies) {
      cookies = filesCookies;
      sitesCookies.set(userKey, cookies);
    }
  }

  return cookies || [];
});

// 从session中获取cookies（用于应用重启后恢复）
ipcMain.handle('get-cookies-from-session', async (_, site) => {
  try {
    const cookies = await session.defaultSession.cookies.get({ url: site });
    return cookies;
  } catch (error) {
    console.error('从session获取cookies失败:', error);
    return [];
  }
});

// 保存cookies到内存中和文件系统
ipcMain.handle('save-site-cookies', async (_, { site, sessionId, cookies }) => {
  try {
    const userKey = `${site}:${sessionId}`;
    sitesCookies.set(userKey, cookies);

    // 同时保存到文件系统
    const fileSaveResult = saveCookiesToFile(site, sessionId, cookies);

    return {
      success: true,
      fileSaved: fileSaveResult
    };
  } catch (error) {
    console.error('保存cookies失败:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
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
        // 将cookie存储到内存中，无论什么协议都需要存储
        const userKey = `${site}:${sessionId}`;
        sitesCookies.set(userKey, allCookies);

        // 同时保存到文件系统
        saveCookiesToFile(site, sessionId, allCookies);

        const mainWindowUrl = mainWindow?.webContents.getURL();

        if (mainWindowUrl) {
          const urlObj = new URL(mainWindowUrl);
          const mainSiteUrl = `${urlObj.protocol}//${urlObj.host}`;
          const isMainWindowSecure = mainSiteUrl.startsWith('https');
          const isFileProtocol = urlObj.protocol === 'file:';

          if (!isFileProtocol) {
            // 只有在非file协议下才设置cookie到本地
            for (const cookie of allCookies) {
              try {
                // 只设置到主窗口域名（用于存储和管理）
                const mainWindowCookieOptions: any = {
                  url: mainSiteUrl,
                  name: cookie.name,
                  value: cookie.value,
                  path: cookie.path || '/',
                  httpOnly: false, // 确保不是HttpOnly，避免覆盖错误
                  secure: isMainWindowSecure,
                  sameSite: 'lax' as const
                };

                if (cookie.expirationDate) {
                  mainWindowCookieOptions.expirationDate = cookie.expirationDate;
                }

                await session.defaultSession.cookies.set(mainWindowCookieOptions);
              } catch (error) {
                console.error(`设置 cookie 失败: ${cookie.name}`, error);
              }
            }
          }

          // 设置webRequest拦截器，自动为目标站点请求添加cookie
          // 移除activeInterceptors限制，每次都重新设置以确保使用最新的sessionId
          session.defaultSession.webRequest.onBeforeSendHeaders(
            { urls: [site + '/*'] },
            (details, callback) => {
              if (isFileProtocol) {
                // 在file协议下，使用当前的sessionId获取cookie
                const userKey = `${site}:${jms_sessionid}`;
                const cookies = sitesCookies.get(userKey) || [];
                if (cookies.length > 0) {
                  const cookieString = cookies
                    .map(cookie => `${cookie.name}=${cookie.value}`)
                    .join('; ');
                  details.requestHeaders['Cookie'] = cookieString;
                }
                callback({ requestHeaders: details.requestHeaders });
              } else {
                // 在http协议下，从localhost获取cookie
                session.defaultSession.cookies
                  .get({ url: mainSiteUrl })
                  .then(cookies => {
                    if (cookies.length > 0) {
                      const cookieString = cookies
                        .map(cookie => `${cookie.name}=${cookie.value}`)
                        .join('; ');
                      details.requestHeaders['Cookie'] = cookieString;
                    }
                    callback({ requestHeaders: details.requestHeaders });
                  })
                  .catch(error => {
                    console.error('获取cookie失败:', error);
                    callback({ requestHeaders: details.requestHeaders });
                  });
              }
            }
          );
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

ipcMain.handle('clear-site-cookies', async (_, site, sessionId) => {
  if (site && sessionId) {
    try {
      // 1. 从内存中获取要删除的用户的cookies
      const userKey = `${site}:${sessionId}`;
      const userCookies = sitesCookies.get(userKey) || [];

      // 2. 从内存中删除该用户的cookies数据
      sitesCookies.delete(userKey);

      // 3. 从文件系统中删除该用户的cookies文件
      const fileDeleteResult = deleteCookiesFile(site, sessionId);

      // 4. 如果该用户有cookies，需要从浏览器session中删除这些cookies
      if (userCookies.length > 0) {
        try {
          // 获取当前浏览器session中的所有cookies
          const sessionCookies = await session.defaultSession.cookies.get({ url: site });

          // 比较用户cookies和session cookies，找出需要删除的cookies
          for (const userCookie of userCookies) {
            // 查找session中是否有相同的cookie
            const matchedCookie = sessionCookies.find(
              sessionCookie =>
                sessionCookie.name === userCookie.name &&
                sessionCookie.domain === userCookie.domain &&
                sessionCookie.path === userCookie.path
            );

            if (matchedCookie) {
              // 只删除匹配的cookie
              await session.defaultSession.cookies.remove(site, matchedCookie.name);
            }
          }
        } catch (error) {
          console.error('删除session cookies失败:', error);
        }
      }

      return {
        success: true,
        fileDeleted: fileDeleteResult
      };
    } catch (error: any) {
      console.error('清理站点 cookie 失败:', error);
      return { success: false, error: error.message };
    }
  }
  return { success: false, error: '参数缺失' };
});

// 清理用户拦截器
ipcMain.handle('clear-user-interceptor', async (_, site, sessionId) => {
  if (site && sessionId) {
    try {
      // 清理webRequest拦截器
      session.defaultSession.webRequest.onBeforeSendHeaders(null);

      return { success: true };
    } catch (error: any) {
      console.error('清理用户拦截器失败:', error);
      return { success: false, error: error.message };
    }
  }
  return { success: false, error: '参数缺失' };
});

// 获取所有已保存的cookies信息
ipcMain.handle('get-all-saved-cookies', async () => {
  try {
    const allCookies = getAllSavedCookies();
    return { success: true, data: allCookies };
  } catch (error: any) {
    console.error('获取所有已保存cookies失败:', error);
    return { success: false, error: error.message };
  }
});

// 处理401错误，删除过期账户
ipcMain.handle('handle-401-error', async (_, site, sessionId) => {
  if (site && sessionId) {
    try {
      log.info(`Handling 401 error for ${site}:${sessionId}, removing expired account`);

      // 1. 从内存中删除
      const userKey = `${site}:${sessionId}`;
      sitesCookies.delete(userKey);

      // 2. 从文件系统中删除
      const fileDeleteResult = deleteCookiesFile(site, sessionId);

      // 3. 从浏览器session中清理cookies
      try {
        const sessionCookies = await session.defaultSession.cookies.get({ url: site });
        for (const cookie of sessionCookies) {
          await session.defaultSession.cookies.remove(site, cookie.name);
        }
      } catch (error) {
        console.error('清理session cookies失败:', error);
      }

      return {
        success: true,
        fileDeleted: fileDeleteResult,
        message: '过期账户已删除'
      };
    } catch (error: any) {
      console.error('处理401错误失败:', error);
      return { success: false, error: error.message };
    }
  }
  return { success: false, error: '参数缺失' };
});

// 验证cookies是否有效
ipcMain.handle('validate-cookies', async (_, site, sessionId) => {
  if (site && sessionId) {
    try {
      const userKey = `${site}:${sessionId}`;
      const cookies = sitesCookies.get(userKey) || loadCookiesFromFile(site, sessionId);

      if (!cookies || cookies.length === 0) {
        return { valid: false, reason: 'No cookies found' };
      }

      // 检查cookies是否过期
      const now = Date.now() / 1000;
      const expiredCookies = cookies.filter(
        cookie => cookie.expirationDate && cookie.expirationDate < now
      );

      if (expiredCookies.length > 0) {
        log.info(`Found ${expiredCookies.length} expired cookies for ${site}:${sessionId}`);
        return { valid: false, reason: 'Cookies expired' };
      }

      return { valid: true, cookiesCount: cookies.length };
    } catch (error: any) {
      console.error('验证cookies失败:', error);
      return { valid: false, reason: error.message };
    }
  }
  return { valid: false, reason: '参数缺失' };
});

// 清理cookies目录
ipcMain.handle('cleanup-cookies-directory', async () => {
  try {
    const result = cleanupCookiesDir();
    if (result) {
      // 清理内存中的cookies
      sitesCookies.clear();
      log.info('Cleared all cookies from memory');

      return { success: true, message: 'Cookies directory cleaned successfully' };
    } else {
      return { success: false, error: 'Failed to cleanup cookies directory' };
    }
  } catch (error: any) {
    console.error('清理cookies目录失败:', error);
    return { success: false, error: error.message };
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
