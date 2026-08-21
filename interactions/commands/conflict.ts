import { PermissionFlagsBits } from "discord.js";
import { dbId } from "../../db.js";
import { crudCommandUpdate, crudCommandOption } from "../../crud.js";
import { conflictRuleData, ConflictRule } from "../../logic/conflict.js";

type Namespace = { guildId: string };

// Pool membership (poolIds) is managed separately via role-conflict-add-pool /
// role-conflict-remove-pool - Discord has no multi-select option type, so this
// command only handles the flat fields (name, alert channel).
export const { name, data, execute, autocomplete } = crudCommandUpdate<ConflictRule, Namespace>({
  name: 'role-conflict',
  description: 'Manages conflict rules: alerts when a member holds roles from 2+ mutually exclusive pools.',
  crud: conflictRuleData,
  options: [
    crudCommandOption.simpleString<ConflictRule>({ name: 'name', description: "The rule's display name.", required: true }),
    crudCommandOption.simpleChannel<ConflictRule>({ name: 'channel', description: 'Channel to alert when a conflict is detected.', key: 'alertChannel', required: true }),
  ],
  getDefault: interaction => ({
    id: dbId(),
    guildId: interaction.guildId!,
    name: '',
    poolIds: [],
    alertChannel: { id: '', name: '' },
  }),
  getNamespace: interaction => ({ guildId: interaction.guildId! }),
  defaultMemberPermissions: PermissionFlagsBits.ManageRoles,
});
