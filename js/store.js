// store.js — localStorage管理（記録CRUD、お気に入り、統計）

const Store = (() => {
  const RECORDS_KEY = 'rehacoin_records';

  function getRecords() {
    try {
      return JSON.parse(localStorage.getItem(RECORDS_KEY)) || [];
    } catch {
      return [];
    }
  }

  function saveRecords(records) {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  }

  function addRecord(activity, isFreeInput = false) {
    const records = getRecords();
    const record = {
      id: 'rec_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
      activityId: activity.id || null,
      categoryCode: activity.categoryCode || 'free',
      label: activity.label,
      icon: activity.icon || '✏️',
      memo: '',
      timestamp: Date.now(),
      isFreeInput
    };
    records.push(record);
    saveRecords(records);
    return record;
  }

  function deleteRecord(id) {
    const records = getRecords().filter(r => r.id !== id);
    saveRecords(records);
  }

  function getTotalCoins() {
    return getRecords().length;
  }

  function getTodayCount() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();
    return getRecords().filter(r => r.timestamp >= todayMs).length;
  }

  // 連続日数を計算
  function getStreak() {
    const records = getRecords();
    if (records.length === 0) return 0;

    // 記録された日付のSetを作成
    const days = new Set();
    for (const r of records) {
      const d = new Date(r.timestamp);
      days.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    }

    // 今日から遡って連続日数をカウント
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

  // 最近の記録（新しい順、limit件）
  function getRecentRecords(limit = 3) {
    return getRecords()
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  // よく使う活動（直近30日の使用頻度上位、最大limit件）
  function getFrequentActivities(limit = 10) {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const records = getRecords().filter(r => r.timestamp >= thirtyDaysAgo && r.activityId);

    // activityId別にカウント
    const counts = {};
    for (const r of records) {
      counts[r.activityId] = (counts[r.activityId] || 0) + 1;
    }

    // ソートしてtop N
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([activityId, count]) => {
        const act = Data.getActivity(activityId);
        return act ? { ...act, recentCount: count } : null;
      })
      .filter(Boolean);
  }

  // カテゴリ別の月間記録数
  function getMonthlyCounts() {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const records = getRecords().filter(r => r.timestamp >= thirtyDaysAgo);

    const counts = {};
    for (const r of records) {
      counts[r.categoryCode] = (counts[r.categoryCode] || 0) + 1;
    }
    return counts;
  }

  // 活動別の月間記録数
  function getActivityMonthlyCounts(categoryCode) {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const records = getRecords().filter(r =>
      r.timestamp >= thirtyDaysAgo && r.categoryCode === categoryCode
    );

    const counts = {};
    for (const r of records) {
      if (r.activityId) {
        counts[r.activityId] = (counts[r.activityId] || 0) + 1;
      }
    }
    return counts;
  }

  // トップカテゴリ
  function getTopCategory() {
    const counts = getMonthlyCounts();
    let topCode = null;
    let topCount = 0;
    for (const [code, count] of Object.entries(counts)) {
      if (count > topCount) {
        topCode = code;
        topCount = count;
      }
    }
    if (!topCode) return null;
    const cat = Data.getCategory(topCode);
    return cat ? { ...cat, count: topCount } : null;
  }

  // 日付別グループ（履歴画面用）
  function getRecordsByDate() {
    const records = getRecords().sort((a, b) => b.timestamp - a.timestamp);
    const groups = [];
    let currentDate = null;
    let currentGroup = null;

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

  // エクスポート
  function exportData() {
    return JSON.stringify(getRecords(), null, 2);
  }

  // 全削除
  function clearAll() {
    localStorage.removeItem(RECORDS_KEY);
  }

  return {
    getRecords, addRecord, deleteRecord,
    getTotalCoins, getTodayCount, getStreak,
    getRecentRecords, getFrequentActivities,
    getMonthlyCounts, getActivityMonthlyCounts, getTopCategory,
    getRecordsByDate, exportData, clearAll
  };
})();
