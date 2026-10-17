import { FeatureCollection, Feature, Point, LineString } from 'geojson';

export interface GeoNode {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: 'maritime' | 'logistics' | 'infrastructure' | 'energy' | 'environmental' | 'urban';
  status: 'ACTIVE' | 'ELEVATED' | 'NOMINAL' | 'MONITORED';
  region: string;
  description: string;
  metric: string;
  openMapTilesId?: string;
}

export interface TransitArc {
  id: string;
  name: string;
  source: [number, number]; // [lng, lat]
  target: [number, number]; // [lng, lat]
  category: 'maritime' | 'air_freight' | 'subsea_cable' | 'energy_grid';
  volume: string;
  status: 'OPTIMAL' | 'CONGESTED' | 'MONITORED';
}

export const GEO_NODES: GeoNode[] = [
  {
    id: 'node-hormuz',
    name: 'Strait of Hormuz',
    lat: 26.56,
    lng: 56.25,
    category: 'maritime',
    status: 'ACTIVE',
    region: 'Middle East / Persian Gulf',
    description: 'Primary global energy artery handling ~21M barrels of crude per day.',
    metric: '21.0 M bpd throughput',
    openMapTilesId: 'omt-waterway-hormuz-01',
  },
  {
    id: 'node-malacca',
    name: 'Strait of Malacca',
    lat: 1.43,
    lng: 102.8,
    category: 'maritime',
    status: 'NOMINAL',
    region: 'Southeast Asia',
    description: 'Busiest commercial shipping lane connecting Indian and Pacific Oceans.',
    metric: '94,000 vessels/year',
    openMapTilesId: 'omt-waterway-malacca-02',
  },
  {
    id: 'node-suez',
    name: 'Suez Canal & Red Sea',
    lat: 29.93,
    lng: 32.55,
    category: 'maritime',
    status: 'ELEVATED',
    region: 'North Africa / Middle East',
    description: 'Key intercontinental transit corridor between Europe and Asia.',
    metric: '12% of global trade',
    openMapTilesId: 'omt-waterway-suez-03',
  },
  {
    id: 'node-panama',
    name: 'Panama Canal Locks',
    lat: 9.08,
    lng: -79.68,
    category: 'maritime',
    status: 'NOMINAL',
    region: 'Central America',
    description: 'Freshwater lake lock transit system linking Atlantic and Pacific oceans.',
    metric: '32 daily transit slots',
    openMapTilesId: 'omt-waterway-panama-04',
  },
  {
    id: 'node-rotterdam',
    name: 'Port of Rotterdam',
    lat: 51.95,
    lng: 4.14,
    category: 'logistics',
    status: 'NOMINAL',
    region: 'Western Europe',
    description: 'Largest deepwater seaport in Europe and continental intermodal hub.',
    metric: '440M tonnes cargo/year',
    openMapTilesId: 'omt-transport-rotterdam-05',
  },
  {
    id: 'node-singapore',
    name: 'Port of Singapore',
    lat: 1.28,
    lng: 103.85,
    category: 'logistics',
    status: 'NOMINAL',
    region: 'Southeast Asia',
    description: 'Global transshipment and mega-container hub with automated terminal ops.',
    metric: '37.3M TEU containers',
    openMapTilesId: 'omt-transport-singapore-06',
  },
  {
    id: 'node-shanghai',
    name: 'Port of Shanghai / Yangshan',
    lat: 30.63,
    lng: 122.06,
    category: 'logistics',
    status: 'NOMINAL',
    region: 'East Asia',
    description: 'Worlds highest-volume container port complex and export gateway.',
    metric: '47.3M TEU volume',
    openMapTilesId: 'omt-transport-yangshan-07',
  },
  {
    id: 'node-los-angeles',
    name: 'Port of Los Angeles & Long Beach',
    lat: 33.74,
    lng: -118.27,
    category: 'logistics',
    status: 'NOMINAL',
    region: 'North America Pacific',
    description: 'Leading seaport complex in North America for trans-Pacific commerce.',
    metric: '19M TEU combined flow',
    openMapTilesId: 'omt-transport-polb-08',
  },
  {
    id: 'node-tokyo',
    name: 'Tokyo Bay Logistics Hub',
    lat: 35.62,
    lng: 139.78,
    category: 'urban',
    status: 'NOMINAL',
    region: 'East Asia',
    description: 'Dense metropolitan supply node with high-capacity intermodal freight.',
    metric: '38M metro population served',
    openMapTilesId: 'omt-place-tokyo-09',
  },
  {
    id: 'node-barents',
    name: 'Svalbard & Arctic Route',
    lat: 78.22,
    lng: 15.65,
    category: 'environmental',
    status: 'MONITORED',
    region: 'Arctic Polar',
    description: 'Northern Sea Route monitoring station, satellite downlink ground array.',
    metric: 'Sub-zero telemetry node',
    openMapTilesId: 'omt-boundary-arctic-10',
  },
  {
    id: 'node-gibraltar',
    name: 'Strait of Gibraltar',
    lat: 35.98,
    lng: -5.6,
    category: 'maritime',
    status: 'NOMINAL',
    region: 'Mediterranean / Atlantic',
    description: 'Gateway to Mediterranean basin with heavy commercial and ferry crossings.',
    metric: '100,000+ vessel passages',
    openMapTilesId: 'omt-waterway-gibraltar-11',
  },
  {
    id: 'node-cape-good-hope',
    name: 'Cape of Good Hope',
    lat: -34.35,
    lng: 18.47,
    category: 'maritime',
    status: 'MONITORED',
    region: 'Southern Africa',
    description: 'Deep ocean transit bypass around African continent for ultra-large carriers.',
    metric: 'Alternative mega-route',
    openMapTilesId: 'omt-place-cape-12',
  },
];

