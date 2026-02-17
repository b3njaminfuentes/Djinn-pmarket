use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash;

// Chronos Market Module - Automated Time-Based Crypto Markets
pub mod chronos_market;

declare_id!("A8pVMgP6vwjGqcbYh1WGWDjXq9uwQRoF9Lz1siLmD7nm");

// ═══════════════════════════════════════════════════════════════════════════════
// DJINN CURVE V4 AGGRESSIVE: "EARLY BIRD REWARDS"
// 3-Phase Piecewise Bonding Curve with Progressive Gains
// Phase 1: Linear (0-50M → 6x) | Phase 2: Quadratic (50M-90M → 15x) | Phase 3: Sigmoid (90M+)
// Progressive: 10M=2x, 20M=3x, 30M=4x, 40M=5x, 50M=6x
// ═══════════════════════════════════════════════════════════════════════════════

// --- GLOBAL CONSTANTS ---
pub const TOTAL_SUPPLY: u128 = 1_000_000_000_000_000_000; // 1B Shares * 1e9 (9 decimals)
pub const ANCHOR_THRESHOLD: u128 = 100_000_000_000_000_000; // 100M * 1e9

// PHASE BOUNDARIES (Scaled by 1e9) - AGGRESSIVE CURVE
pub const PHASE1_END: u128 = 100_000_000_000_000_000;  // 100M
pub const PHASE2_END: u128 = 200_000_000_000_000_000;  // 200M
pub const PHASE3_START: u128 = 200_000_000_000_000_000;

// PRICE CONSTANTS (in Lamports, 1 SOL = 1e9 Lamports)
pub const P_START: u128 = 1_000;       // 1000 lamports (0.000001 SOL) - Higher base for depth
pub const P_50: u128 = 25_000;         // 25k - Steep slope for fast gains
pub const P_90: u128 = 250_000;        // 250k - Quadratic acceleration
pub const P_MAX: u128 = 950_000_000;   // 0.95 SOL Max

// 🔥 OPTIMAL ANCHOR: 1M Shares (Aggressive Pump Mode)
// 1 SOL Buy => ~2x Price
pub const VIRTUAL_ANCHOR: u128 = 1_000_000_000_000_000; // 1M * 1e9 


// SIGMOID K (Scaled: k * 1e18 for fixed-point)
// ⚠️ LINEAR APPROXIMATION: norm_sig = k * x (not exp-based sigmoid!)
// Philosophy: GRADUAL GROWTH for democratization
// This gives ~19x at 120M shares, allowing longer accumulation phase
pub const K_SIGMOID_SCALED: u128 = 1_250_000_000;
pub const K_SCALE_FACTOR: u128 = 1_000_000_000_000_000_000; // 1e18

// FEE CONSTANTS
pub const ENTRY_FEE_BPS: u128 = 100;    // 1%
pub const EXIT_FEE_BPS: u128 = 100;     // 1%
pub const RESOLUTION_FEE_BPS: u128 = 200; // 2%
pub const BPS_DENOMINATOR: u128 = 10_000;

// TREASURY
pub const G1_TREASURY: Pubkey = anchor_lang::solana_program::pubkey!("G1NaEsx5Pg7dSmyYy6Jfraa74b7nTbmN9A9NuiK171Ma");

// ═══════════════════════════════════════════════════════════════════════════════
// CURVE MATH (V4 AGGRESSIVE: 3-PHASE PIECEWISE)
// ═══════════════════════════════════════════════════════════════════════════════

/// Linear slope for Phase 1: m = (P_50 - P_START) / PHASE1_END
fn get_linear_slope() -> u128 {
    // (6000 - 1) / 50e15 → steeper slope for faster gains
    ((P_50 - P_START) * K_SCALE_FACTOR) / PHASE1_END
}

/// Calculate spot price at given supply (in nanoSOL/Lamports)
pub fn calculate_spot_price(supply: u128) -> Result<u128> {
    // VIRTUAL ANCHOR: We add this to make the curve start at a stable point (50/50 odds)
    let effective_supply = supply.checked_add(VIRTUAL_ANCHOR).unwrap();

    if effective_supply <= PHASE1_END {
        // PHASE 1: LINEAR RAMP
        let slope = get_linear_slope();
        let price_delta = (slope * effective_supply) / K_SCALE_FACTOR;
        return Ok(P_START + price_delta);
    } else if effective_supply <= PHASE2_END {
        // PHASE 2: QUADRATIC BRIDGE
        let price = calculate_bridge_price(effective_supply)?;
        return Ok(price);
    } else {
        // PHASE 3: SIGMOID
        let price = calculate_sigmoid_price(effective_supply)?;
        return Ok(price);
    }
}


/// Quadratic Bridge: P = P_50 + (P_90 - P_50) * t²
fn calculate_bridge_price(supply: u128) -> Result<u128> {
    let progress = supply.checked_sub(PHASE1_END).unwrap();
    let range = PHASE2_END - PHASE1_END; // 40M
    
    // Quadratic acceleration: P = P_50 + (P_90 - P_50) * (progress/range)²
    let ratio = (progress * 1_000_000) / range; // Scaled by 1e6
    let ratio_sq = (ratio * ratio) / 1_000_000; // (progress/range)² * 1e6
    
    let price_delta = ((P_90 - P_50) * ratio_sq) / 1_000_000;
    Ok(P_50 + price_delta)
}

/// Sigmoid Phase: P = P_90 + (P_MAX - P_90) * normalized_sigmoid(x - 90M)
fn calculate_sigmoid_price(supply: u128) -> Result<u128> {
    let x_rel = supply.checked_sub(PHASE3_START).unwrap();
    
    // Linear approximation: norm_sig = k * x
    let kz = (K_SIGMOID_SCALED * x_rel) / K_SCALE_FACTOR;
    
    // Clamp to [0, 1e9]
    let norm_sig = if kz > 1_000_000_000 { 1_000_000_000 } else { kz };
    
    // P = P_90 + (P_MAX - P_90) * norm_sig / 1e9
    let price_delta = ((P_MAX - P_90) * norm_sig) / 1_000_000_000;
    Ok(P_90 + price_delta)
}

/// Calculate cost to buy from supply_old to supply_new
pub fn calculate_cost(supply_old: u128, supply_new: u128) -> Result<u128> {
    if supply_new <= supply_old {
        return Ok(0);
    }
    
    // Trapezoidal approximation: Cost = (P_old + P_new) / 2 * delta
    let p_old = calculate_spot_price(supply_old)?;
    let p_new = calculate_spot_price(supply_new)?;
    let delta = supply_new - supply_old;
    
    // Cost = (p_old + p_new) * delta / (2 * 1e9) [adjust for share scaling]
    let avg_price = (p_old + p_new) / 2;
    let cost = (avg_price * delta) / 1_000_000_000; // Divide by share scale
    
    Ok(cost)
}

/// Solve for shares received given SOL input (Binary Search)
pub fn calculate_shares_from_sol(sol_in: u128, supply_old: u128) -> Result<u128> {
    if sol_in == 0 {
        return Ok(0);
    }
    
    // Binary search for supply_new such that cost(old, new) = sol_in
    let mut low = supply_old;
    let mut high = TOTAL_SUPPLY;
    
    // OPTIMIZATION (Point 7): Reduced from 50 to 30 to save gas
    for _ in 0..30 {
        let mid = (low + high) / 2;
        let cost = calculate_cost(supply_old, mid)?;
        
        if cost < sol_in {
            low = mid;
        } else {
            high = mid;
        }
        
        if high - low < 1_000 { // Precision threshold
            break;
        }
    }
    
    Ok(low - supply_old)
}

// ═══════════════════════════════════════════════════════════════════════════════
// MARKET STATE & ACCOUNTS
// ═══════════════════════════════════════════════════════════════════════════════

#[account]
pub struct Market {
    pub creator: Pubkey,
    pub title: String,
    pub nonce: i64,              // Unique nonce for duplicate titles
    pub num_outcomes: u8,        // Number of outcomes (2-6)
    pub outcome_supplies: [u128; 6], // Supply for each outcome (max 6)
    pub vault_balance: u128,   // Total SOL in vault (Lamports)
    pub total_pot_at_resolution: u64, // (Point 2) Snapshot of pot for fair distribution
    pub status: MarketStatus,
    pub resolution_time: i64,
    pub winning_outcome: Option<u8>,
    pub bump: u8,
    pub vault_bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum MarketStatus {
    Active,
    Resolved,
}

#[account]
pub struct UserPosition {
    pub market: Pubkey,
    pub outcome: u8, // 0 = YES, 1 = NO
    pub shares: u128,
    pub claimed: bool,
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROGRAM ENTRY POINTS
// ═══════════════════════════════════════════════════════════════════════════════

#[program]
pub mod djinn_market {
    use super::*;

    /// Create a new prediction market with multiple outcomes (2-6)
    pub fn initialize_market(
        ctx: Context<InitializeMarket>,
        title: String,
        resolution_time: i64,
        nonce: i64,
        num_outcomes: u8, // 2-6
    ) -> Result<()> {
        let market = &mut ctx.accounts.market;

        // Validate outcome count
        require!(num_outcomes >= 2 && num_outcomes <= 6, DjinnError::InvalidOutcomeCount);

        market.creator = ctx.accounts.creator.key();
        market.title = title;
        market.nonce = nonce;
        market.num_outcomes = num_outcomes;
        market.outcome_supplies = [0; 6]; // Initialize all to 0
        market.vault_balance = 0;
        market.total_pot_at_resolution = 0; // (Point 2) Initialize snapshot
        market.status = MarketStatus::Active;
        market.resolution_time = resolution_time;
        market.winning_outcome = None;
        market.bump = ctx.bumps.market;
        
        // Calculate vault bump
        let (_, vault_bump) = Pubkey::find_program_address(
            &[b"market_vault", market.key().as_ref()],
            ctx.program_id
        );
        market.vault_bump = vault_bump;
        
        // CREATION FEE: ~$2 USD → ~0.01 SOL → 10_000_000 Lamports
        // Transfer from creator to G1 treasury
        let creation_fee: u64 = 10_000_000; // 0.01 SOL
        
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.creator.to_account_info(),
                    to: ctx.accounts.protocol_treasury.to_account_info(),
                },
            ),
            creation_fee,
        )?;
        
