"use client";

import { DealProvider, useDeal } from "./deal-context";
import { AppHeader } from "./layout/app-header";
import { SectionNav } from "./layout/section-nav";
import { DealOverview } from "./sections/deal-overview";
import { DealInputSection } from "./sections/deal-input";
import { IntelligenceSection } from "./sections/intelligence";
import { DealHealthSection } from "./sections/deal-health";
import { StakeholderRadarSection } from "./sections/stakeholder-radar";
import { RiskSimulatorSection } from "./sections/risk-simulator";
import { BuyerPracticeSection } from "./sections/buyer-practice";
import { ActionPlanSection } from "./sections/action-plan";
import { CfoMemoSection } from "./sections/cfo-memo";
import { DemoBanner } from "./demo/demo-tour";

function ActiveSection() {
  const { section } = useDeal();
  switch (section) {
    case "input":
      return <DealInputSection />;
    case "intelligence":
      return <IntelligenceSection />;
    case "health":
      return <DealHealthSection />;
    case "stakeholders":
      return <StakeholderRadarSection />;
    case "simulator":
      return <RiskSimulatorSection />;
    case "practice":
      return <BuyerPracticeSection />;
    case "action-plan":
      return <ActionPlanSection />;
    case "cfo-memo":
      return <CfoMemoSection />;
  }
}

export function AppShell() {
  return (
    <DealProvider>
      <div className="min-h-screen bg-slate-50/70">
        <AppHeader />
        <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 print:max-w-none print:p-0">
          <div className="mb-6 print:hidden">
            <DealOverview />
          </div>
          <div className="flex flex-col lg:flex-row lg:gap-8">
            <SectionNav />
            <main className="min-w-0 flex-1">
              <DemoBanner />
              <ActiveSection />
            </main>
          </div>
          <footer className="mt-12 border-t border-slate-200 pt-4 text-xs text-slate-400 print:hidden">
            Synthetic demo data. Rule-based coaching score, not a win probability.
          </footer>
        </div>
      </div>
    </DealProvider>
  );
}
