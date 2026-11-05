/**
 * Labeled synthetic fixture — NOT data from a real microKORG XL.
 *
 * Canonical 346-byte program layout (TABLE 1 / TABLE 2 / TABLE 5 / TABLE 6).
 * Timbre 1 starts at byte 16, timbre 2 at 112, arpeggiator data at 338.
 *
 *   [0..7]    program name "TESTPROG"          54 45 53 54 50 52 4F 47
 *   [8]       voice mode = Layer (bits 6..7 = 1), arp timbre = Timb1+2 (bits 4..5 = 2) -> 0x60
 *   [12]      scale type = Arabic (low nibble 3), scale key = A (high nibble 9) -> 0x93
 *   [13]      timbre2 MIDI channel = 4
 *   [15]      octave switch field = 5 (bits 4..7) -> 0x50
 *
 *   Timbre 1 (base 16):
 *   [32]      Osc1: wave = Tri (2), osc mod = Cross (1) -> 0x12
 *   [33]      wave CTRL1 = 64
 *   [34]      wave CTRL2 = 32
 *   [37]      Osc2: wave = Pulse (1), mod = Sync (2) -> 0x21
 *   [38]      semitone = 64 (centre)
 *   [39]      tune = 70
 *   [40..42]  mixer osc1=100, osc2=90, noise=10
 *   [44]      filter routing = Parallel (2), filter2 type = HPF (1) -> 0x12
 *   [46]      filter1 cutoff = 100
 *   [47]      filter1 resonance = 80
 *   [56]      amp level = 110
 *   [57]      wave-shape position = Pre Amp (1, bits 4..5) -> 0x10
 *   [58]      wave-shape type = Multi Tri (5)
 *   [60]      panpot = 127 (hard right)
 *   [64..68]  EG1 attack/decay/sustain/release/vel = 10/20/30/40/64
 *   [82]      LFO1 wave = Tri (2)
 *   [84]      LFO1 BPM sync (bit 7) + key sync = Timbre (bit 5..6 = 1) -> 0xA0
 *   [90..92]  patch1 source=7 (Mod Wheel), dest=39 (Patch6 Int.), intensity=64
 *   [108]     EQ low freq index = 5
 *   [109]     EQ low gain = 70 (+3.0 dB, *T02-2)
 *
 *   Timbre 2 (base 112):
 *   [142]     filter1 cutoff = 55
 *
 *   Arpeggiator:
 *   [334,335] tempo = 120 BPM (LSB 120, MSB 0)
 *   [336]     arp on (bit 7) + key sync (bit 6) -> 0xC0
 *   [338]     arp type = Alt2 (3), resolution = 1/16 (2) -> 0x23
 *   [339]     latch on (bit 7), octave range 3 (bits 5..6 = 2), last step 7 (low 5 bits = 6) -> 0xC6
 *   [340]     gate = 75 %
 *   [341]     swing = 74 (+20 %)
 *   [342]     step switches 1,3,6,8 on -> 0xA5
 *
 * All bytes not listed above are 0x00.
 */
export const SYNTHETIC_PROGRAM_HEX = `
54 45 53 54 50 52 4F 47 60 00 00 00 93 04 00 50
00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
12 40 20 00 00 21 40 46 64 5A 0A 00 12 40 64 50
40 40 46 5A 3C 40 40 40 6E 10 05 28 7F 40 32 00
0A 14 1E 28 40 00 01 02 03 04 40 00 05 06 07 08
40 00 02 32 A0 08 04 3C 20 10 07 27 40 00 00 40
01 00 40 02 00 40 03 00 40 04 00 40 05 46 0A 3A
00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
00 40 00 00 00 00 40 40 5A 50 00 00 10 40 37 3C
40 40 40 40 40 40 40 40 64 00 00 00 40 40 00 00
00 40 7F 00 40 00 00 40 7F 0A 40 00 00 40 7F 00
40 00 00 3C 00 08 00 3C 00 08 00 00 40 00 00 40
00 00 40 00 00 40 00 00 40 00 00 40 00 00 40 0E
40 13 40 00 00 00 00 00 00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 00 00 00 00 00 00 78 00
C0 00 23 C6 4B 4A A5 00 00 00
`.trim();

export function syntheticProgramBytes(): Uint8Array {
  const values = SYNTHETIC_PROGRAM_HEX.split(/\s+/).map((hex) => parseInt(hex, 16));
  if (values.length !== 346) {
    throw new Error(`fixture has ${values.length} bytes, expected 346`);
  }
  return Uint8Array.from(values);
}
