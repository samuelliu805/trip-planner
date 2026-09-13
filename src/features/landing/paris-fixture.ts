import type { AppRegion } from "@/platform/config/provider-matrix";

export type DockKind = "route" | "stay" | "activity" | "document";

export const dockKinds: DockKind[] = ["route", "stay", "activity", "document"];

export type LandingFixture = {
  activityTime: string;
  cityLabel: string;
  code: string;
  dateRange: string;
  days: ReadonlyArray<{
    activity: string;
    city: string;
    date: string;
    day: string;
    meal: string;
    stay: string;
  }>;
  document: { connection: string; label: string; link: string; meta: string };
  heroPhoto: string;
  options: ReadonlyArray<{ detail: string; label: string }>;
  optionsDestination: string;
  place: { label: string; meta: string };
  route: {
    ariaLabel: string;
    label: string;
    mapLabel: string;
    photo: string;
    stopMeta: readonly [string, string, string];
    stops: readonly [string, string, string];
  };
  title: string;
  transport: readonly [string, string];
};

export const parisLandingFixture = {
  activityTime: "14:30",
  cityLabel: "Paris, France",
  code: "PAR · 07:40",
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
    ariaLabel: "Illustrative Paris route map",
    label: "Paris day route",
    mapLabel: "PARIS · DAY 1",
    photo: "/landing/seine-route.webp",
    stopMeta: ["Museum morning", "Neighbourhood walk", "Evening base"],
    stops: ["Louvre Museum", "Saint-Germain", "Rive Gauche"],
  },
  options: [
    { detail: "Direct · 38 min", label: "RER B + Metro" },
    { detail: "One change · 44 min", label: "RER B + walk" },
  ],
  document: {
    connection: "Connected to Louvre Museum",
    label: "Louvre timed ticket.pdf",
    link: "louvre.fr/visit",
    meta: "PDF · 184 KB",
  },
  heroPhoto: "/landing/paris-morning.webp",
  optionsDestination: "Transfer to Rive Gauche",
  place: { label: "Louvre Museum", meta: "Paris · saved place" },
  transport: ["Metro to hotel", "Walk + Metro"],
} as const satisfies LandingFixture;

export const sichuanLandingFixture = {
  activityTime: "15:30",
  cityLabel: "Western Sichuan, China",
  code: "CTU · 08:20",
  dateRange: "Oct 2–5, 2027",
  days: [
    {
      activity: "Kangding Old Town",
      city: "Kangding",
      date: "Oct 2",
      day: "Day 1",
      meal: "Ya’an roadside lunch",
      stay: "Xinduqiao Guesthouse",
    },
    {
      activity: "Tagong Grassland",
      city: "Xinduqiao",
      date: "Oct 3",
      day: "Day 2",
      meal: "Yak hotpot",
      stay: "Xinduqiao Guesthouse",
    },
    {
      activity: "Jiaju Tibetan Village",
      city: "Danba",
      date: "Oct 4",
      day: "Day 3",
      meal: "Local family dinner",
      stay: "Danba Homestay",
    },
  ],
  document: {
    connection: "Connected to Tagong Grassland",
    label: "Tagong guesthouse confirmation.pdf",
    link: "sc.gov.cn · visitor guide",
    meta: "PDF · 210 KB",
  },
  heroPhoto: "/landing/western-sichuan-road.webp",
  options: [
    { detail: "Direct · 5 hr", label: "G318 via Kangding" },
    { detail: "One scenic stop · 6 hr", label: "S434 mountain route" },
  ],
  optionsDestination: "Transfer to Xinduqiao",
  place: { label: "Tagong Grassland", meta: "Western Sichuan · saved place" },
  route: {
    ariaLabel: "Illustrative western Sichuan route map",
    label: "Western Sichuan day route",
    mapLabel: "WESTERN SICHUAN · DAY 2",
    photo: "/landing/western-sichuan-road.webp",
    stopMeta: ["Mountain town start", "Highland road", "Meadow afternoon"],
    stops: ["Kangding", "Xinduqiao", "Tagong Grassland"],
  },
  title: "Western Sichuan Loop",
  transport: ["Drive to Kangding", "Scenic drive"],
} as const satisfies LandingFixture;

export function landingFixtureForRegion(region: AppRegion): LandingFixture {
  return region === "cn" ? sichuanLandingFixture : parisLandingFixture;
}
