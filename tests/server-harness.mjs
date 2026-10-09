/**
 * Boots two `next dev` servers against throwaway libSQL databases:
 *   - `authed`  has LOCAL_DEV_USER_EMAIL and the Google Ads webhook key set
 *   - `anon`    has neither, so every gated route must answer 401/503
 *
 * Both are started in parallel because `next dev` costs most of the suite's
 * wall-clock time.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const WEBHOOK_KEY = "test-webhook-key-abc123";

const children = [];
let workDir;

function runOnce(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: projectRoot, env: { ...process.env, ...env }, stdio: "pipe" });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    child.on("exit", (code) => (code === 0 ? resolve(output) : reject(new Error(`${command} ${args.join(" ")} exited ${code}\n${output}`))));
  });
}

async function waitFor(base, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "never responded";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/api/discover`, { signal: AbortSignal.timeout(5000) });
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`next dev never became ready on ${base}: ${lastError}`);
}

function startServer({ port, databaseUrl, distDir, extraEnv }) {
  const child = spawn("npx", ["next", "dev", "-p", String(port)], {
    cwd: projectRoot,
    env: {
      ...process.env,
      TURSO_DATABASE_URL: databaseUrl,
      TURSO_AUTH_TOKEN: "",
      // Each instance builds into its own directory; two dev servers sharing
      // `.next` deadlock, and neither should touch the developer's own.
      NEXT_DIST_DIR: distDir,
      LOCAL_DEV_USER_EMAIL: "",
      GOOGLE_PLACES_API_KEY: "",
      GOOGLE_CUSTOM_SEARCH_API_KEY: "",
      GOOGLE_SEARCH_ENGINE_ID: "",
      GOOGLE_ADS_WEBHOOK_KEY: "",
      ...extraEnv,
    },
    stdio: "pipe",
  });
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});
  children.push(child);
  return child;
}

export async function startServers() {
  workDir = mkdtempSync(path.join(tmpdir(), "leadflow-suite-"));
  const authedDb = `file:${path.join(workDir, "authed.db")}`;
  const anonDb = `file:${path.join(workDir, "anon.db")}`;
  await Promise.all([
    runOnce("node", ["db/migrate.mjs"], { TURSO_DATABASE_URL: authedDb, TURSO_AUTH_TOKEN: "" }),
    runOnce("node", ["db/migrate.mjs"], { TURSO_DATABASE_URL: anonDb, TURSO_AUTH_TOKEN: "" }),
  ]);

  const authedPort = 3200 + Math.floor(Math.random() * 300);
  const anonPort = authedPort + 1;
  startServer({
    port: authedPort,
    databaseUrl: authedDb,
    distDir: ".next-test-authed",
    extraEnv: { LOCAL_DEV_USER_EMAIL: "tester@suhleadflow.local", GOOGLE_ADS_WEBHOOK_KEY: WEBHOOK_KEY },
  });
  startServer({ port: anonPort, databaseUrl: anonDb, distDir: ".next-test-anon", extraEnv: {} });

  const authed = `http://127.0.0.1:${authedPort}`;
  const anon = `http://127.0.0.1:${anonPort}`;
  await Promise.all([waitFor(authed, 240_000), waitFor(anon, 240_000)]);
  return { authed, anon };
}

export function stopServers() {
  for (const child of children) child.kill("SIGTERM");
  if (workDir) rmSync(workDir, { recursive: true, force: true });
}

/** Issues a request and returns `{ status, body }`, tolerating empty bodies. */
export async function call(base, route, { method = "GET", json, headers, raw } = {}) {
  const init = { method, headers: { ...headers }, signal: AbortSignal.timeout(90_000) };
  if (json !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(json);
  }
  if (raw !== undefined) {
    init.headers["Content-Type"] ??= "application/json";
    init.body = raw;
  }
  const response = await fetch(`${base}${route}`, init);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { __nonJson: text.slice(0, 200) };
  }
  return { status: response.status, body };
}
