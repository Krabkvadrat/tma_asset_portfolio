// Thousands separator used everywhere amounts are shown or typed. A no-break
// space keeps "210 000" from wrapping across lines.
const SEP = " ";

// Display: 1234567.891 -> "1 234 567.891" (up to 3 decimals, like toLocaleString).
export function formatNumber(n) {
  return n.toLocaleString("en-US").replace(/,/g, SEP);
}

// Input: groups the integer part of a typed amount: "210000.5" -> "210 000.5".
export function formatAmountInput(value) {
  const str = typeof value === "number"
    ? value.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 20 })
    : String(value);
  const clean = str.replace(/,/g, ".").replace(/[^\d.]/g, "");
  const [int, ...rest] = clean.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, SEP);
  return rest.length ? `${grouped}.${rest.join("")}` : grouped;
}

export function parseAmountInput(value) {
  return parseFloat(String(value).replace(/\s/g, ""));
}
