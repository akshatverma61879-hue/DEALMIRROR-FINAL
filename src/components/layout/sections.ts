import {
  FileText,
  Sparkles,
  Gauge,
  Users,
  SlidersHorizontal,
  MessagesSquare,
  ListChecks,
  FileSignature,
  type LucideIcon,
} from "lucide-react";
import type { SectionId } from "@/lib/types";

export interface SectionMeta {
  id: SectionId;
  label: string;
  group: "Analyse" | "Coach" | "Documents";
  icon: LucideIcon;
  description: string;
}

export const SECTIONS: SectionMeta[] = [
  { id: "input", label: "Deal Input", group: "Analyse", icon: FileText, description: "Paste the call and add context" },
  { id: "intelligence", label: "AI Intelligence", group: "Analyse", icon: Sparkles, description: "What the buyer did not say out loud" },
  { id: "health", label: "Deal Health", group: "Analyse", icon: Gauge, description: "Rule-based score with evidence" },
  { id: "stakeholders", label: "Stakeholder Radar", group: "Analyse", icon: Users, description: "Who was in the room" },
  { id: "simulator", label: "Risk Simulator", group: "Coach", icon: SlidersHorizontal, description: "What if the gaps were fixed" },
  { id: "practice", label: "AI Buyer Practice", group: "Coach", icon: MessagesSquare, description: "Rehearse the dodged moment" },
  { id: "action-plan", label: "Action Plan", group: "Documents", icon: ListChecks, description: "Next steps for both sides" },
  { id: "cfo-memo", label: "CFO Memo", group: "Documents", icon: FileSignature, description: "A note the buyer can forward" },
];
