import { GuildMember, PartialGuildMember } from "discord.js";
import { DbRecord } from "../db.js";
import { crudDefine, Crud } from "../crud.js";
import { RuleOutcome, sendAlert } from "./outcome.js";
import { rolePoolData } from "./rolePool.js";
import { getAlertSettings } from "./alertSettings.js";

/**
 * If a member loses their last role from `requiredPoolId`, act on whatever
 * roles they hold from `dependentPoolId` - `fix` removes them, `alert`
 * notifies, both are independent and either or both may be enabled.
 */
export interface PrerequisiteRule extends DbRecord, RuleOutcome {
  id: string;
  guildId: string;
  requiredPoolId: string;
  dependentPoolId: string;
}

function poolLabel(guildId: string, poolId: string): string {
  const pool = rolePoolData.get({ guildId }, poolId);
  return pool ? pool.name : `Unknown pool (\`${poolId}\`)`;
}

export const prerequisiteRuleData: Crud<PrerequisiteRule, { guildId: string }> = crudDefine<PrerequisiteRule, { guildId: string }>({
  name: 'prerequisite rule',
  getTable: ns => [ns.guildId, 'prerequisites'],
  // Upgrades records still in the old `action: 'fix'|'alert'` + per-rule
  // `alertChannel` shape (pre-global-alert-settings). Runs transparently on
  // read; the migrated shape gets persisted the next time the record is
  // written. Can't populate the new global alertSettingsData table from
  // here - a migrate hook only transforms its own record.
  migrate: record => {
    if (!record) return record;
    const legacy = record as unknown as Record<string, unknown>;
    if (typeof legacy.action === 'string') {
      const { action, alertChannel, ...rest } = legacy;
      return { ...rest, fix: action === 'fix', alert: action === 'alert' } as PrerequisiteRule;
    }
    return record;
  },
  formatShort: record => `\`${record.id}\`: ${poolLabel(record.guildId, record.requiredPoolId)} -> ${poolLabel(record.guildId, record.dependentPoolId)} (${[record.fix && 'fix', record.alert && 'alert'].filter(Boolean).join('+')})`,
  formatFull: (record, template) => template().addFields(
    { name: 'Required pool', value: poolLabel(record.guildId, record.requiredPoolId) },
    { name: 'Dependent pool', value: poolLabel(record.guildId, record.dependentPoolId) },
    { name: 'Auto-fix', value: record.fix ? 'Yes' : 'No' },
    { name: 'Alert', value: record.alert ? 'Yes' : 'No' },
  ),
});

/**
 * Checks and applies prerequisite rules for a guild member whose roles just changed.
 */
export async function checkPrerequisiteRules(oldMember: GuildMember | PartialGuildMember, newMember: GuildMember): Promise<void> {
  const rules = prerequisiteRuleData.getAll({ guildId: newMember.guild.id });
  for (const rule of rules) {
    const requiredPool = rolePoolData.get({ guildId: rule.guildId }, rule.requiredPoolId);
    const dependentPool = rolePoolData.get({ guildId: rule.guildId }, rule.dependentPoolId);
    if (!requiredPool || !dependentPool) {
      continue;
    }

    const hadRequired = requiredPool.roleIds.some(id => oldMember.roles.cache.has(id));
    const hasRequired = requiredPool.roleIds.some(id => newMember.roles.cache.has(id));
    if (!hadRequired || hasRequired) {
      continue;
    }

    const rolesToRemove = dependentPool.roleIds.filter(id => newMember.roles.cache.has(id));
    if (rolesToRemove.length === 0) {
      continue;
    }

    if (rule.fix) {
      for (const roleId of rolesToRemove) {
        console.log(`Will remove ${roleId} from ${newMember.id} (${newMember.displayName})`);
        try {
          await newMember.roles.remove(roleId, `Auto remover: ${requiredPool.name}`);
        } catch (error) {
          console.log(`Failed to remove ${roleId} from ${newMember}`, error);
        }
      }
    }

    if (rule.alert) {
      const heading = rule.fix
        ? `__✅ Prerequisite **${requiredPool.name} → ${dependentPool.name}**__`
        : `__⚠️ Prerequisite **${requiredPool.name} → ${dependentPool.name}**__`;
      const body = rule.fix
        ? `${newMember} lost **${requiredPool.name}** - auto-removed ${rolesToRemove.map(id => `<@&${id}>`).join(', ')} from **${dependentPool.name}**.`
        : `${newMember} no longer has **${requiredPool.name}**, but still holds ${rolesToRemove.map(id => `<@&${id}>`).join(', ')} from **${dependentPool.name}**.`;
      await sendAlert(newMember.guild, getAlertSettings(rule.guildId), `${heading}\n${body}`, newMember);
    }
  }
}
