// rehacoin-api Worker

const ALLOWED_ORIGINS = [
  'https://rehacoin.pages.dev',
  'https://mizuking796.github.io',
  'http://localhost:8080',
  'http://localhost:3000',
];

const JWT_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days
const MIN_PASSWORD_LENGTH = 8;
const LOGIN_ATTEMPT_WINDOW = 15 * 60 * 1000; // 15 min
const MAX_LOGIN_ATTEMPTS = 10;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const origin = request.headers.get('Origin') || '';

    // CORS
    if (method === 'OPTIONS') return corsResponse(origin);

    const headers = { 'Content-Type': 'application/json', ...corsHeaders(origin) };

    try {
      // --- Public routes ---
      if (path === '/auth/register' && method === 'POST') {
        return json(await register(env, await request.json()), headers);
      }
      if (path === '/auth/login' && method === 'POST') {
        return json(await login(env, request, await request.json()), headers);
      }
      if (path === '/auth/reset-password' && method === 'POST') {
        return json(await resetPassword(env, await request.json()), headers);
      }

      // --- Admin routes ---
      if (path.startsWith('/admin/')) {
        const adminKey = request.headers.get('X-Admin-Key');
        if (!adminKey || adminKey !== env.ADMIN_KEY) return json({ error: 'Forbidden' }, headers, 403);

        if (path === '/admin/stats' && method === 'GET') {
          return json(await adminStats(env), headers);
        }
        if (path === '/admin/users' && method === 'GET') {
          return json(await adminUsers(env, url), headers);
        }
        if (path.match(/^\/admin\/users\/[^/]+$/) && method === 'GET') {
          const id = path.split('/')[3];
          return json(await adminUserDetail(env, id), headers);
        }
        if (path.match(/^\/admin\/users\/[^/]+$/) && method === 'DELETE') {
          const id = path.split('/')[3];
          return json(await adminDeleteUser(env, id), headers);
        }
        if (path.match(/^\/admin\/users\/[^/]+\/reset-password$/) && method === 'POST') {
          const id = path.split('/')[3];
          return json(await adminResetPassword(env, id, await request.json()), headers);
        }
        return json({ error: 'Not Found' }, headers, 404);
      }

      // --- Authenticated routes ---
      const user = await authenticate(env, request);
      if (!user) return json({ error: 'Unauthorized' }, headers, 401);

      // Profile
      if (path === '/me' && method === 'GET') {
        return json(await getProfile(env, user), headers);
      }
      if (path === '/me' && method === 'PUT') {
        return json(await updateProfile(env, user, await request.json()), headers);
      }
      if (path === '/me' && method === 'DELETE') {
        return json(await deleteAccount(env, user), headers);
      }

      // Records
      if (path === '/records' && method === 'GET') {
        return json(await getRecords(env, user), headers);
      }
      if (path === '/records' && method === 'POST') {
        return json(await addRecord(env, user, await request.json()), headers);
      }
      if (path.match(/^\/records\/[^/]+$/) && method === 'DELETE') {
        const id = path.split('/')[2];
        return json(await deleteRecord(env, user, id), headers);
      }

      // Rewards
      if (path === '/rewards' && method === 'GET') {
        return json(await getRewards(env, user), headers);
      }
      if (path === '/rewards' && method === 'POST') {
        return json(await addReward(env, user, await request.json()), headers);
      }
      if (path.match(/^\/rewards\/[^/]+$/) && method === 'DELETE') {
        const id = path.split('/')[2];
        return json(await deleteReward(env, user, id), headers);
      }
      if (path.match(/^\/rewards\/[^/]+\/exchange$/) && method === 'POST') {
        const id = path.split('/')[2];
        return json(await exchangeReward(env, user, id), headers);
      }

      // User search
      if (path === '/users/search' && method === 'GET') {
        return json(await searchUsers(env, user, url), headers);
      }

      // Friends
      if (path === '/friends' && method === 'GET') {
        return json(await getFriends(env, user), headers);
      }
      if (path === '/friends/feed' && method === 'GET') {
        return json(await getFeed(env, user), headers);
      }
      if (path === '/friends/request' && method === 'POST') {
        return json(await sendFriendRequest(env, user, await request.json()), headers);
      }
      if (path === '/friends/requests' && method === 'GET') {
        return json(await getFriendRequests(env, user), headers);
      }
      if (path.match(/^\/friends\/requests\/[^/]+\/accept$/) && method === 'POST') {
        const id = path.split('/')[3];
        return json(await acceptFriendRequest(env, user, id), headers);
      }
      if (path.match(/^\/friends\/requests\/[^/]+\/reject$/) && method === 'POST') {
        const id = path.split('/')[3];
        return json(await rejectFriendRequest(env, user, id), headers);
      }
      if (path.match(/^\/friends\/[^/]+$/) && method === 'DELETE') {
        const id = path.split('/')[2];
        return json(await removeFriend(env, user, id), headers);
      }

      // Witness
      if (path.match(/^\/records\/[^/]+\/witness$/) && method === 'POST') {
        const id = path.split('/')[2];
        return json(await witnessRecord(env, user, id), headers);
      }

      // Cheer (Reactions)
      if (path.match(/^\/records\/[^/]+\/cheer$/) && method === 'POST') {
        const id = path.split('/')[2];
        return json(await cheerRecord(env, user, id, await request.json()), headers);
      }

      return json({ error: 'Not Found' }, headers, 404);
    } catch (e) {
      console.error(e);
      return json({ error: 'Internal Server Error' }, headers, 500);
    }
  }
};

