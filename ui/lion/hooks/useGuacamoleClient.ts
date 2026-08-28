import type { MaybeRefOrGetter } from "vue";
import type { LionUploadCustomRequestOptions } from "@/lion/types/upload";
import { useDebounceFn } from "@vueuse/core";

import * as Guacamole from "guacamole-common-js-jumpserver/dist/guacamole-common";
import { computed, nextTick, ref, toValue } from "vue";
import { LUNA_MESSAGE_TYPE } from "@/lion/types/postmessage.type";
import { withLionUrl } from "@/lion/utils/base";
import { readClipboardText, writeClipboardBlob, writeClipboardText } from "@/lion/utils/clipboard";
import { LanguageCode } from "@/lion/utils/config";

import { lunaCommunicator } from "@/lion/utils/lunaBus";
import { ConvertGuacamoleError as convertGuacamoleError, ErrorStatusCodes } from "@/lion/utils/status";

const testImages: Record<string, string> = {
  /**
   * Test JPEG image, encoded as base64.
   */
  "image/jpeg":
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoH" +
    "BwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQME" +
    "BAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQU" +
    "FBQUFBQUFBQUFBQUFBT/wAARCAABAAEDAREAAhEBAxEB/8QAFAABAAAAAAAAAAA" +
    "AAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAA" +
    "AAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AVMH/2Q==",

  /**
   * Test PNG image, encoded as base64.
   */
  "image/png":
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEX///+nxBvI" +
    "AAAACklEQVQI12NgAAAAAgAB4iG8MwAAAABJRU5ErkJggg==",

  /**
   * Test WebP image, encoded as base64.
   */
  "image/webp": "UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA=="
};

