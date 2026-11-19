import { CheckCircle2, AlertTriangle, XCircle, HelpCircle, SearchX } from "lucide-react";
import { Badge } from "./badge";
import type { ObjectionStatus, Participation, RealityVerdict } from "@/lib/types";

export const STATUS_META: Record<ObjectionStatus, { variant: "green" | "amber" | "red" | "neutral"; label: string; Icon: typeof CheckCircle2 }> = {
  RESOLVED_WITH_EVIDENCE: { variant: "green", label: "Resolved with evidence", Icon: CheckCircle2 },
  POSSIBLY_UNRESOLVED: { variant: "amber", label: "Possibly unresolved", Icon: AlertTriangle },
  UNANSWERED_OR_AVOIDED: { variant: "red", label: "Unanswered or avoided", Icon: XCircle },
  UNKNOWN: { variant: "neutral", label: "Unknown", Icon: HelpCircle },
};

export function ObjectionStatusBadge({ status }: { status: ObjectionStatus }) {
  const { variant, label, Icon } = STATUS_META[status];
  return (
    <Badge variant={variant}>
      <Icon /> {label}
    </Badge>
  );
}

export const VERDICT_META: Record<RealityVerdict, { variant: "green" | "amber" | "red" | "neutral"; label: string; Icon: typeof CheckCircle2 }> = {
  SUPPORTED: { variant: "green", label: "Supported", Icon: CheckCircle2 },
  NOT_CONFIRMED: { variant: "amber", label: "Not confirmed", Icon: AlertTriangle },
  CONTRADICTED: { variant: "red", label: "Contradicted", Icon: XCircle },
  INSUFFICIENT_EVIDENCE: { variant: "neutral", label: "Insufficient evidence", Icon: HelpCircle },
};

export function VerdictBadge({ verdict }: { verdict: RealityVerdict }) {
  const { variant, label, Icon } = VERDICT_META[verdict];
  return (
    <Badge variant={variant}>
      <Icon /> {label}
    </Badge>
  );
}

export function ReviewBadge() {
  return (
    <Badge variant="amber" title="A quote could not be found in the transcript. Check before relying on this.">
      <SearchX /> Needs review
    </Badge>
  );
}

export const PARTICIPATION_META: Record<Participation, { variant: "green" | "red" | "neutral"; label: string }> = {
  CONFIRMED_PRESENT: { variant: "green", label: "Confirmed present" },
  MENTIONED_ONLY: { variant: "red", label: "Mentioned only" },
  PARTICIPATION_UNKNOWN: { variant: "neutral", label: "Participation unknown" },
};

export function PresenceBadge({ status }: { status: Participation }) {
  const m = PARTICIPATION_META[status];
  return <Badge variant={m.variant}>{m.label}</Badge>;
}

export function MockBadge({ label = "Mock data" }: { label?: string }) {
  return <Badge variant="mock">{label}</Badge>;
}
