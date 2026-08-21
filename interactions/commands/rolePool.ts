import { PermissionFlagsBits } from "discord.js";
import { dbId } from "../../db.js";
import { crudCommandUpdate, crudCommandOption } from "../../crud.js";
import { rolePoolData, RolePool } from "../../logic/rolePool.js";

type Namespace = { guildId: string };

export const { name, data, execute, autocomplete } = crudCommandUpdate<RolePool, Namespace>({
  name: 'role-pool',
  description: 'Manages role pools (named sets of roles referenced by other rules).',
  crud: rolePoolData,
  options: [
    crudCommandOption.simpleString<RolePool>({ name: 'name', description: "The pool's display name.", required: true }),
  ],
  getDefault: interaction => ({ id: dbId(), guildId: interaction.guildId!, name: '', roleIds: [] }),
  getNamespace: interaction => ({ guildId: interaction.guildId! }),
  defaultMemberPermissions: PermissionFlagsBits.ManageRoles,
});
