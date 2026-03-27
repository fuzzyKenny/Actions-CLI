import fs from "node:fs";
import path from "node:path";

export type Action = {
  text: string;
  done: boolean;
};

export type Task = {
  title: string;
  actions: Action[];
};

export type Store = {
  tasks: Task[];
};

const DATA_DIR = path.join(process.cwd(), ".act");
const DATA_FILE = path.join(DATA_DIR, "tasks.json");

function ensureStoreFile(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    writeStore({ tasks: [] });
  }
}

export function getStorePath(): string {
  return DATA_FILE;
}

export function readStore(): Store {
  ensureStoreFile();

  const raw = fs.readFileSync(DATA_FILE, "utf8");
  const parsed = JSON.parse(raw) as Partial<Store>;

  if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
    return { tasks: [] };
  }

  return {
    tasks: parsed.tasks.map((task) => ({
      title: task.title ?? "",
      actions: Array.isArray(task.actions)
        ? task.actions.map((action) => ({
            text: action.text ?? "",
            done: Boolean(action.done)
          }))
        : []
    }))
  };
}

export function writeStore(store: Store): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  fs.writeFileSync(DATA_FILE, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

export function getTask(store: Store, taskId: number): Task | undefined {
  return store.tasks[taskId - 1];
}

export function parseTaskId(value: string): number {
  const taskId = Number(value);

  if (!Number.isInteger(taskId) || taskId < 1) {
    throw new Error("Task id must be a positive number.");
  }

  return taskId;
}

export function parseActionRef(value: string): { taskId: number; actionId: number } {
  const [taskPart, actionPart] = value.split(".");

  const taskId = Number(taskPart);
  const actionId = Number(actionPart);

  if (!Number.isInteger(taskId) || taskId < 1 || !Number.isInteger(actionId) || actionId < 1) {
    throw new Error("Use the format task.action, for example: 1.2");
  }

  return { taskId, actionId };
}
