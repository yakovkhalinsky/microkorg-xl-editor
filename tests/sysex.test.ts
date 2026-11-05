import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PARAMS } from '../src/protocol/params';
import {
  decodeProgram,
  fromWireValue,
  toWireValue,
  writeParamValue,
} from '../src/protocol/program';
import { pack7to8 } from '../src/protocol/packing';
import { syntheticProgramBytes } from './fixtures/synthetic-program';
import {
  buildCurrentProgramDump,
  buildCurrentProgramDumpRequest,
  buildParameterChange,
  buildProgramDump,
  buildProgramDumpRequest,
  buildProgramWriteRequest,
  isMicrokorgSysex,
  parseSysex,
  parseSysexFile,
  toHex,
} from '../src/protocol/sysex';

function findSpec(label: string, timbre: 1 | 2, section?: string) {
  const spec = PARAMS.find(
    (candidate) =>
      candidate.label === label &&
      candidate.timbre === timbre &&
      (section === undefined || candidate.section === section),
  );
  if (!spec) throw new Error(`missing spec ${label}`);
  return spec;
}

describe('SysEx message builders', () => {
  it('encodes PARAMETER CHANGE for Timbre 1 Filter1 Cutoff = 100 (labeled fixture)', () => {
    const spec = findSpec('Filter1 Cutoff', 1, 'filter');
    expect(spec.paramId).toBe(0x10);
    expect(spec.subId).toBe(0x32);

    // F0 42 3g 7E 41 PP pp QQ qq vv VV F7 (detailed byte table: LSB first)
    const bytes = buildParameterChange(0, spec.paramId, spec.subId, 100);
    expect(toHex(bytes)).toBe('F0 42 30 7E 41 10 00 32 00 64 00 F7');
  });

  it('supports 14-bit parameter/sub IDs and values (Patch6 Intensity)', () => {
    const spec = findSpec('Patch6 Intensity', 1, 'patch');
    expect(spec.paramId).toBe(0x11);
    expect(spec.subId).toBe(0x116);

    const bytes = buildParameterChange(0, spec.paramId, spec.subId, 1000);
    // 1000 = 0x3E8 -> vv 0x68, VV 0x07
    expect(toHex(bytes)).toBe('F0 42 30 7E 41 11 00 16 02 68 07 F7');
  });

  it('sends bipolar values signed, relative to centre (NOTE 4)', () => {
    const spec = findSpec('Transpose', 1, 'voice');
    expect(spec.signed).toBe(true);
    expect(spec.center).toBe(64);
    // Stored/dump value 40 means -24 semitones.
    const wire = toWireValue(spec, 40);
    expect(wire).toBe(-24);

    const bytes = buildParameterChange(0, spec.paramId, spec.subId, wire);
    // -24 as 14-bit two's complement = 0x3FE8 -> vv 0x68, VV 0x7F
    expect(toHex(bytes)).toBe('F0 42 30 7E 41 10 00 14 00 68 7F F7');

    const parsed = parseSysex(bytes);
    expect(parsed?.kind).toBe('parameterChange');
    if (parsed?.kind === 'parameterChange') expect(parsed.value).toBe(-24);

    // Unipolar controls are sent raw.
    const pan = findSpec('Panpot', 1, 'amp');
    expect(pan.signed).toBe(false);
    expect(toWireValue(pan, 127)).toBe(127);
  });

  it('encodes the global channel as 0x30 | channel', () => {
    expect(toHex(buildParameterChange(3, 0x10, 0x32, 1))).toMatch(/^F0 42 33 7E 41/);
  });

  it('builds CURRENT PROGRAM DATA DUMP REQUEST (10)', () => {
    expect(toHex(buildCurrentProgramDumpRequest(0))).toBe('F0 42 30 7E 10 F7');
  });

  it('builds PROGRAM WRITE REQUEST (11) with destination', () => {
    expect(toHex(buildProgramWriteRequest(0, 5))).toBe('F0 42 30 7E 11 05 00 F7');
  });

  it('builds PROGRAM DATA DUMP REQUEST (1C) with source', () => {
    expect(toHex(buildProgramDumpRequest(0, 127))).toBe('F0 42 30 7E 1C 7F 00 F7');
  });

  it('rejects out-of-range values', () => {
    expect(() => buildParameterChange(16, 0, 0, 0)).toThrow(/channel/);
    expect(() => buildParameterChange(0, 0x4000, 0, 0)).toThrow(/paramId/);
    expect(() => buildProgramWriteRequest(0, 128)).toThrow(/0\.\.127/);
    expect(() => buildParameterChange(0, 0, 0x4000, 0)).toThrow(/subId/);
    expect(() => buildParameterChange(0, 0, 0, 0x2000)).toThrow(/signed 14-bit/);
    expect(() => buildParameterChange(0, 0, 0, -0x2001)).toThrow(/signed 14-bit/);
  });
});

