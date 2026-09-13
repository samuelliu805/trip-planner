import type { DockKind } from "./paris-fixture";

export type DockState = "scattered" | "routing" | "docking" | "assembled";
export type DockRect = { height: number; width: number; x: number; y: number };
export type FragmentTransform = DockRect & {
  blur: number;
  borderRadius: number;
  depth: number;
  opacity: number;
  rotation: number;
  scale: number;
};

export type MobileWorkspaceLayout = {
  scale: number;
  top: number;
  width: number;
};

export function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function scrollProgress(
  scrollY: number,
  heroTop: number,
  heroHeight: number,
  viewport: number,
) {
  const range = Math.max(1, heroHeight - viewport);
  return clamp((scrollY - heroTop) / range);
}

export function shouldResetLandingScroll(viewportWidth: number, hash: string) {
  return viewportWidth < 700 && hash.length === 0;
}

export function mobileWorkspaceLayout(
  viewportWidth: number,
  viewportHeight: number,
  copyBottom: number,
  workspaceHeight: number,
): MobileWorkspaceLayout {
  const sideGutter = 12;
  const bottomGutter = 84;
  const copyGap = 24;
  const latestTop = Math.max(0, viewportHeight - workspaceHeight - bottomGutter);
  const preferredTop = Math.max(viewportHeight * 0.43, copyBottom + copyGap);
  return {
    scale: 1,
    top: Math.min(preferredTop, latestTop),
    width: Math.max(1, viewportWidth - sideGutter * 2),
  };
}

export function dockState(progress: number): DockState {
  if (progress < 0.14) return "scattered";
  if (progress < 0.5) return "routing";
  if (progress < 0.75) return "docking";
  return "assembled";
}

export function effectiveDockProgress(
  progress: number,
  reducedMotion: boolean,
  webglFailed: boolean,
) {
  return reducedMotion || webglFailed ? 1 : clamp(progress);
}

export function easeInOutCubic(value: number) {
  const t = clamp(value);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function mix(from: number, to: number, amount: number) {
  return from + (to - from) * amount;
}

const routeOffsets: Record<DockKind, { depth: number; rotation: number; x: number; y: number }> = {
  route: { depth: -50, x: -18, y: -22, rotation: -2 },
  stay: { depth: 64, x: 20, y: 48, rotation: 1.5 },
  activity: { depth: 28, x: -285, y: -62, rotation: -1.2 },
  document: { depth: -24, x: -280, y: 122, rotation: 2.2 },
};

export function fragmentTransform(
  kind: DockKind,
  progress: number,
  start: FragmentTransform,
  target: DockRect,
  movementScale = 1,
): FragmentTransform {
  const routeT = easeInOutCubic((progress - 0.14) / 0.36);
  const dockT = easeInOutCubic((progress - 0.5) / 0.22);
  const snapT = clamp((progress - 0.64) / 0.08);
  const snapScale = Math.sin(snapT * Math.PI) * 0.025;
  const baseOffset = routeOffsets[kind];
  const offset = {
    ...baseOffset,
    x: baseOffset.x * movementScale,
    y: baseOffset.y * movementScale,
    depth: baseOffset.depth * movementScale,
  };
  const approach = {
    x: target.x + offset.x,
    y: target.y + offset.y,
    width: mix(start.width, target.width, 0.82),
    height: mix(start.height, target.height, 0.82),
  };
  const routed = {
    x: mix(start.x, approach.x, routeT),
    y: mix(start.y, approach.y, routeT) + Math.sin(routeT * Math.PI) * offset.y * 0.2,
    width: mix(start.width, approach.width, routeT),
    height: mix(start.height, approach.height, routeT),
    depth: mix(start.depth, offset.depth, routeT),
  };
  const crossfade = clamp((progress - 0.72) / 0.03);
  return {
    blur: mix(mix(start.blur, 0.35, routeT), 0, dockT),
    x: mix(routed.x, target.x, dockT),
    y: mix(routed.y, target.y, dockT),
    width: mix(routed.width, target.width, dockT),
    height: mix(routed.height, target.height, dockT),
    scale: mix(mix(start.scale, 0.98, routeT), 1, dockT) + snapScale,
    rotation: mix(mix(start.rotation, offset.rotation, routeT), 0, dockT),
    borderRadius: mix(mix(start.borderRadius, 13, routeT), 8, dockT),
    depth: mix(routed.depth, 0, dockT),
    opacity: 1 - crossfade,
  };
}

export function targetContentOpacity(progress: number) {
  return clamp((progress - 0.72) / 0.03);
}
