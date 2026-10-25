import "./Legend.css";
import { t } from "../../i18n";
import { formatNumber, reportTypeLabel, statusLabel } from "../../i18n/formatters";

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
          <span className="legend-count">{formatNumber(counts[keyName]!)}</span>
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
      <div className="legend-title">{t("legend.title")}</div>
      <div className="legend-grid">
        <Item keyName="emergency" dot="dot--red" label={reportTypeLabel("emergency")} />
        <Item keyName="food" dot="dot--green" label={reportTypeLabel("food")} />
        <Item keyName="general" dot="dot--yellow" label={reportTypeLabel("general")} />

        <Item keyName="in-progress" dot="dot--blue" label={statusLabel("in-progress")} />
        <Item keyName="resolved" dot="dot--gray" label={statusLabel("resolved")} />
      </div>
    </div>
  );
}
