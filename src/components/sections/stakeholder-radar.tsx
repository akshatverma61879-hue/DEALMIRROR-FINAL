"use client";

import * as React from "react";
import { ReactFlow, Background, Handle, Position, MarkerType, type Node, type Edge, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Ghost, UserCheck, HelpCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PresenceBadge } from "@/components/ui/status";
import { cn } from "@/lib/utils";
import { useDeal } from "@/components/deal-context";
import { buildStakeholderGraph, type GraphEdge } from "@/lib/stakeholder-graph";
import type { Stakeholder } from "@/lib/types";
import { NeedsAnalysis, NextButton, SectionHeader } from "./shared";

type PersonData = { s: Stakeholder };

const NODE_STYLE: Record<Stakeholder["status"], string> = {
  CONFIRMED_PRESENT: "border-2 border-emerald-500 bg-white",
  MENTIONED_ONLY: "border-2 border-dashed border-red-400 bg-red-50/60",
  PARTICIPATION_UNKNOWN: "border-2 border-dotted border-slate-400 bg-slate-50",
};

function PersonNode({ data }: NodeProps<Node<PersonData>>) {
  const { s } = data;
  const Icon = s.status === "CONFIRMED_PRESENT" ? UserCheck : s.status === "MENTIONED_ONLY" ? Ghost : HelpCircle;
  return (
    <div className={cn("w-48 rounded-xl px-3 py-2.5 shadow-sm", NODE_STYLE[s.status])}>
      <Handle type="target" position={Position.Left} className="!size-1.5 !border-0 !bg-slate-300" />
      <div className="flex items-center justify-between gap-2">
        <span dir="auto" className="truncate text-sm font-semibold text-slate-900">{s.name}</span>
        <Icon
          className={cn(
            "size-4 shrink-0",
            s.status === "CONFIRMED_PRESENT" ? "text-emerald-600" : s.status === "MENTIONED_ONLY" ? "text-red-500" : "text-slate-400",
          )}
        />
      </div>
      <div dir="auto" className="mt-0.5 truncate text-[11px] leading-tight text-slate-500">{s.role}</div>
      <Handle type="source" position={Position.Right} className="!size-1.5 !border-0 !bg-slate-300" />
    </div>
  );
}

function GroupLabel({ data }: NodeProps<Node<{ label: string }>>) {
  return <div className="w-48 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{data.label}</div>;
}

const nodeTypes = { person: PersonNode, label: GroupLabel };

function edgeStyle(e: GraphEdge): Partial<Edge> {
  if (e.kind === "conversation") return { style: { stroke: "#10b981", strokeWidth: 1.5 } };
  if (e.kind === "mention") return { style: { stroke: "#ef4444", strokeWidth: 1.5, strokeDasharray: "6 4" }, markerEnd: { type: MarkerType.ArrowClosed, color: "#ef4444" } };
  return { style: { stroke: "#0f766e", strokeWidth: 2 } };
}

