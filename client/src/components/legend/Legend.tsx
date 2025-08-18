import "./Legend.css";

type LegendKey =
  | "emergency"
  | "food"
  | "general"
  | "new"
  | "in-progress"
  | "resolved";

export default function Legend({
  counts,
  compact,
  row = false,
  activeKeys = [],
  onToggle,
}: {
  counts?: Partial<Record<LegendKey, number>>;
  compact?: boolean;
  row?: boolean; // set true for single-line (horizontal) layout
  activeKeys?: LegendKey[]; // highlight selected filters
  onToggle?: (key: LegendKey) => void; // make items clickable to toggle
}) {
  const Item = ({
    keyName,
    dot,
    label,
  }: {
    keyName: LegendKey;
    dot: string;
    label: string;
  }) => {
    const isActive = activeKeys.includes(keyName);
    const clickable = typeof onToggle === "function";

    const classes = [
      "legend-item",
      clickable ? "legend-item--clickable" : "",
      isActive ? "legend-item--active" : "",
    ]
      .filter(Boolean)
      .join(" ");

    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!clickable) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onToggle!(keyName);
      }
    };

    return (
      <div
        className={classes}
        role={clickable ? "button" : undefined}
        tabIndex={clickable ? 0 : undefined}
        onClick={clickable ? () => onToggle!(keyName) : undefined}
        onKeyDown={onKeyDown}
        aria-pressed={clickable ? isActive : undefined}
      >
        <span className={`dot ${dot}`} />
        <span className="legend-label">{label}</span>
        {counts?.[keyName] != null && (
          <span className="legend-count">{counts[keyName]}</span>
        )}
      </div>
    );
  };

  return (
    <div
      className={`legend ${compact ? "legend--compact" : ""} ${
        row ? "legend--row" : ""
      }`}
    >
      <div className="legend-title">Legend</div>
      <div className="legend-grid">
        <Item keyName="emergency" dot="dot--red" label="Emergency" />
        <Item keyName="food" dot="dot--green" label="Food" />
        <Item keyName="general" dot="dot--blue" label="General" />
        <Item keyName="new" dot="dot--gray" label="New" />
        <Item keyName="in-progress" dot="dot--amber" label="In progress" />
        <Item keyName="resolved" dot="dot--emerald" label="Resolved" />
      </div>
    </div>
  );
}
