function quote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}
export default function (context) {
  const command =
    context.command ||
    [
      context.helper_executable,
      context.protocol,
      `${context.username}@${context.host}`,
      "-p",
      context.port,
      "-P",
      context.value
    ]
      .map(quote)
      .join(" ");
  return { type: "args", args: ["-e", "bash", "-lc", command] };
}
