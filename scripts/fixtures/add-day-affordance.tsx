import { useState } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "../../src/features/i18n/i18n-provider";
import { PlannerDayHeaderCell } from "../../src/features/itinerary/components/planner-day-header-cell";
import type { PlannerDay } from "../../src/features/itinerary/types";

function Fixture() {
  const [days, setDays] = useState(3);
  const [selected, setSelected] = useState<number>();
  return (
    <I18nProvider initialLocale="en">
      <div className="planner-matrix" data-test-add-day="">
        {Array.from({ length: days }, (_, index) => (
          <PlannerDayHeaderCell
            key={index}
            day={{ id: String(index), day_number: index + 1, date: null } as PlannerDay}
            isLastDay={index === days - 1}
            onInsert={(position) => {
              if (position !== index + 2) throw new Error("Incorrect insertion position");
              setDays((current) => current + 1);
            }}
            onSelect={() => setSelected(index)}
            onReorder={() => {}}
            canReorder={false}
            pending={false}
            selected={selected === index}
          />
        ))}
        <output data-test-selected="">{selected ?? "none"}</output>
      </div>
    </I18nProvider>
  );
}
const host = document.createElement("div");
host.style.cssText = "position:fixed;inset:0;z-index:90;background:var(--background)";
document.body.append(host);
const root = createRoot(host);
root.render(<Fixture />);
Object.assign(window, {
  disposeAddDayFixture: () => {
    root.unmount();
    host.remove();
  },
});