export function StakeholderRadarSection() {
  const { analysis } = useDeal();

  const graph = React.useMemo(() => {
    if (!analysis) return { nodes: [] as Node[], edges: [] as Edge[], ghosts: 0 };
    const { nodes: people, edges } = buildStakeholderGraph(analysis);
    const columns = [
      { label: "Your team", items: people.filter((p) => p.side === "seller") },
      { label: "Buyer · on the call", items: people.filter((p) => p.side === "buyer" && p.status === "CONFIRMED_PRESENT") },
      { label: "Buyer · not on the call", items: people.filter((p) => p.side === "buyer" && p.status !== "CONFIRMED_PRESENT") },
    ];
    const nodes: Node[] = [];
    const colOf = new Map<string, number>();
    columns.forEach((c, ci) => c.items.forEach((p) => colOf.set(p.id, ci)));
    columns.forEach((c, ci) => {
      if (!c.items.length) return;
      nodes.push({ id: `label-${ci}`, type: "label", position: { x: ci * 360, y: 0 }, data: { label: c.label }, draggable: false, selectable: false });
      c.items.forEach((p, i) => nodes.push({ id: p.id, type: "person", position: { x: ci * 360, y: 36 + i * 96 }, data: { s: p } }));
    });
    return {
      nodes,
      // Draw every edge left → right so lines never run behind nodes; labels carry the direction in words.
      edges: edges.map((e) => {
        const flip = (colOf.get(e.source) ?? 0) > (colOf.get(e.target) ?? 0);
        const fromName = people.find((p) => p.id === e.source)?.name ?? "";
        const label =
          e.kind === "conversation" || e.kind === "mention" ? e.label : `${fromName} ${e.label}`;
        return {
        id: e.id,
        source: flip ? e.target : e.source,
        target: flip ? e.source : e.target,
        label,
        labelStyle: { fontSize: 10, fill: "#475569" },
        labelBgStyle: { fill: "#ffffff" },
        labelBgPadding: [4, 2] as [number, number],
        ...edgeStyle(e),
        };
      }),
      ghosts: people.filter((p) => p.status !== "CONFIRMED_PRESENT").length,
    };
  }, [analysis]);

  if (!analysis) {
    return (
      <div>
        <SectionHeader id="stakeholders" />
        <NeedsAnalysis />
      </div>
    );
  }

  const people = analysis.stakeholders;

  return (
    <div>
      <SectionHeader
        id="stakeholders"
        actions={graph.ghosts > 0 && <Badge variant="red"><Ghost /> {graph.ghosts} not on the call</Badge>}
      />

      {people.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-500">
          No stakeholders could be confirmed from the transcript. Add speaker labels such as “Rohit (Buyer):”.
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Ghost Stakeholder Radar</CardTitle>
              <CardDescription>Every person and every line comes from the transcript. Nothing is assumed.</CardDescription>
              <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1.5"><span className="h-3 w-5 rounded border-2 border-emerald-500" /> Confirmed present</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-3 w-5 rounded border-2 border-dashed border-red-400 bg-red-50" /> Mentioned only</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-3 w-5 rounded border-2 border-dotted border-slate-400 bg-slate-50" /> Participation unknown</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-5 border-t-2 border-dashed border-red-400" /> Mentioned by</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-5 border-t-2 border-teal-700" /> Stated relationship</span>
              </div>
            </CardHeader>
            <div className="h-[440px] border-t border-slate-100 bg-slate-50/50">
              <ReactFlow
                nodes={graph.nodes}
                edges={graph.edges}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{ padding: 0.3 }}
                proOptions={{ hideAttribution: true }}
                nodesConnectable={false}
                panOnScroll={false}
                zoomOnScroll={false}
                preventScrolling={false}
              >
                <Background gap={20} size={1} color="#e2e8f0" />
              </ReactFlow>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Evidence</CardTitle>
              <CardDescription>Present only if they speak in the transcript. Someone who is only named is shown as mentioned.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {people.map((s) => (
                <div key={s.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span dir="auto" className="text-sm font-semibold text-slate-900">{s.name}</span>
                      <span dir="auto" className="ml-1.5 text-xs text-slate-500">{s.role} · {s.side === "seller" ? "your team" : "buyer side"}</span>
                    </div>
                    <PresenceBadge status={s.status} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{s.basis}{s.mentionedBy ? ` Mentioned by ${s.mentionedBy}.` : ""}</p>
                  <p dir="auto" className="mt-1.5 text-sm italic text-slate-600">
                    “{s.evidence.quote}” <span className="not-italic text-[11px] text-slate-400">line {s.evidence.line}</span>
                  </p>
                </div>
              ))}
              {analysis.relationships.length > 0 && (
                <div className="border-t border-slate-100 pt-3">
                  <p className="mb-2 text-xs font-semibold text-slate-700">Stated relationships</p>
                  {analysis.relationships.map((r) => {
                    const from = people.find((p) => p.id === r.from)?.name;
                    const to = people.find((p) => p.id === r.to)?.name;
                    return (
                      <p key={`${r.from}-${r.to}-${r.type}`} dir="auto" className="text-sm text-slate-600">
                        <span className="font-medium text-slate-800">{from}</span> {r.type.toLowerCase().replace("_", " ")} <span className="font-medium text-slate-800">{to}</span>
                        <span className="ml-1 italic text-slate-500">“{r.evidence.quote}”</span>
                      </p>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
      <NextButton to="simulator" />
    </div>
  );
}