// --- CORS ---
function getAllowedOrigin(origin) {
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': getAllowedOrigin(origin),
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key',
    'Vary': 'Origin',
  };
}

function corsResponse(origin) {
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

// --- Helpers ---
function json(data, headers, status = 200) {
  if (data.error && status === 200) status = 400;
  return new Response(JSON.stringify(data), { status, headers });
}

function genId(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function genFriendCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function genRecoveryCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// --- Crypto ---
async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
    key, 256
  );
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

async function createToken(env, userId) {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ sub: userId, exp: Date.now() + JWT_EXPIRY }));
  const enc = new TextEncoder();
  const secret = env.JWT_SECRET || 'rehacoin-default-secret';
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${header}.${payload}`));
  const signature = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `${header}.${payload}.${signature}`;
}

async function verifyToken(env, token) {
  try {
    const [header, payload, signature] = token.split('.');
    const enc = new TextEncoder();
    const secret = env.JWT_SECRET || 'rehacoin-default-secret';
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const sigBytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(`${header}.${payload}`));
    if (!valid) return null;
    const data = JSON.parse(atob(payload));
    if (data.exp < Date.now()) return null;
    return data.sub;
  } catch {
    return null;
  }
}

async function authenticate(env, request) {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const userId = await verifyToken(env, auth.slice(7));
  if (!userId) return null;
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
  return user || null;
}

// --- Rate limiting (login brute force protection) ---
async function checkLoginRateLimit(env, identifier) {
  const key = `login_attempts:${identifier}`;
  const now = Date.now();
  const windowStart = now - LOGIN_ATTEMPT_WINDOW;

  // Get recent attempts
  const rows = await env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM login_attempts WHERE identifier = ? AND attempted_at > ?'
  ).bind(identifier, windowStart).first();

  return (rows?.cnt || 0) < MAX_LOGIN_ATTEMPTS;
}

async function recordLoginAttempt(env, identifier) {
  await env.DB.prepare(
    'INSERT INTO login_attempts (id, identifier, attempted_at) VALUES (?, ?, ?)'
  ).bind(genId('la_'), identifier, Date.now()).run();
}

async function clearLoginAttempts(env, identifier) {
  await env.DB.prepare('DELETE FROM login_attempts WHERE identifier = ?').bind(identifier).run();
}

// --- Auth ---
async function register(env, body) {
  const { nickname, password } = body;
  if (!nickname || !password) return { error: 'nickname and password are required' };
  if (nickname.length < 2 || nickname.length > 20) return { error: 'nickname must be 2-20 characters' };
  if (password.length < MIN_PASSWORD_LENGTH) return { error: `password must be at least ${MIN_PASSWORD_LENGTH} characters` };

  const existing = await env.DB.prepare('SELECT id FROM users WHERE nickname = ?').bind(nickname).first();
  if (existing) return { error: 'This nickname is already taken' };

  const id = genId('u_');
  const salt = crypto.randomUUID();
  const passwordHash = await hashPassword(password, salt);
  const recoveryCode = genRecoveryCode();
  const recoveryHash = await hashPassword(recoveryCode, salt);

  let friendCode;
  for (let i = 0; i < 10; i++) {
    friendCode = genFriendCode();
    const dup = await env.DB.prepare('SELECT id FROM users WHERE friend_code = ?').bind(friendCode).first();
    if (!dup) break;
  }

  await env.DB.prepare(
    'INSERT INTO users (id, nickname, password_hash, salt, friend_code, feed_visibility, recovery_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, nickname, passwordHash, salt, friendCode, 'activity_name', recoveryHash, Date.now()).run();

  const token = await createToken(env, id);
  return {
    token,
    user: { id, nickname, friendCode, feedVisibility: 'activity_name' },
    recoveryCode
  };
}

async function login(env, request, body) {
  const { nickname, password } = body;
  if (!nickname || !password) return { error: 'nickname and password are required' };

  // Rate limit check
  const allowed = await checkLoginRateLimit(env, nickname);
  if (!allowed) return { error: 'Too many login attempts. Please wait 15 minutes.' };

  const user = await env.DB.prepare('SELECT * FROM users WHERE nickname = ?').bind(nickname).first();
  if (!user) {
    await recordLoginAttempt(env, nickname);
    return { error: 'Invalid nickname or password' };
  }

  const hash = await hashPassword(password, user.salt);
  if (hash !== user.password_hash) {
    await recordLoginAttempt(env, nickname);
    return { error: 'Invalid nickname or password' };
  }

  // Clear attempts on success
  await clearLoginAttempts(env, nickname);

  const token = await createToken(env, user.id);
  return { token, user: { id: user.id, nickname: user.nickname, friendCode: user.friend_code, feedVisibility: user.feed_visibility } };
}

// --- Password Reset ---
async function resetPassword(env, body) {
  const { nickname, recoveryCode, newPassword } = body;
  if (!nickname || !recoveryCode || !newPassword) return { error: 'nickname, recoveryCode, and newPassword are required' };
  if (newPassword.length < MIN_PASSWORD_LENGTH) return { error: `password must be at least ${MIN_PASSWORD_LENGTH} characters` };

  const user = await env.DB.prepare('SELECT * FROM users WHERE nickname = ?').bind(nickname).first();
  if (!user || !user.recovery_hash) return { error: 'Invalid nickname or recovery code' };

  const hash = await hashPassword(recoveryCode, user.salt);
  if (hash !== user.recovery_hash) return { error: 'Invalid nickname or recovery code' };

  // Set new password and generate new recovery code
  const newSalt = crypto.randomUUID();
  const newPasswordHash = await hashPassword(newPassword, newSalt);
  const newRecoveryCode = genRecoveryCode();
  const newRecoveryHash = await hashPassword(newRecoveryCode, newSalt);

  await env.DB.prepare(
    'UPDATE users SET password_hash = ?, salt = ?, recovery_hash = ? WHERE id = ?'
  ).bind(newPasswordHash, newSalt, newRecoveryHash, user.id).run();

  const token = await createToken(env, user.id);
  return { ok: true, token, recoveryCode: newRecoveryCode };
}

// --- Account Deletion ---
async function deleteAccount(env, user) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM cheers WHERE from_user_id = ?').bind(user.id),
    env.DB.prepare('DELETE FROM records WHERE user_id = ?').bind(user.id),
    env.DB.prepare('DELETE FROM rewards WHERE user_id = ?').bind(user.id),
    env.DB.prepare('DELETE FROM coin_spending WHERE user_id = ?').bind(user.id),
    env.DB.prepare('DELETE FROM friends WHERE user_id = ? OR friend_id = ?').bind(user.id, user.id),
    env.DB.prepare("DELETE FROM friend_requests WHERE from_user_id = ? OR to_user_id = ?").bind(user.id, user.id),
    env.DB.prepare('DELETE FROM login_attempts WHERE identifier = ?').bind(user.nickname),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id),
  ]);
  return { ok: true };
}

// --- Profile ---
async function getProfile(env, user) {
  const recordCount = await env.DB.prepare('SELECT COUNT(*) as cnt FROM records WHERE user_id = ?').bind(user.id).first();
  const witnessCount = await env.DB.prepare('SELECT COUNT(*) as cnt FROM records WHERE user_id = ? AND witnessed = 1').bind(user.id).first();
  const spentResult = await env.DB.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM coin_spending WHERE user_id = ?').bind(user.id).first();
  const friendCount = await env.DB.prepare('SELECT COUNT(*) as cnt FROM friends WHERE user_id = ?').bind(user.id).first();

  return {
    id: user.id,
    nickname: user.nickname,
    friendCode: user.friend_code,
    feedVisibility: user.feed_visibility,
    totalCoins: recordCount.cnt,
    witnessBonus: witnessCount.cnt,
    spentCoins: spentResult.total,
    balance: recordCount.cnt + witnessCount.cnt - spentResult.total,
    friendCount: friendCount.cnt,
    createdAt: user.created_at
  };
}

async function updateProfile(env, user, body) {
  const updates = [];
  const values = [];

  if (body.nickname && body.nickname !== user.nickname) {
    if (body.nickname.length < 2 || body.nickname.length > 20) return { error: 'nickname must be 2-20 characters' };
    const existing = await env.DB.prepare('SELECT id FROM users WHERE nickname = ? AND id != ?').bind(body.nickname, user.id).first();
    if (existing) return { error: 'This nickname is already taken' };
    updates.push('nickname = ?');
    values.push(body.nickname);
  }

  if (body.feedVisibility && ['activity_name', 'coin_only'].includes(body.feedVisibility)) {
    updates.push('feed_visibility = ?');
    values.push(body.feedVisibility);
  }

  if (body.password) {
    if (body.password.length < MIN_PASSWORD_LENGTH) return { error: `password must be at least ${MIN_PASSWORD_LENGTH} characters` };
    const salt = crypto.randomUUID();
    const hash = await hashPassword(body.password, salt);
    const recoveryCode = genRecoveryCode();
    const recoveryHash = await hashPassword(recoveryCode, salt);
    updates.push('password_hash = ?', 'salt = ?', 'recovery_hash = ?');
    values.push(hash, salt, recoveryHash);
    // Return new recovery code when password changes
    values.push(user.id);
    await env.DB.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    return { ok: true, recoveryCode };
  }

  if (updates.length === 0) return { error: 'No changes' };

  values.push(user.id);
  await env.DB.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
  return { ok: true };
}

// --- Records ---
async function getRecords(env, user) {
  const rows = await env.DB.prepare(
    'SELECT * FROM records WHERE user_id = ? ORDER BY timestamp DESC'
  ).bind(user.id).all();
  return { records: rows.results };
}

async function addRecord(env, user, body) {
  const { activityId, categoryCode, label, icon, memo, isFreeInput } = body;
  if (!label || !categoryCode) return { error: 'label and categoryCode are required' };

  const id = genId('rec_');
  const now = Date.now();

  await env.DB.prepare(
    'INSERT INTO records (id, user_id, activity_id, category_code, label, icon, memo, is_free_input, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, user.id, activityId || null, categoryCode, label, icon || '', memo || '', isFreeInput ? 1 : 0, now).run();

  return { record: { id, userId: user.id, activityId, categoryCode, label, icon: icon || '', memo: memo || '', isFreeInput: !!isFreeInput, witnessed: false, timestamp: now } };
}

async function deleteRecord(env, user, id) {
  const rec = await env.DB.prepare('SELECT * FROM records WHERE id = ? AND user_id = ?').bind(id, user.id).first();
  if (!rec) return { error: 'Record not found' };
  await env.DB.prepare('DELETE FROM records WHERE id = ?').bind(id).run();
  return { ok: true };
}

// --- Rewards ---
async function getRewards(env, user) {
  const rows = await env.DB.prepare('SELECT * FROM rewards WHERE user_id = ? ORDER BY created_at').bind(user.id).all();
  return { rewards: rows.results };
}

async function addReward(env, user, body) {
  const { label, cost } = body;
  if (!label || !cost || cost < 1) return { error: 'label and cost are required' };

  const id = genId('rwd_');
  await env.DB.prepare(
    'INSERT INTO rewards (id, user_id, label, cost, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, user.id, label, parseInt(cost), Date.now()).run();

  return { reward: { id, label, cost: parseInt(cost) } };
}

async function deleteReward(env, user, id) {
  const rwd = await env.DB.prepare('SELECT * FROM rewards WHERE id = ? AND user_id = ?').bind(id, user.id).first();
  if (!rwd) return { error: 'Reward not found' };
  await env.DB.prepare('DELETE FROM rewards WHERE id = ?').bind(id).run();
  return { ok: true };
}

async function exchangeReward(env, user, rewardId) {
  const reward = await env.DB.prepare('SELECT * FROM rewards WHERE id = ? AND user_id = ?').bind(rewardId, user.id).first();
  if (!reward) return { error: 'Reward not found' };

  const recordCount = await env.DB.prepare('SELECT COUNT(*) as cnt FROM records WHERE user_id = ?').bind(user.id).first();
  const witnessCount = await env.DB.prepare('SELECT COUNT(*) as cnt FROM records WHERE user_id = ? AND witnessed = 1').bind(user.id).first();
  const spentResult = await env.DB.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM coin_spending WHERE user_id = ?').bind(user.id).first();
  const balance = recordCount.cnt + witnessCount.cnt - spentResult.total;

  if (balance < reward.cost) return { error: 'Not enough coins' };

  await env.DB.prepare(
    'INSERT INTO coin_spending (id, user_id, amount, reward_label, spent_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(genId('sp_'), user.id, reward.cost, reward.label, Date.now()).run();

  return { ok: true, newBalance: balance - reward.cost };
}

// --- Friends ---
async function getFriends(env, user) {
  const rows = await env.DB.prepare(`
    SELECT u.id, u.nickname, u.friend_code, u.feed_visibility, f.created_at as friends_since
    FROM friends f JOIN users u ON f.friend_id = u.id
    WHERE f.user_id = ?
    ORDER BY u.nickname
  `).bind(user.id).all();
  return { friends: rows.results };
}

async function searchUsers(env, user, url) {
  const q = (url.searchParams.get('q') || '').trim();
  if (!q || q.length < 1) return { users: [] };

  const results = await env.DB.prepare(
    `SELECT id, nickname, friend_code FROM users WHERE nickname LIKE ? AND id != ? LIMIT 20`
  ).bind(`%${q}%`, user.id).all();

  // Mark existing friends and pending requests
  const friendIds = new Set();
  const pendingSentIds = new Set();
  const pendingRecvIds = new Set();

  const friends = await env.DB.prepare('SELECT friend_id FROM friends WHERE user_id = ?').bind(user.id).all();
  friends.results.forEach(f => friendIds.add(f.friend_id));

  const sentReqs = await env.DB.prepare("SELECT to_user_id FROM friend_requests WHERE from_user_id = ? AND status = 'pending'").bind(user.id).all();
  sentReqs.results.forEach(r => pendingSentIds.add(r.to_user_id));

  const recvReqs = await env.DB.prepare("SELECT from_user_id FROM friend_requests WHERE to_user_id = ? AND status = 'pending'").bind(user.id).all();
  recvReqs.results.forEach(r => pendingRecvIds.add(r.from_user_id));

  return {
    users: results.results.map(u => ({
      id: u.id,
      nickname: u.nickname,
      friendCode: u.friend_code,
      status: friendIds.has(u.id) ? 'friend' : pendingSentIds.has(u.id) ? 'pending_sent' : pendingRecvIds.has(u.id) ? 'pending_received' : 'none',
    }))
  };
}

async function sendFriendRequest(env, user, body) {
  const { friendCode, userId } = body;
  if (!friendCode && !userId) return { error: 'friendCode or userId is required' };

  let target;
  if (userId) {
    target = await env.DB.prepare('SELECT id, nickname FROM users WHERE id = ?').bind(userId).first();
  } else {
    target = await env.DB.prepare('SELECT id, nickname FROM users WHERE friend_code = ?').bind(friendCode.toUpperCase()).first();
  }
  if (!target) return { error: 'User not found' };
  if (target.id === user.id) return { error: 'Cannot add yourself' };

  const existing = await env.DB.prepare('SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?').bind(user.id, target.id).first();
  if (existing) return { error: 'Already friends' };

  const pending = await env.DB.prepare(
    "SELECT 1 FROM friend_requests WHERE from_user_id = ? AND to_user_id = ? AND status = 'pending'"
  ).bind(user.id, target.id).first();
  if (pending) return { error: 'Request already sent' };

  const reverse = await env.DB.prepare(
    "SELECT id FROM friend_requests WHERE from_user_id = ? AND to_user_id = ? AND status = 'pending'"
  ).bind(target.id, user.id).first();
  if (reverse) {
    return await acceptFriendRequest(env, user, reverse.id);
  }

  const id = genId('fr_');
  await env.DB.prepare(
    'INSERT INTO friend_requests (id, from_user_id, to_user_id, status, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, user.id, target.id, 'pending', Date.now()).run();

  return { ok: true, targetNickname: target.nickname };
}

async function getFriendRequests(env, user) {
  const rows = await env.DB.prepare(`
    SELECT fr.id, fr.from_user_id, fr.status, fr.created_at, u.nickname as from_nickname
    FROM friend_requests fr JOIN users u ON fr.from_user_id = u.id
    WHERE fr.to_user_id = ? AND fr.status = 'pending'
    ORDER BY fr.created_at DESC
  `).bind(user.id).all();
  return { requests: rows.results };
}

async function acceptFriendRequest(env, user, requestId) {
  const req = await env.DB.prepare(
    "SELECT * FROM friend_requests WHERE id = ? AND to_user_id = ? AND status = 'pending'"
  ).bind(requestId, user.id).first();
  if (!req) return { error: 'Request not found' };

  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("UPDATE friend_requests SET status = 'accepted' WHERE id = ?").bind(requestId),
    env.DB.prepare('INSERT INTO friends (user_id, friend_id, created_at) VALUES (?, ?, ?)').bind(user.id, req.from_user_id, now),
    env.DB.prepare('INSERT INTO friends (user_id, friend_id, created_at) VALUES (?, ?, ?)').bind(req.from_user_id, user.id, now),
  ]);

  return { ok: true };
}

async function rejectFriendRequest(env, user, requestId) {
  const req = await env.DB.prepare(
    "SELECT * FROM friend_requests WHERE id = ? AND to_user_id = ? AND status = 'pending'"
  ).bind(requestId, user.id).first();
  if (!req) return { error: 'Request not found' };

  await env.DB.prepare("UPDATE friend_requests SET status = 'rejected' WHERE id = ?").bind(requestId).run();
  return { ok: true };
}

async function removeFriend(env, user, friendId) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM friends WHERE user_id = ? AND friend_id = ?').bind(user.id, friendId),
    env.DB.prepare('DELETE FROM friends WHERE user_id = ? AND friend_id = ?').bind(friendId, user.id),
  ]);
  return { ok: true };
}

// --- Feed ---
async function getFeed(env, user) {
  const friendRows = await env.DB.prepare('SELECT friend_id FROM friends WHERE user_id = ?').bind(user.id).all();
  if (friendRows.results.length === 0) return { feed: [] };

  const friendIds = friendRows.results.map(f => f.friend_id);
  const placeholders = friendIds.map(() => '?').join(',');

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const rows = await env.DB.prepare(`
    SELECT r.id, r.user_id, r.activity_id, r.category_code, r.label, r.icon, r.witnessed, r.witnessed_by, r.timestamp,
           u.nickname, u.feed_visibility
    FROM records r JOIN users u ON r.user_id = u.id
    WHERE r.user_id IN (${placeholders}) AND r.timestamp > ?
    ORDER BY r.timestamp DESC LIMIT 50
  `).bind(...friendIds, sevenDaysAgo).all();

  // Get reaction data for all feed records
  const recordIds = rows.results.map(r => r.id);
  let reactionsMap = {};  // recordId -> { like: N, cheer: N, ... }
  let userReactions = {}; // recordId -> type
  let reactorsMap = {};   // recordId -> [{ nickname, type }]

  if (recordIds.length > 0) {
    const ph = recordIds.map(() => '?').join(',');
    const cheerRows = await env.DB.prepare(
      `SELECT record_id, type, COUNT(*) as cnt FROM cheers WHERE record_id IN (${ph}) GROUP BY record_id, type`
    ).bind(...recordIds).all();
    for (const row of cheerRows.results) {
      if (!reactionsMap[row.record_id]) reactionsMap[row.record_id] = {};
      reactionsMap[row.record_id][row.type || 'like'] = row.cnt;
    }

    const userCheerRows = await env.DB.prepare(
      `SELECT record_id, type FROM cheers WHERE from_user_id = ? AND record_id IN (${ph})`
    ).bind(user.id, ...recordIds).all();
    for (const row of userCheerRows.results) {
      userReactions[row.record_id] = row.type || 'like';
    }

    // Get who reacted (nickname + type) for tooltip
    const cheerDetailRows = await env.DB.prepare(
      `SELECT c.record_id, c.type, u.nickname FROM cheers c JOIN users u ON c.from_user_id = u.id WHERE c.record_id IN (${ph}) ORDER BY c.created_at DESC`
    ).bind(...recordIds).all();
    for (const row of cheerDetailRows.results) {
      if (!reactorsMap[row.record_id]) reactorsMap[row.record_id] = [];
      reactorsMap[row.record_id].push({ nickname: row.nickname, type: row.type || 'like' });
    }
  }

  const feed = rows.results.map(r => ({
    id: r.id,
    userId: r.user_id,
    nickname: r.nickname,
    label: r.feed_visibility === 'activity_name' ? r.label : null,
    icon: r.feed_visibility === 'activity_name' ? r.icon : null,
    categoryCode: r.category_code,
    witnessed: !!r.witnessed,
    reactions: reactionsMap[r.id] || {},
    reactors: reactorsMap[r.id] || [],
    myReaction: userReactions[r.id] || null,
    timestamp: r.timestamp,
  }));

  return { feed };
}

// --- Witness ---
async function witnessRecord(env, user, recordId) {
  const rec = await env.DB.prepare('SELECT * FROM records WHERE id = ?').bind(recordId).first();
  if (!rec) return { error: 'Record not found' };
  if (rec.user_id === user.id) return { error: 'Cannot witness your own record' };
  if (rec.witnessed) return { error: 'Already witnessed' };

  const friendship = await env.DB.prepare('SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?').bind(user.id, rec.user_id).first();
  if (!friendship) return { error: 'You must be friends to witness' };

  await env.DB.prepare(
    'UPDATE records SET witnessed = 1, witnessed_by = ?, witnessed_at = ? WHERE id = ?'
  ).bind(user.id, Date.now(), recordId).run();

  return { ok: true };
}

// --- Cheer (Reactions) ---
const REACTION_TYPES = ['like', 'cheer', 'empathy', 'amazing'];

async function cheerRecord(env, user, recordId) {
  const body = arguments[3] || {};
  const type = REACTION_TYPES.includes(body.type) ? body.type : 'like';

  const rec = await env.DB.prepare('SELECT * FROM records WHERE id = ?').bind(recordId).first();
  if (!rec) return { error: 'Record not found' };
  if (rec.user_id === user.id) return { error: 'Cannot react to your own record' };

  const friendship = await env.DB.prepare('SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?').bind(user.id, rec.user_id).first();
  if (!friendship) return { error: 'You must be friends to react' };

  // Check existing reaction from this user
  const existing = await env.DB.prepare('SELECT id, type FROM cheers WHERE from_user_id = ? AND record_id = ?').bind(user.id, recordId).first();

  if (existing) {
    if (existing.type === type) {
      // Same type: toggle off
      await env.DB.prepare('DELETE FROM cheers WHERE from_user_id = ? AND record_id = ?').bind(user.id, recordId).run();
      return { ok: true, reacted: false, type };
    } else {
      // Different type: update
      await env.DB.prepare('UPDATE cheers SET type = ?, created_at = ? WHERE id = ?').bind(type, Date.now(), existing.id).run();
    }
  } else {
    // New reaction
    const id = genId('ch_');
    await env.DB.prepare(
      'INSERT INTO cheers (id, from_user_id, record_id, type, created_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(id, user.id, recordId, type, Date.now()).run();
  }

  // Any reaction = witness (mark as witnessed, both get coins)
  if (!rec.witnessed) {
    await env.DB.prepare(
      'UPDATE records SET witnessed = 1, witnessed_by = ?, witnessed_at = ? WHERE id = ?'
    ).bind(user.id, Date.now(), recordId).run();
  }

  return { ok: true, reacted: true, type };
}

// --- Admin Functions ---
async function adminStats(env) {
  const totalUsers = await env.DB.prepare('SELECT COUNT(*) as c FROM users').first();
  const totalRecords = await env.DB.prepare('SELECT COUNT(*) as c FROM records').first();
  const totalWitnessed = await env.DB.prepare('SELECT COUNT(*) as c FROM records WHERE witnessed = 1').first();
  const totalFriendships = await env.DB.prepare('SELECT COUNT(*) as c FROM friends').first();
  // coins = record count + witness bonus count (1 record = 1 coin, witnessed = +1 bonus)
  const totalCoins = totalRecords.c + totalWitnessed.c;

  // Daily records for last 30 days
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const daily = await env.DB.prepare(
    `SELECT DATE(timestamp/1000, 'unixepoch') as day, COUNT(*) as count,
     COUNT(*) + SUM(CASE WHEN witnessed = 1 THEN 1 ELSE 0 END) as coins
     FROM records WHERE timestamp > ? GROUP BY day ORDER BY day`
  ).bind(thirtyDaysAgo).all();

  // Top categories
  const topCategories = await env.DB.prepare(
    `SELECT category_code, COUNT(*) as count,
     COUNT(*) + SUM(CASE WHEN witnessed = 1 THEN 1 ELSE 0 END) as coins
     FROM records GROUP BY category_code ORDER BY count DESC LIMIT 10`
  ).all();

  return {
    totalUsers: totalUsers.c,
    totalRecords: totalRecords.c,
    totalCoins,
    totalFriendships: Math.floor(totalFriendships.c / 2),
    totalWitnessed: totalWitnessed.c,
    dailyRecords: daily.results,
    topCategories: topCategories.results,
  };
}

async function adminUsers(env, url) {
  const search = url.searchParams.get('search') || '';
  const sort = url.searchParams.get('sort') || 'created_at';
  const order = url.searchParams.get('order') === 'asc' ? 'ASC' : 'DESC';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);
  const offset = parseInt(url.searchParams.get('offset') || '0');

  let query = `SELECT u.id, u.nickname, u.friend_code, u.feed_visibility, u.created_at,
    (SELECT COUNT(*) FROM records WHERE user_id = u.id) as record_count,
    (SELECT COUNT(*) + (SELECT COUNT(*) FROM records WHERE user_id = u.id AND witnessed = 1) FROM records WHERE user_id = u.id) as total_coins,
    (SELECT COUNT(*) FROM records WHERE witnessed_by = u.id) as witness_count,
    (SELECT COUNT(*) FROM friends WHERE user_id = u.id) as friend_count,
    (SELECT MAX(timestamp) FROM records WHERE user_id = u.id) as last_activity
    FROM users u`;

  const params = [];
  if (search) {
    query += ` WHERE u.nickname LIKE ?`;
    params.push(`%${search}%`);
  }

  const validSorts = ['created_at', 'nickname', 'record_count', 'total_coins', 'last_activity'];
  const sortCol = validSorts.includes(sort) ? sort : 'created_at';
  query += ` ORDER BY ${sortCol} ${order} LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const users = await env.DB.prepare(query).bind(...params).all();

  const countQuery = search
    ? await env.DB.prepare('SELECT COUNT(*) as c FROM users WHERE nickname LIKE ?').bind(`%${search}%`).first()
    : await env.DB.prepare('SELECT COUNT(*) as c FROM users').first();

  return { users: users.results, total: countQuery.c };
}

