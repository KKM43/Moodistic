import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import type { AppLanguage } from "../types";
import { useState } from "react";

interface Props {
  entryCount?: number;
  language?: AppLanguage;
  onLanguageChange?: (lang: AppLanguage) => void;
  onSignOutClick?: () => void;
}

export default function Sidebar({
  entryCount = 0,
  onSignOutClick,
}: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const isJournal = location.pathname === "/journal";
  const isPastSessions = location.pathname === "/past-sessions";
  const isInsights = location.pathname === "/insights";

  const handleNavClick = (path: string) => {
    navigate(path);
    setIsOpen(false);
  };

  const handleSignOut = () => {
    setIsOpen(false);
    onSignOutClick ? onSignOutClick() : signOut();
  };

  const userName = user?.user_metadata?.full_name 
    ? user.user_metadata.full_name.split(" ")[0] 
    : user?.email?.split("@")[0] || "there";

  return (
    <>
      {/* Hamburger Button */}
      <button
        className="mobile-hamburger"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Open menu"
      >
        {isOpen ? "✕" : "☰"}
      </button>

      {/* Overlay */}
      {isOpen && (
        <div
          className="sidebar-overlay show"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside className={`sidebar ${isOpen ? "open" : ""}`}>
        <div className="sidebar-brand">
          <img src="/icons/logo.png" alt="Moodistic" className="sidebar-logo" />
          <span className="sidebar-title">Moodistic</span>
        </div>

        {/* Improved user greeting - compact */}
        <div className="sidebar-user">
          Hey, {userName} 👋
        </div>

        <nav className="sidebar-nav">
          <button
            className={`nav-btn ${isJournal && !isPastSessions ? "nav-active" : ""}`}
            onClick={() => handleNavClick("/journal")}
          >
            ✏️ New Session
          </button>

          <button
            className={`nav-btn ${isPastSessions ? "nav-active" : ""}`}
            onClick={() => handleNavClick("/past-sessions")}
          >
            📖 Past Sessions
            {entryCount > 0 && (
              <span className="entry-count">{entryCount}</span>
            )}
          </button>

          <button
            className={`nav-btn ${isInsights ? "nav-active" : ""}`}
            onClick={() => handleNavClick("/insights")}
          >
            📈 Insights
          </button>
        </nav>

        {/* Sign Out moved closer to the bottom with better spacing */}
        <div className="sidebar-footer">
          <button className="signout-btn" onClick={handleSignOut}>
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}