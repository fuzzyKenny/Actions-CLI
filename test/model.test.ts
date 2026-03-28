import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildModelChoices, switchPreferredModel } from "../src/model.js";

test("buildModelChoices prepends the opencode default option", () => {
  const choices = buildModelChoices(["openai/gpt-5.4", "openai/gpt-5.4-mini"]);

  assert.deepEqual(choices, [
    {
      label: "Use opencode default",
      hint: "Do not force a model from Act.",
    },
    {
      label: "openai/gpt-5.4",
      value: "openai/gpt-5.4",
    },
    {
      label: "openai/gpt-5.4-mini",
      value: "openai/gpt-5.4-mini",
    },
  ]);
});

test("switchPreferredModel writes the selected model", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "act-model-test-"));
  const previousCwd = process.cwd();

  process.chdir(tempDir);

  try {
    const result = await switchPreferredModel({
      loadModels: async () => ["openai/gpt-5.4", "openai/gpt-5.4-mini"],
      selectModel: async (choices) => choices[2],
    });

    assert.equal(result.model, "openai/gpt-5.4-mini");
    assert.equal(result.cleared, false);

    const config = JSON.parse(
      await fs.readFile(path.join(tempDir, ".act", "config.json"), "utf8"),
    ) as { model?: string };

    assert.deepEqual(config, { model: "openai/gpt-5.4-mini" });
  } finally {
    process.chdir(previousCwd);
  }
});

test("switchPreferredModel can clear the preferred model", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "act-model-test-"));
  const previousCwd = process.cwd();

  process.chdir(tempDir);

  try {
    await fs.mkdir(path.join(tempDir, ".act"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, ".act", "config.json"),
      `${JSON.stringify({ model: "openai/gpt-5.4-mini" }, null, 2)}\n`,
      "utf8",
    );

    const result = await switchPreferredModel({
      loadModels: async () => ["openai/gpt-5.4", "openai/gpt-5.4-mini"],
      selectModel: async (choices) => choices[0],
    });

    assert.equal(result.model, undefined);
    assert.equal(result.cleared, true);

    const config = JSON.parse(
      await fs.readFile(path.join(tempDir, ".act", "config.json"), "utf8"),
    ) as { model?: string };

    assert.deepEqual(config, {});
  } finally {
    process.chdir(previousCwd);
  }
});
