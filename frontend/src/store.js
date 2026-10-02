import { create } from "zustand";
import { api } from "./api";
import { ALL_ASSET_TYPES } from "./constants";

// Bumped per chart request so only the latest response is applied.
let chartSeq = 0;

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

export const useStore = create((set, get) => ({
  // Settings
  enabledTypes: ["deposits", "bank_accounts", "cash", "crypto", "stocks_bonds", "real_estate", "debts"],
  currencies: ["EUR", "USD", "RUB", "RSD"],
  banks: { deposits: ["Tinkoff", "Sber"], bank_accounts: ["Tinkoff", "Sber", "Alpha"] },
  displayCurrency: "EUR",
  assetScope: "all", // "all" | "liquid"
  includeDebts: true, // whether the Liquid view counts debts owed to the user

  // Data
  assets: [],
  transactions: [],
  chartData: [],
  rates: {},

  // UI
  loading: false,
  period: "30d",
  privateMode: true,

  loadSettings: async () => {
    try {
      const settings = await api.getSettings();
      const map = {};
      settings.forEach((s) => (map[s.key] = s.value));
      set({
        enabledTypes: map.enabled_types || get().enabledTypes,
        currencies: map.currencies || get().currencies,
        banks: map.banks || get().banks,
        displayCurrency: map.display_currency || get().displayCurrency,
        assetScope: map.asset_scope || get().assetScope,
        includeDebts: map.include_debts ?? get().includeDebts,
      });
    } catch {
      // use defaults
    }
  },

  updateSetting: async (key, value) => {
    try {
      await api.updateSetting(key, value);
    } catch {
      // continue with local state
    }
  },

  loadAssets: async () => {
    try {
      const assets = await api.getAssets();
      set({ assets });
    } catch {
      // keep existing
    }
  },

  loadTransactions: async () => {
    try {
      const transactions = await api.getTransactions();
      set({ transactions });
    } catch {
      // keep existing
    }
  },

  loadChartData: async (period) => {
    try {
      const seq = ++chartSeq;
      // Sum exactly the categories on screen, so the chart matches the total.
      const types = get().visibleTypes().map((t) => t.key);
      const chartData = await api.getPortfolioHistory(period || get().period, types);
      if (seq !== chartSeq) return;
      set({ chartData });
    } catch {
      // keep existing
    }
  },

  loadRates: async () => {
    try {
      const ratesArr = await api.getRates();
      const rates = {};
      ratesArr.forEach((r) => {
        if (!rates[r.base]) rates[r.base] = {};
        rates[r.base][r.quote] = r.rate;
      });
      set({ rates });
    } catch {
      // keep existing
    }
  },

  createAsset: async (data) => {
    const asset = await api.createAsset(data);
    set((s) => ({ assets: [...s.assets, asset] }));
    return asset;
  },

  updateAsset: async (id, data) => {
    const updated = await api.updateAsset(id, data);
    set((s) => ({ assets: s.assets.map((a) => (a.id === id ? updated : a)) }));
    get().loadChartData();
    get().loadTransactions();
    return updated;
  },

  deleteAsset: async (id) => {
    await api.deleteAsset(id);
    set((s) => ({ assets: s.assets.filter((a) => a.id !== id) }));
    get().loadChartData();
  },

  createTransaction: async (data) => {
    const txn = await api.createTransaction(data);
    set((s) => ({ transactions: [txn, ...s.transactions] }));
    get().loadAssets();
    get().loadChartData();
    return txn;
  },

  setDisplayCurrency: async (currency) => {
    set({ displayCurrency: currency });
    await get().updateSetting("display_currency", currency);
    get().loadChartData();
  },

  setEnabledTypes: async (types) => {
    set({ enabledTypes: types });
    get().loadChartData();
    await get().updateSetting("enabled_types", types);
  },

  setAssetScope: async (scope) => {
    set({ assetScope: scope });
    get().loadChartData();
    await get().updateSetting("asset_scope", scope);
  },

  setIncludeDebts: async (includeDebts) => {
    set({ includeDebts });
    get().loadChartData();
    await get().updateSetting("include_debts", includeDebts);
  },

  // Enabled types narrowed to the current All / Liquid scope.
  visibleTypes: () => {
    const { enabledTypes, assetScope, includeDebts } = get();
    return ALL_ASSET_TYPES.filter(
      (t) => enabledTypes.includes(t.key) && (assetScope === "all" || (t.liquid && (includeDebts || t.key !== "debts"))),
    );
  },

  setCurrencies: async (currencies) => {
    set({ currencies });
    await get().updateSetting("currencies", currencies);
  },

  setBanks: async (banks) => {
    set({ banks });
    await get().updateSetting("banks", banks);
  },

  setPeriod: (period) => {
    set({ period });
    get().loadChartData(period);
  },

  resetAllData: async () => {
    await api.resetData();
    set({ assets: [], transactions: [], chartData: [] });
    await get().loadChartData();
  },

  initApp: async () => {
    set({ loading: true });
    try {
      await Promise.all([
        get().loadSettings(),
        get().loadRates(),
      ]);
      await Promise.all([
        get().loadAssets(),
        get().loadTransactions(),
        get().loadChartData(),
      ]);
    } finally {
      set({ loading: false });
    }
  },

  toDisplay: (amount, currency) => {
    const { displayCurrency, rates } = get();
    if (currency === displayCurrency) return amount;
    const table = rates[currency];
    if (table && table[displayCurrency] !== undefined) {
      return amount * table[displayCurrency];
    }
    const inverseTable = rates[displayCurrency];
    if (inverseTable && inverseTable[currency] !== undefined && inverseTable[currency] !== 0) {
      return amount / inverseTable[currency];
    }
    return amount;
  },
}));
