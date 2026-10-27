/**
 * Ticker → price-source id for well-known assets. Anything not listed here is
 * priced only when the post itself contains a contract address; otherwise the
 * call is marked "no price source" rather than guessed. Extend freely — each
 * per-call row in stats.json records which id was used, so mistakes are auditable.
 */
const COINGECKO: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  BNB: "binancecoin",
  XRP: "ripple",
  DOGE: "dogecoin",
  ADA: "cardano",
  AVAX: "avalanche-2",
  LINK: "chainlink",
  DOT: "polkadot",
  TRX: "tron",
  TON: "the-open-network",
  LTC: "litecoin",
  BCH: "bitcoin-cash",
  NEAR: "near",
  APT: "aptos",
  SUI: "sui",
  SEI: "sei-network",
  TIA: "celestia",
  INJ: "injective-protocol",
  ARB: "arbitrum",
  OP: "optimism",
  ATOM: "cosmos",
  UNI: "uniswap",
  AAVE: "aave",
  MKR: "maker",
  LDO: "lido-dao",
  PENDLE: "pendle",
  ENA: "ethena",
  ONDO: "ondo-finance",
  HYPE: "hyperliquid",
  TAO: "bittensor",
  FET: "fetch-ai",
  RNDR: "render-token",
  RENDER: "render-token",
  JUP: "jupiter-exchange-solana",
  PYTH: "pyth-network",
  JTO: "jito-governance-token",
  RAY: "raydium",
  PEPE: "pepe",
  SHIB: "shiba-inu",
  WIF: "dogwifcoin",
  BONK: "bonk",
  POPCAT: "popcat",
  BOME: "book-of-meme",
  MEW: "cat-in-a-dogs-world",
  FLOKI: "floki",
  TRUMP: "official-trump",
  FARTCOIN: "fartcoin",
  SPX: "spx6900",
  SPX6900: "spx6900",
  MOODENG: "moo-deng",
  PNUT: "peanut-the-squirrel",
  GOAT: "goatseus-maximus",
  AI16Z: "ai16z",
  VIRTUAL: "virtual-protocol",
  PUMP: "pump-fun",
  // older majors and DeFi names CT calls by ticker
  NEO: "neo",
  ZEC: "zcash",
  XMR: "monero",
  ETC: "ethereum-classic",
  EOS: "eos",
  XLM: "stellar",
  XTZ: "tezos",
  VET: "vechain",
  ALGO: "algorand",
  FIL: "filecoin",
  ICP: "internet-computer",
  HBAR: "hedera-hashgraph",
  KSM: "kusama",
  FTM: "fantom",
  MATIC: "matic-network",
  POL: "polygon-ecosystem-token",
  RUNE: "thorchain",
  LUNA: "terra-luna",
  SUSHI: "sushi",
  CRV: "curve-dao-token",
  COMP: "compound-governance-token",
  SNX: "havven",
  YFI: "yearn-finance",
  DYDX: "dydx-chain",
  GMX: "gmx",
  GRT: "the-graph",
  STX: "blockstack",
  KAS: "kaspa",
  WLD: "worldcoin-wld",
  ORDI: "ordinals",
  IMX: "immutable-x",
  SAND: "the-sandbox",
  MANA: "decentraland",
  AXS: "axie-infinity",
  APE: "apecoin",
  GALA: "gala",
  ENS: "ethereum-name-service",
  BLUR: "blur",
  JEWEL: "defi-kingdoms",
  PRIME: "echelon-prime",
  IQ: "everipedia",
  ZRX: "0x",
  BAT: "basic-attention-token",
  ZIL: "zilliqa",
  ICX: "icon",
  QTUM: "qtum",
  OMG: "omisego",
  LRC: "loopring",
  CAKE: "pancakeswap-token",
  OSMO: "osmosis",
  MOG: "mog-coin",
  BRETT: "based-brett",
  TURBO: "turbo",
  W: "wormhole",
  ZRO: "layerzero",
  EIGEN: "eigenlayer",
  ETHFI: "ether-fi",
  STRK: "starknet",
  MNT: "mantle",
  BERA: "berachain-bera",
  KAITO: "kaito",
  PENGU: "pudgy-penguins",
  ME: "magic-eden",
  DRIFT: "drift-protocol",
  KMNO: "kamino",
};

/** Ticker → CoinGecko id for well-known assets (also used for live prices on the site). */
export const COINGECKO_IDS: Readonly<Record<string, string>> = COINGECKO;

/** A curated id that lacks early history: older ids for the same asset, tried next. */
const COINGECKO_EARLIER: Record<string, string[]> = {
  DYDX: ["dydx"], // ethDYDX, before the dYdX chain token
};

/**
 * Words the call extraction sometimes reads as a ticker but that aren't one
 * asset: categories, stablecoins, sports teams (bets), "CA" without an address.
 * They are left out of the call record entirely.
 */
