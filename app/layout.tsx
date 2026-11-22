import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AfroIE Meet — build a life together",
  description:
    "Serious dating for Africans in Ireland and people open to building a life across cultures.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