async function adminUserDetail(env, userId) {
  const user = await env.DB.prepare(
    'SELECT id, nickname, friend_code, feed_visibility, created_at FROM users WHERE id = ?'
  ).bind(userId).first();
  if (!user) return { error: 'User not found' };

  const records = await env.DB.prepare(
    'SELECT * FROM records WHERE user_id = ? ORDER BY timestamp DESC LIMIT 100'
  ).bind(userId).all();

  const rewards = await env.DB.prepare(
    'SELECT * FROM rewards WHERE user_id = ? ORDER BY created_at DESC'
  ).bind(userId).all();

  const friends = await env.DB.prepare(
    `SELECT u.id, u.nickname, u.friend_code FROM friends f
     JOIN users u ON u.id = f.friend_id WHERE f.user_id = ?`
  ).bind(userId).all();

  const recordCount = await env.DB.prepare(
    'SELECT COUNT(*) as c FROM records WHERE user_id = ?'
  ).bind(userId).first();

  const witnessBonus = await env.DB.prepare(
    'SELECT COUNT(*) as c FROM records WHERE user_id = ? AND witnessed = 1'
  ).bind(userId).first();

  const spentCoins = await env.DB.prepare(
    'SELECT COALESCE(SUM(amount),0) as c FROM coin_spending WHERE user_id = ?'
  ).bind(userId).first();

  const totalCoins = recordCount.c + witnessBonus.c;

  return {
    user,
    records: records.results,
    rewards: rewards.results,
    friends: friends.results,
    totalCoins,
    spentCoins: spentCoins.c,
    availableCoins: totalCoins - spentCoins.c,
  };
}

