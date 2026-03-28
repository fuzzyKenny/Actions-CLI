import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const repoRoot = process.cwd();
const tsxCliPath = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
const cliEntryPath = path.join(repoRoot, "src", "index.ts");

test("break uses opencode output and stores actions", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "act-cli-test-"));
  const opencodeBin = await createFakeOpencode(tempDir, [
    "process.stdout.write(JSON.stringify({ type: 'step_start' }) + '\\n');",
    "process.stdout.write(JSON.stringify({ type: 'text', part: { text: JSON.stringify({ actions: ['Pick the first chapter to review', 'Read 10 pages and mark questions', 'Write three key takeaways'] }) } }) + '\\n');",
  ]);

  await runAct(["add", "study dbms"], tempDir, { ACT_OPENCODE_BIN: opencodeBin });
  const result = await runAct(["break", "1"], tempDir, { ACT_OPENCODE_BIN: opencodeBin });
  const output = combinedOutput(result);

  assert.equal(result.code, 0);
  assert.match(output, /with opencode/);
  assert.doesNotMatch(output, /Warning:/);

  const store = await readStore(tempDir);
  assert.deepEqual(store.tasks[0].actions, [
    { text: "Pick the first chapter to review", done: false },
    { text: "Read 10 pages and mark questions", done: false },
    { text: "Write three key takeaways", done: false },
  ]);
});

test("break --heuristic skips opencode entirely", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "act-cli-test-"));

  await runAct(["add", "study dbms"], tempDir);
  const result = await runAct(["break", "1", "--heuristic"], tempDir, {
    ACT_OPENCODE_BIN: path.join(tempDir, "missing-opencode"),
  });
  const output = combinedOutput(result);

  assert.equal(result.code, 0);
  assert.match(output, /with built-in rules/);

  const store = await readStore(tempDir);
  assert.deepEqual(store.tasks[0].actions, [
    { text: "Read 10 pages of dbms notes", done: false },
    { text: "Write a short summary of dbms", done: false },
    { text: "Solve 5 dbms questions", done: false },
  ]);
});

test("break forwards --model to opencode", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "act-cli-test-"));
  const argsFile = path.join(tempDir, "args.json");
  const opencodeBin = await createFakeOpencode(tempDir, [
    `await fs.writeFile(${JSON.stringify(argsFile)}, JSON.stringify(process.argv.slice(2)), 'utf8');`,
    "process.stdout.write(JSON.stringify({ type: 'text', part: { text: JSON.stringify({ actions: ['Choose the route contract', 'Implement the first endpoint', 'Run the endpoint locally'] }) } }) + '\\n');",
  ]);

  await runAct(["add", "build login route"], tempDir, { ACT_OPENCODE_BIN: opencodeBin });
  const result = await runAct(
    ["break", "1", "--model", "openai/gpt-5.4-mini"],
    tempDir,
    { ACT_OPENCODE_BIN: opencodeBin },
  );

  assert.equal(result.code, 0);

  const argv = JSON.parse(await fs.readFile(argsFile, "utf8")) as string[];
  const realTempDir = await fs.realpath(tempDir);
  assert.deepEqual(argv.slice(0, 6), [
    "run",
    "--format",
    "json",
    "--dir",
    realTempDir,
    "--model",
  ]);
  assert.equal(argv[6], "openai/gpt-5.4-mini");
});

test("break uses the saved preferred model when no --model flag is passed", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "act-cli-test-"));
  const argsFile = path.join(tempDir, "args.json");
  const opencodeBin = await createFakeOpencode(tempDir, [
    `await fs.writeFile(${JSON.stringify(argsFile)}, JSON.stringify(process.argv.slice(2)), 'utf8');`,
    "process.stdout.write(JSON.stringify({ type: 'text', part: { text: JSON.stringify({ actions: ['Choose the first file to change', 'Implement one small working slice', 'Run one check for the slice'] }) } }) + '\\n');",
  ]);

  await fs.mkdir(path.join(tempDir, ".act"), { recursive: true });
  await fs.writeFile(
    path.join(tempDir, ".act", "config.json"),
    `${JSON.stringify({ model: "openai/gpt-5.4" }, null, 2)}\n`,
    "utf8",
  );

  await runAct(["add", "build login route"], tempDir, { ACT_OPENCODE_BIN: opencodeBin });
  const result = await runAct(["break", "1"], tempDir, { ACT_OPENCODE_BIN: opencodeBin });

  assert.equal(result.code, 0);

  const argv = JSON.parse(await fs.readFile(argsFile, "utf8")) as string[];
  assert.equal(argv[6], "openai/gpt-5.4");
});

