import type { ReactNode } from 'react';
import type { ParamSpec } from '../protocol/params';
import { formatParamValue } from '../protocol/program';

interface ParamControlProps {
  spec: ParamSpec;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}

export function ParamControl({
  spec,
  value,
  disabled,
  onChange,
}: ParamControlProps) {
  const id = `param-${spec.key}`;

  if (spec.kind === 'select' || spec.kind === 'toggle') {
    const options = spec.options ?? [];
    return (
      <div className="param param-select">
        <label htmlFor={id}>{spec.label}</label>
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
        >
          {options.map((option, index) => (
            <option key={option} value={index}>
              {option}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="param">
      <div className="param-head">
        <label htmlFor={id}>{spec.label}</label>
        <output htmlFor={id}>{formatParamValue(spec, value)}</output>
      </div>
      <input
        id={id}
        type="range"
        min={spec.min}
        max={spec.max}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <div className="param-scale">
        <span>{formatParamValue(spec, spec.min)}</span>
        <span>{formatParamValue(spec, spec.max)}</span>
      </div>
    </div>
  );
}

interface SectionCardProps {
  title: string;
  children: ReactNode;
  className?: string;
}

export function SectionCard({ title, children, className }: SectionCardProps) {
  return (
    <section className={`panel ${className ?? ''}`}>
      <h2>{title}</h2>
      <div className="panel-body">{children}</div>
    </section>
  );
}
