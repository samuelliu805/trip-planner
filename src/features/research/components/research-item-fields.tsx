import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { nativeSelectClass, ResearchField } from "./form-controls";
import type { ResearchCategory, ResearchItem } from "../types";

const commonCurrencies = ["USD", "EUR", "JPY", "GBP", "CAD", "AUD", "CNY", "KRW"];

function ContextFields({ category, item }: { category: ResearchCategory; item?: ResearchItem }) {
  if (category === "stay")
    return (
      <>
        <ResearchField label="Where">
          <Input defaultValue={item?.location_text ?? ""} maxLength={200} name="locationText" />
        </ResearchField>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <ResearchField label="Check-in">
            <Input defaultValue={item?.start_date ?? ""} name="startDate" type="date" />
          </ResearchField>
          <ResearchField label="Check-out">
            <Input defaultValue={item?.end_date ?? ""} name="endDate" type="date" />
          </ResearchField>
        </div>
      </>
    );

  const originLabel = category === "rental" ? "Pick-up" : "From";
  const destinationLabel = category === "rental" ? "Drop-off" : "To";
  const startLabel =
    category === "flight" ? "Depart" : category === "rental" ? "Pick-up date" : "Date";
  return (
    <>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <ResearchField label={originLabel}>
          <Input defaultValue={item?.origin_text ?? ""} maxLength={200} name="originText" />
        </ResearchField>
        <ResearchField label={destinationLabel}>
          <Input
            defaultValue={item?.destination_text ?? ""}
            maxLength={200}
            name="destinationText"
          />
        </ResearchField>
      </div>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <ResearchField label={startLabel}>
          <Input defaultValue={item?.start_date ?? ""} name="startDate" type="date" />
        </ResearchField>
        {category !== "train" ? (
          <ResearchField label={category === "flight" ? "Return (optional)" : "Return date"}>
            <Input defaultValue={item?.end_date ?? ""} name="endDate" type="date" />
          </ResearchField>
        ) : null}
      </div>
    </>
  );
}

export function ResearchItemFields({
  category,
  defaultCurrency,
  item,
}: {
  category: ResearchCategory;
  defaultCurrency: string;
  item?: ResearchItem;
}) {
  const currencies = commonCurrencies.includes(defaultCurrency)
    ? commonCurrencies
    : [defaultCurrency, ...commonCurrencies];
  return (
    <div className="research-form-grid space-y-4 px-5 py-5 sm:px-6">
      <ResearchField label={category === "stay" ? "Property name" : "Name / what you found"}>
        <Input defaultValue={item?.title ?? ""} maxLength={300} name="title" />
      </ResearchField>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_6.5rem] gap-3">
        <ResearchField label="Total price">
          <Input
            defaultValue={item?.total_price_amount ?? ""}
            inputMode="decimal"
            min="0"
            name="totalPriceAmount"
            placeholder="642"
            step="0.01"
            type="number"
          />
        </ResearchField>
        <ResearchField label="Currency">
          <select
            className={nativeSelectClass}
            defaultValue={item?.currency ?? defaultCurrency}
            name="currency"
          >
            {currencies.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </ResearchField>
      </div>
      <ResearchField label="Link">
        <Input
          defaultValue={item?.source_url ?? ""}
          inputMode="url"
          maxLength={2048}
          name="sourceUrl"
          placeholder="https://…"
          type="url"
        />
      </ResearchField>
      <ContextFields category={category} item={item} />
      <ResearchField label="Note (optional)">
        <Textarea defaultValue={item?.note ?? ""} maxLength={5000} name="note" rows={3} />
      </ResearchField>
    </div>
  );
}
