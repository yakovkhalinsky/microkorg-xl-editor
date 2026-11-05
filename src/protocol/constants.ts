/**
 * Protocol constants for the Korg microKORG XL / XL+.
 *
 * Source of truth:
 *   Korg microKORG XL MIDI Implementation, Revision 1.01 (2009.04.27)
 *   https://www.korg.com/us/support/download/manual/1/247/2699/
 *
 * A local copy of the TXT is intentionally not committed (license unclear);
 * see README for the official download links.
 */

/** Korg manufacturer ID (`42`). */
export const KORG_MANUFACTURER_ID = 0x42;

/**
 * Family / model ID for the microKORG XL (`7E`).
 *
 * The XL+ documentation set does not ship a separate MIDI implementation.
 * The working hypothesis (documented in README) is that the XL+ accepts the
 * same program SysEx and simply adds factory sounds.
 */
export const MICROKORG_XL_MODEL_ID = 0x7e;

export const SYSEX_START = 0xf0;
export const SYSEX_END = 0xf7;

/** Function IDs from §2-5 / MIDI EXCLUSIVE FORMAT. */
export const FUNCTION_ID = {
  /** Request the edit buffer. Device replies with 0x40 + 391 packed bytes. */
  CURRENT_PROGRAM_DUMP_REQUEST: 0x10,
  /** Request one stored program. Device replies with 0x4c. */
  PROGRAM_DUMP_REQUEST: 0x1c,
  /** Global data request (not implemented in the MVP). */
  GLOBAL_DUMP_REQUEST: 0x0e,
  /** Write the edit buffer into a program slot. Device replies 0x21 / 0x22. */
  PROGRAM_WRITE_REQUEST: 0x11,

  CURRENT_PROGRAM_DUMP: 0x40,
  PROGRAM_DUMP: 0x4c,
  GLOBAL_DUMP: 0x51,

  /** Live parameter edit. */
  PARAMETER_CHANGE: 0x41,

  DATA_FORMAT_ERROR: 0x26,
  DATA_LOAD_COMPLETED: 0x23,
  DATA_LOAD_ERROR: 0x24,
  WRITE_COMPLETED: 0x21,
  WRITE_ERROR: 0x22,
} as const;

/**
 * Program dump size — and a contradiction inside the official document.
 *
 * NOTE 1 says 342 bytes (342 = 7*48+6 -> 391 MIDI bytes). However:
 *   - TABLE 1's regions add up to 346 bytes (header 16 + timbre 96*2 +
 *     vocoder 78 + FX 48 + arp common 4 + arp data 8);
 *   - TABLE 5's Step 1..8 switches live at offset 342, which cannot fit in a
 *     342-byte buffer;
 *   - a real microKORG XL program dump is reported on Korg's forum as a
 *     402-byte SysEx message = 5 header bytes + 396 packed bytes + F7,
 *     and 396 unpacked bytes = 346.
 *
 * We therefore use 346/396 as the canonical length and still accept 342/391
 * on input (see `parseSysex`) so files/tools that follow NOTE 1 keep working.
 * README documents this in detail.
 */
export const PROGRAM_DATA_LENGTH = 346;
export const PACKED_PROGRAM_DATA_LENGTH = 396;

/** NOTE 1's documented length, accepted on input for compatibility. */
export const NOTE1_PROGRAM_DATA_LENGTH = 342;
export const NOTE1_PACKED_PROGRAM_DATA_LENGTH = 391;

/** Number of programs addressable by PROGRAM WRITE / PROGRAM CHANGE. */
export const PROGRAM_COUNT = 128;

/** 8-character program name lives at dump offsets 0..7 (TABLE 1). */
export const PROGRAM_NAME_OFFSET = 0;
export const PROGRAM_NAME_LENGTH = 8;

/** Default SysEx channel (the microKORG XL global MIDI channel, 0-based). */
export const DEFAULT_CHANNEL = 0;

/** Web MIDI device name matcher. */
export const DEVICE_NAME_PATTERN = /micro\s*korg|korg/i;
