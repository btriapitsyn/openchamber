import { create } from "zustand";
import { devtools, persist, createJSONStorage } from "zustand/middleware";
import { opencodeClient } from "@/lib/opencode/client";
import type { QuestionRequest } from "@/types/question";
import { getSafeStorage } from "./utils/safeStorage";
import { useSessionStore } from "./sessionStore";

interface QuestionState {
  questions: Map<string, QuestionRequest[]>;
}

interface QuestionActions {
  addQuestion: (question: QuestionRequest) => void;
  dismissQuestion: (sessionId: string, requestId: string) => void;
  respondToQuestion: (sessionId: string, requestId: string, answers: string[] | string[][]) => Promise<void>;
  rejectQuestion: (sessionId: string, requestId: string) => Promise<void>;
}

type QuestionStore = QuestionState & QuestionActions;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const sanitizeQuestionEntries = (value: unknown): Array<[string, QuestionRequest[]]> => {
  if (!Array.isArray(value)) {
    return [];
  }
  const entries: Array<[string, QuestionRequest[]]> = [];
  value.forEach((entry) => {
    if (!Array.isArray(entry) || entry.length !== 2) {
      return;
    }
    const [sessionId, questions] = entry;
    if (typeof sessionId !== "string" || !Array.isArray(questions)) {
      return;
    }
    entries.push([sessionId, questions as QuestionRequest[]]);
  });
  return entries;
};

const executeWithQuestionDirectory = async <T>(sessionId: string, operation: () => Promise<T>): Promise<T> => {
  try {
    const sessionStore = useSessionStore.getState();
    const directory = sessionStore.getDirectoryForSession(sessionId);
    if (directory) {
      return opencodeClient.withDirectory(directory, operation);
    }
  } catch (error) {
    console.warn("Failed to resolve session directory for question handling:", error);
  }
  return operation();
};

export const useQuestionStore = create<QuestionStore>()(
  devtools(
    persist(
      (set, get) => ({
        questions: new Map(),

        addQuestion: (question: QuestionRequest) => {
          const sessionId = question.sessionID;
          if (!sessionId) {
            return;
          }

          const existing = get().questions.get(sessionId);
          if (existing?.some((entry) => entry.id === question.id)) {
            return;
          }

          set((state) => {
            const sessionQuestions = state.questions.get(sessionId) || [];
            const next = new Map(state.questions);
            next.set(sessionId, [...sessionQuestions, question]);
            return { questions: next };
          });
        },

        dismissQuestion: (sessionId: string, requestId: string) => {
          if (!sessionId || !requestId) {
            return;
          }

          set((state) => {
            const sessionQuestions = state.questions.get(sessionId) || [];
            const updated = sessionQuestions.filter((q) => q.id !== requestId);
            const next = new Map(state.questions);
            next.set(sessionId, updated);
            return { questions: next };
          });
        },

        respondToQuestion: async (sessionId: string, requestId: string, answers: string[] | string[][]) => {
          await executeWithQuestionDirectory(sessionId, () => opencodeClient.replyToQuestion(requestId, answers));
          get().dismissQuestion(sessionId, requestId);
        },

        rejectQuestion: async (sessionId: string, requestId: string) => {
          await executeWithQuestionDirectory(sessionId, () => opencodeClient.rejectQuestion(requestId));
          get().dismissQuestion(sessionId, requestId);
        },
      }),
      {
        name: "question-store",
        storage: createJSONStorage(() => getSafeStorage()),
        partialize: (state) => ({
          questions: Array.from(state.questions.entries()),
        }),
        merge: (persistedState, currentState) => {
          if (!isRecord(persistedState)) {
            return currentState;
          }
          const entries = sanitizeQuestionEntries(persistedState.questions);
          return {
            ...currentState,
            questions: new Map(entries),
          };
        },
      }
    ),
    { name: "question-store" }
  )
);
