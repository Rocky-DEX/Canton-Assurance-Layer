// Client components import server actions through this file so the module
// that also exports `acceptPendingInvitations` (server-only helper) never
// becomes part of a client bundle.
export { inviteAction, removeMemberAction, setRoleAction, revokeInvitationAction as removeInvitationActionAlias } from "./actions";
