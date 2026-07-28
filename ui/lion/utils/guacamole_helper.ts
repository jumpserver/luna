import * as Guacamole from 'guacamole-common-js-jumpserver/dist/guacamole-common';

const supportImages: any[] = [];
const pendingTests: any[] = [];
const testImages: any = {
  /**
   * Test JPEG image, encoded as base64.
   */
  'image/jpeg':
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoH'
    + 'BwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQME'
    + 'BAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQU'
    + 'FBQUFBQUFBQUFBQUFBT/wAARCAABAAEDAREAAhEBAxEB/8QAFAABAAAAAAAAAAA'
    + 'AAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAA'
    + 'AAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AVMH/2Q==',

  /**
   * Test PNG image, encoded as base64.
   */
  'image/png':
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEX///+nxBvI'
    + 'AAAACklEQVQI12NgAAAAAgAB4iG8MwAAAABJRU5ErkJggg==',

  /**
   * Test WebP image, encoded as base64.
   */
  'image/webp': 'UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA=='
}; // 测试单个图片格式
async function testImageFormat(mimeType: string, base64Data: any): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const image = new Image();

    image.onload = () => {
      // Image format is supported if successfully decoded with correct dimensions
      const isSupported = image.width === 1 && image.height === 1;
      resolve(isSupported);
    };

    image.onerror = () => {
      console.debug(`Format ${mimeType} not supported`);
      resolve(false);
    };

    // Set source to trigger loading
    image.src = `data:${mimeType};base64,${base64Data}`;
  });
}

// Use Object.entries for better iteration over key-value pairs
Object.entries(testImages).forEach(([mimeType, base64Data]) => {
  const imageTest = new Promise<void>((resolve) => {
    const image = new Image();

    // Set up handlers before setting src to avoid race conditions
    image.onload = () => {
      // Image format is supported if successfully decoded with correct dimensions
      if (image.width === 1 && image.height === 1) {
        supportImages.push(mimeType);
      }
      resolve();
    };

    // Handle errors separately for better debugging
    image.onerror = () => {
      console.debug(`Format ${mimeType} not supported`);
      resolve(); // Still resolve to continue testing other formats
    };

    // Set source to trigger loading
    image.src = `data:${mimeType};base64,${base64Data}`;
  });

  pendingTests.push(imageTest);
});

export async function getSupportedImages(): Promise<string[]> {
  // 清空之前的结果
  supportImages.length = 0;

  // 并行测试所有图片格式
  const testPromises = Object.entries(testImages).map(async ([mimeType, base64Data]) => {
    const isSupported = await testImageFormat(mimeType, base64Data);
    if (isSupported) {
      supportImages.push(mimeType);
    }
    return { mimeType, isSupported };
  });

  // 等待所有测试完成
  await Promise.all(testPromises);

  return [...supportImages]; // 返回副本
}
export async function getSupportedGuacVideos(): Promise<string[]> {
  return Guacamole.VideoPlayer.getSupportedTypes();
}

export async function getSupportedGuacAudios(): Promise<string[]> {
  return Guacamole.AudioPlayer.getSupportedTypes();
}

export async function getSupportedGuacMimeTypes(): Promise<string> {
  const supportImages = await getSupportedImages();
  const supportVideos = await getSupportedGuacVideos();
  const supportAudios = await getSupportedGuacAudios();
  let connectString = '';
  supportImages.forEach((mimeType) => {
    connectString += `&GUAC_IMAGE=${encodeURIComponent(mimeType)}`;
  });
  supportVideos.forEach((mimeType) => {
    connectString += `&GUAC_AUDIO=${encodeURIComponent(mimeType)}`;
  });
  supportAudios.forEach((mimeType) => {
    connectString += `&GUAC_VIDEO=${encodeURIComponent(mimeType)}`;
  });
  return connectString;
}
