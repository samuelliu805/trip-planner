import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PlannerEditorField,
  PlannerEditorTextField,
} from "@/features/itinerary/components/planner-editor-fields";
import type { Locale } from "@/features/i18n/config";
import { T } from "@/features/i18n/i18n-provider";
import { tripCurrencyCodesForLocale, tripCurrencyLabel } from "@/features/trips/currencies";
import { sanitizeTripDayCountInput, type TripDateField } from "@/features/trips/date-fields";

export function TripFormFields({
  currency,
  dayCount,
  endDate,
  locale,
  onCurrencyChange,
  onDateCommit,
  onDayCountChange,
  onEndDateChange,
  onStartDateChange,
  onTitleChange,
  startDate,
  title,
}: {
  currency: string;
  dayCount: string;
  endDate: string;
  locale: Locale;
  onCurrencyChange: (value: string) => void;
  onDateCommit: (field: TripDateField, value: string) => void;
  onDayCountChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onStartDateChange: (value: string) => void;
  onTitleChange: (value: string) => void;
  startDate: string;
  title: string;
}) {
  return (
    <>
      <PlannerEditorTextField
        autoComplete="off"
        onChange={(event) => onTitleChange(event.currentTarget.value)}
        focusRegion="title"
        id="trip-title"
        label="Trip name"
        maxLength={120}
        name="title"
        placeholder="e.g. Kyoto in autumn"
        required
        value={title}
      />

      <PlannerEditorTextField
        autoComplete="off"
        description={
          startDate
            ? "Changing the length moves the end date to match."
            : "Add either date and the remaining date will be filled automatically."
        }
        id="trip-day-count"
        inputMode="numeric"
        label="Duration (days)"
        max={366}
        min={1}
        name="day_count"
        onBlur={(event) => onDateCommit("dayCount", event.currentTarget.value)}
        onChange={(event) => onDayCountChange(sanitizeTripDayCountInput(event.currentTarget.value))}
        required
        step={1}
        type="number"
        value={dayCount}
      />

      <div className="grid min-w-0 grid-cols-2 gap-3 sm:gap-4">
        <PlannerEditorField
          id="trip-start-date"
          label={
            <>
              <T message={" Start date "} />{" "}
              <span className="font-normal text-muted-foreground">
                <T message={"optional"} />
              </span>
            </>
          }
        >
          <div className="planner-native-control-frame">
            <Input
              className="planner-native-datetime-input"
              id="trip-start-date"
              onBlur={(event) => onDateCommit("startDate", event.currentTarget.value)}
              onChange={(event) => onStartDateChange(event.currentTarget.value)}
              type="date"
              value={startDate}
            />
          </div>
        </PlannerEditorField>
        <PlannerEditorField
          id="trip-end-date"
          label={
            <>
              <T message={" End date "} />{" "}
              <span className="font-normal text-muted-foreground">
                <T message={"optional"} />
              </span>
            </>
          }
        >
          <div className="planner-native-control-frame">
            <Input
              className="planner-native-datetime-input"
              id="trip-end-date"
              onBlur={(event) => onDateCommit("endDate", event.currentTarget.value)}
              onChange={(event) => onEndDateChange(event.currentTarget.value)}
              type="date"
              value={endDate}
            />
          </div>
        </PlannerEditorField>
      </div>

      <PlannerEditorField id="trip-currency" label="Currency">
        <Select onValueChange={onCurrencyChange} value={currency}>
          <SelectTrigger className="min-w-0" id="trip-currency">
            <SelectValue aria-label={currency}>{currency}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {tripCurrencyCodesForLocale(locale).map((code) => (
              <SelectItem key={code} value={code}>
                {tripCurrencyLabel(code, locale)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PlannerEditorField>
    </>
  );
}
