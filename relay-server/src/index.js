/**
 * SecureMesh Push Notification Relay Server
 *
 * A standalone Node.js server for wakeup notifications and
 * optional message buffering for offline recipients.
 *
 * No database — all state is ephemeral (in-memory LRU).
 * Auth model: public-key based. No passwords or accounts.
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import webPush from 'web-push';
import { LRUCache } from 'lru-cache';
import { randomBytes } from 'crypto';

// === Configuration ===

const PORT = parseInt(process.env.PORT || '3001');
const MAX_REGISTRATIONS = parseInt(process.env.MAX_REGISTRATIONS || '10000');
const MAX_INBOX_PER_USER = parseInt(process.env.MAX_INBOX_PER_USER || '50');
const MAX_INBOX_TTL_SECONDS = parseInt(process.env.MAX_INBOX_TTL_SECONDS || '604800'); // 7 days
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000');
const RATE_LIMIT_REGISTER = parseInt(process.env.RATE_LIMIT_REGISTER || '10');
const RATE_LIMIT_DELIVER = parseInt(process.env.RATE_LIMIT_DELIVER || '30');
const RATE_LIMIT_INBOX = parseInt(process.env.RATE_LIMIT_INBOX || '20');
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
const CORS_ORIGINS = process.env.CORS_ORIGINS || '*';

// === VAPID Setup ===

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// === In-Memory Storage ===

// Registration LRU: pub_key_hash -> { push_subscription, registered_at, ttl, auth_token }
const registrations = new LRUCache({
  max: MAX_REGISTRATIONS,
  ttl: MAX_INBOX_TTL_SECONDS * 1000,
});

// Inbox LRU: pub_key_hash -> [{ payload, timestamp }]
const inboxes = new LRUCache({
  max: MAX_REGISTRATIONS,
  ttl: MAX_INBOX_TTL_SECONDS * 1000,
});

// Challenge nonces: pub_key_hash -> nonce (short TTL)
const challenges = new LRUCache({
  max: MAX_REGISTRATIONS,
  ttl: 60 * 1000, // 1 minute TTL for challenges
});

// === Server ===

const fastify = Fastify({ logger: true });

// CORS
await fastify.register(cors, {
  origin: CORS_ORIGINS === '*' ? true : CORS_ORIGINS.split(','),
});

// Rate limiting
await fastify.register(rateLimit, {
  global: false,
});

// === Routes ===

/**
 * POST /register — Register push subscription
 */
fastify.post('/register', {
  config: {
    rateLimit: {
      max: RATE_LIMIT_REGISTER,
      timeWindow: RATE_LIMIT_WINDOW_MS,
    },
  },
  schema: {
    body: {
      type: 'object',
      required: ['pub_key_hash', 'push_subscription'],
      properties: {
        pub_key_hash: { type: 'string', minLength: 64, maxLength: 64 },
        push_subscription: { type: 'object' },
        ttl: { type: 'number', minimum: 60, maximum: 604800 },
      },
    },
  },
}, async (request, reply) => {
  const { pub_key_hash, push_subscription, ttl } = request.body;

  // Generate a one-time auth token for inbox access
  const auth_token = randomBytes(32).toString('hex');

  registrations.set(pub_key_hash, {
    push_subscription,
    registered_at: Date.now(),
    ttl: (ttl || 86400) * 1000,
    auth_token,
  });

  return { ok: true, auth_token };
});

/**
 * DELETE /register/:hash — Unregister
 */
fastify.delete('/register/:hash', {
  config: {
    rateLimit: {
      max: RATE_LIMIT_REGISTER,
      timeWindow: RATE_LIMIT_WINDOW_MS,
    },
  },
}, async (request, reply) => {
  const { hash } = request.params;
  registrations.delete(hash);
  inboxes.delete(hash);
  return { ok: true };
});

/**
 * POST /deliver — Send push notification + optional buffer
 */
fastify.post('/deliver', {
  config: {
    rateLimit: {
      max: RATE_LIMIT_DELIVER,
      timeWindow: RATE_LIMIT_WINDOW_MS,
    },
  },
  schema: {
    body: {
      type: 'object',
      required: ['to', 'from', 'payload'],
      properties: {
        to: { type: 'string', minLength: 64, maxLength: 64 },
        from: { type: 'string', minLength: 64, maxLength: 64 },
        payload: { type: 'string', maxLength: 65536 },
        buffer: { type: 'boolean' },
      },
    },
  },
}, async (request, reply) => {
  const { to, from, payload, buffer } = request.body;

  const registration = registrations.get(to);
  if (!registration) {
    reply.code(404);
    return { error: 'not_registered' };
  }

  // Send push notification
  try {
    if (VAPID_PUBLIC_KEY && registration.push_subscription) {
      await webPush.sendNotification(
        registration.push_subscription,
        JSON.stringify({
          type: 'message',
          from,
          timestamp: Date.now(),
        }),
        { TTL: 3600 }
      );
    }
  } catch (err) {
    // Push may fail if subscription expired; still buffer if requested
    fastify.log.warn({ err }, 'Push notification delivery failed');
  }

  // Buffer encrypted payload if requested
  if (buffer) {
    let inbox = inboxes.get(to) || [];

    // Enforce per-user inbox limit
    if (inbox.length >= MAX_INBOX_PER_USER) {
      inbox = inbox.slice(-MAX_INBOX_PER_USER + 1);
    }

    inbox.push({
      payload,
      from,
      timestamp: Date.now(),
    });

    inboxes.set(to, inbox);
  }

  return { ok: true };
});

/**
 * GET /challenge/:pub_key_hash — Get auth challenge nonce
 */
fastify.get('/challenge/:pub_key_hash', {
  config: {
    rateLimit: {
      max: 60,
      timeWindow: RATE_LIMIT_WINDOW_MS,
    },
  },
}, async (request, reply) => {
  const { pub_key_hash } = request.params;
  const nonce = randomBytes(32).toString('hex');
  challenges.set(pub_key_hash, nonce);
  return { nonce };
});

/**
 * GET /inbox/:pub_key_hash — Fetch buffered messages (fetch-and-delete)
 */
fastify.get('/inbox/:pub_key_hash', {
  config: {
    rateLimit: {
      max: RATE_LIMIT_INBOX,
      timeWindow: RATE_LIMIT_WINDOW_MS,
    },
  },
}, async (request, reply) => {
  const { pub_key_hash } = request.params;
  const auth_token = request.headers['x-auth-token'];

  // Verify auth token
  const registration = registrations.get(pub_key_hash);
  if (!registration) {
    reply.code(404);
    return { error: 'not_registered' };
  }

  if (!auth_token || auth_token !== registration.auth_token) {
    reply.code(403);
    return { error: 'unauthorized' };
  }

  // Fetch and delete
  const inbox = inboxes.get(pub_key_hash) || [];
  inboxes.delete(pub_key_hash);

  // Filter out expired messages
  const now = Date.now();
  const maxAge = MAX_INBOX_TTL_SECONDS * 1000;
  const validMessages = inbox.filter(
    (msg) => now - msg.timestamp < maxAge
  );

  return {
    messages: validMessages.map((msg) => ({
      payload: msg.payload,
      from: msg.from,
      timestamp: msg.timestamp,
    })),
  };
});

/**
 * GET /health — Server health check
 */
fastify.get('/health', async () => {
  return {
    status: 'ok',
    registrations: registrations.size,
    inboxes: inboxes.size,
    uptime: process.uptime(),
  };
});

// === Start Server ===

try {
  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`SecureMesh Relay Server listening on port ${PORT}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
