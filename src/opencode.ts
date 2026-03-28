import { access, realpath } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { generateHeuristicActions } from "./generate.js";

export type BreakSource = "opencode" | "heuristic";

export type GenerateBreakOptions = {
  taskTitle: string;
  cwd: string;
  model?: string;
  timeoutMs?: number;
  opencodeBin?: string;
  platform?: NodeJS.Platform;
  commandLookup?: CommandLookup;
};

export type GenerateBreakResult = {
  actions: string[];
  source: BreakSource;
  warning?: string;
};

export type OpencodeAvailability =
  | {
      status: "available";
      resolvedCommand: string;
      launchMode: "direct" | "cmd-shell";
    }
  | {
      status: "missing";
      warning: string;
    };

export type OpencodeLaunchSpec = {
  command: string;
  args: string[];
  shell: boolean;
  windowsHide: boolean;
};

export type CommandLookup = (
  candidate: string,
  platform: NodeJS.Platform,
) => Promise<string | null>;

const DEFAULT_TIMEOUT_MS = 45_000;
const MAX_ACTION_LENGTH = 120;

export async function generateBreakActions(
  options: GenerateBreakOptions,
): Promise<GenerateBreakResult> {
  try {
    const actions = await generateActionsWithOpencode(options);
    return { actions, source: "opencode" };
  } catch (error: unknown) {
    if (error instanceof OpencodeUnavailableError) {
      return {
        actions: generateHeuristicActions(options.taskTitle),
        source: "heuristic",
        warning: error.message,
      };
    }

    const reason =
      error instanceof Error ? error.message : "Unknown opencode failure.";

    return {
      actions: generateHeuristicActions(options.taskTitle),
      source: "heuristic",
      warning: `opencode failed: ${reason} Falling back to built-in rules.`,
    };
  }
}

export async function generateActionsWithOpencode(
  options: GenerateBreakOptions,
): Promise<string[]> {
  const stdout = await runOpencode(options);
  const responseText = collectOpencodeText(stdout);

  if (!responseText) {
    throw new Error("returned no text response.");
  }

  const parsed = parseBreakResponse(responseText);
  return validateActions(parsed);
}

export function buildBreakPrompt(taskTitle: string): string {
  return [
    "Break the following task into exactly 3 actions.",
    "Return exactly one JSON object and nothing else.",
    'Use this schema: {"actions":["...","...","..."]}',
    "Rules:",
    "- Each action must be concrete, small, and immediately actionable.",
    "- Use concise imperative phrasing.",
    "- No numbering.",
    "- No markdown or bullet markers.",
    "- No explanations.",
    "- No duplicates.",
    `Task: ${taskTitle.trim()}`,
  ].join("\n");
}

export function collectOpencodeText(output: string): string {
  const textParts: string[] = [];

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    try {
      const event = JSON.parse(line) as {
        type?: unknown;
        part?: { text?: unknown };
      };

      if (event.type === "text" && typeof event.part?.text === "string") {
        textParts.push(event.part.text);
      }
    } catch {
      // Ignore non-JSON noise defensively.
    }
  }

  return textParts.join("").trim();
}

export function parseBreakResponse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("returned invalid JSON.");
  }
}

export function validateActions(response: unknown): string[] {
  if (!response || typeof response !== "object" || !("actions" in response)) {
    throw new Error("returned JSON without an actions array.");
  }

  const actions = (response as { actions?: unknown }).actions;

  if (!Array.isArray(actions) || actions.length !== 3) {
    throw new Error("returned an actions array with a length other than 3.");
  }

  const normalized = actions.map((action) => {
    if (typeof action !== "string") {
      throw new Error("returned a non-string action.");
    }

    const text = action.trim();

    if (!text) {
      throw new Error("returned an empty action.");
    }

    if (text.length > MAX_ACTION_LENGTH) {
      throw new Error(`returned an action longer than ${MAX_ACTION_LENGTH} characters.`);
    }

    if (/^(?:[-*+]|\d+[.)])\s+/.test(text)) {
      throw new Error("returned actions with numbering or markdown bullets.");
    }

    return text;
  });

  const unique = new Set(normalized.map((action) => action.toLowerCase()));

  if (unique.size !== normalized.length) {
    throw new Error("returned duplicate actions.");
  }

  return normalized;
}

export async function checkOpencodeAvailability(
  options: Pick<GenerateBreakOptions, "opencodeBin" | "platform" | "commandLookup">,
): Promise<OpencodeAvailability> {
  const platform = options.platform ?? process.platform;
  const resolvedCommand = await resolveOpencodeCommand(options);

  if (!resolvedCommand) {
    return {
      status: "missing",
      warning: getMissingOpencodeWarning(platform),
    };
  }

  return {
    status: "available",
    resolvedCommand,
    launchMode: isWindowsCmdShim(resolvedCommand, platform) ? "cmd-shell" : "direct",
  };
}

