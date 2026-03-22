/**
 * Zustand store for SecureMesh application state.
 */

import { create } from 'zustand';
import type {
  KeyBundle,
  Contact,
  ChatMessage,
  UserProfile,
  PeerIdSet,
  AppSettings,
  SecurityAlert,
  DeviceInfo,
  ConnectionStatus,
} from '../types';

export interface AppState {
  // Identity
  keyBundle: KeyBundle | null;
  profile: UserProfile;
  peerIds: PeerIdSet | null;
  initialized: boolean;
  initializing: boolean;

  // Contacts
  contacts: Contact[];
  selectedContactId: string | null;

  // Messages
  messages: Record<string, ChatMessage[]>; // contactId -> messages
  unreadCounts: Record<string, number>;

  // Connection
  connectionStatuses: Record<string, ConnectionStatus>; // contactId -> status
  isOnline: boolean;

  // Security
  alerts: SecurityAlert[];

  // Settings
  settings: AppSettings;

  // Devices
  devices: DeviceInfo[];

  // UI state
  currentScreen: 'conversations' | 'chat' | 'add-contact' | 'contact-detail' | 'my-identity' | 'devices' | 'settings' | 'alerts' | 'first-run';

  // Actions
  setKeyBundle: (bundle: KeyBundle) => void;
  setProfile: (profile: UserProfile) => void;
  setPeerIds: (ids: PeerIdSet) => void;
  setInitialized: (val: boolean) => void;
  setInitializing: (val: boolean) => void;

  addContact: (contact: Contact) => void;
  updateContact: (id: string, updates: Partial<Contact>) => void;
  removeContact: (id: string) => void;
  setSelectedContact: (id: string | null) => void;

  addMessage: (contactId: string, message: ChatMessage) => void;
  updateMessage: (contactId: string, messageId: string, updates: Partial<ChatMessage>) => void;
  setMessages: (contactId: string, messages: ChatMessage[]) => void;
  markRead: (contactId: string) => void;

  setConnectionStatus: (contactId: string, status: ConnectionStatus) => void;
  setOnline: (online: boolean) => void;

  addAlert: (alert: SecurityAlert) => void;
  acknowledgeAlert: (id: string) => void;

  setSettings: (settings: Partial<AppSettings>) => void;

  addDevice: (device: DeviceInfo) => void;
  removeDevice: (id: string) => void;

  setScreen: (screen: AppState['currentScreen']) => void;
}

export const useStore = create<AppState>((set) => ({
  // Initial state
  keyBundle: null,
  profile: { displayName: '' },
  peerIds: null,
  initialized: false,
  initializing: false,
  contacts: [],
  selectedContactId: null,
  messages: {},
  unreadCounts: {},
  connectionStatuses: {},
  isOnline: false,
  alerts: [],
  settings: {
    discoveryRotationDays: 7,
    messagingRotationHours: 24,
    pqInjectionInterval: 50,
    maxSkippedKeys: 1000,
    skippedKeyMaxAgeDays: 7,
  },
  devices: [],
  currentScreen: 'first-run',

  // Actions
  setKeyBundle: (bundle) => set({ keyBundle: bundle }),
  setProfile: (profile) => set({ profile }),
  setPeerIds: (ids) => set({ peerIds: ids }),
  setInitialized: (val) => set({ initialized: val }),
  setInitializing: (val) => set({ initializing: val }),

  addContact: (contact) =>
    set((state) => ({ contacts: [...state.contacts, contact] })),
  updateContact: (id, updates) =>
    set((state) => ({
      contacts: state.contacts.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    })),
  removeContact: (id) =>
    set((state) => ({
      contacts: state.contacts.filter((c) => c.id !== id),
    })),
  setSelectedContact: (id) => set({ selectedContactId: id }),

  addMessage: (contactId, message) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [contactId]: [...(state.messages[contactId] || []), message],
      },
      unreadCounts:
        message.direction === 'received'
          ? {
              ...state.unreadCounts,
              [contactId]: (state.unreadCounts[contactId] || 0) + 1,
            }
          : state.unreadCounts,
    })),
  updateMessage: (contactId, messageId, updates) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [contactId]: (state.messages[contactId] || []).map((m) =>
          m.id === messageId ? { ...m, ...updates } : m
        ),
      },
    })),
  setMessages: (contactId, messages) =>
    set((state) => ({
      messages: { ...state.messages, [contactId]: messages },
    })),
  markRead: (contactId) =>
    set((state) => ({
      unreadCounts: { ...state.unreadCounts, [contactId]: 0 },
    })),

  setConnectionStatus: (contactId, status) =>
    set((state) => ({
      connectionStatuses: { ...state.connectionStatuses, [contactId]: status },
    })),
  setOnline: (online) => set({ isOnline: online }),

  addAlert: (alert) =>
    set((state) => ({ alerts: [alert, ...state.alerts] })),
  acknowledgeAlert: (id) =>
    set((state) => ({
      alerts: state.alerts.map((a) =>
        a.id === id ? { ...a, acknowledged: true } : a
      ),
    })),

  setSettings: (updates) =>
    set((state) => ({ settings: { ...state.settings, ...updates } })),

  addDevice: (device) =>
    set((state) => ({ devices: [...state.devices, device] })),
  removeDevice: (id) =>
    set((state) => ({
      devices: state.devices.filter((d) => d.id !== id),
    })),

  setScreen: (screen) => set({ currentScreen: screen }),
}));
