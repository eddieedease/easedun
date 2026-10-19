import { ThemeId } from '../core/models';

type RGB = [number, number, number];

export interface Theme {
  id: ThemeId;
  label: string;
  /** Sky gradient, top to horizon. */
  sky: [RGB, RGB];
  fog: RGB;
  /** How far you can see before everything melts into fog (in cells). */
  fogDistance: number;
  street: RGB;
  sidewalk: RGB;
  /** Building base colours; each building picks one. */
  concrete: RGB[];
  /** Window and sign colours. */
  neon: RGB[];
  /** Raindrops per frame (0 = dry). */
  rain: number;
  rainColor: string;
}

export const THEMES: Record<ThemeId, Theme> = {
  'neon-night': {
    id: 'neon-night',
    label: 'Neon night',
    sky: [[8, 4, 24], [70, 20, 90]],
    fog: [40, 14, 60],
    fogDistance: 11,
    street: [26, 24, 38],
    sidewalk: [52, 48, 66],
    concrete: [[42, 40, 62], [34, 36, 52], [56, 44, 70], [30, 30, 40]],
    neon: [[255, 43, 214], [0, 240, 255], [255, 220, 60], [140, 80, 255]],
    rain: 60,
    rainColor: 'rgba(160, 200, 255, 0.35)',
  },
  'acid-rain': {
    id: 'acid-rain',
    label: 'Acid rain',
    sky: [[4, 14, 8], [40, 70, 30]],
    fog: [30, 54, 26],
    fogDistance: 8,
    street: [20, 28, 22],
    sidewalk: [44, 56, 42],
    concrete: [[36, 48, 40], [44, 52, 38], [28, 38, 34]],
    neon: [[120, 255, 60], [220, 255, 40], [0, 255, 170]],
    rain: 160,
    rainColor: 'rgba(170, 255, 120, 0.35)',
  },
  corpo: {
    id: 'corpo',
    label: 'Corpo plaza',
    sky: [[10, 20, 50], [90, 140, 200]],
    fog: [70, 100, 150],
    fogDistance: 14,
    street: [48, 52, 64],
    sidewalk: [90, 96, 112],
    concrete: [[60, 80, 110], [80, 96, 120], [50, 60, 84]],
    neon: [[120, 220, 255], [255, 255, 255], [80, 160, 255]],
    rain: 0,
    rainColor: 'rgba(255,255,255,0.3)',
  },
  'rust-slums': {
    id: 'rust-slums',
    label: 'Rust slums',
    sky: [[20, 8, 4], [120, 50, 20]],
    fog: [80, 40, 20],
    fogDistance: 9,
    street: [34, 26, 22],
    sidewalk: [62, 48, 38],
    concrete: [[70, 44, 30], [54, 40, 34], [84, 60, 40]],
    neon: [[255, 120, 20], [255, 60, 40], [255, 200, 80]],
    rain: 20,
    rainColor: 'rgba(255, 190, 140, 0.25)',
  },
};

export const THEME_LIST = Object.values(THEMES);
