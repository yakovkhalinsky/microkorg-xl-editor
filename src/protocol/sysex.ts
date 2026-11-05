import {
  DEFAULT_CHANNEL,
  FUNCTION_ID,
  KORG_MANUFACTURER_ID,
  MICROKORG_XL_MODEL_ID,
  NOTE1_PACKED_PROGRAM_DATA_LENGTH,
  PACKED_PROGRAM_DATA_LENGTH,
  PROGRAM_DATA_LENGTH,
  SYSEX_END,
  SYSEX_START,
} from './constants';
import { packProgramData, unpackProgramData } from './packing';

/** Largest 14-bit parameter ID / sub-ID accepted on the wire. */
export const MAX_14BIT = 0x3fff;

/** Parameter values are signed 14-bit (two's complement), per NOTE 4. */
export const MIN_SIGNED_14BIT = -0x2000;
export const MAX_SIGNED_14BIT = 0x1fff;

export type ParsedSysex =
  | {
      kind: 'programDump';
      channel: number;
      /** Packed bytes exactly as received (391). */
      packed: Uint8Array;
      /** Unpacked program data (346 canonical, or 342 for NOTE 1 dumps). */
      program: Uint8Array;
      /** Length actually received: 346 canonically, 342 for NOTE 1 dumps. */
      dataLength: number;
      /** Present for function 0x4C (stored program dump). */
      programNumber?: number;
      bytes: Uint8Array;
    }
  | {
      kind: 'parameterChange';
      channel: number;
      paramId: number;
      subId: number;
      value: number;
      bytes: Uint8Array;
    }
  | {
      kind: 'ack';
      channel: number;
      status: 'loadOk' | 'loadError' | 'writeOk' | 'writeError' | 'formatError';
      bytes: Uint8Array;
    }
  | {
      kind: 'unknown';
      channel: number;
      functionId: number;
      bytes: Uint8Array;
    };

export function assertChannel(channel: number): void {
  if (!Number.isInteger(channel) || channel < 0 || channel > 15) {
    throw new RangeError(`MIDI channel must be 0..15, got ${channel}`);
  }
}

export function assert14Bit(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > MAX_14BIT) {
    throw new RangeError(`${name} must be an integer 0..${MAX_14BIT}, got ${value}`);
  }
}

export function assertSigned14Bit(name: string, value: number): void {
  if (
    !Number.isInteger(value) ||
    value < MIN_SIGNED_14BIT ||
    value > MAX_SIGNED_14BIT
  ) {
    throw new RangeError(
      `${name} must be a signed 14-bit integer ${MIN_SIGNED_14BIT}..${MAX_SIGNED_14BIT}, got ${value}`,
    );
  }
}

/** Interpret a 14-bit unsigned wire value as two's complement (NOTE 4). */
export function signed14(value: number): number {
  const masked = value & MAX_14BIT;
  return masked & 0x2000 ? masked - 0x4000 : masked;
}

/**
 * `F0 42 3g 7E` — Korg manufacturer ID, global channel, microKORG XL model ID.
 *
 * NOTE 4 writes the header as `F0,42,3n,7E`; `3g`/`3n` means 0x30 | channel.
 */
export function buildSysexHeader(channel: number = DEFAULT_CHANNEL): number[] {
  assertChannel(channel);
  return [SYSEX_START, KORG_MANUFACTURER_ID, 0x30 | channel, MICROKORG_XL_MODEL_ID];
}

/**
 * PARAMETER CHANGE (function `41`), NOTE 4 / format (8):
 *
 *   F0 42 3n 7E 41 PP pp QQ qq vv VV F7
 *
 * Byte order note: the detailed byte table in §2-5 lists the LOW 7 bits first
 * (`pp` = Parameter ID LSB, then `PP` = MSB), while NOTE 4's one-line summary
 * writes `PP,pp`. We follow the detailed table (LSB first). If a unit ignores
 * edits, this ordering is the first thing to verify (see README).
 *
 * Value note: NOTE 4 says the value is signed (14-bit two's complement);
 * bipolar parameters are sent relative to their centre (e.g. Transpose 40 =
 * -24 is sent as -24, not 40). See `toWireValue` in program.ts.
 */
