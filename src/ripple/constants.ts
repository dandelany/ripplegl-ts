import {number} from "prop-types";

export enum Waveform {
  SINE = 0,
  PULSE = 1,
  PACKET = 2
}

export type WaveType = {
  id: string; 
  waveSpeed: number;
  windowScale: number;
}

const SPEED_OF_SOUND = 343.2;
const SPEED_OF_LIGHT = 299792458;

// waveChooser.add("Waves = Sound");
// waveChooser.add("Waves = Visible Light/IR/UV");
// waveChooser.add("Waves = AM Radio");
// waveChooser.add("Waves = FM Radio");
// waveChooser.add("Waves = Microwave");

export const WAVE_TYPES: WaveType[] = [
  {
    id: 'sound',
    waveSpeed: SPEED_OF_SOUND,
    windowScale: 25
  },
  {
    id: 'light',
    waveSpeed: SPEED_OF_LIGHT,
    windowScale: 8000e-9
  },
  {
    id: 'AM',
    waveSpeed: SPEED_OF_LIGHT,
    windowScale: 50000
  },
  {
    id: 'FM',
    waveSpeed: SPEED_OF_LIGHT,
    windowScale: 60
  },
  {
    id: 'microwave',
    waveSpeed: SPEED_OF_LIGHT,
    windowScale: 2
  },
  
];


export const COLOR_SCHEMES = [
 ["#808080", "#00ffff", "#000000", "#008080", "#0000ff", "#000000", "#000080", "#ffffff"],
 ["#808080", "#00ff00", "#ff0000", "#000000", "#00ffff", "#ff00ff", "#0000ff", "#0000ff"],
 ["#800000", "#00ffff", "#0000ff", "#000000", "#80c8c8", "#8080c8", "#808080", "#ffffff"],
 ["#800000", "#ffffff", "#000000", "#808080", "#0000ff", "#000000", "#000080", "#00ff00"],
 ["#800000", "#ffff00", "#0000ff", "#000000", "#ffff80", "#8080ff", "#808080", "#ffffff"],
 ["#808080", "#00ff00", "#ff0000", "#FFFFFF", "#00ffff", "#ff00ff", "#0000ff", "#0000ff"],
 ["#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#00FFFF", "#FF00FF", "#FFFFFF", "#000000"]
];