import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Playlist Intelligence",
  description: "Turn any YouTube playlist into a structured study plan.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-body antialiased" data-theme="dark">
        {children}
      </body>
    </html>
  );
}
