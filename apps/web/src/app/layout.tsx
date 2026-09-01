import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 工具工作台",
  description: "发现、组合、下载和回传可交给本地 Agent 使用的 AI 工具。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
