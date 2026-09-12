import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import AuthHydration from "./providers/AuthHydration";
import AuthProvider from "./providers/AuthProvider";
import { ThemeProvider } from "./context/ThemeContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Schoolix - School Management System",
  description: "Schoolix is a school management system that helps schools manage their operations more efficiently.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AuthHydration>
          <AuthProvider>
            <ThemeProvider>
              <Toaster />
              {children}
            </ThemeProvider>
          </AuthProvider>
        </AuthHydration>
      </body>
    </html>
  );
}