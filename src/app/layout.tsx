import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kiosk",
  description: "Publish AI-generated HTML to a public shareable link",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
