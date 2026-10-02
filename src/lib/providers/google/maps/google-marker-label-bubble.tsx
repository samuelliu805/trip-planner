import { markerLabelBubbleStyle } from "../../maps/marker-label";

export function GoogleMarkerLabelBubble({
  background,
  color,
  label,
  selected,
}: {
  background: string;
  color: string;
  label: string;
  selected: boolean;
}) {
  return (
    <div className="relative pb-[7px]" data-map-label-bubble="">
      <div
        data-map-label-text=""
        style={{
          ...markerLabelBubbleStyle,
          background,
          color,
          boxShadow: selected
            ? "0 0 0 3px rgba(255,255,255,.9), 0 3px 10px rgba(15,23,42,.35)"
            : markerLabelBubbleStyle.boxShadow,
        }}
      >
        {label}
      </div>
      <span
        aria-hidden="true"
        className="absolute bottom-0 left-1/2 size-0 -translate-x-1/2 border-x-[7px] border-t-[8px] border-x-transparent border-t-white"
      />
    </div>
  );
}
