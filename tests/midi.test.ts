import { afterEach, describe, expect, it, vi } from 'vitest';
import { MicrokorgMidi } from '../src/midi/client';
import { buildCurrentProgramDump, toHex } from '../src/protocol/sysex';
import { syntheticProgramBytes } from './fixtures/synthetic-program';

class FakeInput {
  state = 'connected';
  onmidimessage: ((event: { data: Uint8Array }) => void) | null = null;
  constructor(
    readonly id: string,
    readonly name: string,
    readonly manufacturer = 'KORG',
  ) {}
  emit(data: Uint8Array): void {
    this.onmidimessage?.({ data });
  }
}

class FakeOutput {
  state = 'connected';
  sent: Uint8Array[] = [];
  constructor(
    readonly id: string,
    readonly name: string,
    readonly manufacturer = 'KORG',
  ) {}
  send(data: Iterable<number>): void {
    this.sent.push(Uint8Array.from(data));
  }
}

function fakeAccess(inputs: FakeInput[], outputs: FakeOutput[]) {
  return {
    inputs: new Map(inputs.map((port) => [port.id, port])),
    outputs: new Map(outputs.map((port) => [port.id, port])),
    onstatechange: null,
    sysexEnabled: true,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MicrokorgMidi', () => {
  it('requests SysEx access and prefers KORG-named ports', async () => {
    const other = new FakeInput('in-other', 'Generic Keyboard', 'Acme');
    const korg = new FakeInput('in-korg', 'microKORG XL+');
    const otherOut = new FakeOutput('out-other', 'Generic Keyboard', 'Acme');
    const korgOut = new FakeOutput('out-korg', 'microKORG XL+');
    const access = fakeAccess([other, korg], [otherOut, korgOut]);

    const request = vi.fn(async () => access);
    vi.stubGlobal('navigator', { requestMIDIAccess: request });

    const midi = new MicrokorgMidi();
    await midi.init();

    expect(request).toHaveBeenCalledWith({ sysex: true });
    expect(midi.error).toBeNull();
    expect(midi.inputId).toBe('in-korg');
    expect(midi.outputId).toBe('out-korg');
    expect(midi.inputs.map((device) => device.name)).toEqual([
      'Generic Keyboard',
      'microKORG XL+',
    ]);
  });

  it('sends the current-program dump request on the selected channel', async () => {
    const output = new FakeOutput('out-korg', 'microKORG XL+');
    vi.stubGlobal('navigator', {
      requestMIDIAccess: vi.fn(async () => fakeAccess([], [output])),
    });

    const midi = new MicrokorgMidi();
    await midi.init();
    midi.channel = 2;
    midi.requestCurrentProgram();

    expect(output.sent).toHaveLength(1);
    expect(toHex(output.sent[0])).toBe('F0 42 32 7E 10 F7');
  });

  it('parses incoming microKORG SysEx and forwards it', async () => {
    const input = new FakeInput('in-korg', 'microKORG XL+');
    vi.stubGlobal('navigator', {
      requestMIDIAccess: vi.fn(async () => fakeAccess([input], [])),
    });

    const midi = new MicrokorgMidi();
    await midi.init();
    const received: string[] = [];
    midi.onMessage = (message) => received.push(message.kind);

    input.emit(buildCurrentProgramDump(0, syntheticProgramBytes()));
    input.emit(Uint8Array.from([0xf0, 0x41, 0x30, 0x7e, 0x40, 0xf7]));

    expect(received).toEqual(['programDump']);
    expect(midi.log.filter((entry) => entry.direction === 'in')).toHaveLength(2);
  });

  it('reports a permission error clearly', async () => {
    const denied = new Error('denied');
    denied.name = 'SecurityError';
    vi.stubGlobal('navigator', {
      requestMIDIAccess: vi.fn(async () => {
        throw denied;
      }),
    });

    const midi = new MicrokorgMidi();
    await midi.init();

    expect(midi.error?.code).toBe('permission');
    expect(midi.error?.message).toMatch(/denied/i);
  });

  it('reports unsupported browsers without throwing', async () => {
    vi.stubGlobal('navigator', {});
    const midi = new MicrokorgMidi();
    await midi.init();
    expect(midi.error?.code).toBe('unsupported');
  });
});
