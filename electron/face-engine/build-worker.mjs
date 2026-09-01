import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const python =
  process.platform === "win32"
    ? path.join(root, ".venv", "Scripts", "python.exe")
    : path.join(root, ".venv", "bin", "python");
const meanshapeLookup = spawnSync(
  python,
  [
    "-c",
    "from pathlib import Path; import insightface.data; print(Path(insightface.data.__file__).parent / 'objects' / 'meanshape_68.pkl')"
  ],
  { cwd: root, encoding: "utf8" }
);
if (meanshapeLookup.status !== 0 || !meanshapeLookup.stdout.trim()) {
  process.stderr.write(meanshapeLookup.stderr || "Unable to locate InsightFace meanshape_68.pkl\n");
  process.exit(meanshapeLookup.status || 1);
}
const meanshape = meanshapeLookup.stdout.trim();
const child = spawn(
  python,
  [
    "-m",
    "PyInstaller",
    "--noconfirm",
    "--clean",
    "--onefile",
    "--name",
    "facelive-worker",
    "--collect-all",
    "insightface",
    "--collect-all",
    "onnxruntime",
    // InsightFace 1.x resolves this file from sys._MEIPASS/objects when frozen,
    // while its package metadata normally places it under insightface/data.
    "--add-data",
    `${meanshape}${path.delimiter}objects`,
    path.join(root, "worker.py")
  ],
  { cwd: root, stdio: "inherit" }
);

child.once("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
