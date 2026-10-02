// Formats a typed amount with spaces between thousands: "210000.5" -> "210 000.5".
export function formatAmountInput(value) {
  const clean = String(value).replace(/,/g, ".").replace(/[^\d.]/g, "");
  const [int, ...rest] = clean.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return rest.length ? `${grouped}.${rest.join("")}` : grouped;
}

export function parseAmountInput(value) {
  return parseFloat(String(value).replace(/\s/g, ""));
}
