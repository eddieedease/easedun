import { ThemeId } from '../core/models';

type RGB = [number, number, number];

export interface Theme {
  id: ThemeId;
  label: string;
  /** Sky gradient, top to horizon. */
  sky: [RGB, RGB];
  /** Colour of the distant skyline silhouette. */
  skyline: RGB;
  /** Lit windows dotted over the distant skyline. */
  skylineLights: boolean;
  stars: boolean;
  /** Low sun disc on the horizon (dusk). */
  sun?: { color: RGB; size: number };
  fog: RGB;
  /** How far you can see before everything melts into fog (in cells). */
  fogDistance: number;
  street: RGB;
  sidewalk: RGB;
  /** Facade base colours; each building picks one. */
  concrete: RGB[];
  /** Accent colours for signs, awnings, doors and lit windows. */
  neon: RGB[];
  /** Unlit window glass. */
  glass: RGB;
  /** 0–1: how many windows are lit compared to a night scene. */
  lit: number;
  /** Facade noise amplitude: 0 = flat colour planes, ~9 = rough concrete. */
  grain: number;
  /** 0–1: water streaks, stains and dirty bases on facades. */
  grime: number;
  /** Colour multiplier for the shadow side of buildings (a blue tint reads as sunny). */
  shadow: RGB;
  /** 0–1: puddles on the street. */
  wet: number;
  /** Raindrops per frame (0 = dry). */
  rain: number;
  rainColor: string;
}

export const THEMES: Record<ThemeId, Theme> = {
  'city-pop': {
    // Flat colour planes, cobalt-to-turquoise sky, white and pastel facades with
    // crisp blue shadows: inspired by Hiroshi Nagai's city-pop paintings.
    id: 'city-pop',
    label: 'City pop · day',
    sky: [[18, 62, 150], [126, 208, 226]],
    skyline: [168, 204, 224],
    skylineLights: false,
    stars: false,
    fog: [156, 202, 222],
    fogDistance: 18,
    street: [82, 88, 100],
    sidewalk: [198, 194, 186],
    concrete: [[244, 242, 236], [238, 228, 212], [214, 228, 236], [246, 222, 206], [226, 238, 226]],
    neon: [[245, 112, 80], [32, 150, 200], [250, 200, 70], [240, 120, 160], [60, 170, 120]],
    glass: [62, 122, 178],
    lit: 0.08,
    grain: 2,
    grime: 0.05,
    shadow: [0.6, 0.67, 0.88],
    wet: 0,
    rain: 0,
    rainColor: 'rgba(255,255,255,0.3)',
  },
  'city-pop-dusk': {
    id: 'city-pop-dusk',
    label: 'City pop · dusk',
    sky: [[38, 40, 112], [252, 150, 112]],
    skyline: [92, 74, 124],
    skylineLights: true,
    stars: true,
    sun: { color: [255, 206, 128], size: 0.13 },
    fog: [206, 140, 132],
    fogDistance: 14,
    street: [62, 60, 78],
    sidewalk: [152, 134, 146],
    concrete: [[232, 212, 210], [212, 202, 222], [240, 202, 182], [202, 212, 226]],
    neon: [[245, 112, 80], [32, 150, 200], [250, 200, 70], [240, 120, 160]],
    glass: [72, 82, 132],
    lit: 0.6,
    grain: 2,
    grime: 0.05,
    shadow: [0.55, 0.56, 0.82],
    wet: 0.2,
    rain: 0,
    rainColor: 'rgba(255,255,255,0.3)',
  },
  'neon-night': {
    // Kept as the id existing levels use; now a grimy, sodium-lit night.
    id: 'neon-night',
    label: 'Night city',
    sky: [[6, 8, 12], [36, 38, 48]],
    skyline: [24, 26, 32],
    skylineLights: true,
    stars: false,
    fog: [30, 32, 38],
    fogDistance: 11,
    street: [26, 27, 30],
    sidewalk: [54, 54, 56],
    concrete: [[58, 58, 62], [66, 60, 54], [48, 52, 56], [72, 66, 60]],
    neon: [[240, 150, 70], [90, 170, 180], [210, 72, 60], [230, 210, 170]],
    glass: [14, 16, 22],
    lit: 1,
    grain: 7,
    grime: 0.6,
    shadow: [0.72, 0.73, 0.8],
    wet: 0.6,
    rain: 60,
    rainColor: 'rgba(170, 185, 200, 0.3)',
  },
  'acid-rain': {
    id: 'acid-rain',
    label: 'Acid rain',
    sky: [[8, 14, 10], [44, 62, 38]],
    skyline: [22, 32, 22],
    skylineLights: true,
    stars: false,
    fog: [34, 50, 32],
    fogDistance: 8,
    street: [22, 28, 24],
    sidewalk: [46, 54, 44],
    concrete: [[44, 52, 44], [52, 56, 42], [36, 44, 40]],
    neon: [[150, 210, 90], [200, 210, 80], [90, 190, 150]],
    glass: [12, 16, 14],
    lit: 0.8,
    grain: 8,
    grime: 0.85,
    shadow: [0.72, 0.76, 0.72],
    wet: 0.9,
    rain: 160,
    rainColor: 'rgba(170, 220, 140, 0.3)',
  },
  corpo: {
    id: 'corpo',
    label: 'Corpo plaza',
    sky: [[30, 70, 130], [160, 196, 222]],
    skyline: [120, 150, 180],
    skylineLights: false,
    stars: false,
    fog: [140, 168, 196],
    fogDistance: 16,
    street: [62, 66, 76],
    sidewalk: [150, 154, 160],
    concrete: [[196, 204, 214], [164, 178, 192], [222, 226, 232]],
    neon: [[90, 170, 230], [240, 240, 240], [60, 120, 200]],
    glass: [58, 98, 148],
    lit: 0.25,
    grain: 3,
    grime: 0.15,
    shadow: [0.62, 0.68, 0.86],
    wet: 0,
    rain: 0,
    rainColor: 'rgba(255,255,255,0.3)',
  },
  'rust-slums': {
    id: 'rust-slums',
    label: 'Rust slums',
    sky: [[22, 12, 8], [110, 58, 30]],
    skyline: [48, 26, 18],
    skylineLights: true,
    stars: false,
    fog: [84, 46, 28],
    fogDistance: 9,
    street: [36, 30, 26],
    sidewalk: [66, 54, 44],
    concrete: [[78, 54, 40], [62, 50, 44], [92, 70, 50]],
    neon: [[240, 130, 40], [220, 80, 50], [240, 200, 100]],
    glass: [18, 14, 12],
    lit: 0.8,
    grain: 9,
    grime: 0.9,
    shadow: [0.7, 0.66, 0.66],
    wet: 0.3,
    rain: 20,
    rainColor: 'rgba(230, 190, 150, 0.25)',
  },
};

export const THEME_LIST = Object.values(THEMES);
