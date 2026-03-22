/**
 * Chat view screen — iMessage-style conversation UI.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import type { Contact, ChatMessage, ConnectionStatus } from '../types';
import { Avatar } from '../components/Avatar';
import { StatusIndicator } from '../components/StatusIndicator';

interface ChatViewProps {
  contact: Contact;
  messages: ChatMessage[];
  connectionStatus: ConnectionStatus;
  onSendMessage: (content: string) => void;
  onSendTyping: () => void;
  onSendReadReceipt: (messageId: string) => void;
  onBack: () => void;
  onContactDetail: () => void;
}

const STATUS_ICONS: Record<string, string> = {
  sending: '\u2022',
  sent: '\u2713',
  delivered: '\u2713\u2713',
  read: '\u2713\u2713',
};

export function ChatView({
  contact,
  messages,
  connectionStatus,
  onSendMessage,
  onSendTyping,
  onSendReadReceipt,
  onBack,
  onContactDetail,
}: ChatViewProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

    // Send read receipt for last received message
    const lastReceived = [...messages]
      .reverse()
      .find((m) => m.direction === 'received');
    if (lastReceived) {
      onSendReadReceipt(lastReceived.id);
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    onSendMessage(trimmed);
    setInput('');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    onSendTyping();
    typingTimeout.current = setTimeout(() => {}, 3000);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  function formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function shouldShowTimestamp(idx: number): boolean {
    if (idx === 0) return true;
    const prev = messages[idx - 1];
    const curr = messages[idx];
    return curr.timestamp - prev.timestamp > 5 * 60 * 1000; // 5 min gap
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex items-center gap-3 p-3 border-b border-gray-800 bg-gray-950">
        <button
          onClick={onBack}
          className="p-1 text-gray-400 hover:text-white"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button onClick={onContactDetail} className="flex items-center gap-3 flex-1 min-w-0">
          <Avatar
            displayName={contact.profile.displayName}
            photo={contact.profile.photo}
            pkHash={contact.id}
          />
          <div className="text-left min-w-0">
            <h2 className="font-medium text-white truncate">
              {contact.profile.displayName}
            </h2>
            <StatusIndicator status={connectionStatus} />
          </div>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {messages.map((msg, idx) => (
          <div key={msg.id}>
            {shouldShowTimestamp(idx) && (
              <div className="text-center py-2">
                <span className="text-xs text-gray-500 bg-gray-900 px-2 py-1 rounded">
                  {new Date(msg.timestamp).toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric',
                  })}{' '}
                  {formatTime(msg.timestamp)}
                </span>
              </div>
            )}
            <div
              className={`flex ${msg.direction === 'sent' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[75%] rounded-2xl px-3.5 py-2 ${
                  msg.direction === 'sent'
                    ? 'bg-mesh-600 text-white rounded-br-md'
                    : 'bg-gray-800 text-white rounded-bl-md'
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                <div
                  className={`flex items-center gap-1 mt-0.5 ${
                    msg.direction === 'sent' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <span className="text-[10px] opacity-60">
                    {formatTime(msg.timestamp)}
                  </span>
                  {msg.direction === 'sent' && (
                    <span
                      className={`text-[10px] ${
                        msg.status === 'read' ? 'text-blue-300' : 'opacity-60'
                      }`}
                    >
                      {STATUS_ICONS[msg.status] || ''}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Pending request actions */}
      {contact.status === 'pending_incoming' && (
        <div className="p-4 border-t border-gray-800 bg-gray-900 text-center">
          <p className="text-sm text-gray-400 mb-3">
            {contact.profile.displayName} wants to connect with you
          </p>
          <div className="flex gap-3 justify-center">
            <button className="bg-mesh-600 hover:bg-mesh-700 text-white px-6 py-2 rounded-lg text-sm font-medium">
              Accept
            </button>
            <button className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded-lg text-sm font-medium">
              Decline
            </button>
          </div>
        </div>
      )}

      {/* Input area */}
      {contact.status === 'accepted' && (
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 p-3 border-t border-gray-800 bg-gray-950"
        >
          <input
            type="text"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Message..."
            className="flex-1 bg-gray-800 border border-gray-700 rounded-full px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-mesh-500 focus:border-transparent"
            autoFocus
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="p-2 bg-mesh-600 hover:bg-mesh-700 disabled:bg-gray-700 text-white rounded-full transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </form>
      )}
    </div>
  );
}
