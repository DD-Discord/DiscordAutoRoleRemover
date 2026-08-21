import { PermissionFlagsBits } from "discord.js";
import { dbId } from "../../db.js";
import { crudCommandUpdate, crudCommandOption } from "../../crud.js";
import { rolePoolData, RolePool } from "../../logic/rolePool.js";
import { poolCapRuleData, PoolCapRule } from "../../logic/poolCap.js";

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
    crudCommandOption.simpleChoice<PoolCapRule>({
      name: 'outcome',
      description: 'What to do when the rule triggers. Only unambiguous when max is 0 - otherwise always alerts.',
      key: 'action',
      choices: [
        { name: 'Auto-fix (remove the roles)', value: 'fix' },
        { name: 'Alert a channel', value: 'alert' },
      ],
      required: true,
    }),
    crudCommandOption.simpleChannel<PoolCapRule>({
      name: 'channel',
      description: 'Channel to alert (also used as a fallback destination if auto-fixing turns out ambiguous).',
      key: 'alertChannel',
      required: true,
    }),
  ],
  getDefault: interaction => ({
    id: dbId(),
    guildId: interaction.guildId!,
    poolId: '',
    maxAllowed: 0,
    action: 'fix',
    alertChannel: { id: '', name: '' },
  }),
  getNamespace: interaction => ({ guildId: interaction.guildId! }),
  defaultMemberPermissions: PermissionFlagsBits.ManageRoles,
});
