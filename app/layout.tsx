import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WFM Breaksheet Dashboard",
  description: "Daily call center operations dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-body bg-ink-950 text-mist-100 antialiased">
        {children}
      </body>
    </html>
  );
}
