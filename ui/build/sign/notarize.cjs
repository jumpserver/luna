const { notarize } = require('@electron/notarize');

// 从环境变量中读取必要的信息
const {
  XCODE_APP_LOADER_EMAIL, // Apple ID
  XCODE_APP_LOADER_PASSWORD, // App 专用密码
  XCODE_APP_TEAM_ID, // Team ID
} = process.env;

async function main(context) {
  const { electronPlatformName, appOutDir } = context;

  if (
    electronPlatformName !== 'darwin'
    || !XCODE_APP_LOADER_EMAIL
    || !XCODE_APP_LOADER_PASSWORD
    || !XCODE_APP_TEAM_ID
  ) {
    console.log('Skipping Apple notarization.');
    return;
  }
  console.log('Starting Apple notarization.');
  const appName = context.packager.appInfo.productFilename;

  await notarize({
    appBundleId: 'com.jumpserver.videoplayer',
    appPath: `${appOutDir}/${appName}.app`,
    teamId: XCODE_APP_TEAM_ID,
    appleId: XCODE_APP_LOADER_EMAIL,
    appleIdPassword: XCODE_APP_LOADER_PASSWORD,
    tool: 'notarytool',
  });

  console.log('Finished Apple notarization.');
}

exports.default = main;
