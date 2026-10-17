import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { ScatterplotLayer, ArcLayer, TextLayer, GeoJsonLayer } from '@deck.gl/layers';
import { FeatureCollection, Feature, Point } from 'geojson';
import { 
  GEO_NODES, 
  TRANSIT_ARCS, 
  createNodesGeoJSON, 
  createArcsGeoJSON, 
  toWebMercator, 
  formatCoordinates 
} from './geoData';
import { 
  PRESET_GEOJSON_FEEDS, 
  fetchRemoteGeoJson, 
} from './geoJsonService';
import { 
  Globe, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Radio, 
  Database,
  Code,
  MapPin,
  RefreshCw,
  Link,
  CheckCircle2,
  AlertCircle,
  Activity,
  Layers,
  FileText
} from 'lucide-react';

const soundFx = {
  playClick: (_freq?: number) => {},
  playBlip: (_freq?: number) => {},
  playDock: () => {},
};

export interface TacticalMapProps {
  core?: any;
  win?: any;
  theme?: 'dark' | 'light';
  accent?: string;
}

export const TacticalMap: React.FC<TacticalMapProps> = ({ 
  core,
  win,
  theme = 'dark',
  accent = 'cyan'
}) => {
  const [activeTab, setActiveTab] = useState<string>('WORLD_MONITOR');

  // Active GeoJSON Feed State
  const [activeFeedId, setActiveFeedId] = useState<string>('usgs-all-day');
  const [customApiUrl, setCustomApiUrl] = useState<string>('');
  const [activeGeoJson, setActiveGeoJson] = useState<FeatureCollection | null>(null);
  const [isLoadingFeed, setIsLoadingFeed] = useState<boolean>(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [lastFeedFetchTime, setLastFeedFetchTime] = useState<string>('');

  // Selected feature/node inspection
  const [selectedFeature, setSelectedFeature] = useState<{
    id: string;
    name: string;
    category: string;
    lat: number;
    lng: number;
    description: string;
    metric?: string;
    openMapTilesId?: string;
    rawProperties?: any;
  } | null>(null);

  // Layer toggles
  const [showScatterNodes, setShowScatterNodes] = useState<boolean>(true);
  const [showTransitArcs, setShowTransitArcs] = useState<boolean>(true);
  const [showGeoJsonLines, setShowGeoJsonLines] = useState<boolean>(true);
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [is3DMode, setIs3DMode] = useState<boolean>(false);

  // Cursor coordinates
  const [cursorCoords, setCursorCoords] = useState<{
    lat: number;
    lng: number;
    mercatorX: number;
    mercatorY: number;
  }>({
    lat: 20.0,
    lng: 0.0,
    mercatorX: 0,
    mercatorY: 2273030,
  });

  const [hoverInfo, setHoverInfo] = useState<{
    x: number;
    y: number;
    title: string;
    subtitle: string;
    metric?: string;
    id?: string;
  } | null>(null);

  const [isMapReady, setIsMapReady] = useState<boolean>(false);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const pulseRadiusRef = useRef<number>(0);

  // Default internal static GeoJSON datasets
  const staticNodesGeoJson = useMemo(() => createNodesGeoJSON(GEO_NODES), []);
  const staticArcsGeoJson = useMemo(() => createArcsGeoJSON(TRANSIT_ARCS), []);

  // Extract point features from active GeoJSON for point/scatterplot layers
  const pointFeatures = useMemo(() => {
    if (!activeGeoJson || !activeGeoJson.features) return [];
    return activeGeoJson.features.filter((f) => f.geometry && f.geometry.type === 'Point');
  }, [activeGeoJson]);

  // Keep a ref of all reactive data needed for Deck.gl layers so 60fps animation doesn't re-render React
  const stateRef = useRef({
    showScatterNodes,
    showTransitArcs,
    showGeoJsonLines,
    showLabels,
    activeGeoJson,
    pointFeatures,
    selectedFeature,
  });

  useEffect(() => {
    stateRef.current = {
      showScatterNodes,
      showTransitArcs,
      showGeoJsonLines,
      showLabels,
      activeGeoJson,
      pointFeatures,
      selectedFeature,
    };
  }, [
    showScatterNodes,
    showTransitArcs,
    showGeoJsonLines,
    showLabels,
    activeGeoJson,
    pointFeatures,
    selectedFeature,
  ]);

  // Build Deck.gl layer stack
  const buildLayers = useCallback((pulse: number) => {
    const s = stateRef.current;
    const layers: any[] = [];

    // 1. Deck.gl GeoJSON Layer (for general GeoJSON polygons/lines/features)
    if (s.showGeoJsonLines && s.activeGeoJson) {
      layers.push(
        new GeoJsonLayer({
          id: 'deck-geojson-layer',
          data: s.activeGeoJson as any,
          stroked: true,
          filled: true,
          lineWidthMinPixels: 1.5,
          getLineColor: (f: any) => {
            if (f.properties?.category === 'subsea_cable') return [168, 85, 247, 200];
            if (f.properties?.category === 'energy_grid') return [245, 158, 11, 200];
            if (f.properties?.mag) return [239, 68, 68, 200];
            return [6, 182, 212, 180];
          },
          getFillColor: [6, 182, 212, 40],
          getLineWidth: 2,
          pickable: false,
        })
      );
    }

    // 2. Deck.gl 3D ArcLayer for Transcontinental Transit Corridors
    if (s.showTransitArcs) {
      layers.push(
        new ArcLayer({
          id: 'deck-transit-arcs',
          data: TRANSIT_ARCS,
          getSourcePosition: (d: any) => d.source,
          getTargetPosition: (d: any) => d.target,
          getSourceColor: (d: any) => (d.category === 'energy_grid' ? [245, 158, 11, 220] : [6, 182, 212, 220]),
          getTargetColor: (d: any) => (d.category === 'energy_grid' ? [239, 68, 68, 220] : [16, 185, 129, 220]),
          getWidth: 2.5,
          greatCircle: true,
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255, 120],
          onHover: (info: any) => {
            if (info.object) {
              setHoverInfo({
                x: info.x,
                y: info.y,
                title: info.object.name,
                subtitle: `Corridor [${info.object.category.toUpperCase()}]`,
                metric: info.object.volume,
                id: info.object.id,
              });
            } else {
              setHoverInfo(null);
            }
          },
        })
      );
    }

    // 3. Deck.gl Animated Scatterplot Layer for GeoJSON Points (Live Earthquakes / Infrastructure)
    if (s.showScatterNodes && s.pointFeatures.length > 0) {
      // Pulse ring layer driven by pulse float
      layers.push(
        new ScatterplotLayer({
          id: 'deck-points-pulse',
          data: s.pointFeatures,
          getPosition: (f: Feature<Point>) => f.geometry.coordinates as [number, number],
          getRadius: (f: Feature<Point>) => {
            const isSel = s.selectedFeature?.id === f.id;
            const mag = f.properties?.mag || 2;
            const base = isSel ? 600000 : Math.max(250000, mag * 80000);
            return base * (0.4 + pulse * 0.8);
          },
          getFillColor: [0, 0, 0, 0],
          getLineColor: (f: Feature<Point>) => {
            const isSel = s.selectedFeature?.id === f.id;
            const alpha = Math.floor((1 - pulse) * 230);
            if (isSel) return [6, 182, 212, alpha];
            if (f.properties?.mag && f.properties.mag >= 4.5) return [239, 68, 68, alpha];
            if (f.properties?.status === 'ACTIVE') return [239, 68, 68, alpha];
            if (f.properties?.status === 'ELEVATED') return [245, 158, 11, alpha];
            return [56, 189, 248, alpha];
          },
          stroked: true,
          filled: false,
          lineWidthMinPixels: 1.5,
          radiusUnits: 'meters',
          updateTriggers: {
            getRadius: [pulse, s.selectedFeature?.id],
            getLineColor: [pulse, s.selectedFeature?.id],
          },
        })
      );

      // Core Solid Point Layer
      layers.push(
        new ScatterplotLayer({
          id: 'deck-points-core',
          data: s.pointFeatures,
          getPosition: (f: Feature<Point>) => f.geometry.coordinates as [number, number],
          getRadius: (f: Feature<Point>) => {
            const isSel = s.selectedFeature?.id === f.id;
            const mag = f.properties?.mag || 2;
            return isSel ? 140000 : Math.max(70000, mag * 25000);
          },
          getFillColor: (f: Feature<Point>) => {
            if (s.selectedFeature?.id === f.id) return [6, 182, 212, 255];
            if (f.properties?.mag) {
              if (f.properties.mag >= 5.0) return [239, 68, 68, 255];
              if (f.properties.mag >= 3.0) return [245, 158, 11, 255];
              return [16, 185, 129, 240];
            }
            if (f.properties?.status === 'ACTIVE') return [239, 68, 68, 240];
            if (f.properties?.status === 'ELEVATED') return [245, 158, 11, 240];
            if (f.properties?.category === 'logistics') return [16, 185, 129, 240];
            return [56, 189, 248, 240];
          },
          getLineColor: [255, 255, 255, 220],
          lineWidthMinPixels: 1.5,
          stroked: true,
          filled: true,
          radiusUnits: 'meters',
          pickable: true,
          onHover: (info: any) => {
            if (info.object) {
              const feat = info.object as Feature<Point>;
              const title = feat.properties?.title || feat.properties?.place || feat.properties?.name || 'Point Feature';
              const subtitle = feat.properties?.region || feat.properties?.category || 'GeoJSON Point';
              const metric = feat.properties?.mag ? `M ${feat.properties.mag}` : feat.properties?.metric;
              setHoverInfo({
                x: info.x,
                y: info.y,
                title,
                subtitle,
                metric,
                id: String(feat.id || 'feat'),
              });
            } else {
              setHoverInfo(null);
            }
          },
          onClick: (info: any) => {
            if (info.object) {
              handleFeatureSelect(info.object as Feature<Point>);
            }
          },
        })
      );
    }

    // 4. Text Labels Layer
    if (s.showLabels && s.pointFeatures.length > 0) {
      layers.push(
        new TextLayer({
          id: 'deck-point-labels',
          data: s.pointFeatures.slice(0, 35),
          getPosition: (f: Feature<Point>) => f.geometry.coordinates as [number, number],
          getText: (f: Feature<Point>) => {
            const raw = f.properties?.name || f.properties?.place || f.properties?.title || '';
            return String(raw).split(',')[0].toUpperCase();
          },
          getSize: 10,
          getColor: (f: Feature<Point>) =>
            s.selectedFeature?.id === f.id ? [6, 182, 212, 255] : [228, 228, 231, 200],
          getTextAnchor: 'start',
          getAlignmentBaseline: 'center',
          getPixelOffset: [12, 0],
          fontFamily: 'JetBrains Mono, monospace, monospace',
          fontWeight: 700,
          background: true,
          getBackgroundColor: [9, 9, 11, 190],
          backgroundPadding: [3, 2, 3, 2],
        })
      );
    }

    return layers;
  }, []);

  // Optimized animation frame loop: updates Deck.gl overlay without triggering React component re-renders!
  useEffect(() => {
    let startTime = Date.now();
    let isSubscribed = true;

    const animate = () => {
      if (!isSubscribed) return;
      const elapsed = (Date.now() - startTime) % 2000;
      pulseRadiusRef.current = elapsed / 2000;

      if (overlayRef.current && activeTab === 'WORLD_MONITOR') {
        overlayRef.current.setProps({
          layers: buildLayers(pulseRadiusRef.current),
        });
      }

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      isSubscribed = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [activeTab, buildLayers]);

  // Load GeoJSON data source based on activeFeedId
  const loadGeoJsonFeed = useCallback(async (feedId: string, customUrl?: string) => {
    setIsLoadingFeed(true);
    setFeedError(null);
    try {
      if (feedId === 'global-infrastructure') {
        setActiveGeoJson(staticNodesGeoJson);
        setLastFeedFetchTime(new Date().toLocaleTimeString());
        if (GEO_NODES.length > 0) {
          const first = GEO_NODES[0];
          setSelectedFeature({
            id: first.id,
            name: first.name,
            category: first.category,
            lat: first.lat,
            lng: first.lng,
            description: first.description,
            metric: first.metric,
            openMapTilesId: first.openMapTilesId,
            rawProperties: first,
          });
        }
      } else if (feedId === 'transit-corridors') {
        setActiveGeoJson(staticArcsGeoJson as any);
        setLastFeedFetchTime(new Date().toLocaleTimeString());
      } else if (feedId === 'custom' && customUrl) {
        const data = await fetchRemoteGeoJson(customUrl);
        setActiveGeoJson(data);
        setLastFeedFetchTime(new Date().toLocaleTimeString());
      } else {
        const feed = PRESET_GEOJSON_FEEDS.find((f) => f.id === feedId);
        if (feed && feed.isLiveApi) {
          const data = await fetchRemoteGeoJson(feed.url);
          setActiveGeoJson(data);
          setLastFeedFetchTime(new Date().toLocaleTimeString());
          if (data.features.length > 0) {
            const first = data.features[0];
            const coords = (first.geometry as Point)?.coordinates || [0, 0];
            setSelectedFeature({
              id: (first.id as string) || 'feat-0',
              name: first.properties?.title || first.properties?.place || first.properties?.name || 'Live Event',
              category: feed.category,
              lat: coords[1],
              lng: coords[0],
              description: first.properties?.place || first.properties?.description || 'GeoJSON Live Point',
              metric: first.properties?.mag ? `M ${first.properties.mag} Earthquake` : undefined,
              openMapTilesId: `omt-live-${first.id || '0'}`,
              rawProperties: first.properties,
            });
          }
        }
      }
    } catch (err: any) {
      console.error('Failed to load GeoJSON feed:', err);
      setFeedError(err.message || 'Failed to fetch remote GeoJSON data');
      setActiveGeoJson(staticNodesGeoJson);
    } finally {
      setIsLoadingFeed(false);
    }
  }, [staticNodesGeoJson, staticArcsGeoJson]);

  // Initial feed load
  useEffect(() => {
    loadGeoJsonFeed(activeFeedId, customApiUrl);
  }, [activeFeedId, loadGeoJsonFeed]);

  // Handle Feature Selection & Camera Animation
  const handleFeatureSelect = useCallback((feat: Feature<Point>) => {
    soundFx.playBlip(1200);
    const coords = feat.geometry.coordinates;
    const name = feat.properties?.name || feat.properties?.place || feat.properties?.title || 'Selected Point';
    const cat = feat.properties?.category || (feat.properties?.mag ? 'seismic' : 'geospatial');
    const desc = feat.properties?.description || feat.properties?.place || 'GeoJSON Point Feature';
    const metric = feat.properties?.mag ? `Magnitude ${feat.properties.mag}` : feat.properties?.metric;
    const omtId = feat.properties?.openMapTilesId || `omt-${feat.id || 'point'}`;

    const featureObj = {
      id: String(feat.id || name),
      name,
      category: cat,
      lat: coords[1],
      lng: coords[0],
      description: desc,
      metric,
      openMapTilesId: omtId,
      rawProperties: feat.properties,
    };

    setSelectedFeature(featureObj);

    if (core && core.emit) {
      core.emit('osjs/tactical-map:feature-selected', {
        title: `Feature Selected: ${name}`,
        sourceWidgetId: 'os-map',
        payload: {
          ...featureObj,
          webMercator: toWebMercator(coords[1], coords[0]),
          timestamp: new Date().toISOString(),
        },
      });
    }

    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [coords[0], coords[1]],
        zoom: Math.max(mapRef.current.getZoom(), 4.5),
        speed: 1.2,
        curve: 1.4,
        essential: true,
      });
    }
  }, [core]);

  // Initialize MapLibre GL instance + Deck.gl MapboxOverlay
  useEffect(() => {
    if (activeTab !== 'WORLD_MONITOR' || !mapContainerRef.current) return;

    let isMounted = true;
    setIsMapReady(false);

    // Explicitly configure MapLibre Web Worker for Vite environment
    try {
      const workerUrl = new URL('/apps/TacticalMap/maplibre-gl-worker.js', window.location.origin).href;
      maplibregl.setWorkerUrl(workerUrl);
    } catch (e) {
      console.warn('[TacticalMap] Failed to set MapLibre worker URL:', e);
    }

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: "https://tiles.openfreemap.org/styles/dark",
      center: selectedFeature ? [selectedFeature.lng, selectedFeature.lat] : [0, 20],
      zoom: 1.8,
      pitch: is3DMode ? 45 : 0,
      bearing: 0,
      maxPitch: 70,
      attributionControl: false,
      dragPan: true,
      scrollZoom: true,
      boxZoom: true,
      dragRotate: true,
      keyboard: true,
      doubleClickZoom: true,
      touchZoomRotate: true,
    });

    mapRef.current = map;

    map.on('error', (e) => {
      console.warn('[TacticalMap] MapLibre error:', e);
    });

    // Deck.gl Overlay
    const overlay = new MapboxOverlay({
      interleaved: false,
      layers: buildLayers(pulseRadiusRef.current),
    });
    overlayRef.current = overlay;

    // Attach Deck overlay as MapLibre control
    map.addControl(overlay as unknown as maplibregl.IControl);

    // Track mouse coordinates on WGS 84 and Web Mercator
    map.on('mousemove', (e) => {
      if (!isMounted) return;
      const { lat, lng } = e.lngLat;
      const mercator = toWebMercator(lat, lng);
      setCursorCoords({
        lat: Number(lat.toFixed(4)),
        lng: Number(lng.toFixed(4)),
        mercatorX: mercator.x,
        mercatorY: mercator.y,
      });
    });

    map.on('load', () => {
      if (isMounted) {
        setIsMapReady(true);
        map.resize();
      }
    });

    // Repeated size checks for OS.js window mount and animation settling
    const t1 = setTimeout(() => { if (map) map.resize(); }, 150);
    const t2 = setTimeout(() => { if (map) map.resize(); }, 600);

    // ResizeObserver on the container to keep MapLibre WebGL canvas sized accurately inside OS.js resizable window
    const resizeObserver = new ResizeObserver(() => {
      if (map) {
        map.resize();
      }
    });
    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    // OS.js window resize listeners
    const handleWinResize = () => {
      if (map) map.resize();
    };
    if (win && win.on) {
      win.on('resize', handleWinResize);
      win.on('maximize', handleWinResize);
      win.on('restore', handleWinResize);
    }

    return () => {
      isMounted = false;
      clearTimeout(t1);
      clearTimeout(t2);
      resizeObserver.disconnect();
      if (win && win.off) {
        win.off('resize', handleWinResize);
        win.off('maximize', handleWinResize);
        win.off('restore', handleWinResize);
      }
      if (map) {
        map.remove();
      }
      mapRef.current = null;
      overlayRef.current = null;
    };
  }, [activeTab, buildLayers, win]);

  // Toggle 3D pitch tilt
  const handleToggle3D = () => {
    soundFx.playClick(1100);
    const next = !is3DMode;
    setIs3DMode(next);
    if (mapRef.current) {
      mapRef.current.easeTo({
        pitch: next ? 45 : 0,
        duration: 800,
      });
    }
  };

  // Zoom & Reset Helpers
  const handleZoomIn = () => {
    soundFx.playClick(900);
    if (mapRef.current) mapRef.current.zoomIn({ duration: 300 });
  };

  const handleZoomOut = () => {
    soundFx.playClick(900);
    if (mapRef.current) mapRef.current.zoomOut({ duration: 300 });
  };

  const handleResetView = () => {
    soundFx.playDock();
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [0, 20],
        zoom: 1.8,
        pitch: 0,
        bearing: 0,
        duration: 1000,
      });
    }
    setIs3DMode(false);
  };

  return (
    <div className="flex flex-col h-full w-full bg-zinc-950 text-zinc-100 overflow-hidden font-mono select-none">
      {/* OS.JS APPLICATION TOOLBAR / TABS */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 border-b border-zinc-800 text-[11px]">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('WORLD_MONITOR')}
            className={`px-3 py-1 rounded-sm text-[11px] font-bold tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'WORLD_MONITOR'
                ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/60 shadow-[0_0_8px_rgba(6,182,212,0.2)]'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            WORLD MONITOR
          </button>

          <button
            onClick={() => setActiveTab('GEOJSON_FEEDS')}
            className={`px-3 py-1 rounded-sm text-[11px] font-bold tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'GEOJSON_FEEDS'
                ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/60 shadow-[0_0_8px_rgba(6,182,212,0.2)]'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            GEOJSON FEEDS
          </button>

          <button
            onClick={() => setActiveTab('FEATURE_DIRECTORY')}
            className={`px-3 py-1 rounded-sm text-[11px] font-bold tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'FEATURE_DIRECTORY'
                ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/60 shadow-[0_0_8px_rgba(6,182,212,0.2)]'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            FEATURES ({pointFeatures.length})
          </button>

          <button
            onClick={() => setActiveTab('GEOJSON_INSPECTOR')}
            className={`px-3 py-1 rounded-sm text-[11px] font-bold tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'GEOJSON_INSPECTOR'
                ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/60 shadow-[0_0_8px_rgba(6,182,212,0.2)]'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            INSPECTOR
          </button>
        </div>

        {/* Status / Feed badge */}
        <div className="flex items-center gap-2 text-[10px]">
          <span className={`w-2 h-2 rounded-full ${isLoadingFeed ? 'bg-amber-400 animate-spin' : 'bg-emerald-400 animate-pulse'}`} />
          <span className="text-zinc-400 font-semibold">{activeFeedId.toUpperCase()}</span>
          {lastFeedFetchTime && (
            <span className="text-zinc-500 hidden sm:inline">[{lastFeedFetchTime}]</span>
          )}
        </div>
      </div>

      {/* SUBHEADER: Basemap Style, Layer Toggles & Coordinate HUD */}
      <div className="flex flex-wrap items-center justify-between px-3 py-1.5 border-b border-zinc-800 bg-zinc-950 text-[11px] gap-2">
        {/* Active Target / Live Feed Badge */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-sm border border-cyan-500/40 bg-cyan-950/40 text-cyan-400 font-bold">
            <Globe className="w-3 h-3" />
            <span>{selectedFeature ? selectedFeature.name.toUpperCase() : 'TACTICAL MAP'}</span>
          </div>

          {/* Coordinate HUD */}
          <div className="hidden lg:flex items-center gap-2 text-[10px] text-zinc-400 pl-2 border-l border-zinc-800">
            <span className="text-zinc-500">WGS84:</span>
            <span className="font-semibold text-zinc-300">
              {formatCoordinates(cursorCoords.lat, cursorCoords.lng)}
            </span>
            <span className="text-zinc-600">|</span>
            <span className="text-zinc-500">EPSG:3857:</span>
            <span className="text-zinc-300 font-semibold">
              X:{cursorCoords.mercatorX} Y:{cursorCoords.mercatorY}
            </span>
          </div>
        </div>

        {/* Right Controls: OpenFreeMap Dark Basemap Badge, Layers, 3D Tilt, Zoom */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* OpenFreeMap Dark Dedicated Basemap Badge */}
          <div className="flex items-center gap-1.5 bg-black/60 px-2 py-0.5 rounded-sm border border-zinc-800 text-[10px]">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            <span className="text-zinc-400">BASEMAP:</span>
            <span className="text-cyan-300 font-bold tracking-wider">OPENFREEMAP DARK</span>
          </div>

          {/* Deck.gl Layer Toggles */}
          <div className="flex items-center gap-1 text-[10px]">
            <button
              onClick={() => setShowScatterNodes(!showScatterNodes)}
              className={`px-2 py-0.5 border rounded-sm transition-colors cursor-pointer ${
                showScatterNodes
                  ? 'bg-cyan-950/60 text-cyan-300 border-cyan-500/60 font-bold'
                  : 'text-zinc-500 border-zinc-800 bg-zinc-900'
              }`}
              title="Toggle Deck.gl Scatterplot Points"
            >
              NODES
            </button>

            <button
              onClick={() => setShowTransitArcs(!showTransitArcs)}
              className={`px-2 py-0.5 border rounded-sm transition-colors cursor-pointer ${
                showTransitArcs
                  ? 'bg-purple-950/60 text-purple-300 border-purple-500/60 font-bold'
                  : 'text-zinc-500 border-zinc-800 bg-zinc-900'
              }`}
              title="Toggle 3D Transit Arcs"
            >
              ARCS
            </button>

            <button
              onClick={() => setShowLabels(!showLabels)}
              className={`px-2 py-0.5 border rounded-sm transition-colors cursor-pointer ${
                showLabels
                  ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/60 font-bold'
                  : 'text-zinc-500 border-zinc-800 bg-zinc-900'
              }`}
              title="Toggle Text Labels"
            >
              LABELS
            </button>

            <button
              onClick={handleToggle3D}
              className={`px-2 py-0.5 border rounded-sm transition-colors cursor-pointer ${
                is3DMode
                  ? 'bg-amber-950/60 text-amber-300 border-amber-500/60 font-bold'
                  : 'text-zinc-500 border-zinc-800 bg-zinc-900'
              }`}
              title="Toggle 3D Perspective Tilt"
            >
              3D
            </button>
          </div>

          {/* Navigation buttons */}
          <div className="flex items-center gap-1 pl-1 border-l border-zinc-800">
            <button
              onClick={handleZoomIn}
              className="p-1 border border-zinc-800 rounded-sm text-zinc-400 hover:text-cyan-400 hover:bg-zinc-900 cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleZoomOut}
              className="p-1 border border-zinc-800 rounded-sm text-zinc-400 hover:text-cyan-400 hover:bg-zinc-900 cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleResetView}
              className="p-1 border border-zinc-800 rounded-sm text-zinc-400 hover:text-cyan-400 hover:bg-zinc-900 cursor-pointer"
              title="Reset Global View"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* TAB 1: WORLD MONITOR VIEWPORT (MapLibre + OpenFreeMap + Deck.gl) */}
      {activeTab === 'WORLD_MONITOR' && (
        <div className="flex-1 flex flex-col min-h-0 relative w-full h-full overflow-hidden bg-black">
          {/* Map Container */}
          <div
            ref={mapContainerRef}
            className="flex-1 w-full h-full min-h-[300px]"
            style={{ position: 'relative', width: '100%', height: '100%' }}
          />

          {/* Tile & WebGL Pipeline Source Badge */}
          <div className="absolute top-2 left-2 z-10 pointer-events-none flex items-center gap-2">
            <div className="px-2.5 py-1 bg-black/85 border border-zinc-800 rounded-sm text-[10px] text-zinc-300 backdrop-blur-md flex items-center gap-1.5 shadow-lg">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-zinc-500 font-bold">BASEMAP:</span>
              <span className="text-cyan-400 font-semibold">OpenFreeMap Vector GL</span>
              <span className="text-zinc-600">/</span>
              <span className="text-purple-400 font-semibold">Deck.gl WebGL Layer Stack</span>
            </div>
          </div>

          {/* Hover Tooltip Card */}
          {hoverInfo && (
            <div
              className="absolute z-30 pointer-events-none px-3 py-2 bg-zinc-950/95 border border-cyan-500/70 rounded-sm text-[10px] text-zinc-200 shadow-2xl backdrop-blur-md font-mono transform -translate-x-1/2 -translate-y-full -mt-3"
              style={{ left: hoverInfo.x, top: hoverInfo.y }}
            >
              <div className="font-bold text-cyan-300 flex items-center gap-1.5">
                <MapPin className="w-3 h-3 text-cyan-400" />
                <span>{hoverInfo.title}</span>
              </div>
              <div className="text-zinc-400 text-[9px] pt-0.5">{hoverInfo.subtitle}</div>
              {hoverInfo.metric && (
                <div className="text-emerald-400 font-semibold text-[9px] pt-0.5">
                  {hoverInfo.metric}
                </div>
              )}
              {hoverInfo.id && (
                <div className="text-zinc-500 text-[8px] pt-0.5">ID: {hoverInfo.id}</div>
              )}
            </div>
          )}

          {/* Selected Feature HUD Card */}
          {selectedFeature && (
            <div className="absolute bottom-2 left-2 right-2 p-3 rounded-sm border border-cyan-500/40 bg-zinc-950/90 text-zinc-200 text-[11px] font-mono backdrop-blur-md z-20 flex flex-wrap items-center justify-between gap-2 shadow-2xl">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-sm border border-cyan-500/30 bg-cyan-950/40 text-cyan-400">
                  <Radio className="w-4 h-4 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-white">{selectedFeature.name}</span>
                    <span className="px-1.5 py-0.2 bg-zinc-900 border border-zinc-800 text-[9px] text-cyan-400 rounded-sm uppercase font-bold">
                      {selectedFeature.category}
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-400 truncate max-w-xl pt-0.5">
                    {selectedFeature.description}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 text-[10px]">
                {selectedFeature.metric && (
                  <div className="bg-black/60 px-2.5 py-1 rounded-sm border border-zinc-800 text-zinc-400">
                    <span className="text-zinc-500 font-bold mr-1">METRIC:</span>
                    <span className="text-emerald-400 font-semibold">{selectedFeature.metric}</span>
                  </div>
                )}
                <div className="bg-black/60 px-2.5 py-1 rounded-sm border border-zinc-800 text-zinc-400 hidden sm:block">
                  <span className="text-zinc-500 font-bold mr-1">COORDS:</span>
                  <span className="text-zinc-300">
                    {formatCoordinates(selectedFeature.lat, selectedFeature.lng)}
                  </span>
                </div>
                {selectedFeature.openMapTilesId && (
                  <div className="bg-black/60 px-2.5 py-1 rounded-sm border border-zinc-800 text-zinc-400 hidden md:block">
                    <span className="text-zinc-500 font-bold mr-1">OMT:</span>
                    <span className="text-zinc-400">{selectedFeature.openMapTilesId}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: LIVE GEOJSON APIS & FEED SOURCES */}
      {activeTab === 'GEOJSON_FEEDS' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-xs bg-zinc-950">
          <div className="p-3 border border-zinc-800 rounded-sm bg-zinc-900/60">
            <h4 className="font-bold text-cyan-400 mb-1 flex items-center gap-1.5">
              <Database className="w-4 h-4" /> LIVE GEOJSON DATA APIS & FEEDS
            </h4>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Connect and stream live RFC 7946 GeoJSON endpoints directly into MapLibre GL and the Deck.gl layer pipeline. Data coordinates synchronize across WGS 84 (EPSG:4326) and Web Mercator (EPSG:3857).
            </p>
          </div>

          {/* Preset Feeds */}
          <div className="space-y-2">
            <span className="text-[10px] font-bold text-zinc-400 block">STANDARD DATA SOURCES:</span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {PRESET_GEOJSON_FEEDS.map((feed) => {
                const isActive = activeFeedId === feed.id;
                return (
                  <div
                    key={feed.id}
                    onClick={() => {
                      soundFx.playClick(1000);
                      setActiveFeedId(feed.id);
                    }}
                    className={`p-3 border rounded-sm transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                      isActive
                        ? 'border-cyan-500 bg-cyan-950/30 text-white ring-1 ring-cyan-500/50'
                        : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 text-zinc-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-xs text-zinc-100">{feed.name}</span>
                        {feed.isLiveApi && (
                          <span className="px-1.5 py-0.2 bg-emerald-950/60 text-emerald-300 border border-emerald-500/40 text-[9px] rounded-sm font-bold">
                            LIVE API
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-zinc-400 pt-1 leading-relaxed">{feed.description}</p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-zinc-800/60 text-[9px]">
                      <span className="text-zinc-500 truncate max-w-[200px]">{feed.url}</span>
                      {isActive && (
                        <span className="text-cyan-400 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> ACTIVE
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Custom GeoJSON API URL Input */}
          <div className="p-3 border border-zinc-800 rounded-sm space-y-2 bg-zinc-900/50">
            <span className="text-[10px] font-bold text-zinc-400 flex items-center gap-1.5">
              <Link className="w-3.5 h-3.5 text-cyan-400" /> CONNECT CUSTOM REMOTE GEOJSON API URL:
            </span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="https://example.com/api/features.geojson"
                value={customApiUrl}
                onChange={(e) => setCustomApiUrl(e.target.value)}
                className="flex-1 bg-black/60 border border-zinc-800 rounded-sm px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-cyan-500"
              />
              <button
                onClick={() => {
                  if (customApiUrl) {
                    soundFx.playClick(1000);
                    setActiveFeedId('custom');
                    loadGeoJsonFeed('custom', customApiUrl);
                  }
                }}
                disabled={!customApiUrl || isLoadingFeed}
                className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-black font-bold rounded-sm cursor-pointer text-xs"
              >
                {isLoadingFeed ? 'FETCHING...' : 'LOAD API'}
              </button>
            </div>

            {feedError && (
              <div className="p-2 border border-rose-500/40 bg-rose-950/20 rounded-sm text-[10px] text-rose-300 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{feedError}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: FEATURE DIRECTORY */}
      {activeTab === 'FEATURE_DIRECTORY' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-xs bg-zinc-950">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <span className="text-[10px] font-bold text-zinc-400">
              ACTIVE GEODATA FEATURES ({pointFeatures.length} POINTS IN FEED):
            </span>
            <button
              onClick={() => loadGeoJsonFeed(activeFeedId, customApiUrl)}
              className="px-2 py-0.5 border border-zinc-800 hover:border-cyan-500 rounded-sm text-[10px] text-zinc-400 hover:text-cyan-400 flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${isLoadingFeed ? 'animate-spin' : ''}`} /> REFRESH
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {pointFeatures.map((feat, idx) => {
              const coords = (feat.geometry as Point).coordinates;
              const name = feat.properties?.title || feat.properties?.place || feat.properties?.name || `Point #${idx + 1}`;
              const isSelected = selectedFeature?.id === feat.id;

              return (
                <div
                  key={String(feat.id || idx)}
                  onClick={() => {
                    handleFeatureSelect(feat as Feature<Point>);
                    setActiveTab('WORLD_MONITOR');
                  }}
                  className={`p-3 border rounded-sm transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                    isSelected
                      ? 'border-cyan-500 bg-cyan-950/30 text-white ring-1 ring-cyan-500/50'
                      : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 text-zinc-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <MapPin className={`w-4 h-4 mt-0.5 shrink-0 ${isSelected ? 'text-cyan-400' : 'text-zinc-500'}`} />
                      <div>
                        <span className="font-bold text-xs text-zinc-100 block">{name}</span>
                        <span className="text-[10px] text-zinc-400">
                          {formatCoordinates(coords[1], coords[0])}
                        </span>
                      </div>
                    </div>

                    {feat.properties?.mag && (
                      <span className="px-1.5 py-0.2 bg-rose-950/60 text-rose-300 border border-rose-500/40 text-[9px] rounded-sm font-bold">
                        M {feat.properties.mag}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-zinc-800/60 text-[9px] text-zinc-500">
                    <span>EPSG:3857: X:{toWebMercator(coords[1], coords[0]).x}</span>
                    <span className="text-cyan-400 font-semibold">CLICK TO FLYTO</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: GEOJSON & OPENMAPTILES INSPECTOR */}
      {activeTab === 'GEOJSON_INSPECTOR' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-xs bg-zinc-950">
          <div className="p-3 border border-cyan-500/30 bg-cyan-950/20 rounded-sm space-y-1 text-cyan-300">
            <div className="flex items-center gap-2">
              <Code className="w-4 h-4 text-cyan-400" />
              <span className="font-bold text-xs text-white">
                RFC 7946 GEOJSON FEATURECOLLECTION & PROJECTION SCHEMA
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-zinc-300">
              Live GeoJSON stream feeding MapLibre GL and Deck.gl WebGL pipeline. Point geometries `[longitude, latitude]` project seamlessly with OpenFreeMap vector basemap and OpenMapTiles ID references.
            </p>
          </div>

          {/* Live GeoJSON Code Block */}
          <div className="p-3 border border-zinc-800 rounded-sm space-y-2 bg-zinc-900/50">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-zinc-400">
                FEATURECOLLECTION PAYLOAD ({activeGeoJson?.features?.length || 0} TOTAL FEATURES):
              </span>
              <span className="text-[9px] text-emerald-400">STATUS: 200 OK</span>
            </div>
            <div className="p-2.5 bg-black/90 border border-zinc-800 rounded-sm text-[10px] text-emerald-400 font-mono max-h-64 overflow-y-auto">
              <pre>{JSON.stringify(activeGeoJson || staticNodesGeoJson, null, 2)}</pre>
            </div>
          </div>

          {/* Coordinate Conversion Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
            <div className="p-2.5 border border-zinc-800 bg-black/40 rounded-sm space-y-1">
              <span className="text-zinc-400 font-bold block">WGS 84 DATUM (EPSG:4326)</span>
              <p className="text-zinc-500">Spherical degree coordinate pairs [lng, lat] utilized in standard GeoJSON specifications.</p>
              <div className="pt-1 text-cyan-400">
                Target: {selectedFeature ? `${selectedFeature.lat}°, ${selectedFeature.lng}°` : '0°, 0°'}
              </div>
            </div>
            <div className="p-2.5 border border-zinc-800 bg-black/40 rounded-sm space-y-1">
              <span className="text-zinc-400 font-bold block">WEB MERCATOR (EPSG:3857)</span>
              <p className="text-zinc-500">Planar metric projection used for vector tile rasterization and WebGL shader matrix calculations.</p>
              <div className="pt-1 text-purple-400">
                {selectedFeature ? `X: ${toWebMercator(selectedFeature.lat, selectedFeature.lng).x}m, Y: ${toWebMercator(selectedFeature.lat, selectedFeature.lng).y}m` : '0m, 0m'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
