"use client";

export type InvestigationMode = "token" | "prediction" | "monitor";

interface Props {
  selected: InvestigationMode;
  onChange: (mode: InvestigationMode) => void;
}

const MODES: { id: InvestigationMode; label: string; disabled?: boolean }[] = [
  {
    id: "token",
    label: "Token Forensics",
  },
  {
    id: "prediction",
    label: "Prediction Market",
    disabled: true,
  },
  {
    id: "monitor",
    label: "Monitor",
    disabled: true,
  },
];

export function ModeSelector({ selected, onChange }: Props) {
  return (
    <div className="flex gap-1 border border-border bg-bg-secondary p-1">
      {MODES.map((mode) => (
        <button
          key={mode.id}
          onClick={() => !mode.disabled && onChange(mode.id)}
          disabled={mode.disabled}
          className={`flex-1 px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all ${
            mode.disabled
              ? "text-text-dim/40 cursor-not-allowed"
              : selected === mode.id
                ? "bg-bg-primary text-accent-green"
                : "text-text-dim hover:text-text-secondary"
          }`}
        >
          {mode.label}
          {mode.disabled && <span className="ml-1 text-[9px] normal-case tracking-normal opacity-60">Soon</span>}
        </button>
      ))}
    </div>
  );
}
