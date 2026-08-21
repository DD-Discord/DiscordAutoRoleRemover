import { GuildMember, PartialGuildMember } from "discord.js";
import { DbRecord } from "../db.js";
import { crudDefine, Crud } from "../crud.js";
import { channelInfoToString } from "../util/fmt.js";
import { RuleOutcome, sendAlert } from "./outcome.js";
import { rolePoolData } from "./rolePool.js";

/**
 * If a member loses their last role from `triggerPoolId`, strip whatever
 * roles they hold from `removePoolId` (or alert instead, per `action`).
 */
export interface PrerequisiteRule extends DbRecord, RuleOutcome {
  id: string;
  guildId: string;
  triggerPoolId: string;
  removePoolId: string;
}

function poolLabel(guildId: string, poolId: string): string {
  const pool = rolePoolData.get({ guildId }, poolId);
  return pool ? pool.name : `Unknown pool (\`${poolId}\`)`;
}

export const prerequisiteRuleData: Crud<PrerequisiteRule, { guildId: string }> = crudDefine<PrerequisiteRule, { guildId: string }>({
  name: 'prerequisite rule',
  getTable: ns => [ns.guildId, 'prerequisites'],
  formatShort: record => `\`${record.id}\`: ${poolLabel(record.guildId, record.triggerPoolId)} -> ${poolLabel(record.guildId, record.removePoolId)} (${record.action})`,
  formatFull: (record, template) => template().addFields(
    { name: 'Trigger pool', value: poolLabel(record.guildId, record.triggerPoolId) },
    { name: 'Remove pool', value: poolLabel(record.guildId, record.removePoolId) },
    { name: 'Outcome', value: record.action === 'fix' ? 'Auto-fix' : `Alert ${channelInfoToString(record.alertChannel)}` },
  ),
});

/**
 * Checks and applies prerequisite rules for a guild member whose roles just changed.
 */
export async function checkPrerequisiteRules(oldMember: GuildMember | PartialGuildMember, newMember: GuildMember): Promise<void> {
  const rules = prerequisiteRuleData.getAll({ guildId: newMember.guild.id });
  for (const rule of rules) {
    const triggerPool = rolePoolData.get({ guildId: rule.guildId }, rule.triggerPoolId);
    const removePool = rolePoolData.get({ guildId: rule.guildId }, rule.removePoolId);
    if (!triggerPool || !removePool) {
      continue;
    }

    const hadTrigger = triggerPool.roleIds.some(id => oldMember.roles.cache.has(id));
    const hasTrigger = triggerPool.roleIds.some(id => newMember.roles.cache.has(id));
    if (!hadTrigger || hasTrigger) {
      continue;
    }

    const rolesToRemove = removePool.roleIds.filter(id => newMember.roles.cache.has(id));
    if (rolesToRemove.length === 0) {
      continue;
    }

    if (rule.action === 'fix') {
      for (const roleId of rolesToRemove) {
        console.log(`Will remove ${roleId} from ${newMember.id} (${newMember.displayName})`);
        try {
          await newMember.roles.remove(roleId, `Auto remover: ${triggerPool.name}`);
        } catch (error) {
          console.log(`Failed to remove ${roleId} from ${newMember}`, error);
        }
      }
    } else {
      await sendAlert(
        newMember.guild,
        rule.alertChannel,
        `⚠️ ${newMember} lost their last role from pool **${triggerPool.name}** but still holds ` +
        `${rolesToRemove.map(id => `<@&${id}>`).join(', ')} from pool **${removePool.name}**.`,
      );
    }
  }
}
