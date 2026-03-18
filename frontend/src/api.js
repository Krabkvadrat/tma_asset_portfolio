const BASE_URL = "/api";

function getInitData() {
  if (window.Telegram?.WebApp?.initData) {
    return window.Telegram.WebApp.initData;
  }
  return "dev:1";
}

async function request(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    "X-Telegram-Init-Data": getInitData(),
    ...options.headers,
  };

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {
  getPortfolio: () => request("/portfolio/"),
  getPortfolioHistory: (period) => request(`/portfolio/history?period=${period}`),

  getAssets: () => request("/assets/"),
  createAsset: (data) => request("/assets/", { method: "POST", body: JSON.stringify(data) }),
  updateAsset: (id, data) => request(`/assets/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteAsset: (id) => request(`/assets/${id}`, { method: "DELETE" }),

  getTransactions: () => request("/transactions/"),
  createTransaction: (data) => request("/transactions/", { method: "POST", body: JSON.stringify(data) }),

  getSettings: () => request("/settings/"),
  updateSetting: (key, value) => request("/settings/", { method: "PUT", body: JSON.stringify({ key, value }) }),

  getRates: () => request("/rates/"),
  refreshRates: () => request("/rates/refresh", { method: "POST" }),
};
