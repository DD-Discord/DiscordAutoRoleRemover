import { GuildMember, PartialGuildMember } from "discord.js";
import { DbRecord } from "../db.js";
import { crudDefine, Crud } from "../crud.js";
import { channelInfoToString } from "../util/fmt.js";
import { RuleOutcome, sendAlert } from "./outcome.js";
import { rolePoolData } from "./rolePool.js";

/**
 * A single pool with a max-allowed count: if a member holds more than that
 * from the pool, that's an overflow.
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
  formatShort: record => `\`${record.id}\`: ${poolLabel(record.guildId, record.poolId)} (max ${record.maxAllowed}, ${record.action})`,
  formatFull: (record, template) => template().addFields(
    { name: 'Pool', value: poolLabel(record.guildId, record.poolId) },
    { name: 'Max allowed', value: String(record.maxAllowed) },
    { name: 'Outcome', value: record.action === 'fix' ? 'Auto-fix' : `Alert ${channelInfoToString(record.alertChannel)}` },
  ),
});

/**
 * Checks pool-cap rules for a guild member whose roles just changed. Only
 * acts when this specific update pushed the held count above the cap (not
 * on every subsequent unrelated role change while an overflow persists).
 *
 * "Fix" is only unambiguous when `maxAllowed === 0` (remove everything from
 * the pool - no subset choice to make). Any overflow above that always
 * alerts regardless of the configured action, since there's no tie-break
 * rule for which extra role(s) to drop.
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

    if (rule.maxAllowed === 0 && rule.action === 'fix') {
      for (const roleId of newHeld) {
        console.log(`Will remove ${roleId} from ${newMember.id} (${newMember.displayName}) - pool cap`);
        try {
          await newMember.roles.remove(roleId, `Pool cap: ${pool.name}`);
        } catch (error) {
          console.log(`Failed to remove ${roleId} from ${newMember}`, error);
        }
      }
      continue;
    }

    // Either action === 'alert', or an ambiguous (maxAllowed >= 1) overflow
    // that can't be auto-fixed without a tie-break rule.
    await sendAlert(
      newMember.guild,
      rule.alertChannel,
      `__⚠️ Pool cap **${pool.name}**__\n${newMember} holds ${newHeld.length} roles (max ${rule.maxAllowed}): ${newHeld.map(id => `<@&${id}>`).join(', ')}.`,
    );
  }
}
