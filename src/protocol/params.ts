/**
 * Parameter registry for the microKORG XL, transcribed from:
 *
 *   TABLE 1 : PROGRAM PARAMETER        (program-level, offsets 0..345)
 *   TABLE 2 : TIMBRE PARAMETER         (EQ, relative offsets +92..+95)
 *   TABLE 5 : ARPEGGIO PARAMETER       (relative offsets +0..+7)
 *   TABLE 6 : TIMBRE PROGRAM PARAMETER (relative offsets +0..+91)
 *
 * Korg microKORG XL MIDI Implementation, Revision 1.01 (2009.04.27).
 * Parameter IDs / sub IDs shown here are the ones used by PARAMETER CHANGE
 * (function 0x41). Dump offsets are byte offsets into the 342-byte program.
 *
 * Timbre IDs use the documented `x0`, `x1`, `x9` scheme:
 *   timbre 1 -> param IDs 0x10 (main), 0x11 (virtual patch), 0x19 (EQ)
 *   timbre 2 -> param IDs 0x20 (main), 0x21 (virtual patch), 0x29 (EQ)
 */

export type ParamSectionId =
  | 'programVoice'
  | 'voice'
  | 'osc1'
  | 'osc2'
  | 'mixer'
  | 'filter'
  | 'filterEg'
  | 'amp'
  | 'ampEg'
  | 'lfo1'
  | 'lfo2'
  | 'patch'
  | 'eq'
  | 'arpeggiator';

export type ParamDisplay =
  | 'raw'
  | 'select'
  | 'toggle'
  | 'centered'
  | 'eqGain'
  | 'pan'
  | 'lastStep'
  | 'swingPct';

export interface ParamSpec {
  /** Stable unique key, e.g. `t1.osc1.wave`. */
  key: string;
  label: string;
  section: ParamSectionId;
  /** 0 for program-level, 1 or 2 for timbre parameters. */
  timbre: 0 | 1 | 2;
  paramId: number;
  subId: number;
  /** Absolute byte offset in the 342-byte program dump. */
  offset: number;
  shift: number;
  mask: number;
  min: number;
  max: number;
  kind: 'range' | 'select' | 'toggle';
  display: ParamDisplay;
  options?: readonly string[];
  /** Value that means "zero"/centre for bipolar parameters. */
  center?: number;
  /**
   * True when PARAMETER CHANGE carries a signed value relative to `center`
   * (NOTE 4). Panpot is centred at 64 but is sent raw (L63..R63).
   */
  signed?: boolean;
  unit?: string;
  /** True for the 14-bit tempo value split across offset (LSB) / offset+1 (MSB). */
  twoByte?: boolean;
}

export interface ParamSection {
  id: ParamSectionId;
  label: string;
  timbre: 0 | 1 | 2;
}

export const SECTIONS: readonly ParamSection[] = [
  { id: 'programVoice', label: 'Voice, Scale & Pitch', timbre: 0 },
  { id: 'voice', label: 'Voice', timbre: 1 },
  { id: 'osc1', label: 'Oscillator 1', timbre: 1 },
  { id: 'osc2', label: 'Oscillator 2', timbre: 1 },
  { id: 'mixer', label: 'Mixer', timbre: 1 },
  { id: 'filter', label: 'Filter', timbre: 1 },
  { id: 'filterEg', label: 'Filter EG', timbre: 1 },
  { id: 'amp', label: 'Amp', timbre: 1 },
  { id: 'ampEg', label: 'Amp EG', timbre: 1 },
  { id: 'lfo1', label: 'LFO 1', timbre: 1 },
  { id: 'lfo2', label: 'LFO 2', timbre: 1 },
  { id: 'patch', label: 'Virtual Patch', timbre: 1 },
  { id: 'eq', label: 'Timbre EQ', timbre: 1 },
  { id: 'arpeggiator', label: 'Arpeggiator', timbre: 0 },
];

/* ------------------------------------------------------------------ */
/* Shared option lists (TABLE footnotes)                              */
/* ------------------------------------------------------------------ */