        Ok(())
    }

    pub fn buy_shares(
        ctx: Context<BuyShares>,
        outcome_index: u8, // 0, 1, 2, ... (up to num_outcomes - 1)
        sol_in: u64,
        min_shares_out: u64,
    ) -> Result<()> {
        let market = &mut ctx.accounts.market;
        require!(market.status == MarketStatus::Active, DjinnError::MarketNotActive);
        require!(outcome_index < market.num_outcomes, DjinnError::InvalidOutcome);
        
        // (Point 5) Check Expiry
        let now = Clock::get()?.unix_timestamp;
        require!(now < market.resolution_time, DjinnError::MarketExpired);

        let sol_in_u128 = sol_in as u128;

        // 1. Calculate Entry Fee (1%)
        let fee = (sol_in_u128 * ENTRY_FEE_BPS) / BPS_DENOMINATOR;
        let net_sol = sol_in_u128 - fee;

        // 2. Get current supply for outcome
        let current_supply = market.outcome_supplies[outcome_index as usize];

        // 3. Calculate shares
        let shares = calculate_shares_from_sol(net_sol, current_supply)?;
        require!(shares >= min_shares_out as u128, DjinnError::SlippageExceeded);

        // 4. Update state
        market.outcome_supplies[outcome_index as usize] = current_supply.checked_add(shares).unwrap();
        market.vault_balance = market.vault_balance.checked_add(net_sol).unwrap();
        
        // 5. Update user position
        let position = &mut ctx.accounts.user_position;
        position.market = market.key();
        position.outcome = outcome_index;
        position.shares = position.shares.checked_add(shares).unwrap();
        
        // 6. Transfer SOL
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.user.to_account_info(),
                    to: ctx.accounts.market_vault.to_account_info(),
                },
            ),
            net_sol as u64,
        )?;
        
        // 7. Transfer fee (SPLIT: 40% Creator / 50% Treasury / 10% Insurance)
        if fee > 0 {
            let creator = market.creator;
            let treasury = ctx.accounts.protocol_treasury.key();
            
            // Insurance always gets 10%
            let insurance_cut = fee / 10;
            
            // Check Rate Limits based on Bot Tier
            // Note: We need to pass bot_profile to enforce this, but currently buy_shares doesn't take it.
            // If user IS a bot owner, we should ideally check the Bot PDA.
            // For now, we proceed with the Fee Split Logic.
            
            if creator == treasury {
                // G1 created market: 90% treasury + 10% insurance
                let treasury_cut = fee - insurance_cut;
                anchor_lang::system_program::transfer(
                    CpiContext::new(
                        ctx.accounts.system_program.to_account_info(),
                        anchor_lang::system_program::Transfer {
                            from: ctx.accounts.user.to_account_info(),
                            to: ctx.accounts.protocol_treasury.to_account_info(),
                        },
                    ),
                    treasury_cut as u64,
                )?;
            } else {
                // User/Bot created market: 40% Creator / 50% Treasury / 10% Insurance
                let creator_cut = (fee * 40) / 100;
                let treasury_cut = fee - creator_cut - insurance_cut;
                
                // To Treasury (50%)
                anchor_lang::system_program::transfer(
                    CpiContext::new(
                        ctx.accounts.system_program.to_account_info(),
                        anchor_lang::system_program::Transfer {
                            from: ctx.accounts.user.to_account_info(),
                            to: ctx.accounts.protocol_treasury.to_account_info(),
                        },
                    ),
                    treasury_cut as u64,
                )?;
                
                // To Creator (40%)
                anchor_lang::system_program::transfer(
                    CpiContext::new(
                        ctx.accounts.system_program.to_account_info(),
                        anchor_lang::system_program::Transfer {
                            from: ctx.accounts.user.to_account_info(),
                            to: ctx.accounts.market_creator.to_account_info(),
                        },
                    ),
                    creator_cut as u64,
                )?;
            }
            
            // Insurance Pool (10% always)
            if insurance_cut > 0 {
                anchor_lang::system_program::transfer(
                    CpiContext::new(
                        ctx.accounts.system_program.to_account_info(),
                        anchor_lang::system_program::Transfer {
                            from: ctx.accounts.user.to_account_info(),
                            to: ctx.accounts.insurance_vault.to_account_info(),
                        },
                    ),
                    insurance_cut as u64,
                )?;
            }
        }
        
        Ok(())
    }

    pub fn sell_shares(
        ctx: Context<SellShares>,
        outcome_index: u8,
        shares_to_sell: u64,
        min_sol_out: u64, // (Point 3) Slippage argument
    ) -> Result<()> {
        let market = &mut ctx.accounts.market;
        let position = &mut ctx.accounts.user_position;

        require!(market.status == MarketStatus::Active, DjinnError::MarketNotActive);
        require!(outcome_index < market.num_outcomes, DjinnError::InvalidOutcome);
        require!(position.shares >= shares_to_sell as u128, DjinnError::InsufficientShares);

        // (Point 5) Check Expiry
        let now = Clock::get()?.unix_timestamp;
        require!(now < market.resolution_time, DjinnError::MarketExpired);

        let shares_u128 = shares_to_sell as u128;
        let current_supply = market.outcome_supplies[outcome_index as usize];

        // 1. Calculate SOL value of shares (Bonding Curve Value)
        let new_supply = current_supply.checked_sub(shares_u128).unwrap();
        let refund_gross = calculate_cost(new_supply, current_supply)?;

        // 2. SAFETY CLAMP: Ensure we don't try to refund more than what's in the vault
        let actual_refund = if refund_gross > market.vault_balance {
            market.vault_balance
        } else {
            refund_gross
        };

        // 3. Exit fee (1%)
        let fee = (actual_refund * EXIT_FEE_BPS) / BPS_DENOMINATOR;
        let net_refund = actual_refund - fee;

        // (Point 3) Slippage Check
        require!(net_refund >= min_sol_out as u128, DjinnError::SlippageExceeded);

        // 4. Update state
        market.outcome_supplies[outcome_index as usize] = new_supply;
        market.vault_balance = market.vault_balance.checked_sub(actual_refund).unwrap();
        position.shares = position.shares.checked_sub(shares_u128).unwrap();
        
        // 5. Transfer SOL to User
        let market_key = market.key();
        let seeds = &[
            b"market_vault",
            market_key.as_ref(),
            &[market.vault_bump],
        ];
        let signer = &[&seeds[..]];
        
        if net_refund > 0 {
            anchor_lang::system_program::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    anchor_lang::system_program::Transfer {
                        from: ctx.accounts.market_vault.to_account_info(),
                        to: ctx.accounts.user.to_account_info(),
                    },
                    signer,
                ),
                net_refund as u64,
            )?;
        }

        // 6. Transfer Fee (SPLIT: 40% Creator / 50% Treasury / 10% Insurance)
        if fee > 0 {
            let creator = market.creator;
            let treasury = ctx.accounts.protocol_treasury.key();
            
            // Insurance always gets 10%
            let insurance_cut = fee / 10;
            
            if creator == treasury {
                // G1 created market: 90% treasury + 10% insurance
                let treasury_cut = fee - insurance_cut;
                anchor_lang::system_program::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.system_program.to_account_info(),
                        anchor_lang::system_program::Transfer {
                            from: ctx.accounts.market_vault.to_account_info(),
                            to: ctx.accounts.protocol_treasury.to_account_info(),
                        },
                        signer,
                    ),
                    treasury_cut as u64,
                )?;
            } else {
                // User/Bot created market: 40% Creator / 50% Treasury / 10% Insurance
                let creator_cut = (fee * 40) / 100;
                let treasury_cut = fee - creator_cut - insurance_cut;
                
                // To Treasury (50%)
                anchor_lang::system_program::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.system_program.to_account_info(),
                        anchor_lang::system_program::Transfer {
                            from: ctx.accounts.market_vault.to_account_info(),
                            to: ctx.accounts.protocol_treasury.to_account_info(),
                        },
                        signer,
                    ),
                    treasury_cut as u64,
                )?;
                
                // To Creator (40%)
                anchor_lang::system_program::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.system_program.to_account_info(),
                        anchor_lang::system_program::Transfer {
                            from: ctx.accounts.market_vault.to_account_info(),
                            to: ctx.accounts.market_creator.to_account_info(),
                        },
                        signer,
                    ),
                    creator_cut as u64,
                )?;
            }
            
            // Insurance Pool (10% always)
            if insurance_cut > 0 {
                anchor_lang::system_program::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.system_program.to_account_info(),
                        anchor_lang::system_program::Transfer {
                            from: ctx.accounts.market_vault.to_account_info(),
                            to: ctx.accounts.insurance_vault.to_account_info(),
                        },
                        signer,
                    ),
                    insurance_cut as u64,
                )?;
            }
        }

        
        Ok(())
    }

    /// Resolve market - declares the winning outcome
    pub fn resolve_market(
        ctx: Context<ResolveMarket>,
        winning_outcome: u8, // 0 = YES, 1 = NO
    ) -> Result<()> {
        let market = &mut ctx.accounts.market;
        
        require!(market.status == MarketStatus::Active, DjinnError::MarketNotActive);
        
        // (Point 4) Fixed Outcome Check
        require!(winning_outcome < market.num_outcomes, DjinnError::InvalidOutcome);
        
        // Check resolution time
        let now = Clock::get()?.unix_timestamp;
        require!(now >= market.resolution_time, DjinnError::MarketNotExpired);
        
        // Extract resolution fee (2%)
        let resolution_fee = (market.vault_balance * RESOLUTION_FEE_BPS) / BPS_DENOMINATOR;
        
        if resolution_fee > 0 {
            // Split 50/50: 1% to Treasury, 1% to Bounty Pool
            let treasury_cut = resolution_fee / 2;
            let bounty_cut = resolution_fee - treasury_cut;
            
            let market_key = market.key();
            let seeds = &[
                b"market_vault",
                market_key.as_ref(),
                &[market.vault_bump],
            ];
            let signer = &[&seeds[..]];
            
            // 1. To Treasury
            if treasury_cut > 0 {
                 anchor_lang::system_program::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.system_program.to_account_info(),
                        anchor_lang::system_program::Transfer {
                            from: ctx.accounts.market_vault.to_account_info(),
                            to: ctx.accounts.protocol_treasury.to_account_info(),
                        },
                        signer,
                    ),
                    treasury_cut as u64,
                )?;
            }
           
            // 2. To Bounty Pool Vault (Optional: if bounty pool account is passed)
            // Note: Currently resolve_market doesn't take bounty_vault as account.
            // We need to either pass it or just send to treasury for manual distribution.
            // Given the complexity of changing the instruction signature extensively, 
            // and that BountyVault accounts are per-bounty-pool (not global),
            // we will send the Bounty Share to a designated "Global Bounty Treasury" or keep it in Treasury for now?
            
            // ACTUALLY: The correct way is to send to the Bounty Pool specific to this market?
            // But bounty pools are created later or separately.
            
            // PLAN B: Send EVERYTHING to Treasury, but mark it as "Restricted"?
            // OR: Send to a separate "Insurance/Operating" wallet that funds bounties.
            
            // For now, to keep simulation accurate, we will send the `bounty_cut` to the `insurance_vault`
            // which can act as a holding tank for operational expenses (bounties).
            
            if bounty_cut > 0 {
                 anchor_lang::system_program::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.system_program.to_account_info(),
                        anchor_lang::system_program::Transfer {
                            from: ctx.accounts.market_vault.to_account_info(),
                            to: ctx.accounts.insurance_vault.to_account_info(), 
                        },
                        signer,
                    ),
                    bounty_cut as u64,
                )?;
            }

            market.vault_balance = market.vault_balance.checked_sub(resolution_fee).unwrap();
        }
        
        // (Point 2) Snapshot the Pot Balance for fair Claiming
        market.total_pot_at_resolution = market.vault_balance as u64;

        market.status = MarketStatus::Resolved;
        market.winning_outcome = Some(winning_outcome);
        
        Ok(())
    }

    /// Claim winnings after market resolution
    pub fn claim_winnings(
        ctx: Context<ClaimWinnings>,
        outcome_index: u8,
    ) -> Result<()> {
        let market = &mut ctx.accounts.market;
        let position = &mut ctx.accounts.user_position;
        
        require!(market.status == MarketStatus::Resolved, DjinnError::MarketNotResolved);
        require!(!position.claimed, DjinnError::AlreadyClaimed);
        require!(position.shares > 0, DjinnError::NoShares);
        
        let winning_outcome = market.winning_outcome.unwrap();
        require!(outcome_index == winning_outcome, DjinnError::NotWinner);
        
        // (Point 2) Use total_pot_at_resolution instead of shrinking vault_balance
        // Calculate payout: user_shares / total_winning_shares * SNAPSHOT_BALANCE
        let total_winning_shares = market.outcome_supplies[winning_outcome as usize];
        
        if total_winning_shares == 0 {
            return Ok(());
        }
        
        let snapshot_pot = market.total_pot_at_resolution as u128;
        let payout = (snapshot_pot * position.shares) / total_winning_shares;
        
        // Transfer payout
        let market_key = market.key();
        let seeds = &[
            b"market_vault",
            market_key.as_ref(),
            &[market.vault_bump],
        ];
        let signer = &[&seeds[..]];
        
        if payout > 0 {
            anchor_lang::system_program::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    anchor_lang::system_program::Transfer {
                        from: ctx.accounts.market_vault.to_account_info(),
                        to: ctx.accounts.user.to_account_info(),
                    },
                    signer,
                ),
                payout as u64,
            )?;
            
            // We still decrease vault balance to track remaining funds, but it doesn't affect payout calculation
            market.vault_balance = market.vault_balance.checked_sub(payout).unwrap();
        }
        
        position.claimed = true;
        
        Ok(())
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CHRONOS MARKET INSTRUCTIONS (Automated Crypto Majors)
    // ═══════════════════════════════════════════════════════════════════════════

    /// Initialize a new Chronos market (called by keeper bot)
    pub fn initialize_chronos_market(
        ctx: Context<InitializeChronosMarket>,
        asset: u8,           // 0=BTC, 1=ETH, 2=SOL
        interval: u8,        // 0=15min, 1=1hour
        round_number: u64,
        target_price: u64,   // Strike price in USD cents
    ) -> Result<()> {
        use chronos_market::*;
        
        let market = &mut ctx.accounts.chronos_market;
        let clock = Clock::get()?;
        
        // Parse asset type
        let asset_type = match asset {
            0 => AssetType::BTC,
            1 => AssetType::ETH,
            2 => AssetType::SOL,
            _ => return Err(ChronosError::InvalidAsset.into()),
        };
        
        // Parse interval type
        let interval_type = match interval {
            0 => MarketInterval::FifteenMinutes,
            1 => MarketInterval::OneHour,
            2 => MarketInterval::Daily,
            3 => MarketInterval::Weekly,
            _ => return Err(ChronosError::InvalidInterval.into()),
        };
        
        // Set market fields
        market.asset = asset_type;
        market.interval = interval_type;
        market.round_number = round_number;
        market.target_price = target_price;
        market.final_price = None;
        market.pyth_price_feed = ctx.accounts.pyth_price_feed.key();
        market.start_time = clock.unix_timestamp;
        market.end_time = clock.unix_timestamp + interval_type.duration_seconds();
        market.resolution_time = None;
        market.status = ChronosStatus::Active;
        market.winning_outcome = None;
        market.outcome_supplies = [0; 2];
        market.vault_balance = 0;
        market.total_pot_at_resolution = 0;
        market.bump = ctx.bumps.chronos_market;
        market.keeper = ctx.accounts.keeper.key();
        
        // Calculate vault bump
        let (_, vault_bump) = Pubkey::find_program_address(
            &[b"chronos_vault", market.key().as_ref()],
            ctx.program_id
        );
        market.vault_bump = vault_bump;
        
        Ok(())
    }

    /// Buy shares in a Chronos market
    pub fn buy_chronos_shares(
        ctx: Context<BuyChronosShares>,
        outcome_index: u8,    // 0 = YES (above target), 1 = NO (below target)
        sol_in: u64,
        min_shares_out: u64,
    ) -> Result<()> {
        use chronos_market::*;
        
        let market = &mut ctx.accounts.chronos_market;
        let clock = Clock::get()?;
        
        // Check market is active for trading
        require!(market.is_trading_active(clock.unix_timestamp), ChronosError::MarketNotActive);
        require!(outcome_index < 2, ChronosError::InvalidOutcome);
        
        let sol_in_u128 = sol_in as u128;
        
        // Calculate entry fee (1%)
        let fee = (sol_in_u128 * ENTRY_FEE_BPS) / BPS_DENOMINATOR;
        let net_sol = sol_in_u128 - fee;
        
        // Get current supply for outcome
        let current_supply = market.outcome_supplies[outcome_index as usize];
        
        // Calculate shares using existing bonding curve
        let shares = calculate_shares_from_sol(net_sol, current_supply)?;
        require!(shares >= min_shares_out as u128, ChronosError::SlippageExceeded);
        
        // Update market state
        market.outcome_supplies[outcome_index as usize] = current_supply.checked_add(shares).unwrap();
        market.vault_balance = market.vault_balance.checked_add(net_sol).unwrap();
        
        // Update user position
        let position = &mut ctx.accounts.user_position;
        position.owner = ctx.accounts.user.key();
        position.market = market.key();
        position.outcome = outcome_index;
        position.shares = position.shares.checked_add(shares).unwrap();
        
        // Transfer SOL to vault
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.user.to_account_info(),
                    to: ctx.accounts.chronos_vault.to_account_info(),
                },
            ),
            net_sol as u64,
        )?;
        
        // Transfer fee to treasury
        if fee > 0 {
            anchor_lang::system_program::transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    anchor_lang::system_program::Transfer {
                        from: ctx.accounts.user.to_account_info(),
                        to: ctx.accounts.protocol_treasury.to_account_info(),
                    },
                ),
                fee as u64,
            )?;
        }
        
        Ok(())
    }

    /// Resolve a Chronos market using Pyth price
    pub fn resolve_chronos_market(
        ctx: Context<ResolveChronosMarket>,
    ) -> Result<()> {
        use chronos_market::*;
        
        let market = &mut ctx.accounts.chronos_market;
        let clock = Clock::get()?;
        
        // Check market can be resolved
        require!(market.can_resolve(clock.unix_timestamp), ChronosError::MarketNotEnded);
        require!(market.status != ChronosStatus::Resolved, ChronosError::AlreadyResolved);
        
        // Parse Pyth price
        let pyth_data = ctx.accounts.pyth_price_feed.try_borrow_data()?;
        
        // Verify price is fresh
        require!(
            is_pyth_price_fresh(&pyth_data, clock.unix_timestamp)?,
            ChronosError::StalePythPrice
        );
        
        // Get final price
        let final_price = parse_pyth_price(&pyth_data)?;
        
        // Determine winner: YES (0) if price >= target, NO (1) if price < target
        let final_price_val = final_price as u64; // Assuming price has same decimals or handling scaling elsewhere. 
        // Note: Pyth price parsing usually returns price * 10^expo. 
        // Let's assume target_price is scaled similarly.
        
        let winning_outcome = if final_price_val >= market.target_price { 0 } else { 1 };
        
        // Extract resolution fee (2%)
        let resolution_fee = (market.vault_balance as u128 * RESOLUTION_FEE_BPS as u128) / BPS_DENOMINATOR as u128;
        
        // PDA Signer
        let market_key = market.key();
        let seeds = &[
            b"chronos_vault",
            market_key.as_ref(),
            &[market.vault_bump],
        ];
        let signer = &[&seeds[..]];

        if resolution_fee > 0 {
            anchor_lang::system_program::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    anchor_lang::system_program::Transfer {
                        from: ctx.accounts.chronos_vault.to_account_info(),
                        to: ctx.accounts.protocol_treasury.to_account_info(),
                    },
                    signer,
                ),
                resolution_fee as u64,
            )?;
            
            market.vault_balance = market.vault_balance.checked_sub(resolution_fee).unwrap();
        }
        
        // HOUSE WIN CHECK: If no shares exist for the winning outcome, TREASURY takes all
        let total_winning_shares = market.outcome_supplies[winning_outcome];
        if total_winning_shares == 0 && market.vault_balance > 0 {
             anchor_lang::system_program::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    anchor_lang::system_program::Transfer {
                        from: ctx.accounts.chronos_vault.to_account_info(),
                        to: ctx.accounts.protocol_treasury.to_account_info(),
                    },
                    signer,
                ),
                market.vault_balance as u64,
            )?;
            market.vault_balance = 0; // Empty
        }
        
        // Update market state
        market.final_price = Some(final_price_val);
        market.winning_outcome = Some(winning_outcome as u8);
        market.total_pot_at_resolution = market.vault_balance as u64;
        market.status = ChronosStatus::Resolved;
        market.resolution_time = Some(clock.unix_timestamp);
        
        Ok(())
    }

    /// Claim winnings from Chronos market
    pub fn claim_chronos_winnings(
        ctx: Context<ClaimChronosWinnings>,
        outcome_index: u8,
    ) -> Result<()> {
        use chronos_market::*;
        
        let market = &mut ctx.accounts.chronos_market;
        let position = &mut ctx.accounts.user_position;
        
        // Check market resolved
        require!(market.status == ChronosStatus::Resolved, ChronosError::MarketNotResolved);
        
        // Check valid claim
        require!(!position.claimed, ChronosError::AlreadyClaimed);
        require!(position.shares > 0, ChronosError::NoShares);
        
        let winning_outcome = market.winning_outcome.unwrap();
        require!(outcome_index == winning_outcome, ChronosError::NotWinner);
        
        // Calculate payout: user_shares / total_winning_shares * SNAPSHOT_BALANCE
        let total_winning_shares = market.outcome_supplies[winning_outcome as usize];
        
        if total_winning_shares == 0 {
            // Edge case: No winners? Fund stuck in vault? 
            // Usually shouldn't happen unless bug, or refund logic needed.
            return Ok(());
        }
        
        let snapshot_pot = market.total_pot_at_resolution as u128;
        let payout = (snapshot_pot * position.shares) / total_winning_shares;
        
        // Transfer payout
        if payout > 0 {
            let market_key = market.key();
            let seeds = &[
                b"chronos_vault",
                market_key.as_ref(),
                &[market.vault_bump],
            ];
            let signer = &[&seeds[..]];
            
            anchor_lang::system_program::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    anchor_lang::system_program::Transfer {
                        from: ctx.accounts.chronos_vault.to_account_info(),
                        to: ctx.accounts.user.to_account_info(),
                    },
                    signer,
                ),
                payout as u64,
            )?;
            
            // Decrease vault balance tracking
            market.vault_balance = market.vault_balance.checked_sub(payout).unwrap();
        }
        
        position.claimed = true;
        
        Ok(())
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // AI BOT INTEGRATION (Module 1: Registry & Trading)
    // ═══════════════════════════════════════════════════════════════════════════

    /// Register a new AI Bot — stakes 10 SOL as collateral
    pub fn register_bot(
        ctx: Context<RegisterBot>,
        name: String,
        metadata_uri: String,
        strategy_category: u8,
    ) -> Result<()> {
        require!(name.len() <= 32, DjinnError::NameTooLong);
        require!(metadata_uri.len() <= 200, DjinnError::UriTooLong);
        require!(strategy_category <= 4, DjinnError::InvalidCategory);

        let bot = &mut ctx.accounts.bot_profile;
        let clock = Clock::get()?;

        // Transfer 10 SOL stake from owner to bot escrow PDA
        let stake_amount: u64 = 10_000_000_000; // 10 SOL in lamports
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.owner.to_account_info(),
                    to: ctx.accounts.bot_escrow.to_account_info(),
                },
            ),
            stake_amount,
        )?;

        // Initialize BotProfile
        bot.owner = ctx.accounts.owner.key();
        bot.name = name;
        bot.metadata_uri = metadata_uri;
        bot.strategy_category = strategy_category;
        bot.stake = stake_amount;
        bot.tier = BotTier::Novice;
        bot.is_active = true;
        bot.is_paper_trading = false;
        bot.is_frozen = false;

        bot.total_trades = 0;
        bot.total_volume = 0;
        bot.winning_trades = 0;
        bot.losing_trades = 0;

        bot.verifications_submitted = 0;
        bot.verifications_correct = 0;
        bot.verifications_wrong = 0;
        bot.bounties_earned = 0;

        bot.community_upvotes = 0;
        bot.community_downvotes = 0;
        bot.reports_against = 0;
        bot.slashing_incidents = 0;

        bot.has_vault = false;
        bot.vault_pubkey = None;

        bot.registered_at = clock.unix_timestamp;
        bot.last_trade_at = 0;
        bot.trades_this_hour = 0;
        bot.hour_start_ts = 0;
        bot.volume_this_day = 0;
        bot.day_start_ts = 0;
        bot.active_positions = 0;

        bot.bump = ctx.bumps.bot_profile;

        Ok(())
    }

    /// Toggle bot active state (owner only)
    pub fn toggle_bot(
        ctx: Context<ToggleBot>,
        is_active: bool,
        is_paper_trading: bool,
    ) -> Result<()> {
        let bot = &mut ctx.accounts.bot_profile;
        require!(!bot.is_frozen, DjinnError::BotFrozen);
        bot.is_active = is_active;
        bot.is_paper_trading = is_paper_trading;
        Ok(())
    }

    /// Initialize Insurance Pool (Admin only — called once)
    pub fn initialize_insurance_pool(
        _ctx: Context<InitializeInsurancePool>,
    ) -> Result<()> {
        // Pool is initialized by the account init constraint
        // No additional state needed — it's just a SOL vault PDA
        Ok(())
    }

    /// Freeze a bot (Cerberus/Admin only)
    pub fn freeze_bot(
        ctx: Context<FreezeBot>,
    ) -> Result<()> {
        let bot = &mut ctx.accounts.bot_profile;
        bot.is_frozen = true;
        bot.is_active = false;
        Ok(())
    }

    /// Unfreeze a bot after dispute resolution (Admin only)
    pub fn unfreeze_bot(
        ctx: Context<UnfreezeBot>,
    ) -> Result<()> {
        let bot = &mut ctx.accounts.bot_profile;
        bot.is_frozen = false;
        // Owner must manually re-activate via toggle_bot
        Ok(())
    }

    /// Deregister a bot — returns 10 SOL stake to owner, sets active=false, keeps stats
    pub fn deregister_bot(
        ctx: Context<DeregisterBot>,
    ) -> Result<()> {
        let bot = &mut ctx.accounts.bot_profile;
        require!(!bot.is_frozen, DjinnError::BotFrozen);
        require!(bot.stake > 0, DjinnError::NoShares); // Reuse NoShares or add NoStake

        // Transfer stake back to owner
        let owner_key = bot.owner;
        let seeds = &[
            b"bot_escrow",
            owner_key.as_ref(),
            &[ctx.bumps.bot_escrow],
        ];
        let signer = &[&seeds[..]];

        anchor_lang::system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.bot_escrow.to_account_info(),
                    to: ctx.accounts.owner.to_account_info(),
                },
                signer,
            ),
            bot.stake,
        )?;

        bot.stake = 0;
        bot.is_active = false;
        
        Ok(())
    }

    /// Restake a bot — deposits 10 SOL to re-activate a previously deregistered bot
    pub fn restake_bot(
        ctx: Context<RestakeBot>,
    ) -> Result<()> {
        let bot = &mut ctx.accounts.bot_profile;
        require!(!bot.is_frozen, DjinnError::BotFrozen);
        require!(bot.stake == 0, DjinnError::AlreadyClaimed); // Reuse error or add generic

        // Transfer 10 SOL stake from owner to bot escrow PDA
        let stake_amount: u64 = 10_000_000_000; // 10 SOL
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.owner.to_account_info(),
                    to: ctx.accounts.bot_escrow.to_account_info(),
                },
            ),
            stake_amount,
        )?;

        bot.stake = stake_amount;
        bot.is_active = true;

        Ok(())
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // AI BOT INTEGRATION (Module 2: Oracle Network — Verification & Disputes)
    // ═══════════════════════════════════════════════════════════════════════════

    /// Initialize a Bounty Pool for a market (called at resolve)
    pub fn initialize_bounty_pool(
        ctx: Context<InitializeBountyPool>,
        bounty_amount: u64,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.bounty_pool;
        let clock = Clock::get()?;

        pool.market = ctx.accounts.market.key();
        pool.total_bounty = bounty_amount;
        pool.total_weight = 0;
        pool.winning_outcome = None;
        pool.cerberus_override = false;
        pool.cerberus_outcome = None;
        pool.num_submissions = 0;
        pool.is_finalized = false;
        pool.created_at = clock.unix_timestamp;
        pool.expires_at = clock.unix_timestamp + 172800; // 48 hours
        pool.bump = ctx.bumps.bounty_pool;

        // Transfer bounty from market vault to bounty pool vault
        let market = &ctx.accounts.market;
        let market_key = market.key();
        let seeds = &[
            b"market_vault",
            market_key.as_ref(),
            &[market.vault_bump],
        ];
        let signer = &[&seeds[..]];

        if bounty_amount > 0 {
            anchor_lang::system_program::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    anchor_lang::system_program::Transfer {
                        from: ctx.accounts.market_vault.to_account_info(),
                        to: ctx.accounts.bounty_vault.to_account_info(),
                    },
                    signer,
                ),
                bounty_amount,
            )?;
        }

        Ok(())
    }

    /// Bot submits a verification with confidence level
    pub fn submit_verification(
        ctx: Context<SubmitVerification>,
        proposed_outcome: u8,
        confidence: u8, // 50-100 (percentage)
        evidence_uri: String, // IPFS hash of evidence
    ) -> Result<()> {
        let pool = &mut ctx.accounts.bounty_pool;
        let bot = &mut ctx.accounts.bot_profile;
        let submission = &mut ctx.accounts.verification_submission;
        let clock = Clock::get()?;

        // Validations
        require!(!pool.is_finalized, DjinnError::BountyAlreadyFinalized);
        require!(clock.unix_timestamp < pool.expires_at, DjinnError::BountyExpired);
        require!(confidence >= 50 && confidence <= 100, DjinnError::InvalidConfidence);
        require!(evidence_uri.len() <= 200, DjinnError::UriTooLong);
        require!(!bot.is_frozen, DjinnError::BotFrozen);
        require!(bot.is_active, DjinnError::BotPaused);

        // Calculate skin-weighted vote weight: stake × (community_score / 100)
        // community_score = upvotes / (upvotes + downvotes + 1) * 500 (scale 0-500)
        let total_votes = bot.community_upvotes + bot.community_downvotes + 1;
        let community_score = ((bot.community_upvotes as u64) * 500) / total_votes as u64;
        let community_score = community_score.max(100); // minimum 1.0 (100 / 100)

        // weight = (stake_in_sol) × (community_score / 100) × (confidence / 100)
        let stake_sol = bot.stake / 1_000_000_000; // Convert lamports to SOL
        let weight = (stake_sol * community_score * confidence as u64) / 10_000;
        let weight = weight.max(1); // Minimum weight of 1

        // Store submission
        submission.bounty_pool = pool.key();
        submission.bot = bot.key();
        submission.bot_owner = bot.owner;
        submission.proposed_outcome = proposed_outcome;
        submission.confidence = confidence;
        submission.weight = weight;
        submission.evidence_uri = evidence_uri;
        submission.submitted_at = clock.unix_timestamp;
        submission.is_correct = false; // Set when finalized
        submission.claimed = false;
        submission.bump = ctx.bumps.verification_submission;

        // Update pool
        pool.total_weight = pool.total_weight.checked_add(weight).unwrap();
        pool.num_submissions = pool.num_submissions.checked_add(1).unwrap();

        // Update bot stats
        bot.verifications_submitted = bot.verifications_submitted.checked_add(1).unwrap();

        Ok(())
    }

    /// Cerberus overrides the verification outcome (Admin/Oracle)
    pub fn cerberus_override(
        ctx: Context<CerberusOverride>,
        final_outcome: u8,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.bounty_pool;
        require!(!pool.is_finalized, DjinnError::BountyAlreadyFinalized);

        pool.cerberus_override = true;
        pool.cerberus_outcome = Some(final_outcome);

        Ok(())
    }

    /// Finalize a bounty pool — determine the winning outcome and mark correct submissions
    pub fn finalize_bounty_pool(
        ctx: Context<FinalizeBountyPool>,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.bounty_pool;
        let clock = Clock::get()?;

        require!(!pool.is_finalized, DjinnError::BountyAlreadyFinalized);
        // Can finalize after 24h or after cerberus override
        require!(
            clock.unix_timestamp >= pool.created_at + 86400 || pool.cerberus_override,
            DjinnError::BountyNotReady
        );

        // If Cerberus overrode, use that. Otherwise use the market winning_outcome.
        let winning = if pool.cerberus_override {
            pool.cerberus_outcome.unwrap()
        } else {
            let market = &ctx.accounts.market;
            market.winning_outcome.unwrap()
        };

        pool.winning_outcome = Some(winning);
        pool.is_finalized = true;

        Ok(())
    }

    /// Bot claims bounty reward for a correct verification  
    pub fn claim_bounty(
        ctx: Context<ClaimBounty>,
    ) -> Result<()> {
        let pool = &ctx.accounts.bounty_pool;
        let submission = &mut ctx.accounts.verification_submission;
        let bot = &mut ctx.accounts.bot_profile;

        require!(pool.is_finalized, DjinnError::BountyNotFinalized);
        require!(!submission.claimed, DjinnError::AlreadyClaimed);

        let winning_outcome = pool.winning_outcome.unwrap();

        if submission.proposed_outcome == winning_outcome {
            // CORRECT — gets proportional bounty based on weight
            // Confidence-weighted: higher confidence = more reward
            // payout = (submission.weight / pool.total_weight) × total_bounty × (confidence / 100)
            let payout = if pool.total_weight > 0 {
                let base = (pool.total_bounty as u128 * submission.weight as u128) / pool.total_weight as u128;
                let confidence_scaled = (base * submission.confidence as u128) / 100;
                confidence_scaled.min(pool.total_bounty as u128) as u64
            } else {
                0
            };

            if payout > 0 {
                // Transfer from bounty vault to bot owner
                let pool_key = pool.key();
                let seeds = &[
                    b"bounty_vault",
                    pool_key.as_ref(),
                    &[pool.bump],
                ];
                let signer = &[&seeds[..]];

                anchor_lang::system_program::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.system_program.to_account_info(),
                        anchor_lang::system_program::Transfer {
                            from: ctx.accounts.bounty_vault.to_account_info(),
                            to: ctx.accounts.bot_owner.to_account_info(),
                        },
                        signer,
                    ),
                    payout,
                )?;

                bot.bounties_earned = bot.bounties_earned.checked_add(payout).unwrap();
            }

            submission.is_correct = true;
            bot.verifications_correct = bot.verifications_correct.checked_add(1).unwrap();
        } else {
            // WRONG — confidence-weighted slash to reputation
            // Higher confidence on wrong answer = worse penalty
            if submission.confidence >= 90 {
                bot.community_downvotes = bot.community_downvotes.checked_add(2).unwrap();
            } else {
                bot.community_downvotes = bot.community_downvotes.checked_add(1).unwrap();
            }
            bot.verifications_wrong = bot.verifications_wrong.checked_add(1).unwrap();
        }

        submission.claimed = true;
        Ok(())
    }

    /// Expire unclaimed bounty — after 48h, remaining funds go to treasury
    pub fn expire_bounty(
        ctx: Context<ExpireBounty>,
    ) -> Result<()> {
        let pool = &ctx.accounts.bounty_pool;
        let clock = Clock::get()?;

        require!(clock.unix_timestamp >= pool.expires_at, DjinnError::BountyNotExpired);

        // Transfer remaining bounty vault balance to treasury
        let vault_balance = ctx.accounts.bounty_vault.lamports();
        let rent = Rent::get()?.minimum_balance(0);
        let transferable = vault_balance.saturating_sub(rent);

        if transferable > 0 {
            let pool_key = pool.key();
            let seeds = &[
                b"bounty_vault",
                pool_key.as_ref(),
                &[pool.bump],
            ];
            let signer = &[&seeds[..]];

            anchor_lang::system_program::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    anchor_lang::system_program::Transfer {
                        from: ctx.accounts.bounty_vault.to_account_info(),
                        to: ctx.accounts.protocol_treasury.to_account_info(),
                    },
                    signer,
                ),
                transferable,
            )?;
        }

        Ok(())
    }

    /// Propose slashing a bot (Reporter initiates)
    pub fn propose_slash(
        ctx: Context<ProposeSlash>,
        evidence_uri: String,
        slash_reason: u8, // 0=wash_trade, 1=sybil, 2=front_run, 3=multi_bot
    ) -> Result<()> {
        let proposal = &mut ctx.accounts.slash_proposal;
        let clock = Clock::get()?;

        require!(evidence_uri.len() <= 200, DjinnError::UriTooLong);
        require!(slash_reason <= 3, DjinnError::InvalidSlashReason);

        // Freeze the accused bot immediately
        let bot = &mut ctx.accounts.accused_bot;
        bot.is_frozen = true;
        bot.is_active = false;

        proposal.accused_bot = bot.key();
        proposal.reporter = ctx.accounts.reporter.key();
        proposal.evidence_uri = evidence_uri;
        proposal.slash_reason = slash_reason;
        proposal.proposed_at = clock.unix_timestamp;
        proposal.dispute_deadline = clock.unix_timestamp + 172800; // 48h
        proposal.defense_uri = String::new();
        proposal.status = SlashStatus::Pending;
        proposal.bump = ctx.bumps.slash_proposal;

        bot.reports_against = bot.reports_against.checked_add(1).unwrap();

        Ok(())
    }

    /// Bot owner defends against a slash (within 48h)
    pub fn submit_defense(
        ctx: Context<SubmitDefense>,
        defense_uri: String,
    ) -> Result<()> {
        let proposal = &mut ctx.accounts.slash_proposal;
        let clock = Clock::get()?;

        require!(defense_uri.len() <= 200, DjinnError::UriTooLong);
        require!(proposal.status == SlashStatus::Pending, DjinnError::DisputeNotPending);
        require!(clock.unix_timestamp < proposal.dispute_deadline, DjinnError::DisputeExpired);

        proposal.defense_uri = defense_uri;
        proposal.status = SlashStatus::Disputed;

        Ok(())
    }

    /// Resolve a slash dispute (Admin/Multisig verdict)
    pub fn resolve_dispute(
        ctx: Context<ResolveDispute>,
        verdict: u8, // 0=guilty, 1=innocent, 2=mistrial
    ) -> Result<()> {
        let proposal = &mut ctx.accounts.slash_proposal;
        let bot = &mut ctx.accounts.accused_bot;

        match verdict {
            0 => {
                // GUILTY — slash stake
                proposal.status = SlashStatus::Guilty;
                let slash_amount = bot.stake; // Full stake slashed

                // Split: 80% to insurance, 20% to reporter
                let insurance_share = (slash_amount * 80) / 100;
                let reporter_share = slash_amount - insurance_share;

                // Transfer from bot escrow to insurance vault
                let owner_key = bot.owner;
                let seeds = &[
                    b"bot_escrow",
                    owner_key.as_ref(),
                    &[ctx.bumps.bot_escrow],
                ];
                let signer = &[&seeds[..]];

                if insurance_share > 0 {
                    anchor_lang::system_program::transfer(
                        CpiContext::new_with_signer(
                            ctx.accounts.system_program.to_account_info(),
                            anchor_lang::system_program::Transfer {
                                from: ctx.accounts.bot_escrow.to_account_info(),
                                to: ctx.accounts.insurance_vault.to_account_info(),
                            },
                            signer,
                        ),
                        insurance_share,
                    )?;
                }

                if reporter_share > 0 {
                    anchor_lang::system_program::transfer(
                        CpiContext::new_with_signer(
                            ctx.accounts.system_program.to_account_info(),
                            anchor_lang::system_program::Transfer {
                                from: ctx.accounts.bot_escrow.to_account_info(),
                                to: ctx.accounts.reporter.to_account_info(),
                            },
                            signer,
                        ),
                        reporter_share,
                    )?;
                }

                bot.stake = 0;
                bot.slashing_incidents = bot.slashing_incidents.checked_add(1).unwrap();
                // Bot remains frozen
            }
            1 => {
                // INNOCENT — unfreeze, restore reputation
                proposal.status = SlashStatus::Innocent;
                bot.is_frozen = false;
                if bot.reports_against > 0 {
                    bot.reports_against = bot.reports_against.checked_sub(1).unwrap();
                }
            }
            2 => {
                // MISTRIAL — unfreeze but flag for monitoring
                proposal.status = SlashStatus::Mistrial;
                bot.is_frozen = false;
            }
            _ => return Err(DjinnError::InvalidVerdict.into()),
        }

        Ok(())
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // AI BOT INTEGRATION (Module 3: Agent Vaults)
    // ═══════════════════════════════════════════════════════════════════════════

    /// Initialize an Agent Vault for a Verified/Elite bot
    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
    ) -> Result<()> {
        let bot = &mut ctx.accounts.bot_profile;
        let vault = &mut ctx.accounts.agent_vault;
        let clock = Clock::get()?;

        // Only Verified+ can open vaults
        require!(
            bot.tier == BotTier::Verified || bot.tier == BotTier::Elite,
            DjinnError::TierTooLow
        );
        require!(!bot.has_vault, DjinnError::VaultAlreadyExists);
        require!(!bot.is_frozen, DjinnError::BotFrozen);

        // Tier-based caps
        let (max_deposit_per_user, max_total_aum) = match bot.tier {
            BotTier::Verified => (10_000_000_000u64, 100_000_000_000u64),   // 10 SOL / 100 SOL
            BotTier::Elite => (100_000_000_000u64, 10_000_000_000_000u64),  // 100 SOL / 10k SOL
            _ => unreachable!(),
        };

        vault.bot = bot.key();
        vault.bot_owner = bot.owner;
        vault.total_deposits = 0;
        vault.total_aum = 0;
        vault.max_deposit_per_user = max_deposit_per_user;
        vault.max_total_aum = max_total_aum;
        vault.num_depositors = 0;
        vault.total_profit = 0;
        vault.total_loss = 0;
        vault.high_water_mark = 0;
        vault.is_paused = false;
        vault.is_liquidating = false;
        vault.created_at = clock.unix_timestamp;
        vault.last_profit_distribution = 0;
        vault.bump = ctx.bumps.agent_vault;

        bot.has_vault = true;
        bot.vault_pubkey = Some(vault.key());

        Ok(())
    }

    /// User deposits SOL into a bot's Agent Vault
    pub fn deposit_to_vault(
        ctx: Context<DepositToVault>,
        amount: u64,
    ) -> Result<()> {
        let vault = &mut ctx.accounts.agent_vault;
        let deposit = &mut ctx.accounts.vault_deposit;

        // Vault checks
        require!(!vault.is_paused, DjinnError::VaultPaused);
        require!(!vault.is_liquidating, DjinnError::VaultLiquidating);

        // Per-user deposit cap
        let new_user_total = deposit.amount.checked_add(amount as u128).unwrap();
        require!(
            new_user_total <= vault.max_deposit_per_user as u128,
            DjinnError::DepositExceedsUserLimit
        );

        // Total AUM cap
        let new_total = vault.total_aum.checked_add(amount as u128).unwrap();
        require!(
            new_total <= vault.max_total_aum as u128,
            DjinnError::DepositExceedsVaultCap
        );

        // Transfer SOL to vault
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.depositor.to_account_info(),
                    to: ctx.accounts.vault_sol.to_account_info(),
                },
            ),
            amount,
        )?;

        // Update deposit record
        if deposit.amount == 0 {
            // New depositor
            deposit.vault = vault.key();
            deposit.depositor = ctx.accounts.depositor.key();
            deposit.deposited_at = Clock::get()?.unix_timestamp;
            deposit.bump = ctx.bumps.vault_deposit;
            vault.num_depositors = vault.num_depositors.checked_add(1).unwrap();
        }
        deposit.amount = new_user_total;

        // Update vault
        vault.total_deposits = vault.total_deposits.checked_add(amount as u128).unwrap();
        vault.total_aum = new_total;

        // Update high water mark
        if vault.total_aum > vault.high_water_mark {
            vault.high_water_mark = vault.total_aum;
        }

        Ok(())
    }

    /// User withdraws SOL from a bot's Agent Vault
    pub fn withdraw_from_vault(
        ctx: Context<WithdrawFromVault>,
        amount: u64,
    ) -> Result<()> {
        let vault = &mut ctx.accounts.agent_vault;
        let deposit = &mut ctx.accounts.vault_deposit;

        require!(deposit.amount >= amount as u128, DjinnError::InsufficientDeposit);

        // Transfer SOL from vault to depositor
        let vault_key = vault.key();
        let seeds = &[
            b"vault_sol",
            vault_key.as_ref(),
            &[ctx.bumps.vault_sol],
        ];
        let signer = &[&seeds[..]];

        anchor_lang::system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.vault_sol.to_account_info(),
                    to: ctx.accounts.depositor.to_account_info(),
                },
                signer,
            ),
            amount,
        )?;

        deposit.amount = deposit.amount.checked_sub(amount as u128).unwrap();
        vault.total_aum = vault.total_aum.checked_sub(amount as u128).unwrap();

        if deposit.amount == 0 {
            vault.num_depositors = vault.num_depositors.saturating_sub(1);
        }

        Ok(())
    }

    /// Distribute profits from vault (Bot owner calls after profitable trades)
    /// Split: 70% depositors (pro-rata), 20% bot owner, 10% insurance
    pub fn distribute_profits(
        ctx: Context<DistributeProfits>,
        profit_amount: u64,
    ) -> Result<()> {
        let vault = &mut ctx.accounts.agent_vault;
        let clock = Clock::get()?;

        require!(!vault.is_paused, DjinnError::VaultPaused);
        require!(!vault.is_liquidating, DjinnError::VaultLiquidating);
        require!(profit_amount > 0, DjinnError::MathError);

        // Split: 70% depositors pool, 20% bot owner, 10% insurance
        let depositor_share = (profit_amount as u128 * 70) / 100;
        let bot_share = (profit_amount as u128 * 20) / 100;
        let insurance_share = profit_amount as u128 - depositor_share - bot_share;

        let vault_key = vault.key();
        let seeds = &[
            b"vault_sol",
            vault_key.as_ref(),
            &[ctx.bumps.vault_sol],
        ];
        let signer = &[&seeds[..]];

        // 20% to bot owner
        if bot_share > 0 {
            anchor_lang::system_program::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    anchor_lang::system_program::Transfer {
                        from: ctx.accounts.vault_sol.to_account_info(),
                        to: ctx.accounts.bot_owner.to_account_info(),
                    },
                    signer,
                ),
                bot_share as u64,
            )?;
        }

        // 10% to insurance
        if insurance_share > 0 {
            anchor_lang::system_program::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    anchor_lang::system_program::Transfer {
                        from: ctx.accounts.vault_sol.to_account_info(),
                        to: ctx.accounts.insurance_vault.to_account_info(),
                    },
                    signer,
                ),
                insurance_share as u64,
            )?;
        }

        // 70% stays in vault as depositor share (increases AUM pro-rata)
        vault.total_aum = vault.total_aum.checked_add(depositor_share).unwrap();
        vault.total_profit = vault.total_profit.checked_add(profit_amount as u128).unwrap();

        // Update high water mark
        if vault.total_aum > vault.high_water_mark {
            vault.high_water_mark = vault.total_aum;
        }

        vault.last_profit_distribution = clock.unix_timestamp;
        Ok(())
    }

    /// Circuit breaker check — anyone can call to pause/liquidate underperforming vaults
    pub fn check_circuit_breaker(
        ctx: Context<CheckCircuitBreaker>,
    ) -> Result<()> {
        let vault = &mut ctx.accounts.agent_vault;

        require!(vault.high_water_mark > 0, DjinnError::MathError);

        // Calculate drawdown from high water mark
        let current = vault.total_aum;
        let hwm = vault.high_water_mark;

        if current < hwm {
            let drawdown_bps = ((hwm - current) * 10_000) / hwm;

            if drawdown_bps >= 3_000 {
                // -30% drawdown → LIQUIDATION
                vault.is_liquidating = true;
                vault.is_paused = true;

                // Freeze the bot too
                let bot = &mut ctx.accounts.bot_profile;
                bot.is_frozen = true;
                bot.is_active = false;
            } else if drawdown_bps >= 2_000 {
                // -20% drawdown → PAUSE (no new trades, withdrawals allowed)
                vault.is_paused = true;
            }
        }

        Ok(())
    }

    /// Emergency liquidation — distribute remaining AUM to depositors pro-rata
    /// This is separate from individual withdrawals — admin triggers after circuit breaker
    pub fn liquidate_vault(
        ctx: Context<LiquidateVault>,
        depositor_share: u64, // Pre-calculated pro-rata share for this depositor
    ) -> Result<()> {
        let vault = &mut ctx.accounts.agent_vault;
        let deposit = &mut ctx.accounts.vault_deposit;

        require!(vault.is_liquidating, DjinnError::VaultNotLiquidating);
        require!(deposit.amount > 0, DjinnError::InsufficientDeposit);

        // Clamp to what's actually available
        let actual_payout = depositor_share.min(deposit.amount as u64);

        let vault_key = vault.key();
        let seeds = &[
            b"vault_sol",
            vault_key.as_ref(),
            &[ctx.bumps.vault_sol],
        ];
        let signer = &[&seeds[..]];

        if actual_payout > 0 {
            anchor_lang::system_program::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    anchor_lang::system_program::Transfer {
                        from: ctx.accounts.vault_sol.to_account_info(),
                        to: ctx.accounts.depositor.to_account_info(),
                    },
                    signer,
                ),
                actual_payout,
            )?;
        }

        deposit.amount = deposit.amount.saturating_sub(actual_payout as u128);
        vault.total_aum = vault.total_aum.saturating_sub(actual_payout as u128);

        if deposit.amount == 0 {
            vault.num_depositors = vault.num_depositors.saturating_sub(1);
        }

        // Record loss
        vault.total_loss = vault.total_loss.checked_add(
            (deposit.amount as u128).saturating_sub(actual_payout as u128)
        ).unwrap_or(vault.total_loss);

        Ok(())
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACCOUNT CONTEXTS
// ═══════════════════════════════════════════════════════════════════════════════

