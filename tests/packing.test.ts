import { describe, expect, it } from 'vitest';
import {
  pack7to8,
  packProgramData,
  unpack8to7,
  unpackProgramData,
} from '../src/protocol/packing';
import {
  NOTE1_PROGRAM_DATA_LENGTH,
  PACKED_PROGRAM_DATA_LENGTH,
  PROGRAM_DATA_LENGTH,
} from '../src/protocol/constants';
import { syntheticProgramBytes } from './fixtures/synthetic-program';

describe('7-bit packing (NOTE 3)', () => {
  it('packs a full 7-byte group: MSB byte first, then low 7 bits', () => {
    const input = Uint8Array.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06]);
    expect(Array.from(pack7to8(input))).toEqual([0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06]);

    // Byte 0 has bit 7 set and byte 6 has bit 7 set -> MSB byte 0b01000001 = 0x41.
    const withHighBits = Uint8Array.from([0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x81]);
    expect(Array.from(pack7to8(withHighBits))).toEqual([0x41, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01]);
  });

  it('handles a partial trailing group (6 bytes -> 7)', () => {
    // Only byte 5 has bit 7 set -> MSB byte 0b00100000 = 0x20.
    const input = Uint8Array.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x86]);
    const packed = pack7to8(input);
    expect(packed.length).toBe(7);
    expect(Array.from(packed)).toEqual([0x20, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06]);
    expect(Array.from(unpack8to7(packed))).toEqual(Array.from(input));
  });

  it("reproduces NOTE 1's documented 342 -> 391 length", () => {
    const documented = Uint8Array.from({ length: NOTE1_PROGRAM_DATA_LENGTH }, (_, i) => (i * 37 + (i % 3) * 128) & 0xff);
    const packed = pack7to8(documented);
    expect(packed.length).toBe(391);
    expect(Array.from(unpack8to7(packed))).toEqual(Array.from(documented));
  });

  it('packs the canonical 346-byte program into 396 MIDI bytes', () => {
    const packed = packProgramData(syntheticProgramBytes());
    expect(PROGRAM_DATA_LENGTH).toBe(346);
    expect(PACKED_PROGRAM_DATA_LENGTH).toBe(396);
    expect(packed.length).toBe(396);
    expect(packed.every((byte) => byte <= 0x7f)).toBe(true);
  });

  it('round-trips the labeled synthetic program fixture', () => {
    const original = syntheticProgramBytes();
    expect(original.length).toBe(346);
    expect(Array.from(unpackProgramData(packProgramData(original)))).toEqual(
      Array.from(original),
    );
  });

  it('accepts a 342-byte NOTE 1 payload on input', () => {
    const documented = Uint8Array.from({ length: 342 }, (_, i) => i & 0xff);
    const unpacked = unpackProgramData(pack7to8(documented));
    expect(unpacked.length).toBe(342);
    expect(Array.from(unpacked)).toEqual(Array.from(documented));
  });

  it('rejects program data of the wrong length', () => {
    expect(() => packProgramData(new Uint8Array(342))).toThrow(/346 bytes/);
    expect(() => unpackProgramData(new Uint8Array(400))).toThrow(/346 or 342/);
  });
});
