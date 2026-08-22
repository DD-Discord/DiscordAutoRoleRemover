# Discord Role Auto Remover

A Discord bot that enforces role rules a moderator can't easily police by
hand: it watches every member's roles and reacts when they end up in a
configured "bad" state. It was originally built to strip a Server Booster's
custom colour role the moment they stop boosting; that's now just the
simplest instance of a small rule engine with three rule types, all built
on a shared "role pool" concept.

The codebase is strict TypeScript, run directly via `tsx` (no separate build
step — see [Configuration & deployment](#configuration--deployment)).

## The rule engine

Everything is built on **role pools** — named, reusable sets of role IDs
(`logic/rolePool.ts`). Pools are deliberately not abstracted away for the
simple case: even a single-role condition (like "is boosting") is just a
pool with one role in it. Three rule types reference pools:

1. **Prerequisite rules** (`logic/prerequisite.ts`) — if a member loses
   their last role from a *required pool*, act on whatever roles they hold
   from a *dependent pool*. This is the original Booster→colours behavior,
   generalized.
2. **Conflict rules** (`logic/conflict.ts`) — 2+ pools that are mutually
   exclusive; if a member ends up with roles from 2+ of them at once,
   that's a conflict. **Always alerts** — there's no tie-break rule for
   which pool should "win," so this rule type has no `fix` option and no
   `RuleOutcome` fields at all (nothing left to toggle).
3. **Pool cap rules** (`logic/poolCap.ts`) — a single pool with a
   max-allowed count; if a member holds more than that, that's an
   overflow. Auto-fix is only ever attempted when the cap is `0` (remove
   everything — no subset choice to make); above that, `fix` never fires
   (there's no rule for which extra role(s) to drop) — only `alert` can
   react to it, and only if enabled.

Prerequisite and pool-cap rules share a `RuleOutcome` (`logic/outcome.ts`):
`{ fix: boolean; alert: boolean }`, **independent** toggles — a rule can
auto-fix *and* still notify, do just one, or (rejected at the command
level via `validate`, see below) neither. There is deliberately no
forced-alert fallback: if a rule has `alert: false` and hits a situation
it can't auto-fix (e.g. a pool-cap overflow above `max: 0`), it now does
nothing at all and stays silent — a conscious trade-off over the earlier
always-alert-on-ambiguity behavior.

The alert **channel** and **ping list** are no longer per-rule — they're
one global per-guild configuration (`logic/alertSettings.ts`,
`/role-alerts`) shared by every rule type. See below.

All three checks run on every `GuildMemberUpdate`, dispatched from
`logic/update.ts` (now a thin orchestrator — see below) and only act on
transitions (a role just lost, a count that just increased), never on
every subsequent unrelated role change while a violation persists — this
avoids re-alerting or re-processing on every unrelated role edit.

### Global alert settings (`logic/alertSettings.ts`)

A per-guild **singleton** (not a list — always exactly one record, keyed
by the guild's own ID): `GuildAlertSettings { alertChannel: ChannelInfo |
null; pingTargets: PingTarget[] }`, where a `PingTarget` is `{ type: 'role'
| 'user'; id; name }`. `getAlertSettings(guildId)` returns a safe empty
default (`alertChannel: null, pingTargets: []`) when nothing's configured
yet, so every evaluator can call it unconditionally and just check
`.alertChannel` before sending — no null-checking `alertSettingsData.get`
directly. `logic/outcome.ts`'s `sendAlert(guild, settings, message)`
prefixes the message with a mention for every ping target before sending.

Configured via `/role-alerts` (hand-rolled, not `crudCommandUpdate` — a
singleton has no create/edit/delete/list-all shape to reuse):
`set-channel`, `add-ping`/`remove-ping` (Discord's Mentionable option type,
resolving to a `Role`/`GuildMember`/`User` — disambiguated via
`instanceof`), and `check`.

## Entry point & runtime wiring (`index.ts`)

- Creates a `discord.js` `Client` with `Guilds` and `GuildMembers` intents
  (the latter is required to receive `GuildMemberUpdate`).
- On `GuildAvailable` (guilds the bot is already in) and `GuildCreate`
  (newly joined guilds), registers all five DB tables (pools,
  prerequisites, conflicts, caps, settings) for that guild and re-deploys
  slash commands to it.
- On `GuildMemberUpdate`, delegates to `maybeUpdateRoles`.
- On `InteractionCreate`, delegates to the generic interaction router.

## Interaction routing (`interactions/`)

- `interactions/index.ts` — dispatches an incoming `Interaction` to the
  command, autocomplete, button, or modal handler based on its type.
- `deploy-commands.ts` — registers guild slash commands via the REST API
  and routes command/autocomplete executions to the matching module in
  `commands/`.
- `deploy-buttons.ts` / `deploy-modals.ts` — same pattern for buttons and
  modals, keyed off the prefix of the interaction's `customId` (before the
  first `/`).
- `types.ts` — shared `Command`/`Button`/`Modal` interfaces that each
  auto-loaded module conforms to.
- `commands/`, `buttons/`, `modals/` each have an `index.ts` that
  auto-loads every sibling `.ts` file (except itself and `*.test.*`) and
  exposes it by its exported `name`. Since the project runs as ESM, these
  loaders rebuild `__dirname` via `fileURLToPath(import.meta.url)` and load
  each file via dynamic `import()` (converted to a `file://` URL via
  `pathToFileURL`, since Node's ESM loader rejects raw OS paths) behind a
  top-level `await Promise.all(...)`. Everything that imports the loader
  (`deploy-commands.ts` etc.) transparently waits for that top-level await
  as part of normal ESM module linking, so the rest of the app still sees a
  plain, already-populated `commands`/`buttons`/`modals` object — no
  downstream code had to become async.
  **Do not switch this back to `require()`/`createRequire`**: mixing
  `require()` and `import()` for the same files loads two separate module
  instances with two separate copies of any module-level state (this
  actually happened here — `db.ts`'s in-memory table cache got split in two,
  since `index.ts` registered a table on the `import`-graph instance while a
  command loaded via `require()` read from an unregistered, never-touched
  instance). Buttons and modals currently have no concrete handlers — the
  folders are scaffolding for future interactive UI.

### Commands (`interactions/commands/`)

5 top-level commands, `ManageRoles`-gated. `role-prereq` and `role-cap`
each have exactly one action (create/edit/delete/list-in-one, via
`crud.ts`'s `crudCommandUpdate`), so they stay flat. `role-pool` and
`role-conflict` each need that same consolidated action *plus* one or two
list-mutation actions (Discord has no multi-select option type, so
growing a pool's/conflict-rule's list field needs one-role/one-pool-at-a-
time actions) — those are grouped as subcommands under one top-level
command via `crud.ts`'s `crudCommandUpdateSubcommand`. `role-alerts` is
hand-rolled (a config singleton, not a CRUD list).

| Command | Subcommands | Purpose |
|---|---|---|
| `role-pool` | `manage`, `add-role`, `remove-role` | `manage` creates/edits/deletes/lists pools (`name` only); `add-role`/`remove-role` grow membership. |
| `role-conflict` | `manage`, `add-pool`, `remove-pool` | `manage` creates/edits/deletes/lists rules (`name` only); `add-pool`/`remove-pool` grow the pool list. |
| `role-prereq` | *(none — flat)* | Create/edit/delete/list prerequisite rules (required pool, dependent pool, `fix`, `alert`). |
| `role-cap` | *(none — flat)* | Create/edit/delete/list pool cap rules (pool, max allowed, `fix`, `alert`). |
| `role-alerts` | `set-channel`, `add-ping`, `remove-ping`, `check` | Configures the one global alert channel + ping list shared by every rule type. |

`role-prereq`/`role-cap`/`role-conflict`'s `manage` each carry a `validate`
hook (see the `crud.ts` section) that rejects creating/editing a rule with
`fix`/`alert` both `false`, and rejects enabling `alert` before
`/role-alerts set-channel` has ever been run in that guild.

`manage` subcommands use `crudCommandUpdate`'s usual `id` (autocompleted,
selects an existing record to edit/view; omit to create new, `id:all`
bulk-applies) and `delete` boolean flag — same semantics as a flat
`crudCommandUpdate` command, just nested.

**Important conventions**:
- Any `crudCommandUpdate`/`crudCommandUpdateSubcommand` call should pass an
  explicit kebab-case `name`/subcommand name — `crudCommandUpdate` defaults
  to the CRUD object's own `.name` (e.g. `'prerequisite rule'`), which
  contains a space and isn't a valid Discord command name.
- Subcommand descriptions are capped at 100 characters, same as top-level
  command descriptions — Discord rejects the whole command registration
  (a `shapeshift` `ExpectedConstraintError`, not an obvious validation
  message) if one is too long. Keep `crudCommandUpdateSubcommand`
  descriptions short.

## Data layer

### `db.ts` — flat-file JSON store

A minimal file-based database with no external dependencies:

- **Tables** are directories under `data/`; a table name can be a string or
  an array of path segments (e.g. `[guildId, 'roles']` → `data/<guildId>/roles/`).
  Segments are sanitized to `[a-z0-9_]` via `dbSafe`.
- **Records** are JSON files named `<id>.json`, with `createdAt` /
  `updatedAt` timestamps stamped in on every write.
- Each table keeps an **in-memory cache**; `dbGet`/`dbGetAll` populate it
  lazily from disk, `dbWrite`/`dbDelete` keep it in sync.
- A table must be `dbRegister`'d (which also `mkdir`s its directory) before
  it can be read or written — done once per guild in `index.ts`, for all
  five tables.
- Always query through a CRUD's own `getAll`/`get` (namespaced,
  e.g. `prerequisiteRuleData.getAll({ guildId })`), never a raw
  `dbGetAll("tablename")` with a flat string — the original JS had exactly
  this bug (`dbGetAll("roles")` reading a flat, never-registered table
  instead of the actual namespaced `[guildId, 'roles']` one), silently
  breaking the bot's core feature until it was found and fixed during the
  pool/rule-engine rewrite.
- **Custom type serialization**: `Date`, `Set`, and `Map` values are
  (de)serialized through a small replacer/reviver registry (`customTypes`)
  so they round-trip through `JSON.stringify`/`parse` as
  `{"$date": "..."}`, `{"$set": [...]}`, `{"$map": [[k, v], ...]}`.

### `crud.ts` — generic CRUD + Discord slash-command scaffolding

Builds on `db.ts` to provide reusable, generically-typed CRUD objects and a
generic "CRUD update command" builder. `crudCommandUpdate` sat unused since
the TypeScript migration; the pool/prerequisite/conflict/cap rule types are
its first real caller, and that exercise surfaced (and fixed) a real bug:
the builder used to add its own optional `id`/`delete` options *before* the
caller's options, which breaks the moment a caller has any required option
of its own (Discord requires required options before non-required ones).
Fixed by adding the caller's `options` first.

- `crudDefine(settings)` — given `getTable`/`getId`/formatting functions,
  returns `{ register, get, getAll, write, delete, formatShort, formatFull,
  getAttachments, displayName, ... }` bound to a "namespace" (e.g. a guild).
  `formatFull` builds a Discord embed whose color is deterministically
  derived from the record's ID via an FNV-1a hash → HSL (`colorFromId`), so
  the same record always renders with the same color.
- `crudCommandUpdate(settings)` — generates a full slash command (`id`
  autocomplete supporting `all` and comma-separated bulk IDs, an optional
  `delete` flag, per-option retrieval/validation/update) from a CRUD object
  plus a list of options. An optional `validate: (record) => string[]`
  hook runs cross-field checks a single option's own retriever can't
  express (e.g. "at least one of `fix`/`alert` must be true") — applied to
  every record in memory after its options are updated but before any
  record is written, so a validation failure aborts the whole operation
  without writing anything.
- `crudCommandUpdateSubcommand(subcommandName, settings)` — the same
  create/edit/delete/list logic, nested as one `SlashCommandSubcommandBuilder`
  instead of owning a full top-level command, so it can sit alongside
  hand-rolled sibling subcommands under one parent (see `role-pool`/
  `role-conflict` below). Both functions share a private
  `buildCrudHandlers` that populates whichever option-capable builder
  it's given — `SlashCommandBuilder` and `SlashCommandSubcommandBuilder`
  expose identical option-adding methods via `@discordjs/builders`'
  `SharedSlashCommandOptions`, so the same logic works for either.
- `crudCommandOption.*` — reusable option builders: `simpleString`,
  `simpleBoolean`, `simpleChannel`, `simpleChoice` (string with
  `.addChoices`), `simpleNumber` (integer, min/max), `simpleFk` (foreign key
  to another CRUD table, with autocomplete), `simpleAttachment` (downloads a
  Discord attachment to disk, tracked by the record's ID). All support
  `required`.
- `crudAutocomplete(fkCrud, getNamespace)` — the "search another CRUD's
  records by label" logic, factored out of `simpleFk` so hand-rolled
  commands (the four list-mutation ones above) can reuse it instead of
  duplicating it.

## Utilities (`util/`)

- `fmt.ts` — Discord-message formatting helpers: `sanitizeMarkdown` (strips
  markdown for plain-text contexts like autocomplete labels),
  `batchLines`/`maxLength` (keep messages under Discord's 2000-char limit),
  `wrapInCode`, `channelInfoToString`, `booleanToString`, `msToString`,
  `stringList`, `ratioToString`.
- `channel.ts` — `getChannelInfo`/`ChannelInfo` (`{id, name, parent?}`).
  Now genuinely used: `GuildAlertSettings.alertChannel` (the one global
  alert destination) is a `ChannelInfo`, not just a raw ID, so
  `channelInfoToString` can render it nicely wherever it's displayed.
- `role.ts`, `guild.ts`, `user.ts` — small `{ id, name, ... }` normalizers
  (`getRoleInfo`, `getGuildInfo`, `getUserInfo`) for storing lightweight
  Discord object references. Currently unused by any command in this repo
  (likely shared conventions carried over from a sibling bot).
- `date.ts` — an ISO-8601 week-number calculator (`getWeek`); also currently
  unused here.

## Configuration & deployment

- `config.ts` loads environment variables via `dotenv`: `.env` first, then
  `.env.local` (with `override: true`), and throws at startup if
  `DISCORD_TOKEN` or `DISCORD_CLIENT_ID` are missing. (Heads up: this
  version of `dotenv` prints a random promotional "tip" line to the console
  on every load — one of the tips references a third-party product,
  `vestauth.com`, that isn't otherwise part of this project. It's cosmetic
  console noise, not a security issue, and can be silenced by passing
  `{ quiet: true }` to `dotenv.config()` if it's unwanted.)
- `tsconfig.json` — `strict: true`, `module`/`moduleResolution: "NodeNext"`,
  `noEmit: true` (there's no compile step; `tsc` here is only used for
  `npm run typecheck`).
- `Dockerfile` — `node:latest`, installs from
  `package.json`/`package-lock.json`, copies the repo, runs
  `npx tsx index.ts` (no separate build stage — `tsx` transpiles on the
  fly).
- `docker-compose.yml` — pulls `ghcr.io/dd-discord/discordautoroleremover:master`,
  bind-mounts a host `.env.local` file and the `data/` directory (so rules
  persist across container recreation), logs via `journald`.
- Dependencies: `discord.js` (Gateway client + REST), `dotenv`, and `tsx`
  (runtime dependency, since it executes the `.ts` files directly);
  `typescript`/`@types/node` are dev-only, used for `npm run typecheck`.
  The entire persistence layer is hand-rolled JSON files, no database
  server.

## Migrating existing data

Two different approaches were used for the two schema changes this
project has been through so far, worth knowing about before making a
third:

- **Pool-referencing rewrite** (raw role IDs → pool references): no
  automatic migration — the shapes were different enough (single IDs →
  pool references, requiring new pool records to exist first) that the
  live rule was just manually recreated via the new commands after
  deploying.
- **Alert-system rework** (`action: 'fix'|'alert'` + per-rule
  `alertChannel` → independent `fix`/`alert` + global settings): uses
  `crudDefine`'s `migrate?: (record: T | null) => T | null` hook instead
  (see `prerequisiteRuleData`/`poolCapRuleData`/`conflictRuleData` in
  `logic/`) — it runs transparently on every `get`/`getAll`, and its
  output is what gets persisted next time that record is `write()`-d, so
  old on-disk records upgrade themselves the moment they're read, no
  manual JSON editing needed. **Prefer this approach whenever the old and
  new shapes are close enough to transform in place** (a field rename, a
  choice-to-booleans split) — reach for manual recreation only when the
  new shape depends on data that doesn't exist yet (like brand-new pool
  records). A `migrate` hook can only transform its own record, though —
  it can't populate a *different* CRUD's storage, so the brand-new
  `alertSettingsData` table still needs a one-time `/role-alerts
  set-channel` after deploying (not a migration, since there's no prior
  data for that table to migrate from).

## Known gaps / scaffolding not yet wired up

- `interactions/buttons/` and `interactions/modals/` have no concrete
  handlers yet, only the auto-loading `index.ts`.
- `crudCommandOption.simpleAttachment` is unused by any live command —
  general infrastructure shared with (or ported from) another bot in this
  project family. Its generic types (and `simpleFk`'s `retriever` shape)
  lean on some intentionally loose `any`/cast escape hatches, same
  rationale as `db.ts`'s custom-type registry.
- `util/guild.ts`, `util/user.ts`, `util/date.ts` are unused in this repo.
- `noUncheckedIndexedAccess` and other extra-strict `tsconfig` flags aren't
  enabled — `strict: true` is the current bar.
- Editing an existing `crudCommandUpdate`-based record (e.g. `/role-prereq
  id:<rule>`) currently re-requires *all* of that command's options, even
  if you only want to change one field — every option here is marked
  `required: true` since a rule can't function without them at creation
  time, but `crudCommandUpdate` applies the same requiredness to edits.
  Not fixed now; would need per-option "required only when creating" logic
  in `crudCommandUpdate` if it becomes annoying in practice.
