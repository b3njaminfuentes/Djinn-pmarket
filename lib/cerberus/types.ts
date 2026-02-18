// ============================================
// CERBERUS ORACLE - TYPE DEFINITIONS
// 3-Layer AI Verification System for Markets
// ============================================

// Market Status Flow
export type MarketStatus =
    | 'pending_verification'      // Just created, waiting for verification
    | 'layer1_processing'         // IA1 gathering information
    | 'layer2_processing'         // IA2 confirming verification
    | 'layer3_processing'         // IA3 validating sources
    | 'verified'                  // Passed all 3 layers - CHECKMARK
    | 'flagged'                   // Needs manual review
    | 'rejected'                  // Failed verification - REFUND
    | 'awaiting_manual_date'      // Valid but date missing
    | 'trading'                   // Active trading period
    | 'expired'                   // Trading ended, awaiting resolution
    | 'resolved_yes'              // Resolved as YES
    | 'resolved_no'               // Resolved as NO
    | 'resolved_unresolvable';    // Cannot determine - REFUND

// Market Categories
export type MarketCategory =
    | 'crypto'
    | 'sports'
    | 'politics'
    | 'entertainment'
    | 'science'
    | 'economics'
    | 'weather'
    | 'gaming'
    | 'other';

// Fee Structure
export interface FeeStructure {
    creationFee: number;      // 2 USD - Non-refundable
    tradingFeePercent: number; // 1% - Non-refundable
}

// Market Data from Djinn-pmarket
export interface MarketData {
    publicKey: string;           // Solana market address
    title: string;               // Market question
    description?: string;        // Original description
    sourceUrl: string;           // Source URL for verification
    category?: MarketCategory;
    createdAt: number;           // Timestamp
    expiresAt?: number;          // When trading ends
    targetResolutionDate?: string; // ISO date string for resolution
    creator: {
        wallet: string;          // Creator's wallet address
        displayName?: string;
    };
    pool: {
        yesShares: number;
        noShares: number;
        totalLiquidity: number;
    };
    feesCollected: number;
}

// ============================================
// LAYER 1: INFORMATION GATHERER
// ============================================
export interface Layer1Result {
    passed: boolean;
    sourceAccessible: boolean;
    sourceContent: string | null;
    extractedFacts: string[];
    newsArticles: NewsArticle[];
    socialMentions: SocialMention[];
    hasEnoughInformation: boolean;
    summary: string;
    processingTime: number;
}

export interface NewsArticle {
    title: string;
    url: string;
    source: string;
    publishedAt: string;
    relevanceScore: number;
    snippet: string;
}

export interface SocialMention {
    platform: 'twitter' | 'reddit' | 'other';
    url: string;
    author: string;
    content: string;
    timestamp: string;
    engagement: number;
}

// ============================================
// LAYER 2: VERIFICATION CONFIRMER
// ============================================
export interface Layer2Result {
    passed: boolean;
    layer1Confirmed: boolean;
    isResolvable: boolean;
    hasClearOutcome: boolean;      // Can be resolved to YES/NO
    isObjective: boolean;          // Not subjective opinion
    hasVerifiableDate: boolean;    // Has clear resolution date
    suggestedResolutionDate: string | null;
    riskFlags: string[];
    confidenceScore: number;       // 0-100
    reasoning: string;
    processingTime: number;
}

// ============================================
// LAYER 3: FINAL SOURCE VALIDATOR
// ============================================
export interface Layer3Result {
    passed: boolean;
    sourceIsReal: boolean;
    eventIsReal: boolean;
    sourceTrustworthy: boolean;
    dateIsValid: boolean;
    finalVerdict: 'APPROVED' | 'FLAGGED' | 'REJECTED';
    checkmarkEarned: boolean;      // Rosado con cafe
    generatedDescription: string;  // AI-generated market description
    resolutionDate: string;        // Final resolution date
    category: MarketCategory;
    reasoning: string;
    processingTime: number;
}

// ============================================
// COMPLETE VERIFICATION RESULT
// ============================================
export interface CerberusVerdict {
    marketId: string;
    marketTitle: string;
    timestamp: number;

    // Layer Results
    layer1: Layer1Result;
    layer2: Layer2Result;
    layer3: Layer3Result;

    // Final Decision
    finalStatus: 'VERIFIED' | 'FLAGGED' | 'REJECTED';
    action: 'APPROVE' | 'MANUAL_REVIEW' | 'REFUND_AND_DELETE';

    // If verified
    checkmark: boolean;            // Show rosado/cafe checkmark
    resolutionDate: string | null;
    aiDescription: string | null;
    category: MarketCategory;

