// store.js — API-backed store with local cache

const Store = (() => {
  // Local cache
  let _records = [];
  let _rewards = [];
  let _profile = null;
  let _friends = [];
  let _feed = [];
  let _friendRequests = [];
  let _loaded = false;

  // --- Load all data from API ---
  async function loadAll() {
    if (!API.isLoggedIn()) return;
    const [recordsRes, rewardsRes, profileRes, requestsRes, feedRes] = await Promise.all([
      API.getRecords(),
      API.getRewards(),
      API.getProfile(),
      API.getFriendRequests(),
      API.getFeed()
    ]);
    _records = (recordsRes.records || []).map(normalizeRecord);
    _rewards = rewardsRes.rewards || [];
    _profile = profileRes;
    _friendRequests = requestsRes.requests || [];
    _feed = feedRes.feed || [];
    _loaded = true;
  }

  function normalizeRecord(r) {
    return {
      id: r.id,
      activityId: r.activity_id ?? r.activityId ?? null,
      categoryCode: r.category_code ?? r.categoryCode ?? 'free',
      label: r.label,
      icon: r.icon || '',
      memo: r.memo || '',
      isFreeInput: !!(r.is_free_input ?? r.isFreeInput),
      witnessed: !!(r.witnessed),
      witnessedBy: r.witnessed_by ?? r.witnessedBy ?? null,
      witnessedAt: r.witnessed_at ?? r.witnessedAt ?? null,
      timestamp: r.timestamp
    };
  }

  function getRecords() {
    return _records;
  }

  async function addRecord(activity, isFreeInput = false) {
    const res = await API.addRecord({
      activityId: activity.id || null,
      categoryCode: activity.categoryCode || 'free',
      label: activity.label,
      icon: activity.icon || '',
      isFreeInput
    });
    if (res.record) {
      const rec = normalizeRecord(res.record);
      _records.unshift(rec);
      if (_profile) {
        _profile.totalCoins++;
        _profile.balance++;
      }
      return rec;
    }
    return null;
  }

  async function deleteRecord(id) {
    await API.deleteRecord(id);
    _records = _records.filter(r => r.id !== id);
    if (_profile) {
      _profile.totalCoins--;
      _profile.balance--;
    }
  }

  function getTotalCoins() {
    return _profile ? _profile.totalCoins : _records.length;
  }

  function getTodayCount() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();
    return _records.filter(r => r.timestamp >= todayMs).length;
  }

  function getStreak() {
    if (_records.length === 0) return 0;
    const days = new Set();
    for (const r of _records) {
      const d = new Date(r.timestamp);
      days.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    }
    let streak = 0;
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    while (true) {
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (days.has(key)) {
        streak++;
        d.setDate(d.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  }

  function getRecentRecords(limit = 3) {
    return _records
      .slice()
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  function getFrequentActivities(limit = 10) {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recent = _records.filter(r => r.timestamp >= thirtyDaysAgo && r.activityId);
    const counts = {};
    for (const r of recent) {
      counts[r.activityId] = (counts[r.activityId] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([activityId, count]) => {
        const act = Data.getActivity(activityId);
        return act ? { ...act, recentCount: count } : null;
      })
      .filter(Boolean);
  }

  function getMonthlyCounts() {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const counts = {};
    for (const r of _records.filter(r => r.timestamp >= thirtyDaysAgo)) {
      counts[r.categoryCode] = (counts[r.categoryCode] || 0) + 1;
    }
    return counts;
  }

  function getActivityMonthlyCounts(categoryCode) {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const counts = {};
    for (const r of _records.filter(r => r.timestamp >= thirtyDaysAgo && r.categoryCode === categoryCode)) {
      if (r.activityId) counts[r.activityId] = (counts[r.activityId] || 0) + 1;
    }
    return counts;
  }

  function getTopCategory() {
    const counts = getMonthlyCounts();
    let topCode = null, topCount = 0;
    for (const [code, count] of Object.entries(counts)) {
      if (count > topCount) { topCode = code; topCount = count; }
    }
    if (!topCode) return null;
    const cat = Data.getCategory(topCode);
    return cat ? { ...cat, count: topCount } : null;
  }

  function getRecordsByDate() {
    const records = _records.slice().sort((a, b) => b.timestamp - a.timestamp);
    const groups = [];
    let currentDate = null, currentGroup = null;
    for (const r of records) {
      const d = new Date(r.timestamp);
      const dateStr = `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}`;
      if (dateStr !== currentDate) {
        currentDate = dateStr;
        currentGroup = { date: dateStr, records: [] };
        groups.push(currentGroup);
      }
      currentGroup.records.push(r);
    }
    return groups;
  }

  // --- Rewards ---
  function getRewards() {
    return _rewards;
  }

  async function addReward(label, cost) {
    const res = await API.addReward(label, cost);
    if (res.reward) _rewards.push(res.reward);
  }

  async function deleteReward(id) {
    await API.deleteReward(id);
    _rewards = _rewards.filter(r => r.id !== id);
  }

  function getBalance() {
    return _profile ? _profile.balance : 0;
  }

  async function spendCoins(rewardId) {
    const res = await API.exchangeReward(rewardId);
    if (res.ok) {
      _profile.balance = res.newBalance;
      return true;
    }
    return false;
  }

  // --- Witness ---
  async function witnessRecord(recordId) {
    const res = await API.witnessRecord(recordId);
    return res.ok || false;
  }

  // --- Reactions ---
  async function cheerRecord(recordId, type = 'like') {
    const res = await API.cheerRecord(recordId, type);
    if (res.ok) {
      const item = _feed.find(f => f.id === recordId);
      if (item) {
        if (!item.reactions) item.reactions = {};
        if (!item.reactors) item.reactors = [];
        const myNickname = _profile ? _profile.nickname : 'You';
        if (res.reacted) {
          // Remove old reaction if switching types
          if (item.myReaction && item.myReaction !== type) {
            item.reactions[item.myReaction] = Math.max(0, (item.reactions[item.myReaction] || 0) - 1);
          }
          item.reactions[type] = (item.reactions[type] || 0) + (item.myReaction === type ? 0 : 1);
          item.myReaction = type;
          item.witnessed = true;
          // Update reactors list
          item.reactors = item.reactors.filter(r => r.nickname !== myNickname);
          item.reactors.unshift({ nickname: myNickname, type });
        } else {
          // Toggled off
          item.reactions[type] = Math.max(0, (item.reactions[type] || 0) - 1);
          item.myReaction = null;
          item.reactors = item.reactors.filter(r => r.nickname !== myNickname);
        }
      }
    }
    return res;
  }

  function getWitnessBonus() {
    return _profile ? _profile.witnessBonus : 0;
  }

  // --- Badges ---
  const BADGES = [
    { id: 'b1', coins: 10, icon: '🥉', label: 'はじめの一歩' },
    { id: 'b2', coins: 50, icon: '🥈', label: '習慣マスター' },
    { id: 'b3', coins: 100, icon: '🥇', label: 'リハビリスト' },
    { id: 'b4', coins: 250, icon: '💎', label: 'ゴールドリハビリスト' },
    { id: 'b5', coins: 500, icon: '👑', label: 'プラチナリハビリスト' },
    { id: 'b6', coins: 1000, icon: '🏆', label: 'レジェンド' }
  ];

  function getUnlockedBadges() {
    const total = getTotalCoins() + getWitnessBonus();
    return BADGES.filter(b => total >= b.coins);
  }

  function getAllBadges() {
    const total = getTotalCoins() + getWitnessBonus();
    return BADGES.map(b => ({ ...b, unlocked: total >= b.coins }));
  }

  // --- Friends ---
  async function loadFriends() {
    const [friendsRes, feedRes, requestsRes] = await Promise.all([
      API.getFriends(),
      API.getFeed(),
      API.getFriendRequests()
    ]);
    _friends = friendsRes.friends || [];
    _feed = feedRes.feed || [];
    _friendRequests = requestsRes.requests || [];
  }

  function getFriends() {
    return _friends;
  }

  function getFeed() {
    return _feed;
  }

  function _updateFeed(newFeed) {
    _feed = newFeed;
  }

  function getFriendRequests() {
    return _friendRequests;
  }

  async function sendFriendRequest(code) {
    return API.sendFriendRequest(code);
  }

  async function acceptFriendRequest(id) {
    const res = await API.acceptFriendRequest(id);
    if (res.ok) {
      _friendRequests = _friendRequests.filter(r => r.id !== id);
      await loadFriends();
    }
    return res;
  }

  async function rejectFriendRequest(id) {
    const res = await API.rejectFriendRequest(id);
    if (res.ok) _friendRequests = _friendRequests.filter(r => r.id !== id);
    return res;
  }

  async function removeFriend(id) {
    const res = await API.removeFriend(id);
    if (res.ok) _friends = _friends.filter(f => f.id !== id);
    return res;
  }

  // --- Profile ---
  function getProfile() {
    return _profile;
  }

  // --- Export ---
  function exportData() {
    return JSON.stringify(_records, null, 2);
  }

  return {
    loadAll, getRecords, addRecord, deleteRecord,
    getTotalCoins, getTodayCount, getStreak,
    getRecentRecords, getFrequentActivities,
    getMonthlyCounts, getActivityMonthlyCounts, getTopCategory,
    getRecordsByDate, exportData,
    getRewards, addReward, deleteReward,
    getBalance, spendCoins,
    witnessRecord, cheerRecord, getWitnessBonus,
    getUnlockedBadges, getAllBadges,
    loadFriends, getFriends, getFeed, _updateFeed,
    getFriendRequests, sendFriendRequest, acceptFriendRequest, rejectFriendRequest, removeFriend,
    getProfile
  };
})();
