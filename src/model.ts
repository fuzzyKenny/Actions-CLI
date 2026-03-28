import readline from "node:readline";
import chalk from "chalk";
import { readConfig, writeConfig } from "./config.js";
import { listOpencodeModels } from "./opencode.js";

export type ModelChoice = {
  label: string;
  value?: string;
  hint?: string;
};

export type SwitchModelResult = {
  model?: string;
  cleared: boolean;
  count: number;
};

export async function switchPreferredModel(options?: {
  selectModel?: (choices: ModelChoice[], currentModel?: string) => Promise<ModelChoice>;
  loadModels?: () => Promise<string[]>;
}): Promise<SwitchModelResult> {
  const config = readConfig();
  const loadModels = options?.loadModels ?? (() => listOpencodeModels({ cwd: process.cwd() }));
  const selectModel = options?.selectModel ?? selectModelInteractively;
  const models = await loadModels();
  const choices = buildModelChoices(models);
  const selected = await selectModel(choices, config.model);

  writeConfig({
    ...config,
    model: selected.value,
  });

  return {
    model: selected.value,
    cleared: !selected.value,
    count: models.length,
  };
}

export function buildModelChoices(models: string[]): ModelChoice[] {
  return [
    {
      label: "Use opencode default",
      hint: "Do not force a model from Act.",
    },
    ...models.map((model) => ({
      label: model,
      value: model,
    })),
  ];
}

export async function selectModelInteractively(
  choices: ModelChoice[],
  currentModel?: string,
): Promise<ModelChoice> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Interactive model switching requires a TTY terminal.");
  }

  const currentIndex = getInitialIndex(choices, currentModel);

  return new Promise<ModelChoice>((resolve, reject) => {
    let activeIndex = currentIndex;
    let renderedLines = 0;
    const stdin = process.stdin;
    const stdout = process.stdout;

    readline.emitKeypressEvents(stdin);

    if (typeof stdin.setRawMode === "function") {
      stdin.setRawMode(true);
    }

    stdin.resume();
    stdout.write("\u001B[?25l");
    render();

    const onKeypress = (_: string, key: { name?: string; ctrl?: boolean; sequence?: string }) => {
      if (key.ctrl && key.name === "c") {
        cleanup();
        reject(new Error("Model selection cancelled."));
        return;
      }

      if (key.name === "up" || key.name === "k") {
        activeIndex = activeIndex === 0 ? choices.length - 1 : activeIndex - 1;
        render();
        return;
      }

      if (key.name === "down" || key.name === "j") {
        activeIndex = activeIndex === choices.length - 1 ? 0 : activeIndex + 1;
        render();
        return;
      }

      if (key.name === "return") {
        const selected = choices[activeIndex];
        cleanup();
        resolve(selected);
        return;
      }

      if (key.name === "escape" || key.name === "q") {
        cleanup();
        reject(new Error("Model selection cancelled."));
      }
    };

    function render(): void {
      clearRenderedBlock(stdout, renderedLines);

      const lines = [
        chalk.cyan("Choose a preferred opencode model"),
        chalk.dim("Use arrow keys to navigate, Enter to select, Esc to cancel."),
        "",
        ...choices.map((choice, index) => {
          const pointer = index === activeIndex ? chalk.green("›") : " ";
          const suffix = choice.value === currentModel
            ? chalk.dim(" (current)")
            : !choice.value && !currentModel
              ? chalk.dim(" (current)")
              : "";
          const hint = choice.hint ? chalk.dim(` - ${choice.hint}`) : "";

          return `${pointer} ${choice.label}${suffix}${hint}`;
        }),
      ];

      stdout.write(lines.join("\n"));
      renderedLines = lines.length;
    }

    function cleanup(): void {
      stdin.off("keypress", onKeypress);

      if (typeof stdin.setRawMode === "function") {
        stdin.setRawMode(false);
      }

      clearRenderedBlock(stdout, renderedLines);
      renderedLines = 0;
      stdout.write("\u001B[?25h");
      stdout.write("\n");
    }

    stdin.on("keypress", onKeypress);
  });
}

function getInitialIndex(choices: ModelChoice[], currentModel?: string): number {
  if (!currentModel) {
    return 0;
  }

  const currentIndex = choices.findIndex((choice) => choice.value === currentModel);
  return currentIndex >= 0 ? currentIndex : 0;
}

function clearRenderedBlock(
  stdout: NodeJS.WriteStream,
  renderedLines: number,
): void {
  if (renderedLines === 0) {
    return;
  }

  readline.moveCursor(stdout, 0, -renderedLines + 1);

  for (let index = 0; index < renderedLines; index += 1) {
    readline.clearLine(stdout, 0);

    if (index < renderedLines - 1) {
      readline.moveCursor(stdout, 0, 1);
    }
  }

  readline.cursorTo(stdout, 0);
  readline.moveCursor(stdout, 0, -renderedLines + 1);
}
