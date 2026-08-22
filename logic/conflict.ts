import { GuildMember, PartialGuildMember } from "discord.js";
import { DbRecord } from "../db.js";
import { crudDefine, Crud } from "../crud.js";
import { maxLength } from "../util/fmt.js";
import { sendAlert } from "./outcome.js";
import { rolePoolData, RolePool } from "./rolePool.js";
import { getAlertSettings } from "./alertSettings.js";

/**
 * 2+ mutually exclusive pools: if a member ends up with roles from 2+ of
 * them at once, that's a conflict. Always alerts (via the guild's global
 * alert settings) — see logic/outcome.ts and the project plan for why
 * "fix" isn't offered here (no tie-break rule exists for which pool should
 * win), which also means there's nothing left to toggle on this rule type.
 */
export interface ConflictRule extends DbRecord {
  id: string;
  guildId: string;
  name: string;
  poolIds: string[];
}

function poolLabel(guildId: string, poolId: string): string {
  const pool = rolePoolData.get({ guildId }, poolId);
  return pool ? pool.name : `Unknown pool (\`${poolId}\`)`;
}

export const conflictRuleData: Crud<ConflictRule, { guildId: string }> = crudDefine<ConflictRule, { guildId: string }>({
  name: 'conflict rule',
  getTable: ns => [ns.guildId, 'conflicts'],
  // Drops the old per-rule `alertChannel` field (now global) from any
  // record still carrying it - see prerequisite.ts's migrate hook for the
  // full rationale.
  migrate: record => {
    if (!record) return record;
    const legacy = record as unknown as Record<string, unknown>;
    if ('alertChannel' in legacy) {
      const { alertChannel, ...rest } = legacy;
      return rest as unknown as ConflictRule;
    }
    return record;
  },
  formatShort: record => `\`${record.id}\`: ${record.name} (${record.poolIds.length} pools)`,
  formatFull: (record, template) => template().addFields(
    { name: 'Pools', value: maxLength(record.poolIds.map(id => poolLabel(record.guildId, id)).join('\n') || 'None', 1000) },
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

    const clashLines = newRepresented.map(pool => {
      const heldRoleIds = pool.roleIds.filter(id => newMember.roles.cache.has(id));
      return `- **${pool.name}**: ${heldRoleIds.map(id => `<@&${id}>`).join(', ')}`;
    });

    await sendAlert(
      newMember.guild,
      getAlertSettings(rule.guildId),
      `__⚠️ Conflict **${rule.name}**__\n${newMember} now holds roles from ${newRepresented.length} mutually exclusive pools:\n${clashLines.join('\n')}`,
    );
  }
}
