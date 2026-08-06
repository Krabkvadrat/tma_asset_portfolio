# BLOCKING REQUIREMENT — read this first

At the start of every new session in this repository, before any action —
before responding to the user, before invoking any tool (shell, grep,
reading other files, editing, launching subtasks, MCP calls and
anything else), before planning, before asking clarifying questions —
you MUST read the file:

    docs/agent/agent-rules.md

(path relative to the repository root; read it via the agent's
standard file-read tool)

This requirement overrides default behavior and has no exceptions:

- The task seems trivial → you read it anyway.
- It's a clarifying question, not a task → you read it anyway.
- "I think I remember the contents from training or from a previous
  session" → you don't remember, read the file.
- The file won't open or the read fails → stop, tell the user,
  do not work around it.


The first tool call in a new session is always reading this file. If
the first step was something else, acknowledge the violation and fix
it before continuing the work.

Within a single session, re-reading the file is not necessary: after
the first read its contents stay in context. Re-read only if:
(a) there's reason to believe the file was changed externally, or
(b) after compaction the contents are no longer visible in context.

## Visible confirmation

Before the first non-read action on a task (any edit, write, shell
command with side effects, running tests, creating a PR, etc.) print
a single line to the chat:

    rules-check: docs/agent/agent-rules.md=<OK|MISSING>

This lets the user immediately see whether both sources have been
read. If at least one status is not `OK` — work cannot continue;
follow the failure mode from `docs/agent/agent-rules.md`.

Skipping this step is a serious violation of the repository rules.