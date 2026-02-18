import yahooFinance from 'yahoo-finance2';
import { BaseSource, SourceResult } from './base';
import { Evidence } from '../index';

// ============================================
// YAHOO FINANCE SOURCE
// ============================================

interface YahooConfig {
    enabled: boolean;
}

export class YahooSource extends BaseSource {
    constructor(config: YahooConfig) {
        super('yahoo', 'Yahoo Finance', config);
    }

    isConfigured(): boolean {
        // Yahoo Finance via library doesn't strictly need a key for public data,
        // but we respect the 'enabled' flag.
        return this.config.enabled;
    }

    async search(query: string, keywords: string[]): Promise<SourceResult> {
        if (!this.isConfigured()) {
            return { success: false, evidence: [], error: 'Yahoo Finance not configured' };
        }

        try {
            await this.log(`Searching Yahoo Finance for: ${query}`);

            // 1. Try to identify a ticker symbol from keywords (e.g., "BTC", "AAPL")
            // This is a naive heuristic; for a real production bot we'd use NER.
            const potentialTicker = keywords.find(k => /^[A-Z]{3,5}$/.test(k));

            let evidence: Evidence[] = [];

            // A. Search for News
            try {
                const searchResult = await yahooFinance.search(query) as any;
                if (searchResult.news && searchResult.news.length > 0) {
                    const newsItems = searchResult.news.slice(0, 5).map((item: any) => ({
                        url: item.link,
                        title: item.title,
                        snippet: `[Yahoo News] ${item.publisher}: ${item.title}`,
                        source: 'yahoo',
                        timestamp: item.providerPublishTime ? new Date(item.providerPublishTime * 1000).toISOString() : undefined
                    }));
                    evidence = [...evidence, ...newsItems];
                }
            } catch (e) {
                console.error("Yahoo News Search failed, trying quotes only", e);
            }

            // B. If we have a ticker, get Quote data
            if (potentialTicker) {
                try {
                    const quote = await yahooFinance.quote(potentialTicker) as any;
                    if (quote) {
                        evidence.push({
                            url: `https://finance.yahoo.com/quote/${potentialTicker}`,
                            title: `Market Data: ${quote.symbol}`,
                            snippet: `Price: ${quote.regularMarketPrice} ${quote.currency} | Change: ${quote.regularMarketChangePercent?.toFixed(2)}%`,
                            source: 'yahoo', // 'yahoo_finance'
                            timestamp: new Date().toISOString()
                        });
                    }
                } catch (e) {
                    // Ignore invalid tickers
                }
            }

            await this.log(`Found ${evidence.length} Yahoo Finance results`, { count: evidence.length });
            return { success: true, evidence };

        } catch (error) {
            await this.logError('Yahoo Finance search failed', error);
            // Return empty success instead of erroring out completely, 
            // as this might be secondary data.
            return { success: false, evidence: [], error: String(error) };
        }
    }
}
