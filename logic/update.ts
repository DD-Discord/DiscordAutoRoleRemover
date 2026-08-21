import { GuildMember, PartialGuildMember } from "discord.js";
import { checkPrerequisiteRules } from "./prerequisite.js";
import { checkConflictRules } from "./conflict.js";
import { checkPoolCapRules } from "./poolCap.js";

/**
 * Checks and applies all rule types for a guild member whose roles just changed.
 */
export async function maybeUpdateRoles(oldMember: GuildMember | PartialGuildMember, newMember: GuildMember): Promise<void> {
  await checkPrerequisiteRules(oldMember, newMember);
  await checkConflictRules(oldMember, newMember);
  await checkPoolCapRules(oldMember, newMember);
}