export const OSC1_WAVES = [
  'Saw',
  'Pulse',
  'Tri',
  'Sin (Cross)',
  'Formant',
  'Noise',
  'PCM/DWGS',
  'Audio In',
] as const;

export const OSC1_MODS = ['Waveform', 'Cross', 'Unison', 'VPM'] as const;
export const OSC2_WAVES = ['Saw', 'Pulse', 'Tri', 'Sine'] as const;
export const OSC2_MODS = ['Off', 'Ring', 'Sync', 'RingSync'] as const;
export const FILTER_ROUTINGS = ['Single', 'Serial', 'Parallel', 'Indiv'] as const;
export const FILTER2_TYPES = ['LPF', 'HPF', 'BPF'] as const;
export const WAVESHAPES = [
  'Off',
  'Drive',
  'Decimator',
  'Hard Clip',
  'Oct Saw',
  'Multi Tri',
  'Multi Sin',
  'SubOSC Saw',
  'SubOSC Squ',
  'SubOSC Tri',
  'SubOSC Sin',
  'LevelBoost',
] as const;
export const WAVESHAPE_POSITIONS = ['Pre Flt1', 'Pre Amp'] as const;
export const VOICE_ASSIGNS = ['Mono1', 'Mono2', 'Poly'] as const;
export const UNISON_VOICES = ['OFF', '2 Voice', '3 Voice', '4 Voice'] as const;
export const LFO1_WAVES = ['Saw', 'Square', 'Tri', 'S/H', 'Random'] as const;
export const LFO2_WAVES = ['Saw', 'Square+', 'Sine', 'S/H', 'Random'] as const;
export const LFO_KEY_SYNCS = ['Off', 'Timbre', 'Voice'] as const;
/** *T06-4 */
export const SYNC_NOTES = [
  '8/1',
  '4/1',
  '2/1',
  '1/1',
  '3/4',
  '1/2',
  '3/8',
  '1/3',
  '1/4',
  '3/16',
  '1/6',
  '1/8',
  '1/12',
  '1/16',
  '1/24',
  '1/32',
  '1/64',
] as const;
/** *T03-1 */
export const PATCH_SOURCES = [
  'EG1',
  'EG2',
  'EG3',
  'LFO1',
  'LFO2',
  'Velocity',
  'Pitch Bend',
  'Mod Wheel',
  'Key Track',
  'MIDI1',
  'MIDI2',
  'MIDI3',
] as const;
/** *T06-5 */
export const PATCH_DESTINATIONS = [
  'Pitch',
  'OSC2 Tune',
  'OSC1 CTRL1',
  'OSC1 Level',
  'OSC2 Level',
  'Noise Level',
  'Filt1 Balance',
  'Filt1 Cutoff',
  'Filt1 Resonance',
  'Filt2 Cutoff',
  'Drive/WS Depth',
  'Amp Level',
  'Panpot',
  'LFO1 Freq.',
  'LFO2 Freq.',
  'Portamento',
  'OSC1 CTRL2',
  'Filt1 EG1',
  'Filt1 KeyTrack',
  'Filt2 Resonance',
  'Filt2 EG1',
  'Filt2 KeyTrack',
  'EG1 Attack',
  'EG1 Decay',
  'EG1 Sustain',
  'EG1 Release',
  'EG2 Attack',
  'EG2 Decay',
  'EG2 Sustain',
  'EG2 Release',
  'EG3 Attack',
  'EG3 Decay',
  'EG3 Sustain',
  'EG3 Release',
  'Patch1 Int.',
  'Patch2 Int.',
  'Patch3 Int.',
  'Patch4 Int.',
  'Patch5 Int.',
  'Patch6 Int.',
] as const;
/** *T01-1 (names spelled out) */
export const SCALE_TYPES = [
  'Equal Temp',
  'Pure Major',
  'Pure Minor',
  'Arabic',
  'Pythagorean',
  'Werckmeister',
  'Kirnberger',
  'Slendro',
  'Pelog',
  'User Scale',
] as const;
export const SCALE_KEYS = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const;
export const VOICE_MODES = ['Single', 'Layer', 'Split', 'Multi'] as const;
export const ARP_TIMBRES = ['Timb1', 'Timb2', 'Timb1+2'] as const;
/** *T05-1 */
export const ARP_RESOLUTIONS = [
  '1/32',
  '1/24',
  '1/16',
  '1/12',
  '1/8',
  '1/6',
  '1/4',
  '1/2',
  '1/1',
] as const;
/** *T05-2 */
export const ARP_TYPES = ['Up', 'Down', 'Alt1', 'Alt2', 'Random', 'Trigger'] as const;
export const ARP_OCTAVES = ['1 Octave', '2 Octaves', '3 Octaves', '4 Octaves'] as const;