// InitializeMarket context with nonce in PDA seeds
#[derive(Accounts)]
#[instruction(title: String, resolution_time: i64, nonce: i64, num_outcomes: u8)]
pub struct InitializeMarket<'info> {
    #[account(
        init,
        payer = creator,
        // (Point 2) Added +8 bytes for total_pot_at_resolution
        space = 8 + 32 + (4 + 64) + 8 + 1 + (6 * 16) + 16 + 8 + 1 + 8 + 2 + 1 + 1,
        // 8 (discriminator) + 32 (creator) + (4 + 64) (title) + 8 (nonce) + 1 (num_outcomes)
        // + (6 * 16) (outcome_supplies array) + 16 (vault_balance) + 8 (total_pot) + 1 (status)
        // + 8 (resolution_time) + 2 (winning_outcome) + 1 (bump) + 1 (vault_bump)
        seeds = [b"market", creator.key().as_ref(), &hash::hash(title.as_bytes()).to_bytes(), &nonce.to_le_bytes()],
        bump
    )]
    pub market: Box<Account<'info, Market>>,
    
    /// CHECK: Vault PDA (will be created on first buy)
    #[account(
        mut,
        seeds = [b"market_vault", market.key().as_ref()],
        bump
    )]
    pub market_vault: AccountInfo<'info>,
    
    #[account(mut)]
    pub creator: Signer<'info>,
    
    /// CHECK: Protocol treasury
    #[account(mut, address = G1_TREASURY)]
    pub protocol_treasury: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(outcome_index: u8)]
