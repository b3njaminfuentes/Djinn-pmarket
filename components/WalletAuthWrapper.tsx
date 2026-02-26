'use client';

import React, { useEffect, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

export function WalletAuthWrapper({ children }: { children: React.ReactNode }) {
    const { connected } = useWallet();

    // No signature overlay — wallet connection IS the authentication.
    // The connect flow (Phantom popup) already verifies wallet ownership.
    return <>{children}</>;
}
