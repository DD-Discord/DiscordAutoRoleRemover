import { PermissionFlagsBits } from "discord.js";
import { dbId } from "../../db.js";
import { crudCommandUpdate, crudCommandOption } from "../../crud.js";
import { rolePoolData, RolePool } from "../../logic/rolePool.js";
import { prerequisiteRuleData, PrerequisiteRule } from "../../logic/prerequisite.js";
import { getAlertSettings } from "../../logic/alertSettings.js";

type Namespace = { guildId: string };

export const { name, data, execute, autocomplete } = crudCommandUpdate<PrerequisiteRule, Namespace>({
  name: 'role-prereq',
  description: 'Strips a pool of dependent roles from members who lose their last required role.',
  crud: prerequisiteRuleData,
  options: [
    crudCommandOption.simpleFk<PrerequisiteRule, RolePool, Namespace>({
      name: 'required',
      description: 'The pool whose absence triggers this rule.',
      key: 'requiredPoolId',
      fkCrud: rolePoolData,
      getFkNamespace: interaction => ({ guildId: interaction.guildId! }),
      required: true,
    }),
    crudCommandOption.simpleFk<PrerequisiteRule, RolePool, Namespace>({
      name: 'dependent',
      description: 'The pool of roles to act on.',
      key: 'dependentPoolId',
      fkCrud: rolePoolData,
      getFkNamespace: interaction => ({ guildId: interaction.guildId! }),
      required: true,
    }),
    crudCommandOption.simpleBoolean<PrerequisiteRule>({
      name: 'fix',
      description: 'Auto-remove the dependent roles when the rule triggers.',
      required: true,
    }),
    crudCommandOption.simpleBoolean<PrerequisiteRule>({
      name: 'alert',
      description: 'Notify the global alert channel when the rule triggers. Independent of fix - both may be enabled.',
      required: true,
    }),
  ],
  getDefault: interaction => ({
    id: dbId(),
    guildId: interaction.guildId!,
    requiredPoolId: '',
    dependentPoolId: '',
    fix: false,
    alert: false,
  }),
  getNamespace: interaction => ({ guildId: interaction.guildId! }),
  validate: record => {
    const errors: string[] = [];
    if (!record.fix && !record.alert) {
      errors.push("At least one of `fix`/`alert` must be enabled - a rule that does neither has no effect.");
    }
    if (record.alert && !getAlertSettings(record.guildId).alertChannel) {
      errors.push("No global alert channel configured yet - run `/role-alerts set-channel` first.");
    }
    return errors;
  },
  defaultMemberPermissions: PermissionFlagsBits.ManageRoles,
});
