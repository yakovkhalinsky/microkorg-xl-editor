import { describe, expect, it } from 'vitest';
import {
  PARAMS,
  paramsForSection,
  specByKey,
  type ParamSectionId,
  type ParamSpec,
} from '../src/protocol/params';
import {
  clampValue,
  decodeProgram,
  emptyProgram,
  formatParamValue,
  fromWireValue,
  normalizeProgram,
  programNumberToLabel,
  programNumberToSlotLabel,
  readParamValue,
  readProgramName,
  toWireValue,
  writeParamValue,
  writeProgramName,
} from '../src/protocol/program';
import { PROGRAM_DATA_LENGTH } from '../src/protocol/constants';
import { syntheticProgramBytes } from './fixtures/synthetic-program';

function valueOf(label: string, timbre: 1 | 2 | 0, section?: string): number {
  const spec = PARAMS.find(
    (candidate) =>
      candidate.label === label &&
      candidate.timbre === timbre &&
      (section === undefined || candidate.section === section),
  );
  if (!spec) throw new Error(`missing spec ${label}`);
  return readParamValue(syntheticProgramBytes(), spec);
}

function specFor(label: string, timbre: 1 | 2 | 0, section: string): ParamSpec {
  const found = PARAMS.find(
    (candidate) =>
      candidate.label === label &&
      candidate.timbre === timbre &&
      candidate.section === section,
  );
  if (!found) throw new Error(`missing spec ${label}`);
  return found;
}

describe('program dump decoding (TABLE 1/2/5/6)', () => {
  it('reads the 8-character program name', () => {
    expect(readProgramName(syntheticProgramBytes())).toBe('TESTPROG');
  });

  it('normalises a NOTE 1 342-byte program to the canonical 346 bytes', () => {
    const documented = new Uint8Array(342);
    documented.set(syntheticProgramBytes().subarray(0, 342));
    const normalized = normalizeProgram(documented);
    expect(normalized.length).toBe(PROGRAM_DATA_LENGTH);
    expect(Array.from(normalized.subarray(0, 342))).toEqual(Array.from(documented));
    expect(normalized[342]).toBe(0);
    expect(decodeProgram(documented).raw.length).toBe(346);
  });

  it('decodes program-level parameters', () => {
    expect(valueOf('Voice Mode', 0)).toBe(1); // Layer
    expect(valueOf('Arp Timbre Select', 0)).toBe(2); // Timb1+2
    expect(valueOf('Scale Type', 0)).toBe(3); // Arabic
    expect(valueOf('Scale Key', 0)).toBe(9); // A
    expect(valueOf('Timbre2 MIDI Ch.', 0)).toBe(4);
    expect(valueOf('Octave SW', 0)).toBe(5);
  });

  it('decodes timbre 1 oscillator / mixer / filter / amp fields', () => {
    expect(valueOf('Wave Type', 1, 'osc1')).toBe(2); // Tri
    expect(valueOf('Osc Mod', 1, 'osc1')).toBe(1); // Cross
    expect(valueOf('Waveform CTRL1', 1, 'osc1')).toBe(64);
    expect(valueOf('Waveform CTRL2', 1, 'osc1')).toBe(32);
    expect(valueOf('Wave Type', 1, 'osc2')).toBe(1); // Pulse
    expect(valueOf('Mod Select', 1, 'osc2')).toBe(2); // Sync
    expect(valueOf('Osc1 Level', 1, 'mixer')).toBe(100);
    expect(valueOf('Osc2 Level', 1, 'mixer')).toBe(90);
    expect(valueOf('Noise Level', 1, 'mixer')).toBe(10);
    expect(valueOf('Routing', 1, 'filter')).toBe(2); // Parallel
    expect(valueOf('Filter2 Type', 1, 'filter')).toBe(1); // HPF
    expect(valueOf('Filter1 Cutoff', 1, 'filter')).toBe(100);
    expect(valueOf('Panpot', 1, 'amp')).toBe(127);
    expect(valueOf('WaveShape Type', 1, 'amp')).toBe(5); // Multi Tri
    expect(valueOf('Drive/WS Position', 1, 'amp')).toBe(1); // Pre Amp
  });

  it('decodes EGs, LFOs, virtual patch and EQ', () => {
    expect(valueOf('EG1 Attack', 1, 'filterEg')).toBe(10);
    expect(valueOf('EG1 Release', 1, 'filterEg')).toBe(40);
    expect(valueOf('EG2 Sustain', 1, 'filterEg')).toBe(3);
    expect(valueOf('EG3 Release', 1, 'ampEg')).toBe(8);
    expect(valueOf('Wave', 1, 'lfo1')).toBe(2); // Tri
    expect(valueOf('BPM Sync', 1, 'lfo1')).toBe(1);
    expect(valueOf('Key Sync', 1, 'lfo1')).toBe(1); // Timbre
    expect(valueOf('Sync Note', 1, 'lfo1')).toBe(8); // 1/4
    expect(valueOf('Wave', 1, 'lfo2')).toBe(4); // Random
    expect(valueOf('Patch1 Source', 1, 'patch')).toBe(7); // Mod Wheel
    expect(valueOf('Patch1 Destination', 1, 'patch')).toBe(39); // Patch6 Int.
    expect(valueOf('Patch1 Intensity', 1, 'patch')).toBe(64);
    expect(valueOf('Low Gain', 1, 'eq')).toBe(70);
    expect(valueOf('Hi Gain', 1, 'eq')).toBe(58);
  });

  it('decodes timbre 2 independently (separate 96-byte block)', () => {
    expect(readParamValue(syntheticProgramBytes(), specFor('Filter1 Cutoff', 2, 'filter'))).toBe(55);
  });

  it('decodes arpeggiator parameters', () => {
    expect(valueOf('Tempo', 0)).toBe(120);
    expect(valueOf('Arpeggiator', 0)).toBe(1);
    expect(valueOf('Key Sync', 0, 'arpeggiator')).toBe(1);
    expect(valueOf('Type', 0, 'arpeggiator')).toBe(3); // Alt2
    expect(valueOf('Resolution', 0, 'arpeggiator')).toBe(2); // 1/16
    expect(valueOf('Octave Range', 0, 'arpeggiator')).toBe(2); // 3 octaves
    expect(valueOf('Last Step', 0, 'arpeggiator')).toBe(6); // displayed as 7
    expect(valueOf('Gate Time', 0, 'arpeggiator')).toBe(75);
    expect(valueOf('Swing', 0, 'arpeggiator')).toBe(74);
    expect(valueOf('Latch', 0, 'arpeggiator')).toBe(1);
    expect(valueOf('Step 1', 0, 'arpeggiator')).toBe(1);
    expect(valueOf('Step 2', 0, 'arpeggiator')).toBe(0);
    expect(valueOf('Step 3', 0, 'arpeggiator')).toBe(1);
    expect(valueOf('Step 8', 0, 'arpeggiator')).toBe(1);
  });

  it('decodeProgram exposes a value for every registered parameter', () => {
    const state = decodeProgram(syntheticProgramBytes());
    expect(state.name).toBe('TESTPROG');
    for (const spec of PARAMS) {
      expect(state.values[spec.key]).toBe(readParamValue(state.raw, spec));
    }
  });
});

