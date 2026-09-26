export function settlePullUpPanel({
  distance,
  forceSnapBack = false,
  height,
  velocity,
}: {
  distance: number;
  forceSnapBack?: boolean;
  height: number;
  velocity: number;
}) {
  const projected = distance + Math.max(-1.5, Math.min(2.5, velocity)) * 180;
  const close = !forceSnapBack && projected >= Math.min(height * 0.38, 260);
  const remaining = close ? height - distance : distance;
  const duration = Math.max(180, Math.min(380, remaining / Math.max(0.8, Math.abs(velocity))));
  return { close, duration };
}
