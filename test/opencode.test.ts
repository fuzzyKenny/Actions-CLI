import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildBreakPrompt,
  buildOpencodeLaunchSpec,
  checkOpencodeAvailability,
  collectOpencodeText,
  generateBreakActions,
  getMissingOpencodeWarning,
  listOpencodeModels,
  parseBreakResponse,
  resolveOpencodeCommand,
  validateActions,
} from "../src/opencode.js";

test("buildBreakPrompt includes the task and JSON schema", () => {
  const prompt = buildBreakPrompt("study dbms");

  assert.match(prompt, /Task: study dbms/);
  assert.match(prompt, /"actions"/);
  assert.match(prompt, /Return exactly one JSON object/);
});

test("collectOpencodeText extracts text events and ignores noise", () => {
  const output = [
    "not json",
    JSON.stringify({ type: "step_start" }),
    JSON.stringify({ type: "text", part: { text: '{"actions":["a",' } }),
    "",
    JSON.stringify({ type: "text", part: { text: '"b","c"]}' } }),
  ].join("\n");

  assert.equal(collectOpencodeText(output), '{"actions":["a","b","c"]}');
});

test("parseBreakResponse rejects invalid JSON", () => {
  assert.throws(() => parseBreakResponse("nope"), /invalid JSON/);
});

test("validateActions rejects duplicates and bullets", () => {
  assert.throws(
    () => validateActions({ actions: ["First step", "First step", "Third step"] }),
    /duplicate actions/,
  );

  assert.throws(
    () => validateActions({ actions: ["1. First", "Second", "Third"] }),
    /numbering or markdown bullets/,
  );
});

test("resolveOpencodeCommand uses the default POSIX candidate", async () => {
  const seen: string[] = [];
  const resolved = await resolveOpencodeCommand({
    platform: "darwin",
    commandLookup: async (candidate) => {
      seen.push(candidate);
      return candidate === "opencode" ? "/usr/local/bin/opencode" : null;
    },
  });

  assert.equal(resolved, "/usr/local/bin/opencode");
  assert.deepEqual(seen, ["opencode"]);
});

test("resolveOpencodeCommand prefers opencode.exe on Windows", async () => {
  const seen: string[] = [];
  const resolved = await resolveOpencodeCommand({
    platform: "win32",
    commandLookup: async (candidate) => {
      seen.push(candidate);
      return candidate === "opencode.exe"
        ? "C:\\Tools\\opencode.exe"
        : candidate === "opencode.cmd"
          ? "C:\\Tools\\opencode.cmd"
          : null;
    },
  });

  assert.equal(resolved, "C:\\Tools\\opencode.exe");
  assert.deepEqual(seen, ["opencode.exe"]);
});

test("resolveOpencodeCommand honors the explicit override candidate", async () => {
  const seen: string[] = [];
  const resolved = await resolveOpencodeCommand({
    opencodeBin: "custom-opencode",
    platform: "linux",
    commandLookup: async (candidate) => {
      seen.push(candidate);
      return "/opt/bin/custom-opencode";
    },
  });

  assert.equal(resolved, "/opt/bin/custom-opencode");
  assert.deepEqual(seen, ["custom-opencode"]);
});

test("buildOpencodeLaunchSpec uses direct spawn for executables", () => {
  const spec = buildOpencodeLaunchSpec({
    resolvedCommand: "C:\\Tools\\opencode.exe",
    opencodeArgs: ["run", "--format", "json"],
    platform: "win32",
  });

  assert.deepEqual(spec, {
    command: "C:\\Tools\\opencode.exe",
    args: ["run", "--format", "json"],
    shell: false,
    windowsHide: true,
  });
});

test("buildOpencodeLaunchSpec uses cmd.exe for .cmd launchers", () => {
  const spec = buildOpencodeLaunchSpec({
    resolvedCommand: "C:\\Program Files\\OpenCode\\opencode.cmd",
    opencodeArgs: ["run", "--format", "json", "--dir", "C:\\Work Dir"],
    platform: "win32",
  });

  assert.equal(spec.command, "cmd.exe");
  assert.deepEqual(spec.args.slice(0, 3), ["/d", "/s", "/c"]);
  assert.match(spec.args[3], /^"C:\\Program Files\\OpenCode\\opencode\.cmd"/);
  assert.match(spec.args[3], /"--dir" "C:\\Work Dir"/);
  assert.equal(spec.shell, false);
  assert.equal(spec.windowsHide, true);
});

test("missing warnings differ by platform", () => {
  assert.match(getMissingOpencodeWarning("win32"), /WSL \(recommended\)/);
  assert.doesNotMatch(getMissingOpencodeWarning("linux"), /WSL/);
});

test("checkOpencodeAvailability reports missing opencode with Windows guidance", async () => {
  const availability = await checkOpencodeAvailability({
    platform: "win32",
    commandLookup: async () => null,
  });

  assert.deepEqual(availability, {
    status: "missing",
    warning:
      "opencode was not found. Falling back to built-in rules. On Windows, install OpenCode natively or use WSL (recommended).",
  });
});

test("generateBreakActions returns opencode actions on valid output", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "act-opencode-test-"));
  const opencodeBin = await createFakeOpencode(tempDir, [
    "process.stdout.write(JSON.stringify({ type: 'text', part: { text: JSON.stringify({ actions: ['Choose the first subtopic', 'Read 10 pages and underline weak spots', 'Write three quick recall questions'] }) } }) + '\\n');",
  ]);

  const result = await generateBreakActions({
    taskTitle: "study dbms",
    cwd: tempDir,
    opencodeBin,
  });

  assert.equal(result.source, "opencode");
  assert.deepEqual(result.actions, [
    "Choose the first subtopic",
    "Read 10 pages and underline weak spots",
    "Write three quick recall questions",
  ]);
});

test("generateBreakActions falls back on timeout", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "act-opencode-test-"));
  const opencodeBin = await createFakeOpencode(tempDir, [
    "setTimeout(() => process.stdout.write('late'), 200);",
  ]);

  const result = await generateBreakActions({
    taskTitle: "study dbms",
    cwd: tempDir,
    timeoutMs: 50,
    opencodeBin,
  });

  assert.equal(result.source, "heuristic");
  assert.match(result.warning ?? "", /timed out/);
  assert.equal(result.actions[0], "Read 10 pages of dbms notes");
});

test("listOpencodeModels returns trimmed model lines", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "act-opencode-test-"));
  const opencodeBin = await createFakeOpencode(tempDir, [
    "process.stdout.write('openai/gpt-5.4\\nopenai/gpt-5.4-mini\\n');",
  ]);

  const models = await listOpencodeModels({
    cwd: tempDir,
    opencodeBin,
  });

  assert.deepEqual(models, ["openai/gpt-5.4", "openai/gpt-5.4-mini"]);
});

async function createFakeOpencode(tempDir: string, statements: string[]): Promise<string> {
  const scriptPath = path.join(tempDir, "fake-opencode.mjs");
  const script = [
    "#!/usr/bin/env node",
    ...statements,
  ].join("\n");

  await fs.writeFile(scriptPath, script, { encoding: "utf8", mode: 0o755 });
  await fs.chmod(scriptPath, 0o755);

  return scriptPath;
}
