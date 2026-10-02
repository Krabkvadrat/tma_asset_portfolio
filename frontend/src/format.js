// Thousands separator used everywhere amounts are shown or typed. A no-break
// space keeps "210 000" from wrapping across lines.
const SEP = " ";

// Display: 1234567.891 -> "1 234 567.891" (up to 3 decimals, like toLocaleString).
export function formatNumber(n) {
  return n.toLocaleString("en-US").replace(/,/g, SEP);
}

// Rates: 5 significant digits, so 0.0085412 and 58 300 both stay readable.
export function formatRate(n) {
  return n.toLocaleString("en-US", { maximumSignificantDigits: 5 }).replace(/,/g, SEP);
}

// Input: groups the integer part of a typed amount: "210000.5" -> "210 000.5".
export function formatAmountInput(value) {
  let str = String(value);
  if (typeof value === "number" && str.includes("e")) str = value.toFixed(20).replace(/\.?0+$/, "");
  // A comma is the decimal point unless a dot is already there ("1,234.56").
  const clean = (str.includes(".") ? str.replace(/,/g, "") : str.replace(/,/g, "."))
    .replace(/[^\d.]/g, "");
  const [int, ...rest] = clean.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, SEP);
  return rest.length ? `${grouped}.${rest.join("")}` : grouped;
}

export function parseAmountInput(value) {
  return parseFloat(String(value).replace(/\s/g, ""));
}
