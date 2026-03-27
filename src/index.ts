#!/usr/bin/env node

import chalk from "chalk";
import { Command } from "commander";
import ora from "ora";
import {
  getStorePath,
  getTask,
  parseActionRef,
  parseTaskId,
  readStore,
  writeStore,
} from "./data.js";
import { formatTask, pluralize } from "./format.js";
import { generateActions } from "./generate.js";

type ParsedActionRef = {
  raw: string;
  taskId: number;
  actionId: number;
};

type ActionRefResult = ParsedActionRef & {
  text: string;
};

type RefError = {
  raw: string;
  reason: string;
};

const program = new Command();

program.name("act").description("Actions over todos CLI").version("0.1.0");

program
  .command("add")
  .description("Add a task")
  .argument("<title>", "task title")
  .action((title: string) => {
    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      exitWithError("Task title cannot be empty.");
    }

    const store = readStore();

    store.tasks.push({
      title: trimmedTitle,
      actions: [],
    });

    writeStore(store);

    const taskId = store.tasks.length;
    console.log(chalk.green(`Added task ${taskId}: ${trimmedTitle}`));
    console.log(chalk.dim(`Stored in ${getStorePath()}`));
  });

program
  .command("break")
  .description("Generate actions for a task")
  .argument("<taskId>", "task number")
  .action((value: string) => {
    const taskId = parseTaskId(value);
    const store = readStore();
    const task = getTask(store, taskId);

    if (!task) {
      exitWithError(`Task ${taskId} was not found.`);
    }

    if (task.actions.length > 0) {
      exitWithError(
        `Task ${taskId} already has actions. Use \`act action add ${taskId} "..." \` or remove them first.`,
      );
    }

    const spinner = ora(`Breaking task ${taskId} into actions`).start();
    const actions = generateActions(task.title).map((text) => ({
      text,
      done: false,
    }));
    task.actions = actions;
    writeStore(store);
    spinner.succeed(
      `Created ${pluralize(actions.length, "action")} for task ${taskId}`,
    );

    for (const [index, action] of actions.entries()) {
      console.log(`${chalk.cyan(`${index + 1}.`)} ${action.text}`);
    }
  });

program
  .command("list")
  .description("List all tasks")
  .action(() => {
    const store = readStore();

    if (store.tasks.length === 0) {
      console.log(
        chalk.yellow('No tasks yet. Add one with `act add "your task"`.'),
      );
      return;
    }

    for (const [index, task] of store.tasks.entries()) {
      if (index > 0) {
        console.log("");
      }

      console.log(formatTask(task, index + 1));
    }
  });

program
  .command("next")
  .description("Show the next pending action")
  .action(() => {
    const store = readStore();

    for (const [taskIndex, task] of store.tasks.entries()) {
      const action = task.actions.find((item) => !item.done);

      if (action) {
        console.log(chalk.green(`→ ${action.text}`));
        console.log(chalk.dim(`Task ${taskIndex + 1}: ${task.title}`));
        return;
      }
    }

    console.log(chalk.yellow("No pending actions found."));
  });

program
  .command("done")
  .description("Mark one or more actions as done")
  .argument("<refs...>", "action references, for example 1.2 1.4 2.5")
  .action((values: string[]) => {
    const { validRefs, invalidRefs } = parseActionRefs(values);
    const store = readStore();
    const { toMark, alreadyDone, notFound } = resolveActionRefs(
      store,
      validRefs,
    );
    const failures = [...invalidRefs, ...notFound];

    for (const item of toMark) {
      const task = getTask(store, item.taskId);

      if (!task) {
        continue;
      }

      task.actions[item.actionId - 1].done = true;
    }

    if (toMark.length > 0) {
      writeStore(store);
    }

    if (toMark.length > 0) {
      printActionRefSection(
        chalk.green(`Marked ${pluralize(toMark.length, "action")} as done.`),
        toMark,
      );
    }

    if (alreadyDone.length > 0) {
      printActionRefSection(
        chalk.yellow(
          `Skipped ${pluralize(alreadyDone.length, "action")} already marked as done.`,
        ),
        alreadyDone,
        toMark.length > 0,
      );
    }

    if (failures.length > 0) {
      printFailureSection(
        chalk.red(`Could not mark ${pluralize(failures.length, "reference")}.`),
        failures,
        toMark.length > 0 || alreadyDone.length > 0,
      );
      process.exitCode = 1;
    }
  });

const actionCommand = program.command("action").description("Manage actions");

actionCommand
  .command("add")
  .description("Add a custom action to a task")
  .argument("<taskId>", "task number")
  .argument("<text>", "action text")
  .action((taskValue: string, text: string) => {
    const taskId = parseTaskId(taskValue);
    const trimmedText = text.trim();

    if (!trimmedText) {
      exitWithError("Action text cannot be empty.");
    }

    const store = readStore();
    const task = getTask(store, taskId);

    if (!task) {
      exitWithError(`Task ${taskId} was not found.`);
    }

    task.actions.push({ text: trimmedText, done: false });
    writeStore(store);

    console.log(chalk.green(`Added action ${taskId}.${task.actions.length}`));
    console.log(chalk.dim(trimmedText));
  });

