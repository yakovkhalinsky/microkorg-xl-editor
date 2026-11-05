import {
  DEFAULT_CHANNEL,
  DEVICE_NAME_PATTERN,
  PROGRAM_DATA_LENGTH,
} from '../protocol/constants';
import type { ParamSpec } from '../protocol/params';
import { toWireValue } from '../protocol/program';
import {
  buildCurrentProgramDump,
  buildCurrentProgramDumpRequest,
  buildParameterChange,
  buildProgramWriteRequest,
  parseSysex,
  toHex,
  type ParsedSysex,
} from '../protocol/sysex';

export type MidiErrorCode =
  | 'unsupported'
  | 'permission'
  | 'no-device'
  | 'send-failed';

export class MidiError extends Error {
  constructor(
    readonly code: MidiErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'MidiError';
  }
}

export interface DeviceInfo {
  id: string;
  name: string;
  manufacturer: string;
}

export type MidiLogEntry = {
  direction: 'in' | 'out';
  bytes: Uint8Array;
  note?: string;
};

export interface MidiSnapshot {
  supported: boolean;
  accessGranted: boolean;
  inputs: DeviceInfo[];
  outputs: DeviceInfo[];
  inputId: string | null;
  outputId: string | null;
  error: MidiError | null;
}

type Listener = () => void;

const THROTTLE_MS = 16;

/**
 * Thin Web MIDI wrapper for the microKORG XL/XL+.
 *
 * SysEx access must be requested explicitly (`requestMIDIAccess({ sysex: true })`).
 * Web MIDI is only available in secure contexts (https:// or http://localhost).
 */
export class MicrokorgMidi {
  private access: MIDIAccess | null = null;
  private input: MIDIInput | null = null;
  private output: MIDIOutput | null = null;
  private listeners = new Set<Listener>();
  private pending = new Map<string, { timer: number }>();

  channel = DEFAULT_CHANNEL;
  error: MidiError | null = null;
  log: MidiLogEntry[] = [];

  onMessage: ((message: ParsedSysex) => void) | null = null;

  get supported(): boolean {
    return typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;
  }

  get accessGranted(): boolean {
    return this.access !== null;
  }

  get inputId(): string | null {
    return this.input?.id ?? null;
  }

  get outputId(): string | null {
    return this.output?.id ?? null;
  }

  get inputs(): DeviceInfo[] {
    return this.devices('input');
  }

