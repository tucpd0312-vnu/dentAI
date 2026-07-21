import type { Metadata } from "next";
import "./globals.css";
import "primereact/resources/themes/lara-light-blue/theme.css";
import "primeicons/primeicons.css";

export const metadata: Metadata = {
  title: "DentAI - Chẩn đoán viêm lợi",
  description: "Hệ thống AI hỗ trợ chẩn đoán viêm lợi từ ảnh nội nha",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
