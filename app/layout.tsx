import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ROOMA — 3D 室内布局设计",
  description: "高性能、实时可交互的 3D 室内空间布局设计工具。",
  openGraph: {
    title: "ROOMA — 3D 室内布局设计",
    description: "高性能、实时可交互的 3D 室内空间布局设计工具。",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "ROOMA 3D 室内布局设计" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ROOMA — 3D 室内布局设计",
    description: "高性能、实时可交互的 3D 室内空间布局设计工具。",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