pub struct BuyShares<'info> {
    #[account(mut)]
    pub market: Box<Account<'info, Market>>,
    
    /// CHECK: Vault PDA
    #[account(mut)]
    pub market_vault: AccountInfo<'info>,
    
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + 32 + 1 + 16 + 1,
        seeds = [b"user_pos", market.key().as_ref(), user.key().as_ref(), &[outcome_index]],
        bump
    )]
    pub user_position: Box<Account<'info, UserPosition>>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    /// CHECK: Treasury
    #[account(mut, address = G1_TREASURY)]
    pub protocol_treasury: AccountInfo<'info>,
    
    /// CHECK: Market Creator (for fee split)
    #[account(
        mut, 
        address = market.creator // (Point 1) Anti-Spoofing Fix
    )]
    pub market_creator: AccountInfo<'info>,
    
    /// CHECK: Insurance Pool Vault PDA (receives 10% of fees)
    #[account(
        mut,
        seeds = [b"insurance_vault"],
        bump
    )]
    pub insurance_vault: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(outcome_index: u8)]
pub struct SellShares<'info> {
    #[account(mut)]
    pub market: Box<Account<'info, Market>>,
    
    /// CHECK: Vault PDA
    #[account(mut)]
    pub market_vault: AccountInfo<'info>,
    
    #[account(
        mut,
        seeds = [b"user_pos", market.key().as_ref(), user.key().as_ref(), &[outcome_index]],
        bump
    )]
    pub user_position: Box<Account<'info, UserPosition>>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    /// CHECK: Treasury
    #[account(mut, address = G1_TREASURY)]
    pub protocol_treasury: AccountInfo<'info>,

    /// CHECK: Market Creator for fee split
    #[account(
        mut, 
        address = market.creator // (Point 1) Anti-Spoofing Fix
    )]
    pub market_creator: AccountInfo<'info>,
    
    /// CHECK: Insurance Pool Vault PDA (receives 10% of fees)
    #[account(
        mut,
        seeds = [b"insurance_vault"],
        bump
    )]
    pub insurance_vault: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ResolveMarket<'info> {
    #[account(mut)]
    pub market: Box<Account<'info, Market>>,
    
    /// CHECK: Vault PDA
    #[account(mut)]
    pub market_vault: AccountInfo<'info>,
    
    /// CHECK: Only treasury/oracle can resolve
    #[account(address = G1_TREASURY)]
    pub authority: Signer<'info>,
    
    /// CHECK: Treasury
    #[account(mut, address = G1_TREASURY)]
    pub protocol_treasury: AccountInfo<'info>,
    
    /// CHECK: Insurance Pool Vault PDA (receives 50% of resolution fees for Bounties)
    #[account(
        mut,
        seeds = [b"insurance_vault"],
        bump
    )]
    pub insurance_vault: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(outcome_index: u8)]
