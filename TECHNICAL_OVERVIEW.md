# Technical Overview — DiscordRoleAutoRemover

See `../PROJECT_OVERVIEW.md` for the shared architecture (fake DB, config/infra boilerplate) — though this repo predates most of it; see below.

## Notable technical features

- **Simplest bot in the suite**: single responsibility — on `guildMemberUpdate`, if a member is missing a configured "when" role but still holds the dependent "remove" role(s), strip those role(s). `logic.js` is ~40 lines total.
- **`remove` is a keyed map, not a list**: `roles.remove[optRemove.id] = { removeId, removeName }` (`commands/create.js:45`), so one "when" role can have multiple independently-added "remove" roles attached, each addressable/removable by ID without touching the others.

## Code smells / issues

- **No `check`/`delete` command review performed here** — only `create.js` was inspected in detail; if this bot is ported forward, verify `check.js`/`delete.js` don't share the same `remove`-as-object assumption inconsistently.
