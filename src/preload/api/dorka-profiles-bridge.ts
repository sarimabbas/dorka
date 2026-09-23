import { ipcRenderer } from 'electron'
import type { PreloadApi } from '../api-types'
import { DORKA_PROFILE_AUTH_STATUS_CHANGED_CHANNEL } from '../../shared/dorka-profiles'

export const dorkaProfilesApi = {
  list: () => ipcRenderer.invoke('dorkaProfiles:list'),
  authStatus: () => ipcRenderer.invoke('dorkaProfiles:authStatus'),
  onAuthStatusChanged: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on(DORKA_PROFILE_AUTH_STATUS_CHANGED_CHANNEL, listener)
    return () => ipcRenderer.removeListener(DORKA_PROFILE_AUTH_STATUS_CHANGED_CHANNEL, listener)
  },
  createLocal: (args) => ipcRenderer.invoke('dorkaProfiles:createLocal', args),
  createCloudLinked: (args) => ipcRenderer.invoke('dorkaProfiles:createCloudLinked', args),
  switchProfile: (args) => ipcRenderer.invoke('dorkaProfiles:switch', args),
  transferProject: (args) => ipcRenderer.invoke('dorkaProfiles:transferProject', args),
  findProjectProfiles: (args) => ipcRenderer.invoke('dorkaProfiles:findProjectProfiles', args),
  connectCurrent: () => ipcRenderer.invoke('dorkaProfiles:connectCurrent'),
  refreshAuth: () => ipcRenderer.invoke('dorkaProfiles:refreshAuth'),
  signOutCurrent: () => ipcRenderer.invoke('dorkaProfiles:signOutCurrent'),
  selectOrg: (args) => ipcRenderer.invoke('dorkaProfiles:selectOrg', args),
  orgMembersList: (args) => ipcRenderer.invoke('dorkaProfiles:orgMembersList', args),
  orgMemberInvite: (args) => ipcRenderer.invoke('dorkaProfiles:orgMemberInvite', args),
  orgInviteRevoke: (args) => ipcRenderer.invoke('dorkaProfiles:orgInviteRevoke', args),
  orgMemberChangeRole: (args) => ipcRenderer.invoke('dorkaProfiles:orgMemberChangeRole', args),
  orgMemberRemove: (args) => ipcRenderer.invoke('dorkaProfiles:orgMemberRemove', args)
} satisfies PreloadApi['dorkaProfiles']
