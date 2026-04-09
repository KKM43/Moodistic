import CalendarHeatmap from "react-calendar-heatmap";
import { Tooltip } from "react-tooltip";
import type { ReactCalendarHeatmapValue } from "react-calendar-heatmap";
import type { JournalEntry } from "../types";
import "react-calendar-heatmap/dist/styles.css";

interface Props {
  entries: JournalEntry[];
}

interface HeatmapValue extends ReactCalendarHeatmapValue<string> {
  date: string;
  mood: number;
  preview: string;
  count: number;
}

const MOOD_LABELS: Record<number, string> = {
  1: "Really rough 😞",
  2: "Not great 😕",
  3: "Okay 😐",
  4: "Pretty good 🙂",
  5: "Great 😊",
};

export default function MoodHeatmap({ entries }: Props) {
  if (entries.length === 0) {
    return (
      <div className="chart-empty">
        Write your first entry to see your mood calendar 🌱
      </div>
    );
  }

  const byDate = entries.reduce(
    (acc, entry) => {
      const date = new Date(entry.created_at).toISOString().split("T")[0];
      if (!acc[date]) acc[date] = { moods: [], previews: [] };
      acc[date].moods.push(entry.mood_score);
      acc[date].previews.push(entry.content.slice(0, 50));
      return acc;
    },
    {} as Record<string, { moods: number[]; previews: string[] }>,
  );

  const values: HeatmapValue[] = Object.entries(byDate).map(([date, data]) => ({
    date,
    mood: Math.round(data.moods.reduce((a, b) => a + b, 0) / data.moods.length),
    preview:
      data.previews[0] +
      (data.previews.length > 1 ? ` (+${data.previews.length - 1} more)` : ""),
    count: data.moods.length,
  }));

  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 3);

  const getClass = (
    value: ReactCalendarHeatmapValue<string> | undefined,
  ): string => {
    if (!value) return "color-empty";
    const v = value as HeatmapValue;
    if (v.mood <= 2) return "color-mood-low";
    if (v.mood === 3) return "color-mood-mid";
    if (v.mood >= 4) return "color-mood-high";
    return "color-empty";
  };

  const getTooltip = (
    value: ReactCalendarHeatmapValue<string> | undefined | null,
  ): Record<string, string> => {
    if (!value || !value.date) {
      return {
        "data-tooltip-id": "mood-tip",
        "data-tooltip-content": "No entry on this day 🌱",
      };
    }

    const v = value as HeatmapValue | any;

    if (!v.date || !v.mood) {
      return {
        "data-tooltip-id": "mood-tip",
        "data-tooltip-content": "No entry on this day 🌱",
      };
    }

    const dateStr = new Date(v.date).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

    const moodLabel = MOOD_LABELS[v.mood] || "Unknown mood";

    const content = `${dateStr} · ${moodLabel} · "${v.preview || "No preview available"}"`;

    return {
      "data-tooltip-id": "mood-tip",
      "data-tooltip-content": content,
    };
  };

  return (
    <div className="heatmap-wrap">
      <CalendarHeatmap
        startDate={startDate}
        endDate={endDate}
        values={values}
        classForValue={getClass}
        tooltipDataAttrs={getTooltip}
        showWeekdayLabels={true}
        gutterSize={4}
      />
      <Tooltip
        id="mood-tip"
        style={{
          background: "#2c2416",
          color: "#faf6f1",
          borderRadius: "10px",
          padding: "12px 16px",
          maxWidth: "320px",
          fontSize: "13.5px",
          lineHeight: "1.5",
          zIndex: 100,
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        }}
      />

      <div className="heatmap-legend">
        <span className="legend-label">Less</span>
        <span className="legend-box color-empty" />
        <span className="legend-box color-mood-low" />
        <span className="legend-box color-mood-mid" />
        <span className="legend-box color-mood-high" />
        <span className="legend-label">More</span>
      </div>
    </div>
  );
}
