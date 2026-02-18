import { supabase } from './supabase';
import { withRetry } from './supabase-retry';
import { getSpotPrice } from './core-amm';

// ============================================
// STORAGE (Images)
// ============================================

/**
 * Upload image to Supabase Storage
 * @param file - File object or base64 string
 * @param bucket - Storage bucket name (default: 'comment-images')
 * @returns Public URL of uploaded image or null if failed
 */
export async function uploadImage(
    file: File | string,
    bucket: string = 'comment-images'
): Promise<string | null> {
    try {
        let fileToUpload: File;
        let fileName: string;

        // Handle base64 string input
        if (typeof file === 'string' && file.startsWith('data:')) {
            const base64Data = file.split(',')[1];
            const mimeType = file.match(/data:([^;]+);/)?.[1] || 'image/png';
            const extension = mimeType.split('/')[1] || 'png';

            // Convert base64 to blob
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: mimeType });

            fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${extension}`;
            fileToUpload = new File([blob], fileName, { type: mimeType });
        } else if (file instanceof File) {
            // Handle File object
            const extension = file.name.split('.').pop() || 'png';
            fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${extension}`;
            fileToUpload = file;
        } else {
            console.error('Invalid file input:', typeof file);
            return null;
        }

        // Upload to Supabase Storage
        const { data, error } = await supabase.storage
            .from(bucket)
            .upload(fileName, fileToUpload, {
                cacheControl: '3600',
                upsert: false
            });

        if (error) {
            console.error('Supabase Storage Upload Error:', error);
            return null;
        }

        // Get public URL
        const { data: publicUrlData } = supabase.storage
            .from(bucket)
            .getPublicUrl(fileName);

        return publicUrlData.publicUrl;
    } catch (error) {
        console.error('Image upload failed:', error);
        return null;
    }
}

// ============================================
// PROFILES
// ============================================

export interface Profile {
    id?: string;
    wallet_address: string;
    username: string;
    bio: string;
    avatar_url: string | null;
    banner_url: string | null;
    created_at?: string;
    views?: number;
    gems?: number;
    twitter?: string;
    discord?: string;
    user_number?: number;
    tier?: 'FOUNDER' | 'REFERRAL' | 'WAITLIST';
    has_access?: boolean;
    has_genesis_gem?: boolean;
    referral_code?: string;
    referred_by?: string | null;
    share_count?: number;
}

// Local Mode: Desactivado para producción
const LOCAL_MODE = false;

const MOCK_PROFILE: Profile = {
    wallet_address: '',
    username: 'GhostTrader',
    bio: 'Local Mode Activado (Supabase Quota Exceeded)',
    avatar_url: '/pink-pfp.png',
    banner_url: '/default-banner-v2.png',
    created_at: new Date().toISOString(),
    views: 42,
    gems: 0
};

export async function getProfile(walletAddress: string): Promise<Profile | null> {
    if (LOCAL_MODE) {
        console.warn(`[Local Mode] Returning mock profile for ${walletAddress}`);
        return { ...MOCK_PROFILE, wallet_address: walletAddress, username: `LocalUser-${walletAddress.slice(0, 4)}` };
    }

    return withRetry(async () => {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('wallet_address', walletAddress)
            .single();

        if (error && error.code !== 'PGRST116') {
            throw error;
        }
        return data;
    }, `getProfile(${walletAddress})`);
}

export async function getProfileByUsername(username: string): Promise<Profile | null> {
    return withRetry(async () => {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            // Case-insensitive search
            .ilike('username', username)
            .single();

        if (error && error.code !== 'PGRST116') {
            // If strictly not found, it's fine
            return null;
        }
        return data;
    }, `getProfileByUsername(${username})`);
}

export async function isUsernameAvailable(username: string, excludeWallet?: string): Promise<boolean> {
    if (!username || username.length < 3) return false;

    try {
        // 1. Find who has this username (if anyone)
        const { data, error } = await supabase
            .from('profiles')
            .select('wallet_address')
            .ilike('username', username)
            .maybeSingle();

        if (error) {
            console.error('Error checking username availability:', error);
            // En caso de error de conexión, permitir (optimista)
            return true;
        }

        // 2. If no one has it, it's available
        if (!data) return true;

        // 3. If someone has it, check if it's ME (Case Insensitive for safety)
        if (excludeWallet && data.wallet_address.toLowerCase() === excludeWallet.toLowerCase()) {
            return true; // It's mine, so I can "keep" it
        }

        // 4. Taken by someone else
        return false;
    } catch (e) {
        console.error('Exception checking username:', e);
        // En caso de excepción, permitir
        return true;
    }
}

