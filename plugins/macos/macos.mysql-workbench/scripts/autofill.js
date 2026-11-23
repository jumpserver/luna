// eslint-disable-next-line no-unused-vars -- osascript bootstrap calls this function.
function configureApplication(id) {
  if (id === "com.oracle.mysqlworkbench") return { args: ["--args", "--force-renderer-accessibility"], autofill };
  if (id === "com.oracle.workbench.MySQLWorkbench") return { args: [], autofill: autofillClassic };
}

function autofill({ app, ax }, session, ui) {
  const { value, find, waitFor, windows, role, secureField, named, press, fill, clickPoint, click } = ui;

  function byId(root, id) {
    return find(root, (element) => value(element, "AXDOMIdentifier") === id);
  }

  const window = waitFor(() => windows(ax).find((item) => named(item, ["MySQL Workbench"])), 25, 4);
  waitFor(() => byId(window, "newConnectionButton") || byId(window, "workspaceSelector"), 12, 5);
  if (byId(window, "caption") || find(window, secureField)) throw new Error("Unexpected UI state");
  if (!byId(window, "newConnectionButton")) {
    const home = () => byId(window, "__workspace_home__");
    if (!home()) click(app, clickPoint(byId(window, "workspaceSelector")));
    click(
      app,
      waitFor(() => clickPoint(home()))
    );
  }
  press(waitFor(() => byId(window, "newConnectionButton")));

  const caption = waitFor(() => byId(window, "caption"));
  const name = `JumpServer - ${session.name} - ${Date.now()}`;
  fill(caption, name);
  for (const [id, text] of Object.entries({
    hostName: session.host,
    port: session.port,
    userName: session.username,
    defaultSchema: session.database
  }))
    fill(byId(window, id), text);
  press(byId(window, "ok"));
  const tile = waitFor(() => {
    if (byId(window, "caption")) return;
    const tiles = byId(window, "tilesHost");
    return (
      tiles && find(tiles, (element) => role(element, "AXButton") && value(element, "AXTitle")?.startsWith(`${name} `))
    );
  });
  click(
    app,
    waitFor(() => clickPoint(tile))
  );

  const opened = waitFor(() => {
    const password = find(window, secureField);
    if (password) return { password };
    const workspace = byId(window, "workspaceSelector");
    if (
      workspace &&
      find(workspace, (item) => value(item, "AXValue") === name) &&
      find(window, (item) => role(item, "AXStaticText") && ["Connected", "已连接"].includes(value(item, "AXValue")))
    )
      return {};
  });
  if (!opened.password) return;
  const ok = byId(window, "ok");
  if (!ok) throw new Error("Unexpected UI state");
  fill(opened.password, session.password);
  press(ok);
}

function autofillClassic({ app, ax }, session, ui) {
  const {
    attribute,
    value,
    find,
    waitFor,
    windows,
    role,
    secureField,
    named,
    field,
    button,
    press,
    fill,
    clickPoint,
    click
  } = ui;

  const setup = () => windows(ax).find((window) => named(window, ["Setup New Connection", "设置新连接"]));
  const passwordPrompt = () =>
    windows(ax).find((window) => named(window, ["Connect to MySQL Server", "连接到 MySQL 服务器"]));
  const homeMenu = waitFor(
    () => {
      const menuBar = attribute(ax, "AXMenuBar");
      return menuBar && find(menuBar, (item) => role(item, "AXMenuItem") && named(item, ["Home", "主页"]));
    },
    25,
    4
  );
  const main = () => windows(ax).find((window) => named(window, ["MySQL Workbench"]));
  const addConnection = () => {
    const window = main();
    return window && button(window, ["Add Connection", "添加连接"]);
  };
  if (setup() || passwordPrompt()) throw new Error("Unexpected UI state");
  if (!addConnection()) press(homeMenu);
  // The AX action can time out while the native modal is open. Wait for the dialog before editing.
  const openModal = (element) => {
    if (!app.active) throw new Error("Unexpected UI state");
    const result = $.AXUIElementPerformAction(element, $("AXPress"));
    if (result !== 0 && result !== -25204) throw new Error("Unexpected UI state");
  };
  openModal(waitFor(addConnection));
  const dialog = waitFor(setup);
  const connectionId = `JMS-${Date.now().toString(36)}`;
  const name = `${connectionId} ${session.name.replaceAll("/", "-")}`;

  // ponytail: AXValue sets the Cocoa field without notifying Workbench's connection model.
  // Trigger its text-change callback with a reversible edit until Workbench commits AX writes itself.
  for (const [labels, text] of [
    [["Connection Name", "连接名称"], name],
    [["Host Name", "Hostname", "主机名"], session.host],
    [["Port", "端口"], session.port],
    [["User Name", "Username", "用户名"], session.username],
    [["Default Schema", "默认架构"], session.database]
  ]) {
    const control = field(dialog, labels);
    fill(control, text);
    click(app, clickPoint(control));
    $.NSThread.sleepForTimeInterval(0.12);
    // Command-Right, Space, Backspace and Tab.
    for (const [key, flags] of [
      [124, $.kCGEventFlagMaskCommand],
      [49, 0],
      [51, 0],
      [48, 0]
    ]) {
      if (!app.active) throw new Error("Unexpected UI state");
      for (const down of [true, false]) {
        const event = $.CGEventCreateKeyboardEvent(null, key, down);
        $.CGEventSetFlags(event, flags);
        $.CGEventPost($.kCGHIDEventTap, event);
      }
      $.NSThread.sleepForTimeInterval(0.06);
    }
    waitFor(() => (value(control, "AXValue") ?? "") === text, 2);
  }
  press(button(dialog, ["OK"]));
  // A named connection also avoids the legacy editor crash when showing a server-version warning.
  openModal(
    waitFor(() => {
      const window = main();
      // Workbench exposes the tile's shortened caption through Accessibility.
      return (
        !setup() &&
        window &&
        find(window, (item) => role(item, "AXButton") && value(item, "AXTitle")?.startsWith(`${connectionId} `))
      );
    })
  );

  const editor = () => {
    const window = main();
    return window && find(window, (item) => role(item, "AXSplitGroup") && named(item, ["Query Panel"]));
  };
  const versionWarning = () =>
    windows(ax).some(
      (window) =>
        role(window, "AXWindow") &&
        value(window, "AXSubrole") === "AXDialog" &&
        find(window, (item) => named(item, ["Continue Anyway", "仍然继续"]))
    );
  const opened = waitFor(() => {
    const prompt = passwordPrompt();
    if (prompt) return { prompt };
    if (versionWarning() || editor()) return {};
  });
  if (!opened.prompt) return;
  const remember = find(opened.prompt, (item) => role(item, "AXCheckBox"));
  if (remember && value(remember, "AXValue") !== 0) throw new Error("Unexpected password storage state");
  const password = find(opened.prompt, secureField);
  fill(password, session.password);
  openModal(button(opened.prompt, ["OK"]));
  waitFor(() => !passwordPrompt() && (versionWarning() || editor()));
}
