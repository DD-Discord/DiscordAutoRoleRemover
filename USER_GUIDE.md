# Role Auto Remover — Setup Guide

This bot watches your server's roles and automatically keeps them in line
with rules you configure — auto-fixing problems, notifying your mod team,
or both at once.

All commands below require **Manage Roles** permission to use. The bot's
own role also needs **Manage Webhooks** permission in whichever channel
you use for alerts (see below) — if you pick a thread, that permission is
needed in the thread's parent channel, since Discord webhooks live on the
parent, not the thread itself.

## Alert settings: one shared channel + ping list

Before creating any rule that alerts, configure where those alerts go —
one channel and one ping list, shared by every rule in the server (not
per-rule).

| Command | What it does |
|---|---|
| `/role-alerts set-channel channel:<#channel>` | Sets the channel alerts are posted to (a text/announcement channel, or a thread inside one). |
| `/role-alerts add-ping target:<@role-or-user>` | Adds a role or user to ping on every alert. |
| `/role-alerts remove-ping target:<@role-or-user>` | Removes one. |
| `/role-alerts check` | Shows the current channel and ping list. |

You must run `set-channel` at least once before any rule can have alerting
turned on — creating a rule with `alert:true` before that is configured is
rejected with a clear error.

**Alerts show up as the reported member, not the bot.** Behind the
scenes, `set-channel` creates a webhook in that channel, and every alert
is posted through it with the display name and avatar of whichever member
triggered the rule — so it visually reads like the member is speaking up
about themselves, not a generic bot notification. This needs the **Manage
Webhooks** permission for the bot in that channel; if you ever delete
that webhook by hand (Discord's channel Integrations settings), the bot
just quietly creates a new one the next time an alert fires — nothing to
reconfigure.

## The building block: Role Pools

Everything starts with a **role pool** — a named group of one or more
roles. You'll always create pools first, then build rules on top of them.
Even a rule about a single role (like "is boosting") is just a pool with
one role in it.

**Commands:**

| Command | What it does |
|---|---|
| `/role-pool manage name:<text>` | Creates a new pool (leave `id` blank), or renames an existing one (pick it via `id`). |
| `/role-pool manage id:<pool>` | Shows a pool's details without changing anything. |
| `/role-pool manage id:<pool> delete:true` | Deletes a pool. |
| `/role-pool manage id:all` | Lists every pool in the server. |
| `/role-pool add-role pool:<pool> role:<@role>` | Adds a role to a pool. |
| `/role-pool remove-role pool:<pool> role:<@role>` | Removes a role from a pool. |

`id` fields are autocompleted — start typing a pool's name and Discord
will suggest it.

**Example:** create a "Booster Colours" pool and add three color roles to it:

```
/role-pool manage name:Booster Colours
/role-pool add-role pool:Booster Colours role:@Sunshine Yellow
/role-pool add-role pool:Booster Colours role:@Snowflake Blue
/role-pool add-role pool:Booster Colours role:@Grassy Green
```

## Fix and alert: independent, not either/or

Every rule below has two independent switches — enable one, the other, or
both:

- **`fix`** — auto-remove the offending role(s) immediately.
- **`alert`** — notify the configured alert channel (and ping list).

A rule needs at least one enabled — creating one with both `fix:false` and
`alert:false` is rejected, since it wouldn't do anything. Some situations
genuinely can't be safely auto-fixed even with `fix:true` (covered per rule
type below); in those cases, `alert` is the only thing that can ever fire,
and if `alert` is also off, the bot does nothing at all for that case —
there's no forced fallback notification.

## Rule type 1: Prerequisite rules

**"If a member loses their last role from pool A, act on pool B."**

The original use case for this bot: when someone stops boosting the
server, strip their custom colour role. More generally: pick a
**required** pool and a **dependent** pool — when a member has none of
the required pool's roles left (having previously had at least one), the
bot acts on whichever dependent-pool roles they still hold. This case is
always unambiguous, so `fix` and `alert` both work exactly as you'd
expect, together or separately.

**Command:** `/role-prereq` (one flat command, no subcommands)

| Option | Meaning |
|---|---|
| `required` | The pool that must be held. Losing your last role from here triggers the rule. |
| `dependent` | The pool of roles to act on when that happens. |
| `fix` | Auto-remove the dependent roles the member still holds. |
| `alert` | Notify the alert channel. If `fix` is also on, the alert reads as a confirmation of what was auto-removed; if `fix` is off, it's a "needs attention" notice. |
| `id` / `delete` | Same edit/view/delete/list-all pattern as `/role-pool manage`. |

**Example:** strip booster colours when someone stops boosting, and log it.

