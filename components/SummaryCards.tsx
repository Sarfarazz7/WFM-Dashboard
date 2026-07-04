interface CardsData {
  aht: number;
  abandonmentPct: number;
  totalBreaks: number;
  avgBreakDuration: number;
  shrinkagePct: number;
  csatAvg: number;
}

interface Props {
  cards: CardsData | null;
  loading: boolean;
}

// Tailwind's JIT compiler needs statically-discoverable class names, so
// dynamic metric colors are applied via inline style hex values instead
// of interpolated class strings (which Tailwind would fail to generate).
const CARD_CONFIG = [
  { key: "aht", label: "AHT (sec)", hex: "#3b82f6", suffix: "" },
  { key: "abandonmentPct", label: "Abandoned Call %", hex: "#f43f5e", suffix: "%" },
  { key: "totalBreaks", label: "Total Breaks", hex: "#2dd4c8", suffix: "" },
  { key: "shrinkagePct", label: "Shrinkage %", hex: "#f59e0b", suffix: "%" },
] as const;

export default function SummaryCards({ cards, loading }: Props) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {CARD_CONFIG.map((c) => (
        <div key={c.key} className="card relative overflow-hidden">
          <div className="absolute top-0 left-0 h-1 w-full" style={{ backgroundColor: c.hex }} />
          <p className="label-eyebrow">{c.label}</p>
          <p className="text-2xl font-display font-semibold text-mist-50 mt-2">
            {loading ? (
              <span className="inline-block h-7 w-16 bg-ink-700 rounded animate-pulse" />
            ) : cards ? (
              <>
                {cards[c.key]}
                {c.suffix}
              </>
            ) : (
              "—"
            )}
          </p>
        </div>
      ))}
    </div>
  );
}
