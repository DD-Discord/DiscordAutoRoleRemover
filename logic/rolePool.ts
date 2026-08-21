import { DbRecord } from "../db.js";
import { crudDefine, Crud } from "../crud.js";
import { maxLength } from "../util/fmt.js";

/**
 * A named, reusable set of role IDs, referenced by prerequisite/conflict/cap
 * rules instead of each rule inlining its own role list.
 */
export interface RolePool extends DbRecord {
  id: string;
  guildId: string;
  name: string;
  roleIds: string[];
}

export const rolePoolData: Crud<RolePool, { guildId: string }> = crudDefine<RolePool, { guildId: string }>({
  name: 'role pool',
  getTable: ns => [ns.guildId, 'pools'],
  formatShort: record => `\`${record.id}\`: ${record.name} (${record.roleIds.length} roles)`,
  formatFull: (record, template) => template().addFields(
    { name: 'Roles', value: maxLength(record.roleIds.map(id => `<@&${id}>`).join('\n') || 'None', 1000) }
  ),
});