export async function upsertProfile(profile: Partial<Profile> & { wallet_address: string }): Promise<Profile | null> {
    const walletAddress = profile.wallet_address;
    const toUpsert = {
        ...profile
    };
    // Only add defaults if it's potentially a new profile and fields are missing
    if (!toUpsert.username) toUpsert.username = `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;
    if (!toUpsert.avatar_url) toUpsert.avatar_url = '/pink-pfp.png';
    if (!toUpsert.banner_url) toUpsert.banner_url = '/default-banner-v2.png';
    if (!toUpsert.bio) toUpsert.bio = 'New Djinn Trader';

    const { data, error } = await supabase
        .from('profiles')
        .upsert(toUpsert, { onConflict: 'wallet_address' })
        .select()
        .single();

    if (error) {
        console.error('Error upserting profile:', error);
        return null;
    }
    return data;
}

export async function incrementProfileViews(walletAddress: string): Promise<number> {
    const { data: profile } = await supabase
        .from('profiles')
        .select('views')
        .eq('wallet_address', walletAddress)
        .single();

    const currentViews = (profile && typeof profile.views === 'number') ? profile.views : 0;
    const newViews = currentViews + 1;

    await supabase
        .from('profiles')
        .update({ views: newViews })
        .eq('wallet_address', walletAddress);

    return newViews;
}



// ============================================
// MARKET ACTIVITIES
// ============================================

export async function getMarketActivities(marketPubkey: string) {
    try {
        const { data, error } = await supabase
            .from('activities')
            .select('*')
            .eq('market', marketPubkey)
            .order('created_at', { ascending: true });

        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('Error fetching activities:', err);
        return [];
    }
}

// NEW: Global Activity Fetcher
// NEW: Global Activity Fetcher
export async function getGlobalActivities(limit = 50) {
    if (LOCAL_MODE) {
        console.warn(`[Local Mode] Returning ${limit} mock activities`);
        return Array(Math.min(limit, 20)).fill(0).map((_, i) => ({
            id: `mock-activity-${i}`,
            user: '8xK...9zLq',
            type: Math.random() > 0.5 ? 'buy' : 'sell',
            side: Math.random() > 0.5 ? 'YES' : 'NO',
            amount: (Math.random() * 5 + 0.1),
            outcome_index: 0,
            market_slug: 'mock-market',
            tx_signature: 'mock-tx-signature',
            created_at: new Date(Date.now() - i * 60000).toISOString(),
            markets: {
                title: 'Local Mock Market',
                banner_url: null,
                total_yes_pool: 1000,
                total_no_pool: 1000,
                slug: 'mock-market'
            }
        }));
    }

    try {
        const { data, error } = await supabase
            .from('activities')
            .select(`
                *,
                markets (
                    title,
                    slug,
                    banner_url,
                    total_yes_pool,
                    total_no_pool
                )
            `)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('Error fetching global activities:', err);
        return [];
    }
}

// ============================================
// COMMENTS
// ============================================

export interface Comment {
    id?: string;
    market_slug: string;
    wallet_address: string;
    username: string;
    avatar_url: string | null;
    text: string;
    image_url: string | null;
    position: string | null;
    position_amount: string | null;
    likes_count: number;
    parent_id: string | null;
    created_at?: string;
    liked_by_me?: boolean;
    replies?: Comment[];
}

export async function getComments(marketSlug: string, currentWallet?: string): Promise<Comment[]> {
    // Get all comments for this market (top level only)
    const { data: comments, error } = await supabase
        .from('comments')
        .select('*')
        .eq('market_slug', marketSlug)
        .is('parent_id', null)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching comments:', JSON.stringify(error, null, 2));
        return [];
    }

    // Get replies for each comment
    const { data: replies } = await supabase
        .from('comments')
        .select('*')
        .eq('market_slug', marketSlug)
        .not('parent_id', 'is', null)
        .order('created_at', { ascending: true });

    // Get likes by current user
    let userLikes: string[] = [];
    if (currentWallet) {
        const { data: likes } = await supabase
            .from('comment_likes')
            .select('comment_id')
            .eq('wallet_address', currentWallet);
        userLikes = likes?.map(l => l.comment_id) || [];
    }

    // Combine comments with their replies and like status
    return comments?.map(c => ({
        ...c,
        liked_by_me: userLikes.includes(c.id),
        replies: replies?.filter(r => r.parent_id === c.id).map(r => ({
            ...r,
            liked_by_me: userLikes.includes(r.id)
        })) || []
    })) || [];
}

export async function createComment(comment: Omit<Comment, 'id' | 'created_at' | 'likes_count' | 'liked_by_me' | 'replies'>): Promise<{ data: Comment | null, error: any }> {
    const wallet = comment.wallet_address;
    const defaultData = {
        username: comment.username || `${wallet.slice(0, 4)}...${wallet.slice(-4)}`,
        avatar_url: comment.avatar_url || '/pink-pfp.png'
    };

    const toSave = {
        ...comment,
        ...defaultData,
        likes_count: 0
    };

    const { data, error } = await supabase
        .from('comments')
        .insert(toSave)
        .select()
        .single();

    if (error) {
        console.error('Error creating comment:', error);
        return { data: null, error };
    }

    // Achievement: COMMENTATOR (first comment)
    if (data) {
        grantAchievement(data.wallet_address, 'COMMENTATOR');
        // Award Gems for Comment (+2)
        await addGems(data.wallet_address, 2);
    }

    return { data, error: null };
}

export async function updateCommentPosition(walletAddress: string, marketSlug: string, position: string, positionAmount: string): Promise<boolean> {
    const { error } = await supabase
        .from('comments')
        .update({ position, position_amount: positionAmount })
        .eq('wallet_address', walletAddress)
        .eq('market_slug', marketSlug);

    if (error) {
        console.error('Error updating comment position:', error);
        return false;
    }
    return true;
}

export async function toggleLike(commentId: string, walletAddress: string): Promise<{ liked: boolean; newCount: number } | null> {
    // Check if already liked
    const { data: existing } = await supabase
        .from('comment_likes')
        .select('id')
        .eq('comment_id', commentId)
        .eq('wallet_address', walletAddress)
        .single();

    if (existing) {
        // Unlike
        await supabase.from('comment_likes').delete().eq('id', existing.id);
        await supabase.rpc('decrement_likes', { comment_id: commentId });
        const { data } = await supabase.from('comments').select('likes_count').eq('id', commentId).single();
        return { liked: false, newCount: data?.likes_count || 0 };
    } else {
        // Like
        await supabase.from('comment_likes').insert({ comment_id: commentId, wallet_address: walletAddress });
        await supabase.rpc('increment_likes', { comment_id: commentId });
        const { data } = await supabase.from('comments').select('likes_count').eq('id', commentId).single();
        return { liked: true, newCount: data?.likes_count || 0 };
    }
}

// ============================================
// GEMS SYSTEM
// ============================================

export async function addGems(walletAddress: string, amount: number) {
    if (LOCAL_MODE) {
        console.log(`[Local Mode] Adding ${amount} gems to ${walletAddress}`);
        // Store in localStorage if client-side, otherwise just log
        if (typeof window !== 'undefined') {
            const current = parseInt(localStorage.getItem(`gems_${walletAddress}`) || '0');
            localStorage.setItem(`gems_${walletAddress}`, (current + amount).toString());
        }
        return true;
    }

    // Real DB implementation
    const { error } = await supabase.rpc('add_gems', {
        user_wallet: walletAddress,
        amount_to_add: amount
    });

    if (error) {
        console.error('Error adding gems:', error);
        // Fallback: update directly if RPC missing
        const { data: profile } = await supabase.from('profiles').select('gems').eq('wallet_address', walletAddress).single();
        if (profile) {
            await supabase.from('profiles').update({ gems: (profile.gems || 0) + amount }).eq('wallet_address', walletAddress);
        }
    }
    return !error;
}

export async function getGems(walletAddress: string): Promise<number> {
    if (LOCAL_MODE) {
        if (typeof window !== 'undefined') {
            return parseInt(localStorage.getItem(`gems_${walletAddress}`) || '0');
        }
        return 0;
    }
    const { data } = await supabase.from('profiles').select('gems').eq('wallet_address', walletAddress).single();
    return data?.gems || 0;
}

// ============================================
// SOCIAL (FOLLOWS)
// ============================================

export async function followUser(follower: string, target: string) {
    if (LOCAL_MODE) {
        if (typeof window === 'undefined') return;
        const following = JSON.parse(localStorage.getItem(`following_${follower}`) || '[]');
        if (!following.includes(target)) {
            following.push(target);
            localStorage.setItem(`following_${follower}`, JSON.stringify(following));
        }
        return true;
    }

    const { error } = await supabase.from('follows').insert({ follower, target });
    if (error) {
        console.error(`[Social] ❌ Follow error:`, error.message, { follower, target });
    }
    return !error;
}

export async function unfollowUser(follower: string, target: string) {
    if (LOCAL_MODE) {
        if (typeof window === 'undefined') return;
        let following = JSON.parse(localStorage.getItem(`following_${follower}`) || '[]');
        following = following.filter((w: string) => w !== target);
        localStorage.setItem(`following_${follower}`, JSON.stringify(following));
        return true;
    }

    const { error } = await supabase.from('follows').delete().eq('follower', follower).eq('target', target);
    if (error) {
        console.error(`[Social] ❌ Unfollow error:`, error.message, { follower, target });
    }
    return !error;
}

export async function getFollowing(wallet: string): Promise<Profile[]> {
    if (LOCAL_MODE) {
        if (typeof window === 'undefined') return [];
        const followingWallets = JSON.parse(localStorage.getItem(`following_${wallet}`) || '[]');
        return followingWallets.map((w: string) => ({
            ...MOCK_PROFILE,
            wallet_address: w,
            username: `User ${w.slice(0, 4)}`
        }));
    }

    const { data } = await supabase.from('follows').select('target').eq('follower', wallet);
    if (!data || data.length === 0) return [];

    const targets = data.map(d => d.target);
    const { data: profiles } = await supabase.from('profiles').select('*').in('wallet_address', targets);
    return profiles || [];
}

export async function isFollowing(follower: string, target: string): Promise<boolean> {
    if (LOCAL_MODE) {
        if (typeof window === 'undefined') return false;
        const following = JSON.parse(localStorage.getItem(`following_${follower}`) || '[]');
        return following.includes(target);
    }

    const { data } = await supabase.from('follows').select('id').eq('follower', follower).eq('target', target).single();
    return !!data;
}

// ============================================
// MARKET DATA
// ============================================

export interface MarketData {
    slug: string;
    live_price: number;
    volume: number;
    updated_at?: string;
}

export async function getMarketData(slug: string): Promise<MarketData | null> {
    const { data, error } = await supabase
        .from('market_data')
        .select('*')
        .eq('slug', slug)
        .single();

    if (error && error.code !== 'PGRST116') {
        console.error('Error fetching market data:', JSON.stringify(error, null, 2));
    }
    return data;
}

export async function getAllMarketData(): Promise<MarketData[]> {
    const { data, error } = await supabase
        .from('market_data')
        .select('*');

    if (error) {
        console.error('Error fetching all market data:', JSON.stringify(error, null, 2));
        return [];
    }
    return data || [];
}

export async function updateMarketPrice(slug: string, newPrice: number, addVolume: number): Promise<boolean> {
    // Try to update existing
    const { data: existing } = await supabase
        .from('market_data')
        .select('volume')
        .eq('slug', slug)
        .single();

    if (existing) {
        const { error } = await supabase
            .from('market_data')
            .update({
                live_price: newPrice,
                volume: existing.volume + addVolume,
                updated_at: new Date().toISOString()
            })
            .eq('slug', slug);
        return !error;
    } else {
        // Insert new
        const { error } = await supabase
            .from('market_data')
            .insert({ slug, live_price: newPrice, volume: addVolume });
        return !error;
    }
}

// ============================================
// ACTIVITY
// ============================================

export interface Activity {
    id?: string;
    wallet_address: string;
    username: string;
    avatar_url: string | null;
    action: string;
    amount: number; // USD Amount
    sol_amount?: number;
    shares: number;
    market_title: string;
    market_slug: string;
    market_icon?: string;
    outcome_name?: string;
    created_at?: string;
    order_type?: 'BUY' | 'SELL';
}

export async function getActivity(minAmount: number = 0, limit: number = 50, marketSlugs: string[] = []): Promise<Activity[]> {
    let query = supabase
        .from('activity')
        .select('*');

    if (marketSlugs.length > 0) {
        query = query.in('market_slug', marketSlugs);
    }

    // Apply order and limit after filtering
    query = query
        .order('created_at', { ascending: false })
        .limit(limit);

    if (minAmount > 0) {
        query = query.gte('amount', minAmount);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching activity:', JSON.stringify(error, null, 2));
        return [];
    }
    return data || [];
}

export async function getAllMarketActivity(slug: string): Promise<Activity[]> {
    const { data, error } = await supabase
        .from('activity')
        .select('*')
        .eq('market_slug', slug)
        .order('created_at', { ascending: true }) // Important: Oldest first for replay
        .limit(2000); // Fetch sizeable history for chart

    if (error) {
        console.error('Error fetching all activity:', error);
        return [];
    }
    return data || [];
}

export async function createActivity(activity: Omit<Activity, 'id' | 'created_at'>): Promise<{ data: Activity | null, error: any }> {
    const { data, error } = await supabase
        .from('activity')
        .insert(activity)
        .select()
        .single();

    if (error) {
        console.error('Error creating activity:', error);
        return { data: null, error };
    }
    return { data, error: null };
}

export async function getUserActivity(walletAddress: string): Promise<Activity[]> {
    // Reverted to simple select to prevent crash if FK is missing.
    // TODO: Verify FK relationship between activity.market_slug and markets.slug
    const { data, error } = await supabase
        .from('activity')
        .select('*')
        .eq('wallet_address', walletAddress)
        .order('created_at', { ascending: false })
        .limit(100);

    if (error) {
        console.error('Error fetching user activity:', error);
        return [];
    }

    // 2. SOFT JOIN: Fetch Market Icons manually
    const activities = data || [];
    if (activities.length === 0) return [];

    const slugs = Array.from(new Set(activities.map(a => a.market_slug)));

    const { data: markets } = await supabase
        .from('markets')
        .select('slug, icon, banner_url')
        .in('slug', slugs);

    const marketMap = new Map();
    (markets || []).forEach((m: any) => {
        marketMap.set(m.slug, m.banner_url || m.icon);
    });

    return activities.map(act => ({
        ...act,
        market_icon: marketMap.get(act.market_slug) || act.market_icon
    }));
}

/**
 * Calculate Dynamic Gems based on user activity
 * - +20 Gems per Market Created
 * - +5 Gems per Activity Item (Trade/Interaction)
 */
export async function calculateUserGems(walletAddress: string): Promise<number> {
    try {
        // 1. Count Markets Created
        const { count: marketCount, error: marketError } = await supabase
            .from('markets')
            .select('*', { count: 'exact', head: true })
            .eq('creator_wallet', walletAddress);

        // 2. Count Activity (Trades)
        const { count: activityCount, error: activityError } = await supabase
            .from('activity')
            .select('*', { count: 'exact', head: true })
            .eq('wallet_address', walletAddress);

        if (marketError) console.error("Error counting markets for gems:", marketError);
        if (activityError) console.error("Error counting activity for gems:", activityError);

        const markets = marketCount || 0;
        const activities = activityCount || 0;

        // Formula: 20 per Market, 5 per Action
        return (markets * 20) + (activities * 5);
    } catch (e) {
        console.error("Error calculating gems:", e);
        return 0;
    }
}

// --- HOLDERS (Derived from Bets) ---
export interface Holder {
    rank: number;
    name: string;
    avatar: string | null;
    positions: Record<string, number>; // Dynamic: { "YES": 10, "Argentina": 50 }
    totalShares: number;
    wallet_address: string;
}

/**
 * Get Top Holders by Outcome - Supports Multi-Outcome Markets
 * Returns a dynamic object where keys are outcome names (e.g., "YES", "NO", "Argentina", "Brazil")
 */
export async function getTopHolders(slug: string): Promise<Record<string, Holder[]>> {
    // Read from bets table - only active (unclaimed) positions
    const { data, error } = await supabase
        .from('bets')
        .select('*')
        .eq('market_slug', slug)
        .eq('claimed', false);

    if (error || !data) return {};

    // Aggregate shares by wallet AND outcome (dynamic)
    const aggByOutcome: Record<string, Record<string, Holder>> = {};
    const wallets = new Set<string>();

    data.forEach(bet => {
        const key = bet.wallet_address;
        const outcome = bet.side || 'YES'; // Fallback to YES if no side specified
        const shares = Number(bet.shares || 0);

        wallets.add(key);

        // Initialize outcome aggregation if doesn't exist
        if (!aggByOutcome[outcome]) {
            aggByOutcome[outcome] = {};
        }

        const targetAgg = aggByOutcome[outcome];

        if (!targetAgg[key]) {
            targetAgg[key] = {
                rank: 0,
                name: bet.wallet_address.slice(0, 6) + '...',
                avatar: null,
                positions: { [outcome]: 0 },
                totalShares: 0, // Total shares for THIS outcome
                wallet_address: bet.wallet_address
            };
        }

        targetAgg[key].positions[outcome] = (targetAgg[key].positions[outcome] || 0) + shares;
        targetAgg[key].totalShares += shares;
    });

    // Fetch profiles
    const walletList = Array.from(wallets);
    if (walletList.length > 0) {
        const { data: profiles } = await supabase
            .from('profiles')
            .select('wallet_address, username, avatar_url')
            .in('wallet_address', walletList);

        profiles?.forEach(p => {
            // Update profile info across all outcomes
            Object.keys(aggByOutcome).forEach(outcome => {
                if (aggByOutcome[outcome][p.wallet_address]) {
                    if (p.username) aggByOutcome[outcome][p.wallet_address].name = p.username;
                    if (p.avatar_url) aggByOutcome[outcome][p.wallet_address].avatar = p.avatar_url;
                }
            });
        });
    }

    // Sort and Rank each outcome
    const sortHolders = (agg: Record<string, Holder>) => Object.values(agg)
        .filter(h => h.totalShares > 0.001)
        .sort((a, b) => b.totalShares - a.totalShares)
        .map((h, i) => ({ ...h, rank: i + 1 }));

    const result: Record<string, Holder[]> = {};
    Object.keys(aggByOutcome).forEach(outcome => {
        result[outcome] = sortHolders(aggByOutcome[outcome]).slice(0, 10); // Top 10 per outcome
    });

    return result;
}

/**
 * Get Creator Stats (Accumulated Fees)
 */
export async function getCreatorStats(walletAddress: string): Promise<{ totalVolume: number, estimatedFees: number, totalMarkets: number }> {
    const { data: markets, error } = await supabase
        .from('markets')
        .select('volume, id')
        .eq('creator_wallet', walletAddress);

    if (error || !markets) return { totalVolume: 0, estimatedFees: 0, totalMarkets: 0 };

    let totalVolume = 0;
    markets.forEach(m => {
        totalVolume += (m.volume || 0);
    });

    // Creator gets 0.5% of Volume (1% Total Fee, 50% split)
    // Assuming Volume is in USD, fees are USD equivalent
    const estimatedFees = totalVolume * 0.005;

    return {
        totalVolume,
        estimatedFees,
        totalMarkets: markets.length
    };
}

// Profile Stats (calculated from real data)
export async function getProfileStats(walletAddress: string): Promise<{
    marketsCreated: number;
    biggestWin: number;
    winRate: number;
    activePositionsValue: number;
    totalProfit: number;
}> {
    try {
        // 1. Markets created count
        const { count: marketsCreated } = await supabase
            .from('markets')
            .select('*', { count: 'exact', head: true })
            .eq('creator_wallet', walletAddress);

        // 2. Get all bets for win rate + biggest win
        const { data: allBets } = await supabase
            .from('bets')
            .select('payout, claimed, amount, sol_amount, shares, entry_price, side, market_slug')
            .eq('wallet_address', walletAddress)
            .gt('created_at', '2026-01-30T15:45:00.000Z');

        let biggestWin = 0;
        let wins = 0;
        let resolvedBets = 0;
        let activePositionsValue = 0;
        let totalProfit = 0;

        if (allBets) {
            for (const bet of allBets) {
                if (bet.payout !== null && bet.payout !== undefined) {
                    resolvedBets++;
                    if (bet.payout > 0) {
                        wins++;
                        const profit = bet.payout - (bet.sol_amount || bet.amount || 0);
                        if (profit > biggestWin) biggestWin = profit;
                        totalProfit += profit;
                    } else {
                        totalProfit -= (bet.sol_amount || bet.amount || 0);
                    }
                }

                if (!bet.claimed) {
                    const val = (bet.shares || 0) * (bet.entry_price || 0);
                    activePositionsValue += val;
                }
            }
        }

        const winRate = resolvedBets > 0 ? (wins / resolvedBets) * 100 : 0;

        return {
            marketsCreated: marketsCreated || 0,
            biggestWin,
            winRate: Math.round(winRate * 10) / 10,
            activePositionsValue,
            totalProfit
        };
    } catch (err) {
        console.error('getProfileStats error:', err);
        return { marketsCreated: 0, biggestWin: 0, winRate: 0, activePositionsValue: 0, totalProfit: 0 };
    }
}

// ============================================
// REAL-TIME SUBSCRIPTIONS
// ============================================

export function subscribeToComments(marketSlug: string, callback: (payload: any) => void) {
    return supabase
        .channel(`comments:${marketSlug}`)
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'comments',
            filter: `market_slug=eq.${marketSlug}`
        }, callback)
        .subscribe();
}

export function subscribeToActivity(marketSlug: string | ((payload: any) => void), callback?: (payload: any) => void) {
    let slug: string | undefined;
    let cb: (payload: any) => void;

    if (typeof marketSlug === 'function') {
        cb = marketSlug;
        slug = undefined;
    } else {
        slug = marketSlug;
        cb = callback!;
    }

    let channel = supabase.channel(slug ? `activity:${slug}` : 'global-activity');

    const filter = slug ? `market_slug=eq.${slug}` : undefined;

    return channel
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'activities', // Asegurarse de usar el nombre correcto de la tabla 'activities' o 'activity'
            filter: filter
        }, cb)
        .subscribe();
}

export function subscribeToMarketData(slug: string, callback: (payload: any) => void) {
    return supabase
        .channel(`market:${slug}`)
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'market_data',
            filter: `slug=eq.${slug}`
        }, callback)
        .subscribe();
}

export function subscribeToAllMarketData(callback: (payload: any) => void) {
    return supabase
        .channel('all-market-data')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'market_data'
        }, callback)
        .subscribe();
}

export function subscribeToMarkets(callback: (payload: any) => void) {
    return supabase
        .channel('markets:public')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'markets'
        }, callback)
        .subscribe();
}

// ============================================
// MARKETS (Resolution System)
// ============================================

export interface Market {
    id?: string;
    slug: string;
    title: string;
    description?: string;
    banner_url?: string;
    creator_wallet: string;
    end_date?: string;
    resolved: boolean;
    winning_outcome?: 'YES' | 'NO' | null;
    total_yes_pool: number;
    total_no_pool: number;
    resolution_date?: string;
    created_at?: string;
    // Blockchain fields
    market_pda?: string;
    yes_token_mint?: string;
    no_token_mint?: string;
    tx_signature?: string;
    resolution_source?: string;
    // Multi-outcome support
    options?: string[]; // Array of outcome names (e.g., ["Yes", "No"] or ["Brasil", "Argentina", "Chile"])
    outcome_colors?: string[]; // Array of hex colors for each outcome
    creator_username?: string;
    creator_avatar?: string;
    // Twitter market fields
    twitter_market_type?: 'keyword_mention' | 'metric_threshold';
    target_username?: string;
    target_keyword?: string;
    target_tweet_id?: string;
    metric_threshold?: number;
}

export async function createMarket(market: Partial<Market> & {
    slug: string;
    title: string;
    creator_wallet: string;
    category: string; // REQUIRED - auto-detected from title
}) {
    // Valid categories (including 'Trending' as fallback)
    const validCategories = ['Trending', 'Crypto', 'Politics', 'Sports', 'Earth', 'Movies',
        'Culture', 'Tech', 'AI', 'Science', 'Finance', 'Gaming', 'Twitter'];

    if (!market.category || !validCategories.includes(market.category)) {
        throw new Error('Invalid or missing category. Must be one of: ' + validCategories.join(', '));
    }

    // Validate Twitter market fields
    if (market.category === 'Twitter') {
        const twitterType = market.twitter_market_type || 'keyword_mention';
        if (twitterType === 'keyword_mention') {
            if (!market.target_username || !market.target_keyword) {
                throw new Error('Twitter keyword markets require a target username and keyword.');
            }
        } else if (twitterType === 'metric_threshold') {
            if (!market.target_tweet_id || !market.metric_threshold) {
                throw new Error('Twitter metric markets require a tweet ID and threshold.');
            }
        }
    }

    return withRetry(async () => {
        const { data, error } = await supabase
            .from('markets')
            .upsert(market, { onConflict: 'slug' })
            .select()
            .single();

        if (error) throw error;

        // Award Gems for Market Creation (+2000)
        await addGems(market.creator_wallet, 2000);

        return { data, error: null };
    }, 'createMarket');
}

// MOCK MARKETS (Bypass Supabase)
const MOCK_MARKETS = [
    {
        id: 'mock-1',
        slug: 'mock-btc-100k',
        title: 'Bitcoin > $100k by EOY',
        description: 'Will Bitcoin reach $100,000 USD before Dec 31st?',
        banner_url: null,
        icon: '💰',
        category: 'Crypto',
        options: ['Yes', 'No'],
        outcome_colors: ['#10B981', '#EF4444'],
        creator_wallet: '8xK...9zLq',
        created_at: new Date().toISOString(),
        verified: true,
        volume_usd: 50000,
        total_yes_pool: 300,
        total_no_pool: 200,
        monitoring_enabled: false
    }
];

export async function getMarkets(): Promise<Market[]> {
    if (LOCAL_MODE) {
        return MOCK_MARKETS as any;
    }

    return withRetry(async () => {
        const { data, error } = await supabase
            .from('markets')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    }, 'getMarkets');
}

export async function getMarket(slug: string): Promise<Market | null> {
    return withRetry(async () => {
        // 1. Fetch Market
        const { data: market, error } = await supabase
            .from('markets')
            .select('*')
            .eq('slug', slug)
            .single();

        if (error && error.code !== 'PGRST116') {
            throw error;
        }

        if (market) {
            // 2. Manual Fetch for Creator Profile (More robust than JOIN if FKs likely missing)
            if (market.creator_wallet) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('username, avatar_url')
                    .eq('wallet_address', market.creator_wallet)
                    .single();

                if (profile) {
                    return {
                        ...market,
                        creator_username: profile.username,
                        creator_avatar: profile.avatar_url
                    };
                }
            }
            return market;
        }
        return null;
    }, `getMarket(${slug})`);
}

export async function updateMarket(slug: string, updates: Partial<Market>) {
    try {
        const { data, error } = await supabase
            .from('markets')
            .update(updates)
            .eq('slug', slug)
            .select()
            .single();

        if (error) throw error;
        return { data };
    } catch (e: any) {
        console.error('Error updating market:', e);
        return { error: e.message };
    }
}

export async function resolveMarket(slug: string, winningOutcome: 'YES' | 'NO' | 'VOID') {
    // 1. Update market as resolved
    const { error: marketError } = await supabase
        .from('markets')
        .update({
            resolved: true,
            winning_outcome: winningOutcome,
            resolution_date: new Date().toISOString()
        })
        .eq('slug', slug);

    if (marketError) {
        console.error('Error resolving market:', marketError);
        return { error: marketError };
    }

    // 2. Get all bets for this market
    const { data: bets, error: betsError } = await supabase
        .from('bets')
        .select('*')
        .eq('market_slug', slug);

    if (betsError || !bets) {
        console.error('Error fetching bets:', betsError);
        return { error: betsError };
    }

    // 3. Calculate payouts
    const winningBets = bets.filter(b => b.side === winningOutcome);
    const losingBets = bets.filter(b => b.side !== winningOutcome);

    const totalWinningPool = winningBets.reduce((sum, b) => sum + parseFloat(b.sol_amount), 0);
    const totalLosingPool = losingBets.reduce((sum, b) => sum + parseFloat(b.sol_amount), 0);
    const totalPool = totalWinningPool + totalLosingPool;

    // 4. Calculate each winner's share
    for (const bet of winningBets) {
        const betAmount = parseFloat(bet.sol_amount);
        const shareOfWinnings = totalWinningPool > 0 ? (betAmount / totalWinningPool) : 0;
        const payout = betAmount + (shareOfWinnings * totalLosingPool); // Original + winnings

        await supabase
            .from('bets')
            .update({ payout })
            .eq('id', bet.id);

        // Check win milestones (FIRST_WIN, WIN_3, WIN_STREAK_3, etc.)
        await checkWinMilestones(bet.wallet_address);
    }

    // 5. Set losing bets payout to 0
    for (const bet of losingBets) {
        await supabase
            .from('bets')
            .update({ payout: 0 })
            .eq('id', bet.id);
    }

    return {
        success: true,
        totalPool,
        winningBets: winningBets.length,
        losingBets: losingBets.length
    };
}

// ============================================
// BETS
// ============================================

export interface Bet {
    id?: string;
    market_slug: string;
    wallet_address: string;
    side: string; // Dynamic side string
    amount: number;
    sol_amount: number;
    shares: number;
    entry_price: number;
    payout?: number;
    claimed: boolean;
    created_at?: string;
}

export async function createBet(bet: Omit<Bet, 'id' | 'payout' | 'claimed' | 'created_at'>) {
    // 1. Check if ANY active bets exist (could be multiple due to bugs)
    const { data: existingBets, error: fetchError } = await supabase
        .from('bets')
        .select('*')
        .eq('wallet_address', bet.wallet_address)
        .eq('market_slug', bet.market_slug)
        .eq('side', bet.side)
        .eq('claimed', false);

    if (fetchError) {
        console.error('Error checking existing bet:', fetchError);
    }

    // 2. If exists, UPDATE the FIRST one (or merge? simplest is update first, ignore others for now, reduceBetPosition cleans them)
    if (existingBets && existingBets.length > 0) {
        const existingBet = existingBets[0]; // Pick first

        const newAmount = Number(existingBet.amount) + Number(bet.amount);
        const newSolAmount = Number(existingBet.sol_amount) + Number(bet.sol_amount);
        const newShares = Number(existingBet.shares) + Number(bet.shares);

        // Weighted Avg Entry Price
        const weightedPrice = ((Number(existingBet.shares) * Number(existingBet.entry_price)) + (Number(bet.shares) * Number(bet.entry_price))) / newShares;

        const { data, error } = await supabase
            .from('bets')
            .update({
                amount: newAmount,
                sol_amount: newSolAmount,
                shares: newShares,
                entry_price: weightedPrice
            })
            .eq('id', existingBet.id)
            .select()
            .single();

        if (error) console.error('Error updating bet:', error);

        // Check milestone on the AGGREGATED amount
        if (data) await checkBetMilestones(data.wallet_address, data.amount);

        return { data, error };
    }

    // 3. If NOT exists, INSERT new
    else {
        const { data, error } = await supabase
            .from('bets')
            .insert({
                ...bet,
                claimed: false
            })
            .select()
            .single();

        if (error) console.error('Error creating bet:', error);

        if (data) {
            await checkBetMilestones(data.wallet_address, data.amount);
        }

        return { data, error };
    }
}

export async function reduceBetPosition(wallet: string, marketSlug: string, side: string, sharesToRemove: number) {
    // 1. Get ALL active bets (handling potential duplicates)
    const { data: existingBets, error: fetchError } = await supabase
        .from('bets')
        .select('*')
        .eq('wallet_address', wallet)
        .eq('market_slug', marketSlug)
        .eq('side', side)
        .eq('claimed', false)
        .gt('created_at', '2026-01-30T15:45:00.000Z') // SYSTEM RESET TIMESTAMP
        .order('created_at', { ascending: true }); // FIFO

    if (fetchError || !existingBets || existingBets.length === 0) {
        console.error("Error finding bet to sell:", fetchError);
        return { error: fetchError || "Bet not found" };
    }

    let remainingToRemove = sharesToRemove;

    // 2. Iterate and reduce/delete
    const idsToDelete: string[] = [];
    let updateTarget: { id: string, payload: any } | null = null;

    for (const bet of existingBets) {
        if (remainingToRemove <= 0) break;

        const currentShares = Number(bet.shares);

        if (currentShares <= remainingToRemove + 0.000001) {
            // Mark for deletion
            remainingToRemove -= currentShares;
            idsToDelete.push(bet.id!); // Non-null assertion if interface allows
        } else {
            // Partial sell of this row
            const newShares = currentShares - remainingToRemove;

            // Linear reduction of amounts
            const ratio = currentShares > 0 ? (newShares / currentShares) : 0;
            const newAmount = bet.amount * ratio;
            const newSolAmount = bet.sol_amount * ratio;

            updateTarget = {
                id: bet.id!,
                payload: {
                    shares: newShares,
                    amount: newAmount,
                    sol_amount: newSolAmount
                }
            };
            remainingToRemove = 0;
        }
    }

    // 3. Execute Batch Operations
    const promises = [];

    if (idsToDelete.length > 0) {
        promises.push(supabase.from('bets').delete().in('id', idsToDelete));
    }

    if (updateTarget) {
        promises.push(supabase
            .from('bets')
            .update(updateTarget.payload)
            .eq('id', updateTarget.id)
        );
    }

    await Promise.all(promises);

    return { success: true };
}

export async function getUserBets(walletAddress: string): Promise<Bet[]> {
    const { data: bets, error } = await supabase
        .from('bets')
        .select('*')
        .eq('wallet_address', walletAddress)
        .gt('created_at', '2026-01-30T15:45:00.000Z') // SYSTEM RESET TIMESTAMP
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching user bets:', typeof error === 'object' ? JSON.stringify(error, null, 2) : error);
        return [];
    }

    if (!bets || bets.length === 0) return [];

    // SOFT JOIN: Fetch latest market data (Live Price & Supplies)
    const slugs = Array.from(new Set(bets.map(b => b.market_slug)));
    const { data: markets } = await supabase
        .from('markets')
        .select('slug, live_price, yes_supply, no_supply, outcome_supplies')
        .in('slug', slugs);

    const marketMap = new Map();
    (markets || []).forEach((m: any) => {
        marketMap.set(m.slug, m);
    });

    // Merge and Calculate Current Price
    return bets.map(bet => {
        const market = marketMap.get(bet.market_slug);
        let currentPrice = bet.entry_price; // Fallback

        if (market) {
            // Dynamic Price Calculation via Bonding Curve (getSpotPrice)
            // Matches Market Page MCAP logic
            let supply = 0;

            if (bet.side === 'YES') {
                if (market.yes_supply) supply = Number(market.yes_supply);
                else if (market.outcome_supplies?.[0]) supply = Number(market.outcome_supplies[0]);
            } else {
                if (market.no_supply) supply = Number(market.no_supply);
                else if (market.outcome_supplies?.[1]) supply = Number(market.outcome_supplies[1]);
            }

            // core-amm expects Raw Supply (not scaled down yet? Wait, getSpotPrice expects shares count)
            // In MarketPage: sYes = Number(supply) / 1e9;
            // Then getSpotPrice(sYes).
            // So we must divide by 1e9 here too.
            const supplyShares = supply / 1_000_000_000;

            if (supplyShares > 0) {
                currentPrice = getSpotPrice(supplyShares);
            } else {
                // Fallback to probability if supply missing (unlikely if active)
                if (bet.side === 'YES') currentPrice = (market.live_price || 50) / 100;
                else currentPrice = (100 - (market.live_price || 50)) / 100;
            }
        }

        // Calculate current value based on ATOMIC shares scaling calculation
        // bet.shares is stored as atomic units on-chain (1e9 per share) but seemingly saved as such or needing normalization.
        // If user sees 255M USD, it means we are off by 1e9.
        // currentPrice is SOL per WHOLE SHARE.
        // So Value = (bet.shares / 1e9) * currentPrice * solPrice

        return {
            ...bet,
            currentPrice,
            // Normalizing shares for value calculation
            current: (bet.shares / 1_000_000_000) * currentPrice
        };
    });
}

export async function getUserMarketBets(walletAddress: string, marketSlug: string): Promise<Bet[]> {
    const { data, error } = await supabase
        .from('bets')
        .select('*')
        .eq('wallet_address', walletAddress)
        .eq('market_slug', marketSlug)
        .eq('claimed', false);

    if (error) {
        console.error('Error fetching user market bets:', error);
    }
    return data || [];
}

export async function getUnclaimedPayouts(walletAddress: string): Promise<Bet[]> {
    const { data, error } = await supabase
        .from('bets')
        .select('*')
        .eq('wallet_address', walletAddress)
        .eq('claimed', false)
        .not('payout', 'is', null)
        .gt('created_at', '2026-01-30T15:45:00.000Z') // SYSTEM RESET
        .gt('payout', 0);

    if (error) console.error('Error fetching unclaimed payouts:', error);
    return data || [];
}

export async function claimPayout(betId: string) {
    const { error } = await supabase
        .from('bets')
        .update({ claimed: true })
        .eq('id', betId);

    if (error) console.error('Error claiming payout:', error);
    return { error };
}

// Cancel/Refund a bet - marks as claimed so it disappears from active bets
export async function cancelBet(walletAddress: string, marketSlug: string) {
    const { error } = await supabase
        .from('bets')
        .update({ claimed: true, payout: 0 })
        .eq('wallet_address', walletAddress)
        .eq('market_slug', marketSlug)
        .eq('claimed', false);

    if (error) console.error('Error canceling bet:', error);
    return { error };
}

// ============================================
// ACHIEVEMENTS
// ============================================

export interface Achievement {
    code: string;
    name: string;
    description: string;
    image_url: string;
    xp: number;
    earned_at?: string;
}

export async function getAchievements(): Promise<Achievement[]> {
    const { data, error } = await supabase
        .from('achievements')
        .select('*');
    if (error) {
        console.error('Error fetching achievements:', JSON.stringify(error, null, 2));
        return [];
    }
    return data || [];
}

export async function getUserAchievements(walletAddress: string): Promise<Achievement[]> {
    // Join achievements with user_achievements
    const { data, error } = await supabase
        .from('user_achievements')
        .select(`
            earned_at,
            achievements (
                code, name, description, image_url, xp
            )
        `)
        .eq('user_wallet', walletAddress);

    if (error) {
        console.error('Error fetching user achievements:', JSON.stringify(error, null, 2));
        return [];
    }

    // Transform nested result if necessary, or return as is (client handles nesting)
    // Supabase returns { earned_at, achievements: { ... } }
    return (data || []).map((item: any) => ({
        ...(item.achievements || {}),
        earned_at: item.earned_at
    }));
}

export async function grantAchievement(walletAddress: string, code: string): Promise<Achievement | null> {
    // 1. Check if achievement exists
    const { data: achievement } = await supabase
        .from('achievements')
        .select('*')
        .eq('code', code)
        .single();

    if (!achievement) return null;

    // 2. Try to insert (ignore if already exists due to unique constraint)
    const { error } = await supabase
        .from('user_achievements')
        .insert({
            user_wallet: walletAddress,
            achievement_code: code
        });

    if (error) {
        // If unique violation (code 23505), user already has it
        if (error.code === '23505') return null;
        console.error('Error granting achievement:', JSON.stringify(error, null, 2));
        return null;
    }

    return achievement;
}

// ============================================
// ACHIEVEMENT MILESTONE CHECKS
// ============================================

/**
 * Check and grant market creation milestones
 * Call this after a user creates a market
 */
export async function checkMarketMilestones(walletAddress: string): Promise<Achievement[]> {
    const granted: Achievement[] = [];

    // Count user's markets
    const { count } = await supabase
        .from('markets')
        .select('*', { count: 'exact', head: true })
        .eq('creator_wallet', walletAddress);

    const marketCount = count || 0;

    // Check milestones
    if (marketCount >= 1) {
        const ach = await grantAchievement(walletAddress, 'FIRST_MARKET');
        if (ach) granted.push(ach);
    }
    if (marketCount >= 5) {
        const ach = await grantAchievement(walletAddress, 'MARKET_5');
        if (ach) granted.push(ach);
    }
    if (marketCount >= 10) {
        const ach = await grantAchievement(walletAddress, 'MARKET_10');
        if (ach) granted.push(ach);
    }
    if (marketCount >= 25) {
        const ach = await grantAchievement(walletAddress, 'MARKET_25');
        if (ach) granted.push(ach);
    }

    return granted;
}

/**
 * Check and grant win milestones
 * Call this after a user wins a bet
 */
export async function checkWinMilestones(walletAddress: string): Promise<Achievement[]> {
    const granted: Achievement[] = [];

    // Count user's wins (bets with payout > 0)
    const { data: wins } = await supabase
        .from('bets')
        .select('id, created_at')
        .eq('wallet_address', walletAddress)
        .gt('payout', 0)
        .order('created_at', { ascending: false });

    const winCount = wins?.length || 0;

    // Check total win milestones
    if (winCount >= 1) {
        const ach = await grantAchievement(walletAddress, 'FIRST_WIN');
        if (ach) granted.push(ach);
    }
    if (winCount >= 3) {
        const ach = await grantAchievement(walletAddress, 'WIN_3');
        if (ach) granted.push(ach);
    }

    // Check win streaks (consecutive wins)
    if (wins && wins.length >= 3) {
        // Get last 5 bets to check for streak
        const { data: recentBets } = await supabase
            .from('bets')
            .select('payout')
            .eq('wallet_address', walletAddress)
            .eq('claimed', true) // 'payout_claimed' logic might be different but let's assume filtering applies to bet creation
            .gt('created_at', '2026-01-30T15:45:00.000Z') // SYSTEM RESET TIMESTAMP
            .not('payout', 'is', null)
            .order('created_at', { ascending: false })
            .limit(5);

        if (recentBets) {
            let streak = 0;
            for (const bet of recentBets) {
                if (bet.payout > 0) streak++;
                else break; // Streak broken
            }

            if (streak >= 3) {
                const ach = await grantAchievement(walletAddress, 'WIN_STREAK_3');
                if (ach) granted.push(ach);
            }
            if (streak >= 5) {
                const ach = await grantAchievement(walletAddress, 'WIN_STREAK_5');
                if (ach) granted.push(ach);
            }
        }
    }

    return granted;
}

/**
 * Check and grant bet milestones
 * Call this after a user places a bet
 */
export async function checkBetMilestones(walletAddress: string, betAmount: number): Promise<Achievement[]> {
    const granted: Achievement[] = [];

    // Count user's bets
    const { count } = await supabase
        .from('bets')
        .select('*', { count: 'exact', head: true })
        .eq('wallet_address', walletAddress);

    const betCount = count || 0;

    // First bet
    if (betCount >= 1) {
        const ach = await grantAchievement(walletAddress, 'FIRST_BET');
        if (ach) granted.push(ach);
    }

    // Whale check
    if (betAmount >= 1000) {
        const ach = await grantAchievement(walletAddress, 'WHALE');
        if (ach) granted.push(ach);
    }

    return granted;
}


// ============================================
// SEARCH
// ============================================

export async function searchMarkets(query: string) {
    // Search in markets table by title (primary) and slug
    const { data, error } = await supabase
        .from('markets')
        .select('id, title, slug, banner_url, category, created_at, resolved')
        .or(`title.ilike.%${query}%,slug.ilike.%${query}%`)
        .order('created_at', { ascending: false })
        .limit(8);

    if (error) console.error('Error searching markets:', error);
    return data || [];
}

export async function searchProfiles(query: string) {
    const { data, error } = await supabase
        .from('profiles')
        .select('wallet_address, username, avatar_url, bio')
        .or(`username.ilike.%${query}%,wallet_address.ilike.%${query}%`)
        .limit(8);

    if (error) console.error('Error searching profiles:', error);
    return data || [];
}

export async function getFollowCounts(walletAddress: string): Promise<{ followers: number, following: number }> {
    if (LOCAL_MODE) {
        // Mock counts
        return { followers: 0, following: 0 };
    }
    const [followersRes, followingRes] = await Promise.all([
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('target', walletAddress),
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower', walletAddress)
    ]);

    return {
        followers: followersRes.count || 0,
        following: followingRes.count || 0
    };
}


export async function getFollowers(wallet: string): Promise<Profile[]> {
    if (LOCAL_MODE) {
        return [];
    }

    const { data } = await supabase.from('follows').select('follower').eq('target', wallet);
    if (!data || data.length === 0) return [];

    const followers = data.map(d => d.follower);
    const { data: profiles } = await supabase.from('profiles').select('*').in('wallet_address', followers);
    return profiles || [];
}

// ============================================
// NOTIFICATIONS
// ============================================

export interface Notification {
    id?: string;
    target_wallet: string;
    from_wallet: string;
    type: string;
    message: string;
    read: boolean;
    created_at?: string;
}

export async function createNotification(targetWallet: string, type: string, fromWallet: string, message: string): Promise<boolean> {
    try {
        const { error } = await supabase.from('notifications').insert({
            target_wallet: targetWallet,
            from_wallet: fromWallet,
            type,
            message,
            read: false
        });
        return !error;
    } catch (e) {
        console.error('Error creating notification:', e);
        return false;
    }
}

export async function getNotifications(wallet: string, limit = 20): Promise<(Notification & { from_profile?: Profile })[]> {
    try {
        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .eq('target_wallet', wallet)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error || !data) return [];

        // Fetch profiles for from_wallet
        const fromWallets = [...new Set(data.map(n => n.from_wallet))];
        const { data: profiles } = await supabase.from('profiles').select('*').in('wallet_address', fromWallets);
        const profileMap: Record<string, Profile> = {};
        profiles?.forEach(p => { profileMap[p.wallet_address] = p; });

        return data.map(n => ({
            ...n,
            from_profile: profileMap[n.from_wallet] || null
        }));
    } catch (e) {
        console.error('Error fetching notifications:', e);
        return [];
    }
}

export async function getUnreadNotificationCount(wallet: string): Promise<number> {
    try {
        const { count, error } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('target_wallet', wallet)
            .eq('read', false);

        if (error) return 0;
        return count || 0;
    } catch (e) {
        return 0;
    }
}

export async function markNotificationsRead(wallet: string): Promise<boolean> {
    try {
        const { error } = await supabase
            .from('notifications')
            .update({ read: true })
            .eq('target_wallet', wallet)
            .eq('read', false);

        return !error;
    } catch (e) {
        console.error('Error marking notifications read:', e);
        return false;
    }
}

// ============================================
// GLOBAL SEARCH
// ============================================

export async function searchGlobal(queryText: string) {
    if (!queryText || queryText.length < 2) return { profiles: [], markets: [] };

    // Sanitize: allow alphanumeric, spaces, dashes (prevent breaking sql/filter syntax)
    const sanitizedQuery = queryText.replace(/[,%]/g, '').trim();
    if (!sanitizedQuery) return { profiles: [], markets: [] };

    try {
        // 1. Search Profiles (Username OR Wallet)
        const profilesPromise = supabase
            .from('profiles')
            .select('username, wallet_address, avatar_url')
            .or(`username.ilike.%${sanitizedQuery}%,wallet_address.ilike.%${sanitizedQuery}%`)
            .limit(5);

        // 2. Search Markets (Title OR Slug)
        const marketsPromise = supabase
            .from('markets')
            .select('title, slug, banner_url, creator_wallet')
            .or(`title.ilike.%${sanitizedQuery}%,slug.ilike.%${sanitizedQuery}%`)
            .limit(5);

        const [profilesResult, marketsResult] = await Promise.all([profilesPromise, marketsPromise]);

        return {
            profiles: profilesResult.data || [],
            markets: marketsResult.data || []
        };
    } catch (e) {
        console.error("Global search error:", e);
        return { profiles: [], markets: [] };
    }
}

// ============================================
// CERBERUS ORACLE SYSTEM
// ============================================

export type VerificationStatus =
    | 'none'             // Not yet triggered
    | 'pending'          // In queue for verification
    | 'pending_manual'   // Bot disabled, needs manual trigger
    | 'verifying'        // Currently being verified by Cerberus
    | 'pre_resolution'   // T-2h: intensive monitoring active, bounty open
    | 'verified'         // Cerberus approved (3-dog passed)
    | 'flagged'          // Cerberus flagged for review / stale
    | 'rejected';        // Cerberus rejected

export type ResolutionStatus =
    | 'active'         // Market is live and trading
    | 'pending_resolution' // Expired, waiting for oracle verdict
    | 'resolving'      // Resolution in progress
    | 'resolved'       // Fully resolved with winner
    | 'voided';        // Market cancelled/refunded

/**
 * Get market by slug with extended oracle fields
 */
export async function getMarketBySlug(slug: string) {
    const { data, error } = await supabase
        .from('markets')
        .select('*')
        .eq('slug', slug)
        .single();

    if (error && error.code !== 'PGRST116') {
        console.error('Error fetching market:', error);
        return null;
    }
    return data;
}

/**
 * Update market verification status (Cerberus pre-resolution)
 */
export async function updateMarketVerificationStatus(
    slug: string,
    status: VerificationStatus,
    details?: {
        cerberus_verdict?: string;
        cerberus_confidence?: number;
        cerberus_analysis?: string;
    }
) {
    const updatePayload: any = {
        verification_status: status,
        verification_updated_at: new Date().toISOString()
    };

    if (details) {
        if (details.cerberus_verdict) updatePayload.cerberus_verdict = details.cerberus_verdict;
        if (details.cerberus_confidence) updatePayload.cerberus_confidence = details.cerberus_confidence;
        if (details.cerberus_analysis) updatePayload.cerberus_analysis = details.cerberus_analysis;
    }

    const { error } = await supabase
        .from('markets')
        .update(updatePayload)
        .eq('slug', slug);

    if (error) {
        console.error('Error updating verification status:', error);
        return false;
    }
    return true;
}

/**
 * Get markets ready for Cerberus verification (reached MCAP trigger)
 */
export async function getMarketsReadyForVerification() {
    const { data, error } = await supabase
        .from('markets')
        .select('*')
        .eq('resolved', false)
        .or('verification_status.is.null,verification_status.eq.none')
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Error fetching markets for verification:', error);
        return [];
    }
    return data || [];
}

/**
 * Get markets pending resolution (expired + verified)
 */
export async function getMarketsPendingResolution() {
    const now = new Date().toISOString();

    const { data, error } = await supabase
        .from('markets')
        .select('*')
        .eq('resolved', false)
        .eq('verification_status', 'verified')
        .lt('end_date', now) // Market has expired
        .order('end_date', { ascending: true });

    if (error) {
        console.error('Error fetching markets pending resolution:', error);
        return [];
    }
    return data || [];
}

/**
 * Get approved resolution suggestions
 */
export async function getApprovedSuggestions() {
    const { data, error } = await supabase
        .from('resolution_suggestions')
        .select('*')
        .eq('status', 'approved')
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Error fetching approved suggestions:', error);
        return [];
    }
    return data || [];
}

/**
 * Auto-resolve market based on Cerberus verdict
 */
export async function autoResolveMarket(
    slug: string,
    verdict: 'YES' | 'NO',
    cerberusData: {
        confidence: number;
        analysis: string;
        sources: string[];
    }
) {
    // 1. Update market status
    const { error: marketError } = await supabase
        .from('markets')
        .update({
            resolved: true,
            winning_outcome: verdict,
            resolution_date: new Date().toISOString(),
            resolution_method: 'cerberus_auto',
            cerberus_confidence: cerberusData.confidence,
            cerberus_analysis: cerberusData.analysis,
            cerberus_sources: cerberusData.sources
        })
        .eq('slug', slug);

    if (marketError) {
        console.error('Error auto-resolving market:', marketError);
        return { error: marketError };
    }

    // 2. Calculate payouts (same as manual resolution)
    return resolveMarket(slug, verdict);
}

/**
 * Get market MCAP data for trigger checking
 */
export async function getMarketMcapData(slug: string) {
    const { data, error } = await supabase
        .from('markets')
        .select('slug, title, total_yes_pool, total_no_pool, verification_status, resolved')
        .eq('slug', slug)
        .single();

    if (error) {
        console.error('Error fetching market MCAP:', error);
        return null;
    }

    // Calculate combined MCAP in SOL
    const totalPoolSol = (data.total_yes_pool || 0) + (data.total_no_pool || 0);

    return {
        ...data,
        total_pool_sol: totalPoolSol,
        // Rough MCAP estimate (pool value * multiplier based on bonding curve position)
        estimated_mcap_sol: totalPoolSol * 1.5 // Conservative estimate
    };
}

/**
 * Get all active markets with their pool data for MCAP monitoring
 */
export async function getActiveMarketsForMcapMonitoring() {
    const { data, error } = await supabase
        .from('markets')
        .select('slug, title, total_yes_pool, total_no_pool, verification_status, created_at')
        .eq('resolved', false)
        .or('verification_status.is.null,verification_status.eq.none')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching active markets:', error);
        return [];
    }

    return (data || []).map(m => ({
        ...m,
        total_pool_sol: (m.total_yes_pool || 0) + (m.total_no_pool || 0)
    }));
}

// ============================================
// TIERED ACCESS & REFERRALS
// ============================================

/**
 * Get the number of successful referrals for a user ID
 */
export async function getReferralCount(userId: string): Promise<number> {
    const { count, error } = await supabase
        .from('referrals')
        .select('*', { count: 'exact', head: true })
        .eq('referrer_id', userId)
        .eq('is_valid', true);

    if (error) {
        console.error('Error fetching referral count:', error);
        return 0;
    }
    return count || 0;
}

/**
 * Get list of profiles referred by a user ID
 */
export async function getReferredUsers(userId: string): Promise<any[]> {
    const { data, error } = await supabase
        .from('referrals')
        .select(`
            new_user_id,
            new_user_wallet,
            created_at,
            profiles:new_user_id (username, avatar_url)
        `)
        .eq('referrer_id', userId)
        .eq('is_valid', true);

    if (error) {
        console.error('Error fetching referred users:', error);
        return [];
    }
    return (data || []).map((r: any) => ({
        id: r.new_user_id,
        wallet_address: r.new_user_wallet,
        username: r.profiles?.username,
        avatar_url: r.profiles?.avatar_url,
        joined_at: r.created_at
    }));
}

/**
 * Grant full access to a user after successful referrals
 */
export async function grantReferralAccess(userId: string): Promise<boolean> {
    const { error } = await supabase
        .from('profiles')
        .update({
            has_access: true,
            tier: 'REFERRAL'
        })
        .eq('id', userId);

    if (error) {
        console.error('Error granting referral access:', error);
        return false;
    }
    return true;
}

/**
 * Register a new referral
 */
export async function registerReferral(referrerId: string, newUserId: string, newUserWallet: string): Promise<boolean> {
    const { error } = await supabase
        .from('referrals')
        .insert({
            referrer_id: referrerId,
            new_user_id: newUserId,
            new_user_wallet: newUserWallet,
            is_valid: true
        });

    if (error) {
        if (error.code === '23505') return true; // Already exists
        console.error('Error registering referral:', error);
        return false;
    }
    return true;
}

/**
 * Get profile by referral code
 */
export async function getProfileByReferralCode(code: string): Promise<Profile | null> {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('referral_code', code)
        .maybeSingle();

    if (error) return null;
    return data;
}

/**
 * Get the wallet address for a given username
 */
export async function getWalletByUsername(username: string): Promise<string | null> {
    if (!username) return null;
    const { data, error } = await supabase
        .from('profiles')
        .select('wallet_address')
        .eq('username', username)
        .maybeSingle();

    if (error || !data) return null;
    return data.wallet_address;
}

/**
 * Get global stats for landing page tiers
 */
export async function getGlobalAccessStats() {
    const { data, error } = await supabase
        .from('system_stats')
        .select('*')
        .eq('id', 'main')
        .maybeSingle();

    if (error || !data) {
        console.error('Error fetching system stats:', error);
        return {
            totalUsers: 0,
            accessGranted: 0,
            foundersCount: 0,
            referralAccessCount: 0,
            waitlistCount: 0
        };
    }

    return {
        totalUsers: data.total_users || 0,
        accessGranted: data.total_access_granted || 0,
        foundersCount: data.founders_count || 0,
        referralAccessCount: data.referral_access_count || 0,
        waitlistCount: data.waitlist_count || 0
    };
}