describe('parameter writes', () => {
  it('writes a simple byte value', () => {
    const spec = specFor('Filter1 Cutoff', 1, 'filter');
    const next = writeParamValue(syntheticProgramBytes(), spec, 42);
    expect(readParamValue(next, spec)).toBe(42);
  });

  it('preserves neighbouring bitfields in the same byte', () => {
    const wave = specFor('Wave Type', 1, 'osc1');
    const mod = specFor('Osc Mod', 1, 'osc1');
    const original = readParamValue(syntheticProgramBytes(), mod);
    const next = writeParamValue(syntheticProgramBytes(), wave, 7);
    expect(readParamValue(next, wave)).toBe(7);
    expect(readParamValue(next, mod)).toBe(original);
  });

  it('writes the 14-bit tempo split over two bytes', () => {
    const tempo = specFor('Tempo', 0, 'arpeggiator');
    for (const bpm of [20, 120, 300]) {
      const next = writeParamValue(syntheticProgramBytes(), tempo, bpm);
      expect(next[334]).toBe(bpm & 0x7f);
      expect(next[335]).toBe(bpm >> 7);
      expect(readParamValue(next, tempo)).toBe(bpm);
    }
  });

  it('clamps values to the documented range', () => {
    const spec = specFor('Gate Time', 0, 'arpeggiator');
    expect(readParamValue(writeParamValue(syntheticProgramBytes(), spec, 999), spec)).toBe(100);
    expect(readParamValue(writeParamValue(syntheticProgramBytes(), spec, -5), spec)).toBe(0);
    expect(clampValue(spec, Number.NaN)).toBe(0);
  });

  it('round-trips every registered parameter through write/read', () => {
    for (const spec of PARAMS) {
      const target = spec.min === 0 ? Math.min(spec.max, 42) : spec.min;
      const next = writeParamValue(syntheticProgramBytes(), spec, target);
      expect(readParamValue(next, spec), spec.key).toBe(target);
      expect(next.length).toBe(346);
    }
  });

  it('converts bipolar stored values to signed wire values (NOTE 4)', () => {
    const transpose = specFor('Transpose', 1, 'voice');
    expect(toWireValue(transpose, 40)).toBe(-24);
    expect(toWireValue(transpose, 64)).toBe(0);
    expect(toWireValue(transpose, 88)).toBe(24);
    expect(fromWireValue(transpose, -24)).toBe(40);

    const pan = specFor('Panpot', 1, 'amp');
    expect(toWireValue(pan, 127)).toBe(127);
    expect(fromWireValue(pan, 127)).toBe(127);

    const octave = specFor('Octave SW', 0, 'programVoice');
    expect(toWireValue(octave, 5)).toBe(-3);
    expect(fromWireValue(octave, 3)).toBe(11);
  });
});

