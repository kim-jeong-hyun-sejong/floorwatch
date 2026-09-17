import type { Metadata } from "next";
import "./globals.css";
import "./upgrade.css";

export const metadata: Metadata = {
  title: "FloorWatch | 층별 사람 감지 현황",
  description: "A동 1~30층 카메라의 사람 감지 현황",
  openGraph: {
    title: "FloorWatch | 층별 사람 감지 현황",
    description: "A동 1~30층 카메라의 사람 감지 현황",
    siteName: "FloorWatch",
    type: "website",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
