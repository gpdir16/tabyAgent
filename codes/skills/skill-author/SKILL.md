# Skill Author

Use when the user asks to create, update, or remove a **user skill**, or when a task is **important and likely to repeat**.

## When to create a skill

Create a skill under `{{SKILLS_DIR}}/<slug>/SKILL.md` when:

- The user will need the same workflow again (weekly report, deploy checklist, project-specific commands).
- You solved a multi-step problem and the steps are reusable.
- The user explicitly asks for a skill.

Do **not** create a skill for one-off questions, greetings, or trivial single-command tasks.

## Layout

```
{{SKILLS_DIR}}/my-skill/
  SKILL.md    # required
```

## SKILL.md template

```markdown
# Skill Title

One line: when to use this skill.

## When to use

- Bullet triggers

## Steps

1. Concrete steps (tools, paths, checks)

## Pitfalls

- What failed before and how to avoid it
```

## Rules

- Store skills under `{{SKILLS_DIR}}` (not under `{{SYSTEM_SKILLS_DIR}}` — that tree is shipped with the agent).
- After create/update, the skill appears in the system prompt skill list on the next turn; use `skills_read` to verify content.
- Keep skills short and actionable; system prompt stays minimal — **details live in the skill**.
- Prefer updating an existing skill over duplicating a new one.

## Naming

- Lowercase slug directory: `weekly-backup`, `project-foo`.
- Title in the H1 can be human-readable.
