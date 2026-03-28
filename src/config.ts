import fs from "node:fs";
import path from "node:path";

export type CliConfig = {
  model?: string;
};

export function getConfigPath(): string {
  return path.join(getDataDir(), "config.json");
}

export function readConfig(): CliConfig {
  ensureDataDir();

  const configPath = getConfigPath();

  if (!fs.existsSync(configPath)) {
    return {};
  }

  const raw = fs.readFileSync(configPath, "utf8");
  const parsed = JSON.parse(raw) as Partial<CliConfig>;

  return {
    model: typeof parsed.model === "string" && parsed.model.trim() ? parsed.model.trim() : undefined,
  };
}

export function writeConfig(config: CliConfig): void {
  ensureDataDir();
  fs.writeFileSync(getConfigPath(), `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function ensureDataDir(): void {
  const dataDir = getDataDir();

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function getDataDir(): string {
  return path.join(process.cwd(), ".act");
}
