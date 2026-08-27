const helperIndex = process.argv.indexOf("--ssh-helper");

if (helperIndex >= 0) {
  const { run } = await import("./ssh-helper.cjs");
  const status = await run(process.argv.slice(helperIndex + 1));
  process.exit(status);
} else {
  await import("./main.mjs");
}