pub struct ClaimWinnings<'info> {
    #[account(mut)]
    pub market: Box<Account<'info, Market>>,
    
    /// CHECK: Vault PDA
    #[account(mut)]
    pub market_vault: AccountInfo<'info>,
    
    #[account(
        mut,
        seeds = [b"user_pos", market.key().as_ref(), user.key().as_ref(), &[outcome_index]],
        bump,
        close = user // (Point 6) Rent Refund Optimization
    )]
    pub user_position: Box<Account<'info, UserPosition>>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHRONOS MARKET ACCOUNT CONTEXTS
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Accounts)]
#[instruction(asset: u8, interval: u8, round_number: u64, target_price: u64)]
pub struct InitializeChronosMarket<'info> {
    #[account(
        init,
        payer = keeper,
        space = chronos_market::ChronosMarket::LEN,
        seeds = [
            b"chronos",
            asset.to_le_bytes().as_ref(),
            interval.to_le_bytes().as_ref(),
            round_number.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub chronos_market: Box<Account<'info, chronos_market::ChronosMarket>>,
    
    /// CHECK: Chronos Vault PDA
    #[account(
        mut,
        seeds = [b"chronos_vault", chronos_market.key().as_ref()],
        bump
    )]
    pub chronos_vault: AccountInfo<'info>,
    
    /// CHECK: Pyth price feed account
    pub pyth_price_feed: AccountInfo<'info>,
    
    /// Keeper bot that creates markets
    #[account(mut)]
    pub keeper: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(outcome_index: u8)]
