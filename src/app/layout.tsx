import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "逐光日刊 · HikariDaily",
  description: "为风光、人像与街拍提供当天的天气、太阳时段与摄影建议。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="static">{children}{process.env.NODE_ENV === "development" && <script src="https://mcp.figma.com/mcp/html-to-design/capture.js" async />}</body>
    </html>
  );
}
