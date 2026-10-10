/** Payment chain config — placeholders. The wallet module shows "Payments coming soon" while empty. */
export const chain: { chainId: string; rpcUrl: string; receivingAddress: string } = {
  chainId: "",
  rpcUrl: "",
  receivingAddress: "",
};

export const paymentsEnabled = Boolean(chain.chainId && chain.rpcUrl && chain.receivingAddress);
