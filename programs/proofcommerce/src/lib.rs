use anchor_lang::prelude::*;
use anchor_spl::{associated_token::AssociatedToken, token::{self, Mint, Token, TokenAccount, TransferChecked}};

declare_id!("Fg6PaFpoGXkYsidMpWxTWqkZqg5RGqG6W2BeZ7FEfcYkg");

#[program]
pub mod proofcommerce {
    use super::*;
    pub fn initialize_agreement(ctx: Context<Initialize>, id: [u8;32], amount: u64, deadline: i64, requirements_hash: [u8;32]) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(amount > 0, ErrorCode::InvalidAmount);
        require!(deadline > now && deadline <= now.checked_add(604800).ok_or(ErrorCode::Overflow)?, ErrorCode::Deadline);
        require!(ctx.accounts.mint.decimals == 6, ErrorCode::InvalidMint);
        require!(ctx.accounts.buyer.key() != ctx.accounts.provider.key(), ErrorCode::InvalidParty);
        require!(ctx.accounts.verifier.key() != ctx.accounts.buyer.key() && ctx.accounts.verifier.key() != ctx.accounts.provider.key(), ErrorCode::InvalidParty);
        require!(ctx.accounts.provider.key() != Pubkey::default() && ctx.accounts.verifier.key() != Pubkey::default(), ErrorCode::InvalidParty);
        let a = &mut ctx.accounts.agreement;
        a.id=id; a.buyer=ctx.accounts.buyer.key(); a.provider=ctx.accounts.provider.key(); a.mint=ctx.accounts.mint.key(); a.verifier=ctx.accounts.verifier.key();
        a.requirements_hash=requirements_hash; a.delivery_hash=[0;32]; a.amount=amount; a.deadline=deadline; a.state=State::Created; a.bump=ctx.bumps.agreement;
        emit!(Changed {agreement:a.key(),state:a.state,hash:a.requirements_hash}); Ok(())
    }
    pub fn fund_agreement(ctx: Context<Fund>) -> Result<()> {
        let a=&ctx.accounts.agreement;
        require!(a.state==State::Created, ErrorCode::Transition); live(a)?;
        token::transfer_checked(CpiContext::new(ctx.accounts.token_program.to_account_info(), TransferChecked { from:ctx.accounts.source.to_account_info(), mint:ctx.accounts.mint.to_account_info(), to:ctx.accounts.vault.to_account_info(), authority:ctx.accounts.buyer.to_account_info() }),a.amount,6)?;
        ctx.accounts.agreement.state=State::Funded;
        changed(&ctx.accounts.agreement); Ok(())
    }
    pub fn accept_agreement(ctx: Context<ProviderAction>) -> Result<()> {
        require!(ctx.accounts.agreement.state==State::Funded, ErrorCode::Transition); live(&ctx.accounts.agreement)?;
        ctx.accounts.agreement.state=State::Accepted; changed(&ctx.accounts.agreement); Ok(())
    }
    pub fn submit_delivery_hash(ctx: Context<ProviderAction>, delivery_hash:[u8;32]) -> Result<()> {
        let a=&mut ctx.accounts.agreement;
        require!(a.state==State::Accepted || a.state==State::Rejected, ErrorCode::Transition); live(a)?;
        require!(delivery_hash != [0;32], ErrorCode::InvalidHash);
        a.delivery_hash=delivery_hash; a.state=State::Submitted; changed(a); Ok(())
    }
    pub fn approve_delivery(ctx: Context<Verify>, delivery_hash:[u8;32], approved:bool) -> Result<()> {
        let a=&mut ctx.accounts.agreement;
        require!(a.state==State::Submitted, ErrorCode::Transition); live(a)?;
        require!(a.delivery_hash==delivery_hash, ErrorCode::InvalidHash);
        a.state=if approved {State::Verified} else {State::Rejected}; changed(a); Ok(())
    }
    pub fn release_payment(ctx: Context<Release>) -> Result<()> {
        require!(ctx.accounts.agreement.state==State::Verified, ErrorCode::Transition);
        let a=&ctx.accounts.agreement;
        let bump=[a.bump]; let seeds:&[&[u8]]=&[b"agreement", &a.id, a.buyer.as_ref(), a.provider.as_ref(), a.mint.as_ref(), &bump];
        token::transfer_checked(CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(),TransferChecked{from:ctx.accounts.vault.to_account_info(),mint:ctx.accounts.mint.to_account_info(),to:ctx.accounts.destination.to_account_info(),authority:a.to_account_info()},&[seeds]),a.amount,6)?;
        ctx.accounts.agreement.state=State::Settled; changed(&ctx.accounts.agreement); Ok(())
    }
    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        let a=&ctx.accounts.agreement;
        require!(refundable(a.state,Clock::get()?.unix_timestamp,a.deadline), ErrorCode::Transition);
        let bump=[a.bump]; let seeds:&[&[u8]]=&[b"agreement", &a.id, a.buyer.as_ref(), a.provider.as_ref(), a.mint.as_ref(), &bump];
        token::transfer_checked(CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(),TransferChecked{from:ctx.accounts.vault.to_account_info(),mint:ctx.accounts.mint.to_account_info(),to:ctx.accounts.destination.to_account_info(),authority:a.to_account_info()},&[seeds]),a.amount,6)?;
        ctx.accounts.agreement.state=State::Refunded; changed(&ctx.accounts.agreement); Ok(())
    }
    pub fn cancel_expired(ctx: Context<Cancel>) -> Result<()> {
        let a=&mut ctx.accounts.agreement;
        require!(a.state==State::Created && Clock::get()?.unix_timestamp>=a.deadline, ErrorCode::Transition);
        a.state=State::Cancelled; changed(a); Ok(())
    }
}

