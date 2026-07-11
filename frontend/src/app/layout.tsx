import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AR Memory Companion",
  description: "AR memory companion for people with dementia (hackathon MVP)",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
