// The street map under a post's place, where iOS draws MapKit. Free and
// keyless: OpenFreeMap's dark style rendered with MapLibre. Loaded only when a
// map is on screen, so the rest of the app never downloads it.
import { useEffect, useRef } from "react";
import { Map as MapLibreMap, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// The tile worker, as its own file: a bundler can't find it on its own.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";

setWorkerUrl(workerUrl);

const STYLE = "https://tiles.openfreemap.org/styles/dark";

/** A still, non-interactive map centred on a point at a zoom given for 512-pixel tiles. */
export default function LiveMap(p: { latitude: number; longitude: number; zoom: number }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    const map = new MapLibreMap({
      container: host.current,
      style: STYLE,
      center: [p.longitude, p.latitude],
      zoom: p.zoom,
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
    });
    return () => map.remove();
  }, [p.latitude, p.longitude, p.zoom]);
  return <div ref={host} style={{ position: "absolute", inset: 0 }} aria-hidden />;
}