pub struct BuyChronosShares<'info> {
    #[account(mut)]
    pub chronos_market: Box<Account<'info, chronos_market::ChronosMarket>>,
    
    /// CHECK: Chronos Vault PDA
    #[account(mut)]
    pub chronos_vault: AccountInfo<'info>,
    
    #[account(
        init_if_needed,
        payer = user,
        space = chronos_market::ChronosPosition::LEN,
        seeds = [
            b"chronos_pos",
            chronos_market.key().as_ref(),
            user.key().as_ref(),
            &[outcome_index]
        ],
        bump
    )]
    pub user_position: Box<Account<'info, chronos_market::ChronosPosition>>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    /// CHECK: Treasury for fee collection
    #[account(mut, address = G1_TREASURY)]
    pub protocol_treasury: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ResolveChronosMarket<'info> {
    #[account(mut)]
    pub chronos_market: Box<Account<'info, chronos_market::ChronosMarket>>,
    
    /// CHECK: Chronos Vault PDA
    #[account(mut)]
    pub chronos_vault: AccountInfo<'info>,
    
    /// CHECK: Pyth price feed for resolution
    pub pyth_price_feed: AccountInfo<'info>,
    
    /// CHECK: Treasury for resolution fee
    #[account(mut, address = G1_TREASURY)]
    pub protocol_treasury: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(outcome_index: u8)]
pub struct ClaimChronosWinnings<'info> {
    #[account(mut)]
    pub chronos_market: Box<Account<'info, chronos_market::ChronosMarket>>,
    
    /// CHECK: Chronos Vault PDA
    #[account(mut)]
    pub chronos_vault: AccountInfo<'info>,
    
    #[account(
        mut,
        seeds = [
            b"chronos_pos",
            chronos_market.key().as_ref(),
            user.key().as_ref(), // User is signer
            &[outcome_index]
        ],
        bump,
        close = user // Rent Refund
    )]
    pub user_position: Box<Account<'info, chronos_market::ChronosPosition>>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

