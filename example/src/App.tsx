import "./App.css";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

type Msg = { mine?: boolean; text: string };
type Chat = { chatId?: number; name: string; preview: string; messages: Msg[] };

// Sample conversations, shown muted until real messages arrive.
const fallbackChats: Chat[] = [
  {
    name: "@alice_johnson",
    preview: "Thanks, that worked!",
    messages: [
      { text: "Hi, I can't log in to my account." },
      { mine: true, text: "Hi Alice! Try resetting your password." },
      { text: "Thanks, that worked!" },
    ],
  },
  {
    name: "@bob_smith",
    preview: "When will my order ship?",
    messages: [
      { text: "When will my order ship?" },
      { mine: true, text: "It ships tomorrow — you'll get a tracking link." },
    ],
  },
  {
    name: "@carol_lee",
    preview: "Found a bug in the dashboard.",
    messages: [
      { text: "Found a bug in the dashboard." },
      { mine: true, text: "Thanks! Can you share a screenshot?" },
    ],
  },
];

function Avatar({ name }: { name: string }) {
  const initials = name.replace(/^@/, "").slice(0, 2).toUpperCase();
  return <span className="avatar">{initials}</span>;
}

export default function App() {
  const topics = useQuery(api.messages.listTopics);
  const sendMessage = useMutation(api.messages.send);
  const [active, setActive] = useState(0);
  const [text, setText] = useState("");

  const loading = topics === undefined;
  const empty = topics?.length === 0;
  const dimmed = loading || empty;

  const chats = topics && topics.length > 0 ? topics : fallbackChats;
  const chat = chats[active] ?? chats[0];

  const send = () => {
    const value = text.trim();
    if (!value || chat.chatId === undefined) return;
    void sendMessage({ chatId: chat.chatId, text: value });
    setText("");
  };

  return (
    <div className="app">
      <header className="app-header">
        <span className="brand">
          <img src="/telegram.svg" alt="Telegram" className="logo" />
          <span>+</span>
          <img src="/convex.svg" alt="Convex" className="logo" />
        </span>
        <span className="hint">
          Message{" "}
          <a
            href="https://t.me/ConvexTelegramBot"
            target="_blank"
            rel="noreferrer"
          >
            @ConvexTelegramBot
          </a>{" "}
          to see it here
        </span>
      </header>

      <div className="body">
        <div className={`panes${dimmed ? " dimmed" : ""}`}>
          <aside className="sidebar">
            {chats.map((c, i) => {
              const selected = !dimmed && i === active;
              return (
                <div
                  key={c.chatId ?? c.name}
                  onClick={() => setActive(i)}
                  className={`chat-item${selected ? " selected" : ""}`}
                >
                  <Avatar name={c.name} />
                  <div className="chat-meta">
                    <div className="name truncate">{c.name}</div>
                    <div className="preview truncate">{c.preview}</div>
                  </div>
                </div>
              );
            })}
          </aside>

          <section className="conversation">
            <div className="conversation-header">
              <Avatar name={chat.name} />
              <span className="name">{chat.name}</span>
            </div>

            <div className="messages">
              {chat.messages.map((m, i) => (
                <div key={i} className={`bubble ${m.mine ? "mine" : "theirs"}`}>
                  {m.text}
                </div>
              ))}
            </div>

            <form
              className="composer"
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Write a message…"
              />
              <button type="submit">Send</button>
            </form>
          </section>
        </div>

        {loading && (
          <div className="overlay">
            <span className="muted">Loading…</span>
          </div>
        )}

        {empty && (
          <div className="overlay">
            <div className="overlay-card">
              <img src="/telegram.svg" alt="" className="empty-logo" />
              <p className="muted">
                No messages yet. Message{" "}
                <a
                  href="https://t.me/ConvexTelegramBot"
                  target="_blank"
                  rel="noreferrer"
                >
                  @ConvexTelegramBot
                </a>{" "}
                to start a conversation.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