  get outputs(): DeviceInfo[] {
    return this.devices('output');
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  snapshot(): MidiSnapshot {
    return {
      supported: this.supported,
      accessGranted: this.accessGranted,
      inputs: this.inputs,
      outputs: this.outputs,
      inputId: this.inputId,
      outputId: this.outputId,
      error: this.error,
    };
  }

  private devices(kind: 'input' | 'output'): DeviceInfo[] {
    if (!this.access) return [];
    const list =
      kind === 'input' ? this.access.inputs : this.access.outputs;
    const out: DeviceInfo[] = [];
    for (const device of list.values()) {
      if (device.state === 'disconnected') continue;
      out.push({
        id: device.id,
        name: device.name ?? '(unnamed)',
        manufacturer: device.manufacturer ?? '',
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  async init(): Promise<void> {
    this.error = null;
    if (!this.supported) {
      this.error = new MidiError(
        'unsupported',
        'Web MIDI is not available in this browser. Use Chrome or Edge on desktop, and make sure the page is served over https:// or http://localhost.',
      );
      this.emit();
      return;
    }

    try {
      this.access = await navigator.requestMIDIAccess({ sysex: true });
    } catch (cause) {
      this.access = null;
      const name = cause instanceof Error ? cause.name : '';
      if (name === 'SecurityError' || name === 'NotAllowedError') {
        this.error = new MidiError(
          'permission',
          'MIDI access was denied. Allow MIDI/SysEx access for this site (Chrome: Site settings → MIDI) and reload.',
          cause,
        );
      } else {
        this.error = new MidiError(
          'no-device',
          'Could not open MIDI access. Check that the microKORG XL+ is connected over USB and powered on.',
          cause,
        );
      }
      this.emit();
      return;
    }

    this.access.onstatechange = () => {
      this.reconcileDevices();
      this.emit();
    };

    this.autoSelect();
    this.emit();
  }

  private autoSelect(): void {
    if (!this.access) return;
    const all = this.devices('input');
    const match = (d: DeviceInfo) => DEVICE_NAME_PATTERN.test(d.name);
    if (!this.input) {
      const candidate = all.find(match) ?? all[0];
      if (candidate) this.selectInput(candidate.id, false);
    }
    const outs = this.devices('output');
    if (!this.output) {
      const candidate = outs.find(match) ?? outs[0];
      if (candidate) this.selectOutput(candidate.id, false);
    }
  }

  private reconcileDevices(): void {
    if (this.input && this.input.state === 'disconnected') {
      this.detachInput();
      this.input = null;
    }
    if (this.output && this.output.state === 'disconnected') {
      this.output = null;
    }
    this.autoSelect();
  }

  selectInput(id: string | null, notify = true): void {
    this.detachInput();
    this.input = null;
    if (this.access && id) {
      this.input = this.access.inputs.get(id) ?? null;
      if (this.input) {
        this.input.onmidimessage = (event: MIDIMessageEvent) => {
          if (!event.data) return;
          this.handleIncoming(Uint8Array.from(event.data));
        };
      }
    }
    if (notify) this.emit();
  }

  selectOutput(id: string | null, notify = true): void {
    this.output = null;
    if (this.access && id) {
      this.output = this.access.outputs.get(id) ?? null;
    }
    if (notify) this.emit();
  }

  private detachInput(): void {
    if (this.input) this.input.onmidimessage = null;
  }

  private handleIncoming(bytes: Uint8Array): void {
    this.pushLog('in', bytes);
    const parsed = parseSysex(bytes);
    if (parsed) this.onMessage?.(parsed);
  }

  private pushLog(direction: 'in' | 'out', bytes: Uint8Array, note?: string): void {
    this.log = [...this.log.slice(-29), { direction, bytes, note }];
    this.emit();
  }

  private send(bytes: Uint8Array, note?: string): void {
    if (!this.output) {
      throw new MidiError(
        'send-failed',
        'No MIDI output selected. Connect the microKORG XL+ and pick its output port.',
      );
    }
    try {
      this.output.send(bytes);
      this.error = null;
      this.pushLog('out', bytes, note);
    } catch (cause) {
      throw new MidiError(
        'send-failed',
        'The browser could not send the SysEx message to the selected MIDI output.',
        cause,
      );
    }
  }

  requestCurrentProgram(): void {
    this.send(buildCurrentProgramDumpRequest(this.channel), 'dump request');
  }

  writeProgram(programNumber: number): void {
    this.send(
      buildProgramWriteRequest(this.channel, programNumber),
      `write to ${programNumber}`,
    );
  }

  /** Upload program data into the edit buffer (function 0x40). */
  sendCurrentProgram(raw: Uint8Array): void {
    if (raw.length !== PROGRAM_DATA_LENGTH) {
      throw new RangeError(`program must be ${PROGRAM_DATA_LENGTH} bytes, got ${raw.length}`);
    }
    this.send(buildCurrentProgramDump(this.channel, raw), 'edit buffer upload');
  }

  /**
   * Queue a PARAMETER CHANGE. Rapid calls with the same `key` are coalesced
   * over ~16 ms so dragging a slider does not flood the MIDI port.
   */
  setParameterRaw(
    key: string,
    paramId: number,
    subId: number,
    value: number,
    note?: string,
  ): void {
    // Offline editing is allowed; without an output the change stays local.
    if (!this.output) return;
    const existing = this.pending.get(key);
    if (existing) window.clearTimeout(existing.timer);
    const timer = window.setTimeout(() => {
      this.pending.delete(key);
      if (!this.output) return;
      try {
        this.send(
          buildParameterChange(this.channel, paramId, subId, value),
          note ?? `${paramId.toString(16)}:${subId.toString(16)} = ${value}`,
        );
      } catch (error) {
        this.error =
          error instanceof MidiError
            ? error
            : new MidiError('send-failed', String(error));
        this.emit();
      }
    }, THROTTLE_MS);
    this.pending.set(key, { timer });
  }

  setParameter(spec: ParamSpec, value: number): void {
    this.setParameterRaw(
      spec.key,
      spec.paramId,
      spec.subId,
      toWireValue(spec, value),
      `${spec.label} = ${value}`,
    );
  }

  /** Send all 8 characters of a program name (TABLE 1, 00:00..00:07). */
  setProgramName(name: string): void {
    for (let i = 0; i < 8; i++) {
      const code = name.charCodeAt(i);
      const value = Number.isNaN(code) ? 0x20 : code & 0x7f;
      this.setParameterRaw(`name.${i}`, 0x00, i, value, `name[${i}]`);
    }
  }

  hexDump(bytes: Uint8Array): string {
    return toHex(bytes);
  }
}