    // Processing stats
    totalProcessingTime: number;
    verifiedAt: number | null;
}

// ============================================
// DASHBOARD STATE
// ============================================
export interface DashboardMarket extends MarketData {
    verificationStatus: MarketStatus;
    verdict?: CerberusVerdict;
    currentLayer: 0 | 1 | 2 | 3;   // 0 = not started
    layerProgress: {
        layer1: 'pending' | 'processing' | 'passed' | 'failed';
        layer2: 'pending' | 'processing' | 'passed' | 'failed';
        layer3: 'pending' | 'processing' | 'passed' | 'failed';
    };
    checkmark: boolean;
    resolutionDate: string | null;
    aiDescription: string | null;
}

export interface DashboardState {
    markets: DashboardMarket[];
    lastUpdated: number;
    isPolling: boolean;
    processingQueue: string[];     // Market IDs being processed
    stats: {
        totalMarkets: number;
        verified: number;
        flagged: number;
        rejected: number;
        pending: number;
    };
}

// ============================================
// API RESPONSES
// ============================================
export interface DjinnMarketsResponse {
    success: boolean;
    markets: MarketData[];
    pagination: {
        page: number;
        limit: number;
        total: number;
    };
}

export interface VerificationRequest {
    marketId: string;
    priority?: 'normal' | 'high';
}

export interface WebhookPayload {
    event: 'market_verified' | 'market_rejected' | 'market_flagged';
    marketId: string;
    verdict: CerberusVerdict;
    timestamp: number;
}

// LLM Generic Response
export interface LLMVerdict {
    is_verifiable: boolean;
    confidence_score: number;
    risk_flags: string[];
    reasoning_summary: string;
}

// ============================================
// THE 3 DOGS VALIDATION ENGINE
// ============================================

export type ValidationStatus = 'LIVE' | 'CANCELLED' | 'AWAITING_MANUAL_DATE';

export interface SentryReport {
    urlValid: boolean;
    foundDates: string[]; // Dates from HTML headers/meta tags
    metadata: any;
}

export interface HunterAnalysis {
    coherenceScore: number;
    foundDates: string[]; // Explicit dates from text
    reasoning: string;
}

export interface OracleVerdict {
    resolvabilityScore: number; // 0-100
    isQualityMarket: boolean;   // if score >= 90
    finalStatus: ValidationStatus;
    hasDate: boolean;
    finalResolutionDate: string | null;
    reason: string;
}

export interface ValidationVerdict {
    status: ValidationStatus;
    reason: string;
    sentry: SentryReport;
    hunter: HunterAnalysis;
    oracle: OracleVerdict;
}

// ============================================
// LLM RESPONSE SCHEMAS
// ============================================
export interface LLMLayer1Response {
    has_enough_information: boolean;
    extracted_facts: string[];
    summary: string;
    confidence: number;
}

export interface LLMLayer2Response {
    is_resolvable: boolean;
    has_clear_outcome: boolean;
    is_objective: boolean;
    has_verifiable_date: boolean;
    suggested_resolution_date: string | null;
    risk_flags: string[];
    confidence_score: number;
    reasoning: string;
}

export interface LLMLayer3Response {
    source_is_real: boolean;
    event_is_real: boolean;
    source_trustworthy: boolean;
    date_is_valid: boolean;
    final_verdict: 'APPROVED' | 'FLAGGED' | 'REJECTED';
    generated_description: string;
    resolution_date: string;
    category: string;
    reasoning: string;
}

// ============================================
// CONFIGURATION
// ============================================
export interface CerberusConfig {
    djinnApiUrl: string;
    pollingIntervalMs: number;      // 3 minutes = 180000
    llmProvider: 'anthropic' | 'openai' | 'mock';

    thresholds: {
        layer1MinNews: number;       // Minimum news articles
        layer2MinConfidence: number; // Minimum confidence score
        layer3MinTrust: number;      // Minimum trust score
    };

    fees: FeeStructure;

    webhookUrl?: string;
    webhookSecret?: string;
}

export const DEFAULT_CONFIG: CerberusConfig = {
    djinnApiUrl: 'http://localhost:3000/api',
    pollingIntervalMs: 180000,       // 3 minutes
    llmProvider: 'mock',

    thresholds: {
        layer1MinNews: 1,
        layer2MinConfidence: 70,
        layer3MinTrust: 70,
    },

    fees: {
        creationFee: 2,              // 2 USD
        tradingFeePercent: 1,        // 1%
    }
};
