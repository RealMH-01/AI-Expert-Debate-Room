export interface SpectatorCapabilities {
  canView: boolean
  canSubmitIntervention: boolean
  canDecideMemory: boolean
  canManageProjectMemory: boolean
  canMutateSession: boolean
}

export function getSpectatorCapabilities(enabled: boolean): SpectatorCapabilities {
  return {
    canView: true,
    canSubmitIntervention: !enabled,
    canDecideMemory: !enabled,
    canManageProjectMemory: !enabled,
    canMutateSession: !enabled
  }
}
