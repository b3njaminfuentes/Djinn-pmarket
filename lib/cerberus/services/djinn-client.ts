/**
 * DJINN-PMARKET CLIENT
 * Integration with Djinn Prediction Market API
 * When running inside Djinn (monorepo), this calls localhost
 */

import axios, { AxiosInstance } from 'axios';
import {
    MarketData,
    DjinnMarketsResponse,
    CerberusConfig,
    CerberusVerdict,
    WebhookPayload
} from '../types';

export class DjinnClient {
    private client: AxiosInstance;
    private config: CerberusConfig;
    private knownMarketIds: Set<string> = new Set();

    constructor(config: CerberusConfig) {
        this.config = config;
        this.client = axios.create({
            baseURL: config.djinnApiUrl,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Cerberus-Oracle/1.0'
            }
        });
    }

    async fetchAllMarkets(): Promise<MarketData[]> {
        try {
            console.log(`[DJINN] Fetching markets from ${this.config.djinnApiUrl}/markets`);
            const response = await this.client.get<DjinnMarketsResponse>('/markets');
            if (response.data.success && response.data.markets) {
                console.log(`[DJINN] Fetched ${response.data.markets.length} markets`);
                return response.data.markets;
            }
            return [];
        } catch (error) {
            console.log(`[DJINN] Error fetching markets: ${error}`);
            return [];
        }
    }

    async fetchNewMarkets(): Promise<MarketData[]> {
        const allMarkets = await this.fetchAllMarkets();
        const newMarkets = allMarkets.filter(market => {
            if (this.knownMarketIds.has(market.publicKey)) return false;
            this.knownMarketIds.add(market.publicKey);
            return true;
        });
        if (newMarkets.length > 0) {
            console.log(`[DJINN] Found ${newMarkets.length} new market(s)`);
        }
        return newMarkets;
    }

    async fetchRecentMarkets(minutes: number = 3): Promise<MarketData[]> {
        const allMarkets = await this.fetchAllMarkets();
        const cutoff = Date.now() - (minutes * 60 * 1000);
        return allMarkets.filter(market => market.createdAt >= cutoff);
    }

    async fetchExpiringMarkets(hours: number = 12): Promise<MarketData[]> {
        const allMarkets = await this.fetchAllMarkets();
        const now = Date.now();
        const limit = now + (hours * 60 * 60 * 1000);
        return allMarkets.filter(market =>
            market.expiresAt &&
            market.expiresAt > now &&
            market.expiresAt <= limit
        );
    }

    async getMarket(marketId: string): Promise<MarketData | null> {
        try {
            const response = await this.client.get<{ success: boolean; market: MarketData }>(
                `/markets/${marketId}`
            );
            if (response.data.success && response.data.market) return response.data.market;
            return null;
        } catch (error) {
            console.log(`[DJINN] Error fetching market ${marketId}: ${error}`);
            return null;
        }
    }

    async sendVerificationResult(verdict: CerberusVerdict): Promise<boolean> {
        if (!this.config.webhookUrl) {
            console.log(`[DJINN] No webhook URL configured, skipping notification`);
            return false;
        }

        try {
            const updatePayload = {
                id: verdict.marketId,
                status: verdict.finalStatus,
                resolutionDate: verdict.resolutionDate
            };

            await axios.put(this.config.djinnApiUrl + '/markets', updatePayload);
            console.log(`[DJINN] Status ${verdict.finalStatus} synced for market ${verdict.marketId}`);
            return true;
        } catch (error) {
            console.log(`[DJINN] Error syncing result: ${error}`);
            return false;
        }
    }

    async requestRefund(marketId: string, reason: string): Promise<boolean> {
        try {
            const response = await this.client.post(`/markets/${marketId}/refund`, {
                reason,
                requestedBy: 'cerberus-oracle'
            });
            return response.data.success === true;
        } catch (error) {
            console.log(`[DJINN] Error requesting refund for ${marketId}: ${error}`);
            return false;
        }
    }

    async updateMarketVerification(
        marketId: string,
        data: {
            verified: boolean;
            checkmark: boolean;
            resolutionDate: string | null;
            aiDescription: string | null;
            category: string;
        }
    ): Promise<boolean> {
        try {
            const response = await this.client.patch(`/markets/${marketId}/verification`, data);
            return response.data.success === true;
        } catch (error) {
            console.log(`[DJINN] Error updating market verification: ${error}`);
            return false;
        }
    }

    resetKnownMarkets(): void {
        this.knownMarketIds.clear();
    }

    /**
     * Trigger on-chain + Supabase resolution for a market with a known verdict.
     * Called by the orchestrator after Cerberus reaches a clear outcome.
     */
    async triggerResolution(
        marketSlug: string,
        verdict: 'YES' | 'NO' | 'VOID'
    ): Promise<boolean> {
        const adminSecret = process.env.ADMIN_SECRET;
        if (!adminSecret) {
            console.warn('[DJINN] ADMIN_SECRET not set — cannot trigger resolution');
            return false;
        }
        try {
            const baseUrl = (process.env.CERBERUS_API_URL || this.config.djinnApiUrl).replace('/api', '');
            const response = await axios.post(
                `${baseUrl}/api/oracle/resolve`,
                { market_slug: marketSlug, verdict, force: false },
                { headers: { 'x-admin-secret': adminSecret } }
            );
            if (response.data.resolved) {
                console.log(`[DJINN] ✅ Resolution triggered: ${marketSlug} → ${verdict} | Tx: ${response.data.on_chain_signature || 'N/A'}`);
                return true;
            }
            return false;
        } catch (error) {
            console.log(`[DJINN] Error triggering resolution for ${marketSlug}: ${error}`);
            return false;
        }
    }
}

export function createDjinnClient(config: CerberusConfig): DjinnClient {
    // Prefer env var over hardcoded config for production flexibility
    const djinnApiUrl = process.env.CERBERUS_API_URL || config.djinnApiUrl;
    return new DjinnClient({ ...config, djinnApiUrl });
}
