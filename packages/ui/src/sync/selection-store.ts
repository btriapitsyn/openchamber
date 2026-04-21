/**
 * Selection Store — per-session model, agent, and variant selections.
 * Extracted from session-ui-store for subscription isolation.
 */

import { create } from "zustand"

export type SelectionState = {
  sessionModelSelections: Map<string, { providerId: string; modelId: string }>
  sessionAgentSelections: Map<string, string>
  sessionAgentModelSelections: Map<string, Map<string, { providerId: string; modelId: string }>>
  // Reactive variant storage — keyed by `${sessionId}|${agentName}|${providerId}|${modelId}`.
  // Enables pane-scoped variant reads to re-render when a pane's variant changes.
  sessionVariantByKey: Record<string, string | undefined>
  lastUsedProvider: { providerID: string; modelID: string } | null

  saveSessionModelSelection: (sessionId: string, providerId: string, modelId: string) => void
  getSessionModelSelection: (sessionId: string) => { providerId: string; modelId: string } | null
  saveSessionAgentSelection: (sessionId: string, agentName: string) => void
  getSessionAgentSelection: (sessionId: string) => string | null
  saveAgentModelForSession: (sessionId: string, agentName: string, providerId: string, modelId: string) => void
  getAgentModelForSession: (sessionId: string, agentName: string) => { providerId: string; modelId: string } | null
  saveAgentModelVariantForSession: (sessionId: string, agentName: string, providerId: string, modelId: string, variant: string | undefined) => void
  getAgentModelVariantForSession: (sessionId: string, agentName: string, providerId: string, modelId: string) => string | undefined
}

const buildVariantKey = (sessionId: string, agentName: string, providerId: string, modelId: string) =>
  `${sessionId}|${agentName}|${providerId}|${modelId}`

export const useSelectionStore = create<SelectionState>()((set, get) => ({
  sessionModelSelections: new Map(),
  sessionAgentSelections: new Map(),
  sessionAgentModelSelections: new Map(),
  sessionVariantByKey: {},
  lastUsedProvider: null,

  saveSessionModelSelection: (sessionId, providerId, modelId) =>
    set((s) => {
      const map = new Map(s.sessionModelSelections)
      map.set(sessionId, { providerId, modelId })
      return { sessionModelSelections: map, lastUsedProvider: { providerID: providerId, modelID: modelId } }
    }),

  getSessionModelSelection: (sessionId) => get().sessionModelSelections.get(sessionId) ?? null,

  saveSessionAgentSelection: (sessionId, agentName) =>
    set((s) => {
      if (s.sessionAgentSelections.get(sessionId) === agentName) return s
      const map = new Map(s.sessionAgentSelections)
      map.set(sessionId, agentName)
      return { sessionAgentSelections: map }
    }),

  getSessionAgentSelection: (sessionId) => get().sessionAgentSelections.get(sessionId) ?? null,

  saveAgentModelForSession: (sessionId, agentName, providerId, modelId) =>
    set((s) => {
      const existing = s.sessionAgentModelSelections.get(sessionId)?.get(agentName)
      if (existing?.providerId === providerId && existing?.modelId === modelId) return s
      const outer = new Map(s.sessionAgentModelSelections)
      const inner = new Map(outer.get(sessionId) ?? new Map())
      inner.set(agentName, { providerId, modelId })
      outer.set(sessionId, inner)
      return { sessionAgentModelSelections: outer }
    }),

  getAgentModelForSession: (sessionId, agentName) =>
    get().sessionAgentModelSelections.get(sessionId)?.get(agentName) ?? null,

  saveAgentModelVariantForSession: (sessionId, agentName, providerId, modelId, variant) => {
    const key = buildVariantKey(sessionId, agentName, providerId, modelId)
    set((s) => {
      if (s.sessionVariantByKey[key] === variant) return s
      return { sessionVariantByKey: { ...s.sessionVariantByKey, [key]: variant } }
    })
  },

  getAgentModelVariantForSession: (sessionId, agentName, providerId, modelId) => {
    const key = buildVariantKey(sessionId, agentName, providerId, modelId)
    return get().sessionVariantByKey[key]
  },
}))
