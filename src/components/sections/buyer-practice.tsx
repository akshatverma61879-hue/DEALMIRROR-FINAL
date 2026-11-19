"use client";

import { useDeal } from "@/components/deal-context";
import { PracticeSetup } from "@/components/practice/practice-setup";
import { PracticeSession } from "@/components/practice/practice-session";
import { NeedsAnalysis, NextButton, SectionHeader } from "./shared";

export function BuyerPracticeSection() {
  const { analysis, practice } = useDeal();
  return (
    <div>
      <SectionHeader id="practice" />
      {!analysis ? <NeedsAnalysis /> : practice ? <PracticeSession key={practice.persona.name + practice.objectionId} /> : <PracticeSetup />}
      <NextButton to="action-plan" />
    </div>
  );
}