```
/role-alerts set-channel channel:#mod-log

/role-pool manage name:Booster
/role-pool add-role pool:Booster role:@Server Booster

/role-prereq required:Booster dependent:Booster Colours fix:true alert:true
```

Now, the moment a member loses the Server Booster role, the bot removes
any of the three colour roles they still have, and posts a confirmation
to `#mod-log`.

## Rule type 2: Conflict rules

**"These pools shouldn't overlap — alert me if a member ends up in 2+ of them."**

For roles meant to be mutually exclusive — gender roles, region roles,
tiers that shouldn't stack. Unlike the other rule types, conflict rules
are **always alert-only** — there's no `fix` switch at all, since there's
no reliable way for the bot to guess which role should "win." A human
always makes that call.

**Command:** `/role-conflict` (with subcommands)

| Subcommand | What it does |
|---|---|
| `/role-conflict manage name:<text>` | Creates a new rule, or edits/views/deletes/lists existing ones via `id`/`delete`, same as `/role-pool manage`. |
| `/role-conflict add-pool rule:<rule> pool:<pool>` | Adds a pool to the mutually-exclusive set. |
| `/role-conflict remove-pool rule:<rule> pool:<pool>` | Removes a pool from the set. |

A rule needs **at least 2 pools** added before it can actually detect
anything.

**Example:** alert if someone has both a "Male" and "Female" role.

```
/role-pool manage name:Male Roles
/role-pool add-role pool:Male Roles role:@Male
/role-pool add-role pool:Male Roles role:@Transmasc

/role-pool manage name:Female Roles
/role-pool add-role pool:Female Roles role:@Female
/role-pool add-role pool:Female Roles role:@Transfemme

/role-conflict manage name:Gender
/role-conflict add-pool rule:Gender pool:Male Roles
/role-conflict add-pool rule:Gender pool:Female Roles
```

If a member ends up with both `@Male` and `@Female`, the alert channel
gets a message (with your configured pings) naming the member and exactly
which roles are clashing.

## Rule type 3: Pool cap rules

**"No more than N roles from this pool at once."**

Caps how many roles from a single pool a member may hold simultaneously —
useful for things like limiting how many "flair" or "tag" roles someone
can stack.

**Command:** `/role-cap` (one flat command, no subcommands)

| Option | Meaning |
|---|---|
| `pool` | The pool to cap. |
| `max` | Maximum roles from the pool allowed at once. |
| `fix` | Auto-remove overflow roles — see the important note below. |
| `alert` | Notify the alert channel on overflow. |

**Important**: `fix` only ever does anything when `max` is `0` (i.e. "no
roles from this pool allowed at all" — there's nothing to choose between,
so the bot just removes everything). For any `max` of `1` or higher, an
overflow is **never auto-fixed**, regardless of `fix` — the bot has no way
to know which of the extra roles should go. Only `alert` can react to that
case, and only if you enabled it; with `alert:false` the bot does nothing
at all when that happens.

**Example:** cap "special tag" roles at 2 per member, alerting if someone
exceeds that.

```
/role-pool manage name:Special Tags
/role-pool add-role pool:Special Tags role:@Veteran
/role-pool add-role pool:Special Tags role:@Contest Winner
/role-pool add-role pool:Special Tags role:@Event Staff

/role-cap pool:Special Tags max:2 fix:false alert:true
```

## Quick reference

| I want to... | Use |
|---|---|
| Set where alerts go and who gets pinged | `/role-alerts set-channel`, `add-ping`, `remove-ping` |
| Group roles together | `/role-pool manage`, `/role-pool add-role`, `/role-pool remove-role` |
| Remove roles when a member loses another role | `/role-prereq` |
| Get notified when incompatible roles overlap | `/role-conflict manage`, `/role-conflict add-pool`, `/role-conflict remove-pool` |
| Limit how many roles from a group someone can have | `/role-cap` |
| See everything currently configured | run any `manage` command (or `/role-prereq` / `/role-cap`) with `id:all`, or `/role-alerts check` |
| Remove a rule or pool | run its `manage` command (or the flat command) with `id:<it>` and `delete:true` |

## Tips

- Every `manage`-style command follows the same pattern: no `id` creates
  new, `id:<thing>` views or edits, `id:<thing> delete:true` deletes,
  `id:all` lists everything. `id` is autocompleted, so just start typing.
- `fix` and `alert` are independent on every rule that has both — turn on
  just one, or both together for an auto-fix-and-log-it setup.
- A rule needs at least one of `fix`/`alert` enabled, and `alert` can't be
  turned on before `/role-alerts set-channel` has been run at least once.
- Rules only react to role changes that happen **while the bot is
  online** — it doesn't scan for existing problems on startup, only new
  ones from that point on.
