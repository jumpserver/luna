export default function (context) {
  if (context.command) {
    return { type: "args", args: ["new-tab", "cmd.exe", "/d", "/s", "/c", context.command] };
  }
  if (!context.helper_executable) throw new Error("SSH helper is missing");
  return {
    type: "args",
    args: [
      "new-tab",
      context.helper_executable,
      context.protocol,
      `${context.username}@${context.host}`,
      "-p",
      String(context.port),
      "-P",
      context.value
    ]
  };
}