export async function resolveOpencodeCommand(
  options: Pick<GenerateBreakOptions, "opencodeBin" | "platform" | "commandLookup">,
): Promise<string | null> {
  const platform = options.platform ?? process.platform;
  const lookup = options.commandLookup ?? defaultCommandLookup;
  const opencodeBin = options.opencodeBin ?? process.env.ACT_OPENCODE_BIN;
  const candidates = opencodeBin
    ? [opencodeBin]
    : platform === "win32"
      ? ["opencode.exe", "opencode.cmd", "opencode.bat", "opencode"]
      : ["opencode"];

  for (const candidate of candidates) {
    const resolved = isPathLike(candidate)
      ? await resolvePathCandidate(candidate)
      : await lookup(candidate, platform);

    if (resolved) {
      return resolved;
    }
  }

  return null;
}

export function buildOpencodeLaunchSpec(options: {
  resolvedCommand: string;
  opencodeArgs: string[];
  platform?: NodeJS.Platform;
}): OpencodeLaunchSpec {
  const platform = options.platform ?? process.platform;

  if (isWindowsCmdShim(options.resolvedCommand, platform)) {
    return {
      command: "cmd.exe",
      args: [
        "/d",
        "/s",
        "/c",
        buildWindowsCommandLine(options.resolvedCommand, options.opencodeArgs),
      ],
      shell: false,
      windowsHide: true,
    };
  }

  return {
    command: options.resolvedCommand,
    args: options.opencodeArgs,
    shell: false,
    windowsHide: platform === "win32",
  };
}

export function getMissingOpencodeWarning(platform: NodeJS.Platform): string {
  if (platform === "win32") {
    return "opencode was not found. Falling back to built-in rules. On Windows, install OpenCode natively or use WSL (recommended).";
  }

  return "opencode was not found. Falling back to built-in rules.";
}

async function runOpencode(options: GenerateBreakOptions): Promise<string> {
  const availability = await checkOpencodeAvailability(options);

  if (availability.status === "missing") {
    throw new OpencodeUnavailableError(availability.warning);
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const platform = options.platform ?? process.platform;
  const opencodeArgs = ["run", "--format", "json", "--dir", options.cwd];

  if (options.model) {
    opencodeArgs.push("--model", options.model);
  }

  opencodeArgs.push(buildBreakPrompt(options.taskTitle));
  const launchSpec = buildOpencodeLaunchSpec({
    resolvedCommand: availability.resolvedCommand,
    opencodeArgs,
    platform,
  });

  return new Promise<string>((resolve, reject) => {
    const child = spawn(launchSpec.command, launchSpec.args, {
      cwd: options.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: launchSpec.shell,
      windowsHide: launchSpec.windowsHide,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code, signal) => {
      clearTimeout(timer);

      if (timedOut) {
        reject(new Error(`timed out after ${timeoutMs}ms.`));
        return;
      }

      if (code !== 0) {
        const details = stderr.trim();
        reject(
          new Error(
            details
              ? `exited with code ${code}: ${details}`
              : `exited with code ${code}${signal ? ` (${signal})` : ""}.`,
          ),
        );
        return;
      }

      resolve(stdout);
    });
  });
}

async function defaultCommandLookup(
  candidate: string,
  platform: NodeJS.Platform,
): Promise<string | null> {
  const command = platform === "win32" ? "where.exe" : "which";

  return new Promise<string | null>((resolve) => {
    const child = spawn(command, [candidate], {
      env: process.env,
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: platform === "win32",
    });

    let stdout = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.on("error", () => {
      resolve(null);
    });

    child.on("close", async (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }

      const firstLine = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean);

      if (!firstLine) {
        resolve(null);
        return;
      }

      resolve(await normalizeResolvedCommand(firstLine));
    });
  });
}

async function resolvePathCandidate(candidate: string): Promise<string | null> {
  try {
    await access(candidate);
    return await normalizeResolvedCommand(candidate);
  } catch {
    return null;
  }
}

async function normalizeResolvedCommand(candidate: string): Promise<string> {
  try {
    return await realpath(candidate);
  } catch {
    return path.resolve(candidate);
  }
}

function isPathLike(candidate: string): boolean {
  return (
    path.isAbsolute(candidate) ||
    candidate.includes(path.sep) ||
    candidate.includes("/") ||
    candidate.includes("\\")
  );
}

function isWindowsCmdShim(
  resolvedCommand: string,
  platform: NodeJS.Platform,
): boolean {
  return platform === "win32" && /\.(cmd|bat)$/i.test(resolvedCommand);
}

function buildWindowsCommandLine(command: string, args: string[]): string {
  return [command, ...args].map(quoteWindowsCmdArgument).join(" ");
}

function quoteWindowsCmdArgument(value: string): string {
  const escaped = value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, "$1$1");
  return `"${escaped}"`;
}

class OpencodeUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpencodeUnavailableError";
  }
}
