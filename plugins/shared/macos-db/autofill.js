/* global configureApplication */
ObjC.import("AppKit");
ObjC.import("ApplicationServices");
ObjC.bindFunction("flock", ["int", ["int", "int"]]);

function attribute(element, name) {
  const result = Ref();
  if (element && $.AXUIElementCopyAttributeValue(element, $(name), result) === 0) {
    return ObjC.castRefToObject(result[0]);
  }
}

function value(element, name) {
  return ObjC.unwrap(attribute(element, name));
}

function children(element, name = "AXChildren") {
  const list = attribute(element, name);
  return Array.from({ length: list?.count || 0 }, (_, index) => list.objectAtIndex(index));
}

function find(element, matches) {
  if (matches(element)) return element;
  for (const child of children(element)) {
    const match = find(child, matches);
    if (match) return match;
  }
}

function waitFor(probe, seconds = 8, status = 1) {
  const deadline = Date.now() + seconds * 1000;
  do {
    const result = probe();
    if (result) return result;
    $.NSThread.sleepForTimeInterval(0.15);
  } while (Date.now() < deadline);
  throw new Error(String(status));
}

function windows(application) {
  return children(application, "AXWindows");
}

function role(element, name) {
  return value(element, "AXRole") === name;
}

function textField(element) {
  return ["AXTextField", "AXTextArea"].includes(value(element, "AXRole"));
}

function secureField(element) {
  return textField(element) && value(element, "AXSubrole") === "AXSecureTextField";
}

function named(element, labels) {
  return ["AXTitle", "AXDescription"].some((key) => labels.includes(value(element, key)));
}

function field(root, labels) {
  return find(root, (element) => textField(element) && named(element, labels));
}

function button(root, labels) {
  return find(root, (element) => role(element, "AXButton") && named(element, labels));
}

function press(element) {
  if (!element || $.AXUIElementPerformAction(element, $("AXPress")) !== 0) throw new Error("Unexpected UI state");
}

function fill(element, text) {
  if (!element || $.AXUIElementSetAttributeValue(element, $("AXValue"), $(text)) !== 0)
    throw new Error("Unexpected UI state");
  if (!secureField(element)) waitFor(() => (value(element, "AXValue") ?? "") === text, 2);
}

function frameOf(element) {
  if (!element) return;
  const frame = ObjC.unwrap(attribute(element, "AXFrame")?.description);
  const bounds = frame?.match(/x:([-\d.]+) y:([-\d.]+) w:([\d.]+) h:([\d.]+)/);
  if (!bounds) return;
  const [, x, y, width, height] = bounds.map(Number);
  if (width > 0 && height > 0) return { x, y, width, height };
}

function clickPoint(element) {
  const frame = frameOf(element);
  if (frame) return $.CGPointMake(frame.x + frame.width / 2, frame.y + frame.height / 2);
}

function click(app, point) {
  // ponytail: Swing's popup rows and Workbench's tiles lack usable AX actions.
  // Read their current AX bounds until the clients expose native selection actions.
  if (!point || !app.active) throw new Error("Unexpected UI state");
  for (const type of [$.kCGEventLeftMouseDown, $.kCGEventLeftMouseUp]) {
    const event = $.CGEventCreateMouseEvent(null, type, point, $.kCGMouseButtonLeft);
    $.CGEventSetIntegerValueField(event, $.kCGMouseEventClickState, 1);
    $.CGEventPost($.kCGHIDEventTap, event);
  }
}

// eslint-disable-next-line no-unused-vars -- osascript calls run.
function run() {
  try {
    if (!$.AXIsProcessTrusted()) return "2";

    const data = $.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile;
    const session = JSON.parse(ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding)));
    const bundle = $.NSURL.fileURLWithPath(session.bundle).URLByResolvingSymlinksInPath;
    const bundlePath = ObjC.unwrap(bundle.path);
    const id = ObjC.unwrap($.NSBundle.bundleWithURL(bundle).bundleIdentifier);
    const application = configureApplication(id);
    if (!application) return "3";

    // Both plugins pass the same lock file as descriptor 3. macOS releases the lock on exit.
    const exclusive = 2;
    const nonblocking = 4;
    waitFor(() => $.flock(3, exclusive | nonblocking) === 0, 30, 7);

    const task = $.NSTask.alloc.init;
    task.executableURL = $.NSURL.fileURLWithPath("/usr/bin/open");
    task.arguments = $(["-a", session.bundle, ...application.args]);
    if (!task.launchAndReturnError(null)) return "4";
    void task.waitUntilExit;
    if (task.terminationStatus !== 0) return "4";

    const app = waitFor(
      () => {
        const running = $.NSRunningApplication.runningApplicationsWithBundleIdentifier(id);
        for (let index = 0; index < running.count; index++) {
          const candidate = running.objectAtIndex(index);
          const candidateBundle = candidate.bundleURL?.URLByResolvingSymlinksInPath;
          if (candidate.finishedLaunching && ObjC.unwrap(candidateBundle?.path) === bundlePath) return candidate;
        }
      },
      25,
      4
    );
    waitFor(() => app.active, 4);
    const ax = $.AXUIElementCreateApplication(app.processIdentifier);
    $.AXUIElementSetMessagingTimeout(ax, 1.5);
    application.autofill({ app, ax }, session, {
      attribute,
      value,
      children,
      find,
      waitFor,
      windows,
      role,
      textField,
      secureField,
      named,
      field,
      button,
      press,
      fill,
      frameOf,
      clickPoint,
      click
    });
    return "0";
  } catch (error) {
    return /^[1-7]$/.test(error?.message) ? error.message : "1";
  }
}
