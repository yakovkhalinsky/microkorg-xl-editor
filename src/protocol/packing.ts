import {
  NOTE1_PROGRAM_DATA_LENGTH,
  PROGRAM_DATA_LENGTH,
} from './constants';

/**
 * Korg 7-in-8-bit packing, per NOTE 3 of the microKORG XL MIDI Implementation
 * (Rev 1.01, 2009.04.27):
 *
 *   DATA    (1 set = 8 bit x 7 bytes)  ->  MIDI DATA (1 set = 7 bit x 8 bytes)
 *   the first output byte holds bit 7 of each of the following 7 input bytes;
 *   the remaining 7 output bytes are the low 7 bits of the input bytes.
 *
 * A trailing partial group of k (1..7) input bytes still produces k+1 output
 * bytes (one MSB byte followed by the k data bytes).  Examples:
 *   342 bytes = 7*48 + 6 -> 8*48 + 7 = 391 (NOTE 1's stated size)
 *   346 bytes = 7*49 + 3 -> 8*49 + 4 = 396 (table sum / real 402-byte message)
 */

/** Pack 8-bit data into 7-bit MIDI-safe data. */
export function pack7to8(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < data.length; i += 7) {
    const end = Math.min(i + 7, data.length);
    let msb = 0;
    for (let j = i; j < end; j++) {
      if (data[j] & 0x80) msb |= 1 << (j - i);
    }
    out.push(msb & 0x7f);
    for (let j = i; j < end; j++) out.push(data[j] & 0x7f);
  }
  return Uint8Array.from(out);
}

/** Unpack 7-bit MIDI data produced by {@link pack7to8}. */
export function unpack8to7(packed: Uint8Array): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < packed.length; i += 8) {
    const end = Math.min(i + 8, packed.length);
    const msb = packed[i];
    for (let j = i + 1; j < end; j++) {
      const high = ((msb >> (j - i - 1)) & 1) << 7;
      out.push((packed[j] & 0x7f) | high);
    }
  }
  return Uint8Array.from(out);
}

/** Pack a canonical 346-byte program dump. */
export function packProgramData(program: Uint8Array): Uint8Array {
  if (program.length !== PROGRAM_DATA_LENGTH) {
    throw new RangeError(
      `program dump must be ${PROGRAM_DATA_LENGTH} bytes, got ${program.length}`,
    );
  }
  return pack7to8(program);
}

/**
 * Unpack program data. Accepts both the canonical 346-byte layout and the
 * 342-byte layout documented in NOTE 1; callers normalise to 346 bytes.
 */
export function unpackProgramData(packed: Uint8Array): Uint8Array {
  const program = unpack8to7(packed);
  if (
    program.length !== PROGRAM_DATA_LENGTH &&
    program.length !== NOTE1_PROGRAM_DATA_LENGTH
  ) {
    throw new RangeError(
      `unpacked program dump must be ${PROGRAM_DATA_LENGTH} or ${NOTE1_PROGRAM_DATA_LENGTH} bytes, got ${program.length}`,
    );
  }
  return program;
}
