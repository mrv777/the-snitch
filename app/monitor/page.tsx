import { getRecentMonitorEvents } from "@/lib/cache/queries";
import { getMonitorStats } from "@/lib/monitor/watcher";
import { MonitorDashboard } from "@/components/MonitorDashboard";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Monitor — The Snitch",
  description: "Autonomous on-chain surveillance powered by Nansen",
};

export default function MonitorPage() {
  const events = getRecentMonitorEvents(50);
  const stats = getMonitorStats();

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      {/* Breadcrumb */}
      <div className="mb-8 flex items-center gap-2 text-[11px] text-text-dim">
        <Link href="/" className="hover:text-text-secondary transition-colors">
          The Snitch
        </Link>
        <span>/</span>
        <span className="text-text-secondary">Monitor</span>
      </div>

      {/* Header */}
      <div className="mb-8">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.3em] text-text-dim font-mono">
          Autonomous Surveillance
        </p>
        <h1 className="text-3xl font-extrabold uppercase tracking-tight font-display sm:text-4xl">
          On-Chain{" "}
          <span className="text-accent-green">Monitor</span>
        </h1>
        <p className="mt-3 text-sm text-text-secondary leading-relaxed max-w-lg">
          Real-time smart money tracking, flow analysis, and prediction market
          surveillance. The agent continuously scans for notable on-chain events.
        </p>
      </div>

      {/* Dashboard */}
      <MonitorDashboard initialEvents={events} initialStats={stats} />

      {/* Disclaimer */}
      <p className="mt-8 text-[10px] text-text-dim text-center leading-relaxed">
        Monitor data is pre-seeded and replayed for demonstration purposes.
        Events shown reflect real Nansen data collected during development.
      </p>
    </main>
  );
}
