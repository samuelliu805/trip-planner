import type { PublicTemplateSourceV1 } from "../../schema.ts";

export const neonPublicTemplateSourceV1 = {
  assetIds: [],
  id: "neon",
  schemaVersion: 1,
  sourceMode: "theme",
  themeCss: `
tp-layout {
  --accent: #1c2541;
  --accent-foreground: #f6f8ff;
  --background: #020612;
  --border: #263f64;
  --card: #0a0f1f;
  --card-foreground: #f6f8ff;
  --foreground: #f6f8ff;
  --input: #476b96;
  --muted: #10172d;
  --muted-foreground: #a8b6d4;
  --popover: #10172d;
  --popover-foreground: #f6f8ff;
  --primary: #42ddff;
  --primary-foreground: #020612;
  --public-blue: #42ddff;
  --public-gold: #ffe067;
  --public-peach: #fb43e4;
  --public-subtle: #7785a8;
  --radius: 0.875rem;
  --ring: #42ddff;
  --secondary: #111a34;
  --secondary-foreground: #dce7ff;
  background: #020612;
  color: #f6f8ff;
  color-scheme: dark;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
}
tp-region[name="header-actions"] {
  align-items: center;
  display: flex;
  gap: 0.5rem;
}
  `.trim(),
  version: 1,
} satisfies PublicTemplateSourceV1;
