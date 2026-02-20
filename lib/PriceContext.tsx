'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

interface PriceContextType {
    solPrice: number;
}

const PriceContext = createContext<PriceContextType | undefined>(undefined);

export function PriceProvider({ children }: { children: React.ReactNode }) {
    const [solPrice, setSolPrice] = useState<number>(0); // Start at 0 to indicate loading

    const fetchPrice = async () => {
        try {
            // 1. Try Binance API (Matches Chart for consistency)
            const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT');

            if (!res.ok) {
                console.warn(`Binance Price API returned ${res.status}. Falling back...`);
                throw new Error("Binance failed");
            }

            const data = await res.json();
            const price = data?.price;
            if (price) {
                setSolPrice(parseFloat(price));
                return;
            }
            throw new Error("Binance data invalid");
        } catch (error) {
            // 2. Fallback to Jupiter
            try {
                const res = await fetch('https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112');
                if (!res.ok) throw new Error("Jupiter failed");
                const data = await res.json();
                const price = data?.data?.['So11111111111111111111111111111111111111112']?.price;
                if (price) {
                    setSolPrice(parseFloat(price));
                }
            } catch (e) {
                console.warn('All price APIs failed, using last known or $0');
            }
        }
    };

    useEffect(() => {
        fetchPrice();
        const interval = setInterval(fetchPrice, 30000); // Update every 30s
        return () => clearInterval(interval);
    }, []);

    return (
        <PriceContext.Provider value={{ solPrice }}>
            {children}
        </PriceContext.Provider>
    );
}

export function usePrice() {
    const context = useContext(PriceContext);
    if (context === undefined) {
        throw new Error('usePrice must be used within a PriceProvider');
    }
    return context;
}
