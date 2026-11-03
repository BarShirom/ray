import type { FeedingSummary } from "../../features/feedingLogs/types";
import { t } from "../../i18n";

/** Only the approved coarse DTO is rendered; no event or feeder is inferred. */
export default function FeedingCoordinationSummary({ summary }: { summary: FeedingSummary }) {
  return <dl className="station-feeding-summary">
    <div><dt>{t("feeding.food")}</dt><dd>{t(`feeding.recency.${summary.food.recency}`)}</dd></div>
    <div><dt>{t("feeding.water")}</dt><dd>{t(`feeding.recency.${summary.water.recency}`)}</dd></div>
  </dl>;
}