/* ------------------------------------------------------------------ */
/* Construction helpers                                               */
/* ------------------------------------------------------------------ */

const PROGRAM_BASE_OFFSET = 16;
const TIMBRE_BLOCK_LENGTH = 96;

const TIMBRE_MAIN_ID = { 1: 0x10, 2: 0x20 } as const;
const TIMBRE_PATCH_ID = { 1: 0x11, 2: 0x21 } as const;
const TIMBRE_EQ_ID = { 1: 0x19, 2: 0x29 } as const;

interface RelSpec {
  /** Offset relative to the start of the timbre block (TABLE 6 / TABLE 2). */
  rel: number;
  label: string;
  section: ParamSectionId;
  subId: number;
  shift?: number;
  bits?: number;
  min: number;
  max: number;
  kind?: ParamSpec['kind'];
  display?: ParamDisplay;
  options?: readonly string[];
  center?: number;
  unit?: string;
}

function specFromRel(timbre: 1 | 2, r: RelSpec): ParamSpec {
  const patch = r.subId >= 0x100;
  const eq = r.section === 'eq';
  return {
    key: `t${timbre}.${r.section}.${r.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    label: r.label,
    section: r.section,
    timbre,
    paramId: eq
      ? TIMBRE_EQ_ID[timbre]
      : patch
        ? TIMBRE_PATCH_ID[timbre]
        : TIMBRE_MAIN_ID[timbre],
    subId: r.subId,
    offset:
      PROGRAM_BASE_OFFSET + (timbre - 1) * TIMBRE_BLOCK_LENGTH + r.rel,
    shift: r.shift ?? 0,
    mask: (1 << (r.bits ?? 7)) - 1,
    min: r.min,
    max: r.max,
    kind: r.kind ?? (r.options ? 'select' : 'range'),
    display:
      r.display ?? (r.options ? (r.options.length === 2 ? 'toggle' : 'select') : 'raw'),
    options: r.options,
    center: r.center,
    signed: r.center !== undefined && r.display !== 'pan',
    unit: r.unit,
  };
}

/* ------------------------------------------------------------------ */
/* TABLE 6 + TABLE 2: per-timbre parameters                           */
/* ------------------------------------------------------------------ */

const TIMBRE_REL_SPECS: readonly RelSpec[] = [
  // --- Common / Voice (TABLE 6) ---
  {
    rel: 4,
    label: 'Unison Voice',
    section: 'voice',
    subId: 0x08,
    bits: 4,
    min: 0,
    max: 3,
    options: UNISON_VOICES,
  },
  {
    rel: 5,
    label: 'Unison Detune',
    section: 'voice',
    subId: 0x09,
    min: 0,
    max: 99,
    unit: 'ct',
  },
  {
    rel: 6,
    label: 'Unison Spread',
    section: 'voice',
    subId: 0x0a,
    min: 0,
    max: 127,
  },
  {
    rel: 7,
    label: 'Voice Assign',
    section: 'voice',
    subId: 0x0b,
    shift: 6,
    bits: 2,
    min: 0,
    max: 2,
    options: VOICE_ASSIGNS,
  },
  // --- Pitch ---
  {
    rel: 9,
    label: 'Analog Tuning',
    section: 'voice',
    subId: 0x13,
    min: 0,
    max: 127,
  },
  {
    rel: 10,
    label: 'Transpose',
    section: 'voice',
    subId: 0x14,
    min: 16,
    max: 112,
    center: 64,
    display: 'centered',
    unit: 'st',
  },
  {
    rel: 11,
    label: 'Detune',
    section: 'voice',
    subId: 0x15,
    min: 14,
    max: 114,
    center: 64,
    display: 'centered',
    unit: 'ct',
  },
  {
    rel: 12,
    label: 'Vibrato Intensity',
    section: 'voice',
    subId: 0x16,
    min: 1,
    max: 127,
    center: 64,
    display: 'centered',
  },
  {
    rel: 13,
    label: 'Bend Range',
    section: 'voice',
    subId: 0x10,
    min: 52,
    max: 76,
    center: 64,
    display: 'centered',
    unit: 'st',
  },
  {
    rel: 14,
    label: 'Portamento Time',
    section: 'voice',
    subId: 0x11,
    min: 0,
    max: 127,
  },

  // --- Oscillator 1 ---
  {
    rel: 16,
    label: 'Wave Type',
    section: 'osc1',
    subId: 0x17,
    bits: 4,
    min: 0,
    max: 7,
    options: OSC1_WAVES,
  },
  {
    rel: 16,
    label: 'Osc Mod',
    section: 'osc1',
    subId: 0x18,
    shift: 4,
    bits: 2,
    min: 0,
    max: 3,
    options: OSC1_MODS,
  },
  {
    rel: 17,
    label: 'Waveform CTRL1',
    section: 'osc1',
    subId: 0x19,
    min: 0,
    max: 127,
  },
  {
    rel: 18,
    label: 'Waveform CTRL2',
    section: 'osc1',
    subId: 0x1a,
    min: 0,
    max: 127,
  },
  {
    rel: 19,
    label: 'PCM/DWGS Wave',
    section: 'osc1',
    subId: 0x1b,
    min: 0,
    max: 64,
  },

  // --- Oscillator 2 ---
  {
    rel: 21,
    label: 'Wave Type',
    section: 'osc2',
    subId: 0x20,
    bits: 2,
    min: 0,
    max: 3,
    options: OSC2_WAVES,
  },
  {
    rel: 21,
    label: 'Mod Select',
    section: 'osc2',
    subId: 0x21,
    shift: 4,
    bits: 2,
    min: 0,
    max: 3,
    options: OSC2_MODS,
  },
  {
    rel: 22,
    label: 'Semitone',
    section: 'osc2',
    subId: 0x22,
    min: 40,
    max: 88,
    center: 64,
    display: 'centered',
    unit: 'st',
  },
  {
    rel: 23,
    label: 'Tune',
    section: 'osc2',
    subId: 0x23,
    min: 1,
    max: 127,
    center: 64,
    display: 'centered',
  },

  // --- Mixer ---
  { rel: 24, label: 'Osc1 Level', section: 'mixer', subId: 0x28, min: 0, max: 127 },
  { rel: 25, label: 'Osc2 Level', section: 'mixer', subId: 0x29, min: 0, max: 127 },
  { rel: 26, label: 'Noise Level', section: 'mixer', subId: 0x2a, min: 0, max: 127 },

  // --- Filter ---
  {
    rel: 28,
    label: 'Routing',
    section: 'filter',
    subId: 0x30,
    bits: 2,
    min: 0,
    max: 3,
    options: FILTER_ROUTINGS,
  },
  {
    rel: 28,
    label: 'Filter2 Type',
    section: 'filter',
    subId: 0x40,
    shift: 4,
    bits: 2,
    min: 0,
    max: 2,
    options: FILTER2_TYPES,
  },
  { rel: 29, label: 'Filter1 Balance', section: 'filter', subId: 0x31, min: 0, max: 127 },
  { rel: 30, label: 'Filter1 Cutoff', section: 'filter', subId: 0x32, min: 0, max: 127 },
  {
    rel: 31,
    label: 'Filter1 Resonance',
    section: 'filter',
    subId: 0x33,
    min: 0,
    max: 127,
  },
  {
    rel: 32,
    label: 'F1 EG1 Intensity',
    section: 'filter',
    subId: 0x34,
    min: 1,
    max: 127,
    center: 64,
    display: 'centered',
  },
  {
    rel: 33,
    label: 'F1 Keyboard Track',
    section: 'filter',
    subId: 0x35,
    min: 1,
    max: 127,
    center: 64,
    display: 'centered',
  },
  {
    rel: 34,
    label: 'F1 Velocity Sens',
    section: 'filter',
    subId: 0x36,
    min: 1,
    max: 127,
    center: 64,
    display: 'centered',
  },
  { rel: 35, label: 'Filter2 Cutoff', section: 'filter', subId: 0x42, min: 0, max: 127 },
  {
    rel: 36,
    label: 'Filter2 Resonance',
    section: 'filter',
    subId: 0x43,
    min: 0,
    max: 127,
  },
  {
    rel: 37,
    label: 'F2 EG1 Intensity',
    section: 'filter',
    subId: 0x44,
    min: 1,
    max: 127,
    center: 64,
    display: 'centered',
  },
  {
    rel: 38,
    label: 'F2 Keyboard Track',
    section: 'filter',
    subId: 0x45,
    min: 1,
    max: 127,
    center: 64,
    display: 'centered',
  },
  {
    rel: 39,
    label: 'F2 Velocity Sens',
    section: 'filter',
    subId: 0x46,
    min: 1,
    max: 127,
    center: 64,
    display: 'centered',
  },

  // --- Amp ---
  { rel: 40, label: 'Level', section: 'amp', subId: 0x50, min: 0, max: 127 },
  {
    rel: 41,
    label: 'Drive/WS Position',
    section: 'amp',
    subId: 0x52,
    shift: 4,
    bits: 2,
    min: 0,
    max: 1,
    options: WAVESHAPE_POSITIONS,
  },
  {
    rel: 42,
    label: 'WaveShape Type',
    section: 'amp',
    subId: 0x51,
    bits: 4,
    min: 0,
    max: 11,
    options: WAVESHAPES,
  },
  { rel: 43, label: 'Depth', section: 'amp', subId: 0x54, min: 0, max: 127 },
  {
    rel: 44,
    label: 'Panpot',
    section: 'amp',
    subId: 0x55,
    min: 0,
    max: 127,
    center: 64,
    display: 'pan',
  },
  {
    rel: 45,
    label: 'Key Track',
    section: 'amp',
    subId: 0x56,
    min: 1,
    max: 127,
    center: 64,
    display: 'centered',
  },
  { rel: 46, label: 'Punch Level', section: 'amp', subId: 0x57, min: 0, max: 127 },

  // --- EG1 / EG2 (filter EGs) ---
  ...makeEgSpecs(48, 0x60, 'EG1', 'filterEg'),
  ...makeEgSpecs(54, 0x70, 'EG2', 'filterEg'),
  // --- EG3 (amp EG) ---
  ...makeEgSpecs(60, 0x80, 'EG3', 'ampEg'),

  // --- LFO 1 ---
  {
    rel: 66,
    label: 'Wave',
    section: 'lfo1',
    subId: 0x90,
    bits: 4,
    min: 0,
    max: 4,
    options: LFO1_WAVES,
  },
  { rel: 67, label: 'Frequency', section: 'lfo1', subId: 0x92, min: 0, max: 127 },
  {
    rel: 68,
    label: 'BPM Sync',
    section: 'lfo1',
    subId: 0x93,
    shift: 7,
    bits: 1,
    min: 0,
    max: 1,
    kind: 'toggle',
    display: 'toggle',
    options: ['Off', 'On'],
  },
  {
    rel: 68,
    label: 'Key Sync',
    section: 'lfo1',
    subId: 0x94,
    shift: 5,
    bits: 2,
    min: 0,
    max: 2,
    options: LFO_KEY_SYNCS,
  },
  {
    rel: 69,
    label: 'Sync Note',
    section: 'lfo1',
    subId: 0x96,
    bits: 5,
    min: 0,
    max: 16,
    options: SYNC_NOTES,
  },

  // --- LFO 2 ---
  {
    rel: 70,
    label: 'Wave',
    section: 'lfo2',
    subId: 0xa0,
    bits: 4,
    min: 0,
    max: 4,
    options: LFO2_WAVES,
  },
  { rel: 71, label: 'Frequency', section: 'lfo2', subId: 0xa2, min: 0, max: 127 },
  {
    rel: 72,
    label: 'BPM Sync',
    section: 'lfo2',
    subId: 0xa3,
    shift: 7,
    bits: 1,
    min: 0,
    max: 1,
    kind: 'toggle',
    display: 'toggle',
    options: ['Off', 'On'],
  },
  {
    rel: 72,
    label: 'Key Sync',
    section: 'lfo2',
    subId: 0xa4,
    shift: 5,
    bits: 2,
    min: 0,
    max: 2,
    options: LFO_KEY_SYNCS,
  },
  {
    rel: 73,
    label: 'Sync Note',
    section: 'lfo2',
    subId: 0xa6,
    bits: 5,
    min: 0,
    max: 16,
    options: SYNC_NOTES,
  },

  // --- Virtual patch (TABLE 6, IDs x1) ---
  ...makePatchSpecs(),

  // --- Timbre EQ (TABLE 2, IDs x9) ---
  {
    rel: 92,
    label: 'Low Freq',
    section: 'eq',
    subId: 0x00,
    min: 0,
    max: 33,
  },
  {
    rel: 93,
    label: 'Low Gain',
    section: 'eq',
    subId: 0x01,
    min: 34,
    max: 94,
    center: 64,
    display: 'eqGain',
    unit: 'dB',
  },
  {
    rel: 94,
    label: 'Hi Freq',
    section: 'eq',
    subId: 0x02,
    min: 0,
    max: 25,
  },
  {
    rel: 95,
    label: 'Hi Gain',
    section: 'eq',
    subId: 0x03,
    min: 34,
    max: 94,
    center: 64,
    display: 'eqGain',
    unit: 'dB',
  },
];

function makeEgSpecs(
  startRel: number,
  startSub: number,
  name: string,
  section: ParamSectionId,
): RelSpec[] {
  const common = [
    { label: 'Attack', min: 0, max: 127, center: undefined, display: 'raw' as ParamDisplay },
    { label: 'Decay', min: 0, max: 127, center: undefined, display: 'raw' as ParamDisplay },
    { label: 'Sustain', min: 0, max: 127, center: undefined, display: 'raw' as ParamDisplay },
    { label: 'Release', min: 0, max: 127, center: undefined, display: 'raw' as ParamDisplay },
    {
      label: 'Level Velocity Sens',
      min: 1,
      max: 127,
      center: 64,
      display: 'centered' as ParamDisplay,
    },
  ];
  return common.map((p, i) => ({
    rel: startRel + i,
    label: `${name} ${p.label}`,
    section,
    subId: startSub + i,
    min: p.min,
    max: p.max,
    center: p.center,
    display: p.display,
  }));
}

function makePatchSpecs(): RelSpec[] {
  const specs: RelSpec[] = [];
  for (let i = 0; i < 6; i++) {
    const n = i + 1;
    const baseRel = 74 + i * 3;
    const baseSub = 0x100 + i * 4;
    specs.push({
      rel: baseRel,
      label: `Patch${n} Source`,
      section: 'patch',
      subId: baseSub,
      min: 0,
      max: 11,
      options: PATCH_SOURCES,
    });
    specs.push({
      rel: baseRel + 1,
      label: `Patch${n} Destination`,
      section: 'patch',
      subId: baseSub + 1,
      min: 0,
      max: 39,
      options: PATCH_DESTINATIONS,
    });
    specs.push({
      rel: baseRel + 2,
      label: `Patch${n} Intensity`,
      section: 'patch',
      subId: baseSub + 2,
      min: 1,
      max: 127,
      center: 64,
      display: 'centered',
    });
  }
  return specs;
}

/* ------------------------------------------------------------------ */
/* TABLE 1 / TABLE 5: program-level parameters                        */
/* ------------------------------------------------------------------ */

const PROGRAM_SPECS: readonly ParamSpec[] = [
  {
    key: 'program.voiceMode',
    label: 'Voice Mode',
    section: 'programVoice',
    timbre: 0,
    paramId: 0x00,
    subId: 0x19,
    offset: 8,
    shift: 6,
    mask: 0x03,
    min: 0,
    max: 3,
    kind: 'select',
    display: 'select',
    options: VOICE_MODES,
  },
  {
    key: 'program.arpTimbre',
    label: 'Arp Timbre Select',
    section: 'programVoice',
    timbre: 0,
    paramId: 0x00,
    subId: 0x18,
    offset: 8,
    shift: 4,
    mask: 0x03,
    min: 0,
    max: 2,
    kind: 'select',
    display: 'select',
    options: ARP_TIMBRES,
  },
  {
    key: 'program.scaleType',
    label: 'Scale Type',
    section: 'programVoice',
    timbre: 0,
    paramId: 0x00,
    subId: 0x17,
    offset: 12,
    shift: 0,
    mask: 0x0f,
    min: 0,
    max: 9,
    kind: 'select',
    display: 'select',
    options: SCALE_TYPES,
  },
  {
    key: 'program.scaleKey',
    label: 'Scale Key',
    section: 'programVoice',
    timbre: 0,
    paramId: 0x00,
    subId: 0x1e,
    offset: 12,
    shift: 4,
    mask: 0x0f,
    min: 0,
    max: 11,
    kind: 'select',
    display: 'select',
    options: SCALE_KEYS,
  },
  {
    key: 'program.timbre2MidiCh',
    label: 'Timbre2 MIDI Ch.',
    section: 'programVoice',
    timbre: 0,
    paramId: 0x00,
    subId: 0x1a,
    offset: 13,
    shift: 0,
    mask: 0x7f,
    min: 0,
    max: 16,
    kind: 'select',
    display: 'select',
    options: [
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
      '11',
      '12',
      '13',
      '14',
      '15',
      '16',
      'Global',
    ],
  },
  {
    key: 'program.octaveSwitch',
    label: 'Octave SW',
    section: 'programVoice',
    timbre: 0,
    paramId: 0x00,
    subId: 0x1d,
    offset: 15,
    shift: 4,
    mask: 0x0f,
    min: 5,
    max: 11,
    kind: 'range',
    display: 'centered',
    center: 8,
    signed: true,
  },

  // --- Arpeggiator common (TABLE 1, ID 0x60) ---
  {
    key: 'arp.tempo',
    label: 'Tempo',
    section: 'arpeggiator',
    timbre: 0,
    paramId: 0x60,
    subId: 0x00,
    offset: 334,
    shift: 0,
    mask: 0x7f,
    min: 20,
    max: 300,
    kind: 'range',
    display: 'raw',
    unit: 'BPM',
    twoByte: true,
  },
  {
    key: 'arp.on',
    label: 'Arpeggiator',
    section: 'arpeggiator',
    timbre: 0,
    paramId: 0x60,
    subId: 0x01,
    offset: 336,
    shift: 7,
    mask: 0x01,
    min: 0,
    max: 1,
    kind: 'toggle',
    display: 'toggle',
    options: ['Off', 'On'],
  },
  {
    key: 'arp.keySync',
    label: 'Key Sync',
    section: 'arpeggiator',
    timbre: 0,
    paramId: 0x60,
    subId: 0x02,
    offset: 336,
    shift: 6,
    mask: 0x01,
    min: 0,
    max: 1,
    kind: 'toggle',
    display: 'toggle',
    options: ['Off', 'On'],
  },

  // --- Arpeggio parameters (TABLE 5, ID 0x61) ---
  {
    key: 'arp.type',
    label: 'Type',
    section: 'arpeggiator',
    timbre: 0,
    paramId: 0x61,
    subId: 0x00,
    offset: 338,
    shift: 0,
    mask: 0x07,
    min: 0,
    max: 5,
    kind: 'select',
    display: 'select',
    options: ARP_TYPES,
  },
  {
    key: 'arp.resolution',
    label: 'Resolution',
    section: 'arpeggiator',
    timbre: 0,
    paramId: 0x61,
    subId: 0x01,
    offset: 338,
    shift: 4,
    mask: 0x0f,
    min: 0,
    max: 8,
    kind: 'select',
    display: 'select',
    options: ARP_RESOLUTIONS,
  },
  {
    key: 'arp.octaveRange',
    label: 'Octave Range',
    section: 'arpeggiator',
    timbre: 0,
    paramId: 0x61,
    subId: 0x02,
    offset: 339,
    shift: 5,
    mask: 0x03,
    min: 0,
    max: 3,
    kind: 'select',
    display: 'select',
    options: ARP_OCTAVES,
  },
  {
    key: 'arp.lastStep',
    label: 'Last Step',
    section: 'arpeggiator',
    timbre: 0,
    paramId: 0x61,
    subId: 0x03,
    offset: 339,
    shift: 0,
    mask: 0x1f,
    min: 0,
    max: 7,
    kind: 'range',
    display: 'lastStep',
  },
  {
    key: 'arp.gate',
    label: 'Gate Time',
    section: 'arpeggiator',
    timbre: 0,
    paramId: 0x61,
    subId: 0x04,
    offset: 340,
    shift: 0,
    mask: 0x7f,
    min: 0,
    max: 100,
    kind: 'range',
    display: 'raw',
    unit: '%',
  },
  {
    key: 'arp.swing',
    label: 'Swing',
    section: 'arpeggiator',
    timbre: 0,
    paramId: 0x61,
    subId: 0x05,
    offset: 341,
    shift: 0,
    mask: 0x7f,
    min: 14,
    max: 114,
    center: 64,
    signed: true,
    kind: 'range',
    display: 'swingPct',
  },
  {
    key: 'arp.latch',
    label: 'Latch',
    section: 'arpeggiator',
    timbre: 0,
    paramId: 0x61,
    subId: 0x06,
    offset: 339,
    shift: 7,
    mask: 0x01,
    min: 0,
    max: 1,
    kind: 'toggle',
    display: 'toggle',
    options: ['Off', 'On'],
  },
  ...Array.from({ length: 8 }, (_, i): ParamSpec => ({
    key: `arp.step${i + 1}`,
    label: `Step ${i + 1}`,
    section: 'arpeggiator',
    timbre: 0,
    paramId: 0x61,
    subId: 0x10 + i,
    offset: 342,
    shift: i,
    mask: 0x01,
    min: 0,
    max: 1,
    kind: 'toggle',
    display: 'toggle',
    options: ['Off', 'On'],
  })),
];

/* ------------------------------------------------------------------ */
/* Public registry                                                    */
/* ------------------------------------------------------------------ */

export const TIMBRE_PARAMS: readonly ParamSpec[] = [1, 2].flatMap((timbre) =>
  TIMBRE_REL_SPECS.map((r) => specFromRel(timbre as 1 | 2, r)),
);

export const PARAMS: readonly ParamSpec[] = [...PROGRAM_SPECS, ...TIMBRE_PARAMS];

export const PARAMS_BY_KEY: ReadonlyMap<string, ParamSpec> = new Map(
  PARAMS.map((p) => [p.key, p]),
);

export function paramsForSection(
  section: ParamSectionId,
  timbre: 0 | 1 | 2,
): ParamSpec[] {
  return PARAMS.filter((p) => p.section === section && p.timbre === timbre);
}

export function specByKey(key: string): ParamSpec {
  const spec = PARAMS_BY_KEY.get(key);
  if (!spec) throw new Error(`unknown parameter key: ${key}`);
  return spec;
}
