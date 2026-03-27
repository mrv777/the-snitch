import type { Metadata } from "next";
import { Syne, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["700", "800"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const siteUrl = process.env.SITE_URL || "https://thesnitch.xyz";

export const metadata: Metadata = {
  title: "The Snitch — On-Chain Forensic Intelligence",
  description:
    "Autonomous on-chain forensic intelligence agent. Detect suspicious trading, trace wallet connections, generate shareable reports. Powered by Nansen.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "The Snitch — On-Chain Forensic Intelligence",
    description:
      "Detect suspicious trading activity. Trace wallet connections. Generate forensic intelligence reports.",
    url: siteUrl,
    siteName: "The Snitch",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "The Snitch — On-Chain Forensic Intelligence",
    description:
      "Detect suspicious trading activity. Trace wallet connections. Generate forensic intelligence reports.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${syne.variable} ${jetbrains.variable}`}>
      <body className="min-h-screen antialiased">
        {children}
        <footer className="border-t border-border px-4 py-6 text-center text-[11px] text-text-dim">
          <p>
            For educational and research purposes only. Not financial or legal
            advice.
          </p>
          <p className="mt-1">
            Powered by{" "}
            <a
              href="https://nansen.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-text-secondary hover:text-accent-green transition-colors"
            >
              Nansen
            </a>
          </p>
        </footer>
      </body>
    </html>
  );
}
