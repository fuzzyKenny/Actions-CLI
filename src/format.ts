import chalk from "chalk";
import type { Action, Task } from "./data.js";

export function formatTask(task: Task, taskId: number): string {
  const lines = [chalk.cyan(`[${taskId}] ${task.title}`)];

  for (const [index, action] of task.actions.entries()) {
    lines.push(`  ${formatAction(action, index + 1)}`);
  }

  if (task.actions.length === 0) {
    lines.push(`  ${chalk.dim("No actions yet. Run `act break " + taskId + "` or add one manually.")}`);
  }

  return lines.join("\n");
}

export function formatAction(action: Action, actionId?: number): string {
  const marker = action.done ? chalk.green("[x]") : chalk.yellow("[ ]");
  const prefix = actionId ? `${actionId}. ` : "";

  return `${marker} ${prefix}${action.text}`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
