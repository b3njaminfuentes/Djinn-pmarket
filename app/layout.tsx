import type { Metadata } from "next";
import React from "react";
import "./globals.css";
import Footer from "@/components/Footer";
import LayoutWrapper from "@/components/LayoutWrapper";
import { SolanaProvider } from "@/components/SolanaProvider";
import { CategoryProvider } from "@/lib/CategoryContext";
import { ModalProvider } from "@/lib/ModalContext";
import { PriceProvider } from "@/lib/PriceContext";
import { AchievementProvider } from "@/lib/AchievementContext";
import AchievementNotification from "@/components/achievements/AchievementNotification";
import MinecraftAchievement from "@/components/achievements/MinecraftAchievement";
import WalletSuccessModal from "@/components/WalletSuccessModal";
import { SoundProvider } from "@/components/providers/SoundProvider";
import { MotionConfig } from "framer-motion";

export const metadata: Metadata = {
  metadataBase: new URL('https://djinn.markets'),
  title: "Djinn Markets | Prediction Markets on Solana",
  description: "Trade on the future. Create markets, bet on outcomes, earn rewards. The most premium prediction market experience on Solana.",
  keywords: ["prediction markets", "solana", "crypto", "betting", "djinn", "defi", "web3"],
  authors: [{ name: "Djinn Markets" }],
  creator: "Djinn Markets",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://djinn.markets",
    siteName: "Djinn Markets",
    title: "Djinn Markets | Prediction Markets on Solana",
    description: "Trade on the future. Create markets, bet on outcomes, earn rewards.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Djinn Markets - The Future is Priced In",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Djinn Markets | Prediction Markets on Solana",
    description: "Trade on the future. The most premium prediction market experience.",
    images: ["/og-image.png"],
    creator: "@DjinnMarkets",
  },
  icons: {
    icon: [
      { url: '/djinn-logo.png', sizes: 'any', type: 'image/png' },
    ],
    apple: '/djinn-logo.png',
  },
  manifest: "/manifest.json",
};

export const viewport = {
  themeColor: "#000000",
};

import StarBackground from "@/components/ui/StarBackground";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className="antialiased text-white flex flex-col min-h-screen bg-[#050505]"
      >
        <StarBackground />
        <SolanaProvider>
          <React.Suspense fallback={null}>
            <CategoryProvider>
              <AchievementProvider>
                <PriceProvider>
                  <SoundProvider>
                    <MotionConfig transition={{ type: "spring", stiffness: 500, damping: 30, mass: 1 }}>
                      <ModalProvider>
                        <LayoutWrapper>
                          <AchievementNotification />
                          <MinecraftAchievement />
                          <WalletSuccessModal />
                          <main className="flex-grow relative z-10">
                            {children}
                          </main>
                        </LayoutWrapper>
                      </ModalProvider>
                    </MotionConfig>
                  </SoundProvider>
                  <Footer />
                </PriceProvider>
              </AchievementProvider>
            </CategoryProvider>
          </React.Suspense>
        </SolanaProvider>
      </body>
    </html>
  );
}
