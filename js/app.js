// app.js — UI, routing, event handlers (API-backed, i18n)

const App = (() => {
  let currentScreen = 'screen-home';
  let currentCategoryCode = null;
  let searchDebounceTimer = null;
  let isMining = false;
  let feedRefreshTimer = null;

  // --- Init ---
  async function init() {
    if (!API.isLoggedIn()) {
      showAuthScreen();
      return;
    }

    showLoadingOverlay(I18n.t('loading'));
    try {
      await Data.init();
      await Store.loadAll();
    } catch (e) {
      console.error('Init failed:', e);
    }
    hideLoadingOverlay();

    document.getElementById('app-container').hidden = false;
    document.getElementById('auth-screen').hidden = true;

    bindNav();
    bindSearch();
    bindFreeInput();
    bindSettings();
    bindHistoryTabs();
    bindExchange();
    bindFriends();
    bindLangToggle();
    updateLangToggleLabel();
    I18n.applyToDOM();
    renderHome();
    updateHeaderCoins();
    updateHeaderNickname();
    updateFriendBadge();
    startFeedRefresh();
  }

  // --- Language toggle ---
  function bindLangToggle() {
    document.getElementById('btn-lang-toggle').addEventListener('click', () => {
      const newLang = I18n.getLang() === 'ja' ? 'en' : 'ja';
      I18n.setLang(newLang);
      updateLangToggleLabel();
      I18n.applyToDOM();
      updateHeaderCoins();
      // Re-render current screen
      if (currentScreen === 'screen-home') renderHome();
      else if (currentScreen === 'screen-history') renderHistory();
      else if (currentScreen === 'screen-friends') renderFriends();
      else if (currentScreen === 'screen-profile') renderProfile();
    });

    // Profile language selector
    const profileLang = document.getElementById('profile-lang');
    if (profileLang) {
      profileLang.addEventListener('change', () => {
        I18n.setLang(profileLang.value);
        updateLangToggleLabel();
        I18n.applyToDOM();
        updateHeaderCoins();
        renderProfile();
      });
    }
  }

  function updateLangToggleLabel() {
    const btn = document.getElementById('btn-lang-toggle');
    btn.textContent = I18n.getLang() === 'ja' ? 'EN' : 'JA';
  }

  // --- Auth Screen ---
  function showAuthScreen() {
    document.getElementById('auth-screen').hidden = false;
    document.getElementById('app-container').hidden = true;
    I18n.applyToDOM();

    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const authError = document.getElementById('auth-error');

    document.getElementById('btn-show-register').onclick = () => {
      loginForm.hidden = true; registerForm.hidden = false; authError.hidden = true;
    };
    document.getElementById('btn-show-login').onclick = () => {
      loginForm.hidden = false; registerForm.hidden = true; authError.hidden = true;
    };

    const resetForm = document.getElementById('reset-form');

    document.getElementById('btn-show-reset').onclick = () => {
      loginForm.hidden = true; registerForm.hidden = true; resetForm.hidden = false; authError.hidden = true;
    };
    document.getElementById('btn-back-to-login').onclick = () => {
      loginForm.hidden = false; registerForm.hidden = true; resetForm.hidden = true; authError.hidden = true;
    };

    document.getElementById('btn-login').onclick = async () => {
      authError.hidden = true;
      const nickname = document.getElementById('login-nickname').value.trim();
      const password = document.getElementById('login-password').value;
      if (!nickname || !password) return;
      document.getElementById('btn-login').disabled = true;
      const res = await API.login(nickname, password);
      document.getElementById('btn-login').disabled = false;
      if (res.error) { authError.textContent = res.error; authError.hidden = false; }
      else init();
    };

    document.getElementById('btn-register').onclick = async () => {
      authError.hidden = true;
      const nickname = document.getElementById('register-nickname').value.trim();
      const password = document.getElementById('register-password').value;
      const privacyCheck = document.getElementById('privacy-check');
      if (!nickname || !password) return;
      if (privacyCheck && !privacyCheck.checked) { authError.textContent = I18n.t('privacyRequired'); authError.hidden = false; return; }
      if (password.length < 8) { authError.textContent = I18n.t('passwordMinLength'); authError.hidden = false; return; }
      document.getElementById('btn-register').disabled = true;
      const res = await API.register(nickname, password);
      document.getElementById('btn-register').disabled = false;
      if (res.error) { authError.textContent = res.error; authError.hidden = false; }
      else {
        if (res.recoveryCode) showRecoveryCode(res.recoveryCode);
        init();
      }
    };

    document.getElementById('btn-reset-password').onclick = async () => {
      authError.hidden = true;
      const nickname = document.getElementById('reset-nickname').value.trim();
      const recoveryCode = document.getElementById('reset-recovery-code').value.trim().toUpperCase();
      const newPassword = document.getElementById('reset-new-password').value;
      if (!nickname || !recoveryCode || !newPassword) return;
      if (newPassword.length < 8) { authError.textContent = I18n.t('passwordMinLength'); authError.hidden = false; return; }
      document.getElementById('btn-reset-password').disabled = true;
      const res = await API.resetPassword(nickname, recoveryCode, newPassword);
      document.getElementById('btn-reset-password').disabled = false;
      if (res.error) { authError.textContent = res.error; authError.hidden = false; }
      else {
        if (res.recoveryCode) showRecoveryCode(res.recoveryCode);
        showToast(I18n.t('resetSuccess'));
        init();
      }
    };

    ['login-nickname', 'login-password'].forEach(id => {
      document.getElementById(id).addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('btn-login').click();
      });
    });
    ['register-nickname', 'register-password'].forEach(id => {
      document.getElementById(id).addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('btn-register').click();
      });
    });
    ['reset-nickname', 'reset-recovery-code', 'reset-new-password'].forEach(id => {
      document.getElementById(id).addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('btn-reset-password').click();
      });
    });
  }

  // --- Recovery Code Modal ---
  function showRecoveryCode(code) {
    document.getElementById('recovery-code-value').textContent = code;
    document.getElementById('recovery-overlay').hidden = false;

    document.getElementById('btn-copy-recovery').onclick = () => {
      navigator.clipboard.writeText(code).then(() => {
        document.getElementById('btn-copy-recovery').textContent = I18n.t('recoveryCodeCopied');
      });
    };
    document.getElementById('btn-close-recovery').onclick = () => {
      document.getElementById('recovery-overlay').hidden = true;
    };
  }

  // --- Loading ---
  function showLoadingOverlay(text) {
    document.getElementById('loading-text').textContent = text || I18n.t('loading');
    document.getElementById('loading-overlay').hidden = false;
  }
  function hideLoadingOverlay() {
    document.getElementById('loading-overlay').hidden = true;
  }

  // --- Navigation ---
  function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
    currentScreen = screenId;
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.screen === screenId);
    });
    if (screenId === 'screen-home') renderHome();
    else if (screenId === 'screen-history') renderHistory();
    else if (screenId === 'screen-friends') loadAndRenderFriends();
    else if (screenId === 'screen-profile') renderProfile();
    window.scrollTo(0, 0);
  }

  function bindNav() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => showScreen(btn.dataset.screen));
    });
  }

  // --- Header ---
  function updateHeaderCoins() {
    document.getElementById('header-coins').textContent = Store.getBalance() + ' ' + I18n.t('coin');
  }

  function updateHeaderNickname() {
    const profile = Store.getProfile();
    const el = document.getElementById('header-nickname');
    if (profile && profile.nickname) {
      el.textContent = profile.nickname;
    }
  }

  function updateFriendBadge() {
    const requests = Store.getFriendRequests();
    const count = requests.length;
    const badge = document.getElementById('friend-badge');
    if (count > 0) {
      badge.textContent = count;
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
    renderFriendRequestBanner();
  }

  function renderFriendRequestBanner() {
    const banner = document.getElementById('friend-request-banner');
    const requests = Store.getFriendRequests();
    if (requests.length === 0) {
      banner.hidden = true;
      return;
    }
    const names = requests.map(r => r.from_nickname).join(', ');
    const msg = I18n.getLang() === 'ja'
      ? `👥 ${names} からフレンド申請が${requests.length}件届いています`
      : `👥 ${requests.length} friend request${requests.length > 1 ? 's' : ''} from ${names}`;
    banner.innerHTML = `<span class="banner-text">${msg}</span><span class="banner-arrow">→</span>`;
    banner.hidden = false;
    banner.onclick = () => {
      document.querySelector('.nav-btn[data-screen="screen-friends"]').click();
    };
  }

  // --- Home ---
  function renderHome() {
    renderHomeFeed();
    // renderRecentRecords removed
    renderFavorites();
    renderCategoryGrid();
    updateHeaderCoins();
  }

  const REACTIONS = [
    { type: 'like', emoji: '👍', label: 'いいね！', labelEn: 'Like' },
    { type: 'cheer', emoji: '💪', label: '頑張ったね！', labelEn: 'Great job!' },
    { type: 'empathy', emoji: '🤝', label: 'わかるよ！', labelEn: 'I get you!' },
    { type: 'amazing', emoji: '👏', label: 'すごい！', labelEn: 'Amazing!' },
  ];

  // SVG icons for reaction button (outline = unreacted, filled = reacted)
  const REACTION_SVG = {
    like_outline: '<svg viewBox="0 0 24 24"><path d="M2 21h2V9H2v12zm20-11a2 2 0 0 0-2-2h-6.31l.95-4.57.03-.32a1.5 1.5 0 0 0-.44-1.06L13.17 1 7.59 6.59A2 2 0 0 0 7 8v10a2 2 0 0 0 2 2h9a2.006 2.006 0 0 0 1.84-1.21l3.02-7.05A2 2 0 0 0 22 10z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    like: '<svg viewBox="0 0 24 24"><path d="M2 21h2V9H2v12zm20-11a2 2 0 0 0-2-2h-6.31l.95-4.57.03-.32a1.5 1.5 0 0 0-.44-1.06L13.17 1 7.59 6.59A2 2 0 0 0 7 8v10a2 2 0 0 0 2 2h9a2.006 2.006 0 0 0 1.84-1.21l3.02-7.05A2 2 0 0 0 22 10z"/></svg>',
    cheer: '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>',
    empathy: '<svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>',
    amazing: '<svg viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>',
  };

  function renderHomeFeed() {
    const section = document.getElementById('section-home-feed');
    const list = document.getElementById('home-feed-list');
    const feed = Store.getFeed();
    if (feed.length === 0) { section.hidden = true; return; }
    section.hidden = false;
    const items = feed.slice(0, 10);
    list.innerHTML = items.map(item => renderFeedCard(item, 'home')).join('');
    bindFeedActions(list);
  }

  function renderFeedCard(item, context) {
    const time = formatTime(item.timestamp);
    const initial = item.nickname.charAt(0).toUpperCase();
    const actLabel = item.label ? `${item.icon || '🪙'} ${escapeHtml(item.label)}` : I18n.t('feedActivityRecorded');

    // Reaction summary (Facebook-style icon badges + count)
    const reactions = item.reactions || {};
    const totalReactions = Object.values(reactions).reduce((a, b) => a + b, 0);
    let reactionSummaryHtml = '';
    if (totalReactions > 0) {
      const badges = REACTIONS.filter(r => reactions[r.type] > 0)
        .map(r => `<span class="reaction-icon-badge ri-${r.type}">${r.emoji}</span>`).join('');
      const reactors = item.reactors || [];
      const tooltipItems = reactors.map(r => {
        const rd = REACTIONS.find(x => x.type === r.type);
        return `<div class="rt-line">${rd ? rd.emoji : '👍'} ${escapeHtml(r.nickname)}</div>`;
      }).join('');
      reactionSummaryHtml = `<div class="reaction-summary"><span class="reaction-icons">${badges}</span><span class="reaction-count">${totalReactions}</span><div class="reactor-tooltip">${tooltipItems}</div></div>`;
    }

    // My reaction - Facebook style: outline icon when unreacted, filled+colored when reacted
    const myReaction = item.myReaction;
    const myReactionData = myReaction ? REACTIONS.find(r => r.type === myReaction) : null;
    const triggerClass = myReaction ? `reaction-trigger reacted-${myReaction}` : 'reaction-trigger';
    const triggerIcon = myReaction ? REACTION_SVG[myReaction] : REACTION_SVG.like_outline;
    const triggerLabel = myReaction
      ? (I18n.getLang() === 'ja' ? myReactionData.label : myReactionData.labelEn)
      : (I18n.getLang() === 'ja' ? 'いいね！' : 'Like');

    const reactionBar = `
      <div class="reaction-bar" data-id="${item.id}">
        ${reactionSummaryHtml}
        <div class="reaction-buttons">
          <button class="${triggerClass}" data-id="${item.id}"><span class="rt-icon">${triggerIcon}</span>${triggerLabel}</button>
        </div>
        <div class="reaction-picker" hidden>
          ${REACTIONS.map(r => `<button class="reaction-option" data-id="${item.id}" data-type="${r.type}" title="${I18n.getLang() === 'ja' ? r.label : r.labelEn}">${r.emoji}</button>`).join('')}
        </div>
      </div>`;

    const cardClass = context === 'home' ? 'home-feed-card' : 'feed-item';
    const avatarClass = context === 'home' ? 'home-feed-avatar' : 'feed-avatar';
    const contentClass = context === 'home' ? 'home-feed-content' : 'feed-content';

    return `
    <div class="${cardClass}">
      <div class="${avatarClass}">${initial}</div>
      <div class="${contentClass}">
        <div class="${context === 'home' ? 'home-feed-header' : 'feed-header'}"><span class="${context === 'home' ? 'home-feed-name' : 'feed-name'}">${escapeHtml(item.nickname)}</span><span class="${context === 'home' ? 'home-feed-time' : 'feed-time'}">${time}</span></div>
        <div class="${context === 'home' ? 'home-feed-body' : 'feed-body'}"><span class="${context === 'home' ? 'home-feed-activity' : 'feed-activity'}">${actLabel}</span></div>
        ${reactionBar}
      </div>
    </div>`;
  }

  function bindFeedActions(container) {
    container.querySelectorAll('.reaction-trigger').forEach(btn => {
      if (btn._bound) return; // prevent double-binding
      btn._bound = true;
      const bar = btn.closest('.reaction-bar');
      const picker = bar.querySelector('.reaction-picker');
      let longPressTimer;
      let hoverTimeout;
      let pickerOpenedByHover = false;

      let hideDelay;
      const showPicker = () => {
        clearTimeout(hideDelay);
        picker.hidden = false;
        picker.classList.add('picker-animate');
        setTimeout(() => picker.classList.remove('picker-animate'), 300);
      };
      const hidePicker = () => {
        hideDelay = setTimeout(() => { picker.hidden = true; pickerOpenedByHover = false; }, 1000);
      };

      // PC: hover on bar shows picker
      bar.addEventListener('mouseenter', () => {
        clearTimeout(hideDelay);
        hoverTimeout = setTimeout(() => { showPicker(); pickerOpenedByHover = true; }, 300);
      });
      bar.addEventListener('mouseleave', () => {
        clearTimeout(hoverTimeout);
        hidePicker();
      });

      // Mobile: long press
      btn.addEventListener('touchstart', () => {
        longPressTimer = setTimeout(showPicker, 400);
      }, { passive: true });
      btn.addEventListener('touchend', () => clearTimeout(longPressTimer));
      btn.addEventListener('touchmove', () => clearTimeout(longPressTimer));

      // Quick tap = toggle current reaction
      btn.addEventListener('click', async () => {
        picker.hidden = true;
        const recordId = btn.dataset.id;
        const item = Store.getFeed().find(f => f.id === recordId);
        const currentType = item?.myReaction || 'like';
        await sendReaction(recordId, currentType, bar);
      });
    });

    container.querySelectorAll('.reaction-option').forEach(btn => {
      if (btn._bound) return;
      btn._bound = true;
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const recordId = btn.dataset.id;
        const type = btn.dataset.type;
        const bar = btn.closest('.reaction-bar');
        bar.querySelector('.reaction-picker').hidden = true;
        await sendReaction(recordId, type, bar);
      });
    });
  }

  let _reactionLock = new Set();
  async function sendReaction(recordId, type, bar) {
    if (_reactionLock.has(recordId)) return;
    _reactionLock.add(recordId);
    const trigger = bar.querySelector('.reaction-trigger');
    trigger.disabled = true;
    const res = await Store.cheerRecord(recordId, type);
    trigger.disabled = false;
    _reactionLock.delete(recordId);
    if (!res.ok) return;

    // Update UI in-place (no DOM rebuild)
    const item = Store.getFeed().find(f => f.id === recordId);
    if (!item) return;

    // Update trigger button (outline SVG when unreacted, filled SVG + color when reacted)
    if (item.myReaction) {
      const rd = REACTIONS.find(r => r.type === item.myReaction);
      trigger.className = `reaction-trigger reacted-${item.myReaction}`;
      trigger.innerHTML = `<span class="rt-icon">${REACTION_SVG[item.myReaction]}</span>${I18n.getLang() === 'ja' ? rd.label : rd.labelEn}`;
    } else {
      trigger.className = 'reaction-trigger';
      trigger.innerHTML = `<span class="rt-icon">${REACTION_SVG.like_outline}</span>${I18n.getLang() === 'ja' ? 'いいね！' : 'Like'}`;
    }

    // Update summary (Facebook-style icon badges + tooltip)
    const reactions = item.reactions || {};
    const total = Object.values(reactions).reduce((a, b) => a + b, 0);
    let summaryEl = bar.querySelector('.reaction-summary');
    if (total > 0) {
      const badges = REACTIONS.filter(r => reactions[r.type] > 0)
        .map(r => `<span class="reaction-icon-badge ri-${r.type}">${r.emoji}</span>`).join('');
      const reactors = item.reactors || [];
      const tooltipItems = reactors.map(r => {
        const rd = REACTIONS.find(x => x.type === r.type);
        return `<div class="rt-line">${rd ? rd.emoji : '👍'} ${escapeHtml(r.nickname)}</div>`;
      }).join('');
      const html = `<span class="reaction-icons">${badges}</span><span class="reaction-count">${total}</span><div class="reactor-tooltip">${tooltipItems}</div>`;
      if (summaryEl) {
        summaryEl.innerHTML = html;
      } else {
        summaryEl = document.createElement('div');
        summaryEl.className = 'reaction-summary';
        summaryEl.innerHTML = html;
        bar.insertBefore(summaryEl, bar.firstChild);
      }
    } else if (summaryEl) {
      summaryEl.remove();
    }

    if (res.reacted) {
      const rd = REACTIONS.find(r => r.type === type);
      if (navigator.vibrate) navigator.vibrate([30, 30, 50]);
      showFloatingEmoji(rd.emoji, trigger);
      showCoinBurst(trigger);

      const ja = I18n.getLang() === 'ja';
      if (res.witnessBonus) {
        showToast(ja
          ? `${rd.emoji} ${rd.label}\n🪙 あなたと相手に +1コイン！`
          : `${rd.emoji} ${rd.labelEn}\n🪙 +1 coin for you & them!`);
      } else {
        showToast(ja
          ? `${rd.emoji} ${rd.label}\n🪙 応援を送りました！`
          : `${rd.emoji} ${rd.labelEn}\n🪙 Cheered!`);
      }
      updateHeaderCoins();
    }
  }

  function showCoinBurst(anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top;
    for (let i = 0; i < 6; i++) {
      const coin = document.createElement('div');
      coin.className = 'coin-burst';
      coin.textContent = '🪙';
      coin.style.left = cx + 'px';
      coin.style.top = cy + 'px';
      coin.style.setProperty('--dx', (Math.random() - 0.5) * 80 + 'px');
      coin.style.setProperty('--dy', -(Math.random() * 60 + 30) + 'px');
      coin.style.animationDelay = (i * 50) + 'ms';
      document.body.appendChild(coin);
      coin.addEventListener('animationend', () => coin.remove());
    }
  }

  function showFloatingEmoji(emoji, anchorEl) {
    const el = document.createElement('div');
    el.className = 'floating-emoji';
    el.textContent = emoji;
    const rect = anchorEl.getBoundingClientRect();
    el.style.left = rect.left + rect.width / 2 + 'px';
    el.style.top = rect.top + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }

  function renderCategoryGrid() {
    const grid = document.getElementById('category-grid');
    const categories = Data.getCategories();
    const monthlyCounts = Store.getMonthlyCounts();
    grid.innerHTML = categories.map(cat => {
      const count = monthlyCounts[cat.code] || 0;
      const badge = count > 0 ? `<span class="cat-badge">${count}</span>` : '';
      return `<div class="category-card" data-code="${cat.code}">${badge}<span class="cat-icon">${cat.icon}</span><span class="cat-label">${cat.label}</span></div>`;
    }).join('');
    grid.querySelectorAll('.category-card').forEach(card => {
      card.addEventListener('click', () => openCategory(card.dataset.code));
    });
  }

  function renderRecentRecords() {
    const section = document.getElementById('section-recent');
    const list = document.getElementById('recent-list');
    const recent = Store.getRecentRecords(3);
    if (recent.length === 0) { section.hidden = true; return; }
    section.hidden = false;
    list.innerHTML = recent.map(r => `
      <div class="recent-item" data-activity-id="${r.activityId || ''}" data-label="${escapeAttr(r.label)}" data-icon="${r.icon}" data-category="${r.categoryCode}">
        <span class="ri-icon">${r.icon}</span>
        <span class="ri-label">${escapeHtml(r.label)}</span>
        <span class="ri-time">${formatTime(r.timestamp)}</span>
      </div>
    `).join('');
    list.querySelectorAll('.recent-item').forEach(item => {
      item.addEventListener('click', () => {
        recordActivity({ id: item.dataset.activityId || null, label: item.dataset.label, icon: item.dataset.icon, categoryCode: item.dataset.category });
      });
    });
  }

  function renderFavorites() {
    const section = document.getElementById('section-favorites');
    const list = document.getElementById('favorites-list');
    const favorites = Store.getFrequentActivities(10);
    if (favorites.length === 0) { section.hidden = true; return; }
    section.hidden = false;
    list.innerHTML = favorites.map(act => `
      <div class="favorite-chip" data-id="${act.id}"><span class="fav-icon">${act.icon}</span><span class="fav-label">${escapeHtml(act.label)}</span></div>
    `).join('');
    list.querySelectorAll('.favorite-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const act = Data.getActivity(chip.dataset.id);
        if (!act) return;
        const msg = I18n.getLang() === 'ja'
          ? `「${act.label}」を記録しますか？`
          : `Record "${act.label}"?`;
        if (confirm(msg)) recordActivity(act);
      });
    });
  }

  // --- Category ---
  function openCategory(code) {
    currentCategoryCode = code;
    const cat = Data.getCategory(code);
    document.getElementById('category-title').textContent = cat.icon + ' ' + cat.label;
    renderActivityList(code);
    showScreen('screen-category');
    document.getElementById('category-back').onclick = () => showScreen('screen-home');
  }

  function renderActivityList(code) {
    const list = document.getElementById('activity-list');
    const activities = Data.getActivities(code);
    const counts = Store.getActivityMonthlyCounts(code);
    list.innerHTML = activities.map(act => {
      const count = counts[act.id] || 0;
      const countBadge = count > 0 ? `<span class="act-count">${count}回</span>` : '';
      return `<div class="activity-item" data-id="${act.id}"><span class="act-icon">${act.icon}</span><span class="act-label">${escapeHtml(act.label)}</span>${countBadge}</div>`;
    }).join('');
    list.querySelectorAll('.activity-item').forEach(item => {
      item.addEventListener('click', () => {
        const act = Data.getActivity(item.dataset.id);
        if (!act) return;
        const msg = I18n.getLang() === 'ja'
          ? `「${act.label}」を記録しますか？`
          : `Record "${act.label}"?`;
        if (confirm(msg)) recordActivity(act, true);
      });
    });
  }

  // --- Record flow ---
  async function recordActivity(activity, stayInCategory = false) {
    if (isMining) return;
    isMining = true;
    showMiningOverlay();
    try {
      const record = await Store.addRecord(activity, !activity.id);
      if (!record) { showToast('Error'); return; }
      if (navigator.vibrate) navigator.vibrate(50);
      updateHeaderCoins();
      if (stayInCategory && currentCategoryCode) renderActivityList(currentCategoryCode);
      if (currentScreen === 'screen-home') renderHome();

      const startTime = Date.now();
      let nonce = 0;
      const animDuration = 800 + Math.random() * 1200;
      await new Promise(resolve => {
        function step() {
          nonce += Math.floor(Math.random() * 50) + 10;
          const fakeHash = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');
          updateMiningOverlay(nonce, fakeHash);
          if (Date.now() - startTime < animDuration) requestAnimationFrame(step);
          else resolve();
        }
        requestAnimationFrame(step);
      });

      showToast(`⛓️ ${I18n.t('blockConfirmed')}`);
      if (navigator.vibrate) navigator.vibrate([50, 50, 100]);
    } catch (e) {
      console.error('Record failed:', e);
      showToast(I18n.t('plusOneCoin'));
    } finally {
      hideMiningOverlay();
      isMining = false;
    }
    checkBadgeUnlock();
    showScreen('screen-home');
  }

  function checkBadgeUnlock() {
    const unlocked = Store.getUnlockedBadges();
    const shown = JSON.parse(localStorage.getItem('rehacoin_badges_shown') || '[]');
    for (const badge of unlocked) {
      if (!shown.includes(badge.id)) {
        shown.push(badge.id);
        localStorage.setItem('rehacoin_badges_shown', JSON.stringify(shown));
        setTimeout(() => showToast(`${badge.icon} ${I18n.t('badgeUnlocked')} ${badge.label}`), 1500);
        break;
      }
    }
  }

  // --- Mining overlay ---
  let _coinRainInterval;
  function showMiningOverlay() {
    document.getElementById('mining-nonce-val').textContent = '0';
    document.getElementById('mining-hash-val').textContent = I18n.t('hashComputing');
    document.getElementById('mining-overlay').hidden = false;
    startCoinRain();
  }
  function updateMiningOverlay(nonce, hash) {
    document.getElementById('mining-nonce-val').textContent = nonce.toLocaleString();
    document.getElementById('mining-hash-val').textContent = 'Hash: ' + hash.slice(0, 24) + '...';
  }
  function hideMiningOverlay() {
    document.getElementById('mining-overlay').hidden = true;
    stopCoinRain();
  }
  function startCoinRain() {
    const container = document.getElementById('coin-rain');
    container.innerHTML = '';
    const coins = ['🪙', '💰', '✨', '🪙', '🪙'];
    _coinRainInterval = setInterval(() => {
      const coin = document.createElement('div');
      coin.className = 'coin-drop';
      coin.textContent = coins[Math.floor(Math.random() * coins.length)];
      coin.style.left = Math.random() * 100 + '%';
      coin.style.animationDuration = (1.2 + Math.random() * 1.0) + 's';
      coin.style.fontSize = (1.2 + Math.random() * 0.8) + 'rem';
      container.appendChild(coin);
      coin.addEventListener('animationend', () => coin.remove());
    }, 80);
  }
  function stopCoinRain() {
    clearInterval(_coinRainInterval);
  }

  // --- Toast ---
  function showToast(text) {
    const toast = document.getElementById('toast');
    const toastText = document.getElementById('toast-text');
    toastText.textContent = text;
    toast.hidden = false;
    toast.offsetHeight;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => { toast.hidden = true; }, 200);
    }, 2000);
  }

  // --- Search ---
  function bindSearch() {
    const input = document.getElementById('search-input');
    const results = document.getElementById('search-results');
    input.addEventListener('input', () => {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        const query = input.value.trim();
        if (!query) { results.hidden = true; results.innerHTML = ''; return; }
        renderSearchResults(query);
      }, 200);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { input.value = ''; results.hidden = true; results.innerHTML = ''; input.blur(); }
    });
  }

  function renderSearchResults(query) {
    const results = document.getElementById('search-results');
    const groups = Data.search(query);
    if (groups.length === 0) {
      results.hidden = false;
      results.innerHTML = `<div class="history-empty">${I18n.t('notFound')}</div>`;
      return;
    }
    results.hidden = false;
    results.innerHTML = groups.map(group => {
      const items = group.items.map(act => `<div class="activity-item" data-id="${act.id}"><span class="act-icon">${act.icon}</span><span class="act-label">${escapeHtml(act.label)}</span></div>`).join('');
      return `<div class="search-group-title">${group.category.icon} ${group.category.label}</div>${items}`;
    }).join('');
    results.querySelectorAll('.activity-item').forEach(item => {
      item.addEventListener('click', () => {
        const act = Data.getActivity(item.dataset.id);
        if (!act) return;
        const msg = I18n.getLang() === 'ja'
          ? `「${act.label}」を記録しますか？`
          : `Record "${act.label}"?`;
        if (confirm(msg)) { recordActivity(act); document.getElementById('search-input').value = ''; results.hidden = true; }
      });
    });
  }

  // --- Free input ---
  function bindFreeInput() {
    const input = document.getElementById('free-input');
    const btn = document.getElementById('free-input-btn');
    input.addEventListener('input', () => { btn.disabled = !input.value.trim(); });
    btn.addEventListener('click', () => {
      const label = input.value.trim();
      if (!label) return;
      const msg = I18n.getLang() === 'ja'
        ? `「${label}」を記録しますか？`
        : `Record "${label}"?`;
      if (!confirm(msg)) return;
      recordActivity({ id: null, label, icon: '✏️', categoryCode: 'free' });
      input.value = ''; btn.disabled = true;
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && input.value.trim()) btn.click(); });
  }

  // --- History ---
  function renderHistory() { renderStats(); renderHistoryList(); }

  function bindHistoryTabs() {
    document.querySelectorAll('.history-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.history-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
      });
    });
  }

  function renderStats() {
    const container = document.getElementById('stats-summary');
    const total = Store.getTotalCoins();
    const today = Store.getTodayCount();
    const streak = Store.getStreak();
    const topCat = Store.getTopCategory();
    container.innerHTML = `
      <div class="stat-card"><div class="stat-value">${total}</div><div class="stat-label">${I18n.t('totalCoins')}</div></div>
      <div class="stat-card"><div class="stat-value">${today}</div><div class="stat-label">${I18n.t('today')}</div></div>
      <div class="stat-card"><div class="stat-value">${streak}${I18n.t('streakUnit')}</div><div class="stat-label">${I18n.t('streak')}</div></div>
      <div class="stat-card"><div class="stat-value">${topCat ? topCat.icon : '—'}</div><div class="stat-label">${topCat ? topCat.label : I18n.t('top')}</div></div>
    `;
  }

  function renderHistoryList() {
    const container = document.getElementById('history-list');
    const groups = Store.getRecordsByDate();
    if (groups.length === 0) {
      container.innerHTML = `<div class="history-empty">${I18n.t('noRecords')}</div>`;
      return;
    }
    container.innerHTML = groups.map(group => {
      const items = group.records.map(r => {
        const time = new Date(r.timestamp);
        const timeStr = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;
        const witnessHtml = r.witnessed ? `<span class="hi-witnessed">👁️ ${I18n.t('confirmed')}</span>` : '';
        return `<div class="history-item"><span class="hi-icon">${r.icon}</span><span class="hi-label">${escapeHtml(r.label)}</span>${witnessHtml}<span class="hi-time">${timeStr}</span><button class="hi-delete" data-id="${r.id}">×</button></div>`;
      }).join('');
      return `<div class="history-date-group"><div class="history-date">${group.date}</div>${items}</div>`;
    }).join('');
    container.querySelectorAll('.hi-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(I18n.t('deleteRecordConfirm'))) return;
        await Store.deleteRecord(btn.dataset.id);
        renderHistory(); updateHeaderCoins();
      });
    });
  }

  // --- Friends ---
  function bindFriends() {
    // Friends tabs
    document.querySelectorAll('.friends-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.friends-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.friends-tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.ftab).classList.add('active');
      });
    });

    // Friend code request
    document.getElementById('btn-send-friend-request').addEventListener('click', async () => {
      const input = document.getElementById('friend-code-input');
      const code = input.value.trim().toUpperCase();
      if (!code) return;
      const res = await Store.sendFriendRequest(code);
      if (res.error) showToast(res.error);
      else { showToast(I18n.t('friendRequestSent')); input.value = ''; }
    });
    document.getElementById('friend-code-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('btn-send-friend-request').click();
    });

    // Copy friend code
    document.getElementById('btn-copy-friend-code').addEventListener('click', () => {
      const code = document.getElementById('my-friend-code').textContent;
      navigator.clipboard.writeText(code).then(() => showToast('Copied!'));
    });

    // User nickname search
    let userSearchTimer;
    document.getElementById('user-search-input').addEventListener('input', (e) => {
      clearTimeout(userSearchTimer);
      const q = e.target.value.trim();
      if (!q) { document.getElementById('user-search-results').innerHTML = ''; return; }
      userSearchTimer = setTimeout(() => searchAndRenderUsers(q), 300);
    });
  }

  async function searchAndRenderUsers(query) {
    const container = document.getElementById('user-search-results');
    const res = await API.searchUsers(query);
    if (res.error) { container.innerHTML = `<div class="history-empty">${res.error}</div>`; return; }
    if (!res.users || res.users.length === 0) { container.innerHTML = `<div class="history-empty">${I18n.t('notFound')}</div>`; return; }

    container.innerHTML = res.users.map(u => {
      const initial = u.nickname.charAt(0).toUpperCase();
      let actionHtml = '';
      if (u.status === 'friend') {
        actionHtml = `<span class="user-status friend">${I18n.t('statusFriend')}</span>`;
      } else if (u.status === 'pending_sent') {
        actionHtml = `<span class="user-status pending">${I18n.t('statusPendingSent')}</span>`;
      } else if (u.status === 'pending_received') {
        actionHtml = `<span class="user-status received">${I18n.t('statusPendingReceived')}</span>`;
      } else {
        actionHtml = `<button class="btn-add-user" data-uid="${u.id}">${I18n.t('btnAddFriend')}</button>`;
      }
      return `<div class="user-search-item"><div class="us-avatar">${initial}</div><span class="us-name">${escapeHtml(u.nickname)}</span>${actionHtml}</div>`;
    }).join('');

    container.querySelectorAll('.btn-add-user').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const res = await API.sendFriendRequestById(btn.dataset.uid);
        if (res.error) { showToast(res.error); btn.disabled = false; }
        else {
          showToast(I18n.t('friendRequestSent'));
          btn.replaceWith(Object.assign(document.createElement('span'), {
            className: 'user-status pending', textContent: I18n.t('statusPendingSent')
          }));
        }
      });
    });
  }

  async function loadAndRenderFriends() {
    showLoadingOverlay(I18n.t('loadingFriends'));
    await Store.loadFriends();
    hideLoadingOverlay();
    renderFriends();
  }

  function renderFriends() {
    renderFriendRequests();
    renderFriendList();
    renderFeed();
    const profile = Store.getProfile();
    if (profile) document.getElementById('my-friend-code').textContent = profile.friendCode;
  }

  function renderFriendRequests() {
    const container = document.getElementById('friend-requests-list');
    const requests = Store.getFriendRequests();
    if (requests.length === 0) { container.innerHTML = ''; document.getElementById('section-friend-requests').hidden = true; return; }
    document.getElementById('section-friend-requests').hidden = false;
    container.innerHTML = requests.map(r => {
      const initial = r.from_nickname.charAt(0).toUpperCase();
      return `
      <div class="fr-request-card">
        <div class="fr-request-avatar">${initial}</div>
        <div class="fr-request-info">
          <div class="fr-request-name">${escapeHtml(r.from_nickname)}</div>
          <div class="fr-request-actions">
            <button class="btn-accept" data-id="${r.id}">${I18n.t('btnAccept')}</button>
            <button class="btn-reject" data-id="${r.id}">${I18n.t('btnReject')}</button>
          </div>
        </div>
      </div>`;
    }).join('');
    container.querySelectorAll('.btn-accept').forEach(btn => {
      btn.addEventListener('click', async () => { await Store.acceptFriendRequest(btn.dataset.id); showToast(I18n.t('friendAdded')); renderFriends(); updateFriendBadge(); });
    });
    container.querySelectorAll('.btn-reject').forEach(btn => {
      btn.addEventListener('click', async () => { await Store.rejectFriendRequest(btn.dataset.id); renderFriends(); updateFriendBadge(); });
    });
  }

  function renderFriendList() {
    const container = document.getElementById('friend-list');
    const friends = Store.getFriends();
    document.getElementById('friend-count-label').textContent = friends.length ? `(${friends.length})` : '';
    if (friends.length === 0) { container.innerHTML = `<div class="history-empty">${I18n.t('noFriends')}</div>`; return; }
    container.innerHTML = friends.map(f => {
      const initial = f.nickname.charAt(0).toUpperCase();
      return `
      <div class="friend-item">
        <div class="fi-avatar">${initial}</div>
        <div class="fi-info">
          <div class="fi-name">${escapeHtml(f.nickname)}</div>
        </div>
        <button class="fi-remove" data-id="${f.id}">${I18n.t('removeFriendBtn') || '削除'}</button>
      </div>`;
    }).join('');
    container.querySelectorAll('.fi-remove').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm(I18n.t('removeFriendConfirm'))) return;
        await Store.removeFriend(btn.dataset.id); renderFriends();
      });
    });
  }

  function renderFeed() {
    const container = document.getElementById('feed-list');
    const feed = Store.getFeed();
    if (feed.length === 0) { container.innerHTML = `<div class="history-empty">${I18n.t('noFeed')}</div>`; return; }
    container.innerHTML = feed.map(item => renderFeedCard(item, 'friends')).join('');
    bindFeedActions(container);
  }

  // --- Exchange ---
  function bindExchange() {
    document.getElementById('btn-add-reward').addEventListener('click', async () => {
      const nameInput = document.getElementById('reward-name-input');
      const costInput = document.getElementById('reward-cost-input');
      const name = nameInput.value.trim();
      const cost = parseInt(costInput.value);
      if (!name || !cost || cost < 1) return;
      await Store.addReward(name, cost);
      nameInput.value = ''; costInput.value = '';
      renderExchange();
    });
  }

  function renderExchange() {
    document.getElementById('exchange-balance').textContent = Store.getBalance();
    const badgeList = document.getElementById('badge-list');
    badgeList.innerHTML = Store.getAllBadges().map(b => `
      <div class="badge-card ${b.unlocked ? '' : 'locked'}"><span class="badge-icon">${b.icon}</span><span class="badge-label">${b.label}</span><span class="badge-coins">${b.coins} ${I18n.t('coin')}</span></div>
    `).join('');

    const rewardList = document.getElementById('reward-list');
    const rewards = Store.getRewards();
    const balance = Store.getBalance();
    if (rewards.length === 0) {
      rewardList.innerHTML = `<div class="reward-empty">${I18n.t('noRewards')}</div>`;
    } else {
      rewardList.innerHTML = rewards.map(r => `
        <div class="reward-item"><span class="rw-label">${escapeHtml(r.label)}</span><span class="rw-cost">🪙 ${r.cost}</span><button class="rw-use" data-id="${r.id}" data-cost="${r.cost}" ${balance < r.cost ? 'disabled' : ''}>${I18n.t('btnExchange')}</button><button class="rw-del" data-id="${r.id}">×</button></div>
      `).join('');
      rewardList.querySelectorAll('.rw-use').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (confirm(`${btn.dataset.cost} ${I18n.t('coin')} - ${I18n.t('spendConfirm')}`)) {
            if (await Store.spendCoins(btn.dataset.id)) {
              showToast(I18n.t('exchanged'));
              if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
              renderExchange(); updateHeaderCoins();
            }
          }
        });
      });
      rewardList.querySelectorAll('.rw-del').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (confirm(I18n.t('deleteRewardConfirm'))) { await Store.deleteReward(btn.dataset.id); renderExchange(); }
        });
      });
    }
  }

  // --- Profile ---
  function renderProfile() {
    const profile = Store.getProfile();
    if (!profile) return;
    document.getElementById('profile-nickname').textContent = profile.nickname;
    document.getElementById('profile-friend-code').textContent = profile.friendCode;
    document.getElementById('profile-total-coins').textContent = profile.totalCoins;
    document.getElementById('profile-witness-bonus').textContent = profile.witnessBonus;
    document.getElementById('profile-friends-count').textContent = profile.friendCount;
    document.getElementById('profile-created').textContent = new Date(profile.createdAt).toLocaleDateString('ja-JP');

    const visSelect = document.getElementById('profile-visibility');
    visSelect.value = profile.feedVisibility;
    visSelect.onchange = async () => { await API.updateProfile({ feedVisibility: visSelect.value }); };

    const langSelect = document.getElementById('profile-lang');
    langSelect.value = I18n.getLang();

    // Exchange content (merged into profile)
    renderExchange();
  }

  // --- Settings ---
  function bindSettings() {
    document.getElementById('btn-export').addEventListener('click', () => {
      const data = Store.exportData();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `rehacoin_${new Date().toISOString().slice(0, 10)}.json`;
      a.click(); URL.revokeObjectURL(url);
    });
    document.getElementById('btn-logout').addEventListener('click', () => {
      if (confirm(I18n.t('logoutConfirm'))) API.logout();
    });
    document.getElementById('btn-delete-account').addEventListener('click', async () => {
      if (!confirm(I18n.t('deleteAccountConfirm'))) return;
      const res = await API.deleteAccount();
      if (res.ok) {
        showToast(I18n.t('deleteAccountDone'));
        setTimeout(() => API.logout(), 1000);
      }
    });
  }

  // --- Utilities ---
  function formatTime(timestamp) {
    const d = new Date(timestamp);
    const diffMin = Math.floor((Date.now() - d) / 60000);
    if (diffMin < 1) return I18n.t('justNow');
    if (diffMin < 60) return `${diffMin}${I18n.t('mAgo')}`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}${I18n.t('hAgo')}`;
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

  // --- Feed auto-refresh ---
  function startFeedRefresh() {
    stopFeedRefresh();
    feedRefreshTimer = setInterval(async () => {
      if (currentScreen !== 'screen-home' && currentScreen !== 'screen-friends') return;
      try {
        const feedRes = await API.getFeed();
        const oldFeed = Store.getFeed();
        const newFeed = feedRes.feed || [];
        // Update store's internal feed
        const oldSig = JSON.stringify(oldFeed.map(f => f.id + JSON.stringify(f.reactions || {}) + (f.myReaction || '')));
        const newSig = JSON.stringify(newFeed.map(f => f.id + JSON.stringify(f.reactions || {}) + (f.myReaction || '')));
        if (oldSig !== newSig) {
          Store._updateFeed(newFeed);
          if (currentScreen === 'screen-home') renderHomeFeed();
          else if (currentScreen === 'screen-friends') renderFeed();
        }
      } catch (e) {
        console.error('Feed refresh failed:', e);
      }
    }, 30000);
  }

  function stopFeedRefresh() {
    if (feedRefreshTimer) {
      clearInterval(feedRefreshTimer);
      feedRefreshTimer = null;
    }
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