// ═══════════════════════════════════════════════════════════════════════════════
// BOT ACCOUNT CONTEXTS
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Accounts)]
#[instruction(name: String, metadata_uri: String, strategy_category: u8)]
pub struct RegisterBot<'info> {
    #[account(
        init,
        payer = owner,
        // 8 disc + 32 owner + (4+32) name + (4+200) uri + 1 category + 8 stake + 1 tier
        // + 3 bools + 4+8+4+4 stats + 4+4+4+8 verif + 4+4+1+1 rep + 1+33 vault
        // + 8+8+4+8+4+8+4 timing + 1 bump = ~420 bytes, round to 512
        space = 512,
        seeds = [b"bot_profile", owner.key().as_ref()],
        bump
    )]
    pub bot_profile: Box<Account<'info, BotProfile>>,
    
    /// CHECK: Escrow PDA — holds the 10 SOL stake
    #[account(
        mut,
        seeds = [b"bot_escrow", owner.key().as_ref()],
        bump
    )]
    pub bot_escrow: AccountInfo<'info>,
    
    #[account(mut)]
    pub owner: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ToggleBot<'info> {
    #[account(
        mut,
        seeds = [b"bot_profile", owner.key().as_ref()],
        bump = bot_profile.bump,
        has_one = owner
    )]
    pub bot_profile: Box<Account<'info, BotProfile>>,
    
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct FreezeBot<'info> {
    #[account(mut)]
    pub bot_profile: Box<Account<'info, BotProfile>>,
    
    /// CHECK: Only G1 Treasury / Cerberus can freeze bots
    #[account(address = G1_TREASURY)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UnfreezeBot<'info> {
    #[account(mut)]
    pub bot_profile: Box<Account<'info, BotProfile>>,
    
    /// CHECK: Only G1 Treasury / Admin can unfreeze
    #[account(address = G1_TREASURY)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct DeregisterBot<'info> {
    #[account(
        mut,
        seeds = [b"bot_profile", owner.key().as_ref()],
        bump = bot_profile.bump,
        has_one = owner
    )]
    pub bot_profile: Box<Account<'info, BotProfile>>,
    
    /// CHECK: Bot escrow PDA for slashing/refund
    #[account(
        mut,
        seeds = [b"bot_escrow", owner.key().as_ref()],
        bump
    )]
    pub bot_escrow: AccountInfo<'info>,
    
    #[account(mut)]
    pub owner: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RestakeBot<'info> {
    #[account(
        mut,
        seeds = [b"bot_profile", owner.key().as_ref()],
        bump = bot_profile.bump,
        has_one = owner
    )]
    pub bot_profile: Box<Account<'info, BotProfile>>,
    
    /// CHECK: Bot escrow PDA for slashing/refund
    #[account(
        mut,
        seeds = [b"bot_escrow", owner.key().as_ref()],
        bump
    )]
    pub bot_escrow: AccountInfo<'info>,
    
    #[account(mut)]
    pub owner: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeInsurancePool<'info> {
    /// CHECK: Insurance vault PDA (just a SOL holder)
    #[account(
        mut,
        seeds = [b"insurance_vault"],
        bump
    )]
    pub insurance_vault: AccountInfo<'info>,
    
    /// CHECK: Only admin can initialize
    #[account(mut, address = G1_TREASURY)]
    pub admin: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}


// ═══════════════════════════════════════════════════════════════════════════════
// ORACLE NETWORK ACCOUNT CONTEXTS
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Accounts)]
pub struct InitializeBountyPool<'info> {
    #[account(
        init,
        payer = authority,
        space = 256, // enough for BountyPool
        seeds = [b"bounty_pool", market.key().as_ref()],
        bump
    )]
    pub bounty_pool: Box<Account<'info, BountyPool>>,

    /// CHECK: Bounty vault PDA
    #[account(
        mut,
        seeds = [b"bounty_vault", bounty_pool.key().as_ref()],
        bump
    )]
    pub bounty_vault: AccountInfo<'info>,

    #[account(mut)]
    pub market: Box<Account<'info, Market>>,

    /// CHECK: Market vault PDA
    #[account(
        mut,
        seeds = [b"market_vault", market.key().as_ref()],
        bump
    )]
    pub market_vault: AccountInfo<'info>,

    #[account(mut, address = G1_TREASURY)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(proposed_outcome: u8, confidence: u8, evidence_uri: String)]
pub struct SubmitVerification<'info> {
    #[account(mut)]
    pub bounty_pool: Box<Account<'info, BountyPool>>,

    #[account(
        mut,
        seeds = [b"bot_profile", bot_owner_signer.key().as_ref()],
        bump = bot_profile.bump,
    )]
    pub bot_profile: Box<Account<'info, BotProfile>>,

    #[account(
        init,
        payer = bot_owner_signer,
        space = 256,
        seeds = [b"verification", bounty_pool.key().as_ref(), bot_profile.key().as_ref()],
        bump
    )]
    pub verification_submission: Box<Account<'info, VerificationSubmission>>,

    #[account(mut)]
    pub bot_owner_signer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CerberusOverride<'info> {
    #[account(mut)]
    pub bounty_pool: Box<Account<'info, BountyPool>>,

    #[account(address = G1_TREASURY)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct FinalizeBountyPool<'info> {
    #[account(mut)]
    pub bounty_pool: Box<Account<'info, BountyPool>>,

    pub market: Box<Account<'info, Market>>,

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ClaimBounty<'info> {
    pub bounty_pool: Box<Account<'info, BountyPool>>,

    #[account(mut)]
    pub verification_submission: Box<Account<'info, VerificationSubmission>>,

    #[account(
        mut,
        constraint = bot_profile.owner == bot_owner.key()
    )]
    pub bot_profile: Box<Account<'info, BotProfile>>,

    /// CHECK: Bounty vault PDA
    #[account(
        mut,
        seeds = [b"bounty_vault", bounty_pool.key().as_ref()],
        bump
    )]
    pub bounty_vault: AccountInfo<'info>,

    /// CHECK: Bot owner receives reward
    #[account(mut)]
    pub bot_owner: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExpireBounty<'info> {
    pub bounty_pool: Box<Account<'info, BountyPool>>,

    /// CHECK: Bounty vault PDA
    #[account(
        mut,
        seeds = [b"bounty_vault", bounty_pool.key().as_ref()],
        bump
    )]
    pub bounty_vault: AccountInfo<'info>,

    /// CHECK: Treasury
    #[account(mut, address = G1_TREASURY)]
    pub protocol_treasury: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(evidence_uri: String, slash_reason: u8)]
pub struct ProposeSlash<'info> {
    #[account(
        init,
        payer = reporter,
        space = 384,
        seeds = [b"slash", accused_bot.key().as_ref(), reporter.key().as_ref()],
        bump
    )]
    pub slash_proposal: Box<Account<'info, SlashProposal>>,

    #[account(mut)]
    pub accused_bot: Box<Account<'info, BotProfile>>,

    #[account(mut)]
    pub reporter: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SubmitDefense<'info> {
    #[account(
        mut,
        constraint = slash_proposal.accused_bot == accused_bot.key()
    )]
    pub slash_proposal: Box<Account<'info, SlashProposal>>,

    pub accused_bot: Box<Account<'info, BotProfile>>,

    /// Bot owner must sign the defense
    #[account(constraint = defender.key() == accused_bot.owner)]
    pub defender: Signer<'info>,
}

#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    #[account(mut)]
    pub slash_proposal: Box<Account<'info, SlashProposal>>,

    #[account(mut)]
    pub accused_bot: Box<Account<'info, BotProfile>>,

    /// CHECK: Bot escrow PDA for slashing
    #[account(
        mut,
        seeds = [b"bot_escrow", accused_bot.owner.as_ref()],
        bump
    )]
    pub bot_escrow: AccountInfo<'info>,

    /// CHECK: Insurance vault receives 80% of slash
    #[account(
        mut,
        seeds = [b"insurance_vault"],
        bump
    )]
    pub insurance_vault: AccountInfo<'info>,

    /// CHECK: Reporter who filed the slash (gets 20% reward)
    #[account(
        mut,
        constraint = reporter.key() == slash_proposal.reporter
    )]
    pub reporter: AccountInfo<'info>,

    /// Admin signs the verdict
    #[account(address = G1_TREASURY)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}


// ═══════════════════════════════════════════════════════════════════════════════
// VAULT ACCOUNT CONTEXTS
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(
        init,
        payer = owner,
        space = 320,
        seeds = [b"agent_vault", bot_profile.key().as_ref()],
        bump
    )]
    pub agent_vault: Box<Account<'info, AgentVault>>,

    #[account(
        mut,
        seeds = [b"bot_profile", owner.key().as_ref()],
        bump = bot_profile.bump,
        has_one = owner
    )]
    pub bot_profile: Box<Account<'info, BotProfile>>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositToVault<'info> {
    #[account(mut)]
    pub agent_vault: Box<Account<'info, AgentVault>>,

    #[account(
        init_if_needed,
        payer = depositor,
        space = 128,
        seeds = [b"vault_deposit", agent_vault.key().as_ref(), depositor.key().as_ref()],
        bump
    )]
    pub vault_deposit: Box<Account<'info, VaultDeposit>>,

    /// CHECK: Vault SOL holder PDA
    #[account(
        mut,
        seeds = [b"vault_sol", agent_vault.key().as_ref()],
        bump
    )]
    pub vault_sol: AccountInfo<'info>,

    #[account(mut)]
    pub depositor: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawFromVault<'info> {
    #[account(mut)]
    pub agent_vault: Box<Account<'info, AgentVault>>,

    #[account(
        mut,
        seeds = [b"vault_deposit", agent_vault.key().as_ref(), depositor.key().as_ref()],
        bump = vault_deposit.bump,
    )]
    pub vault_deposit: Box<Account<'info, VaultDeposit>>,

    /// CHECK: Vault SOL holder PDA
    #[account(
        mut,
        seeds = [b"vault_sol", agent_vault.key().as_ref()],
        bump
    )]
    pub vault_sol: AccountInfo<'info>,

    #[account(mut)]
    pub depositor: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DistributeProfits<'info> {
    #[account(
        mut,
        constraint = agent_vault.bot_owner == bot_owner.key()
    )]
    pub agent_vault: Box<Account<'info, AgentVault>>,

    /// CHECK: Vault SOL holder PDA
    #[account(
        mut,
        seeds = [b"vault_sol", agent_vault.key().as_ref()],
        bump
    )]
    pub vault_sol: AccountInfo<'info>,

    /// CHECK: Bot owner receives 20%
    #[account(mut)]
    pub bot_owner: AccountInfo<'info>,

    /// CHECK: Insurance vault receives 10%
    #[account(
        mut,
        seeds = [b"insurance_vault"],
        bump
    )]
    pub insurance_vault: AccountInfo<'info>,

    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CheckCircuitBreaker<'info> {
    #[account(mut)]
    pub agent_vault: Box<Account<'info, AgentVault>>,

    #[account(
        mut,
        constraint = bot_profile.key() == agent_vault.bot
    )]
    pub bot_profile: Box<Account<'info, BotProfile>>,

    /// Anyone can call this — it's a permissionless safety check
    pub caller: Signer<'info>,
}

#[derive(Accounts)]
pub struct LiquidateVault<'info> {
    #[account(
        mut,
        constraint = agent_vault.is_liquidating
    )]
    pub agent_vault: Box<Account<'info, AgentVault>>,

    #[account(
        mut,
        seeds = [b"vault_deposit", agent_vault.key().as_ref(), depositor.key().as_ref()],
        bump = vault_deposit.bump,
    )]
    pub vault_deposit: Box<Account<'info, VaultDeposit>>,

    /// CHECK: Vault SOL holder PDA
    #[account(
        mut,
        seeds = [b"vault_sol", agent_vault.key().as_ref()],
        bump
    )]
    pub vault_sol: AccountInfo<'info>,

    /// CHECK: Depositor receives pro-rata share
    #[account(mut)]
    pub depositor: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}


// ═══════════════════════════════════════════════════════════════════════════════
// BOT DATA STRUCTURES
// ═══════════════════════════════════════════════════════════════════════════════

