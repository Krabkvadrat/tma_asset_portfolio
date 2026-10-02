import { useLayoutEffect, useReducer, useRef } from "react";
import { formatAmountInput } from "../format";

// Number of characters that are not separators.
const significant = (s) => s.replace(/\s/g, "").length;

// Text input that groups thousands as you type and keeps the caret next to the
// same digit instead of jumping to the end when separators shift.
export default function AmountInput({ value, onChange, ...props }) {
  const ref = useRef(null);
  const caret = useRef(null);
  // Re-render even when the value is unchanged (e.g. deleting a separator),
  // otherwise React resets the input and the caret lands at the end.
  const [, rerender] = useReducer((n) => n + 1, 0);
  const formatted = formatAmountInput(value);

  useLayoutEffect(() => {
    if (caret.current === null || !ref.current) return;
    let left = caret.current;
    let pos = 0;
    while (pos < formatted.length && left > 0) {
      if (!/\s/.test(formatted[pos])) left--;
      pos++;
    }
    ref.current.setSelectionRange(pos, pos);
    caret.current = null;
  });

  return (
    <input {...props} ref={ref} inputMode="decimal" value={formatted}
      onChange={(e) => {
        const { value: raw, selectionStart } = e.target;
        caret.current = significant(formatAmountInput(raw.slice(0, selectionStart ?? raw.length)));
        onChange(formatAmountInput(raw));
        rerender();
      }} />
  );
}
