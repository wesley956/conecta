import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const projectRoot = process.cwd();
const artifactsDir = path.join(projectRoot, "artifacts", "hosted");
const appDataDir = path.join(projectRoot, "build", ".webos-cli-hosted");
const executable = process.platform === "win32" ? "npm.cmd" : "npm";

await Promise.all([
  mkdir(artifactsDir, { recursive: true }),
  mkdir(appDataDir, { recursive: true })
]);

const status = await new Promise((resolve, reject) => {
  const child = spawn(executable, [
    "exec",
    "--yes",
    "--package",
    "@webos-tools/cli@3.2.5",
    "--",
    "ares-package",
    "-o",
    artifactsDir,
    path.join(projectRoot, "build", "webos-hosted")
  ], {
    cwd: projectRoot,
    env: {
      ...process.env,
      APPDATA: appDataDir,
      npm_config_cache: path.join(appDataDir, "npm-cache")
    },
    stdio: "inherit"
  });
  child.once("error", reject);
  child.once("exit", code => resolve(code ?? 1));
});

if (status !== 0) process.exit(status);
