// data.js — JSON読み込み、検索、ルックアップマップ

const Data = (() => {
  let categories = [];
  let activities = [];
  let categoryMap = {};   // code -> category
  let activityMap = {};   // id -> activity
  let activitiesByCategory = {}; // code -> [activity]

  async function init() {
    try {
      const [catRes, actRes] = await Promise.all([
        fetch('categories.json'),
        fetch('activities.json')
      ]);
      if (!catRes.ok || !actRes.ok) {
        throw new Error(`Fetch failed: categories=${catRes.status}, activities=${actRes.status}`);
      }
      categories = await catRes.json();
      activities = await actRes.json();
    } catch (e) {
      console.error('Data.init failed:', e);
      // フォールバック: 空データで動作（再読み込みで復帰）
      categories = categories.length ? categories : [];
      activities = activities.length ? activities : [];
    }

    // ルックアップマップ構築
    for (const cat of categories) {
      categoryMap[cat.code] = cat;
      activitiesByCategory[cat.code] = [];
    }
    for (const act of activities) {
      activityMap[act.id] = act;
      if (activitiesByCategory[act.categoryCode]) {
        activitiesByCategory[act.categoryCode].push(act);
      }
    }
  }

  function getCategories() {
    return categories;
  }

  function getCategory(code) {
    return categoryMap[code];
  }

  function getActivities(categoryCode) {
    return activitiesByCategory[categoryCode] || [];
  }

  function getActivity(id) {
    return activityMap[id];
  }

  // カタカナ → ひらがな変換
  function kataToHira(str) {
    return str.replace(/[\u30A1-\u30F6]/g, ch =>
      String.fromCharCode(ch.charCodeAt(0) - 0x60)
    );
  }

  // 検索: ひらがな/カタカナ正規化 + includes
  function search(query) {
    if (!query || query.trim().length === 0) return [];

    const normalizedQuery = kataToHira(query.trim().toLowerCase());
    const results = [];

    for (const act of activities) {
      const normalizedLabel = kataToHira(act.label.toLowerCase());
      if (normalizedLabel.includes(normalizedQuery)) {
        results.push(act);
      }
    }

    // カテゴリ別にグループ化
    const grouped = {};
    for (const act of results) {
      if (!grouped[act.categoryCode]) {
        grouped[act.categoryCode] = {
          category: categoryMap[act.categoryCode],
          items: []
        };
      }
      grouped[act.categoryCode].items.push(act);
    }

    return Object.values(grouped);
  }

  return { init, getCategories, getCategory, getActivities, getActivity, search };
})();
