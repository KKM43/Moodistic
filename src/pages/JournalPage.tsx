import { useState, useEffect, useRef, useMemo } from "react";
import { useAuth } from "../hooks/useAuth";
import { useJournal } from "../hooks/useJournal";
import { getChatResponse, getSessionSummary, checkRateLimit } from "../lib/ai";
import { retrieveRelevantEntries, isCrisisEntry } from "../lib/retrieval";
import MoodSelector from "../components/MoodSelector";
import CrisisSupport from "../components/CrisisSupport";
import type { ChatMessage } from "../types";
import { getWelcomeMessage } from "../lib/welcome";
import Sidebar from "../components/Sidebar";
import ConfirmModal from "../components/ConfirmModal";
import GuidedPrompts from "../components/GuidedPrompts";
import { useLanguage } from "../hooks/useLanguage";
import { OPENING_MESSAGES, UI_STRINGS } from "../lib/languages";
import { buildUserMemory } from "../lib/memory";

type SessionState = "mood" | "chatting" | "ending" | "ended";

interface Props {
  showHistory?: boolean;
}

const MOOD_EMOJIS: Record<number, string> = {
  1: "😞",
  2: "😕",
  3: "😐",
  4: "🙂",
  5: "😊",
};

export default function JournalPage({ showHistory = false }: Props) {
  const { user, signOut } = useAuth();
  const { entries, loadingEntries, fetchEntries, saveEntry } = useJournal(
    user?.id ?? "",
  );

  const [sessionState, setSessionState] = useState<SessionState>("mood");
  const [mood, setMood] = useState(3);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isCrisis, setIsCrisis] = useState(false);

  const [error, setError] = useState("");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [welcomeLoading, setWelcomeLoading] = useState(true);
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<any>(null);

  const { language, setLanguage } = useLanguage();
  const ui = UI_STRINGS[language];

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user?.id) fetchEntries();
  }, [user?.id]);

  useEffect(() => {
    if (loadingEntries) return;

    const timer = setTimeout(async () => {
      setWelcomeLoading(true);
      const msg = await getWelcomeMessage(entries);
      setWelcomeMessage(msg);
      setWelcomeLoading(false);
    }, 100);

    return () => clearTimeout(timer);

    const loadWelcome = async () => {
      setWelcomeLoading(true);
      const msg = await getWelcomeMessage(entries);
      setWelcomeMessage(msg);
      setWelcomeLoading(false);
    };

    loadWelcome();
  }, [loadingEntries]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSignOutClick = () => {
    if (sessionState === "chatting" && messages.length > 1) {
      setShowDiscardModal(true);
    } else {
      setShowSignOutModal(true);
    }
  };

  const handleSaveAndSignOut = async () => {
    setShowDiscardModal(false);

    await endSession();
    await signOut();
    signOut();
  };

  const startSession = () => {
    setSessionState("chatting");
    const openingMessage = OPENING_MESSAGES[language];
    setMessages([
      {
        role: "assistant",
        content: openingMessage,
        timestamp: new Date(),
      },
    ]);
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    if (!checkRateLimit(user!.id)) {
      setError(
        "You've reached today's limit of 20 messages. Come back tomorrow 🌱",
      );
      setLoading(false);
      return;
    }

    const userText = input.trim();
    setInput("");
    setError("");

    if (isCrisisEntry(userText)) {
      setIsCrisis(true);
      return;
    }

    const userMessage: ChatMessage = {
      role: "user",
      content: userText,
      timestamp: new Date(),
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setLoading(true);

    try {
      const lastContext = messages
        .slice(-3)
        .map((m) => m.content)
        .join(" ");

      const ragInput = `${lastContext} ${userText}`;

      const relevantPast = retrieveRelevantEntries(ragInput, entries, mood, 2);

      console.log("RAG selected entries:", relevantPast);

      const userMemory = buildUserMemory(entries);

      const response = await getChatResponse(
        updatedMessages,
        relevantPast,
        language,
        userMemory,
      );

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: response,
          timestamp: new Date(),
        },
      ]);
    } catch (err: any) {
      const msg =
        err.message?.includes("429") || err.message?.includes("rate")
          ? "Taking a short break — please wait a moment and try again 🙏"
          : "Taking a bit longer than usual... try again in a moment 🙏";
      setError(msg);
    }

    setLoading(false);
  };

  const endSession = async () => {
    if (messages.length < 3) return;
    setSessionState("ending");

    try {
      const summary = await getSessionSummary(messages);

      const fullConversation = messages
        .map((m) => `${m.role === "user" ? "You" : "MindShift"}: ${m.content}`)
        .join("\n\n");

      const { error } = await saveEntry(fullConversation, summary, mood);

      if (error) {
        setError("Could not save your entry. Please try again.");
        setSessionState("chatting");
      } else {
        setSessionState("ended");
      }
    } catch (err) {
      setError("Could not save session. Please try again.");
      setSessionState("chatting");
    }
  };

  const startNewSession = () => {
    setSessionState("mood");
    setMood(3);
    setMessages([]);
    setInput("");
    setIsCrisis(false);
    setError("");
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatMessageTime = (date: Date) => {
    return date.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const parseConversationToMessages = (content: string): ChatMessage[] => {
    if (!content) return [];

    const lines = content.split("\n\n");
    return lines
      .map((line) => {
        if (line.startsWith("You:")) {
          return {
            role: "user" as const,
            content: line.replace("You: ", ""),
            timestamp: new Date(),
          };
        } else if (line.startsWith("MindShift:")) {
          return {
            role: "assistant" as const,
            content: line.replace("MindShift: ", ""),
            timestamp: new Date(),
          };
        }
        return null;
      })
      .filter(Boolean) as ChatMessage[];
  };

  const filteredEntries =
    searchQuery.trim() === ""
      ? entries
      : entries.filter(
          (entry) =>
            entry.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
            entry.ai_response.toLowerCase().includes(searchQuery.toLowerCase()),
        );

  const highlightText = useMemo(
    () => (text: string, query: string) => {
      if (!query.trim()) return <>{text}</>;

      const parts = text.split(new RegExp(`(${query})`, "gi"));
      return (
        <>
          {parts.map((part, i) =>
            part.toLowerCase() === query.toLowerCase() ? (
              <mark key={i} className="search-highlight">
                {part}
              </mark>
            ) : (
              part
            ),
          )}
        </>
      );
    },
    [],
  );

  return (
    <div className="journal-layout">
      <Sidebar
        entryCount={entries.length}
        language={language}
        onLanguageChange={setLanguage}
        onSignOutClick={handleSignOutClick}
      />

      <main className="journal-main">
        {!showHistory ? (
          <>
            {sessionState === "mood" && (
              <div className="session-start animate-in">
                <div className="welcome-block">
                  {welcomeLoading ? (
                    <div className="welcome-loading">
                      <div className="spinner" />
                    </div>
                  ) : (
                    <p className="welcome-message">{welcomeMessage}</p>
                  )}
                </div>

                <div className="journal-header">
                  <h2 className="journal-title">{ui.howFeeling}</h2>
                  <p className="journal-subtitle">
                    Take a second to check in with yourself before we talk.
                  </p>
                </div>

                <MoodSelector selected={mood} onChange={setMood} />

                <button className="submit-btn" onClick={startSession}>
                  {ui.startSession}
                </button>
              </div>
            )}

            {(sessionState === "chatting" || sessionState === "ending") && (
              <div className="chat-container">
                <div className="chat-header">
                  <span
                    className="chat-mood-badge"
                    aria-label={`Feeling ${["really rough", "not great", "okay", "pretty good", "great"][mood - 1]}`}
                  >
                    {MOOD_EMOJIS[mood]} Feeling{" "}
                    {
                      [
                        "really rough",
                        "not great",
                        "okay",
                        "pretty good",
                        "great",
                      ][mood - 1]
                    }
                  </span>
                  {messages.length >= 3 && sessionState === "chatting" && (
                    <button className="end-session-btn" onClick={endSession}>
                      {ui.endSession}
                    </button>
                  )}
                </div>

                {isCrisis ? (
                  <div className="chat-crisis">
                    <CrisisSupport />
                    <button
                      className="btn-ghost mt"
                      onClick={() => setIsCrisis(false)}
                    >
                      ← Continue session
                    </button>
                  </div>
                ) : (
                  <>
                    <div
                      className="chat-messages"
                      role="region"
                      aria-label="Chat messages"
                    >
                      {messages.map((msg, i) => (
                        <div
                          key={i}
                          className={`chat-bubble-wrap ${msg.role === "user" ? "user-wrap" : "ai-wrap"}`}
                        >
                          {msg.role === "assistant" && (
                            <div className="chat-avatar">
                              <img
                                src="/icons/logo.png"
                                alt="MindShift Assistant"
                              />
                            </div>
                          )}
                          <div
                            className={`chat-bubble ${msg.role === "user" ? "bubble-user" : "bubble-ai"}`}
                            role="article"
                            aria-label={`${msg.role === "user" ? "Your message" : "Assistant message"} at ${formatMessageTime(msg.timestamp)}`}
                          >
                            <div className="bubble-content">{msg.content}</div>
                            <div className="bubble-timestamp">
                              {formatMessageTime(msg.timestamp)}
                            </div>
                          </div>
                        </div>
                      ))}

                      {loading && (
                        <div className="chat-bubble-wrap ai-wrap">
                          <div className="chat-avatar">
                            <img src="/icons/logo.png" alt="MindShift" />
                          </div>

                          <div className="chat-bubble bubble-ai typing-indicator">
                            <span />
                            <span />
                            <span />
                          </div>
                        </div>
                      )}

                      {error && <p className="journal-error">{error}</p>}
                      <div ref={bottomRef} />
                    </div>

                    {sessionState === "chatting" && (
                      <div className="chat-input-area">
                        {messages.length === 1 && <GuidedPrompts />}
                        <textarea
                          className="chat-input"
                          placeholder={ui.typeHere}
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              sendMessage();
                            }
                          }}
                          rows={2}
                          disabled={loading}
                          aria-label="Message input"
                          aria-busy={loading}
                        />
                        <button
                          className="chat-send-btn"
                          onClick={sendMessage}
                          disabled={loading || !input.trim()}
                        >
                          →
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {sessionState === "ended" && (
              <div className="session-ended animate-in">
                <div className="ended-icon">💙</div>
                <h2 className="journal-title">{ui.sessionSaved}</h2>
                <p className="journal-subtitle">
                  Taking time to reflect takes courage. See you next time.
                </p>
                <button className="submit-btn" onClick={startNewSession}>
                  {ui.startNew}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="history-view">
            {selectedEntry ? (
              <div className="history-detail">
                <div className="detail-header">
                  <button
                    className="back-btn"
                    onClick={() => setSelectedEntry(null)}
                  >
                    ← Back to all sessions
                  </button>

                  <div
                    style={{
                      marginLeft: "auto",
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                    }}
                  >
                    <span className="detail-mood">
                      {MOOD_EMOJIS[selectedEntry.mood_score]}
                    </span>
                    <div>
                      <div className="detail-date">
                        {formatDate(selectedEntry.created_at)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="detail-summary">
                  <div className="detail-summary-label">Session Summary</div>
                  <p
                    className="entry-ai-text"
                    style={{ fontSize: "15px", lineHeight: "1.7" }}
                  >
                    {selectedEntry.ai_response}
                  </p>
                </div>

                <div className="detail-chat">
                  <div className="chat-messages">
                    {parseConversationToMessages(selectedEntry.content).map(
                      (msg, i) => (
                        <div
                          key={i}
                          className={`chat-bubble-wrap ${msg.role === "user" ? "user-wrap" : "ai-wrap"}`}
                        >
                          {msg.role === "assistant" && (
                            <div className="chat-avatar">
                              <img src="/icons/logo.png" alt="MindShift" />
                            </div>
                          )}
                          <div
                            className={`chat-bubble ${msg.role === "user" ? "bubble-user" : "bubble-ai"}`}
                          >
                            <div className="bubble-content">{msg.content}</div>
                            <div className="bubble-timestamp">
                              {formatMessageTime(msg.timestamp || new Date())}
                            </div>
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <h2 className="journal-title">Past Sessions</h2>
                  <p className="journal-subtitle">
                    {entries.length} reflections so far
                  </p>
                </div>

                <div className="search-wrap">
                  <input
                    className="search-input"
                    type="text"
                    placeholder="Search your sessions..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && (
                    <button
                      className="search-clear"
                      onClick={() => setSearchQuery("")}
                    >
                      ✕
                    </button>
                  )}
                </div>

                {searchQuery && (
                  <p className="search-results-count">
                    {filteredEntries.length} session
                    {filteredEntries.length !== 1 ? "s" : ""} found
                  </p>
                )}

                {filteredEntries.length === 0 ? (
                  <div className="empty-history">
                    {searchQuery
                      ? `No matches for "${searchQuery}"`
                      : "No sessions yet. Start your first one! 🌱"}
                  </div>
                ) : (
                  <div className="history-grid">
                    {filteredEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className="entry-card"
                        onClick={() => setSelectedEntry(entry)}
                      >
                        <div className="entry-meta">
                          <span className="entry-date">
                            {formatDate(entry.created_at)}
                          </span>
                          <span className="entry-mood">
                            {MOOD_EMOJIS[entry.mood_score]}
                          </span>
                        </div>

                        <div className="entry-ai">
                          <p className="entry-ai-label">SESSION SUMMARY</p>
                          <p className="entry-ai-text">
                            {highlightText(
                              entry.ai_response || "No summary available",
                              searchQuery,
                            )}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>

      {showSignOutModal && (
        <ConfirmModal
          title="Sign out?"
          message="You'll need to log back in to access your journal."
          confirmLabel="Yes, sign out"
          cancelLabel="Stay"
          danger={true}
          onConfirm={signOut}
          onCancel={() => setShowSignOutModal(false)}
        />
      )}

      {showDiscardModal && (
        <ConfirmModal
          title="You have an unsaved session"
          message="If you leave now your conversation will be lost. Do you want to save it first?"
          confirmLabel="Save & Sign Out"
          cancelLabel="Stay"
          onConfirm={handleSaveAndSignOut}
          onCancel={() => setShowDiscardModal(false)}
        />
      )}
    </div>
  );
}
