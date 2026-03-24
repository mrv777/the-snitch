import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Snitch — On-Chain Forensic Intelligence",
  description:
    "Autonomous on-chain forensic intelligence agent. Detect suspicious trading, trace wallet connections, generate shareable reports.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
