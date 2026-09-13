import { ImageResponse } from "next/og";

export const alt = "There We Go — plan every trip in one place";
export const size = { height: 630, width: 1200 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "#132238",
        color: "#f7f4ec",
        display: "flex",
        height: "100%",
        justifyContent: "space-between",
        padding: "84px",
        width: "100%",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", maxWidth: 650 }}>
        <span style={{ color: "#91cdb9", fontSize: 28, fontWeight: 700, letterSpacing: 4 }}>
          {"TRIP PLANNER"}
        </span>
        <span
          style={{
            fontSize: 74,
            fontWeight: 700,
            letterSpacing: -4,
            lineHeight: 1.02,
            marginTop: 28,
          }}
        >
          {"Plan every trip in one place."}
        </span>
      </div>
      <div
        style={{
          alignItems: "center",
          display: "flex",
          height: 350,
          position: "relative",
          width: 350,
        }}
      >
        <div
          style={{
            border: "3px solid #4e9ca6",
            borderRadius: 999,
            height: 280,
            opacity: 0.55,
            position: "absolute",
            width: 280,
          }}
        />
        <div
          style={{
            background: "#78b79a",
            border: "10px solid #132238",
            borderRadius: 999,
            height: 42,
            left: 18,
            position: "absolute",
            top: 250,
            width: 42,
          }}
        />
        <div
          style={{
            background: "#78b79a",
            border: "10px solid #132238",
            borderRadius: 999,
            height: 42,
            position: "absolute",
            right: 12,
            top: 45,
            width: 42,
          }}
        />
      </div>
    </div>,
    size,
  );
}
