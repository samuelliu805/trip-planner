export interface Coordinates {
  latitude: number;
  longitude: number;
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
