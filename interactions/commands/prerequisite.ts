import { PermissionFlagsBits } from "discord.js";
import { dbId } from "../../db.js";
import { crudCommandUpdate, crudCommandOption } from "../../crud.js";
import { rolePoolData, RolePool } from "../../logic/rolePool.js";
import { prerequisiteRuleData, PrerequisiteRule } from "../../logic/prerequisite.js";

type Namespace = { guildId: string };

export const { name, data, execute, autocomplete } = crudCommandUpdate<PrerequisiteRule, Namespace>({
  name: 'role-prereq',
  description: 'Strips a pool of roles from members who lose their last role from a trigger pool.',
  crud: prerequisiteRuleData,
  options: [
    crudCommandOption.simpleFk<PrerequisiteRule, RolePool, Namespace>({
      name: 'trigger',
      description: 'The pool whose absence triggers this rule.',
      key: 'triggerPoolId',
      fkCrud: rolePoolData,
      getFkNamespace: interaction => ({ guildId: interaction.guildId! }),
      required: true,
    }),
    crudCommandOption.simpleFk<PrerequisiteRule, RolePool, Namespace>({
      name: 'remove',
      description: 'The pool of roles to strip.',
      key: 'removePoolId',
      fkCrud: rolePoolData,
      getFkNamespace: interaction => ({ guildId: interaction.guildId! }),
      required: true,
    }),
    crudCommandOption.simpleChoice<PrerequisiteRule>({
      name: 'outcome',
      description: 'What to do when the rule triggers.',
      key: 'action',
      choices: [
        { name: 'Auto-fix (remove the roles)', value: 'fix' },
        { name: 'Alert a channel', value: 'alert' },
      ],
      required: true,
    }),
    crudCommandOption.simpleChannel<PrerequisiteRule>({
      name: 'channel',
      description: 'Channel to alert (also used as a fallback destination if auto-fixing turns out ambiguous).',
      key: 'alertChannel',
      required: true,
    }),
  ],
  getDefault: interaction => ({
    id: dbId(),
    guildId: interaction.guildId!,
    triggerPoolId: '',
    removePoolId: '',
    action: 'fix',
    alertChannel: { id: '', name: '' },
  }),
  getNamespace: interaction => ({ guildId: interaction.guildId! }),
  defaultMemberPermissions: PermissionFlagsBits.ManageRoles,
});
