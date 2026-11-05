# microKORG XL+ Web MIDI Editor

A browser-based sound editor for the **Korg microKORG XL / XL+**, built with
Vite, TypeScript, and React. It talks to the synth over **class-compliant
USB-MIDI** using the Web MIDI API — no Korg USB driver, no backend, no data
leaves the browser.

> **Status:** MVP. The protocol layer is unit-tested and the app builds, but it
> has **not been verified against real hardware** in this environment. See
> [Known limitations](#known-limitations--todo) and
> [XL vs XL+](#xl-vs-xl) before relying on it live.

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm test           # Vitest protocol + UI smoke tests
```

Requires Node.js **20.19+** (Vite 8).

The dev server runs on `http://localhost`, which is a secure context, so Web
MIDI works. A production build must be served over **https://** (or localhost)
for `navigator.requestMIDIAccess()` to be available.

---

## Using it with the synth

1. Connect the microKORG XL+ with a USB cable and power it on.
2. On the synth, set **MIDI FILTER → SystemEx = ENA**. If this is `DIS`, the
   synth silently ignores every SysEx message (dumps *and* edits).
3. Open the app in desktop **Chrome** or **Edge** and press **Connect MIDI**.
   Allow the MIDI/SysEx permission prompt. (If you denied it, reset it in the
   site settings: *Site settings → MIDI devices*.)
4. Pick the microKORG input and output ports. Ports whose name matches
   `/micro\s*korg|korg/i` are selected automatically when found.
5. Press **Dump current program**. The editor sends
   `F0 42 3g 7E 10 F7` and decodes the `40` reply.
6. Edit away. Each control sends a PARAMETER CHANGE (`41`) to the edit buffer.
7. **Write to slot…** stores the edit buffer in one of the 128 programs. The
   editor uploads its 346-byte buffer first (`40`), waits for ACK `23`, then
   sends PROGRAM WRITE (`11`) and waits for `21`/`22`.

### Windows 11

Use the built-in **class-compliant USB-MIDI** driver. Do **not** install the
old Korg USB-MIDI driver — that is the path that is broken on Windows 11 and
the reason this editor exists. If the synth appears as a MIDI port in Chrome,
you are done.

### macOS / Linux

No driver is needed; the class-compliant device is exposed by the OS. On Linux,
make sure your user can access the ALSA sequencer (`audio` group or equivalent).

---

## Features (MVP)

- **Connect:** enumerates MIDI inputs/outputs, prefers KORG ports, shows
  permission/no-device/SysEx-unsupported errors, and survives hot-plug
  (`statechange`) by re-scanning.
- **Dump current program:** function `10` request → `40` response, 7-bit
  unpacking, program name + every mapped parameter held in app state.
- **Live edit panels** for **Timbre 1 and Timbre 2**:
  - Voice & pitch (unison, voice assign, analog tuning, transpose, detune,
    vibrato, bend range, portamento)
  - Oscillator 1 & 2, mixer
  - Filter (routing, both filters, balance, cutoff, resonance, EG intensity,
    key track, velocity)
  - Filter EGs (EG1/EG2) and Amp EG (EG3)
  - Amp (level, wave shaper, pan, key track, punch)
  - LFO 1 & 2, six virtual patches, timbre EQ
- **Program page:** voice mode, arp timbre target, scale type/key, timbre-2
  MIDI channel, octave switch, and the 8-character program name.
- **Arpeggiator page:** on/off, tempo, key sync, type, resolution, octave
  range, last step, gate, swing, latch, and the 8 step switches.
- **`.syx` import/export:** export a `CURRENT PROGRAM DATA DUMP` (`40`);
  import `40` or `4C` dumps, including 342-byte NOTE 1 files.
- **Write to slot:** explicit confirmation dialog, 128-slot picker
  (`A11`–`B88`), ACK/NAK handling, and a timeout with a clear message.
- **SysEx monitor:** last 30 messages with direction, hex, and a label.

Values are clamped to the ranges in the MIDI implementation. Bipolar
parameters are displayed relative to their centre (`-24 st`, `+20%`, `L63`,
etc.) and sent as signed 14-bit values; see
[Parameter values](#parameter-values).

---

## Protocol notes

Source of truth: **Korg microKORG XL MIDI Implementation, Revision 1.01
(2009.04.27)**. The TXT is not committed here because its redistribution
license is unclear; download it from Korg:

- MIDI implementation + manuals: <https://www.korg.com/us/support/download/manual/1/247/2699/>
- microKORG XL product downloads: <https://www.korg.com/us/support/download/product/1/247/>
- microKORG XL+ product downloads: <https://www.korg.com/us/support/download/product/0/101/>

### Message envelope

```
F0 42 3g 7E <function> … F7
   │  │  │  └── model / family ID: 7E = microKORG XL
   │  │  └───── global MIDI channel, g = 0..F
   │  └──────── Korg manufacturer ID (42)
   └─────────── SysEx start
```

| Function | Meaning |
| -------- | ------- |
| `10` | CURRENT PROGRAM DATA DUMP REQUEST (edit buffer) |
| `1C` | PROGRAM DATA DUMP REQUEST (1 stored program) + program no. |
| `0E` | GLOBAL DATA DUMP REQUEST (not implemented) |
| `11` | PROGRAM WRITE REQUEST + destination program no. (0..127) |
| `40` | CURRENT PROGRAM DATA DUMP (edit buffer) |
| `4C` | PROGRAM DATA DUMP (1 stored program) |
| `51` | GLOBAL DATA DUMP (not implemented) |
| `41` | PARAMETER CHANGE |
| `23` / `24` | data load completed / load error (ACK / NAK) |
| `21` / `22` | write completed / write error |
| `26` | data format error |

Recognized only when the synth's **SystemEx** filter is `ENA`.

### 7-bit packing (NOTE 3)

Each group of up to 7 data bytes is preceded by one byte holding their bit 7s:

```
data:    b7..b0  b7..b0  …  b7..b0      (7 bytes)
wire:    0MMMMMMM  0LLLLLLL … 0LLLLLLL  (1 + 7 bytes)
```

A trailing partial group of *k* bytes produces *k+1* wire bytes. Implemented
generically in [`src/protocol/packing.ts`](src/protocol/packing.ts).

### Program dump length: the document contradicts itself

NOTE 1 says **342 bytes → 391 wire bytes** (`342 = 7*48+6`). However:

- TABLE 1's regions add up to **346** bytes: 16 header + 96 + 96 timbre +
  78 vocoder + 48 FX + 4 arp common + 8 arp data.
- TABLE 5 puts the arpeggiator Step 1–8 switches at **offset 342**, which
  cannot exist in a 342-byte buffer.
- A real microKORG XL program dump is described on Korg's forum as a
  **402-byte SysEx message**: 5 header bytes + **396** packed bytes + `F7`,
  and 396 unpacked bytes = **346**.

This editor therefore uses **346 / 396 as canonical**, but **accepts 391-byte
payloads on input** (NOTE 1 files/tools), zero-padding to 346 for display.
Export and edit-buffer upload always send the canonical 346-byte payload.
If your unit turns out to speak only the 342-byte variant, the constants in
[`src/protocol/constants.ts`](src/protocol/constants.ts) are the single place
to change.

Program regions (canonical 346-byte layout):

| Region | Offsets | Size |
| ------ | ------- | ---- |
| Program header (name, voice mode, scale, octave) | 0–15 | 16 |
| Timbre 1 (TABLE 2/6) | 16–111 | 96 |
| Timbre 2 (TABLE 2/6) | 112–207 | 96 |
| Vocoder (TABLE 3) | 208–285 | 78 |
| FX (TABLE 4) | 286–333 | 48 |
| Arpeggio common (tempo, on/off, key sync) | 334–337 | 4 |
| Arpeggio (TABLE 5) | 338–345 | 8 |

### PARAMETER CHANGE format

```
F0 42 3g 7E 41 PP pp QQ qq vv VV F7
                  │  │  │  │  │  └── value MSB
                  │  │  │  │  └───── value LSB (signed 14-bit)
                  │  │  └──┴────────── parameter sub-ID (LSB first)
                  └──┴─────────────── parameter ID (LSB first)
```

The detailed byte table in §2-5 lists the **low** 7 bits first; NOTE 4's
one-line summary writes `PP,pp`. This editor follows the detailed table
(LSB first). The two ambiguities most likely to matter on hardware are:

1. **Byte order** (above).
2. **Value encoding.** NOTE 4 says the value is *signed*. This editor sends
   bipolar parameters relative to their centre (stored `40` for Transpose is
   sent as `-24`), and sends unipolar parameters unchanged. Panpot is centred
   at 64 for display but is sent raw (`0–127`). If edits are ignored or land on
   the wrong value, these two choices are the first to check.

Parameter IDs used by the panels (TABLE 1/2/5/6):

| Timbre 1 | Timbre 2 | Meaning |
| -------- | -------- | ------- |
| `0x10` | `0x20` | main timbre parameters, sub-IDs `0x00`–`0x96` |
| `0x11` | `0x21` | virtual patch 1–6, sub-IDs `0x00`–`0x16` |
| `0x19` | `0x29` | timbre EQ, sub-IDs `0x00`–`0x03` |
| `0x00` | — | program-level (voice mode, scale, name, octave) |
| `0x60` / `0x61` | — | arpeggio common / arpeggio parameters |

### Bank and slot numbering

Program numbers are `0..127`, displayed in the microKORG 8×8 layout:
`0 = A11`, `7 = A18`, `8 = A21`, `63 = A88`, `64 = B11`, `127 = B88`. The
numeric program number is always shown next to the label (`A11 · #000`) so
there is no ambiguity. The MIDI implementation's prose says "A01 - B88"; its
own forum users and the panel use `A11`-style labels.

---

## Tests and fixtures

`npm test` runs 54 Vitest tests:

- **Packing:** full/partial groups, NOTE 1's `342 → 391`, canonical
  `346 → 396`, round-trips, rejected lengths.
- **SysEx:** exact byte fixtures for PARAMETER CHANGE (unipolar and signed
  bipolar), dump/write/request messages, 14-bit IDs, ACK/NAK parsing, 342- and
  346-byte dumps, `.syx` file splitting with leading junk.
- **Program:** decode every TABLE 1/2/5/6 parameter from a labeled synthetic
  fixture, bitfield writes, tempo (14-bit), clamping, all-parameter
  write/read round-trip, name handling, bank labels, display formatting.
- **UI:** server-rendered smoke test of the app shell.
- **Web MIDI client:** mocked `requestMIDIAccess`, KORG-port preference,
  channel-correct dump requests, incoming-message forwarding, and clear
  permission/unsupported errors.

The synthetic fixture is defined in
[`tests/fixtures/synthetic-program.ts`](tests/fixtures/synthetic-program.ts)
with a byte-by-byte comment map, and is also committed as a 402-byte
[`synthetic-program.syx`](tests/fixtures/synthetic-program.syx) (a `40`
message with a 346-byte payload). It is **not** recorded hardware data.

---

## Project structure

```
src/
  protocol/     constants, 7-bit packing, SysEx build/parse, parameter
                registry (TABLE 1/2/5/6), program decode/edit, bank labels
  midi/         Web MIDI wrapper, port selection, throttled parameter sends
  ui/           parameter controls and section cards
  App.tsx       connection, dump, editor pages, .syx, write flow
tests/          protocol unit tests + labeled fixture + UI smoke test
```

---

## Known limitations / TODO

- **Not hardware-verified.** The dump length, byte order, and signed-value
  encoding are the main uncertainties; README and code call them out.
- **Vocoder page** (TABLE 3: 16 bands, pans, levels, formant hold) — not yet
  mapped in the UI.
- **FX page** (TABLE 4: two effect slots, type-dependent parameters) — not yet
  mapped.
- **Global settings** (function `0E` / `51`, TABLE 7) and **full bank
  librarian** — not implemented.
- Stored-program request (`1C` / `4C`) exists in the protocol layer and import
  path but has no dedicated UI.
- Non-linear display tables (LFO rate, vibrato cents, filter key track, EQ
  frequency, PCM/DWGS wave names) are shown as raw indices rather than guessed
  units. Values are still sent correctly.
- No MIDI clock / arpeggiator transport integration.
- Split point (program byte 14, undocumented in the MIDI implementation) is not
  exposed.

---

## XL vs XL+

Korg publishes a MIDI implementation for the **microKORG XL** but **no separate
one for the XL+**; the XL+ product download page lists manuals and the sound
editor, not a MIDI implementation. The working hypothesis, encoded here, is
that the XL+ accepts the same program SysEx (same `42 … 7E` family byte) and
mainly adds factory sounds. **This is unverified.** If the XL+ reports a
different family/model byte, dumps will not parse; `MICROKORG_XL_MODEL_ID` in
`src/protocol/constants.ts` is the single place to change.

---

## References

- Korg microKORG XL MIDI Implementation Rev 1.01 (2009.04.27) — the source for
  every table and function ID in this project:
  <https://www.korg.com/us/support/download/manual/1/247/2699/>
- Korg microKORG XL product downloads:
  <https://www.korg.com/us/support/download/product/1/247/>
- Korg microKORG XL+ product downloads:
  <https://www.korg.com/us/support/download/product/0/101/>
- Korg Forums, "Understanding Midi Dump data from MicroKORG XL" (the
  402-byte program-dump observation):
  <https://www.korgforums.com/forum/phpBB3/viewtopic.php?p=622114>
- Ben Jones, `benjones/microkorgXL` — an earlier Web MIDI/ SVG editor; useful
  for ideas, **not** a runtime dependency:
  <https://github.com/benjones/microkorgXL>
- `judholliday/microkorg-xl-editor` — an independent open-source XL editor
  consulted to cross-check parameter offsets/IDs; no code is used at runtime:
  <https://github.com/judholliday/microkorg-xl-editor>

No Korg firmware, sample data, or proprietary editor files are included.

---

## Disclaimer

This is an unofficial personal project, not affiliated with or endorsed by
Korg. Writing a program slot overwrites data on your instrument — back up
anything important first (export the program as `.syx`).
