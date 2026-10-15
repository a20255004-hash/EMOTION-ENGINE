import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export function IconButton({
  icon,
  label,
  onClick,
  pressed,
  disabled,
  size,
  testId,
}: {
  icon: IconName;
  label: string;
  onClick?: () => void;
  pressed?: boolean;
  disabled?: boolean;
  size?: 'sm';
  testId?: string;
}) {
  return (
    <button
      type="button"
      className={`icon-btn${size === 'sm' ? ' sm' : ''}`}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
    >
      <Icon name={icon} />
    </button>
  );
}

function fmtNum(v: number, step: number) {
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  return v.toFixed(decimals);
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
  onReset,
  modulated,
  hint,
  testId,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
  onReset?: () => void;
  /** Valor efectivo actual si una vinculación de audio lo está modulando. */
  modulated?: number | null;
  hint?: string;
  testId?: string;
}) {
  const id = useId();
  const [text, setText] = useState(fmtNum(value, step));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(fmtNum(value, step));
  }, [value, step, editing]);
  const pct = ((value - min) / (max - min)) * 100;
  const modPct = modulated != null ? ((modulated - min) / (max - min)) * 100 : null;
  const commitText = () => {
    setEditing(false);
    const n = parseFloat(text.replace(',', '.'));
    if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
    else setText(fmtNum(value, step));
  };
  return (
    <div className="slider" title={hint}>
      <label className="slider-label" htmlFor={id} onDoubleClick={onReset}>
        {label}
        {modPct != null && <span className="mod-dot" title="Modulado por audio" />}
      </label>
      <input
        className="slider-value"
        aria-label={`${label} (valor)`}
        value={editing ? text : `${text}${unit ?? ''}`}
        onFocus={() => {
          setEditing(true);
          setText(fmtNum(value, step));
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={commitText}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setText(fmtNum(value, step));
            setEditing(false);
            (e.target as HTMLInputElement).blur();
          }
        }}
        inputMode="decimal"
      />
      <div className="slider-track">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          data-testid={testId}
          style={{ ['--fill' as string]: `${pct}%` }}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          onDoubleClick={onReset}
        />
        {modPct != null && Math.abs(modPct - pct) > 0.3 && (
          <span className="slider-mod" style={{ left: `calc(${Math.min(pct, modPct)}% )`, width: `${Math.abs(modPct - pct)}%` }} />
        )}
      </div>
    </div>
  );
}

export function ColorField({ label, value, onChange, testId }: { label: string; value: string; onChange: (v: string) => void; testId?: string }) {
  const id = useId();
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div className="color-field">
      <label htmlFor={id}>{label}</label>
      <span className="swatch" style={{ background: value }}>
        <input id={id} type="color" value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId} aria-label={label} />
      </span>
      <input
        className="input hex-input"
        aria-label={`${label} (hex)`}
        value={text}
        maxLength={7}
        onChange={(e) => {
          setText(e.target.value);
          if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) onChange(e.target.value.toLowerCase());
        }}
        onBlur={() => setText(value)}
      />
    </div>
  );
}

export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  testId,
  hideLabel,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  testId?: string;
  hideLabel?: boolean;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id} className={hideLabel ? 'sr-only' : undefined}>
        {label}
      </label>
      <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value as T)} data-testid={testId}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Toggle({ label, checked, onChange, testId }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; testId?: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid={testId} />
      <span className="track" />
      <span>{label}</span>
    </label>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Section({ title, children, defaultOpen = true, badge }: { title: string; children: ReactNode; defaultOpen?: boolean; badge?: ReactNode }) {
  return (
    <details className="section" open={defaultOpen}>
      <summary>
        <span>{title}</span>
        {badge}
        <Icon name="chevron" className="chev" />
      </summary>
      <div className="section-body">{children}</div>
    </details>
  );
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'warn' | 'error' | 'ok'; children: ReactNode }) {
  const icon: IconName = kind === 'warn' ? 'warning' : kind === 'error' ? 'warning' : kind === 'ok' ? 'check' : 'info';
  return (
    <div className={`notice ${kind}`} role={kind === 'error' ? 'alert' : undefined}>
      <Icon name={icon} />
      <div>{children}</div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
  children,
}: {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title">
        <h2 id="dlg-title">{title}</h2>
        <p>{message}</p>
        {children}
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" ref={ref} className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} data-testid="confirm-action">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