describe('program name editing', () => {
  it('writes and pads an ASCII name', () => {
    const raw = writeProgramName(emptyProgram(), 'BASS');
    expect(readProgramName(raw)).toBe('BASS');
    expect(Array.from(raw.subarray(0, 8))).toEqual([0x42, 0x41, 0x53, 0x53, 0x20, 0x20, 0x20, 0x20]);
  });

  it('truncates names to 8 characters and masks bytes to 7 bits', () => {
    const raw = writeProgramName(emptyProgram(), 'ABCDEFGHIJ');
    expect(readProgramName(raw)).toBe('ABCDEFGH');
  });
});

describe('display formatting', () => {
  it('formats centered, pan, last-step and swing values', () => {
    expect(formatParamValue(specFor('Transpose', 1, 'voice'), 40)).toBe('-24 st');
    expect(formatParamValue(specFor('Transpose', 1, 'voice'), 88)).toBe('+24 st');
    expect(formatParamValue(specFor('Panpot', 1, 'amp'), 0)).toBe('L63');
    expect(formatParamValue(specFor('Panpot', 1, 'amp'), 64)).toBe('C');
    expect(formatParamValue(specFor('Panpot', 1, 'amp'), 127)).toBe('R63');
    expect(formatParamValue(specFor('Last Step', 0, 'arpeggiator'), 6)).toBe('7');
    expect(formatParamValue(specFor('Swing', 0, 'arpeggiator'), 74)).toBe('+20%');
    expect(formatParamValue(specFor('Swing', 0, 'arpeggiator'), 54)).toBe('-20%');
    expect(formatParamValue(specFor('Low Gain', 1, 'eq'), 70)).toBe('+3.0 dB');
    expect(formatParamValue(specFor('Low Gain', 1, 'eq'), 34)).toBe('-15.0 dB');
    expect(formatParamValue(specFor('Low Gain', 1, 'eq'), 94)).toBe('+15.0 dB');
  });

  it('maps enum values to footnote labels', () => {
    expect(formatParamValue(specFor('Voice Mode', 0, 'programVoice'), 1)).toBe('Layer');
    expect(formatParamValue(specFor('Wave Type', 1, 'osc1'), 6)).toBe('PCM/DWGS');
    expect(formatParamValue(specFor('Patch1 Destination', 1, 'patch'), 39)).toBe('Patch6 Int.');
  });
});

describe('bank / slot labels', () => {
  it('maps 0..127 to the microKORG 8x8 bank layout', () => {
    expect(programNumberToLabel(0)).toBe('A11');
    expect(programNumberToLabel(7)).toBe('A18');
    expect(programNumberToLabel(8)).toBe('A21');
    expect(programNumberToLabel(63)).toBe('A88');
    expect(programNumberToLabel(64)).toBe('B11');
    expect(programNumberToLabel(127)).toBe('B88');
    expect(programNumberToSlotLabel(0)).toBe('A11 · #000');
  });

  it('rejects invalid program numbers', () => {
    expect(() => programNumberToLabel(-1)).toThrow(/0\.\.127/);
    expect(() => programNumberToLabel(128)).toThrow(/0\.\.127/);
  });
});

describe('parameter registry invariants', () => {
  it('has unique keys and in-range dump offsets', () => {
    const keys = new Set<string>();
    for (const spec of PARAMS) {
      expect(keys.has(spec.key), `duplicate key ${spec.key}`).toBe(false);
      keys.add(spec.key);
      expect(spec.offset).toBeGreaterThanOrEqual(0);
      expect(spec.offset + (spec.twoByte ? 1 : 0)).toBeLessThan(PROGRAM_DATA_LENGTH);
      expect(spec.min).toBeLessThanOrEqual(spec.max);
      expect(spec.max).toBeLessThanOrEqual(0x3fff);
      if (spec.options) {
        expect(spec.options.length).toBe(spec.max + 1);
      }
      if (spec.timbre === 1) {
        expect([0x10, 0x11, 0x19]).toContain(spec.paramId);
      }
      if (spec.timbre === 2) {
        expect([0x20, 0x21, 0x29]).toContain(spec.paramId);
      }
    }
  });

  it('covers all MVP sections for both timbres', () => {
    const sections: ParamSectionId[] = [
      'voice',
      'osc1',
      'osc2',
      'mixer',
      'filter',
      'filterEg',
      'amp',
      'ampEg',
      'lfo1',
      'lfo2',
      'patch',
      'eq',
    ];
    for (const timbre of [1, 2] as const) {
      for (const section of sections) {
        expect(
          paramsForSection(section, timbre).length,
          `${section} t${timbre}`,
        ).toBeGreaterThan(0);
      }
    }
    expect(paramsForSection('arpeggiator', 0).length).toBeGreaterThan(0);
    expect(paramsForSection('programVoice', 0).length).toBeGreaterThan(0);
  });

  it('exposes stable keys for programmatic lookup', () => {
    expect(specByKey('t1.osc1.wave-type').paramId).toBe(0x10);
    expect(specByKey('t2.patch.patch6-intensity').subId).toBe(0x116);
    expect(specByKey('arp.tempo').offset).toBe(334);
  });
});
