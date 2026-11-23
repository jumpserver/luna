// eslint-disable-next-line no-unused-vars -- osascript bootstrap calls this function.
function configureApplication(id) {
  if (id === "com.jetbrains.datagrip") return { args: [], autofill };
}

function autofill({ app, ax }, session, ui) {
  const {
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
    frameOf,
    clickPoint,
    click
  } = ui;

  function dataGripField(dialog, labels, matches) {
    const namedField = find(dialog, (element) => matches(element) && named(element, labels));
    if (namedField) return namedField;
    // Older JetBrains Runtime versions expose the label and control as unnamed siblings.
    const label = find(dialog, (element) => role(element, "AXStaticText") && named(element, labels));
    const frame = frameOf(label);
    if (!frame) return;
    return children(attribute(label, "AXParent")).find((element) => {
      if (!matches(element)) return false;
      const control = frameOf(element);
      return (
        control &&
        control.x >= frame.x + frame.width &&
        control.y < frame.y + frame.height &&
        frame.y < control.y + control.height
      );
    });
  }

  function sendKey(app, key) {
    for (const down of [true, false]) {
      $.CGEventPostToPid(app.processIdentifier, $.CGEventCreateKeyboardEvent(null, key, down));
    }
  }

  function fillDataGrip(app, element, text, useSelection = false) {
    if (!element) throw new Error("DataGrip field unavailable");
    const matches = () => (value(element, "AXValue") ?? "") === text;
    if (!useSelection && $.AXUIElementSetAttributeValue(element, $("AXValue"), $(text)) === 0) {
      if (secureField(element)) return true;
      try {
        waitFor(matches, 0.5);
        return true;
      } catch {
        // Some older Swing versions acknowledge AXValue without updating the text.
      }
    }
    const length = value(element, "AXNumberOfCharacters") ?? value(element, "AXValue")?.length ?? 0;
    const selection = $.AXValueCreate($.kAXValueCFRangeType, Ref($.CFRangeMake(0, length)));
    if (!app.active || $.AXUIElementSetAttributeValue(element, $("AXSelectedTextRange"), selection) !== 0)
      throw new Error("DataGrip field could not be selected");
    if ($.AXUIElementSetAttributeValue(element, $("AXSelectedText"), $(text)) !== 0)
      throw new Error("DataGrip field could not be filled");
    if (!secureField(element)) waitFor(matches, 2);
    return false;
  }

  function selectPopup(app, ax, menu, labels) {
    if (labels.includes(value(menu, "AXValue"))) return;
    click(app, clickPoint(menu));
    const popup = waitFor(() => {
      for (const window of windows(ax)) {
        if (value(window, "AXSubrole") !== "AXUnknown") continue;
        const list = find(window, (element) => role(element, "AXList"));
        const rows = children(list);
        if (rows.some((entry) => named(entry, labels))) return { window, list, rows };
      }
    });
    const { window, list, rows } = popup;
    const target = rows.findIndex((entry) => named(entry, labels));
    const point = clickPoint(rows[target]);
    const frame = frameOf(window);
    if (point && frame && point.y > frame.y && point.y < frame.y + frame.height) {
      click(app, point);
      waitFor(() => labels.includes(value(menu, "AXValue")));
      return;
    }
    const current = rows.findIndex((entry) => value(entry, "AXSelected") === true);
    if (current < 0 || !app.active) throw new Error("Unexpected UI state");
    // Swing brings the highlighted item into view as the arrow keys move through the list.
    const arrow = target > current ? 125 /* Down */ : 126; /* Up */
    for (let step = 0; step < Math.abs(target - current); step++) {
      sendKey(app, arrow);
      $.NSThread.sleepForTimeInterval(0.025);
    }
    waitFor(() => value(children(list)[target], "AXSelected") === true);
    sendKey(app, 36); // Return
    waitFor(() => labels.includes(value(menu, "AXValue")));
  }

  const urlDialog = () =>
    windows(ax).find((window) => named(window, ["New Data Source from URL", "来自 URL 的新数据源"]));
  const sourceDialog = () =>
    windows(ax).find((window) => named(window, ["Data Sources and Drivers", "数据源和驱动程序"]));
  const menu = waitFor(
    () => {
      const menuBar = attribute(ax, "AXMenuBar");
      return (
        menuBar &&
        find(
          menuBar,
          (element) =>
            role(element, "AXMenuItem") &&
            named(element, ["Data Source from URL", "从 URL 创建数据源", "来自 URL 的数据源"])
        )
      );
    },
    25,
    4
  );
  if (urlDialog() || sourceDialog()) throw new Error("Unexpected UI state");
  press(menu);
  const url = waitFor(urlDialog);
  const legacyText = !fillDataGrip(app, field(url, ["URL:"]), session.jdbc);
  if (session.driver) {
    const driverMenu = find(
      url,
      (element) =>
        role(element, "AXPopUpButton") && find(element, (item) => role(item, "AXRow") && named(item, [session.driver]))
    );
    selectPopup(app, ax, driverMenu, [session.driver]);
  }
  press(button(url, ["OK", "确定"]));

  const dialog = waitFor(sourceDialog);
  if (session.sysdba) {
    const roleMenu = find(
      dialog,
      (element) =>
        role(element, "AXPopUpButton") && find(element, (item) => role(item, "AXRow") && named(item, ["SYSDBA"]))
    );
    selectPopup(app, ax, roleMenu, ["SYSDBA"]);
  }
  const password = waitFor(() => find(dialog, secureField));
  const name = field(dialog, ["Name:", "名称:"]);
  const user = dataGripField(dialog, ["User:", "用户:"], (element) => textField(element) && !secureField(element));
  const save = dataGripField(dialog, ["Save:", "保存:"], (element) => role(element, "AXPopUpButton"));
  if (!save) throw new Error("Unexpected UI state");
  fillDataGrip(app, name, `JumpServer - ${session.name}`, legacyText);
  fillDataGrip(app, user, session.username, legacyText);

  selectPopup(app, ax, save, ["For session", "对于会话"]);
  if (
    find(
      dialog,
      (element) =>
        role(element, "AXLink") && named(element, ["Download missing driver files", "下载缺失的驱动程序文件"])
    )
  )
    throw new Error("4");
  fillDataGrip(app, password, session.password, legacyText);
  press(button(dialog, ["OK", "确定"]));
  waitFor(() => !sourceDialog());
}
