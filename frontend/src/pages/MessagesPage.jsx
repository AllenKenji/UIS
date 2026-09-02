import { useEffect, useState } from "react";
import { MessagesAPI } from "../services/api";
import { useUser } from "../context/UserContext";
import { formatPhilippineDateTime } from "../utils/dateTime";
import "./messages.css";

const initialsOf = (name = "") =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "?";

const roleClass = (role) => `role-${(role || "resident").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

const Avatar = ({ name, role }) => (
  <span className={`msg-avatar ${roleClass(role)}`} aria-hidden="true">
    {initialsOf(name)}
  </span>
);

export default function MessagesPage() {
  const { userInfo } = useUser();
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [recipients, setRecipients] = useState([]);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);

  const refreshConversations = async () => {
    const data = await MessagesAPI.conversations();
    setConversations(data);
    return data;
  };

  useEffect(() => {
    refreshConversations().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!search.trim()) return setRecipients([]);
      try { setRecipients(await MessagesAPI.recipients(search)); } catch { setRecipients([]); }
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const openConversation = async (conversation) => {
    setSelected(conversation);
    setMessages(await MessagesAPI.items(conversation.id));
    refreshConversations();
  };

  const startConversation = async (recipient) => {
    const created = await MessagesAPI.createConversation(recipient.uid);
    setSearch("");
    setRecipients([]);
    await openConversation({ id: created.id, recipient, unreadCount: 0 });
  };

  const send = async (event) => {
    event.preventDefault();
    if (!draft.trim() || !selected) return;
    const sent = await MessagesAPI.send(selected.id, draft);
    setMessages((current) => [...current, sent]);
    setDraft("");
    refreshConversations();
  };

  const handleComposerKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send(event);
    }
  };

  return (
    <section className="messages-page">
      <header className="messages-page-header">
        <h2>💬 Messages</h2>
        <p>Private conversations with BIS accounts.</p>
      </header>

      <div className={`messages-layout ${selected ? "chat-open" : ""}`}>
        <aside className="messages-sidebar">
          <div className="messages-search">
            <span className="messages-search-icon" aria-hidden="true">🔎</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Find someone to message"
              aria-label="Find a recipient"
            />
          </div>

          {recipients.length > 0 && (
            <div className="recipient-results">
              <h4>Start a new conversation</h4>
              {recipients.map((recipient) => (
                <button className="recipient-result" key={recipient.uid} onClick={() => startConversation(recipient)}>
                  <Avatar name={recipient.name} role={recipient.role} />
                  <span className="recipient-info">
                    <span className="recipient-name">{recipient.name}</span>
                    <span className={`role-badge ${roleClass(recipient.role)}`}>{recipient.role}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          <h3 className="messages-section-title">Conversations</h3>
          <div className="conversation-list">
            {loading ? (
              <p className="messages-hint">Loading messages...</p>
            ) : conversations.length === 0 ? (
              <p className="messages-hint">No conversations yet — search above to start one.</p>
            ) : (
              conversations.map((conversation) => (
                <button
                  className={`conversation ${selected?.id === conversation.id ? "active" : ""}`}
                  key={conversation.id}
                  onClick={() => openConversation(conversation)}
                >
                  <Avatar name={conversation.recipient.name} role={conversation.recipient.role} />
                  <span className="conversation-body">
                    <span className="conversation-top-row">
                      <span className="conversation-name">{conversation.recipient.name}</span>
                      {conversation.lastMessageAt && (
                        <span className="conversation-time">{formatPhilippineDateTime(conversation.lastMessageAt)}</span>
                      )}
                    </span>
                    <span className="conversation-bottom-row">
                      <span className="conversation-preview">{conversation.lastMessage || "Start a conversation"}</span>
                      {conversation.unreadCount > 0 && <span className="unread-badge">{conversation.unreadCount}</span>}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        <main className="message-thread">
          {selected ? (
            <>
              <header className="message-thread-header">
                <button className="back-button" onClick={() => setSelected(null)} aria-label="Back to conversations">←</button>
                <Avatar name={selected.recipient.name} role={selected.recipient.role} />
                <div className="message-thread-heading">
                  <h3>{selected.recipient.name}</h3>
                  <span className={`role-badge ${roleClass(selected.recipient.role)}`}>{selected.recipient.role}</span>
                </div>
              </header>

              <div className="message-list">
                {messages.length === 0 ? (
                  <p className="messages-hint centered">No messages yet — say hello 👋</p>
                ) : (
                  messages.map((message) => (
                    <div
                      className={`message-bubble ${message.senderId === userInfo?.uid ? "mine" : "theirs"}`}
                      key={message.id}
                    >
                      {message.body}
                      <small>{formatPhilippineDateTime(message.sentAt)}</small>
                    </div>
                  ))
                )}
              </div>

              <form className="message-composer" onSubmit={send}>
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  placeholder="Write a message"
                  maxLength={4000}
                  rows={1}
                />
                <button type="submit" disabled={!draft.trim()}>Send</button>
              </form>
            </>
          ) : (
            <div className="message-empty">
              <span className="message-empty-icon" aria-hidden="true">💬</span>
              <p>Choose a conversation or search for someone to message.</p>
            </div>
          )}
        </main>
      </div>
    </section>
  );
}
