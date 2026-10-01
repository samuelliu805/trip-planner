/** Exercise the real React map/marker components without calling Google or consuming quota. */
export function installGoogleMapsMock() {
  const listeners = new WeakMap();
  function addListener(target, name, callback) {
    const entries = listeners.get(target) ?? [];
    const entry = { name, callback };
    entries.push(entry);
    listeners.set(target, entries);
    if (name === "tilesloaded") setTimeout(callback, 0);
    return { remove: () => entries.splice(entries.indexOf(entry), 1) };
  }
  class MockMap {
    constructor(node, options) {
      this.node = node;
      this.options = options;
      node.dataset.mockGoogleMap = "ready";
      node.style.background = "#dbe5dc";
      window.mockMapConstructions = (window.mockMapConstructions ?? 0) + 1;
    }
    addListener(name, callback) {
      return addListener(this, name, callback);
    }
    getDiv() {
      return this.node;
    }
    getCenter() {
      return { toJSON: () => this.options.center ?? { lat: 20, lng: 0 } };
    }
    getZoom() {
      return this.options.zoom ?? 2;
    }
    getHeading() {
      return 0;
    }
    getTilt() {
      return 0;
    }
    getBounds() {
      return { toJSON: () => ({ east: 180, west: -180, north: 90, south: -90 }) };
    }
    getProjection() {
      return {};
    }
    setOptions(options) {
      Object.assign(this.options, options);
    }
    moveCamera(options) {
      this.setOptions(options);
    }
    fitBounds() {}
    panTo(center) {
      this.options.center = center;
    }
  }
  class MockAdvancedMarker extends EventTarget {
    constructor(options) {
      super();
      Object.assign(this, options);
    }
    setAttribute(name, value) {
      this.content?.setAttribute(name, value);
    }
    set map(value) {
      if (window.mockAdvancedMarkerMapFailure)
        throw new TypeError("Cannot read properties of undefined (reading 'getRootNode')");
      this.currentMap = value;
      if (value) {
        this.content.dataset.mockGoogleMarker = "ready";
        value.getDiv().appendChild(this.content);
      } else this.content?.remove();
    }
    get map() {
      return this.currentMap;
    }
  }
  class MockOverlayView {
    setMap(map) {
      if (this.currentMap) {
        const remove = this.onRemove;
        if (window.mockDeferredOverlayRemoval) setTimeout(() => remove?.(), 30);
        else remove?.();
      }
      this.currentMap = map;
      if (map) {
        this.onAdd?.();
        this.draw?.();
      }
    }
    getPanes() {
      if (!this.currentMap) return null;
      return {
        overlayMouseTarget: {
          appendChild: (node) => {
            node.dataset.mockGoogleMarker = "ready";
            return this.currentMap.getDiv().appendChild(node);
          },
        },
      };
    }
    getProjection() {
      const node = this.currentMap?.getDiv();
      return node
        ? {
            fromLatLngToDivPixel: (position) => ({
              x: node.clientWidth / 2 + position.lng(),
              y: node.clientHeight / 2 - position.lat(),
            }),
          }
        : undefined;
    }
  }
  class MockLatLng {
    constructor(position) {
      this.position = position;
    }
    lat() {
      return typeof this.position.lat === "function" ? this.position.lat() : this.position.lat;
    }
    lng() {
      return typeof this.position.lng === "function" ? this.position.lng() : this.position.lng;
    }
  }
  class MockPin {
    constructor(options) {
      this.element = document.createElement("span");
      this.element.dataset.mockGooglePin = "ready";
      this.element.textContent = options.glyphText ?? options.glyph ?? "●";
      this.element.element = this.element;
      return this.element;
    }
  }
  class MockPolyline {
    constructor(options) {
      this.options = options;
    }
    setOptions(options) {
      Object.assign(this.options, options);
    }
    setMap(map) {
      this.map = map;
    }
    setPath(path) {
      this.options.path = path;
    }
    getPath() {
      return { getArray: () => this.options.path ?? [] };
    }
  }
  const marker = { AdvancedMarkerElement: MockAdvancedMarker, PinElement: MockPin };
  const maps = {
    Map: MockMap,
    OverlayView: MockOverlayView,
    LatLng: MockLatLng,
    Polyline: MockPolyline,
    marker,
    version: innerWidth === 430 ? "3.62.0" : "3.61.0",
    Settings: { getInstance: () => ({}) },
    event: { addListener, clearInstanceListeners: (target) => listeners.delete(target) },
  };
  maps.importLibrary = async (name) => (name === "marker" ? marker : name === "places" ? {} : maps);
  window.google = { maps };
}