program
  .command("remove")
  .description("Remove a task or action")
  .argument("<target>", "task id like 2 or action id like 1.3")
  .action((value: string) => {
    const store = readStore();

    if (value.includes(".")) {
      const { taskId, actionId } = parseActionRef(value);
      const task = getTask(store, taskId);

      if (!task) {
        exitWithError(`Task ${taskId} was not found.`);
      }

      if (!task.actions[actionId - 1]) {
        exitWithError(`Action ${taskId}.${actionId} was not found.`);
      }

      const [removedAction] = task.actions.splice(actionId - 1, 1);
      writeStore(store);
      console.log(chalk.green(`Removed action ${taskId}.${actionId}`));
      console.log(chalk.dim(removedAction.text));
      return;
    }

    const taskId = parseTaskId(value);

    if (!store.tasks[taskId - 1]) {
      exitWithError(`Task ${taskId} was not found.`);
    }

    const [removedTask] = store.tasks.splice(taskId - 1, 1);
    writeStore(store);
    console.log(chalk.green(`Removed task ${taskId}`));
    console.log(chalk.dim(removedTask.title));
  });

program
  .command("focus")
  .description("Show only pending actions")
  .action(() => {
    const store = readStore();
    const pending = store.tasks.flatMap((task, taskIndex) =>
      task.actions.flatMap((action, actionIndex) =>
        action.done
          ? []
          : [
              {
                label: `→ ${action.text}`,
                ref: `${taskIndex + 1}.${actionIndex + 1}`,
                task: task.title,
              },
            ],
      ),
    );

    if (pending.length === 0) {
      console.log(chalk.yellow("No pending actions found."));
      return;
    }

    for (const item of pending) {
      console.log(chalk.green(item.label));
      console.log(chalk.dim(`   ${item.ref} • ${item.task}`));
    }
  });

program
  .command("stats")
  .description("Show progress stats")
  .action(() => {
    const store = readStore();
    const totalTasks = store.tasks.length;
    const totalActions = store.tasks.reduce(
      (sum, task) => sum + task.actions.length,
      0,
    );
    const completedActions = store.tasks.reduce(
      (sum, task) => sum + task.actions.filter((action) => action.done).length,
      0,
    );
    const progress =
      totalActions === 0
        ? 0
        : Math.round((completedActions / totalActions) * 100);

    console.log(`Tasks: ${totalTasks}`);
    console.log(`Completed: ${completedActions}/${totalActions}`);
    console.log(`Progress: ${progress}%`);
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  if (error instanceof Error) {
    exitWithError(error.message);
  }

  exitWithError("Unknown error");
});

function exitWithError(message: string): never {
  console.error(chalk.red(message));
  process.exit(1);
}

function parseActionRefs(values: string[]): {
  validRefs: ParsedActionRef[];
  invalidRefs: RefError[];
} {
  const seenRaw = new Set<string>();
  const seenNormalized = new Set<string>();
  const validRefs: ParsedActionRef[] = [];
  const invalidRefs: RefError[] = [];

  for (const raw of values) {
    if (seenRaw.has(raw)) {
      continue;
    }

    seenRaw.add(raw);

    try {
      const { taskId, actionId } = parseActionRef(raw);
      const normalized = `${taskId}.${actionId}`;

      if (seenNormalized.has(normalized)) {
        continue;
      }

      seenNormalized.add(normalized);
      validRefs.push({ raw, taskId, actionId });
    } catch (error: unknown) {
      invalidRefs.push({
        raw,
        reason: error instanceof Error ? error.message : "Invalid reference.",
      });
    }
  }

  return { validRefs, invalidRefs };
}

function resolveActionRefs(
  store: ReturnType<typeof readStore>,
  refs: ParsedActionRef[],
): {
  toMark: ActionRefResult[];
  alreadyDone: ActionRefResult[];
  notFound: RefError[];
} {
  const toMark: ActionRefResult[] = [];
  const alreadyDone: ActionRefResult[] = [];
  const notFound: RefError[] = [];

  for (const ref of refs) {
    const task = getTask(store, ref.taskId);

    if (!task) {
      notFound.push({
        raw: ref.raw,
        reason: `Action ${ref.taskId}.${ref.actionId} was not found.`,
      });
      continue;
    }

    const action = task.actions[ref.actionId - 1];

    if (!action) {
      notFound.push({
        raw: ref.raw,
        reason: `Action ${ref.taskId}.${ref.actionId} was not found.`,
      });
      continue;
    }

    const resolved = {
      ...ref,
      text: action.text,
    };

    if (action.done) {
      alreadyDone.push(resolved);
      continue;
    }

    toMark.push(resolved);
  }

  return { toMark, alreadyDone, notFound };
}

function printActionRefSection(
  heading: string,
  items: ActionRefResult[],
  addLeadingSpace = false,
): void {
  if (addLeadingSpace) {
    console.log("");
  }

  console.log(heading);

  for (const item of items) {
    console.log(`  ${item.taskId}.${item.actionId} ${item.text}`);
  }
}

function printFailureSection(
  heading: string,
  items: RefError[],
  addLeadingSpace = false,
): void {
  if (addLeadingSpace) {
    console.log("");
  }

  console.log(heading);

  for (const item of items) {
    console.log(`  ${item.raw} ${item.reason}`);
  }
}
