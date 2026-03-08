// rehacoin-api Worker

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS
    if (method === 'OPTIONS') return corsResponse();

    const headers = { 'Content-Type': 'application/json', ...corsHeaders() };

    try {
      // --- Public routes ---
      if (path === '/auth/register' && method === 'POST') {
        return json(await register(env, await request.json()), headers);
      }
      if (path === '/auth/login' && method === 'POST') {
        return json(await login(env, await request.json()), headers);
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

      return json({ error: 'Not Found' }, headers, 404);
    } catch (e) {
      console.error(e);
      return json({ error: 'Internal Server Error' }, headers, 500);
    }
  }
};

// --- Helpers ---
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function corsResponse() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

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
  const payload = btoa(JSON.stringify({ sub: userId, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 }));
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

// --- Auth ---
async function register(env, body) {
  const { nickname, password } = body;
  if (!nickname || !password) return { error: 'nickname and password are required' };
  if (nickname.length < 2 || nickname.length > 20) return { error: 'nickname must be 2-20 characters' };
  if (password.length < 4) return { error: 'password must be at least 4 characters' };

  const existing = await env.DB.prepare('SELECT id FROM users WHERE nickname = ?').bind(nickname).first();
  if (existing) return { error: 'This nickname is already taken' };

  const id = genId('u_');
  const salt = crypto.randomUUID();
  const passwordHash = await hashPassword(password, salt);

  let friendCode;
  for (let i = 0; i < 10; i++) {
    friendCode = genFriendCode();
    const dup = await env.DB.prepare('SELECT id FROM users WHERE friend_code = ?').bind(friendCode).first();
    if (!dup) break;
  }

  await env.DB.prepare(
    'INSERT INTO users (id, nickname, password_hash, salt, friend_code, feed_visibility, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, nickname, passwordHash, salt, friendCode, 'activity_name', Date.now()).run();

  const token = await createToken(env, id);
  return { token, user: { id, nickname, friendCode, feedVisibility: 'activity_name' } };
}

async function login(env, body) {
  const { nickname, password } = body;
  if (!nickname || !password) return { error: 'nickname and password are required' };

  const user = await env.DB.prepare('SELECT * FROM users WHERE nickname = ?').bind(nickname).first();
  if (!user) return { error: 'Invalid nickname or password' };

  const hash = await hashPassword(password, user.salt);
  if (hash !== user.password_hash) return { error: 'Invalid nickname or password' };

  const token = await createToken(env, user.id);
  return { token, user: { id: user.id, nickname: user.nickname, friendCode: user.friend_code, feedVisibility: user.feed_visibility } };
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
    if (body.password.length < 4) return { error: 'password must be at least 4 characters' };
    const salt = crypto.randomUUID();
    const hash = await hashPassword(body.password, salt);
    updates.push('password_hash = ?', 'salt = ?');
    values.push(hash, salt);
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

  // Calculate balance
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

async function sendFriendRequest(env, user, body) {
  const { friendCode } = body;
  if (!friendCode) return { error: 'friendCode is required' };

  const target = await env.DB.prepare('SELECT id, nickname FROM users WHERE friend_code = ?').bind(friendCode.toUpperCase()).first();
  if (!target) return { error: 'User not found with this code' };
  if (target.id === user.id) return { error: 'Cannot add yourself' };

  // Already friends?
  const existing = await env.DB.prepare('SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?').bind(user.id, target.id).first();
  if (existing) return { error: 'Already friends' };

  // Pending request?
  const pending = await env.DB.prepare(
    "SELECT 1 FROM friend_requests WHERE from_user_id = ? AND to_user_id = ? AND status = 'pending'"
  ).bind(user.id, target.id).first();
  if (pending) return { error: 'Request already sent' };

  // Reverse pending? Auto-accept
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
  // Get friend IDs
  const friendRows = await env.DB.prepare('SELECT friend_id FROM friends WHERE user_id = ?').bind(user.id).all();
  if (friendRows.results.length === 0) return { feed: [] };

  const friendIds = friendRows.results.map(f => f.friend_id);
  const placeholders = friendIds.map(() => '?').join(',');

  // Get recent records from friends (last 7 days, max 50)
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const rows = await env.DB.prepare(`
    SELECT r.id, r.user_id, r.activity_id, r.category_code, r.label, r.icon, r.witnessed, r.witnessed_by, r.timestamp,
           u.nickname, u.feed_visibility
    FROM records r JOIN users u ON r.user_id = u.id
    WHERE r.user_id IN (${placeholders}) AND r.timestamp > ?
    ORDER BY r.timestamp DESC LIMIT 50
  `).bind(...friendIds, sevenDaysAgo).all();

  const feed = rows.results.map(r => ({
    id: r.id,
    userId: r.user_id,
    nickname: r.nickname,
    label: r.feed_visibility === 'activity_name' ? r.label : null,
    icon: r.feed_visibility === 'activity_name' ? r.icon : null,
    categoryCode: r.category_code,
    witnessed: !!r.witnessed,
    witnessedBy: r.witnessed_by,
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

  // Must be friends
  const friendship = await env.DB.prepare('SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?').bind(user.id, rec.user_id).first();
  if (!friendship) return { error: 'You must be friends to witness' };

  await env.DB.prepare(
    'UPDATE records SET witnessed = 1, witnessed_by = ?, witnessed_at = ? WHERE id = ?'
  ).bind(user.id, Date.now(), recordId).run();

  return { ok: true };
}
