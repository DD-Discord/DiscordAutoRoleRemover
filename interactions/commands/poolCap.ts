import { PermissionFlagsBits } from "discord.js";
import { dbId } from "../../db.js";
import { crudCommandUpdate, crudCommandOption } from "../../crud.js";
import { rolePoolData, RolePool } from "../../logic/rolePool.js";
import { poolCapRuleData, PoolCapRule } from "../../logic/poolCap.js";
import { getAlertSettings } from "../../logic/alertSettings.js";

type Namespace = { guildId: string };

export const { name, data, execute, autocomplete } = crudCommandUpdate<PoolCapRule, Namespace>({
  name: 'role-cap',
  description: 'Manages pool cap rules: limits how many roles from a pool a member may hold at once.',
  crud: poolCapRuleData,
  options: [
    crudCommandOption.simpleFk<PoolCapRule, RolePool, Namespace>({
      name: 'pool',
      description: 'The pool to cap.',
      key: 'poolId',
      fkCrud: rolePoolData,
      getFkNamespace: interaction => ({ guildId: interaction.guildId! }),
      required: true,
    }),
    crudCommandOption.simpleNumber<PoolCapRule>({
      name: 'max',
      description: 'Maximum roles from the pool a member may hold at once.',
      key: 'maxAllowed',
      min: 0,
      required: true,
    }),
    crudCommandOption.simpleBoolean<PoolCapRule>({
      name: 'fix',
      description: 'Auto-remove overflow roles. Only unambiguous when max is 0 - otherwise never fixes.',
      required: true,
    }),
    crudCommandOption.simpleBoolean<PoolCapRule>({
      name: 'alert',
      description: 'Notify the global alert channel on overflow. Independent of fix - both may be enabled.',
      required: true,
    }),
  ],
  getDefault: interaction => ({
    id: dbId(),
    guildId: interaction.guildId!,
    poolId: '',
    maxAllowed: 0,
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
