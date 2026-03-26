"use client";

export type InvestigationMode = "token" | "prediction" | "monitor";

interface Props {
  selected: InvestigationMode;
  onChange: (mode: InvestigationMode) => void;
}

const MODES: { id: InvestigationMode; label: string; description: string }[] = [
  {
    id: "token",
    label: "Token Forensics",
    description: "Investigate suspicious token price movements",
  },
  {
    id: "prediction",
    label: "Prediction Market",
    description: "Analyze Polymarket event profiteers",
  },
  {
    id: "monitor",
    label: "Monitor",
    description: "Autonomous on-chain surveillance",
  },
];

export function ModeSelector({ selected, onChange }: Props) {
  return (
    <div className="flex gap-1 border border-border bg-bg-secondary p-1">
      {MODES.map((mode) => (
        <button
          key={mode.id}
          onClick={() => onChange(mode.id)}
          className={`flex-1 px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all ${
            selected === mode.id
              ? "bg-bg-primary text-accent-green"
              : "text-text-dim hover:text-text-secondary"
          }`}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}
