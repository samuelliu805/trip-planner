export interface Coordinates {
  latitude: number;
  longitude: number;
}

export function hasValidCoordinates(value: Coordinates): boolean {
  return (
    Number.isFinite(value.latitude) &&
    Number.isFinite(value.longitude) &&
    value.latitude >= -90 &&
    value.latitude <= 90 &&
    value.longitude >= -180 &&
    value.longitude <= 180
  );
}

export interface MapMarker {
  id: string;
  position: Coordinates;
  label?: string;
}

export interface MapProvider {
  fitToMarkers(markers: MapMarker[]): void;
  focusMarker(markerId: string): void;
}
