import { supabase } from './supabase';

export const ADMIN_WALLETS = [
    "C31JQfZBVRsnvFqiNptD95rvbEx8fsuPwdZn62yEWx9X",
    "G1NaEsx5Pg7dSmyYy6Jfraa74b7nTbmN9A9NuiK171Ma",
    "6Jg8mGGywg758CDvywz8QnshCJNvBJzXvYWdYZ4YNznH"
];

// Límite de Genesis: Solo los primeros 1000 usuarios reciben la medalla
export const GENESIS_LIMIT = 1000;

export interface WhitelistStatus {
    count: number;
    isFull: boolean;
    isRegistered: boolean;
    isAdmin: boolean;
}

/**
 * Checks the current status of the whitelist for a given wallet address.
 */
export async function getWhitelistStatus(walletAddress?: string): Promise<WhitelistStatus> {
    const isAdmin = walletAddress ? ADMIN_WALLETS.includes(walletAddress) : false;

    // Get current count
    let currentCount = 0;
    try {
        const { count, error: countError } = await supabase
            .from('genesis_whitelist')
            .select('*', { count: 'exact', head: true });

        if (countError) {
            console.warn('[Whitelist] Supabase Count Error (using fallback):', countError.message);
        } else {
            currentCount = count || 0;
        }
    } catch (e) {
        console.warn('[Whitelist] Supabase Exception (using fallback):', e);
    }

    // Check if user is already registered (fallback: ALLOW IF ERROR)
    // If we can't check the whitelist, we assume the user is allowed in for Devnet/Test purposes
    // rather than locking them out.
    let isRegistered = false;

    if (walletAddress) {
        try {
            const { data, error: regError } = await supabase
                .from('genesis_whitelist')
                .select('wallet_address')
                .eq('wallet_address', walletAddress)
                .single();

            if (data) {
                isRegistered = true;
            } else if (regError && regError.code === 'PGRST116') {
                // Not found, correct behavior
                isRegistered = false;
            } else if (regError) {
                console.error('[Whitelist] Supabase Check Error (Fail Closed):', regError.message);
                // FAIL CLOSED: If DB is broken, deny access to protect whitelist integrity
                isRegistered = false;
            }
        } catch (e) {
            console.error('[Whitelist] Exception (Fail Closed):', e);
            isRegistered = false;
        }
    }

    return {
        count: currentCount,
        isFull: currentCount >= GENESIS_LIMIT,
        isRegistered,
        isAdmin
    };
}

/**
 * Registers a wallet for the Genesis whitelist.
 */
export async function registerForWhitelist(walletAddress: string): Promise<{ success: boolean; message: string }> {
    const status = await getWhitelistStatus(walletAddress);

    if (status.isAdmin) {
        return { success: true, message: "WELCOME BACK, ARCHITECT" };
    }

    if (status.isRegistered) {
        return { success: true, message: "WELCOME BACK, GENESIS USER" };
    }

    if (status.isFull) {
        return { success: false, message: "SPOTS FULL. THANK YOU STAY TUNED FOR UPDATES" };
    }

    const { error } = await supabase
        .from('genesis_whitelist')
        .insert([{ wallet_address: walletAddress }]); // Schema updated to only wallet_address

    if (error) {
        console.error('[Whitelist] Registration error:', error);
        return { success: false, message: "ERROR CLAIMING SPOT. TRY AGAIN." };
    }

    return { success: true, message: "GENESIS SPOT SECURED. WELCOME TO DJINN." };
}
/**
 * Checks if a wallet is one of the first 1000 Genesis members.
 */
export async function isGenesisMember(walletAddress: string): Promise<boolean> {
    try {
        // Query only the first 1000 records ordered by creation
        // and check if this wallet is among them.
        const { data, error } = await supabase
            .from('genesis_whitelist')
            .select('wallet_address')
            .order('created_at', { ascending: true })
            .limit(GENESIS_LIMIT);

        if (error) throw error;

        return data?.some(row => row.wallet_address === walletAddress) || false;
    } catch (e) {
        console.error('[Whitelist] isGenesisMember error:', e);
        return false;
    }
}