async function testImageFormat(mimeType: string, base64Data: string): Promise<boolean> {
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

const FileType = {
  NORMAL: "NORMAL",
  DIRECTORY: "DIRECTORY"
};

export async function getSupportedImages(): Promise<string[]> {
  const results = await Promise.all(
    Object.entries(testImages).map(async ([mimeType, base64Data]) => ({
      mimeType,
      isSupported: await testImageFormat(mimeType, base64Data)
    }))
  );
  return results.filter((result) => result.isSupported).map((result) => result.mimeType);
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
  let connectString = "";
  supportImages.forEach((mimeType) => {
    connectString += `&GUAC_IMAGE=${encodeURIComponent(mimeType)}`;
  });
  supportVideos.forEach((mimeType) => {
    connectString += `&GUAC_VIDEO=${encodeURIComponent(mimeType)}`;
  });
  supportAudios.forEach((mimeType) => {
    connectString += `&GUAC_AUDIO=${encodeURIComponent(mimeType)}`;
  });
  return connectString;
}

let supportedMimeTypesPromise: Promise<Record<string, string[]>> | null = null;

export async function getSupportedMimeTypes(): Promise<Record<string, string[]>> {
  if (!supportedMimeTypesPromise) {
    supportedMimeTypesPromise = Promise.all([getSupportedImages(), getSupportedGuacVideos(), getSupportedGuacAudios()])
      .then(([supportImages, supportVideos, supportAudios]) => ({
        GUAC_IMAGE: supportImages,
        GUAC_VIDEO: supportVideos,
        GUAC_AUDIO: supportAudios
      }))
      .catch((error) => {
        supportedMimeTypesPromise = null;
        throw error;
      });
  }
  return await supportedMimeTypesPromise;
}

const sanitizeFilename = (filename: string) => {
  return filename.replace(/[\\/]+/g, "_");
};

const withErrorDetails = (message: string, details: Record<string, any> = {}) => {
  return Object.assign(new Error(message), details);
};

interface GuacamoleFile {
  mimetype?: any;
  streamName?: any;
  type: "DIRECTORY" | "FILE";
  name: string;
  parent?: GuacamoleFile | null;
  is_dir?: boolean;
}

interface ClipboardPolicyItem {
  enabled?: boolean;
  text_limit?: number;
  file_size_limit?: number;
}

interface ClipboardPolicy {
  copy?: ClipboardPolicyItem;
  paste?: ClipboardPolicyItem;
}

const BYTES_PER_MEGABYTE = 1024 * 1024;
const getTextLength = (text: string) => Array.from(text).length;
const canCaptureAudio = () => {
  if (typeof navigator === "undefined") return false;

  const mediaNavigator = navigator as Navigator &
    Record<"getUserMedia" | "webkitGetUserMedia" | "mozGetUserMedia" | "msGetUserMedia", unknown>;
  return (
    typeof mediaNavigator.mediaDevices?.getUserMedia === "function" ||
    typeof mediaNavigator.getUserMedia === "function" ||
    typeof mediaNavigator.webkitGetUserMedia === "function" ||
    typeof mediaNavigator.mozGetUserMedia === "function" ||
    typeof mediaNavigator.msGetUserMedia === "function"
  );
};

export function useGuacamoleClient(
  t: any,
  endpointUrl?: MaybeRefOrGetter<string>,
  requestAuth?: MaybeRefOrGetter<{ ticket?: string; token?: string }>
) {
  const toast = useToast();
  const { addErrorToast } = useErrorToast();
  const message = {
    info: (text: string) => toast.add({ title: text, color: "info" }),
    success: (text: string) => toast.add({ title: text, color: "success" }),
    warning: (text: string) => toast.add({ title: text, color: "warning" }),
    error: (text: string, _opts?: { duration?: number }) => addErrorToast({ title: text })
  };
  const guaClient = ref<any>(null);
  const guaTunnel = ref<any>(null);
  const guaDisplay = ref<any>(null);
  const fsObject = ref<any>(null);
  const driverName = ref<string>("");
  const connectStatus = ref("Connecting");
  const sessionObject = ref<any>({});
  const action_permission = ref<any>({});
  const enableShare = ref(false);
  const hasClipboardPermission = ref(false);
  const currentUser = ref<any>({});
  const shareId = ref<string | null>(null);
  const onlineUsersMap = ref<Record<string, any>>({});
  const warningIntervalId = ref<number | null>(null);
  const loading = ref(true);
  const scale = ref(1);
  const currentWidth = ref(window.innerWidth);
  const currentHeight = ref(window.innerHeight);
  const pixelDensity = 1;
  const sink = new Guacamole.InputSink();
  const keyboard = new Guacamole.Keyboard();
  const pressedKeys = ref<Set<number>>(new Set());
  const isRemoteApp = ref<boolean>(false);
  const isHttpProtocol = ref<boolean>(false);
  const remoteClipboardText = ref<string>("");
  const clipboardPasteTextLimit = computed(() => getClipboardTextLimit("paste"));
  let connectGeneration = 0;
  let inputCleanup: (() => void) | null = null;
  let keyboardListening = false;
  const currentFolderFiles = ref<any>([]);
  const current_files = ref<any>({});
  const currentFolder = ref<GuacamoleFile | null>(null);
  const currentFolderObject = ref<any>(null);
  const fileFsLoading = ref(false);
  const enableFilesystem = ref(false);
  const currentGuacFsObject = ref<any>(null);
  const getApiUrl = (path: string) => {
    const url = new URL(withLionUrl(`/api${path}`, toValue(endpointUrl) || window.location.origin));
    const auth = requestAuth ? toValue(requestAuth) : undefined;
    if (auth?.ticket) url.searchParams.set("ticket", auth.ticket);
    if (auth?.token) url.searchParams.set("token", auth.token);
    return url.toString();
  };

  function disconnectGuaclient() {
    connectGeneration += 1;
    if (warningIntervalId.value !== null) {
      window.clearInterval(warningIntervalId.value);
      warningIntervalId.value = null;
    }
    inputCleanup?.();
    inputCleanup = null;
    keyboard.reset();
    pressedKeys.value.clear();
    const client = guaClient.value;
    const tunnel = guaTunnel.value;
    const display = guaDisplay.value;
    guaClient.value = null;
    guaTunnel.value = null;
    guaDisplay.value = null;
    if (client) {
      client.onstatechange = null;
      client.onerror = null;
      client.onclipboard = null;
      client.onfile = null;
      client.onfilesystem = null;
      client.disconnect();
    }
    if (tunnel) {
      tunnel.onerror = null;
      tunnel.oninstruction = null;
    }
    if (display) display.onresize = null;
    display?.getElement()?.remove();
    loading.value = false;
  }

  function connectToGuacamole(
    wsUrl: string,
    connectParams: Record<string, any>,
    width: any,
    height: any,
    supportFs: boolean = false
  ) {
    disconnectGuaclient();
    const generation = connectGeneration;
    loading.value = true;
    currentWidth.value = width || window.innerWidth;
    currentHeight.value = height || window.innerHeight;

    const tunnel = new Guacamole.WebSocketTunnel(wsUrl);
    tunnel.receiveTimeout = 60 * 1000; // Set receive timeout to 60 seconds
    const client = new Guacamole.Client(tunnel);

    tunnel.onerror = () => {
      loading.value = false;
      message.error(t("WebSocketError"));
    };
    tunnel.onuuid = (uuid: string) => {
      tunnel.uuid = uuid;
    };

    const oninstruction = tunnel.oninstruction;
    tunnel.oninstruction = (opcode: any, argv: any) => {
      if (oninstruction) {
        oninstruction(opcode, argv);
      }
      if (opcode === "jms_event") {
        onJmsEvent(argv[0], argv[1]);
      }
    };
    if (supportFs) {
      client.onfilesystem = onFileSystem;
      client.onfile = clientFileReceived;
    }

    client.onstatechange = clientStateChanged;
    client.onerror = onClientError;
    client.onclipboard = onclipboard;
    const display = client.getDisplay();
    // Guacamole places its canvases at z-index -1. Keep them above workspace backgrounds
    // without changing the relative stacking order of Guacamole's internal layers.
    display.getElement().style.isolation = "isolate";
    display.onresize = updateScale;
    display.showCursor(false);
    guaDisplay.value = display;
    guaClient.value = client;
    guaTunnel.value = tunnel;
    const queryParams = new URLSearchParams(connectParams);
    if (width) {
      queryParams.append("GUAC_WIDTH", width.toString());
    }
    if (height) {
      queryParams.append("GUAC_HEIGHT", height.toString());
    }
    const optimalDpi = pixelDensity * 96;
    queryParams.append("GUAC_DPI", optimalDpi.toString());
    getSupportedMimeTypes()
      .then((mimeTypes: Record<string, string[]>) => {
        // add supported mime types to query params
        Object.entries(mimeTypes).forEach(([key, values]) => {
          values.forEach((value) => {
            queryParams.append(key, value);
          });
        });
      })
      .finally(() => {
        if (generation !== connectGeneration) return;
        client.connect(queryParams.toString());
      });
  }

  function getClipboardPolicyItem(direction: "copy" | "paste"): ClipboardPolicyItem | null {
    const policy = action_permission.value?.clipboard_policy as ClipboardPolicy | undefined;
    return policy?.[direction] || null;
  }

  function getClipboardTextLimit(direction: "copy" | "paste") {
    const limit = Number(getClipboardPolicyItem(direction)?.text_limit || 0);
    return Number.isFinite(limit) && limit > 0 ? limit : 0;
  }

  function getClipboardFileSizeLimit(direction: "copy" | "paste") {
    const limit = Number(getClipboardPolicyItem(direction)?.file_size_limit || 0);
    return Number.isFinite(limit) && limit > 0 ? limit : 0;
  }

  function canUseClipboardDirection(direction: "copy" | "paste") {
    return Boolean(direction === "copy" ? action_permission.value?.enable_copy : action_permission.value?.enable_paste);
  }

  function isClipboardDirectionDeniedByPolicy(direction: "copy" | "paste") {
    return getClipboardPolicyItem(direction)?.enabled === false;
  }

  function showClipboardPermissionWarning(direction: "copy" | "paste") {
    if (isClipboardDirectionDeniedByPolicy(direction)) {
      message.warning(t(direction === "copy" ? "ClipboardCopyDeniedByPolicy" : "ClipboardPasteDeniedByPolicy"));
      return;
    }
    message.warning(`${t(direction === "copy" ? "Copy" : "Paste")} ${t("NoPermission")}`);
  }

  function validateClipboardText(direction: "copy" | "paste", text: string) {
    if (isClipboardDirectionDeniedByPolicy(direction) || !canUseClipboardDirection(direction)) {
      showClipboardPermissionWarning(direction);
      return false;
    }
    const limit = getClipboardTextLimit(direction);
    if (limit > 0 && getTextLength(text) > limit) {
      message.warning(`${t(direction === "copy" ? "Copy" : "Paste")} ${t("ClipboardTextLimitExceeded")}: ${limit}`);
      return false;
    }
    return true;
  }

  function validateClipboardBlob(direction: "copy" | "paste", size: number) {
    if (isClipboardDirectionDeniedByPolicy(direction) || !canUseClipboardDirection(direction)) {
      showClipboardPermissionWarning(direction);
      return false;
    }
    const limit = getClipboardFileSizeLimit(direction);
    if (limit > 0 && size > limit * BYTES_PER_MEGABYTE) {
      message.warning(`${t(direction === "copy" ? "Copy" : "Paste")} ${t("ClipboardFileSizeLimitExceeded")}: ${limit}`);
      return false;
    }
    return true;
  }

  function sendTextToRemote(text: string) {
    if (!validateClipboardText("paste", text)) return;
    const data = {
      type: "text/plain",
      data: text
    };
    if (!guaClient.value) {
      console.warn("Guacamole client is not initialized yet.");
      return;
    }
    let writer: any = null;
    const stream = guaClient.value.createClipboardStream(data.type);
    // Send data as a string if it is stored as a string
    if (typeof data.data === "string") {
      writer = new Guacamole.StringWriter(stream);
      writer.sendText(data.data);
      writer.sendEnd();
    } else {
      // Write File/Blob asynchronously
      writer = new Guacamole.BlobWriter(stream);
      writer.oncomplete = function clipboardSent() {
        writer.sendEnd();
      };
      // Begin sending data
      writer.sendBlob(data.data);
    }
  }

  const debouncedSendClipboardToRemote = useDebounceFn(async () => {
    try {
      const text = await readClipboardText();
      if (text?.trim()) sendTextToRemote(text);
    } catch (error) {
      console.debug("Unable to read local clipboard", error);
    }
  }, 300);

  const registerMouseAndKeyboardHandler = () => {
    const client = guaClient.value as any;
    if (!client || !client.getDisplay) {
      return console.warn("Guacamole client is not initialized or does not support mouse and keyboard events");
    }
    inputCleanup?.();
    inputCleanup = null;
    const mouse = registerMouse(client);
    const touchScreen = registerTouchScreen(client);

    registerKeyboard(client);
    const display = client.getDisplay();
    const displayEl = display.getElement();

    const handleMouseEnter = () => {
      document.body.focus();
      display.showCursor(false);
      nextTick(() => {
        sink.focus();
      });
    };
    const handleMouseLeave = () => {
      nextTick(() => {
        keyboard.reset();
      });
    };
    displayEl.addEventListener("mouseenter", handleMouseEnter);
    displayEl.addEventListener("mouseleave", handleMouseLeave);
    inputCleanup = () => {
      displayEl.removeEventListener("mouseenter", handleMouseEnter);
      displayEl.removeEventListener("mouseleave", handleMouseLeave);
      keyboard.reset();
      keyboard.onkeydown = null;
      keyboard.onkeyup = null;
      if (mouse) {
        mouse.onmousedown = null;
        mouse.onmouseup = null;
        mouse.onmousemove = null;
        mouse.onmouseout = null;
      }
      if (touchScreen) {
        touchScreen.onmousedown = null;
        touchScreen.onmousemove = null;
        touchScreen.onmouseup = null;
      }
    };
  };

  const resizeGuaScale = useDebounceFn((width: number, height: number) => {
    currentWidth.value = width || window.innerWidth;
    currentHeight.value = height || window.innerHeight;
    updateScale();
  }, 300);

  const sendGuaSize = (width: number, height: number) => {
    if (guaClient.value && guaDisplay.value) {
      guaClient.value.sendSize(width, height);
    }
  };
  function updateScale() {
    if (!guaDisplay.value || !guaClient.value) {
      console.warn("Guacamole display is not initialized yet.");
      return;
    }
    const w = guaDisplay.value.getWidth();
    const h = guaDisplay.value.getHeight();

    if (h === 0 || w === 0) {
      return 1;
    }
    const newScale = Math.min(currentWidth.value / w, currentHeight.value / h);
    if (newScale !== scale.value) {
      scale.value = newScale;
      guaDisplay.value.scale(newScale);
    }
  }

  function onJmsEvent(event: any, data: any) {
    let dataObj: any;
    try {
      dataObj = typeof data === "string" ? JSON.parse(data) : data;
    } catch (error) {
      console.warn("Ignored malformed JMS event payload", event, error);
      return;
    }
    if (!dataObj || typeof dataObj !== "object") return;
    switch (event) {
      case "session_pause": {
        const msg = `${dataObj.user} ${t("PauseSession")}`;
        message.info(msg);
        break;
      }
      case "session_resume": {
        const msg = `${dataObj.user} ${t("ResumeSession")}`;
        message.info(msg);
        break;
      }
      case "session": {
        sessionObject.value = dataObj;
        const protocol = String(dataObj.protocol || "");
        isHttpProtocol.value = protocol.toLowerCase().includes("http");
        const action = dataObj.action_permission || {};
        action_permission.value = dataObj.action_permission || {};
        enableShare.value = action_permission.value.enable_share || false;
        hasClipboardPermission.value = action.enable_copy || action.enable_paste;
        isRemoteApp.value = dataObj.remote_app;
        break;
      }
      case "current_user": {
        currentUser.value = dataObj;
        shareId.value = dataObj.share_id || null;
        break;
      }
      case "share_join": {
        if (dataObj.primary) {
          break;
        }
        const joinMsg = `${dataObj.user} ${t("JoinShare")}`;
        message.info(joinMsg);
        break;
      }
      case "share_exit": {
        const leaveMsg = `${dataObj.user} ${t("LeaveShare")}`;
        message.info(leaveMsg);
        break;
      }
      case "share_users": {
        onlineUsersMap.value = dataObj;
        break;
      }
      case "perm_expired": {
        const warningMsg = `${t("PermissionExpired")}: ${dataObj.detail}`;
        message.warning(warningMsg);
        if (warningIntervalId.value !== null) window.clearInterval(warningIntervalId.value);
        warningIntervalId.value = window.setInterval(() => {
          message.warning(warningMsg);
        }, 1000 * 31);
        break;
      }
      case "perm_valid": {
        if (warningIntervalId.value) {
          window.clearInterval(warningIntervalId.value);
          warningIntervalId.value = null;
        }
        message.success(t("PermissionValid"));
        break;
      }
      default:
        break;
    }
  }
  // 禁用 组合键
  const commandKeySym = 65511;
  const controlKeySym = 65507;
  const BLOCKED_KEY_COMBINATIONS = [
    [65511, 112], // command + p
    [65511, 117], // command + u
    [65511, 105], // command + i
    [65511, 107], // command + k
    [65511, 108], // command + l
    [65511, 120], // command + x
    [65511, 65505, 112], // command + shift + p
    [65511, 65505, 80], // command + shift + p 中文输入下
    [65507, 65511, 109], // control + command + m
    [65507, 65511, 65505, 109], // control + command + shift + m
    [65511, 80] // command + shift + p 中文输入下
  ];
  // 禁用 组合键 control + n
  const HttpBlockedKeys = [
    [65507, 104], // control + h
    [65507, 106], // control + j
    [65507, 110], // control + n
    [65507, 116], // control + t
    [65507, 117], // control + u
    // [65507, 65505, 80], // control+shift + p
    [65507, 65505, 79], // control+shift + o
    [65507, 65505, 78] // control+shift + n
  ];
  const isBlockedCombination = (keysym: number): boolean => {
    if (!isRemoteApp.value) {
      return false;
    }
    if (pressedKeys.value.size < 1) {
      return false;
    }
    const allPressedKeys = Array.from(pressedKeys.value).concat(keysym);
    if (pressedKeys.value.has(commandKeySym)) {
      for (const combination of BLOCKED_KEY_COMBINATIONS) {
        if (combination.every((key) => allPressedKeys.includes(key))) {
          return true;
        }
      }
    }

    if (isHttpProtocol.value && pressedKeys.value.has(controlKeySym)) {
      for (const combination of HttpBlockedKeys) {
        if (combination.every((key) => allPressedKeys.includes(key))) {
          return true;
        }
      }
    }
    return false;
  };
  function registerKeyboard(client: any) {
    if (!client || !client.getDisplay) {
      console.warn("Guacamole client is not initialized or does not support keyboard events");
      return;
    }
    const display = client.getDisplay();
    if (!display) {
      console.warn("Guacamole display is not available");
      return;
    }
    if (!keyboardListening) {
      keyboard.listenTo(sink.getElement());
      keyboardListening = true;
    }

    keyboard.onkeydown = (keysym: any) => {
      if (isBlockedCombination(keysym)) {
        console.warn("Keydown Blocked key combination detected:", keysym);
        return;
      }
      pressedKeys.value.add(keysym);
      client.sendKeyEvent(1, keysym);
      lunaCommunicator.sendLuna(LUNA_MESSAGE_TYPE.KEYBOARDEVENT, "");
    };
    keyboard.onkeyup = (keysym: any) => {
      if (keysym !== commandKeySym && isBlockedCombination(keysym)) {
        console.warn("Keyup Blocked key combination detected:", keysym);
        return;
      }
      pressedKeys.value.delete(keysym);
      client.sendKeyEvent(0, keysym);
    };
    display.getElement().appendChild(sink.getElement());
  }

  function registerTouchScreen(client: any) {
    if (!client || !client.getDisplay) {
      console.warn("Guacamole client is not initialized or does not support screen events");
      return null;
    }
    const display = client.getDisplay();
    if (!display) {
      console.warn("Guacamole display is not available");
      return null;
    }
    const touchScreen = new Guacamole.Mouse.Touchscreen(display.getElement());
    const handleEmulatedMouseDown = (mouseState: any) => {
      // Emulate mouse down event
      if (!client || !display) {
        return;
      }
      lunaCommunicator.sendLuna(LUNA_MESSAGE_TYPE.MOUSE_EVENT, "");
      // Send mouse state, show cursor if necessary
      display.showCursor(true);
      sendScaledMouseState(client, mouseState);
    };

    const handleEmulatedMouseState = (mouseState: any) => {
      // Emulate mouse move/up event
      if (!client || !display) {
        return;
      }
      lunaCommunicator.sendLuna(LUNA_MESSAGE_TYPE.MOUSE_EVENT, "");
      // Send mouse state, hide cursor if necessary
      display.showCursor(true);
      sendScaledMouseState(client, mouseState);
    };
    touchScreen.onmousedown = handleEmulatedMouseDown;
    touchScreen.onmousemove = touchScreen.onmouseup = handleEmulatedMouseState;
    return touchScreen;
  }

  function sendScaledMouseState(client: any, mouseState: any) {
    const display = client.getDisplay();
    const scaledState = new Guacamole.Mouse.State(
      mouseState.x / display.getScale(),
      mouseState.y / display.getScale(),
      mouseState.left,
      mouseState.middle,
      mouseState.right,
      mouseState.up,
      mouseState.down
    );
    client.sendMouseState(scaledState);
  }

  const sendKeyEvent = (released: number, keysym: number) => {
    if (!guaClient.value) {
      console.warn("Guacamole client is not initialized yet.");
      return;
    }

    guaClient.value.sendKeyEvent(released, keysym);
  };

  function registerMouse(client: any) {
    if (!client || !client.getDisplay) {
      console.warn("Guacamole client is not initialized or does not support mouse events");
      return null;
    }
    const display = client.getDisplay();
    if (!display) {
      console.warn("Guacamole display is not available");
      return null;
    }
    const sendMouseState = (mouseState: any) => {
      sendScaledMouseState(client, mouseState);
    };
    const mouse = new Guacamole.Mouse(display.getElement());
    mouse.onmousedown =
      mouse.onmouseup =
      mouse.onmousemove =
        (mouseState: any) => {
          // Send mouse state, hide cursor if necessary
          sendMouseState(mouseState);
        };
    mouse.onmouseout = (_mouseState: any) => {
      // Send mouse state, hide cursor if necessary
      display.showCursor(false);
    };
    return mouse;
  }

  function onClientError(status: any) {
    console.error("Guacamole client error:", status);
    loading.value = false;
    const code = status.code;
    let msg = status.message || t("UnknownError");
    const currentLang = LanguageCode;
    msg = ErrorStatusCodes[code]
      ? t(ErrorStatusCodes[code], { PLACEHOLDER: status.message })
      : t(convertGuacamoleError(status.message), { PLACEHOLDER: status.message });
    switch (code) {
      case 1005:
        // 管理员终断会话，特殊处理
        if (currentLang === "cn") {
          msg = `${status.message} ${msg}`;
        } else {
          msg = `${msg} ${status.message}`;
        }
        break;
      case 1003:
      case 1010:
        msg = msg.replace("{PLACEHOLDER}", status.message);
        break;
      case 1006:
        msg = `${msg}: ${status.message}`;
        break;
    }
    message.error(msg, { duration: 10000 });
  }

  function clientStateChanged(state: any) {
    switch (state) {
      case 0:
        connectStatus.value = "IDLE";
        break;
      case 1:
        connectStatus.value = "Connecting";
        break;
      case 2:
        connectStatus.value = "Connected + waiting";
        break;
      case 3:
        connectStatus.value = "Connected";
        loading.value = false;
        requestAudioStream(guaClient.value);
        break;
      case 4:
        connectStatus.value = "Disconnecting";
        loading.value = false;
        break;
      case 5:
        connectStatus.value = "Disconnected";
        loading.value = false;
        lunaCommunicator.sendLuna(LUNA_MESSAGE_TYPE.CLOSE, "");
        guaDisplay.value?.getElement()?.remove();
        break;
    }
  }

  function onFileSystem(obj: any, name: any) {
    if (!obj || !Guacamole.Object) {
      console.warn("Guacamole file system object or name is not provided.");
      return;
    }

    enableFilesystem.value = true;
    fsObject.value = obj;
    currentFolderObject.value = obj;
    driverName.value = t(name);
    currentGuacFsObject.value = obj;
    const defaultFolder: GuacamoleFile = {
      mimetype: Guacamole.Object.STREAM_INDEX_MIMETYPE,
      streamName: Guacamole.Object.ROOT_STREAM,
      type: "DIRECTORY",
      is_dir: true,
      name: t(name),
      parent: null
    };
    currentFolder.value = defaultFolder;
    handleFolderOpen(defaultFolder);
  }

  function requestAudioStream(client: any) {
    if (!client || !client.createAudioStream) {
      console.warn("Guacamole client is not initialized or does not support audio stream");
      return;
    }
    if (!canCaptureAudio()) return;

    const AUDIO_INPUT_MIMETYPE = "audio/L16;rate=44100,channels=2";
    const audioStream = client.createAudioStream(AUDIO_INPUT_MIMETYPE);
    const recorder = Guacamole.AudioRecorder.getInstance(audioStream, AUDIO_INPUT_MIMETYPE);
    if (!recorder) {
      audioStream.sendEnd();
      return;
    }
    recorder.onclose = () => {
      if (guaClient.value === client) requestAudioStream(client);
    }; // 重新请求音频流
  }

  function handleFolderOpen(row: any) {
    if (!row || !row.is_dir) {
      console.warn("Cannot open folder, row is not a directory:", row);
      return;
    }
    currentFolder.value = row;
    currentFolderObject.value = row;
    fileFsLoading.value = true;
    RefreshFileSystem(currentGuacFsObject.value, row)
      .then((files: any) => {
        current_files.value = files;
        currentFolderFiles.value = [] as GuacamoleFile[];
        for (const fileName in files) {
          currentFolderFiles.value.push({
            name: fileName,
            is_dir: files[fileName].type === "DIRECTORY",
            mimetype: files[fileName].mimetype,
            streamName: files[fileName].streamName,
            parent: row
          });
        }
        currentFolderFiles.value.sort((a: GuacamoleFile, b: GuacamoleFile) => {
          if (a.is_dir && !b.is_dir) {
            return -1; // Directories first
          } else if (!a.is_dir && b.is_dir) {
            return 1; // Files after directories
          }
          return a.name.localeCompare(b.name); // Sort alphabetically
        });
      })
      .catch((error: any) => {
        console.error("Error refreshing folder:", error);
        message.error(`${t("FileSystemError")}: ${error.message}`);
      })
      .finally(() => {
        fileFsLoading.value = false;
      });
  }

  function clientFileReceived(stream: any, _mimetype: any, filename: any) {
    // Build download URL
    const uuid = guaTunnel.value?.uuid || "";
    const url = getApiUrl(
      `/tunnels/${encodeURIComponent(uuid)}/streams/${encodeURIComponent(stream.index)}/${encodeURIComponent(
        sanitizeFilename(filename)
      )}`
    );

    // Create temporary hidden iframe to facilitate download
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.border = "none";
    iframe.style.width = "1px";
    iframe.style.height = "1px";
    iframe.style.left = "-1px";
    iframe.style.top = "-1px";

    // The iframe MUST be part of the DOM for the download to occur
    document.body.appendChild(iframe);

    // Automatically remove iframe from DOM when download completes, if
    // browser supports tracking of iframe downloads via the "load" event
    iframe.onload = function downloadComplete() {
      document.body.removeChild(iframe);
    };

    // Acknowledge (and ignore) any received blobs
    stream.onblob = function acknowledgeData() {
      stream.sendAck("OK", Guacamole.Status.Code.SUCCESS);
    };

    // Automatically remove iframe from DOM a few seconds after the stream
    // ends, in the browser does NOT fire the "load" event for downloads
    stream.onend = function downloadComplete() {
      window.setTimeout(() => {
        if (iframe.parentElement) {
          document.body.removeChild(iframe);
        }
      }, 500);
    };
    // Begin download
    iframe.src = url;
  }

  const uploadGuacamoleFile = (
    file: any,
    object: any,
    streamName: any,
    progressCallback: CallableFunction
  ): Promise<void> => {
    const client = guaClient.value;
    const tunnel = guaTunnel.value;
    if (!client || !tunnel) {
      return Promise.reject(new Error("Guacamole client or tunnel is not initialized"));
    }
    const uuid = tunnel.uuid;
    const stream = object.createOutputStream(file.type, streamName);
    return new Promise<void>((resolve, reject) => {
      stream.onack = function beginUpload(status: any) {
        // Notify of any errors from the Guacamole server
        if (status.isError()) {
          reject(withErrorDetails(status.message || "Guacamole server rejected upload", { status }));
          return;
        }
        const uploadToStream = function uploadStream(
          tunnelId: any,
          stream: any,
          file: any,
          progressCallback: CallableFunction
        ) {
          // Build upload URL
          const url = getApiUrl(
            `/tunnels/${encodeURIComponent(tunnelId)}/streams/${encodeURIComponent(stream.index)}/${encodeURIComponent(
              sanitizeFilename(file.name)
            )}`
          );
          const xhr = new XMLHttpRequest();
          xhr.withCredentials = true;
          // Invoke provided callback if upload tracking is supported
          if (progressCallback && xhr.upload) {
            xhr.upload.addEventListener("progress", (e) => {
              progressCallback(e);
            });
          }
          // Resolve/reject promise once upload has stopped
          xhr.onreadystatechange = () => {
            // Ignore state changes prior to completion
            if (xhr.readyState !== 4) {
              return;
            }
            // Resolve if HTTP status code indicates success
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else if (xhr.getResponseHeader("Content-Type") === "application/json") {
              try {
                const error = JSON.parse(xhr.responseText);
                reject(withErrorDetails(error.message || "Upload failed", { status: xhr.status }));
              } catch {
                reject(withErrorDetails("Failed to parse error response", { status: xhr.status }));
              }
            } else if (xhr.status >= 400 && xhr.status < 500) {
              reject(withErrorDetails(xhr.responseText || "Upload failed", { status: xhr.status }));
            } else {
              reject(withErrorDetails(`Upload failed with status ${xhr.status}`, { status: xhr.status }));
            }
          };
          // Perform upload
          xhr.open("POST", url, true);
          const fd = new FormData();
          fd.append("file", file);
          xhr.send(fd);
        };
        // Begin upload
        uploadToStream(uuid, stream, file, progressCallback);
        // Ignore all further acks
        stream.onack = null;
      };
    });
  };

  const uploadFile = async (options: LionUploadCustomRequestOptions, folder: GuacamoleFile) => {
    // 参数验证
    if (!options || !options.file) {
      const error = new Error("Upload options or file is missing");
      console.error("Upload failed:", error.message);
      message.error(`${t("FileUploadError")}: ${error.message}`);
      throw error;
    }

    if (!folder || !folder.streamName) {
      const error = new Error("Target folder is invalid or missing stream name");
      console.error("Upload failed:", error.message);
      message.error(`${t("FileUploadError")}: ${error.message}`);
      throw error;
    }

    // Guacamole 客户端验证
    if (!guaClient.value) {
      const error = new Error("Guacamole client is not initialized");
      console.error("Upload failed:", error.message);
      message.error(t("GuacamoleClientNotInitialized"));
      throw error;
    }

    // 文件系统对象验证
    if (!currentGuacFsObject.value) {
      const error = new Error("Guacamole file system object is not available");
      console.error("Upload failed:", error.message);
      message.error(`${t("FileSystemError")}: ${error.message}`);
      throw error;
    }

    const file = options.file;
    const { onFinish, onError } = options;

    // 文件名验证
    if (!file.name || file.name.trim() === "") {
      const error = new Error("File name is empty or invalid");
      console.error("Upload failed:", error.message);
      message.error(`${t("FileUploadError")}: ${error.message}`);
      throw error;
    }

    const streamName = `${folder.streamName}/${sanitizeFilename(file.name).replace(/:+/g, "_")}`;

    const progressCallback = (e: any) => {
      if (e.lengthComputable && e.total > 0) {
        options.file.percentage = Math.min(99, (e.loaded / e.total) * 100);
      }
    };

    try {
      await uploadGuacamoleFile(file.file, currentGuacFsObject.value, streamName, progressCallback);
      onFinish?.();
      file.percentage = 100;
    } catch (error) {
      console.error("Error uploading file:", error);
      onError?.();
      throw error; // 重新抛出异常，让调用者知道上传失败
    }
  };
  function onclipboard(stream: object, mimetype: string) {
    let reader: any = null;
    // If the received data is text, read it as a simple string
    if (/^text\//.test(mimetype)) {
      reader = new Guacamole.StringReader(stream);

      // Assemble received data into a single string
      let data = "";
      reader.ontext = (text: any) => {
        data += text;
      };

      // Set clipboard contents once stream is finished
      reader.onend = async () => {
        if (!validateClipboardText("copy", data)) return;
        remoteClipboardText.value = data;
        try {
          await writeClipboardText(data);
        } catch (error) {
          console.debug("Unable to write local clipboard", error);
        }
      };
    } else {
      // Otherwise read the clipboard data as a Blob
      reader = new Guacamole.BlobReader(stream, mimetype);
      reader.onend = async () => {
        const blob = reader.getBlob();
        if (!validateClipboardBlob("copy", blob.size)) return;
        try {
          await writeClipboardBlob(blob);
        } catch (error) {
          console.debug("Unable to write binary clipboard data", error);
        }
      };
    }
  }

  function RefreshFileSystem(guacFsObject: any, file: GuacamoleFile): Promise<Record<string, GuacamoleFile>> {
    if (!guacFsObject || !guacFsObject.requestInputStream || !file) {
      return Promise.reject(new Error("Guacamole guacFsObject is not initialized"));
    }
    return new Promise<Record<string, GuacamoleFile>>((resolve, reject) => {
      // Do not attempt to refresh the contents of directories
      if (file.mimetype !== Guacamole.Object.STREAM_INDEX_MIMETYPE) {
        reject(new Error(`Cannot refresh contents of file: ${file.name}`));
        return;
      }
      // Request contents of given file
      guacFsObject.requestInputStream(file.streamName, (stream: any, mimetype: any) => {
        // Ignore stream if mimetype is wrong
        if (mimetype !== Guacamole.Object.STREAM_INDEX_MIMETYPE) {
          stream.sendAck("Unexpected mimetype", Guacamole.Status.Code.UNSUPPORTED);
          reject(new Error(`Unexpected mimetype: ${mimetype} for file: ${file.name}`));
          return;
        }

        // Signal server that data is ready to be received
        stream.sendAck("Ready", Guacamole.Status.Code.SUCCESS);

        // Read stream as JSON
        const reader = new Guacamole.JSONReader(stream);

        // Acknowledge received JSON blobs
        reader.onprogress = function onprogress() {
          stream.sendAck("Received", Guacamole.Status.Code.SUCCESS);
        };

        // Reset contents of directory
        reader.onend = function jsonReady() {
          // Empty contents
          const files: any = {};

          // Determine the expected filename prefix of each stream
          let expectedPrefix = file.streamName;
          if (expectedPrefix.charAt(expectedPrefix.length - 1) !== "/") {
            expectedPrefix += "/";
          }

          // For each received stream name
          const mimetypes = reader.getJSON();
          for (const name in mimetypes) {
            // Assert prefix is correct
            if (name.substring(0, expectedPrefix.length) !== expectedPrefix) {
              continue;
            }

            // Extract filename from stream name
            const filename = name.substring(expectedPrefix.length);
            // Deduce type from mimetype
            let type = FileType.NORMAL;
            if (mimetypes[name] === Guacamole.Object.STREAM_INDEX_MIMETYPE) {
              type = FileType.DIRECTORY;
            }

            // Add file entry
            files[filename] = {
              mimetype: mimetypes[name],
              streamName: name,
              type,
              parent: file,
              name: filename
            };
          }
          resolve(files);
        };
        reader.onerror = function jsonError(error: any) {
          reject(withErrorDetails("Error reading JSON from Guacamole stream", { cause: error }));
        };
      });
    });
  }

  const sendInputActive = () => {
    if (!guaTunnel.value) {
      return;
    }
    guaTunnel.value.sendMessage("INPUT_ACTIVE");
  };

  return {
    guaClient,
    guaTunnel,
    guaDisplay,
    connectToGuacamole,
    connectStatus,
    sessionObject,
    action_permission,
    enableShare,
    hasClipboardPermission,
    currentUser,
    shareId,
    onlineUsersMap,
    warningIntervalId,
    sanitizeFilename,
    getSupportedGuacMimeTypes,
    onJmsEvent,
    sendTextToRemote,
    debouncedSendClipboardToRemote,
    registerMouseAndKeyboardHandler,
    registerTouchScreen,
    registerMouse,
    onClientError,
    clientStateChanged,
    onFileSystem,
    requestAudioStream,
    handleFolderOpen,
    clientFileReceived,
    onclipboard,
    RefreshFileSystem,
    loading,
    resizeGuaScale,
    sendKeyEvent,
    disconnectGuaclient,
    uploadGuacamoleFile,
    uploadFile,
    sendGuaSize,
    scale,
    driverName,
    currentFolder,
    currentFolderFiles,
    fileFsLoading,
    currentGuacFsObject,
    remoteClipboardText,
    clipboardPasteTextLimit,
    sendInputActive
  };
}
