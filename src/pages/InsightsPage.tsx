import { useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { useJournal } from "../hooks/useJournal";
import MoodChart from "../components/MoodChart";
import MoodStats from "../components/MoodStats";
import Sidebar from "../components/Sidebar";
import MoodHeatmap from "../components/MoodHeatmap";
import { useInsights } from "../hooks/useInsights";
import InsightsCard from "../components/InsightsCard";

export default function InsightsPage() {
  const { user } = useAuth();
  const { entries, loadingEntries, fetchEntries } = useJournal(user?.id ?? "");
  const { insights, loading: insightsLoading } = useInsights(
    loadingEntries ? [] : entries,
  );

  useEffect(() => {
    if (user?.id) fetchEntries();
  }, [user?.id]);

  return (
    <div className="journal-layout">
      <Sidebar entryCount={entries.length} />

      <main className="journal-main">
        <div className="insights-view">
          <div className="journal-header">
            <h2 className="journal-title">Your Insights</h2>
            <p className="journal-subtitle">
              Patterns in how you feel — awareness is the first step to change.
            </p>
          </div>

          {loadingEntries ? (
            <p className="loading-entries">Crafting your mood story...</p>
          ) : (
            <div className="insights-dashboard">
              <MoodStats entries={entries} />
              <InsightsCard insights={insights} loading={insightsLoading} />

              

              <div className="dashboard-grid">
                <div className="dashboard-card mood-trend-card">
                  <h3 className="section-heading">Mood Over Time</h3>
                  <MoodChart entries={entries} />

                  <div className="calendar-section">
                    <h3 className="section-heading">6-Month Mood Calendar</h3>
                    <p className="section-subheading">
                      Each square is a day. Hover to see what you wrote.
                    </p>
                    <MoodHeatmap entries={entries} />
                  </div>
                </div>

                <div className="dashboard-card recent-reflections-card">
                  <h3 className="section-heading">Recent Reflections</h3>
                  {entries.length === 0 ? (
                    <p className="empty-history">
                      No entries yet — start journaling to see insights 🌱
                    </p>
                  ) : (
                    <div className="recent-entries-list">
                      {entries.slice(0, 3).map((entry) => (
                        <div key={entry.id} className="insight-entry-card">
                          <div className="entry-meta">
                            <span className="entry-date">
                              {new Date(entry.created_at).toLocaleDateString(
                                "en-IN",
                                {
                                  day: "numeric",
                                  month: "short",
                                },
                              )}
                            </span>
                            <span className="entry-mood">
                              {
                                ["", "😞", "😕", "😐", "🙂", "😊"][
                                  entry.mood_score
                                ]
                              }
                            </span>
                          </div>
                          <p className="entry-content">
                            {entry.ai_response?.length > 135
                              ? entry.ai_response.slice(0, 135) + "..."
                              : entry.ai_response || "No summary yet."}
                          </p>
                          <span className="view-in-past">
                            View full entry in Past Sessions →
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
