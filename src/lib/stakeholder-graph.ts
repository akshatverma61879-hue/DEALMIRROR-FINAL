/**
 * Builds the Ghost Stakeholder Radar graph from evidence only.
 * Nodes = stakeholders that survived evidence checks. Edges = only relationships the transcript supports:
 *  - "on the call": a seller speaker and a buyer speaker both spoke in the transcript
 *  - "mentioned by": the speaker whose line mentions an absent stakeholder (line number from the quote)
 *  - stated relationships (APPROVES, REPORTS_TO, …) whose quote was verified
 */
import type { Analysis, Relationship, Stakeholder } from "./types";

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: "conversation" | "mention" | Relationship["type"];
  label: string;
  evidenceLine: number | null;
}

const REL_LABEL: Record<Relationship["type"], string> = {
  APPROVES: "approves",
  REPORTS_TO: "reports to",
  MUST_CONSULT: "must consult",
  WORKS_WITH: "works with",
};

export function findSpeaker(stakeholders: Stakeholder[], speakerLabel: string | null) {
  if (!speakerLabel) return undefined;
  const l = speakerLabel.toLowerCase();
  return stakeholders.find(
    (s) => s.status === "CONFIRMED_PRESENT" && (l === s.name.toLowerCase() || l.split(/[\s()]+/).includes(s.name.toLowerCase())),
  );
}

export function buildStakeholderGraph(a: Pick<Analysis, "stakeholders" | "relationships">) {
  const { stakeholders, relationships } = a;
  const ids = new Set(stakeholders.map((s) => s.id));
  const edges: GraphEdge[] = [];

  const presentSellers = stakeholders.filter((s) => s.side === "seller" && s.status === "CONFIRMED_PRESENT");
  const presentBuyers = stakeholders.filter((s) => s.side === "buyer" && s.status === "CONFIRMED_PRESENT");
  for (const s of presentSellers)
    for (const b of presentBuyers)
      edges.push({ id: `c-${s.id}-${b.id}`, source: s.id, target: b.id, kind: "conversation", label: "on the call", evidenceLine: null });

  for (const g of stakeholders.filter((s) => s.status !== "CONFIRMED_PRESENT")) {
    const by = findSpeaker(stakeholders, g.mentionedBy);
    if (by && by.id !== g.id)
      edges.push({ id: `m-${by.id}-${g.id}`, source: by.id, target: g.id, kind: "mention", label: `mentioned · line ${g.evidence.line}`, evidenceLine: g.evidence.line });
  }

  for (const r of relationships) {
    if (!ids.has(r.from) || !ids.has(r.to) || !r.evidence.verified) continue;
    edges.push({ id: `r-${r.from}-${r.to}-${r.type}`, source: r.from, target: r.to, kind: r.type, label: `${REL_LABEL[r.type]} · line ${r.evidence.line}`, evidenceLine: r.evidence.line });
  }

  // One edge per pair: a stated relationship beats "on the call", which beats a plain mention.
  const rank = (e: GraphEdge) => (e.kind === "mention" ? 0 : e.kind === "conversation" ? 1 : 2);
  const byPair = new Map<string, GraphEdge>();
  for (const e of edges) {
    const key = [e.source, e.target].sort().join("|");
    const prev = byPair.get(key);
    if (!prev || rank(e) > rank(prev)) byPair.set(key, e);
  }
  return { nodes: stakeholders, edges: [...byPair.values()] };
}
