// app.js — UI描画、画面遷移、イベントハンドラ

const App = (() => {
  let currentScreen = 'screen-home';
  let currentCategoryCode = null;
  let searchDebounceTimer = null;
  let isMining = false;

  // --- 初期化 ---
  async function init() {
    await Data.init();

    // ブロックチェーン初期化（既存データのマイグレーション）
    const migrationOverlay = document.getElementById('migration-overlay');
    const migrationProgress = document.getElementById('migration-progress');
    const migrated = await Blockchain.init((current, total) => {
      migrationOverlay.hidden = false;
      migrationProgress.textContent = `${current} / ${total} ブロック生成中...`;
    });
    migrationOverlay.hidden = true;

    bindNav();
    bindSearch();
    bindFreeInput();
    bindSettings();
    bindHistoryTabs();
    renderHome();
    updateHeaderCoins();
  }

  // --- 画面遷移 ---
  function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
    currentScreen = screenId;

    // ナビのアクティブ更新
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.screen === screenId);
    });

    // 画面表示時の処理
    if (screenId === 'screen-home') {
      renderHome();
    } else if (screenId === 'screen-history') {
      renderHistory();
    }

    // スクロールを先頭に
    window.scrollTo(0, 0);
  }

  function bindNav() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        showScreen(btn.dataset.screen);
      });
    });
  }

  // --- ヘッダーのコイン数 ---
  function updateHeaderCoins() {
    document.getElementById('header-coins').textContent = Store.getTotalCoins() + ' コイン';
  }

  // --- ホーム画面 ---
  function renderHome() {
    renderRecentRecords();
    renderFavorites();
    renderCategoryGrid();
    updateHeaderCoins();
  }

  function renderCategoryGrid() {
    const grid = document.getElementById('category-grid');
    const categories = Data.getCategories();
    const monthlyCounts = Store.getMonthlyCounts();

    grid.innerHTML = categories.map(cat => {
      const count = monthlyCounts[cat.code] || 0;
      const badge = count > 0 ? `<span class="cat-badge">${count}</span>` : '';
      return `
        <div class="category-card" data-code="${cat.code}" style="border-color: ${cat.color}">
          ${badge}
          <span class="cat-icon">${cat.icon}</span>
          <span class="cat-label">${cat.label}</span>
        </div>
      `;
    }).join('');

    grid.querySelectorAll('.category-card').forEach(card => {
      card.addEventListener('click', () => {
        openCategory(card.dataset.code);
      });
    });
  }

  function renderRecentRecords() {
    const section = document.getElementById('section-recent');
    const list = document.getElementById('recent-list');
    const recent = Store.getRecentRecords(3);

    if (recent.length === 0) {
      section.hidden = true;
      return;
    }

    section.hidden = false;
    list.innerHTML = recent.map(r => {
      const timeStr = formatTime(r.timestamp);
      return `
        <div class="recent-item" data-activity-id="${r.activityId || ''}" data-label="${escapeAttr(r.label)}" data-icon="${r.icon}" data-category="${r.categoryCode}">
          <span class="ri-icon">${r.icon}</span>
          <span class="ri-label">${escapeHtml(r.label)}</span>
          <span class="ri-time">${timeStr}</span>
        </div>
      `;
    }).join('');

    list.querySelectorAll('.recent-item').forEach(item => {
      item.addEventListener('click', () => {
        const act = {
          id: item.dataset.activityId || null,
          label: item.dataset.label,
          icon: item.dataset.icon,
          categoryCode: item.dataset.category
        };
        recordActivity(act);
      });
    });
  }

  function renderFavorites() {
    const section = document.getElementById('section-favorites');
    const list = document.getElementById('favorites-list');
    const favorites = Store.getFrequentActivities(10);

    if (favorites.length === 0) {
      section.hidden = true;
      return;
    }

    section.hidden = false;
    list.innerHTML = favorites.map(act => `
      <div class="favorite-chip" data-id="${act.id}">
        <span class="fav-icon">${act.icon}</span>
        <span class="fav-label">${escapeHtml(act.label)}</span>
      </div>
    `).join('');

    list.querySelectorAll('.favorite-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const act = Data.getActivity(chip.dataset.id);
        if (act) recordActivity(act);
      });
    });
  }

  // --- カテゴリ詳細 ---
  function openCategory(code) {
    currentCategoryCode = code;
    const cat = Data.getCategory(code);
    document.getElementById('category-title').textContent = cat.icon + ' ' + cat.label;
    renderActivityList(code);
    showScreen('screen-category');

    document.getElementById('category-back').onclick = () => {
      showScreen('screen-home');
    };
  }

  function renderActivityList(code) {
    const list = document.getElementById('activity-list');
    const activities = Data.getActivities(code);
    const counts = Store.getActivityMonthlyCounts(code);

    list.innerHTML = activities.map(act => {
      const count = counts[act.id] || 0;
      const countBadge = count > 0 ? `<span class="act-count">${count}回</span>` : '';
      return `
        <div class="activity-item" data-id="${act.id}">
          <span class="act-icon">${act.icon}</span>
          <span class="act-label">${escapeHtml(act.label)}</span>
          ${countBadge}
        </div>
      `;
    }).join('');

    list.querySelectorAll('.activity-item').forEach(item => {
      item.addEventListener('click', () => {
        const act = Data.getActivity(item.dataset.id);
        if (act) recordActivity(act, true);
      });
    });
  }

  // --- 記録フロー（非同期：マイニング演出付き） ---
  async function recordActivity(activity, stayInCategory = false) {
    if (isMining) return; // 二重防止

    // 即座にレコード保存
    const record = Store.addRecord(activity, !activity.id);

    // ハプティックフィードバック
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }

    updateHeaderCoins();

    // カテゴリ画面に居る場合はリストを再描画（回数バッジ更新）
    if (stayInCategory && currentCategoryCode) {
      renderActivityList(currentCategoryCode);
    }

    // ホーム画面の場合はセクションを再描画
    if (currentScreen === 'screen-home') {
      renderHome();
    }

    // マイニング演出
    isMining = true;
    showMiningOverlay();

    const blockData = {
      recordId: record.id,
      activityId: record.activityId,
      label: record.label,
      icon: record.icon,
      categoryCode: record.categoryCode
    };

    const block = await Blockchain.mineBlock(blockData, (nonce, hash) => {
      updateMiningOverlay(nonce, hash);
    });

    hideMiningOverlay();
    isMining = false;

    // ブロック確認Toast
    const shortHash = block.hash.slice(0, 10) + '...';
    showToastCustom(`⛓️ Block #${block.index} 確認！ ${shortHash}`);

    if (navigator.vibrate) {
      navigator.vibrate([50, 50, 100]);
    }
  }

  // --- マイニングオーバーレイ ---
  function showMiningOverlay() {
    const overlay = document.getElementById('mining-overlay');
    document.getElementById('mining-nonce-val').textContent = '0';
    document.getElementById('mining-hash-val').textContent = 'Hash: 計算中...';
    overlay.hidden = false;
  }

  function updateMiningOverlay(nonce, hash) {
    document.getElementById('mining-nonce-val').textContent = nonce.toLocaleString();
    document.getElementById('mining-hash-val').textContent = 'Hash: ' + hash.slice(0, 24) + '...';
  }

  function hideMiningOverlay() {
    document.getElementById('mining-overlay').hidden = true;
  }

  // --- Toast ---
  function showToast() {
    showToastCustom('🪙 リハコイン +1');
  }

  function showToastCustom(text) {
    const toast = document.getElementById('toast');
    const toastText = document.getElementById('toast-text');
    toastText.textContent = text;
    toast.hidden = false;
    // 強制リフロー
    toast.offsetHeight;
    toast.classList.add('show');

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        toast.hidden = true;
        toastText.textContent = '🪙 リハコイン +1';
      }, 200);
    }, 2000);
  }

  // --- 検索 ---
  function bindSearch() {
    const input = document.getElementById('search-input');
    const results = document.getElementById('search-results');

    input.addEventListener('input', () => {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        const query = input.value.trim();
        if (query.length === 0) {
          results.hidden = true;
          results.innerHTML = '';
          return;
        }
        renderSearchResults(query);
      }, 200);
    });

    // Escape でクリア
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        input.value = '';
        results.hidden = true;
        results.innerHTML = '';
        input.blur();
      }
    });
  }

  function renderSearchResults(query) {
    const results = document.getElementById('search-results');
    const groups = Data.search(query);

    if (groups.length === 0) {
      results.hidden = false;
      results.innerHTML = '<div class="history-empty">見つかりませんでした</div>';
      return;
    }

    results.hidden = false;
    results.innerHTML = groups.map(group => {
      const items = group.items.map(act => `
        <div class="activity-item" data-id="${act.id}">
          <span class="act-icon">${act.icon}</span>
          <span class="act-label">${escapeHtml(act.label)}</span>
        </div>
      `).join('');

      return `
        <div class="search-group-title">${group.category.icon} ${group.category.label}</div>
        ${items}
      `;
    }).join('');

    results.querySelectorAll('.activity-item').forEach(item => {
      item.addEventListener('click', () => {
        const act = Data.getActivity(item.dataset.id);
        if (act) {
          recordActivity(act);
          // 検索をクリア
          document.getElementById('search-input').value = '';
          results.hidden = true;
          results.innerHTML = '';
        }
      });
    });
  }

  // --- 自由入力 ---
  function bindFreeInput() {
    const input = document.getElementById('free-input');
    const btn = document.getElementById('free-input-btn');

    input.addEventListener('input', () => {
      btn.disabled = input.value.trim().length === 0;
    });

    btn.addEventListener('click', () => {
      const label = input.value.trim();
      if (!label) return;
      recordActivity({ id: null, label, icon: '✏️', categoryCode: 'free' });
      input.value = '';
      btn.disabled = true;
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        btn.click();
      }
    });
  }

  // --- 履歴画面 ---
  function renderHistory() {
    renderStats();
    renderHistoryList();
  }

  // --- 履歴タブ切り替え ---
  function bindHistoryTabs() {
    document.querySelectorAll('.history-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.history-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('tab-' + tab.dataset.tab).classList.add('active');

        if (tab.dataset.tab === 'chain') {
          renderChainView();
        }
      });
    });

    // チェーン検証ボタン
    document.getElementById('btn-verify-chain').addEventListener('click', async () => {
      const btn = document.getElementById('btn-verify-chain');
      btn.disabled = true;
      btn.textContent = '🔍 検証中...';

      const result = await Blockchain.verifyChain();
      const el = document.getElementById('verify-result');
      el.hidden = false;

      if (result.valid) {
        el.className = 'verify-result valid';
        el.textContent = `✅ チェーン正常（${result.length} ブロック）`;
      } else {
        el.className = 'verify-result invalid';
        el.innerHTML = `❌ 改ざん検知！（${result.errors.length} 件のエラー）<br>` +
          result.errors.map(e => `Block #${e.index}: ${escapeHtml(e.message)}`).join('<br>');
      }

      btn.disabled = false;
      btn.textContent = '🔍 チェーン検証';
    });
  }

  // --- ブロックチェーンビューア ---
  function renderChainView() {
    const container = document.getElementById('chain-list');
    const chain = Blockchain.getChain();

    if (chain.length === 0) {
      container.innerHTML = '<div class="chain-empty">ブロックチェーンが空です</div>';
      return;
    }

    // 新しい順に表示（最大50件）
    const blocks = chain.slice().reverse().slice(0, 50);

    container.innerHTML = blocks.map((block, i) => {
      const time = new Date(block.timestamp);
      const timeStr = `${time.getFullYear()}/${(time.getMonth() + 1).toString().padStart(2, '0')}/${time.getDate().toString().padStart(2, '0')} ${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;

      const isGenesis = block.index === 0;
      const activityHtml = isGenesis
        ? `<div class="chain-block-activity"><span class="cb-icon">🌱</span><span class="cb-label">Genesis Block</span></div>`
        : `<div class="chain-block-activity"><span class="cb-icon">${block.data.icon || '📝'}</span><span class="cb-label">${escapeHtml(block.data.label || '')}</span></div>`;

      const linkHtml = i < blocks.length - 1 ? '<div class="chain-link">⛓️</div>' : '';

      return `
        <div class="chain-block">
          <div class="chain-block-header">
            <span class="chain-block-num">#${block.index}</span>
            <span class="chain-block-time">${timeStr}</span>
          </div>
          ${activityHtml}
          <div class="chain-block-meta">
            <span>Hash:</span> ${block.hash.slice(0, 16)}...<br>
            <span>Prev:</span> ${block.prevHash.slice(0, 16)}...<br>
            <span>Nonce:</span> ${block.nonce}
          </div>
        </div>
        ${linkHtml}
      `;
    }).join('');
  }

  function renderStats() {
    const container = document.getElementById('stats-summary');
    const total = Store.getTotalCoins();
    const today = Store.getTodayCount();
    const streak = Store.getStreak();
    const topCat = Store.getTopCategory();

    container.innerHTML = `
      <div class="stat-card">
        <div class="stat-value">${total}</div>
        <div class="stat-label">総コイン</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${today}</div>
        <div class="stat-label">今日の記録</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${streak}日</div>
        <div class="stat-label">連続記録</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${topCat ? topCat.icon : '—'}</div>
        <div class="stat-label">${topCat ? topCat.label : 'トップカテゴリ'}</div>
      </div>
    `;
  }

  function renderHistoryList() {
    const container = document.getElementById('history-list');
    const groups = Store.getRecordsByDate();

    if (groups.length === 0) {
      container.innerHTML = '<div class="history-empty">まだ記録がありません。<br>活動をタップして記録しましょう！</div>';
      return;
    }

    container.innerHTML = groups.map(group => {
      const items = group.records.map(r => {
        const time = new Date(r.timestamp);
        const timeStr = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;
        return `
          <div class="history-item">
            <span class="hi-icon">${r.icon}</span>
            <span class="hi-label">${escapeHtml(r.label)}</span>
            <span class="hi-time">${timeStr}</span>
            <button class="hi-delete" data-id="${r.id}" aria-label="削除">×</button>
          </div>
        `;
      }).join('');

      return `
        <div class="history-date-group">
          <div class="history-date">${group.date}</div>
          ${items}
        </div>
      `;
    }).join('');

    container.querySelectorAll('.hi-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        Store.deleteRecord(btn.dataset.id);
        renderHistory();
        updateHeaderCoins();
      });
    });
  }

  // --- 設定 ---
  function bindSettings() {
    document.getElementById('btn-export').addEventListener('click', () => {
      const data = Store.exportData();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rehacoin_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    document.getElementById('btn-clear-data').addEventListener('click', () => {
      if (confirm('全ての記録データを削除しますか？この操作は元に戻せません。')) {
        Store.clearAll();
        updateHeaderCoins();
        if (currentScreen === 'screen-history') renderHistory();
        if (currentScreen === 'screen-home') renderHome();
        showToastCustom('データを削除しました');
      }
    });
  }

  // --- ユーティリティ ---
  function formatTime(timestamp) {
    const d = new Date(timestamp);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return 'たった今';
    if (diffMin < 60) return `${diffMin}分前`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}時間前`;
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  return { init };
})();

// 起動
document.addEventListener('DOMContentLoaded', () => App.init());