fn live(a:&Agreement)->Result<()> { require!(Clock::get()?.unix_timestamp<a.deadline,ErrorCode::Deadline);Ok(()) }
fn refundable(state:State, now:i64, deadline:i64)->bool { state==State::Rejected || (now>=deadline && matches!(state,State::Funded|State::Accepted|State::Submitted)) }
fn changed(a:&Account<Agreement>) {emit!(Changed{agreement:a.key(),state:a.state,hash:a.delivery_hash});}

#[derive(Accounts)]
#[instruction(id:[u8;32])]
pub struct Initialize<'info> {
    #[account(mut)] pub buyer:Signer<'info>,
    /// CHECK: Immutable recipient identity; not read or mutated.
    pub provider:UncheckedAccount<'info>,
    /// CHECK: Immutable verification authority chosen by buyer and visible to provider before acceptance.
    pub verifier:UncheckedAccount<'info>,
    pub mint:Account<'info,Mint>,
    #[account(init,payer=buyer,space=8+Agreement::INIT_SPACE,seeds=[b"agreement",id.as_ref(),buyer.key().as_ref(),provider.key().as_ref(),mint.key().as_ref()],bump)]
    pub agreement:Account<'info,Agreement>,
    #[account(init,payer=buyer,associated_token::mint=mint,associated_token::authority=agreement)]
    pub vault:Account<'info,TokenAccount>,
    pub token_program:Program<'info,Token>, pub associated_token_program:Program<'info,AssociatedToken>, pub system_program:Program<'info,System>,
}
#[derive(Accounts)]
pub struct Fund<'info> {
    pub buyer:Signer<'info>,
    #[account(mut,has_one=buyer,has_one=mint,seeds=[b"agreement",agreement.id.as_ref(),agreement.buyer.as_ref(),agreement.provider.as_ref(),agreement.mint.as_ref()],bump=agreement.bump)] pub agreement:Account<'info,Agreement>,
    pub mint:Account<'info,Mint>,
    #[account(mut,associated_token::mint=mint,associated_token::authority=buyer)] pub source:Account<'info,TokenAccount>,
    #[account(mut,associated_token::mint=mint,associated_token::authority=agreement)] pub vault:Account<'info,TokenAccount>,
    pub token_program:Program<'info,Token>,
}
#[derive(Accounts)]
pub struct ProviderAction<'info> {
    pub provider:Signer<'info>,
    #[account(mut,has_one=provider,seeds=[b"agreement",agreement.id.as_ref(),agreement.buyer.as_ref(),agreement.provider.as_ref(),agreement.mint.as_ref()],bump=agreement.bump)] pub agreement:Account<'info,Agreement>,
}
#[derive(Accounts)]
pub struct Verify<'info> {
    pub verifier:Signer<'info>,
    #[account(mut,has_one=verifier,seeds=[b"agreement",agreement.id.as_ref(),agreement.buyer.as_ref(),agreement.provider.as_ref(),agreement.mint.as_ref()],bump=agreement.bump)] pub agreement:Account<'info,Agreement>,
}
#[derive(Accounts)]
pub struct Release<'info> {
    pub verifier:Signer<'info>,
    #[account(mut,has_one=verifier,has_one=mint,seeds=[b"agreement",agreement.id.as_ref(),agreement.buyer.as_ref(),agreement.provider.as_ref(),agreement.mint.as_ref()],bump=agreement.bump)] pub agreement:Account<'info,Agreement>,
    pub mint:Account<'info,Mint>,
    #[account(mut,associated_token::mint=mint,associated_token::authority=agreement)] pub vault:Account<'info,TokenAccount>,
    #[account(mut,associated_token::mint=mint,associated_token::authority=agreement.provider)] pub destination:Account<'info,TokenAccount>,
    pub token_program:Program<'info,Token>,
}
#[derive(Accounts)]
pub struct Refund<'info> {
    pub buyer:Signer<'info>,
    #[account(mut,has_one=buyer,has_one=mint,seeds=[b"agreement",agreement.id.as_ref(),agreement.buyer.as_ref(),agreement.provider.as_ref(),agreement.mint.as_ref()],bump=agreement.bump)] pub agreement:Account<'info,Agreement>,
    pub mint:Account<'info,Mint>,
    #[account(mut,associated_token::mint=mint,associated_token::authority=agreement)] pub vault:Account<'info,TokenAccount>,
    #[account(mut,associated_token::mint=mint,associated_token::authority=buyer)] pub destination:Account<'info,TokenAccount>,
    pub token_program:Program<'info,Token>,
}
#[derive(Accounts)]
pub struct Cancel<'info> {
    pub buyer:Signer<'info>,
    #[account(mut,has_one=buyer,seeds=[b"agreement",agreement.id.as_ref(),agreement.buyer.as_ref(),agreement.provider.as_ref(),agreement.mint.as_ref()],bump=agreement.bump)] pub agreement:Account<'info,Agreement>,
}
#[account]
#[derive(InitSpace)]
pub struct Agreement { pub id:[u8;32],pub buyer:Pubkey,pub provider:Pubkey,pub mint:Pubkey,pub verifier:Pubkey,pub requirements_hash:[u8;32],pub delivery_hash:[u8;32],pub amount:u64,pub deadline:i64,pub state:State,pub bump:u8 }
#[derive(AnchorSerialize,AnchorDeserialize,Clone,Copy,PartialEq,Eq,InitSpace,Debug)]
pub enum State { Created,Funded,Accepted,Submitted,Verified,Rejected,Settled,Refunded,Cancelled }
#[event]
pub struct Changed {pub agreement:Pubkey,pub state:State,pub hash:[u8;32]}
#[error_code]
pub enum ErrorCode { #[msg("Invalid state transition")] Transition, #[msg("Deadline violated")] Deadline, #[msg("Amount must be positive")] InvalidAmount, #[msg("Mint must have six decimals")] InvalidMint, #[msg("Parties must be distinct")] InvalidParty, #[msg("Evidence hash mismatch")] InvalidHash, #[msg("Arithmetic overflow")] Overflow }
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn refund_rules() { assert!(!refundable(State::Accepted,9,10));assert!(refundable(State::Accepted,10,10));assert!(refundable(State::Rejected,1,10));for s in [State::Settled,State::Refunded,State::Verified,State::Cancelled,State::Created] {assert!(!refundable(s,100,10));} }
}