describe('SysEx parsing', () => {
  it('round-trips PARAMETER CHANGE', () => {
    const bytes = buildParameterChange(5, 0x116, 0x1a, 0x1234);
    const parsed = parseSysex(bytes);
    expect(parsed?.kind).toBe('parameterChange');
    if (parsed?.kind !== 'parameterChange') return;
    expect(parsed.channel).toBe(5);
    expect(parsed.paramId).toBe(0x116);
    expect(parsed.subId).toBe(0x1a);
    expect(parsed.value).toBe(0x1234);
  });

  it('parses a CURRENT PROGRAM DATA DUMP built from the fixture', () => {
    const program = syntheticProgramBytes();
    const message = buildCurrentProgramDump(0, program);
    // 5 header bytes + 396 packed + F7 = 402, matching real XL dumps.
    expect(message.length).toBe(402);

    const parsed = parseSysex(message);
    expect(parsed?.kind).toBe('programDump');
    if (parsed?.kind !== 'programDump') return;
    expect(parsed.programNumber).toBeUndefined();
    expect(parsed.dataLength).toBe(346);
    expect(Array.from(parsed.program)).toEqual(Array.from(program));
  });

  it("accepts a NOTE 1 (342-byte / 391-packed) dump on input", () => {
    const documented = Uint8Array.from({ length: 342 }, (_, i) => i & 0xff);
    const message = Uint8Array.from([
      0xf0, 0x42, 0x30, 0x7e, 0x40, ...pack7to8(documented), 0xf7,
    ]);
    expect(message.length).toBe(397);

    const parsed = parseSysex(message);
    expect(parsed?.kind).toBe('programDump');
    if (parsed?.kind !== 'programDump') return;
    expect(parsed.dataLength).toBe(342);
    expect(parsed.program.length).toBe(342);
    expect(Array.from(parsed.program)).toEqual(Array.from(documented));
  });

  it('parses a stored PROGRAM DATA DUMP (4C) with its program number', () => {
    const program = syntheticProgramBytes();
    const parsed = parseSysex(buildProgramDump(0, 12, program));
    expect(parsed?.kind).toBe('programDump');
    if (parsed?.kind !== 'programDump') return;
    expect(parsed.programNumber).toBe(12);
    expect(Array.from(parsed.program)).toEqual(Array.from(program));
  });

  it('parses ACK / NAK statuses', () => {
    const statuses = [
      [0x23, 'loadOk'],
      [0x24, 'loadError'],
      [0x21, 'writeOk'],
      [0x22, 'writeError'],
      [0x26, 'formatError'],
    ] as const;
    for (const [fn, expected] of statuses) {
      const parsed = parseSysex([0xf0, 0x42, 0x30, 0x7e, fn, 0xf7]);
      expect(parsed?.kind).toBe('ack');
      if (parsed?.kind === 'ack') expect(parsed.status).toBe(expected);
    }
  });

  it('rejects non-microKORG SysEx and truncated messages', () => {
    expect(isMicrokorgSysex([0xf0, 0x41, 0x30, 0x7e, 0x40, 0xf7])).toBe(false);
    expect(parseSysex([0xf0, 0x42, 0x30, 0x7e, 0x40, 0xf7])).toBeNull();
    expect(parseSysex([0xf0, 0x42, 0x30, 0x7e, 0x41, 0x00, 0xf7])).toBeNull();
    // A dump whose payload is neither 391 nor 396 bytes is rejected.
    expect(
      parseSysex([0xf0, 0x42, 0x30, 0x7e, 0x40, ...new Uint8Array(390), 0xf7]),
    ).toBeNull();
  });

  it('parses the committed .syx fixture file', () => {
    const path = new URL('./fixtures/synthetic-program.syx', import.meta.url);
    const file = new Uint8Array(readFileSync(path));
    expect(file.length).toBe(402);

    const messages = parseSysexFile(file);
    expect(messages).toHaveLength(1);
    const [dump] = messages;
    expect(dump.kind).toBe('programDump');
    if (dump.kind !== 'programDump') return;
    expect(Array.from(dump.program)).toEqual(Array.from(syntheticProgramBytes()));
  });

  it('tolerates leading junk in a .syx file', () => {
    const message = buildCurrentProgramDump(0, syntheticProgramBytes());
    const file = Uint8Array.from([0x00, 0xff, ...message, 0x00]);
    const messages = parseSysexFile(file);
    expect(messages).toHaveLength(1);
  });

  it('integrates dump → signed edit → re-dump → decode', () => {
    const original = decodeProgram(syntheticProgramBytes());
    const spec = findSpec('Transpose', 1, 'voice');

    // What the UI sends for a stored/dump value of 40 (-24 semitones).
    const wire = toWireValue(spec, 40);
    const edit = parseSysex(
      buildParameterChange(0, spec.paramId, spec.subId, wire),
    );
    expect(edit?.kind).toBe('parameterChange');
    if (edit?.kind !== 'parameterChange') return;

    // What the synth would store after receiving it.
    const stored = fromWireValue(spec, edit.value);
    const edited = writeParamValue(original.raw, spec, stored);

    // Round-trip the edited buffer through the 7-bit packing again.
    const dump = parseSysex(buildCurrentProgramDump(0, edited));
    expect(dump?.kind).toBe('programDump');
    if (dump?.kind !== 'programDump') return;

    const decoded = decodeProgram(dump.program);
    expect(decoded.name).toBe('TESTPROG');
    expect(decoded.values[spec.key]).toBe(40);
  });
});