export const TRANSIT_ARCS: TransitArc[] = [
  {
    id: 'arc-1',
    name: 'East Asia → North America Pacific',
    source: [122.06, 30.63], // Shanghai
    target: [-118.27, 33.74], // LA
    category: 'maritime',
    volume: '14.2M TEU/yr',
    status: 'OPTIMAL',
  },
  {
    id: 'arc-2',
    name: 'East Asia → Europe (via Malacca & Suez)',
    source: [103.85, 1.28], // Singapore
    target: [4.14, 51.95], // Rotterdam
    category: 'maritime',
    volume: '18.5M TEU/yr',
    status: 'MONITORED',
  },
  {
    id: 'arc-3',
    name: 'Middle East → East Asia Crude Route',
    source: [56.25, 26.56], // Hormuz
    target: [139.78, 35.62], // Tokyo
    category: 'energy_grid',
    volume: '12.8M bpd',
    status: 'OPTIMAL',
  },
  {
    id: 'arc-4',
    name: 'Trans-Atlantic Data & Freight Corridor',
    source: [4.14, 51.95], // Rotterdam
    target: [-74.0, 40.71], // New York
    category: 'subsea_cable',
    volume: '280 Tbps / High Freight',
    status: 'OPTIMAL',
  },
  {
    id: 'arc-5',
    name: 'North America Atlantic → Pacific (Panama)',
    source: [-74.0, 40.71], // NYC
    target: [-118.27, 33.74], // LA via Panama
    category: 'maritime',
    volume: '4.8M TEU/yr',
    status: 'OPTIMAL',
  },
];

/**
 * Converts GeoNode items into a standardized GeoJSON FeatureCollection.
 */
export const createNodesGeoJSON = (nodes: GeoNode[] = GEO_NODES): FeatureCollection<Point> => {
  const features: Feature<Point>[] = nodes.map((node) => ({
    type: 'Feature',
    id: node.id,
    properties: {
      id: node.id,
      name: node.name,
      category: node.category,
      status: node.status,
      region: node.region,
      description: node.description,
      metric: node.metric,
      openMapTilesId: node.openMapTilesId || `omt-${node.id}`,
      wgs84Lat: node.lat,
      wgs84Lng: node.lng,
      webMercator: toWebMercator(node.lat, node.lng),
    },
    geometry: {
      type: 'Point',
      coordinates: [node.lng, node.lat], // GeoJSON standard: [longitude, latitude]
    },
  }));

  return {
    type: 'FeatureCollection',
    features,
  };
};

/**
 * Converts TransitArcs into a standardized GeoJSON FeatureCollection.
 */
export const createArcsGeoJSON = (arcs: TransitArc[] = TRANSIT_ARCS): FeatureCollection<LineString> => {
  const features: Feature<LineString>[] = arcs.map((arc) => ({
    type: 'Feature',
    id: arc.id,
    properties: {
      id: arc.id,
      name: arc.name,
      category: arc.category,
      volume: arc.volume,
      status: arc.status,
    },
    geometry: {
      type: 'LineString',
      coordinates: [arc.source, arc.target],
    },
  }));

  return {
    type: 'FeatureCollection',
    features,
  };
};

/**
 * WGS 84 (EPSG:4326) to Web Mercator (EPSG:3857) projection math.
 */
export const toWebMercator = (lat: number, lng: number): { x: number; y: number } => {
  const x = (lng * 20037508.34) / 180;
  const rad = (lat * Math.PI) / 180;
  let y = Math.log(Math.tan(Math.PI / 4 + rad / 2));
  y = (y * 20037508.34) / Math.PI;
  return {
    x: Math.round(x * 100) / 100,
    y: Math.round(y * 100) / 100,
  };
};

/**
 * Formats lat/lng for display.
 */
export const formatCoordinates = (lat: number, lng: number): string => {
  const latStr = `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}`;
  const lngStr = `${Math.abs(lng).toFixed(2)}° ${lng >= 0 ? 'E' : 'W'}`;
  return `${latStr}, ${lngStr}`;
};