export function buildParameterChange(
  channel: number,
  paramId: number,
  subId: number,
  value: number,
): Uint8Array {
  assert14Bit('paramId', paramId);
  assert14Bit('subId', subId);
  assertSigned14Bit('value', value);
  const encoded = value & MAX_14BIT;
  return Uint8Array.from([
    ...buildSysexHeader(channel),
    FUNCTION_ID.PARAMETER_CHANGE,
    paramId & 0x7f,
    (paramId >> 7) & 0x7f,
    subId & 0x7f,
    (subId >> 7) & 0x7f,
    encoded & 0x7f,
    (encoded >> 7) & 0x7f,
    SYSEX_END,
  ]);
}

/** `F0 42 3g 7E 10 F7` — ask the synth for its edit buffer. */
export function buildCurrentProgramDumpRequest(
  channel: number = DEFAULT_CHANNEL,
): Uint8Array {
  return Uint8Array.from([
    ...buildSysexHeader(channel),
    FUNCTION_ID.CURRENT_PROGRAM_DUMP_REQUEST,
    SYSEX_END,
  ]);
}

/** `F0 42 3g 7E 1C pp 00 F7` — ask for one stored program (0..127). */
export function buildProgramDumpRequest(
  channel: number,
  programNumber: number,
): Uint8Array {
  if (!Number.isInteger(programNumber) || programNumber < 0 || programNumber > 127) {
    throw new RangeError(`program number must be 0..127, got ${programNumber}`);
  }
  return Uint8Array.from([
    ...buildSysexHeader(channel),
    FUNCTION_ID.PROGRAM_DUMP_REQUEST,
    programNumber & 0x7f,
    0x00,
    SYSEX_END,
  ]);
}

/** `F0 42 3g 7E 11 pp 00 F7` — write the edit buffer to a program slot. */
export function buildProgramWriteRequest(
  channel: number,
  programNumber: number,
): Uint8Array {
  if (!Number.isInteger(programNumber) || programNumber < 0 || programNumber > 127) {
    throw new RangeError(`program number must be 0..127, got ${programNumber}`);
  }
  return Uint8Array.from([
    ...buildSysexHeader(channel),
    FUNCTION_ID.PROGRAM_WRITE_REQUEST,
    programNumber & 0x7f,
    0x00,
    SYSEX_END,
  ]);
}

/**
 * Build a complete CURRENT PROGRAM DATA DUMP (function `40`) from 342 bytes of
 * program data. Useful for exporting the locally edited buffer as `.syx`.
 */
export function buildCurrentProgramDump(
  channel: number,
  program: Uint8Array,
): Uint8Array {
  if (program.length !== PROGRAM_DATA_LENGTH) {
    throw new RangeError(
      `program dump must be ${PROGRAM_DATA_LENGTH} bytes, got ${program.length}`,
    );
  }
  return Uint8Array.from([
    ...buildSysexHeader(channel),
    FUNCTION_ID.CURRENT_PROGRAM_DUMP,
    ...packProgramData(program),
    SYSEX_END,
  ]);
}

/** Build a stored-program dump (function `4C`) from 342 bytes of program data. */
export function buildProgramDump(
  channel: number,
  programNumber: number,
  program: Uint8Array,
): Uint8Array {
  if (!Number.isInteger(programNumber) || programNumber < 0 || programNumber > 127) {
    throw new RangeError(`program number must be 0..127, got ${programNumber}`);
  }
  return Uint8Array.from([
    ...buildSysexHeader(channel),
    FUNCTION_ID.PROGRAM_DUMP,
    programNumber & 0x7f,
    0x00,
    ...packProgramData(program),
    SYSEX_END,
  ]);
}

