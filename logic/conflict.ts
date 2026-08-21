import { GuildMember, PartialGuildMember } from "discord.js";
import { DbRecord } from "../db.js";
import { crudDefine, Crud } from "../crud.js";
import { maxLength, channelInfoToString } from "../util/fmt.js";
import { ChannelInfo } from "../util/channel.js";
import { sendAlert } from "./outcome.js";
import { rolePoolData, RolePool } from "./rolePool.js";

/**
 * 2+ mutually exclusive pools: if a member ends up with roles from 2+ of
 * them at once, that's a conflict. Alert-only — see logic/outcome.ts and the
 * project plan for why "fix" isn't offered here (no tie-break rule exists
 * for which pool should win).
 */
export interface ConflictRule extends DbRecord {
  id: string;
  guildId: string;
  name: string;
  poolIds: string[];
  alertChannel: ChannelInfo;
}

function poolLabel(guildId: string, poolId: string): string {
  const pool = rolePoolData.get({ guildId }, poolId);
  return pool ? pool.name : `Unknown pool (\`${poolId}\`)`;
}

export const conflictRuleData: Crud<ConflictRule, { guildId: string }> = crudDefine<ConflictRule, { guildId: string }>({
  name: 'conflict rule',
  getTable: ns => [ns.guildId, 'conflicts'],
  formatShort: record => `\`${record.id}\`: ${record.name} (${record.poolIds.length} pools)`,
  formatFull: (record, template) => template().addFields(
    { name: 'Pools', value: maxLength(record.poolIds.map(id => poolLabel(record.guildId, id)).join('\n') || 'None', 1000) },
    { name: 'Alert channel', value: channelInfoToString(record.alertChannel) },
  ),
});

/**
 * Checks conflict rules for a guild member whose roles just changed. Only
 * alerts when this specific update increased the number of represented
 * pools to 2+ (not on every subsequent unrelated role change while a
 * conflict persists).
 */
export async function checkConflictRules(oldMember: GuildMember | PartialGuildMember, newMember: GuildMember): Promise<void> {
  const rules = conflictRuleData.getAll({ guildId: newMember.guild.id });
  for (const rule of rules) {
    const pools = rule.poolIds
      .map(id => rolePoolData.get({ guildId: rule.guildId }, id))
      .filter((pool): pool is RolePool => pool !== null);

    const oldRepresented = pools.filter(pool => pool.roleIds.some(id => oldMember.roles.cache.has(id)));
    const newRepresented = pools.filter(pool => pool.roleIds.some(id => newMember.roles.cache.has(id)));

    if (newRepresented.length < 2 || newRepresented.length <= oldRepresented.length) {
      continue;
    }

    await sendAlert(
      newMember.guild,
      rule.alertChannel,
      `⚠️ Conflict **${rule.name}**: ${newMember} now holds roles from ${newRepresented.length} mutually exclusive pools: ${newRepresented.map(pool => `**${pool.name}**`).join(', ')}.`,
    );
  }
}
