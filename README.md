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
- Break a task into actionable steps
- Mark actions as done
- See the next action to work on
- Focus only on unfinished work
- Track progress with basic stats
- Store everything locally in JSON

## Requirements

- Node.js 18+
- npm

## Installation

### Install with the script

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

### Install manually from source

```bash
git clone https://github.com/fuzzyKenny/Actions-CLI.git
cd Actions-CLI
npm install
npm run build
npm link
```

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
```

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

The `break` command currently uses simple built-in rules to generate actions. It does not use AI yet.

## Roadmap

- Better action generation
- Tags and priorities
- Daily planning mode
- TUI interface
- Cloud sync