async function adminDeleteUser(env, userId) {
  const user = await env.DB.prepare('SELECT id, nickname FROM users WHERE id = ?').bind(userId).first();
  if (!user) return { error: 'User not found' };

  await env.DB.batch([
    env.DB.prepare('DELETE FROM cheers WHERE from_user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM records WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM rewards WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM coin_spending WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM friends WHERE user_id = ? OR friend_id = ?').bind(userId, userId),
    env.DB.prepare('DELETE FROM friend_requests WHERE from_user_id = ? OR to_user_id = ?').bind(userId, userId),
    env.DB.prepare('DELETE FROM login_attempts WHERE identifier = ?').bind(user.nickname),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId),
  ]);

  return { ok: true, deleted: user.nickname };
}

async function adminResetPassword(env, userId, body) {
  const user = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first();
  if (!user) return { error: 'User not found' };

  const newPassword = body.password;
  if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }

  const newSalt = crypto.randomUUID();
  const hash = await hashPassword(newPassword, newSalt);
  const recoveryCode = genRecoveryCode();
  const recoveryHash = await hashPassword(recoveryCode, newSalt);

  await env.DB.prepare(
    'UPDATE users SET password_hash = ?, salt = ?, recovery_hash = ? WHERE id = ?'
  ).bind(hash, newSalt, recoveryHash, userId).run();

  return { ok: true, recoveryCode };
}
