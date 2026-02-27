import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Generative UI Playground",
  description: "React-only generative UI platform"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
