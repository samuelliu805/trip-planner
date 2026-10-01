import { createRoot } from "react-dom/client";
import { useState } from "react";
import { I18nProvider } from "../../src/features/i18n/i18n-provider";
import { PlanCostMenu } from "../../src/features/research/components/plan-cost-menu";
import { OPEN_PLAN_COST_EVENT } from "../../src/features/research/events";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../src/components/ui/dialog";

const lines = [
  {
    amount: 7724,
    currency: "CNY",
    dayNumber: 1,
    itemId: "flight",
    title: "SHA → CHC",
    type: "flight" as const,
    convertedAmount: 1152.06,
    convertedCurrency: "USD",
  },
];
const summary = {
  amount: 1152.06,
  complete: true,
  converted: true,
  currency: "USD",
  itemCount: 1,
  rateDate: "2026-09-30",
  unavailableCurrencies: [],
};

function Fixture() {
  const [long, setLong] = useState(false);
  const [dialog, setDialog] = useState(false);
  return (
    <I18nProvider initialLocale="en">
      <button id="test-cost" onClick={() => window.dispatchEvent(new Event(OPEN_PLAN_COST_EVENT))}>
        Open cost
      </button>
      <button
        id="test-long-cost"
        onClick={() => {
          setLong(true);
          window.dispatchEvent(new Event(OPEN_PLAN_COST_EVENT));
        }}
      >
        Open long cost
      </button>
      <button id="test-dialog" onClick={() => setDialog(true)}>
        Open dialog
      </button>
      <PlanCostMenu
        lines={
          long
            ? Array.from({ length: 40 }, (_, index) => ({
                ...lines[0],
                itemId: `flight-${index}`,
                title: `上海虹桥国际机场 → 克赖斯特彻奇国际机场 · Flight ${index + 1}`,
              }))
            : lines
        }
        summary={summary}
      />
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share itinerary</DialogTitle>
          </DialogHeader>
          <p className="px-5 py-5">A short dialog.</p>
        </DialogContent>
      </Dialog>
    </I18nProvider>
  );
}

const host = document.createElement("div");
host.id = "panel-polish-fixture";
host.style.cssText = "position:fixed;inset:0;z-index:90;background:var(--background)";
document.body.append(host);
const root = createRoot(host);
root.render(<Fixture />);
Object.assign(window, {
  disposePanelPolish: () => {
    root.unmount();
    host.remove();
  },
});
