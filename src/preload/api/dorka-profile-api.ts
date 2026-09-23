import type {
  ConnectCurrentDorkaProfileResult,
  CreateCloudLinkedDorkaProfileArgs,
  CreateCloudLinkedDorkaProfileResult,
  CreateLocalDorkaProfileArgs,
  CreateLocalDorkaProfileResult,
  FindDorkaProfileProjectsByPathArgs,
  FindDorkaProfileProjectsByPathResult,
  DorkaProfileAuthStatus,
  DorkaProfileListResult,
  DorkaProfileOrgInviteRevokeArgs,
  DorkaProfileOrgMemberChangeRoleArgs,
  DorkaProfileOrgMemberInviteArgs,
  DorkaProfileOrgMemberMutationResult,
  DorkaProfileOrgMemberRemoveArgs,
  DorkaProfileOrgMembersListArgs,
  DorkaProfileOrgMembersListResult,
  RefreshCurrentDorkaProfileAuthResult,
  SelectDorkaProfileOrgArgs,
  SelectDorkaProfileOrgResult,
  SignOutCurrentDorkaProfileResult,
  SwitchDorkaProfileArgs,
  SwitchDorkaProfileResult,
  TransferDorkaProfileProjectArgs,
  TransferDorkaProfileProjectResult
} from '../../shared/dorka-profiles'

export type DorkaProfileApi = {
  list: () => Promise<DorkaProfileListResult>
  authStatus: () => Promise<DorkaProfileAuthStatus>
  /** Fires when main changed the stored auth status on its own (e.g. a revoked session). */
  onAuthStatusChanged: (callback: () => void) => () => void
  createLocal: (args?: CreateLocalDorkaProfileArgs) => Promise<CreateLocalDorkaProfileResult>
  createCloudLinked: (
    args?: CreateCloudLinkedDorkaProfileArgs
  ) => Promise<CreateCloudLinkedDorkaProfileResult>
  switchProfile: (args: SwitchDorkaProfileArgs) => Promise<SwitchDorkaProfileResult>
  transferProject: (
    args: TransferDorkaProfileProjectArgs
  ) => Promise<TransferDorkaProfileProjectResult>
  findProjectProfiles: (
    args: FindDorkaProfileProjectsByPathArgs
  ) => Promise<FindDorkaProfileProjectsByPathResult>
  connectCurrent: () => Promise<ConnectCurrentDorkaProfileResult>
  refreshAuth: () => Promise<RefreshCurrentDorkaProfileAuthResult>
  signOutCurrent: () => Promise<SignOutCurrentDorkaProfileResult>
  selectOrg: (args: SelectDorkaProfileOrgArgs) => Promise<SelectDorkaProfileOrgResult>
  orgMembersList: (args: DorkaProfileOrgMembersListArgs) => Promise<DorkaProfileOrgMembersListResult>
  orgMemberInvite: (
    args: DorkaProfileOrgMemberInviteArgs
  ) => Promise<DorkaProfileOrgMemberMutationResult>
  orgInviteRevoke: (
    args: DorkaProfileOrgInviteRevokeArgs
  ) => Promise<DorkaProfileOrgMemberMutationResult>
  orgMemberChangeRole: (
    args: DorkaProfileOrgMemberChangeRoleArgs
  ) => Promise<DorkaProfileOrgMemberMutationResult>
  orgMemberRemove: (
    args: DorkaProfileOrgMemberRemoveArgs
  ) => Promise<DorkaProfileOrgMemberMutationResult>
}
