export const markerLabelBubbleStyle = {
  background: "#166534",
  border: "2px solid #ffffff",
  borderRadius: "16px",
  boxShadow: "0 2px 7px rgba(15,23,42,.3)",
  boxSizing: "border-box",
  color: "#ffffff",
  font: "600 12px/1.35 var(--font-sans, sans-serif)",
  maxWidth: "180px",
  minHeight: "30px",
  minWidth: "32px",
  overflowWrap: "anywhere",
  padding: "5px 10px",
  textAlign: "center",
  whiteSpace: "normal",
  width: "max-content",
} as const;

export function needsMarkerLabelBubble(label: string | undefined) {
  return Array.from(label?.trim() ?? "").length > 1;
}
