import type { Metadata } from "next";
import React, { type ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Generative UI Playground",
  description: "React-only generative UI platform"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
