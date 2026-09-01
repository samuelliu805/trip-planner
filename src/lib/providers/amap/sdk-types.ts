export type AmapPosition = [longitude: number, latitude: number];

export type AmapLngLat = {
  getLat(): number;
  getLng(): number;
};

export type AmapMarker = object;

export type AmapPolyline = object;
export type AmapOverlay = AmapMarker | AmapPolyline;

export type AmapMap = {
  add(overlays: AmapOverlay | AmapOverlay[]): void;
  destroy(): void;
  panTo(position: AmapPosition): void;
  remove(overlays: AmapOverlay | AmapOverlay[]): void;
  setFitView(
    overlays?: AmapOverlay[],
    immediately?: boolean,
    avoid?: [number, number, number, number],
    maxZoom?: number,
  ): void;
};

export type AmapTip = {
  address?: string | string[];
  district?: string;
  id?: string;
  name?: string;
};

export type AmapPoi = {
  adname?: string;
  address?: string | string[];
  cityname?: string | string[];
  id?: string;
  location?: AmapLngLat | { lat: number; lng: number } | string;
  name?: string;
  pname?: string;
};

export type AmapSearchStatus = "complete" | "error" | "no_data" | string;

export type AmapAutoComplete = {
  close?(): void;
  search(
    input: string,
    callback: (status: AmapSearchStatus, result: { tips?: AmapTip[] } | string) => void,
  ): void;
  setType?(type: string): void;
};

export type AmapPlaceSearch = {
  clear?(): void;
  getDetails(
    id: string,
    callback: (
      status: AmapSearchStatus,
      result: { poiList?: { pois?: AmapPoi[] } } | string,
    ) => void,
  ): void;
};

export type AmapNamespace = {
  AutoComplete: new (options?: { city?: string; citylimit?: boolean }) => AmapAutoComplete;
  Map: new (
    container: HTMLElement,
    options: {
      center: AmapPosition;
      dragEnable?: boolean;
      keyboardEnable?: boolean;
      mapStyle?: string;
      resizeEnable?: boolean;
      rotateEnable?: boolean;
      viewMode?: "2D";
      zoom: number;
      zoomEnable?: boolean;
    },
  ) => AmapMap;
  Marker: new (options: {
    anchor?: "bottom-center";
    content?: HTMLElement;
    position: AmapPosition;
    title?: string;
    zIndex?: number;
  }) => AmapMarker;
  PlaceSearch: new (options?: { extensions?: "all" | "base" }) => AmapPlaceSearch;
  Polyline: new (options: {
    borderWeight?: number;
    lineJoin?: "round";
    path: AmapPosition[];
    showDir?: boolean;
    strokeColor?: string;
    strokeDasharray?: number[];
    strokeOpacity?: number;
    strokeStyle?: "dashed" | "solid";
    strokeWeight?: number;
    zIndex?: number;
  }) => AmapPolyline;
};

export type AmapBrowserWindow = Window & {
  AMap?: AmapNamespace;
  _AMapSecurityConfig?: { serviceHost: string };
};
