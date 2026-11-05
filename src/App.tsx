import { useEffect, useMemo, useRef, useState } from 'react';
import {
  MicrokorgMidi,
  MidiError,
  type MidiSnapshot,
} from './midi/client';
import {
  PARAMS,
  SECTIONS,
  paramsForSection,
  type ParamSection,
  type ParamSpec,
} from './protocol/params';
import {
  decodeProgram,
  emptyProgram,
  programNumberToSlotLabel,
  programSlots,
  readParamValue,
  writeParamValue,
  writeProgramName,
  type ProgramState,
} from './protocol/program';
import { buildCurrentProgramDump, parseSysexFile } from './protocol/sysex';
import { ParamControl, SectionCard } from './ui/controls';

type Tab = 't1' | 't2' | 'program' | 'arp';
type Toast = { kind: 'info' | 'success' | 'error'; text: string };
type WriteStage = 'idle' | 'uploading' | 'writing';
type SourceKind = 'buffer' | 'slot' | 'import';

const SLOTS = programSlots();
const TABS: { id: Tab; label: string }[] = [
  { id: 't1', label: 'Timbre 1' },
  { id: 't2', label: 'Timbre 2' },
  { id: 'program', label: 'Program' },
  { id: 'arp', label: 'Arpeggiator' },
];

function downloadBlob(bytes: Uint8Array, filename: string): void {
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/octet-stream' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function safeFilename(name: string): string {
  const base = name.trim().replace(/[^a-z0-9._-]+/gi, '_') || 'microkorg-program';
  return `${base}.syx`;
}