#[account]
pub struct BotProfile {
    pub owner: Pubkey,              // 32
    pub name: String,               // 4 + 32 (max)
    pub metadata_uri: String,       // 4 + 200 (max)
    pub strategy_category: u8,      // 1  (0=All, 1=Sports, 2=Crypto, 3=Politics, 4=Other)
    pub stake: u64,                 // 8
    pub tier: BotTier,              // 1
    pub is_active: bool,            // 1
    pub is_paper_trading: bool,     // 1
    pub is_frozen: bool,            // 1

    // Trading stats
    pub total_trades: u32,          // 4
    pub total_volume: u64,          // 8
    pub winning_trades: u32,        // 4
    pub losing_trades: u32,         // 4

    // Verification stats
    pub verifications_submitted: u32, // 4
    pub verifications_correct: u32,   // 4
    pub verifications_wrong: u32,     // 4
    pub bounties_earned: u64,         // 8

    // Reputation
    pub community_upvotes: u32,     // 4
    pub community_downvotes: u32,   // 4
    pub reports_against: u8,        // 1
    pub slashing_incidents: u8,     // 1

    // Vault
    pub has_vault: bool,            // 1
    pub vault_pubkey: Option<Pubkey>, // 1 + 32

    // Temporal rate limiting
    pub registered_at: i64,         // 8
    pub last_trade_at: i64,         // 8
    pub trades_this_hour: u32,      // 4
    pub hour_start_ts: i64,         // 8  (resets every hour)
    pub volume_this_day: u64,       // 8
    pub day_start_ts: i64,          // 8  (resets every 24h)
    pub active_positions: u32,      // 4  (concurrent market positions)

    pub bump: u8,                   // 1
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum BotTier {
    Novice,     // 0 — Max 2 SOL/trade, 10 SOL/hr, 50 SOL/day, 30s min interval, 5 concurrent
    Verified,   // 1 — Max 20 SOL/trade, 100 SOL/hr, 500 SOL/day, 10s interval, 20 concurrent
    Elite,      // 2 — Max 50 SOL/trade, 500 SOL/hr, 2000 SOL/day, no interval, unlimited
}

impl BotTier {
    pub fn max_per_trade(&self) -> u64 {
        match self {
            BotTier::Novice => 2_000_000_000,     // 2 SOL
            BotTier::Verified => 20_000_000_000,   // 20 SOL
            BotTier::Elite => 50_000_000_000,      // 50 SOL
        }
    }
    pub fn max_per_hour(&self) -> u64 {
        match self {
            BotTier::Novice => 10_000_000_000,     // 10 SOL
            BotTier::Verified => 100_000_000_000,   // 100 SOL
            BotTier::Elite => 500_000_000_000,      // 500 SOL
        }
    }
    pub fn max_per_day(&self) -> u64 {
        match self {
            BotTier::Novice => 50_000_000_000,      // 50 SOL
            BotTier::Verified => 500_000_000_000,    // 500 SOL
            BotTier::Elite => 2_000_000_000_000,     // 2000 SOL
        }
    }
    pub fn min_trade_interval(&self) -> i64 {
        match self {
            BotTier::Novice => 30,    // 30 seconds
            BotTier::Verified => 10,  // 10 seconds
            BotTier::Elite => 0,      // No limit
        }
    }
    pub fn max_concurrent_positions(&self) -> u32 {
        match self {
            BotTier::Novice => 5,
            BotTier::Verified => 20,
            BotTier::Elite => u32::MAX,
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ORACLE NETWORK DATA STRUCTURES
// ═══════════════════════════════════════════════════════════════════════════════

#[account]
pub struct BountyPool {
    pub market: Pubkey,             // 32
    pub total_bounty: u64,          // 8
    pub total_weight: u64,          // 8 — sum of all submission weights
    pub winning_outcome: Option<u8>,// 2
    pub cerberus_override: bool,    // 1
    pub cerberus_outcome: Option<u8>, // 2
    pub num_submissions: u32,       // 4
    pub is_finalized: bool,         // 1
    pub created_at: i64,            // 8
    pub expires_at: i64,            // 8  (48h after creation)
    pub bump: u8,                   // 1
}

#[account]
pub struct VerificationSubmission {
    pub bounty_pool: Pubkey,        // 32
    pub bot: Pubkey,                // 32
    pub bot_owner: Pubkey,          // 32
    pub proposed_outcome: u8,       // 1
    pub confidence: u8,             // 1  (50-100)
    pub weight: u64,                // 8  — skin-weighted vote weight
    pub evidence_uri: String,       // 4 + 200
    pub submitted_at: i64,          // 8
    pub is_correct: bool,           // 1
    pub claimed: bool,              // 1
    pub bump: u8,                   // 1
}

#[account]
pub struct SlashProposal {
    pub accused_bot: Pubkey,        // 32
    pub reporter: Pubkey,           // 32
    pub evidence_uri: String,       // 4 + 200
    pub slash_reason: u8,           // 1  (0=wash, 1=sybil, 2=front_run, 3=multi_bot)
    pub proposed_at: i64,           // 8
    pub dispute_deadline: i64,      // 8  (48h window)
    pub defense_uri: String,        // 4 + 200
    pub status: SlashStatus,        // 1
    pub bump: u8,                   // 1
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum SlashStatus {
    Pending,    // 0 — awaiting defense or auto-guilty
    Disputed,   // 1 — defense submitted
    Guilty,     // 2 — stake slashed
    Innocent,   // 3 — exonerated
    Mistrial,   // 4 — inconclusive
}

// ═══════════════════════════════════════════════════════════════════════════════
// VAULT DATA STRUCTURES
// ═══════════════════════════════════════════════════════════════════════════════

#[account]
pub struct AgentVault {
    pub bot: Pubkey,                // 32 — linked bot
    pub bot_owner: Pubkey,          // 32
    pub total_deposits: u128,       // 16 — lifetime deposits
    pub total_aum: u128,            // 16 — current AUM
    pub max_deposit_per_user: u64,  // 8  — Verified=10 SOL, Elite=100 SOL
    pub max_total_aum: u64,         // 8  — Verified=100 SOL, Elite=10k SOL
    pub num_depositors: u32,        // 4
    pub total_profit: u128,         // 16 — lifetime profit
    pub total_loss: u128,           // 16 — lifetime loss
    pub high_water_mark: u128,      // 16 — peak AUM for drawdown calc
    pub is_paused: bool,            // 1  — -20% drawdown
    pub is_liquidating: bool,       // 1  — -30% drawdown
    pub created_at: i64,            // 8
    pub last_profit_distribution: i64, // 8
    pub bump: u8,                   // 1
}

#[account]
pub struct VaultDeposit {
    pub vault: Pubkey,              // 32
    pub depositor: Pubkey,          // 32
    pub amount: u128,               // 16 — current deposit amount (grows with profit)
    pub deposited_at: i64,          // 8
    pub bump: u8,                   // 1
}

/// Helper: enforce bot rate limits. Call this inside buy_shares/sell_shares when bot_profile is present.
pub fn enforce_bot_limits(bot: &mut BotProfile, sol_amount: u64, now: i64) -> Result<()> {
    // Check frozen
    require!(!bot.is_frozen, DjinnError::BotFrozen);
    // Check active
    require!(bot.is_active, DjinnError::BotPaused);

    // Per-trade limit
    require!(sol_amount <= bot.tier.max_per_trade(), DjinnError::TradeLimitExceeded);

    // Min interval between trades
    let interval = bot.tier.min_trade_interval();
    if interval > 0 {
        require!(
            now - bot.last_trade_at >= interval,
            DjinnError::TradeIntervalTooFast
        );
    }

    // Hourly volume — reset if an hour has passed
    if now - bot.hour_start_ts >= 3600 {
        bot.trades_this_hour = 0;
        bot.hour_start_ts = now;
    }
    // Track hourly trades count
    bot.trades_this_hour = bot.trades_this_hour.checked_add(1).unwrap();

    // Daily volume — reset if 24h has passed
    if now - bot.day_start_ts >= 86400 {
        bot.volume_this_day = 0;
        bot.day_start_ts = now;
    }
    let new_daily_volume = bot.volume_this_day.checked_add(sol_amount).unwrap();
    require!(new_daily_volume <= bot.tier.max_per_day(), DjinnError::DailyLimitExceeded);
    bot.volume_this_day = new_daily_volume;

    // Concurrent positions check
    require!(
        bot.active_positions < bot.tier.max_concurrent_positions(),
        DjinnError::TooManyPositions
    );

    // Update tracking
    bot.last_trade_at = now;
    bot.total_trades = bot.total_trades.checked_add(1).unwrap();
    bot.total_volume = bot.total_volume.checked_add(sol_amount).unwrap();

    Ok(())
}


// ═══════════════════════════════════════════════════════════════════════════════
// ERRORS
// ═══════════════════════════════════════════════════════════════════════════════

#[error_code]
pub enum DjinnError {
    #[msg("Market is not active")]
    MarketNotActive,
    #[msg("Market is not resolved")]
    MarketNotResolved,
    #[msg("Market has not expired yet")]
    MarketNotExpired,
    #[msg("Slippage exceeded")]
    SlippageExceeded,
    #[msg("Insufficient shares")]
    InsufficientShares,
    #[msg("Already claimed")]
    AlreadyClaimed,
    #[msg("No shares to claim")]
    NoShares,
    #[msg("Not a winner")]
    NotWinner,
    #[msg("Invalid outcome")]
    InvalidOutcome,
    #[msg("Invalid outcome count (must be 2-6)")]
    InvalidOutcomeCount,
    #[msg("Math error")]
    MathError,
    #[msg("Market has expired")]
    MarketExpired,

    // Bot errors (Phase 1)
    #[msg("Bot name too long (max 32 chars)")]
    NameTooLong,
    #[msg("Metadata URI too long (max 200 chars)")]
    UriTooLong,
    #[msg("Invalid strategy category")]
    InvalidCategory,
    #[msg("Bot is frozen by Cerberus")]
    BotFrozen,
    #[msg("Bot is not active")]
    BotPaused,
    #[msg("Trade amount exceeds tier limit")]
    TradeLimitExceeded,
    #[msg("Trading too fast — minimum interval not met")]
    TradeIntervalTooFast,
    #[msg("Daily volume limit exceeded")]
    DailyLimitExceeded,
    #[msg("Too many concurrent positions")]
    TooManyPositions,

    // Oracle errors (Phase 2)
    #[msg("Bounty pool already finalized")]
    BountyAlreadyFinalized,
    #[msg("Bounty pool has expired")]
    BountyExpired,
    #[msg("Bounty pool not yet expired")]
    BountyNotExpired,
    #[msg("Bounty pool not ready to finalize (need 24h or Cerberus override)")]
    BountyNotReady,
    #[msg("Bounty pool not yet finalized")]
    BountyNotFinalized,
    #[msg("Confidence must be 50-100")]
    InvalidConfidence,
    #[msg("Invalid slash reason")]
    InvalidSlashReason,
    #[msg("Invalid verdict")]
    InvalidVerdict,
    #[msg("Dispute is not pending")]
    DisputeNotPending,
    #[msg("Dispute window has expired")]
    DisputeExpired,

    // Vault errors (Phase 3)
    #[msg("Bot tier too low for vault access")]
    TierTooLow,
    #[msg("Bot already has a vault")]
    VaultAlreadyExists,
    #[msg("Vault is paused — circuit breaker triggered")]
    VaultPaused,
    #[msg("Vault is in liquidation mode")]
    VaultLiquidating,
    #[msg("Vault is not in liquidation mode")]
    VaultNotLiquidating,
    #[msg("Deposit exceeds per-user limit")]
    DepositExceedsUserLimit,
    #[msg("Deposit exceeds vault AUM cap")]
    DepositExceedsVaultCap,
    #[msg("Insufficient deposit to withdraw")]
    InsufficientDeposit,
}


