import React from "react";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

/* eslint-disable @typescript-eslint/no-unused-vars */
const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });
/* eslint-enable @typescript-eslint/no-unused-vars */

const basePath = process.env.BASE_PATH?.replace(/\/$/, "") ?? "";

function withBasePath(path: string) {
  return `${basePath}${path}`;
}

export const metadata: Metadata = {
  title: "Maestro - Container Management",
  description: "Orchestrate your containers with Maestro",
  generator: "v0.app",
  icons: {
    icon: withBasePath("/favicon.ico"),
    apple: withBasePath("/favicon.ico"),
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`font-sans antialiased`}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
