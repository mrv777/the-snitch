import type { Metadata } from "next";
import { PredictionBrowser } from "./prediction-browser";

export const metadata: Metadata = {
  title: "Prediction Market Forensics — The Snitch",
  description:
    "Browse recent resolved Polymarket events and investigate insider trading",
};

export default function PredictionBrowserPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <PredictionBrowser />
    </main>
  );
}