export const NOT_COINS: ReadonlySet<string> = new Set(
  (
    "CRYPTO ALTS ALT ALTCOINS ALTCOIN PORTFOLIO PORT NFT NFTS USD USDC USDT DAI BUSD TUSD FDUSD STABLES STABLECOINS STABLECOIN " +
    "ETF ETFS AI MEME MEMES MEMECOIN MEMECOINS SHITCOINS SHITCOIN DEFI L1 L1S L2 L2S BRC20 BRC ERC20 UNKNOWN CASH BAG BAGS TOKEN TOKENS COINS " +
    "EAGLES COWBOYS RAVENS CHIEFS NINERS 49ERS BILLS LIONS PACKERS BEARS JETS GIANTS STEELERS BENGALS BRONCOS DOLPHINS PATRIOTS SAINTS " +
    "COMMANDERS CHARGERS RAMS SEAHAWKS VIKINGS FALCONS PANTHERS BUCS BUCCANEERS CARDINALS COLTS TEXANS JAGUARS TITANS BROWNS RAIDERS " +
    "LAKERS CELTICS KNICKS WARRIORS HEAT"
  ).split(" "),
);
export const isNotCoin = (ticker: string) => {
  const t = ticker.replace(/^\$/, "").trim().toUpperCase();
  return NOT_COINS.has(t) || /^\d+$/.test(t);
};

/**
 * Stocks, ETFs and metals CT calls by ticker → Yahoo Finance symbol. Priced
 * from daily closes adjusted for splits, so a 10:1 split doesn't read as −90%.
 */
export const STOCKS: Readonly<Record<string, string>> = {
  COIN: "COIN", HOOD: "HOOD", MSTR: "MSTR", GLXY: "GLXY", CRCL: "CRCL", RIOT: "RIOT", MARA: "MARA", CLSK: "CLSK", HUT: "HUT", BITF: "BITF",
  NVDA: "NVDA", AMD: "AMD", TSLA: "TSLA", AAPL: "AAPL", MSFT: "MSFT", GOOG: "GOOG", GOOGL: "GOOGL", AMZN: "AMZN", META: "META", FB: "META",
  NFLX: "NFLX", PLTR: "PLTR", SQ: "XYZ", XYZ: "XYZ", PYPL: "PYPL", SHOP: "SHOP", ROKU: "ROKU", ZM: "ZM", UBER: "UBER", LYFT: "LYFT",
  SNAP: "SNAP", TWTR: "TWTR", GME: "GME", AMC: "AMC", BB: "BB", NOK: "NOK", SOFI: "SOFI", INTC: "INTC", ORCL: "ORCL", CRM: "CRM", IBM: "IBM",
  MU: "MU", AVGO: "AVGO", SMCI: "SMCI", ARM: "ARM", CRWV: "CRWV", RKLB: "RKLB", RIVN: "RIVN", GE: "GE", TJX: "TJX", DKNG: "DKNG", PENN: "PENN",
  BABA: "BABA", JD: "JD", NIO: "NIO", BIDU: "BIDU", PDD: "PDD", HUYA: "HUYA", YY: "JOYY", TME: "TME", IQ: "IQ", BILI: "BILI", SE: "SE",
  ATVI: "ATVI", WORK: "WORK", HYMC: "HYMC",
  // ETFs and trusts
  SPY: "SPY", QQQ: "QQQ", IWM: "IWM", TLT: "TLT", ARKK: "ARKK", GBTC: "GBTC", ETHE: "ETHE", IBIT: "IBIT", FBTC: "FBTC", BITO: "BITO",
  SLV: "SLV", GLD: "GLD", GDX: "GDX", USO: "USO",
  // metals, oil, the dollar
  GOLD: "GC=F", XAU: "GC=F", SILVER: "SI=F", XAG: "SI=F", OIL: "CL=F", DXY: "DX-Y.NYB",
};

/** Chains to try for a bare EVM address, in order. */
const EVM_CHAINS = ["ethereum", "base", "bsc", "arbitrum"];

/** Candidate price ids for a call, best first. Empty → no price source. */
export function priceIds(call: { ticker: string; chain: string | null; address: string | null }): string[] {
  // A known major wins over any address that happens to be in the same post.
  const t = call.ticker.replace(/^\$/, "").toUpperCase();
  const cg = COINGECKO[t];
  if (cg) return [`coingecko:${cg}`, ...(COINGECKO_EARLIER[t] ?? []).map((id) => `coingecko:${id}`)];
  if (STOCKS[t]) return [`stock:${STOCKS[t]}`];
  if (call.address && call.chain === "solana") return [`solana:${call.address}`];
  if (call.address && call.chain === "evm") return EVM_CHAINS.map((c) => `${c}:${call.address}`);
  return [];
}
