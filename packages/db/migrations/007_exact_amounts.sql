-- Plain USDC transfers are matched to a checkout by its exact amount (10.0371),
-- so payment amounts keep 4 decimals (USDC itself has 6).
alter table payments alter column amount_usd type numeric(12,6);
create index if not exists payments_pending_amount on payments (amount_usd) where status = 'pending';
