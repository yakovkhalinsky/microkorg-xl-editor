import {
  NOTE1_PROGRAM_DATA_LENGTH,
  PROGRAM_DATA_LENGTH,
  PROGRAM_NAME_LENGTH,
  PROGRAM_NAME_OFFSET,
} from './constants';
import { PARAMS, type ParamSpec } from './params';

export interface ProgramState {
  /** Unpacked canonical 346-byte program data. */
  raw: Uint8Array;
  name: string;
  /** Raw (unscaled) value for every registered parameter. */
  values: Record<string, number>;
}

export function emptyProgram(): Uint8Array {
  const raw = new Uint8Array(PROGRAM_DATA_LENGTH);
  for (let i = 0; i < PROGRAM_NAME_LENGTH; i++) raw[PROGRAM_NAME_OFFSET + i] = 0x20;
  return raw;
}

/**
 * Return a canonical 346-byte copy. Dumps that follow NOTE 1 (342 bytes) are
 * zero-padded, so the arpeggiator step-switch byte at offset 342 is unavailable
 * but everything else decodes normally.
 */
export function normalizeProgram(raw: Uint8Array): Uint8Array {
  if (raw.length === PROGRAM_DATA_LENGTH) return Uint8Array.from(raw);
  if (raw.length === NOTE1_PROGRAM_DATA_LENGTH) {
    const padded = new Uint8Array(PROGRAM_DATA_LENGTH);
    padded.set(raw);
    return padded;
  }
  throw new RangeError(
    `program data must be ${PROGRAM_DATA_LENGTH} or ${NOTE1_PROGRAM_DATA_LENGTH} bytes, got ${raw.length}`,
  );
}

export function readProgramName(raw: Uint8Array): string {
  let name = '';
  for (let i = 0; i < PROGRAM_NAME_LENGTH; i++) {
    const c = raw[PROGRAM_NAME_OFFSET + i] & 0x7f;
    name += c === 0 ? ' ' : String.fromCharCode(c);
  }
  return name.replace(/\s+$/, '');
}

/** Write an ASCII program name (max 8 chars), space-padded. */
export function writeProgramName(raw: Uint8Array, name: string): Uint8Array {
  const next = Uint8Array.from(raw);
  const ascii = name
    .slice(0, PROGRAM_NAME_LENGTH)
    .split('')
    .map((c) => c.charCodeAt(0) & 0x7f);
  for (let i = 0; i < PROGRAM_NAME_LENGTH; i++) {
    next[PROGRAM_NAME_OFFSET + i] = ascii[i] ?? 0x20;
  }
  return next;
}

/** Read a parameter's raw field value from the 342-byte dump. */
export function readParamValue(raw: Uint8Array, spec: ParamSpec): number {
  if (spec.twoByte) {
    return (raw[spec.offset] & 0x7f) | ((raw[spec.offset + 1] & 0x7f) << 7);
  }
  return (raw[spec.offset] >> spec.shift) & spec.mask;
}

/** Return a copy of `raw` with `value` written into the parameter's field. */
export function writeParamValue(
  raw: Uint8Array,
  spec: ParamSpec,
  value: number,
): Uint8Array {
  const clamped = clampValue(spec, value);
  const next = Uint8Array.from(raw);
  if (spec.twoByte) {
    next[spec.offset] = clamped & 0x7f;
    next[spec.offset + 1] = (clamped >> 7) & 0x7f;
    return next;
  }
  const fieldMask = spec.mask << spec.shift;
  next[spec.offset] =
    (next[spec.offset] & ~fieldMask & 0xff) |
    ((clamped & spec.mask) << spec.shift);
  return next;
}

export function clampValue(spec: ParamSpec, value: number): number {
  const rounded = Number.isFinite(value) ? Math.round(value) : spec.min;
  return Math.min(spec.max, Math.max(spec.min, rounded));
}

export function decodeProgram(raw: Uint8Array): ProgramState {
  const copy = normalizeProgram(raw);
  const values: Record<string, number> = {};
  for (const spec of PARAMS) values[spec.key] = readParamValue(copy, spec);
  return { raw: copy, name: readProgramName(copy), values };
}

/**
 * Convert a stored (dump) parameter value to the value carried by PARAMETER
 * CHANGE. NOTE 4 defines the wire value as signed; bipolar parameters are sent
 * relative to their centre (Transpose 40 -> -24), unipolar ones unchanged.
 */
export function toWireValue(spec: ParamSpec, value: number): number {
  return spec.signed ? value - (spec.center ?? 64) : value;
}

/** Inverse of {@link toWireValue}, e.g. for echoing a received edit back. */
export function fromWireValue(spec: ParamSpec, wireValue: number): number {
  return spec.signed ? wireValue + (spec.center ?? 64) : wireValue;
}

/** Human-readable value for a parameter (including its documented unit). */
export function formatParamValue(spec: ParamSpec, value: number): string {
  switch (spec.display) {
    case 'select':
    case 'toggle':
      return spec.options?.[value] ?? String(value);
    case 'centered': {
      const center = spec.center ?? 64;
      const delta = value - center;
      const sign = delta > 0 ? '+' : '';
      return `${sign}${delta}${spec.unit ? ` ${spec.unit}` : ''}`;
    }
    case 'eqGain': {
      // *T02-2: 34..94 maps to -15.0..+15.0 dB in 0.5 dB steps (64 = 0).
      const db = (value - (spec.center ?? 64)) * 0.5;
      const sign = db > 0 ? '+' : '';
      return `${sign}${db.toFixed(1)} dB`;
    }
    case 'pan': {
      if (value === 64) return 'C';
      return value < 64 ? `L${Math.min(63, 64 - value)}` : `R${Math.min(63, value - 64)}`;
    }
    case 'lastStep':
      return `${value + 1}`;
    case 'swingPct': {
      const pct = Math.round(((value - 64) / 50) * 100);
      const sign = pct > 0 ? '+' : '';
      return `${sign}${pct}%`;
    }
    case 'raw':
    default:
      return `${value}${spec.unit ? ` ${spec.unit}` : ''}`;
  }
}

/* ------------------------------------------------------------------ */
/* Bank / program numbering                                           */
/* ------------------------------------------------------------------ */

/**
 * The MIDI implementation documents program numbers 0..127 as "A01 - B88".
 * microKORG-family panels use an 8x8 grid per bank, so program 0 is displayed
 * as A11, program 63 as A88, program 64 as B11 and program 127 as B88.
 * The numeric program number is always shown alongside the label so there is
 * no ambiguity.
 */
export function programNumberToLabel(programNumber: number): string {
  if (
    !Number.isInteger(programNumber) ||
    programNumber < 0 ||
    programNumber > 127
  ) {
    throw new RangeError(`program number must be 0..127, got ${programNumber}`);
  }
  const bank = programNumber < 64 ? 'A' : 'B';
  const within = programNumber % 64;
  const row = Math.floor(within / 8) + 1;
  const col = (within % 8) + 1;
  return `${bank}${row}${col}`;
}

export function programNumberToSlotLabel(programNumber: number): string {
  return `${programNumberToLabel(programNumber)} · #${String(programNumber).padStart(3, '0')}`;
}

export function programSlots(): { number: number; label: string }[] {
  return Array.from({ length: 128 }, (_, number) => ({
    number,
    label: programNumberToSlotLabel(number),
  }));
}
