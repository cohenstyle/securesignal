/**
 * Conversations list screen — shows all contacts with last message preview.
 */

import type { Contact, ChatMessage, ConnectionStatus } from '../types';
import { Avatar } from '../components/Avatar';
import { StatusIndicator } from '../components/StatusIndicator';

interface ConversationsListProps {
  contacts: Contact[];
  messages: Record<string, ChatMessage[]>;
  unreadCounts: Record<string, number>;
  connectionStatuses: Record<string, ConnectionStatus>;
  onSelectContact: (contactId: string) => void;
  onAddContact: () => void;
  onOpenIdentity: () => void;
  onOpenSettings: () => void;
  onOpenAlerts: () => void;
  alertCount: number;
}

export function ConversationsList({
  contacts,
  messages,
  unreadCounts,
  connectionStatuses,
  onSelectContact,
  onAddContact,
  onOpenIdentity,
  onOpenSettings,
  onOpenAlerts,
  alertCount,
}: ConversationsListProps) {
  const acceptedContacts = contacts.filter((c) => c.status === 'accepted');
  const pendingIncoming = contacts.filter((c) => c.status === 'pending_incoming');
  const pendingOutgoing = contacts.filter((c) => c.status === 'pending_outgoing');

  function getLastMessage(contactId: string): ChatMessage | undefined {
    const msgs = messages[contactId];
    return msgs?.[msgs.length - 1];
  }

  function formatTime(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800">
        <h1 className="text-xl font-bold text-white">SecureMesh</h1>
        <div className="flex items-center gap-2">
          {alertCount > 0 && (
            <button
              onClick={onOpenAlerts}
              className="relative p-2 text-red-400 hover:bg-gray-800 rounded-lg"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] flex items-center justify-center">
                {alertCount}
              </span>
            </button>
          )}
          <button
            onClick={onOpenIdentity}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg"
            title="My Identity"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </button>
          <button
            onClick={onOpenSettings}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg"
            title="Settings"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <button
            onClick={onAddContact}
            className="p-2 bg-mesh-600 hover:bg-mesh-700 text-white rounded-lg"
            title="Add Contact"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>

      {/* Pending incoming requests */}
      {pendingIncoming.length > 0 && (
        <div className="p-3 bg-mesh-950 border-b border-gray-800">
          <p className="text-sm text-mesh-400 font-medium">
            {pendingIncoming.length} pending request{pendingIncoming.length > 1 ? 's' : ''}
          </p>
        </div>
      )}

      {/* Contact list */}
      <div className="flex-1 overflow-y-auto">
        {/* Incoming requests */}
        {pendingIncoming.map((contact) => (
          <button
            key={contact.id}
            onClick={() => onSelectContact(contact.id)}
            className="w-full flex items-center gap-3 p-3 hover:bg-gray-900 border-b border-gray-800/50"
          >
            <Avatar
              displayName={contact.profile.displayName}
              photo={contact.profile.photo}
              pkHash={contact.id}
            />
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center gap-2">
                <span className="font-medium text-white truncate">
                  {contact.profile.displayName || 'Unknown'}
                </span>
                <span className="text-xs bg-mesh-600 text-white px-1.5 py-0.5 rounded">
                  Request
                </span>
              </div>
              <p className="text-sm text-gray-400 truncate">
                Wants to connect with you
              </p>
            </div>
          </button>
        ))}

        {/* Accepted conversations */}
        {acceptedContacts
          .sort((a, b) => {
            const aLast = getLastMessage(a.id)?.timestamp || a.addedAt;
            const bLast = getLastMessage(b.id)?.timestamp || b.addedAt;
            return bLast - aLast;
          })
          .map((contact) => {
            const lastMsg = getLastMessage(contact.id);
            const unread = unreadCounts[contact.id] || 0;
            const status = connectionStatuses[contact.id] || 'offline';

            return (
              <button
                key={contact.id}
                onClick={() => onSelectContact(contact.id)}
                className="w-full flex items-center gap-3 p-3 hover:bg-gray-900 border-b border-gray-800/50"
              >
                <div className="relative">
                  <Avatar
                    displayName={contact.profile.displayName}
                    photo={contact.profile.photo}
                    pkHash={contact.id}
                  />
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-gray-950 ${
                      status === 'online'
                        ? 'bg-green-500'
                        : status === 'registered'
                        ? 'bg-yellow-500'
                        : status === 'hijack_detected'
                        ? 'bg-red-500'
                        : 'bg-gray-600'
                    }`}
                  />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-white truncate">
                      {contact.profile.displayName}
                    </span>
                    {lastMsg && (
                      <span className="text-xs text-gray-500">
                        {formatTime(lastMsg.timestamp)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-400 truncate">
                      {lastMsg
                        ? `${lastMsg.direction === 'sent' ? 'You: ' : ''}${lastMsg.content}`
                        : 'No messages yet'}
                    </p>
                    {unread > 0 && (
                      <span className="ml-2 min-w-[20px] h-5 bg-mesh-600 text-white text-xs rounded-full flex items-center justify-center px-1">
                        {unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}

        {/* Pending outgoing */}
        {pendingOutgoing.map((contact) => (
          <button
            key={contact.id}
            onClick={() => onSelectContact(contact.id)}
            className="w-full flex items-center gap-3 p-3 hover:bg-gray-900 border-b border-gray-800/50 opacity-60"
          >
            <Avatar
              displayName={contact.profile.displayName || 'Pending'}
              pkHash={contact.id}
            />
            <div className="flex-1 min-w-0 text-left">
              <span className="font-medium text-white truncate">
                {contact.profile.displayName || 'Pending Contact'}
              </span>
              <p className="text-sm text-gray-500">Request sent</p>
            </div>
          </button>
        ))}

        {/* Empty state */}
        {contacts.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-white mb-1">No conversations yet</h3>
            <p className="text-gray-400 text-sm mb-4">
              Share your contact card or scan someone's QR code to start chatting
            </p>
            <button
              onClick={onAddContact}
              className="bg-mesh-600 hover:bg-mesh-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              Add Contact
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
