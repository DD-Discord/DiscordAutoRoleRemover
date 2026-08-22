import { GuildMember, PartialGuildMember } from "discord.js";
import { DbRecord } from "../db.js";
import { crudDefine, Crud } from "../crud.js";
import { RuleOutcome, sendAlert } from "./outcome.js";
import { rolePoolData } from "./rolePool.js";
import { getAlertSettings } from "./alertSettings.js";

/**
 * A single pool with a max-allowed count: if a member holds more than that
 * from the pool, that's an overflow. `fix` and `alert` are independent -
 * see checkPoolCapRules for why `fix` is only ever attempted at `maxAllowed
 * === 0`.
 */
export interface PoolCapRule extends DbRecord, RuleOutcome {
  id: string;
  guildId: string;
  poolId: string;
  maxAllowed: number;
}

function poolLabel(guildId: string, poolId: string): string {
  const pool = rolePoolData.get({ guildId }, poolId);
  return pool ? pool.name : `Unknown pool (\`${poolId}\`)`;
}

export const poolCapRuleData: Crud<PoolCapRule, { guildId: string }> = crudDefine<PoolCapRule, { guildId: string }>({
  name: 'pool cap rule',
  getTable: ns => [ns.guildId, 'caps'],
  // Upgrades records still in the old `action: 'fix'|'alert'` + per-rule
  // `alertChannel` shape - see prerequisite.ts's migrate for the full
  // rationale (same reasoning applies here).
  migrate: record => {
    if (!record) return record;
    const legacy = record as unknown as Record<string, unknown>;
    if (typeof legacy.action === 'string') {
      const { action, alertChannel, ...rest } = legacy;
      return { ...rest, fix: action === 'fix', alert: action === 'alert' } as PoolCapRule;
    }
    return record;
  },
  formatShort: record => `\`${record.id}\`: ${poolLabel(record.guildId, record.poolId)} (max ${record.maxAllowed}, ${[record.fix && 'fix', record.alert && 'alert'].filter(Boolean).join('+')})`,
  formatFull: (record, template) => template().addFields(
    { name: 'Pool', value: poolLabel(record.guildId, record.poolId) },
    { name: 'Max allowed', value: String(record.maxAllowed) },
    { name: 'Auto-fix', value: record.fix ? 'Yes (only unambiguous at max: 0)' : 'No' },
    { name: 'Alert', value: record.alert ? 'Yes' : 'No' },
  ),
});

/**
 * Checks pool-cap rules for a guild member whose roles just changed. Only
 * acts when this specific update pushed the held count above the cap (not
 * on every subsequent unrelated role change while an overflow persists).
 *
 * "Fix" is only unambiguous when `maxAllowed === 0` (remove everything from
 * the pool - no subset choice to make). Any overflow above that never gets
 * auto-fixed - `alert` fires if enabled, otherwise the overflow is silently
 * left alone (there's no tie-break rule for which extra role(s) to drop, and
 * per the rework, `alert: false` is respected strictly rather than forcing a
 * fallback alert).
 */
export async function checkPoolCapRules(oldMember: GuildMember | PartialGuildMember, newMember: GuildMember): Promise<void> {
  const rules = poolCapRuleData.getAll({ guildId: newMember.guild.id });
  for (const rule of rules) {
    const pool = rolePoolData.get({ guildId: rule.guildId }, rule.poolId);
    if (!pool) {
      continue;
    }

    const oldHeld = pool.roleIds.filter(id => oldMember.roles.cache.has(id));
    const newHeld = pool.roleIds.filter(id => newMember.roles.cache.has(id));

    if (newHeld.length <= rule.maxAllowed || newHeld.length <= oldHeld.length) {
      continue;
    }

    const unambiguous = rule.maxAllowed === 0;
    let fixed = false;
    if (unambiguous && rule.fix) {
      for (const roleId of newHeld) {
        console.log(`Will remove ${roleId} from ${newMember.id} (${newMember.displayName}) - pool cap`);
        try {
          await newMember.roles.remove(roleId, `Pool cap: ${pool.name}`);
        } catch (error) {
          console.log(`Failed to remove ${roleId} from ${newMember}`, error);
        }
      }
      fixed = true;
    }

    if (rule.alert) {
      const heading = fixed
        ? `__✅ Pool cap **${pool.name}**__`
        : `__⚠️ Pool cap **${pool.name}**__`;
      const body = fixed
        ? `${newMember} exceeded max ${rule.maxAllowed} for this pool - auto-removed ${newHeld.map(id => `<@&${id}>`).join(', ')}.`
        : `${newMember} holds ${newHeld.length} roles (max ${rule.maxAllowed}): ${newHeld.map(id => `<@&${id}>`).join(', ')}.`;
      await sendAlert(newMember.guild, getAlertSettings(rule.guildId), `${heading}\n${body}`);
    }
  }
}
