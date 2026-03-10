// api.js — API client for rehacoin-api Worker

const API = (() => {
  const BASE = 'https://rehacoin-api.mizuki-tools.workers.dev';
  const TOKEN_KEY = 'rehacoin_token';
  const USER_KEY = 'rehacoin_user';

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY)); }
    catch { return null; }
  }

  function setAuth(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  function isLoggedIn() {
    return !!getToken();
  }

  async function request(path, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    let res;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      opts.signal = controller.signal;
      res = await fetch(BASE + path, opts);
      clearTimeout(timeout);
    } catch (e) {
      if (e.name === 'AbortError') return { error: 'timeout', ok: false };
      return { error: 'network', ok: false };
    }

    let data;
    try { data = await res.json(); } catch { data = {}; }

    if (res.status === 401) {
      clearAuth();
      location.reload();
      return data;
    }
    if (!res.ok && !data.error) {
      data.error = data.error || 'server_error';
      data.ok = false;
    }
    return data;
  }

  // --- Auth ---
  async function register(nickname, password) {
    const data = await request('/auth/register', 'POST', { nickname, password });
    if (data.token) setAuth(data.token, data.user);
    return data;
  }

  async function login(nickname, password) {
    const data = await request('/auth/login', 'POST', { nickname, password });
    if (data.token) setAuth(data.token, data.user);
    return data;
  }

  async function resetPassword(nickname, recoveryCode, newPassword) {
    const data = await request('/auth/reset-password', 'POST', { nickname, recoveryCode, newPassword });
    if (data.token) setAuth(data.token, { nickname });
    return data;
  }

  async function deleteAccount() {
    return request('/me', 'DELETE');
  }

  function logout() {
    clearAuth();
    location.reload();
  }

  // --- Profile ---
  async function getProfile() {
    return request('/me');
  }

  async function updateProfile(data) {
    return request('/me', 'PUT', data);
  }

  // --- Records ---
  async function getRecords() {
    return request('/records');
  }

  async function addRecord(record) {
    return request('/records', 'POST', record);
  }

  async function deleteRecord(id) {
    return request(`/records/${id}`, 'DELETE');
  }

  async function updateRecord(id, label) {
    return request(`/records/${id}`, 'PATCH', { label });
  }

  // --- Rewards ---
  async function getRewards() {
    return request('/rewards');
  }

  async function addReward(label, cost) {
    return request('/rewards', 'POST', { label, cost });
  }

  async function deleteReward(id) {
    return request(`/rewards/${id}`, 'DELETE');
  }

  async function exchangeReward(id) {
    return request(`/rewards/${id}/exchange`, 'POST');
  }

  // --- Friends ---
  async function getFriends() {
    return request('/friends');
  }

  async function getFeed() {
    return request('/friends/feed');
  }

  async function searchUsers(query) {
    return request('/users/search?q=' + encodeURIComponent(query));
  }

  async function sendFriendRequest(friendCode) {
    return request('/friends/request', 'POST', { friendCode });
  }

  async function sendFriendRequestById(userId) {
    return request('/friends/request', 'POST', { userId });
  }

  async function getFriendRequests() {
    return request('/friends/requests');
  }

  async function acceptFriendRequest(id) {
    return request(`/friends/requests/${id}/accept`, 'POST');
  }

  async function rejectFriendRequest(id) {
    return request(`/friends/requests/${id}/reject`, 'POST');
  }

  async function removeFriend(id) {
    return request(`/friends/${id}`, 'DELETE');
  }

  // --- Witness ---
  async function witnessRecord(recordId) {
    return request(`/records/${recordId}/witness`, 'POST');
  }

  // --- Reactions ---
  async function cheerRecord(recordId, type = 'like') {
    return request(`/records/${recordId}/cheer`, 'POST', { type });
  }

  // --- Bonus Coins ---
  async function addBonusCoins(amount, source, label = '') {
    return request('/coins/bonus', 'POST', { amount, source, label });
  }

  // --- Spend Coins (generic) ---
  async function spendCoinsGeneric(amount, label) {
    return request('/coins/spend', 'POST', { amount, label });
  }

  // --- Coin History ---
  async function getCoinHistory(limit = 50, offset = 0) {
    return request(`/coin-history?limit=${limit}&offset=${offset}`);
  }

  // --- Push Notifications ---
  async function getVapidKey() {
    return request('/push/vapid-key');
  }

  async function subscribePush(subscription) {
    return request('/push/subscribe', 'POST', subscription);
  }

  async function unsubscribePush() {
    return request('/push/unsubscribe', 'POST');
  }

  return {
    isLoggedIn, getUser, logout,
    register, login, resetPassword, deleteAccount,
    getProfile, updateProfile,
    getRecords, addRecord, deleteRecord, updateRecord,
    getRewards, addReward, deleteReward, exchangeReward,
    getFriends, getFeed, searchUsers, sendFriendRequest, sendFriendRequestById,
    getFriendRequests, acceptFriendRequest, rejectFriendRequest, removeFriend,
    witnessRecord,
    cheerRecord,
    addBonusCoins, spendCoinsGeneric, getCoinHistory,
    getVapidKey, subscribePush, unsubscribePush
  };
})();
