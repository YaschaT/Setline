// SLFlexPair.swift — tiles side by side the way CSS `flex: 1` sets them:
// equal shares, except that no tile goes narrower than its content. When the
// contents together are wider than the row, each tile keeps what it cannot
// give up and the rest is shared in proportion to what each value asks for.
import { Children, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { SL } from "../tokens";
import { useFillWidth } from "../support";

export function SLFlexPair({ spacing = SL.Space.s2, children, style }: { spacing?: number; children?: ReactNode; style?: CSSProperties }) {
  const [ref, fill] = useFillWidth<HTMLDivElement>();
  const items = Children.toArray(children);
  const cells = useRef<(HTMLDivElement | null)[]>([]);

  useLayoutEffect(() => {
    const row = ref.current;
    if (!row) return;
    const layout = () => {
      const nodes = cells.current.slice(0, items.length).filter((n): n is HTMLDivElement => !!n);
      if (nodes.length === 0) return;
      const gaps = spacing * Math.max(0, nodes.length - 1);
      const available = Math.max(0, row.clientWidth - gaps);
      // sizeThatFits(.unspecified) and sizeThatFits(width: 0).
      const measure = (w: string) =>
        nodes.map((n) => {
          n.style.width = w;
          return n.getBoundingClientRect().width;
        });
      const content = measure("max-content");
      const floors = measure("min-content");
      const widths = columnWidths(available, content, floors);
      nodes.forEach((n, i) => (n.style.width = `${widths[i]}px`));
    };
    layout();
    const observer = new ResizeObserver(layout);
    observer.observe(row);
    return () => observer.disconnect();
  });

  return (
    <div ref={ref} style={{ display: "flex", flexDirection: "row", alignItems: "flex-start", gap: spacing, minWidth: 0, ...fill, ...style }}>
      {items.map((child, i) => (
        <div
          key={i}
          ref={(n) => {
            cells.current[i] = n;
          }}
          style={{ flex: "0 0 auto", minWidth: 0, display: "flex", flexDirection: "column", alignItems: "stretch" }}
        >
          {child}
        </div>
      ))}
    </div>
  );
}

function columnWidths(available: number, content: number[], floors: number[]): number[] {
  const count = content.length;
  if (count === 0) return [];
  const equal = Array<number>(count).fill(available / count);

  // A tile whose content needs more than its share keeps its content width;
  // the others divide what is left, until nobody needs more.
  const widths = [...equal];
  const held = new Set<number>();
  for (;;) {
    const open = content.map((_, i) => i).filter((i) => !held.has(i));
    if (open.length === 0) break;
    const left = available - [...held].reduce((s, i) => s + widths[i], 0);
    const share = left / open.length;
    const growing = open.filter((i) => content[i] > share);
    if (growing.length === 0) {
      for (const i of open) widths[i] = share;
      break;
    }
    for (const i of growing) {
      widths[i] = content[i];
      held.add(i);
    }
  }
  if (!(widths.reduce((s, w) => s + w, 0) > available + 0.5)) return widths;

  const asks = content.map((c, i) => Math.max(0, c - floors[i]));
  const room = available - floors.reduce((s, f) => s + f, 0);
  const asked = asks.reduce((s, a) => s + a, 0);
  if (!(room > 0 && asked > 0)) return equal;
  return floors.map((f, i) => f + asks[i] * Math.min(1, room / asked));
}
