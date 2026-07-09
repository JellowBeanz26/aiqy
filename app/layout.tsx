import type { Metadata } from "next";
import "./globals.css";
import "./ui.css";

export const metadata: Metadata = {
  title: "AIQY// — Agent Studio",
  description: "Describe an agent in plain language. AIQY builds and runs a real durable agent on your own model.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
