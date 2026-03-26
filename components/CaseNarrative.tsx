import type { AINarrative } from "@/lib/forensics/types";

interface Props {
  narrative: AINarrative;
}

export function CaseNarrative({ narrative }: Props) {
  return (
    <div className="animate-fade-in">
      <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim">
        Intelligence Report
      </p>

      {/* Key findings */}
      {narrative.keyFindings.length > 0 && (
        <div className="mb-4 border-l-2 border-accent-green pl-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-accent-green">
            Key Findings
          </p>
          <ul className="space-y-1">
            {narrative.keyFindings.map((finding, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-text-primary">
                <span className="mt-0.5 text-accent-green">&#9632;</span>
                {finding}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Case narrative */}
      <div className="space-y-3 text-sm text-text-secondary leading-relaxed">
        {narrative.caseNarrative.split("\n\n").map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>

      {/* Shareable line */}
      {narrative.shareableLine && (
        <div className="mt-4 border border-border bg-bg-secondary px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-text-dim mb-1">
            TL;DR
          </p>
          <p className="text-sm text-text-primary italic">
            &ldquo;{narrative.shareableLine}&rdquo;
          </p>
        </div>
      )}
    </div>
  );
}