/** True when the message is a Korg microKORG XL SysEx message. */
export function isMicrokorgSysex(data: ArrayLike<number>): boolean {
  return (
    data.length >= 6 &&
    data[0] === SYSEX_START &&
    data[1] === KORG_MANUFACTURER_ID &&
    (data[2] & 0xf0) === 0x30 &&
    data[3] === MICROKORG_XL_MODEL_ID
  );
}

const ACK_STATUS: Record<number, 'loadOk' | 'loadError' | 'writeOk' | 'writeError' | 'formatError'> = {
  [FUNCTION_ID.DATA_LOAD_COMPLETED]: 'loadOk',
  [FUNCTION_ID.DATA_LOAD_ERROR]: 'loadError',
  [FUNCTION_ID.WRITE_COMPLETED]: 'writeOk',
  [FUNCTION_ID.WRITE_ERROR]: 'writeError',
  [FUNCTION_ID.DATA_FORMAT_ERROR]: 'formatError',
};

/**
 * Parse a complete SysEx message received from the synth.
 * Returns `null` for anything that is not microKORG XL SysEx.
 */
export function parseSysex(data: Uint8Array | number[]): ParsedSysex | null {
  const bytes = Uint8Array.from(data);
  if (!isMicrokorgSysex(bytes)) return null;
  if (bytes[bytes.length - 1] !== SYSEX_END) return null;

  const channel = bytes[2] & 0x0f;
  const functionId = bytes[4];

  if (functionId === FUNCTION_ID.CURRENT_PROGRAM_DUMP || functionId === FUNCTION_ID.PROGRAM_DUMP) {
    const hasProgramNumber = functionId === FUNCTION_ID.PROGRAM_DUMP;
    const dataStart = hasProgramNumber ? 7 : 5;
    const packed = bytes.subarray(dataStart, bytes.length - 1);
    // Accept both the canonical 396-byte payload and NOTE 1's 391-byte payload.
    if (
      packed.length !== PACKED_PROGRAM_DATA_LENGTH &&
      packed.length !== NOTE1_PACKED_PROGRAM_DATA_LENGTH
    ) {
      return null;
    }
    const program = unpackProgramData(packed);
    return {
      kind: 'programDump',
      channel,
      packed: Uint8Array.from(packed),
      program,
      /** Length actually received (342 for NOTE 1 dumps, 346 canonically). */
      dataLength: program.length,
      ...(hasProgramNumber
        ? { programNumber: (bytes[5] & 0x7f) | ((bytes[6] & 0x7f) << 7) }
        : {}),
      bytes,
    };
  }

  if (functionId === FUNCTION_ID.PARAMETER_CHANGE) {
    if (bytes.length < 12) return null;
    return {
      kind: 'parameterChange',
      channel,
      // Detailed byte table: LSB first, then MSB.
      paramId: (bytes[5] & 0x7f) | ((bytes[6] & 0x7f) << 7),
      subId: (bytes[7] & 0x7f) | ((bytes[8] & 0x7f) << 7),
      // NOTE 4: value is signed 14-bit; bipolar values are relative to centre.
      value: signed14((bytes[9] & 0x7f) | ((bytes[10] & 0x7f) << 7)),
      bytes,
    };
  }

  const status = ACK_STATUS[functionId];
  if (status) {
    return { kind: 'ack', channel, status, bytes };
  }

  return { kind: 'unknown', channel, functionId, bytes };
}

/** Parse a `.syx` file buffer; returns every complete microKORG SysEx message. */
export function parseSysexFile(data: Uint8Array): ParsedSysex[] {
  const messages: ParsedSysex[] = [];
  let start = -1;
  for (let i = 0; i < data.length; i++) {
    if (data[i] === SYSEX_START) {
      start = i;
    } else if (data[i] === SYSEX_END && start >= 0) {
      const parsed = parseSysex(data.subarray(start, i + 1));
      if (parsed) messages.push(parsed);
      start = -1;
    }
  }
  return messages;
}

export function toHex(bytes: ArrayLike<number>): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}
