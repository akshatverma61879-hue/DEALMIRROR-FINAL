"use client";

import * as React from "react";
import type { Analysis, DealInput, ScoreSet, SectionId } from "@/lib/types";
import { calculateScores } from "@/lib/scoring";
import { EMPTY_INPUT } from "@/lib/input-defaults";
import type { PracticeContext, PracticeMessage, Persona, Scorecard } from "@/lib/practice/types";
import type { GeneratedDocuments } from "@/lib/documents/types";
import { SAMPLE_ANALYSIS, SAMPLE_DEAL_INPUT, SAMPLE_DOCUMENTS } from "@/lib/sample-deal";

export interface PracticeState {
  /** "scripted" = Sample Demo practice with rule-based replies (no AI). "live" = Sarvam AI buyer. */
  mode: "live" | "scripted";
  objectionId: string;
  context: PracticeContext;
  persona: Persona;
  opening: PracticeMessage;
  messages: PracticeMessage[];
  scorecard: Scorecard | null;
}

/**
 * Session state lives in React memory only. Transcripts and private rules are never written
 * to localStorage, sessionStorage, cookies or a database; a page refresh clears them.
 */

interface DealState {
  input: DealInput;
  setInput: React.Dispatch<React.SetStateAction<DealInput>>;
  analysis: Analysis | null;
  setAnalysis: (a: Analysis | null) => void;
  /** Deal Health, Salesperson Performance and Illusion of Agreement Risk, calculated in code. */
  scores: ScoreSet | null;
  /** Practice session (in memory only). Cleared when a new analysis arrives or the session resets. */
  practice: PracticeState | null;
  setPractice: React.Dispatch<React.SetStateAction<PracticeState | null>>;
  /** Generated buyer documents (in memory). Cleared on a new analysis or session reset. */
  documents: GeneratedDocuments | null;
  setDocuments: React.Dispatch<React.SetStateAction<GeneratedDocuments | null>>;
  /** Loads the fictional sample inputs + pre-computed analysis and documents. No AI request. */
  startSampleDemo: () => void;
  tour: { open: boolean; step: number };
  setTour: React.Dispatch<React.SetStateAction<{ open: boolean; step: number }>>;
  section: SectionId;
  setSection: (s: SectionId) => void;
  reset: () => void;
}

const DealContext = React.createContext<DealState | null>(null);

export function DealProvider({ children }: { children: React.ReactNode }) {
  const [input, setInput] = React.useState<DealInput>(EMPTY_INPUT);
  const [analysis, setAnalysisState] = React.useState<Analysis | null>(null);
  const [practice, setPractice] = React.useState<PracticeState | null>(null);
  const [documents, setDocuments] = React.useState<GeneratedDocuments | null>(null);
  const [tour, setTour] = React.useState({ open: false, step: 0 });
  const setAnalysis = React.useCallback((a: Analysis | null) => {
    setAnalysisState(a);
    setPractice(null);
    setDocuments(null);
    setTour({ open: false, step: 0 });
  }, []);
  const [section, setSectionState] = React.useState<SectionId>("input");

  const scores = React.useMemo(
    () => (analysis ? calculateScores(analysis) : null),
    [analysis],
  );

  const setSection = React.useCallback((s: SectionId) => {
    setSectionState(s);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const reset = React.useCallback(() => {
    setInput(EMPTY_INPUT);
    setAnalysisState(null);
    setPractice(null);
    setDocuments(null);
    setTour({ open: false, step: 0 });
    setSectionState("input");
  }, []);

  const startSampleDemo = React.useCallback(() => {
    setInput(SAMPLE_DEAL_INPUT);
    setAnalysisState(SAMPLE_ANALYSIS);
    setPractice(null);
    setDocuments(SAMPLE_DOCUMENTS);
    setTour({ open: true, step: 0 });
    setSectionState("input");
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }, []);

  return (
    <DealContext.Provider
      value={{
        input,
        setInput,
        analysis,
        setAnalysis,
        scores,
        practice,
        setPractice,
        documents,
        setDocuments,
        startSampleDemo,
        tour,
        setTour,
        section,
        setSection,
        reset,
      }}
    >
      {children}
    </DealContext.Provider>
  );
}

export function useDeal() {
  const ctx = React.useContext(DealContext);
  if (!ctx) throw new Error("useDeal must be used inside DealProvider");
  return ctx;
}