export default function App() {
  const [midi] = useState(() => new MicrokorgMidi());
  const [snap, setSnap] = useState<MidiSnapshot>(() => midi.snapshot());
  const [channel, setChannel] = useState(1);
  const [program, setProgram] = useState<ProgramState | null>(null);
  const [tab, setTab] = useState<Tab>('t1');
  const [toast, setToast] = useState<Toast | null>(null);
  const [writeOpen, setWriteOpen] = useState(false);
  const [writeSlot, setWriteSlot] = useState(0);
  const [writeStage, setWriteStage] = useState<WriteStage>('idle');
  const [lastWritten, setLastWritten] = useState<string | null>(null);
  const [sourceSlot, setSourceSlot] = useState<number | null>(null);
  const [sourceKind, setSourceKind] = useState<SourceKind>('buffer');
  const [importName, setImportName] = useState<string | null>(null);

  const dumpTimer = useRef<number | undefined>(undefined);
  const writeTimer = useRef<number | undefined>(undefined);
  const stageRef = useRef<WriteStage>('idle');
  const writeSlotRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => midi.subscribe(() => setSnap(midi.snapshot())), [midi]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    midi.onMessage = (message) => {
      if (message.kind === 'programDump') {
        window.clearTimeout(dumpTimer.current);
        setProgram(decodeProgram(message.program));
        setSourceSlot(message.programNumber ?? null);
        setSourceKind(message.programNumber === undefined ? 'buffer' : 'slot');
        setImportName(null);
        setToast({
          kind: 'success',
          text:
            message.programNumber === undefined
              ? 'Current program dump received from the edit buffer.'
              : `Program dump received (${programNumberToSlotLabel(message.programNumber)}).`,
        });
        return;
      }

      if (message.kind === 'ack') {
        switch (message.status) {
          case 'loadOk':
            if (stageRef.current === 'uploading') {
              try {
                midi.writeProgram(writeSlotRef.current);
                stageRef.current = 'writing';
                setWriteStage('writing');
                setToast({
                  kind: 'info',
                  text: `Edit buffer loaded. Writing ${programNumberToSlotLabel(writeSlotRef.current)}…`,
                });
              } catch (error) {
                window.clearTimeout(writeTimer.current);
                stageRef.current = 'idle';
                setWriteStage('idle');
                setToast({
                  kind: 'error',
                  text:
                    error instanceof MidiError
                      ? error.message
                      : `Could not send the write request: ${String(error)}`,
                });
              }
            }
            break;
          case 'writeOk':
            window.clearTimeout(writeTimer.current);
            stageRef.current = 'idle';
            setWriteStage('idle');
            setLastWritten(programNumberToSlotLabel(writeSlotRef.current));
            setToast({
              kind: 'success',
              text: `Program written to ${programNumberToSlotLabel(writeSlotRef.current)}.`,
            });
            break;
          case 'loadError':
            window.clearTimeout(writeTimer.current);
            stageRef.current = 'idle';
            setWriteStage('idle');
            setToast({
              kind: 'error',
              text: 'The synth rejected the edit-buffer upload (load error). Check that SystemEx is ENA and the program is not protected.',
            });
            break;
          case 'writeError':
            window.clearTimeout(writeTimer.current);
            stageRef.current = 'idle';
            setWriteStage('idle');
            setToast({
              kind: 'error',
              text: 'The synth reported a WRITE ERROR (program protected?).',
            });
            break;
          case 'formatError':
            window.clearTimeout(writeTimer.current);
            stageRef.current = 'idle';
            setWriteStage('idle');
            setToast({
              kind: 'error',
              text: 'The synth reported a DATA FORMAT ERROR — the SysEx payload was rejected.',
            });
            break;
        }
      }
    };
    return () => {
      midi.onMessage = null;
    };
  }, [midi]);

  useEffect(() => {
    return () => {
      window.clearTimeout(dumpTimer.current);
      window.clearTimeout(writeTimer.current);
    };
  }, []);

  const isKorgPort = (name: string) => /micro\s*korg|korg/i.test(name);
  const hasKorgPort =
    snap.inputs.some((device) => isKorgPort(device.name)) ||
    snap.outputs.some((device) => isKorgPort(device.name));
  const canSend = Boolean(snap.outputId);

  async function handleConnect(): Promise<void> {
    setToast({ kind: 'info', text: 'Requesting MIDI access (SysEx)…' });
    await midi.init();
    const error = midi.error;
    if (error) {
      setToast({ kind: 'error', text: error.message });
      return;
    }
    if (midi.inputs.length === 0 && midi.outputs.length === 0) {
      setToast({
        kind: 'error',
        text: 'MIDI access granted, but no MIDI ports were found. Connect the microKORG XL+ by USB, power it on, then reconnect.',
      });
      return;
    }
    const anyKorg = [...midi.inputs, ...midi.outputs].some((device) =>
      isKorgPort(device.name),
    );
    if (!anyKorg) {
      setToast({
        kind: 'info',
        text: 'MIDI access granted, but no port matched "KORG". Pick the microKORG ports manually below.',
      });
      return;
    }
    setToast({ kind: 'success', text: 'Connected. Now request the current program.' });
  }

  function handleDump(): void {
    if (!canSend) {
      setToast({ kind: 'error', text: 'Select a MIDI output first.' });
      return;
    }
    try {
      midi.requestCurrentProgram();
      window.clearTimeout(dumpTimer.current);
      dumpTimer.current = window.setTimeout(() => {
        setToast({
          kind: 'error',
          text: 'No program dump arrived. Check the cable, the selected ports, and that MIDI FILTER → SystemEx is ENA on the synth.',
        });
      }, 3500);
      setToast({ kind: 'info', text: 'Program dump requested…' });
    } catch (error) {
      setToast({
        kind: 'error',
        text: error instanceof MidiError ? error.message : String(error),
      });
    }
  }

  function handleParamChange(spec: ParamSpec, value: number): void {
    setProgram((previous) =>
      previous ? decodeProgram(writeParamValue(previous.raw, spec, value)) : previous,
    );
    midi.setParameter(spec, value);
  }

  function handleNameInput(name: string): void {
    const clean = name.replace(/[^\x20-\x7e]/g, '').slice(0, 8);
    setProgram((previous) =>
      previous
        ? { ...previous, name: clean, raw: writeProgramName(previous.raw, clean) }
        : previous,
    );
  }

  function handleNameCommit(): void {
    if (program) midi.setProgramName(program.name);
  }

  function handleExport(): void {
    if (!program) return;
    const bytes = buildCurrentProgramDump(midi.channel, program.raw);
    downloadBlob(bytes, safeFilename(program.name));
    setToast({
      kind: 'success',
      text: `Exported ${bytes.length} bytes of SysEx (CURRENT PROGRAM DATA DUMP).`,
    });
  }

  async function handleImport(file: File): Promise<void> {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const messages = parseSysexFile(bytes);
      const dump = messages.find((message) => message.kind === 'programDump');
      if (!dump || dump.kind !== 'programDump') {
        setToast({
          kind: 'error',
          text: 'No microKORG XL program dump found in that file (expected F0 42 3n 7E 40/4C … F7).',
        });
        return;
      }
      setProgram(decodeProgram(dump.program));
      setSourceSlot(dump.programNumber ?? null);
      setSourceKind('import');
      setImportName(file.name);
      setToast({
        kind: 'success',
        text: `Loaded ${file.name}. It is in the editor only — use "Send to synth" to hear it.`,
      });
    } catch (error) {
      setToast({ kind: 'error', text: `Could not read the file: ${String(error)}` });
    }
  }

  function handleSendToSynth(): void {
    if (!program) return;
    try {
      midi.sendCurrentProgram(program.raw);
      setToast({
        kind: 'success',
        text: 'Edit buffer uploaded to the synth. Store it with "Write to slot" when ready.',
      });
    } catch (error) {
      setToast({
        kind: 'error',
        text: error instanceof MidiError ? error.message : String(error),
      });
    }
  }

  function openWriteDialog(): void {
    if (!program) return;
    setWriteSlot(0);
    setWriteOpen(true);
  }

  function confirmWrite(): void {
    if (!program) return;
    writeSlotRef.current = writeSlot;
    stageRef.current = 'uploading';
    setWriteStage('uploading');
    setWriteOpen(false);
    try {
      midi.sendCurrentProgram(program.raw);
    } catch (error) {
      stageRef.current = 'idle';
      setWriteStage('idle');
      setToast({
        kind: 'error',
        text: error instanceof MidiError ? error.message : String(error),
      });
      return;
    }
    setToast({
      kind: 'info',
      text: `Uploading edit buffer, then writing ${programNumberToSlotLabel(writeSlot)}…`,
    });
    window.clearTimeout(writeTimer.current);
    writeTimer.current = window.setTimeout(() => {
      if (stageRef.current !== 'idle') {
        stageRef.current = 'idle';
        setWriteStage('idle');
        setToast({
          kind: 'error',
          text: 'The write did not complete — no ACK received. Select a MIDI input for acknowledgements and confirm SystemEx is ENA.',
        });
      }
    }, 5000);
  }

  const visibleSections = useMemo(() => {
    if (tab === 'program') {
      return SECTIONS.filter((section) => section.id === 'programVoice');
    }
    if (tab === 'arp') {
      return SECTIONS.filter((section) => section.id === 'arpeggiator');
    }
    return SECTIONS.filter((section) => section.timbre === 1);
  }, [tab]);

  const activeTimbre = tab === 't2' ? 2 : 1;
  const controlsDisabled = writeStage !== 'idle';

  function renderSection(section: ParamSection) {
    const timbre = section.timbre === 0 ? 0 : activeTimbre;
    const specs = paramsForSection(section.id, timbre);
    if (!program) return null;
    return (
      <SectionCard
        key={`${section.id}-${timbre}`}
        title={section.label}
        className={section.id === 'patch' ? 'panel-wide' : undefined}
      >
        {specs.map((spec) => (
          <ParamControl
            key={spec.key}
            spec={spec}
            value={program.values[spec.key] ?? readParamValue(program.raw, spec)}
            disabled={controlsDisabled}
            onChange={(value) => handleParamChange(spec, value)}
          />
        ))}
      </SectionCard>
    );
  }

  const slotLabel = lastWritten ?? '—';
  const sourceLabel =
    sourceKind === 'slot' && sourceSlot !== null
      ? `Stored program ${programNumberToSlotLabel(sourceSlot)}`
      : sourceKind === 'import' && importName
        ? `Imported file ${importName}`
        : 'Edit buffer (slot not reported by the synth)';

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <h1>
            microKORG <span>XL+</span> Editor
          </h1>
          <p>Web MIDI sound editor · class-compliant USB-MIDI · no Korg driver</p>
        </div>
        <div className={`status status-${snap.error ? 'error' : snap.accessGranted ? 'ok' : 'idle'}`}>
          <span className="dot" aria-hidden="true" />
          <div>
            <strong>
              {snap.error
                ? 'MIDI error'
                : snap.accessGranted
                  ? hasKorgPort
                    ? 'microKORG detected'
                    : 'MIDI ready'
                  : 'Not connected'}
            </strong>
            <small>
              {snap.inputId ? 'in: ' + (snap.inputs.find((d) => d.id === snap.inputId)?.name ?? '—') : 'no input'}
              {' · '}
              {snap.outputId ? 'out: ' + (snap.outputs.find((d) => d.id === snap.outputId)?.name ?? '—') : 'no output'}
            </small>
          </div>
        </div>
      </header>

      {!snap.supported && (
        <div className="alert alert-error">
          Web MIDI is not available. Use desktop Chrome or Edge over https:// or
          http://localhost.
        </div>
      )}

      {snap.error && (
        <div className="alert alert-error" role="alert">
          {snap.error.message}
        </div>
      )}

      <section className="card connection">
        <div className="connection-actions">
          <button className="primary" type="button" onClick={() => void handleConnect()}>
            {snap.accessGranted ? 'Re-scan MIDI' : 'Connect MIDI'}
          </button>
          <span className="hint">
            Chrome/Edge will ask for MIDI (SysEx) permission.
          </span>
        </div>

        <div className="field-grid">
          <label>
            MIDI input
            <select
              value={snap.inputId ?? ''}
              disabled={!snap.accessGranted}
              onChange={(event) => midi.selectInput(event.target.value || null)}
            >
              <option value="">— none —</option>
              {snap.inputs.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            MIDI output
            <select
              value={snap.outputId ?? ''}
              disabled={!snap.accessGranted}
              onChange={(event) => midi.selectOutput(event.target.value || null)}
            >
              <option value="">— none —</option>
              {snap.outputs.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Global MIDI channel
            <select
              value={channel}
              onChange={(event) => {
                const next = Number(event.target.value);
                setChannel(next);
                midi.channel = next - 1;
              }}
            >
              {Array.from({ length: 16 }, (_, index) => (
                <option key={index + 1} value={index + 1}>
                  {index + 1}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="toolbar" aria-label="Program actions">
        <button type="button" className="primary" disabled={!canSend} onClick={handleDump}>
          Dump current program
        </button>
        <button type="button" disabled={!program} onClick={handleExport}>
          Export .syx
        </button>
        <button
          type="button"
          disabled={!program}
          onClick={() => fileInputRef.current?.click()}
        >
          Import .syx
        </button>
        <button type="button" disabled={!program || !canSend} onClick={handleSendToSynth}>
          Send to synth
        </button>
        <button
          type="button"
          className="danger"
          disabled={!program || !canSend || writeStage !== 'idle'}
          onClick={openWriteDialog}
        >
          Write to slot…
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".syx,application/octet-stream"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleImport(file);
            event.target.value = '';
          }}
        />
      </section>

      {!program ? (
        <section className="empty-state">
          <h2>No program loaded</h2>
          <p>
            Connect the microKORG XL+, select its MIDI input and output, then press
            <strong> Dump current program</strong>. The editor reads the edit buffer
            (function <code>10</code> → <code>40</code>) and shows every parameter from
            TABLE 1/2/5/6 of the MIDI implementation.
          </p>
          <p className="hint">
            On the synth: MIDI FILTER → <strong>SystemEx = ENA</strong>, otherwise all
            SysEx is ignored.
          </p>
          <button type="button" className="ghost" onClick={() => setProgram(decodeProgram(emptyProgram()))}>
            Start with a blank program (offline)
          </button>
        </section>
      ) : (
        <>
          <section className="card program-bar">
            <div className="program-name">
              <label htmlFor="program-name">Program name</label>
              <input
                id="program-name"
                value={program.name}
                maxLength={8}
                spellCheck={false}
                onChange={(event) => handleNameInput(event.target.value)}
                onBlur={handleNameCommit}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
              />
            </div>
            <div className="program-meta">
              <span title="The current-program dump does not include the slot number">
                Source: {sourceLabel}
              </span>
              <span>Last written: {slotLabel}</span>
              {writeStage !== 'idle' && (
                <span className="working">
                  {writeStage === 'uploading' ? 'Uploading edit buffer…' : 'Writing slot…'}
                </span>
              )}
            </div>
            <nav className="tabs" aria-label="Editor pages">
              {TABS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={tab === entry.id ? 'tab active' : 'tab'}
                  aria-selected={tab === entry.id}
                  onClick={() => setTab(entry.id)}
                >
                  {entry.label}
                </button>
              ))}
            </nav>
          </section>

          <main className="panels">
            {visibleSections.map(renderSection)}
          </main>

          <section className="card counts">
            <span>
              {PARAMS.length} parameters mapped · {program.raw.length} byte program
              dump · {visibleSections.reduce((n, section) => n + paramsForSection(section.id, section.timbre === 0 ? 0 : activeTimbre).length, 0)}{' '}
              controls on this page
            </span>
          </section>
        </>
      )}

      <details className="card notes">
        <summary>Hardware &amp; protocol notes</summary>
        <ul>
          <li>
            <strong>SystemEx must be ENA</strong> on the synth (MIDI FILTER → SystemEx),
            or program dumps and parameter changes are ignored.
          </li>
          <li>
            Windows 11: use the built-in class-compliant USB-MIDI driver. Do{' '}
            <strong>not</strong> install the old Korg USB-MIDI driver.
          </li>
          <li>
            Live edits are PARAMETER CHANGE messages (function <code>41</code>), so they
            affect the edit buffer immediately. They are not stored until you write a slot.
          </li>
          <li>
            "Write to slot" uploads the editor's 342-byte program to the edit buffer
            (function <code>40</code>), waits for ACK <code>23</code>, then sends PROGRAM
            WRITE (function <code>11</code>). Nothing is written without confirmation.
          </li>
          <li>
            The microKORG XL+ has no separate MIDI implementation document. This editor
            assumes XL SysEx compatibility; verify on hardware.
          </li>
          <li>
            Value formatting is based on the TABLE footnotes; LFO rate, EQ frequency and a
            few non-linear curves are shown as raw indices rather than guessed units.
          </li>
        </ul>
      </details>

      <details className="card log">
        <summary>SysEx monitor ({midi.log.length})</summary>
        <ol className="log-list">
          {midi.log
            .slice()
            .reverse()
            .map((entry, index) => (
              <li key={`${index}-${entry.bytes.length}`}>
                <span className={`dir dir-${entry.direction}`}>
                  {entry.direction === 'in' ? 'IN' : 'OUT'}
                </span>
                <code>{midi.hexDump(entry.bytes)}</code>
                {entry.note && <em>{entry.note}</em>}
              </li>
            ))}
          {midi.log.length === 0 && <li className="hint">No messages yet.</li>}
        </ol>
      </details>

      {writeOpen && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="write-title">
            <h2 id="write-title">Write edit buffer to a program slot</h2>
            <p>
              This <strong>overwrites</strong> the selected program on the synthesizer.
              It cannot be undone from this editor.
            </p>
            <label className="modal-field">
              Destination slot
              <select
                value={writeSlot}
                onChange={(event) => setWriteSlot(Number(event.target.value))}
              >
                {SLOTS.map((slot) => (
                  <option key={slot.number} value={slot.number}>
                    {slot.label}
                  </option>
                ))}
              </select>
            </label>
            {!snap.inputId && (
              <p className="alert alert-warn">
                No MIDI input is selected, so the write acknowledgement cannot be read.
              </p>
            )}
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => setWriteOpen(false)}>
                Cancel
              </button>
              <button type="button" className="danger" onClick={confirmWrite}>
                Write {programNumberToSlotLabel(writeSlot)}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`toast toast-${toast.kind}`} role="status">
          {toast.text}
        </div>
      )}

      <footer className="footer">
        <span>
          Protocol: Korg microKORG XL MIDI Implementation Rev 1.01 (2009.04.27).
        </span>
        <span>
          {PARAMS.length} mapped parameters · 7-bit packed program dump · live edits via
          PARAMETER CHANGE (41)
        </span>
      </footer>
    </div>
  );
}
