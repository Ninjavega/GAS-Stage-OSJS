import { FeatureCollection, Feature, Point, LineString, GeoJsonProperties } from 'geojson';
import { toWebMercator } from './geoData';

export interface GeoJsonFeedSource {
  id: string;
  name: string;
  url: string;
  category: 'seismic' | 'infrastructure' | 'environmental' | 'transit' | 'custom';
  description: string;
  refreshIntervalMs?: number;
  isLiveApi: boolean;
}

export const PRESET_GEOJSON_FEEDS: GeoJsonFeedSource[] = [
  {
    id: 'usgs-all-day',
    name: 'USGS Real-Time Earthquakes (Live Past 24h)',
    url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson',
    category: 'seismic',
    description: 'Real-time global seismic sensor feed from the United States Geological Survey.',
    refreshIntervalMs: 60000,
    isLiveApi: true,
  },
  {
    id: 'usgs-sig-month',
    name: 'USGS Significant Earthquakes (Live 30 Days)',
    url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.geojson',
    category: 'seismic',
    description: 'High-magnitude significant global seismic events over the past 30 days.',
    refreshIntervalMs: 120000,
    isLiveApi: true,
  },
  {
    id: 'global-infrastructure',
    name: 'World Ports & Strategic Infrastructure (OpenMapTiles Schema)',
    url: 'local:global_infrastructure',
    category: 'infrastructure',
    description: 'Standardized GeoJSON feature collection of international logistics hubs and straits with OpenMapTiles IDs.',
    isLiveApi: false,
  },
  {
    id: 'transit-corridors',
    name: 'Global Maritime & Data Transit Corridors (GeoJSON LineStrings)',
    url: 'local:transit_corridors',
    category: 'transit',
    description: 'Transcontinental shipping arcs and subsea cable lines formatted as standard GeoJSON LineStrings.',
    isLiveApi: false,
  },
];

/**
 * Fetches GeoJSON from a remote API with error handling and format normalization.
 */
export async function fetchRemoteGeoJson(url: string): Promise<FeatureCollection> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/geo+json, application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`GeoJSON API error: HTTP ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (data.type !== 'FeatureCollection' && data.type !== 'Feature') {
    throw new Error(`Invalid GeoJSON: Root object must be FeatureCollection or Feature (received type: ${data.type})`);
  }

  if (data.type === 'Feature') {
    return {
      type: 'FeatureCollection',
      features: [data],
    };
  }

  return data as FeatureCollection;
}

/**
 * Parses raw GeoJSON text string and validates structure.
 */
export function parseGeoJsonString(rawJson: string): FeatureCollection {
  const parsed = JSON.parse(rawJson);
  if (parsed.type === 'FeatureCollection' && Array.isArray(parsed.features)) {
    return parsed;
  }
  if (parsed.type === 'Feature') {
    return {
      type: 'FeatureCollection',
      features: [parsed],
    };
  }
  throw new Error('Provided JSON is not a valid GeoJSON FeatureCollection or Feature.');
}

/**
 * Calculates bounding box [minLng, minLat, maxLng, maxLat] from a FeatureCollection.
 */
export function calculateGeoJsonBounds(geojson: FeatureCollection): [number, number, number, number] | null {
  if (!geojson.features || geojson.features.length === 0) return null;

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  for (const feature of geojson.features) {
    if (!feature.geometry) continue;

    if (feature.geometry.type === 'Point') {
      const [lng, lat] = (feature.geometry as Point).coordinates;
      if (typeof lng === 'number' && typeof lat === 'number') {
        minLng = Math.min(minLng, lng);
        minLat = Math.min(minLat, lat);
        maxLng = Math.max(maxLng, lng);
        maxLat = Math.max(maxLat, lat);
      }
    } else if (feature.geometry.type === 'LineString') {
      const coords = (feature.geometry as LineString).coordinates;
      for (const [lng, lat] of coords) {
        minLng = Math.min(minLng, lng);
        minLat = Math.min(minLat, lat);
        maxLng = Math.max(maxLng, lng);
        maxLat = Math.max(maxLat, lat);
      }
    }
  }

  if (minLng === Infinity) return null;
  return [minLng, minLat, maxLng, maxLat];
}
