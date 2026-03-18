export const CURRENCY_SYMBOLS = { EUR: "€", USD: "$", RUB: "₽" };
export const CRYPTO_CURRENCIES = ["BTC", "ETH"];

export const ALL_ASSET_TYPES = [
  { key: "deposits", label: "Deposits", icon: "🏦", color: "#3B82F6", hasBanks: true },
  { key: "bank_accounts", label: "Bank Accounts", icon: "🏧", color: "#6366F1", hasBanks: true },
  { key: "cash", label: "Cash", icon: "💵", color: "#10B981" },
  { key: "crypto", label: "Crypto", icon: "₿", color: "#EC4899" },
  { key: "stocks_bonds", label: "Stocks/Bonds", icon: "📈", color: "#F59E0B" },
];

export const PERIODS = ["7d", "30d", "90d", "180d", "1Y", "Custom"];
