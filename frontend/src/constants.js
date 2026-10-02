export const CURRENCY_SYMBOLS = { EUR: "€", USD: "$", RUB: "₽", RSD: "дин." };
export const CRYPTO_CURRENCIES = ["BTC", "ETH", "USDT"];

// `liquid` types make up the Liquid view; `debts` can be switched off there.
export const ALL_ASSET_TYPES = [
  { key: "deposits", label: "Deposits", icon: "🏦", color: "#3B82F6", hasBanks: true, liquid: true },
  { key: "bank_accounts", label: "Bank Accounts", icon: "🏧", color: "#6366F1", hasBanks: true, liquid: true },
  { key: "cash", label: "Cash", icon: "💵", color: "#10B981", liquid: true },
  { key: "crypto", label: "Crypto", icon: "₿", color: "#EC4899" },
  { key: "stocks_bonds", label: "Stocks/Bonds", icon: "📈", color: "#F59E0B", liquid: true },
  { key: "real_estate", label: "Real Estate", icon: "🏠", color: "#06B6D4", placeholder: "e.g. Belgrade Apartment" },
  { key: "car", label: "Car", icon: "🚗", color: "#8B5CF6", placeholder: "e.g. Toyota Corolla" },
  { key: "debts", label: "Debts", icon: "🤝", color: "#84CC16", liquid: true, nameLabel: "Who owes you", placeholder: "e.g. Ivan" },
];

export const PERIODS = ["7d", "30d", "90d", "180d", "1Y", "Custom"];
