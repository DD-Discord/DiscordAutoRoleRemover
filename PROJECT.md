# Discord Role Auto Remover

A Discord bot that removes a member's "dependent" roles as soon as a
"prerequisite" role is taken away from them.

It was originally built to strip a Server Booster's custom colour role the
moment they stop boosting, but the rule engine is generic: any role can be
configured as a prerequisite for the removal of any number of other roles.

## How it works

1. An admin runs `/role-remover-create` and picks two roles: `when` (the
   prerequisite) and `remove` (the dependent role to strip).
2. This is stored as one record per prerequisite role, per guild, containing
   a map of all dependent roles configured for it.
3. The bot listens for `GuildMemberUpdate`. Whenever a member's roles change,
   it checks every configured prerequisite role for that guild:
   - If the member still has the prerequisite role, nothing happens.
   - If the member never had it either, nothing happens (avoids acting on
     unrelated role changes).
   - If the member just lost the prerequisite role, the bot removes every
     dependent role in that record's `remove` map that the member currently
     holds.
4. `/role-remover-check` lists all configured rules; `/role-remover-delete`
   removes a single dependent-role link (or the whole rule if no links are
   left).

Example (from `data/<guildId>/roles/<roleId>.json`): the Server Booster role
is the prerequisite, and the dependent roles are a set of colour roles
("Sunshine Yellow", "Snowflake Blue", etc.) that get stripped the moment
someone stops boosting.

The codebase is strict TypeScript, run directly via `tsx` (no separate build
step — see [Configuration & deployment](#configuration--deployment)).

## Entry point & runtime wiring (`index.ts`)

- Creates a `discord.js` `Client` with `Guilds` and `GuildMembers` intents
  (the latter is required to receive `GuildMemberUpdate`).
- On `GuildAvailable` (guilds the bot is already in) and `GuildCreate`
  (newly joined guilds), it registers the `roles` DB table for that guild
  and re-deploys slash commands to it.
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

| Command | Purpose |
|---|---|
| `role-remover-create` | Adds a `when` → `remove` link (creates or updates the rule for the `when` role). |
| `role-remover-delete` | Removes a single `when` → `remove` link; deletes the whole rule once its last link is gone. |
| `role-remover-check` | Lists all configured rules and their dependent roles in the guild. |

All three require `ManageRoles` permission (`setDefaultMemberPermissions`).

## Rule engine (`logic/update.ts`)

- Defines `roleRemoverData`, a CRUD object (see below) over the `roles`
  table, namespaced per guild (`[guildId, 'roles']`), keyed by prerequisite
  role ID.
- `maybeUpdateRoles(oldMember, newMember)` is the core check described
  above. It reads all rules for the member's guild directly via
  `db.dbGetAll("roles")` (not through the CRUD wrapper) and removes
  qualifying roles with an audit-log reason of `"Auto remover: <role name>"`.
  Failures to remove a single role are logged and don't abort the rest of
  the loop.

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
  it can be read or written — done once per guild in `index.js`.
- **Custom type serialization**: `Date`, `Set`, and `Map` values are
  (de)serialized through a small replacer/reviver registry (`customTypes`)
  so they round-trip through `JSON.stringify`/`parse` as
  `{"$date": "..."}`, `{"$set": [...]}`, `{"$map": [[k, v], ...]}`.

### `crud.ts` — generic CRUD + Discord slash-command scaffolding

Builds on `db.ts` to provide reusable, generically-typed CRUD objects and a
generic "CRUD update command" builder — used elsewhere in the bot family
this project is part of, though the current commands
(`create.ts`/`delete.ts`/`check.ts`) call the lower-level `crudDefine`
object (`roleRemoverData`) directly rather than the full
`crudCommandUpdate` builder — that builder's single-autocompleted-`id`
model doesn't fit this project's one-to-many prerequisite→dependent-roles
shape well, so it's kept as general infrastructure for future commands
rather than retrofitted here.

- `crudDefine(settings)` — given `getTable`/`getId`/formatting functions,
  returns `{ register, get, getAll, write, delete, formatShort, formatFull,
  getAttachments, displayName, ... }` bound to a "namespace" (e.g. a guild).
  `formatFull` builds a Discord embed whose color is deterministically
  derived from the record's ID via an FNV-1a hash → HSL (`colorFromId`), so
  the same record always renders with the same color.
- `crudCommandUpdate(settings)` — generates a full slash command (`id`
  autocomplete supporting `all` and comma-separated bulk IDs, an optional
  `delete` flag, per-option retrieval/validation/update) from a CRUD object
  plus a list of options. Not currently used by any live command, but
  available for new features.
- `crudCommandOption.*` — reusable option builders: `simpleString`,
  `simpleBoolean`, `simpleChannel`, `simpleFk` (foreign key to another CRUD
  table, with autocomplete), `simpleAttachment` (downloads a Discord
  attachment to disk, tracked by the record's ID).

## Utilities (`util/`)

- `fmt.ts` — Discord-message formatting helpers: `sanitizeMarkdown` (strips
  markdown for plain-text contexts like autocomplete labels),
  `batchLines`/`maxLength` (keep messages under Discord's 2000-char limit),
  `wrapInCode`, `channelInfoToString`, `booleanToString`, `msToString`,
  `stringList`, `ratioToString`.
- `role.ts`, `guild.ts`, `user.ts` — small `{ id, name, ... }` normalizers
  (`getRoleInfo`, `getGuildInfo`, `getUserInfo`) for storing lightweight
  Discord object references. Currently unused by any command in this repo
  (likely shared conventions carried over from a sibling bot).
- `channel.ts` — `getChannelInfo`, following the same pattern (`ChannelInfo`
  with an optional `parent`, matching what `fmt.ts`'s `channelInfoToString`
  expects). Added during the TypeScript migration: `crud.ts`'s
  `simpleChannel` option builder referenced a `./channel` module that never
  existed in the original JS codebase (dead code, since nothing used
  `simpleChannel`); this fixes that gap instead of just typing around it.
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

## Known gaps / scaffolding not yet wired up

- `interactions/buttons/` and `interactions/modals/` have no concrete
  handlers yet, only the auto-loading `index.ts`.
- `crudCommandUpdate` and most of `crudCommandOption` (channel/FK/attachment
  options) are unused by the current three commands — they're general
  infrastructure shared with (or ported from) another bot in this project
  family, available for future commands that need richer CRUD UX. Their
  generic types lean on some intentionally loose `any`/cast escape hatches
  (e.g. `retriever`'s return shape, and the `record[key] = value` dynamic
  field assignment in each `crudCommandOption.simple*` builder) since fully
  precise generics aren't worth the complexity for code no live command
  exercises yet.
- `util/guild.ts`, `util/user.ts`, `util/date.ts` are unused in this repo.
- `noUncheckedIndexedAccess` and other extra-strict `tsconfig` flags aren't
  enabled — `strict: true` is the current bar.
