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

  function safeSetItem(key, value) {
    try { localStorage.setItem(key, value); }
    catch (e) { console.warn('localStorage write failed:', e); }
  }

  // --- Load all data from API ---
  async function loadAll() {
    if (!API.isLoggedIn()) return;
    try {
      const [recordsRes, rewardsRes, profileRes, requestsRes, feedRes] = await Promise.all([
        API.getRecords(),
        API.getRewards(),
        API.getProfile(),
        API.getFriendRequests(),
        API.getFeed()
      ]);
      if (profileRes.error) throw new Error(profileRes.error);
      _records = (recordsRes.records || []).map(normalizeRecord);
      _rewards = rewardsRes.rewards || [];
      _profile = profileRes;
      _friendRequests = requestsRes.requests || [];
      _feed = feedRes.feed || [];
      _loaded = true;
    } catch (e) {
      console.error('Store.loadAll failed:', e);
      throw e;
    }
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
    if (res.error) return null;
    if (res.record) {
      const rec = normalizeRecord(res.record);
      _records.unshift(rec);
      if (_profile) {
        _profile.totalCoins++;
        _profile.balance++;
      }
      // Instantly insert into feed for immediate visual feedback
      _feed.unshift({
        id: rec.id,
        nickname: _profile ? _profile.nickname : '',
        label: activity.label,
        icon: activity.icon || '',
        timestamp: rec.timestamp,
        reactions: {},
        reactors: [],
        myReaction: null,
        isOwn: true
      });
      return rec;
    }
    return null;
  }

  async function deleteRecord(id) {
    const res = await API.deleteRecord(id);
    if (res.error) return res;
    _records = _records.filter(r => r.id !== id);
    _feed = _feed.filter(f => f.id !== id);
    if (_profile) {
      _profile.totalCoins--;
      _profile.balance--;
    }
    return { ok: true };
  }

  async function updateRecord(id, label) {
    const res = await API.updateRecord(id, label);
    if (res.error) return res;
    const rec = _records.find(r => r.id === id);
    if (rec) rec.label = label;
    const feedItem = _feed.find(f => f.id === id);
    if (feedItem) feedItem.label = label;
    return { ok: true };
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

    // Check which dates have been frozen (already consumed)
    let frozenDates;
    try { frozenDates = JSON.parse(localStorage.getItem('rehacoin_frozen_dates') || '[]'); }
    catch { frozenDates = []; }
    const frozenSet = new Set(frozenDates);

    const freezesAvailable = parseInt(localStorage.getItem('rehacoin_streak_freezes') || '0');
    const newFrozenDates = [];

    let streak = 0;
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    let freezesUsedNow = 0;

    while (true) {
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (days.has(key)) {
        streak++;
        d.setDate(d.getDate() - 1);
      } else if (frozenSet.has(key)) {
        // Already frozen on a previous call
        streak++;
        d.setDate(d.getDate() - 1);
      } else if (freezesUsedNow < freezesAvailable) {
        // Use a new freeze ticket
        freezesUsedNow++;
        newFrozenDates.push(key);
        streak++;
        d.setDate(d.getDate() - 1);
      } else {
        break;
      }
    }

    // Persist newly frozen dates and deduct tickets
    if (freezesUsedNow > 0) {
      safeSetItem('rehacoin_streak_freezes', (freezesAvailable - freezesUsedNow).toString());
      safeSetItem('rehacoin_frozen_dates', JSON.stringify([...frozenDates, ...newFrozenDates]));
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
    const res = await API.deleteReward(id);
    if (res.error) return res;
    _rewards = _rewards.filter(r => r.id !== id);
    return { ok: true };
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
          // Update local coin balance immediately
          if (res.witnessBonus && _profile) {
            _profile.balance++;
            _profile.totalCoins++;
            _profile.witnessBonus = (_profile.witnessBonus || 0) + 1;
          }
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

  // --- Ranks ---
  const RANKS = [
    { id: 'bronze',   minCoins: 0,    color: '#CD7F32', label: 'リハビリ見習い', labelEn: 'Beginner',   icon: 'circle', iconColor: '#CD7F32' },
    { id: 'silver',   minCoins: 50,   color: '#C0C0C0', label: 'リハビリ初段',   labelEn: 'Silver',     icon: 'circle', iconColor: '#C0C0C0' },
    { id: 'gold',     minCoins: 200,  color: '#FFD700', label: 'リハビリ戦士',   labelEn: 'Gold',       icon: 'circle', iconColor: '#FFD700' },
    { id: 'platinum', minCoins: 500,  color: '#E5E4E2', label: 'リハビリ達人',   labelEn: 'Platinum',   icon: 'hexagon', iconColor: '#E5E4E2' },
    { id: 'diamond',  minCoins: 1000, color: '#B9F2FF', label: 'リハビリマスター', labelEn: 'Diamond', icon: 'gem', iconColor: '#B9F2FF' },
  ];

  function getRank() {
    const total = getTotalCoins() + getWitnessBonus();
    let rank = RANKS[0];
    for (const r of RANKS) {
      if (total >= r.minCoins) rank = r;
    }
    return rank;
  }

  function getRankProgress() {
    const total = getTotalCoins() + getWitnessBonus();
    const rank = getRank();
    const idx = RANKS.indexOf(rank);
    if (idx >= RANKS.length - 1) return { current: rank, next: null, progress: 1 };
    const next = RANKS[idx + 1];
    const progress = (total - rank.minCoins) / (next.minCoins - rank.minCoins);
    return { current: rank, next, progress: Math.min(1, progress) };
  }

  // --- Badges ---
  const BADGES = [
    // Milestone badges
    { id: 'b1', coins: 10, icon: 'award', iconColor: '#CD7F32', label: 'はじめの一歩', labelEn: 'First Steps' },
    { id: 'b2', coins: 50, icon: 'award', iconColor: '#C0C0C0', label: '習慣マスター', labelEn: 'Habit Master' },
    { id: 'b3', coins: 100, icon: 'award', iconColor: '#FFD700', label: 'リハビリスト', labelEn: 'Rehabist' },
    { id: 'b4', coins: 250, icon: 'gem', iconColor: '#00BCD4', label: 'ゴールドリハビリスト', labelEn: 'Gold Rehabist' },
    { id: 'b5', coins: 500, icon: 'crown', iconColor: '#FFD700', label: 'プラチナリハビリスト', labelEn: 'Platinum Rehabist' },
    { id: 'b6', coins: 1000, icon: 'trophy', iconColor: '#FFD700', label: 'レジェンド', labelEn: 'Legend' },
    // Streak badges
    { id: 's3', streak: 3, icon: 'flame', iconColor: '#FF9800', label: '3日連続', labelEn: '3 Day Streak' },
    { id: 's7', streak: 7, icon: 'flame', iconColor: '#FF5722', label: '1週間連続', labelEn: '7 Day Streak' },
    { id: 's30', streak: 30, icon: 'flame', iconColor: '#F44336', label: '1ヶ月連続', labelEn: '30 Day Streak' },
    { id: 's100', streak: 100, icon: 'flame', iconColor: '#E91E63', label: '100日連続', labelEn: '100 Day Streak' },
    // Activity count badges
    { id: 'a10', records: 10, icon: 'file-text', iconColor: '#0D9488', label: '10回記録', labelEn: '10 Records' },
    { id: 'a50', records: 50, icon: 'file-text', iconColor: '#0D9488', label: '50回記録', labelEn: '50 Records' },
    { id: 'a100', records: 100, icon: 'file-text', iconColor: '#0D9488', label: '100回記録', labelEn: '100 Records' },
    { id: 'a500', records: 500, icon: 'file-text', iconColor: '#0D9488', label: '500回記録', labelEn: '500 Records' },
    // Social badges
    { id: 'f1', friends: 1, icon: 'handshake', iconColor: '#FFD700', label: '初めてのフレンド', labelEn: 'First Friend' },
    { id: 'f5', friends: 5, icon: 'handshake', iconColor: '#FFD700', label: '5人のフレンド', labelEn: '5 Friends' },
    // Witness badges
    { id: 'w1', witness: 1, icon: 'eye', iconColor: '#9C27B0', label: '初めての応援', labelEn: 'First Cheer' },
    { id: 'w10', witness: 10, icon: 'eye', iconColor: '#9C27B0', label: '10回応援', labelEn: '10 Cheers' },
    { id: 'w50', witness: 50, icon: 'eye', iconColor: '#9C27B0', label: '応援マスター', labelEn: 'Cheer Master' },
    // Seasonal badges (active during specific months)
    { id: 'spring', seasonal: [3, 4, 5], icon: 'flower-2', iconColor: '#F48FB1', label: '春のリハビリスト', labelEn: 'Spring Rehabist' },
    { id: 'summer', seasonal: [6, 7, 8], icon: 'sun', iconColor: '#FF9800', label: '夏のリハビリスト', labelEn: 'Summer Rehabist' },
    { id: 'autumn', seasonal: [9, 10, 11], icon: 'leaf', iconColor: '#FF7043', label: '秋のリハビリスト', labelEn: 'Autumn Rehabist' },
    { id: 'winter', seasonal: [12, 1, 2], icon: 'snowflake', iconColor: '#64B5F6', label: '冬のリハビリスト', labelEn: 'Winter Rehabist' },
    { id: 'newyear', seasonal: [1], icon: 'sparkles', iconColor: '#FFD700', label: '新年リハビラー', labelEn: 'New Year Rehabber' },
  ];

  function _isBadgeUnlocked(b) {
    if (b.coins) return (getTotalCoins() + getWitnessBonus()) >= b.coins;
    if (b.streak) return getStreak() >= b.streak;
    if (b.records) return _records.length >= b.records;
    if (b.friends) return _friends.length >= b.friends;
    if (b.witness) return getWitnessBonus() >= b.witness;
    if (b.seasonal) {
      const month = new Date().getMonth() + 1;
      return b.seasonal.includes(month) && _records.length >= 1;
    }
    return false;
  }

  function getUnlockedBadges() {
    return BADGES.filter(_isBadgeUnlocked);
  }

  function getAllBadges() {
    return BADGES.map(b => ({ ...b, unlocked: _isBadgeUnlocked(b) }));
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

  async function getCoinHistory(limit = 50, offset = 0) {
    return API.getCoinHistory(limit, offset);
  }

  return {
    loadAll, getRecords, addRecord, deleteRecord, updateRecord, getCoinHistory,
    getTotalCoins, getTodayCount, getStreak,
    getRecentRecords, getFrequentActivities,
    getMonthlyCounts, getActivityMonthlyCounts, getTopCategory,
    getRecordsByDate, exportData,
    getRewards, addReward, deleteReward,
    getBalance, spendCoins,
    witnessRecord, cheerRecord, getWitnessBonus,
    getRank, getRankProgress, RANKS,
    getUnlockedBadges, getAllBadges,
    loadFriends, getFriends, getFeed, _updateFeed,
    getFriendRequests, sendFriendRequest, acceptFriendRequest, rejectFriendRequest, removeFriend,
    getProfile
  };
})();
