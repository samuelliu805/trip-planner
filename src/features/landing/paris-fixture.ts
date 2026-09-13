export type DockKind = "route" | "stay" | "activity" | "document";

export const dockKinds: DockKind[] = ["route", "stay", "activity", "document"];

export const parisLandingFixture = {
  title: "Paris Trip",
  dateRange: "Apr 12–15, 2027",
  days: [
    {
      date: "Apr 12",
      day: "Day 1",
      city: "Paris",
      stay: "Marriott Rive Gauche",
      activity: "Louvre Museum",
      meal: "Le Comptoir du Relais",
    },
    {
      date: "Apr 13",
      day: "Day 2",
      city: "Paris",
      stay: "Marriott Rive Gauche",
      activity: "Musée de l’Orangerie",
      meal: "Canal Saint-Martin walk",
    },
    {
      date: "Apr 14",
      day: "Day 3",
      city: "Versailles",
      stay: "Marriott Rive Gauche",
      activity: "Palace of Versailles",
      meal: "Marché Notre-Dame",
    },
  ],
  route: {
    label: "Paris day route",
    stops: ["Louvre Museum", "Saint-Germain", "Rive Gauche"],
  },
  options: [
    { detail: "Direct · 38 min", label: "RER B + Metro" },
    { detail: "One change · 44 min", label: "RER B + walk" },
  ],
  document: {
    label: "Louvre timed ticket.pdf",
    meta: "PDF · 184 KB",
  },
} as const;
