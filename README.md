# Act

> Actions over todos.

Act is a simple CLI that turns vague tasks into small actions you can start right away.

This repository contains the CLI only. The frontend website lives in a separate web repository.

Instead of writing:

- `study dbms`
- `work on project`

Act helps you move toward:

- `Read 10 pages of dbms notes`
- `Implement the first working part of login route`
- `Solve 5 dbms questions`

The goal is simple: always know what to do next.

## Features

- Add tasks from the terminal
- Break a task into actionable steps with local `opencode`
- Mark actions as done
- See the next action to work on
- Focus only on unfinished work
- Track progress with basic stats
- Store everything locally in JSON

## Requirements

- Node.js 18+
- npm
- `opencode` for AI-powered `break` and `model switch` commands

## Installation

### Install with the script on macOS or Linux

```bash
git clone https://github.com/fuzzyKenny/Actions-CLI.git
cd Actions-CLI
chmod +x install.sh
./install.sh
```

The installer:

- uses the existing `dist/` build when available
- builds from source when `dist/` is missing
- installs the CLI into `~/.local/share/act-cli`
- creates the `act` launcher in `~/.local/bin`

If `~/.local/bin` is not already in your `PATH`, add it:

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

Then verify the install:

```bash
act --help
```

### Install with the script on Windows

Open PowerShell and run:

```powershell
git clone https://github.com/fuzzyKenny/Actions-CLI.git
cd Actions-CLI
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

The Windows installer:

- uses the existing `dist/` build when available
- builds from source when `dist/` is missing
- installs the CLI into `%LOCALAPPDATA%\act-cli`
- creates `act.cmd` and `act.ps1` launchers in `%LOCALAPPDATA%\act-cli\bin`

If `%LOCALAPPDATA%\act-cli\bin` is not already in your user `PATH`, add it:

```powershell
[Environment]::SetEnvironmentVariable("Path", "$env:LOCALAPPDATA\act-cli\bin;" + [Environment]::GetEnvironmentVariable("Path", "User"), "User")
```

Then restart PowerShell and verify the install:

```powershell
act --help
```

### Install manually from source

```bash
git clone https://github.com/fuzzyKenny/Actions-CLI.git
cd Actions-CLI
npm install
npm run build
npm link
```

On Windows, run the same steps in PowerShell.

## Usage

### Quick start

```bash
act add "study dbms"
act break 1
act list
act next
```

This creates a task, generates a few small actions, lists them, and shows the next thing to do.

### Add a task

```bash
act add "study dbms"
```

Example output:

```text
Added task 1: study dbms
```

### Break a task into actions

```bash
act break 1
```

By default, `act break` tries to use your local `opencode` installation and its existing provider/model setup.
If you set a preferred model with `act model switch`, Act uses that model by default for future `break` runs.
If `opencode` is unavailable or returns unusable output, Act automatically falls back to built-in rules.

Act supports macOS, Linux, and Windows.
On Windows, native `opencode` installs are supported, but WSL is recommended for the best OpenCode experience.
If you run Act inside WSL, install `opencode` inside WSL too.
If you run Act from PowerShell or Command Prompt, install `opencode` in that native Windows environment.

Example output:

```text
1. Read 10 pages of dbms notes
2. Write a short summary of dbms
3. Solve 5 dbms questions
```

### List all tasks

```bash
act list
```

Example output:

```text
[1] study dbms
  [ ] 1. Read 10 pages of dbms notes
  [ ] 2. Write a short summary of dbms
  [ ] 3. Solve 5 dbms questions
```

### Show the next action

```bash
act next
```

Example output:

```text
→ Read 10 pages of dbms notes
Task 1: study dbms
```

### Mark an action as done

```bash
act done 1.2
```

`1.2` means task `1`, action `2`.

You can also mark multiple actions at once:

```bash
act done 1.1 1.2 2.1
```

### Add your own action

```bash
act action add 1 "Revise ER diagrams"
```

### Remove a task or action

```bash
act remove 2
act remove 1.3
```

### Show only unfinished actions

```bash
act focus
```

Example output:

```text
→ Read 10 pages of dbms notes
   1.1 • study dbms
→ Solve 5 dbms questions
   1.3 • study dbms
```

### Show progress stats

```bash
act stats
```

Example output:

```text
Tasks: 1
Completed: 1/3
Progress: 33%
```

### See all commands

```bash
act --help
act action --help
act help break
```

### Break options

Force the built-in generator:

```bash
act break 1 --heuristic
```

Override the model for one run:

```bash
act break 1 --model openai/gpt-5.4-mini
```

Choose a preferred model interactively:

```bash
act model switch
```

This opens an arrow-key picker backed by `opencode models`.
Press `Enter` to save the selected model, or choose `Use opencode default` to clear Act's saved preference.

## Where Data Is Stored

Act stores data locally in the current working directory:

```text
.act/tasks.json
```

Example:

```json
{
  "tasks": [
    {
      "title": "study dbms",
      "actions": [
        { "text": "Read 10 pages of dbms notes", "done": false },
        { "text": "Write a short summary of dbms", "done": true }
      ]
    }
  ]
}
```

## Tech Stack

- TypeScript
- Commander
- Chalk
- Ora
- JSON local storage

## Notes

This is a basic `v1`.

The `break` command sends only the current task title to local `opencode` when AI generation is used.

`opencode` is optional. If it is missing, times out, or returns invalid output, Act falls back to simple built-in rules.

## Roadmap

- Better action generation
- Tags and priorities
- Daily planning mode
- TUI interface
- Cloud sync
