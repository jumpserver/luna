import type { ClientChannel } from "ssh2";
import { pathToFileURL } from "node:url";
import { Client } from "ssh2";

export function parseOptions(argv) {
  const args = [...argv];
  let index = args[0] === "ssh" ? 1 : 0;
  let destination = "";
  let port = 22;
  let password = "";

  while (index < args.length) {
    const value = args[index];
    if (value === "-p" || value === "-P") {
      const next = args[++index];
      if (next === undefined) throw new Error(`missing value for ${value}`);
      if (value === "-p") port = Number(next);
      else password = next;
    } else if (!value.startsWith("-") && !destination) {
      destination = value;
    } else {
      throw new Error(`unsupported SSH helper argument: ${value}`);
    }
    index += 1;
  }

  const separator = destination.indexOf("@");
  if (separator < 1 || separator === destination.length - 1) {
    throw new Error("destination must be username@host");
  }
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("invalid SSH port");

  return {
    username: destination.slice(0, separator),
    host: destination.slice(separator + 1),
    port,
    password
  };
}

function terminalSize() {
  return {
    term: process.env.TERM || "xterm-256color",
    cols: process.stdout.columns || 120,
    rows: process.stdout.rows || 30,
    width: 0,
    height: 0
  };
}

export function run(argv = process.argv.slice(2)) {
  let options: ReturnType<typeof parseOptions>;
  try {
    options = parseOptions(argv);
  } catch (error) {
    process.stderr.write(`SSH connection failed: ${error.message}\n`);
    return Promise.resolve(1);
  }

  return new Promise<number>((resolve) => {
    const connection = new Client();
    let channel: ClientChannel | undefined;
    let exitStatus = 0;
    let settled = false;
    let inactivityTimer: NodeJS.Timeout | undefined;
    const input = process.stdin;
    const output = process.stdout;
    const wasRaw = Boolean(input.isRaw);

    function onResize() {
      const size = terminalSize();
      channel?.setWindow(size.rows, size.cols, size.height, size.width);
    }

    function cleanup() {
      clearTimeout(inactivityTimer);
      output.off("resize", onResize);
      input.off("data", touch);
      input.unpipe(channel);
      if (input.isTTY) input.setRawMode(wasRaw);
      input.pause();
    }

    function finish(status: number, error?: Error) {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) process.stderr.write(`SSH connection failed: ${error.message}\n`);
      connection.end();
      resolve(status);
    }

    function touch() {
      clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => finish(1, new Error("SSH session timed out")), 60_000);
      inactivityTimer.unref();
    }

    connection
      .on("ready", () => {
        connection.shell(terminalSize(), (error, stream) => {
          if (error) return finish(1, error);
          channel = stream;
          if (input.isTTY) input.setRawMode(true);
          input.resume();
          input.on("data", touch);
          output.on("resize", onResize);
          stream.on("data", touch);
          stream.stderr.on("data", touch);
          stream.on("exit", (code) => {
            if (Number.isInteger(code)) exitStatus = code;
          });
          stream.on("close", () => finish(exitStatus));
          stream.on("error", (streamError) => finish(1, streamError));
          input.pipe(stream);
          stream.pipe(output);
          stream.stderr.pipe(process.stderr);
          touch();
        });
      })
      .on("error", (error) => finish(1, error))
      .on("close", () => finish(exitStatus))
      .connect({
        host: options.host,
        port: options.port,
        username: options.username,
        password: options.password,
        hostVerifier: () => true,
        readyTimeout: 60_000,
        keepaliveInterval: 15_000,
        keepaliveCountMax: 4
      });
  });
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  void run().then((status) => {
    process.exitCode = status;
  });
}
