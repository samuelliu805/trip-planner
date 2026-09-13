import { dockKinds, type DockKind } from "./paris-fixture";
import type { FragmentTransform } from "./route-dock-math";

const fragmentStarts: Record<DockKind, FragmentTransform> = {
  route: {
    blur: 0,
    x: 0,
    y: 0,
    width: 238,
    height: 88,
    scale: 1,
    rotation: -5,
    borderRadius: 16,
    depth: -70,
    opacity: 1,
  },
  stay: {
    blur: 0,
    x: 0,
    y: 0,
    width: 220,
    height: 78,
    scale: 1.04,
    rotation: 3,
    borderRadius: 16,
    depth: 90,
    opacity: 1,
  },
  activity: {
    blur: 0,
    x: 0,
    y: 0,
    width: 216,
    height: 78,
    scale: 1,
    rotation: -2,
    borderRadius: 16,
    depth: 35,
    opacity: 1,
  },
  document: {
    blur: 0,
    x: 0,
    y: 0,
    width: 226,
    height: 82,
    scale: 1,
    rotation: 4,
    borderRadius: 16,
    depth: -45,
    opacity: 1,
  },
};

const desktopPositions: Record<DockKind, { x: number; y: number }> = {
  route: { x: 0.47, y: 0.13 },
  stay: { x: 0.77, y: 0.2 },
  activity: { x: 0.5, y: 0.62 },
  document: { x: 0.75, y: 0.72 },
};

export function initialFragmentRect(kind: DockKind, width: number, height: number) {
  const mobile = width < 700;
  const compact = !mobile && width <= 1024;
  const index = dockKinds.indexOf(kind);
  const row = Math.floor(index / (mobile ? 2 : 1));
  const column = index % (mobile ? 2 : 1);
  const base = fragmentStarts[kind];
  const compactPositions: Record<DockKind, { x: number; y: number }> = {
    route: { x: 0.42, y: 0.13 },
    stay: { x: 0.68, y: 0.25 },
    activity: { x: 0.44, y: 0.6 },
    document: { x: 0.68, y: 0.73 },
  };
  return {
    ...base,
    width: mobile
      ? Math.min(base.width, width * (kind === "route" ? 0.58 : 0.4))
      : compact
        ? base.width * 0.84
        : base.width,
    height: mobile ? 70 : compact ? base.height * 0.84 : base.height,
    x: mobile
      ? width * (kind === "route" ? 0.1 : 0.08) + column * (width * 0.44)
      : width * (compact ? compactPositions[kind].x : desktopPositions[kind].x),
    y: mobile
      ? height * 0.57 + row * 86
      : height * (compact ? compactPositions[kind].y : desktopPositions[kind].y),
  };
}