test("break falls back to heuristic when opencode is missing", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "act-cli-test-"));

  await runAct(["add", "study dbms"], tempDir);
  const result = await runAct(["break", "1"], tempDir, {
    ACT_OPENCODE_BIN: path.join(tempDir, "missing-opencode"),
  });
  const output = combinedOutput(result);

  assert.equal(result.code, 0);
  assert.match(output, /Warning: opencode was not found\./);
  assert.match(output, /with built-in rules/);
  assert.doesNotMatch(output, /WSL/);
});

test("break falls back to heuristic when opencode output is invalid", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "act-cli-test-"));
  const opencodeBin = await createFakeOpencode(tempDir, [
    "process.stdout.write(JSON.stringify({ type: 'text', part: { text: '{\"actions\":[\"One\",\"One\",\"Two\"]}' } }) + '\\n');",
  ]);

  await runAct(["add", "study dbms"], tempDir, { ACT_OPENCODE_BIN: opencodeBin });
  const result = await runAct(["break", "1"], tempDir, { ACT_OPENCODE_BIN: opencodeBin });
  const output = combinedOutput(result);

  assert.equal(result.code, 0);
  assert.match(output, /duplicate actions/);

  const store = await readStore(tempDir);
  assert.equal(store.tasks[0].actions.length, 3);
  assert.equal(store.tasks[0].actions[0].text, "Read 10 pages of dbms notes");
});

test("break falls back to heuristic when opencode exits non-zero", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "act-cli-test-"));
  const opencodeBin = await createFakeOpencode(tempDir, [
    "process.stderr.write('provider failed');",
    "process.exit(2);",
  ]);

  await runAct(["add", "study dbms"], tempDir, { ACT_OPENCODE_BIN: opencodeBin });
  const result = await runAct(["break", "1"], tempDir, { ACT_OPENCODE_BIN: opencodeBin });
  const output = combinedOutput(result);

  assert.equal(result.code, 0);
  assert.match(output, /exited with code 2: provider failed/);
  assert.match(output, /with built-in rules/);
});

test("break fails for a missing task before checking opencode", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "act-cli-test-"));
  const result = await runAct(["break", "1"], tempDir, {
    ACT_OPENCODE_BIN: path.join(tempDir, "missing-opencode"),
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Task 1 was not found\./);
  assert.doesNotMatch(result.stderr, /opencode was not found/);
});

test("break still refuses tasks that already have actions before invoking opencode", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "act-cli-test-"));

  await fs.mkdir(path.join(tempDir, ".act"), { recursive: true });
  await fs.writeFile(
    path.join(tempDir, ".act", "tasks.json"),
    JSON.stringify(
      {
        tasks: [
          {
            title: "study dbms",
            actions: [{ text: "Existing action", done: false }],
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );

  const result = await runAct(["break", "1"], tempDir, {
    ACT_OPENCODE_BIN: path.join(tempDir, "missing-opencode"),
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /already has actions/);
  assert.doesNotMatch(result.stderr, /opencode failed/);
});

test("model command shows the saved preferred model", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "act-cli-test-"));

  await fs.mkdir(path.join(tempDir, ".act"), { recursive: true });
  await fs.writeFile(
    path.join(tempDir, ".act", "config.json"),
    `${JSON.stringify({ model: "openai/gpt-5.4-mini" }, null, 2)}\n`,
    "utf8",
  );

  const result = await runAct(["model"], tempDir);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Preferred model: openai\/gpt-5\.4-mini/);
});

async function createFakeOpencode(tempDir: string, statements: string[]): Promise<string> {
  const scriptPath = path.join(tempDir, "fake-opencode.mjs");
  const script = [
    "#!/usr/bin/env node",
    "import fs from 'node:fs/promises';",
    ...statements,
  ].join("\n");

  await fs.writeFile(scriptPath, script, { encoding: "utf8", mode: 0o755 });
  await fs.chmod(scriptPath, 0o755);

  return scriptPath;
}

async function readStore(tempDir: string): Promise<{
  tasks: Array<{ title: string; actions: Array<{ text: string; done: boolean }> }>;
}> {
  const raw = await fs.readFile(path.join(tempDir, ".act", "tasks.json"), "utf8");
  return JSON.parse(raw) as {
    tasks: Array<{ title: string; actions: Array<{ text: string; done: boolean }> }>;
  };
}

async function runAct(
  args: string[],
  cwd: string,
  env: Record<string, string> = {},
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tsxCliPath, cliEntryPath, ...args], {
      cwd,
      env: {
        ...process.env,
        ...env,
        FORCE_COLOR: "0",
        NO_COLOR: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        code,
        stdout: stripAnsi(stdout),
        stderr: stripAnsi(stderr),
      });
    });
  });
}

function stripAnsi(value: string): string {
  return value.replace(/\u001B\[[0-9;]*m/g, "");
}

function combinedOutput(result: { stdout: string; stderr: string }): string {
  return `${result.stdout}${result.stderr}`.replace(/\r/g, "");
}
