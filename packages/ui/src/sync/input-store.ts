/**
 * Input Store — pending input text, synthetic parts, and attached files.
 *
 * State is keyed by sessionId so split-view panes keep independent inputs.
 * Use DRAFT_INPUT_KEY for the new-session-draft slot (no session id yet).
 *
 * Legacy APIs that don't take a key resolve to the *active* input:
 *  - currentSessionId if set
 *  - DRAFT_INPUT_KEY when the new-session-draft is open
 *  - DRAFT_INPUT_KEY otherwise (no-op fallback)
 */

import { create } from "zustand"
import type { AttachedFile } from "@/stores/types/sessionTypes"
import { useSessionUIStore } from "./session-ui-store"

export const DRAFT_INPUT_KEY = "__draft__"

export type SyntheticContextPart = {
  text: string
  attachments?: AttachedFile[]
  synthetic?: boolean
}

type PendingText = { text: string; mode: "replace" | "append" | "append-inline" } | null

export type InputState = {
  attachedFilesByKey: Record<string, AttachedFile[]>
  pendingInputTextByKey: Record<string, PendingText>
  pendingSyntheticPartsByKey: Record<string, SyntheticContextPart[] | null>

  // Keyed APIs (preferred)
  addAttachedFileFor: (key: string, file: File) => Promise<void>
  removeAttachedFileFor: (key: string, id: string) => void
  clearAttachedFilesFor: (key: string) => void
  setPendingInputTextFor: (key: string, text: string | null, mode?: "replace" | "append" | "append-inline") => void
  consumePendingInputTextFor: (key: string) => { text: string; mode: "replace" | "append" | "append-inline" } | null
  setPendingSyntheticPartsFor: (key: string, parts: SyntheticContextPart[] | null) => void
  consumePendingSyntheticPartsFor: (key: string) => SyntheticContextPart[] | null

  // Legacy APIs — route to active input key (focused session or draft).
  addAttachedFile: (file: File) => Promise<void>
  removeAttachedFile: (id: string) => void
  clearAttachedFiles: () => void
  setPendingInputText: (text: string | null, mode?: "replace" | "append" | "append-inline") => void
  consumePendingInputText: () => { text: string; mode: "replace" | "append" | "append-inline" } | null
  setPendingSyntheticParts: (parts: SyntheticContextPart[] | null) => void
  consumePendingSyntheticParts: () => SyntheticContextPart[] | null
}

const EMPTY_FILES: AttachedFile[] = []

export const resolveActiveInputKey = (): string => {
  const s = useSessionUIStore.getState()
  if (s.currentSessionId) return s.currentSessionId
  if (s.newSessionDraft?.open) return DRAFT_INPUT_KEY
  return DRAFT_INPUT_KEY
}

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise<string>((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.readAsDataURL(file)
  })

export const useInputStore = create<InputState>()((set, get) => ({
  attachedFilesByKey: {},
  pendingInputTextByKey: {},
  pendingSyntheticPartsByKey: {},

  // Keyed APIs
  addAttachedFileFor: async (key, file) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const dataUrl = await readFileAsDataUrl(file)
    const attached: AttachedFile = {
      id,
      file,
      dataUrl,
      mimeType: file.type,
      filename: file.name,
      size: file.size,
      source: "local",
    }
    set((s) => ({
      attachedFilesByKey: {
        ...s.attachedFilesByKey,
        [key]: [...(s.attachedFilesByKey[key] ?? EMPTY_FILES), attached],
      },
    }))
  },

  removeAttachedFileFor: (key, id) =>
    set((s) => ({
      attachedFilesByKey: {
        ...s.attachedFilesByKey,
        [key]: (s.attachedFilesByKey[key] ?? EMPTY_FILES).filter((f) => f.id !== id),
      },
    })),

  clearAttachedFilesFor: (key) =>
    set((s) => {
      if (!(key in s.attachedFilesByKey)) return s
      const next = { ...s.attachedFilesByKey }
      delete next[key]
      return { attachedFilesByKey: next }
    }),

  setPendingInputTextFor: (key, text, mode = "replace") =>
    set((s) => ({
      pendingInputTextByKey: {
        ...s.pendingInputTextByKey,
        [key]: text === null ? null : { text, mode },
      },
    })),

  consumePendingInputTextFor: (key) => {
    const pending = get().pendingInputTextByKey[key]
    if (!pending) return null
    set((s) => {
      const next = { ...s.pendingInputTextByKey }
      delete next[key]
      return { pendingInputTextByKey: next }
    })
    return pending
  },

  setPendingSyntheticPartsFor: (key, parts) =>
    set((s) => ({
      pendingSyntheticPartsByKey: {
        ...s.pendingSyntheticPartsByKey,
        [key]: parts,
      },
    })),

  consumePendingSyntheticPartsFor: (key) => {
    const parts = get().pendingSyntheticPartsByKey[key] ?? null
    if (parts === null) return null
    set((s) => {
      const next = { ...s.pendingSyntheticPartsByKey }
      delete next[key]
      return { pendingSyntheticPartsByKey: next }
    })
    return parts
  },

  // Legacy APIs — route to the active input key.
  addAttachedFile: (file) => get().addAttachedFileFor(resolveActiveInputKey(), file),
  removeAttachedFile: (id) => get().removeAttachedFileFor(resolveActiveInputKey(), id),
  clearAttachedFiles: () => get().clearAttachedFilesFor(resolveActiveInputKey()),
  setPendingInputText: (text, mode = "replace") => get().setPendingInputTextFor(resolveActiveInputKey(), text, mode),
  consumePendingInputText: () => get().consumePendingInputTextFor(resolveActiveInputKey()),
  setPendingSyntheticParts: (parts) => get().setPendingSyntheticPartsFor(resolveActiveInputKey(), parts),
  consumePendingSyntheticParts: () => get().consumePendingSyntheticPartsFor(resolveActiveInputKey()),
}))

// Selector helpers — stable empty array reference to avoid re-renders.
export const selectAttachedFilesFor = (key: string) => (s: InputState): AttachedFile[] =>
  s.attachedFilesByKey[key] ?? EMPTY_FILES
