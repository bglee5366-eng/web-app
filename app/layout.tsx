import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Meetnote — 회의록 요약",
  description: "회의 전사문을 결정과 실행이 보이는 회의록으로 정리하세요.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
