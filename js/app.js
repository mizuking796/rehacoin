// app.js — UI, routing, event handlers (API-backed, i18n)

function safeSetItem(k, v) { try { safeSetItem(k, v); } catch(e) { console.warn('localStorage write failed:', e); } }

const App = (() => {
  let currentScreen = 'screen-home';
  let currentCategoryCode = null;
  let searchDebounceTimer = null;
  let isMining = false;
  let feedRefreshTimer = null;


  // --- Category Icon Helper ---
  function getCategoryIcon(categoryCode, size = 16) {
    const cat = Data.getCategory(categoryCode);
    if (!cat) return '<span style="width:' + size + 'px;height:' + size + 'px;display:inline-block"></span>';
    const iconName = cat.lucideIcon || 'circle';
    const color = cat.color || 'var(--accent)';
    return '<span class="cat-lucide-icon" style="--cat-color:' + color + ';width:' + (size + 12) + 'px;height:' + (size + 12) + 'px"><i data-lucide="' + iconName + '" style="width:' + size + 'px;height:' + size + 'px;color:' + color + '"></i></span>';
  }

  function getCategoryIconFromAct(act, size = 16) {
    if (!act) return '';
    return getCategoryIcon(act.categoryCode || act.category_code, size);
  }


  // --- Lucide refresh (debounced) ---
  let _lucideTimer;
  function refreshLucideIcons() {
    clearTimeout(_lucideTimer);
    _lucideTimer = setTimeout(() => {
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }, 50);
  }

  // Auto-refresh Lucide icons on DOM changes
  const _iconObserver = new MutationObserver(() => refreshLucideIcons());
  document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('app-container');
    if (container) _iconObserver.observe(container, { childList: true, subtree: true });
  });
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
      hideLoadingOverlay();
      const ja = I18n.getLang() === 'ja';
      showToast(ja ? 'サーバーに接続できません。再読み込みしてください。' : 'Cannot connect to server. Please reload.');
      return;
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
    bindProfileTabs();
    bindFriends();
    bindLangToggle();
    updateLangToggleLabel();
    I18n.applyToDOM();
    _prevRankId = Store.getRank().id;
    applyTheme(getCurrentTheme());
    renderHome();
    updateHeaderCoins();
    updateHeaderNickname();
    updateFriendBadge();
    startFeedRefresh();
    checkLoginBonus();
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
    const homeLink = document.getElementById('header-home-link');
    if (homeLink) homeLink.addEventListener('click', () => showScreen('screen-home'));
  }


  // --- Profile Tabs ---
  function bindProfileTabs() {
    document.querySelectorAll('.profile-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.profile-tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.ptab).classList.add('active');
      });
    });
  }

  // --- Header ---
  let _prevRankId = null;

  function updateHeaderCoins(animate = false, fromEl = null) {
    const el = document.getElementById('header-coins');
    const newVal = Store.getTotalCoins();
    const oldVal = parseInt(el.dataset.val || '0') || 0;
    el.dataset.val = newVal;

    if (animate && oldVal !== newVal) {
      // Rolling number animation
      const duration = 600;
      const start = performance.now();
      function step(now) {
        const t = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
        const current = Math.round(oldVal + (newVal - oldVal) * eased);
        el.textContent = current + ' ' + I18n.t('coin');
        if (t < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);

      // Coin fly to header
      if (fromEl) {
        const fromRect = fromEl.getBoundingClientRect();
        const toRect = el.getBoundingClientRect();
        for (let i = 0; i < 5; i++) {
          const coin = document.createElement('div');
          coin.className = 'coin-fly';
          coin.innerHTML = '<img src="img/coin.svg" width="20" height="20">';
          coin.style.left = fromRect.left + fromRect.width / 2 + 'px';
          coin.style.top = fromRect.top + 'px';
          coin.style.setProperty('--tx', (toRect.left + toRect.width / 2 - fromRect.left - fromRect.width / 2) + 'px');
          coin.style.setProperty('--ty', (toRect.top - fromRect.top) + 'px');
          coin.style.animationDelay = (i * 80) + 'ms';
          document.body.appendChild(coin);
          coin.addEventListener('animationend', () => {
            coin.remove();
            // Pulse the counter
            if (i === 4) el.classList.add('coin-pulse');
            setTimeout(() => el.classList.remove('coin-pulse'), 300);
          });
          setTimeout(() => { if (coin.parentNode) coin.remove(); }, 2000);
        }
      }
    } else {
      el.textContent = newVal + ' ' + I18n.t('coin');
    }

    // Update streak fire
    updateStreakDisplay();
    // Check rank up
    checkRankUp();
  }

  function updateStreakDisplay() {
    let el = document.getElementById('streak-fire');
    const streak = Store.getStreak();
    if (streak === 0) { if (el) el.hidden = true; return; }
    if (!el) return;
    el.hidden = false;
    let colorClass = 'streak-low';
    if (streak >= 30) colorClass = 'streak-epic';
    else if (streak >= 7) colorClass = 'streak-high';
    else if (streak >= 3) colorClass = 'streak-mid';
    el.className = `streak-display ${colorClass}`;
    el.innerHTML = `<span class="streak-flame"><i data-lucide="flame" style="width:16px;height:16px"></i></span><span class="streak-num">${streak}</span>`;
  }

  function checkRankUp() {
    const rank = Store.getRank();
    if (_prevRankId && _prevRankId !== rank.id) {
      showRankUpOverlay(rank);
    }
    _prevRankId = rank.id;
  }

  function showRankUpOverlay(rank) {
    const overlay = document.createElement('div');
    overlay.className = 'rankup-overlay';
    const ja = I18n.getLang() === 'ja';
    overlay.innerHTML = `
      <div class="rankup-flash"></div>
      <div class="rankup-content">
        <div class="rankup-label">RANK UP!</div>
        <div class="rankup-icon" style="color:${rank.color}"><i data-lucide="${rank.icon}" style="width:48px;height:48px;color:${rank.iconColor || rank.color}"></i></div>
        <div class="rankup-name" style="color:${rank.color}">${ja ? rank.label : rank.labelEn}</div>
      </div>`;
    document.body.appendChild(overlay);
    // confetti if available
    if (window.confetti) {
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: [rank.color, '#FFD700', '#FFFFFF'] });
    }
    if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200]);
    setTimeout(() => { overlay.classList.add('rankup-fade'); }, 2500);
    setTimeout(() => overlay.remove(), 3200);
  }

  function _oldUpdateHeaderCoins() {
    document.getElementById('header-coins').textContent = Store.getTotalCoins() + ' ' + I18n.t('coin');
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
      ? `${names} からフレンド申請が${requests.length}件届いています`
      : `${requests.length} friend request${requests.length > 1 ? 's' : ''} from ${names}`;
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
    { type: 'like', emoji: '👍', lucide: 'thumbs-up', label: 'いいね！', labelEn: 'Like' },
    { type: 'cheer', emoji: '💪', lucide: 'biceps-flexed', label: '頑張ったね！', labelEn: 'Great job!' },
    { type: 'empathy', emoji: '🤝', lucide: 'handshake', label: 'わかるよ！', labelEn: 'I get you!' },
    { type: 'amazing', emoji: '👏', lucide: 'party-popper', label: 'すごい！', labelEn: 'Amazing!' },
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
    const items = feed.slice(0, 20);
    list.innerHTML = items.map(item => renderFeedCard(item, 'home')).join('');
    bindFeedActions(list);
  }

  function renderFeedCard(item, context) {
    const time = formatTime(item.timestamp);
    const initial = item.nickname.charAt(0).toUpperCase();
    const iconHtml = item.categoryCode ? getCategoryIcon(item.categoryCode, 16) : '<img src="img/coin.svg" width="16" height="16" class="inline-coin">';
    const actLabel = item.label ? `${iconHtml} ${escapeHtml(item.label)}` : I18n.t('feedActivityRecorded');

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
        return `<div class="rt-line">${escapeHtml(r.nickname)}</div>`;
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

    // Own posts: show reactions received but no reaction buttons
    let reactionBar = '';
    if (item.isOwn) {
      reactionBar = reactionSummaryHtml ? `<div class="reaction-bar">${reactionSummaryHtml}</div>` : '';
    } else {
      reactionBar = `
        <div class="reaction-bar" data-id="${item.id}">
          ${reactionSummaryHtml}
          <div class="reaction-buttons">
            <button class="${triggerClass}" data-id="${item.id}"><span class="rt-icon">${triggerIcon}</span>${triggerLabel}</button>
          </div>
          <div class="reaction-picker" hidden>
            ${REACTIONS.map(r => `<button class="reaction-option" data-id="${item.id}" data-type="${r.type}" title="${I18n.getLang() === 'ja' ? r.label : r.labelEn}"><i data-lucide="${r.lucide}" style="width:24px;height:24px"></i></button>`).join('')}
          </div>
        </div>`;
    }

    const cardClass = context === 'home' ? 'home-feed-card' : 'feed-item';
    const avatarClass = context === 'home' ? 'home-feed-avatar' : 'feed-avatar';
    const contentClass = context === 'home' ? 'home-feed-content' : 'feed-content';
    const ownClass = item.isOwn ? ' feed-own' : '';

    return `
    <div class="${cardClass}${ownClass}">
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
        return `<div class="rt-line">${escapeHtml(r.nickname)}</div>`;
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
      incrementDailyCheer();
      const rd = REACTIONS.find(r => r.type === type);
      if (navigator.vibrate) navigator.vibrate([30, 30, 50]);
      // floating emoji removed for clean UI
      showCoinBurst(trigger);

      const ja = I18n.getLang() === 'ja';
      if (res.witnessBonus) {
        showToast(ja
          ? `${rd.label}\n🪙 +1コインゲット！相手にも+1！`
          : `${rd.labelEn}\n🪙 +1 coin! +1 for them too!`);
      } else {
        showToast(ja
          ? `${rd.label}\n🪙 +1コインゲット！`
          : `${rd.labelEn}\n🪙 +1 coin earned!`);
      }
      updateHeaderCoins(true, trigger);
    }
  }

  function showCoinBurst(anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top;
    // Wave 1: big burst
    for (let i = 0; i < 12; i++) {
      const coin = document.createElement('div');
      coin.className = 'coin-burst';
      const sz = 18 + Math.floor(Math.random() * 16);
      coin.innerHTML = `<img src="img/coin.svg" width="${sz}" height="${sz}">`;
      coin.style.left = cx + 'px';
      coin.style.top = cy + 'px';
      const angle = (Math.PI * 2 * i / 12) + (Math.random() - 0.5) * 0.5;
      const dist = 40 + Math.random() * 80;
      coin.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
      coin.style.setProperty('--dy', Math.sin(angle) * dist - 40 + 'px');
      coin.style.animationDelay = (i * 30) + 'ms';
      document.body.appendChild(coin);
      coin.addEventListener('animationend', () => coin.remove());
      setTimeout(() => { if (coin.parentNode) coin.remove(); }, 2000);
    }
    // Wave 2: upward fountain
    setTimeout(() => {
      for (let i = 0; i < 6; i++) {
        const coin = document.createElement('div');
        coin.className = 'coin-burst coin-burst-slow';
        const sz = 14 + Math.floor(Math.random() * 10);
        coin.innerHTML = `<img src="img/coin.svg" width="${sz}" height="${sz}">`;
        coin.style.left = (cx + (Math.random() - 0.5) * 40) + 'px';
        coin.style.top = cy + 'px';
        coin.style.setProperty('--dx', (Math.random() - 0.5) * 60 + 'px');
        coin.style.setProperty('--dy', -(60 + Math.random() * 100) + 'px');
        coin.style.animationDelay = (i * 60) + 'ms';
        document.body.appendChild(coin);
        coin.addEventListener('animationend', () => coin.remove());
        setTimeout(() => { if (coin.parentNode) coin.remove(); }, 2500);
      }
    }, 150);
  }

  function showFloatingEmoji(emoji, anchorEl) {
    const el = document.createElement('div');
    el.className = 'floating-emoji';
    el.textContent = emoji;
    const rect = anchorEl.getBoundingClientRect();
    el.style.left = rect.left + rect.width / 2 + 'px';
    el.style.top = rect.top + 'px';
    document.body.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.remove(); }, 1500);
  }

  function renderCategoryGrid() {
    const grid = document.getElementById('category-grid');
    const categories = Data.getCategories();
    const monthlyCounts = Store.getMonthlyCounts();
    grid.innerHTML = categories.map(cat => {
      const count = monthlyCounts[cat.code] || 0;
      const badge = count > 0 ? `<span class="cat-badge">${count}</span>` : '';
      return `<div class="category-card" data-code="${cat.code}">${badge}<span class="cat-icon">${getCategoryIcon(cat.code, 24)}</span><span class="cat-label">${cat.label}</span></div>`;
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
        <span class="ri-icon">${getCategoryIcon(r.categoryCode, 18)}</span>
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
      <div class="favorite-chip" data-id="${act.id}"><span class="fav-icon">${getCategoryIconFromAct(act, 16)}</span><span class="fav-label">${escapeHtml(act.label)}</span></div>
    `).join('');
    list.querySelectorAll('.favorite-chip').forEach(chip => {
      chip.addEventListener('click', async () => {
        const act = Data.getActivity(chip.dataset.id);
        if (!act) return;
        const msg = I18n.getLang() === 'ja'
          ? `「${act.label}」を記録しますか？`
          : `Record "${act.label}"?`;
        if (await showConfirm(msg, '')) recordActivity(act);
      });
    });
  }

  // --- Category ---
  function openCategory(code) {
    currentCategoryCode = code;
    const cat = Data.getCategory(code);
    document.getElementById('category-title').innerHTML = getCategoryIcon(cat.code, 18) + ' ' + escapeHtml(cat.label); if (typeof lucide !== 'undefined') lucide.createIcons();
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
      return `<div class="activity-item" data-id="${act.id}"><span class="act-icon">${getCategoryIconFromAct(act, 18)}</span><span class="act-label">${escapeHtml(act.label)}</span>${countBadge}</div>`;
    }).join('');
    list.querySelectorAll('.activity-item').forEach(item => {
      item.addEventListener('click', async () => {
        const act = Data.getActivity(item.dataset.id);
        if (!act) return;
        const msg = I18n.getLang() === 'ja'
          ? `「${act.label}」を記録しますか？`
          : `Record "${act.label}"?`;
        if (await showConfirm(msg, '')) recordActivity(act, true);
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
      if (!record) { const ja3 = I18n.getLang() === 'ja'; showToast(ja3 ? '記録に失敗しました' : 'Failed to record'); return; }
      if (navigator.vibrate) navigator.vibrate(50);
      if (stayInCategory && currentCategoryCode) renderActivityList(currentCategoryCode);
      if (currentScreen === 'screen-home') renderHome();

      // Random bonus multiplier
      const rand = Math.random();
      let multiplier = 1;
      let bonusLabel = '';
      if (rand < 0.01) { multiplier = 5; bonusLabel = 'JACKPOT! x5'; }
      else if (rand < 0.11) { multiplier = 2; bonusLabel = 'BONUS! x2'; }

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

      // Bonus coins (visual only for now, backend always gives 1)
      if (multiplier > 1) {
        showBonusOverlay(bonusLabel, multiplier);
        if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200]);
      }

      const miningIcon = document.querySelector('.mining-icon');
      updateHeaderCoins(true, miningIcon);

      const ja = I18n.getLang() === 'ja';
      const msg = multiplier > 1
        ? `${I18n.t('blockConfirmed')}\n${bonusLabel}`
        : `${I18n.t('blockConfirmed')}`;
      showToast(msg);
      if (navigator.vibrate) navigator.vibrate([50, 50, 100]);
    } catch (e) {
      console.error('Record failed:', e);
      const ja2 = I18n.getLang() === 'ja'; showToast(ja2 ? 'エラーが発生しました' : 'An error occurred');
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
        safeSetItem('rehacoin_badges_shown', JSON.stringify(shown));
        setTimeout(() => showBadgeReveal(badge), 1500);
        break;
      }
    }
  }

  function showBadgeReveal(badge) {
    const ja = I18n.getLang() === 'ja';
    const el = document.createElement('div');
    el.className = 'badge-reveal-overlay';
    el.innerHTML = `
      <div class="badge-reveal-card">
        <div class="badge-reveal-label">${ja ? 'バッジ獲得！' : 'Badge Unlocked!'}</div>
        <div class="badge-reveal-icon"><i data-lucide="${badge.icon}" style="width:64px;height:64px;color:${badge.iconColor || '#FFD700'}"></i></div>
        <div class="badge-reveal-name">${ja ? badge.label : badge.labelEn}</div>
      </div>`;
    document.body.appendChild(el);
    if (window.confetti) confetti({ particleCount: 60, spread: 60, origin: { y: 0.45 } });
    if (navigator.vibrate) navigator.vibrate([50, 30, 100]);
    el.addEventListener('click', () => { el.classList.add('badge-reveal-closing'); setTimeout(() => el.remove(), 500); });
    setTimeout(() => { el.classList.add('badge-reveal-closing'); setTimeout(() => el.remove(), 500); }, 3500);
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

  function showBonusOverlay(label, multiplier) {
    const el = document.createElement('div');
    el.className = 'bonus-overlay';
    el.innerHTML = `<div class="bonus-text">${label}</div>`;
    document.body.appendChild(el);
    if (window.confetti) {
      const colors = multiplier >= 5
        ? ['#FFD700', '#FF6B00', '#FF0000']
        : ['#FFD700', '#3B93FF', '#FFFFFF'];
      confetti({ particleCount: 150, spread: 100, origin: { y: 0.5 }, colors });
    }
    setTimeout(() => { el.classList.add('bonus-fade'); }, 1500);
    setTimeout(() => el.remove(), 2200);
  }
  function startCoinRain() {
    const container = document.getElementById('coin-rain');
    container.innerHTML = '';
    const coinSizes = [24, 28, 32, 36, 20];
    _coinRainInterval = setInterval(() => {
      const coin = document.createElement('div');
      coin.className = 'coin-drop';
      const sz = coinSizes[Math.floor(Math.random() * coinSizes.length)];
      coin.innerHTML = `<img src="img/coin.svg" width="${sz}" height="${sz}">`;
      coin.style.left = Math.random() * 100 + '%';
      coin.style.animationDuration = (1.2 + Math.random() * 1.0) + 's';
      container.appendChild(coin);
      coin.addEventListener('animationend', () => coin.remove());
    }, 80);
  }
  function stopCoinRain() {
    clearInterval(_coinRainInterval);
  }

  // --- Custom Confirm Modal ---
  function showConfirm(text, icon, opts = {}) {
    return new Promise(resolve => {
      const modal = document.getElementById('confirm-modal');
      const textEl = document.getElementById('confirm-text');
      textEl.textContent = text;
      const iconEl = document.getElementById('confirm-icon');
      if (icon) {
        iconEl.innerHTML = '<i data-lucide="' + icon + '" style="width:36px;height:36px;color:var(--accent)"></i>';
      } else {
        iconEl.innerHTML = '<img src="img/coin.svg" width="36" height="36">';
      }
      const ok = document.getElementById('confirm-ok');
      const cancel = document.getElementById('confirm-cancel');
      ok.textContent = opts.okText || I18n.t('btnConfirmRecord');
      cancel.textContent = opts.cancelText || I18n.t('btnCancel');
      if (opts.danger) {
        ok.classList.add('confirm-danger');
      } else {
        ok.classList.remove('confirm-danger');
      }
      modal.hidden = false;
      refreshLucideIcons();
      function cleanup(result) {
        modal.hidden = true;
        ok.replaceWith(ok.cloneNode(true));
        cancel.replaceWith(cancel.cloneNode(true));
        resolve(result);
      }
      ok.addEventListener('click', () => cleanup(true), { once: true });
      cancel.addEventListener('click', () => cleanup(false), { once: true });
      // Close on backdrop click
      modal.addEventListener('click', (e) => { if (e.target === modal) cleanup(false); }, { once: true });
    });
  }

  // --- Login Bonus ---
  const LOGIN_BONUS_REWARDS = [1, 1, 2, 2, 3, 3, 10]; // Day 1-7

  function checkLoginBonus() {
    const key = 'rehacoin_login_bonus';
    const data = JSON.parse(localStorage.getItem(key) || '{}');
    const today = new Date().toDateString();
    if (data.lastDate === today) return; // Already claimed today

    // First login bonus
    if (!data.lastDate) {
      safeSetItem(key, JSON.stringify({ lastDate: today, streak: 1, firstLogin: true }));
      setTimeout(() => showFirstLoginBonus(), 800);
      return;
    }

    const yesterday = new Date(Date.now() - 86400000).toDateString();
    const isConsecutive = data.lastDate === yesterday;
    let streak = isConsecutive ? (data.streak || 0) : 0;
    if (streak >= 7) streak = 0; // Reset after 7 days

    // Comeback bonus: away for 7+ days
    if (!isConsecutive && data.lastDate) {
      const lastDate = new Date(data.lastDate);
      const daysSince = Math.floor((Date.now() - lastDate.getTime()) / 86400000);
      if (daysSince >= 7) {
        streak = 0;
        safeSetItem(key, JSON.stringify({ lastDate: today, streak: 1 }));
        setTimeout(() => showComebackBonus(daysSince), 800);
        return;
      }
    }

    streak++;
    const reward = LOGIN_BONUS_REWARDS[streak - 1] || 1;
    safeSetItem(key, JSON.stringify({ lastDate: today, streak }));
    setTimeout(() => showLoginBonusOverlay(streak, reward), 800);
  }

  function showFirstLoginBonus() {
    const ja = I18n.getLang() === 'ja';
    const reward = 10;
    const overlay = document.createElement('div');
    overlay.className = 'login-bonus-overlay';
    overlay.innerHTML = `
      <div class="login-bonus-card">
        <div class="lb-title">${ja ? 'ようこそ！初回ボーナス' : 'Welcome! First Login Bonus'}</div>
        <div class="lb-streak"></div>
        <div class="lb-reward-msg" style="font-size:1.5rem"><img src="img/coin.svg" width="32" height="32" class="inline-coin"> +${reward} ${I18n.t('coin')}</div>
        <button class="lb-claim btn-primary">${ja ? '受け取る' : 'Claim'}</button>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.lb-claim').addEventListener('click', async () => {
      overlay.classList.add('lb-closing');
      await API.addBonusCoins(reward, 'first_login', ja ? '初回ログインボーナス' : 'First Login Bonus');
      updateHeaderCoins(true, overlay.querySelector('.lb-claim'));
      if (window.confetti) confetti({ particleCount: 100, spread: 80, origin: { y: 0.5 } });
      if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200]);
      setTimeout(() => overlay.remove(), 600);
    });
  }

  function showComebackBonus(daysSince) {
    const ja = I18n.getLang() === 'ja';
    const reward = Math.min(20, daysSince); // 1 coin per day away, max 20
    const overlay = document.createElement('div');
    overlay.className = 'login-bonus-overlay';
    overlay.innerHTML = `
      <div class="login-bonus-card">
        <div class="lb-title">${ja ? 'おかえりなさい！' : 'Welcome Back!'}</div>
        <div class="lb-streak">${ja ? `${daysSince}日ぶり！` : `${daysSince} days away!`}</div>
        <div class="lb-reward-msg"><img src="img/coin.svg" width="24" height="24" class="inline-coin"> +${reward} ${I18n.t('coin')}</div>
        <button class="lb-claim btn-primary">${ja ? '受け取る' : 'Claim'}</button>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.lb-claim').addEventListener('click', async () => {
      overlay.classList.add('lb-closing');
      await API.addBonusCoins(reward, 'comeback', ja ? `${daysSince}日ぶりのカムバックボーナス` : `Comeback Bonus (${daysSince} days)`);
      updateHeaderCoins(true, overlay.querySelector('.lb-claim'));
      if (window.confetti) confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
      if (navigator.vibrate) navigator.vibrate([50, 30, 100]);
      setTimeout(() => overlay.remove(), 600);
    });
  }

  function showLoginBonusOverlay(day, reward) {
    const ja = I18n.getLang() === 'ja';
    const overlay = document.createElement('div');
    overlay.className = 'login-bonus-overlay';

    let daysHtml = '';
    for (let i = 1; i <= 7; i++) {
      const r = LOGIN_BONUS_REWARDS[i - 1];
      const cls = i < day ? 'lb-day claimed' : (i === day ? 'lb-day today' : 'lb-day');
      const icon = i === 7 ? '<i data-lucide="gift" style="width:20px;height:20px;color:#FFD700"></i>' : '<img src="img/coin.svg" width="20" height="20">';
      daysHtml += `<div class="${cls}"><div class="lb-day-num">${ja ? `${i}日目` : `Day ${i}`}</div><div class="lb-day-icon">${icon}</div><div class="lb-day-reward">+${r}</div></div>`;
    }

    const isDay7 = day === 7;
    const titleText = isDay7
      ? (ja ? '宝箱オープン！' : 'Treasure Chest!')
      : (ja ? 'ログインボーナス' : 'Login Bonus');

    overlay.innerHTML = `
      <div class="login-bonus-card ${isDay7 ? 'lb-treasure' : ''}">
        <div class="lb-title">${titleText}</div>
        <div class="lb-streak">${ja ? `${day}日目！` : `Day ${day}!`}</div>
        <div class="lb-days">${daysHtml}</div>
        ${isDay7 ? '<div class="lb-treasure-icon"><i data-lucide="gift" style="width:48px;height:48px;color:#FFD700"></i></div>' : ''}
        <div class="lb-reward-msg"><img src="img/coin.svg" width="24" height="24" class="inline-coin"> +${reward} ${I18n.t('coin')}</div>
        <button class="lb-claim btn-primary">${isDay7 ? (ja ? '宝箱を開ける！' : 'Open Chest!') : (ja ? '受け取る' : 'Claim')}</button>
      </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('.lb-claim').addEventListener('click', async () => {
      overlay.classList.add('lb-closing');
      const btn = overlay.querySelector('.lb-claim');
      await API.addBonusCoins(reward, 'login_bonus', ja ? `ログインボーナス${day}日目` : `Login Bonus Day ${day}`);
      updateHeaderCoins(true, btn);
      if (window.confetti) {
        const opts = isDay7
          ? { particleCount: 150, spread: 100, origin: { y: 0.5 }, colors: ['#FFD700', '#FF6B00', '#E040FB'] }
          : { particleCount: 60, spread: 60, origin: { y: 0.7 } };
        confetti(opts);
        if (isDay7) setTimeout(() => confetti({ particleCount: 80, spread: 80, origin: { x: 0.3, y: 0.6 } }), 300);
      }
      if (navigator.vibrate) navigator.vibrate(isDay7 ? [100, 50, 100, 50, 200, 50, 300] : [50, 30, 50]);
      setTimeout(() => overlay.remove(), 600);
    });
  }

  // --- Toast ---
  const COIN_ICON_SM = '<img src="img/coin.svg" width="16" height="16" class="inline-coin">';

  function showToast(text) {
    const toast = document.getElementById('toast');
    const toastText = document.getElementById('toast-text');
    // Replace 🪙 with gold coin icon
    const html = text.replace(/🪙/g, COIN_ICON_SM).replace(/\n/g, '<br>');
    toastText.innerHTML = html;
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
      const items = group.items.map(act => `<div class="activity-item" data-id="${act.id}"><span class="act-icon">${getCategoryIconFromAct(act, 18)}</span><span class="act-label">${escapeHtml(act.label)}</span></div>`).join('');
      return `<div class="search-group-title">${getCategoryIcon(group.category.code, 14)} ${escapeHtml(group.category.label)}</div>${items}`;
    }).join('');
    results.querySelectorAll('.activity-item').forEach(item => {
      item.addEventListener('click', async () => {
        const act = Data.getActivity(item.dataset.id);
        if (!act) return;
        const msg = I18n.getLang() === 'ja'
          ? `「${act.label}」を記録しますか？`
          : `Record "${act.label}"?`;
        if (await showConfirm(msg, '')) { recordActivity(act); document.getElementById('search-input').value = ''; results.hidden = true; }
      });
    });
  }

  // --- Free input ---
  function bindFreeInput() {
    const input = document.getElementById('free-input');
    const btn = document.getElementById('free-input-btn');
    input.addEventListener('input', () => { btn.disabled = !input.value.trim(); });
    btn.addEventListener('click', async () => {
      const label = input.value.trim();
      if (!label) return;
      const msg = I18n.getLang() === 'ja'
        ? `「${label}」を記録しますか？`
        : `Record "${label}"?`;
      if (!await showConfirm(msg, '')) return;
      recordActivity({ id: null, label, icon: '', categoryCode: 'free' });
      input.value = ''; btn.disabled = true;
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && input.value.trim()) btn.click(); });
  }

  // --- History ---
  function renderHistory() { renderStats(); renderHistoryList(); _coinHistoryOffset = 0; renderCoinHistory(); }

  function bindHistoryTabs() {
    document.querySelectorAll('.history-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.history-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('#screen-history .tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
        if (tab.dataset.tab === 'coin-history') renderCoinHistory();
      });
    });
  }

  function renderStats() {
    const container = document.getElementById('stats-summary');
    const total = Store.getTotalCoins();
    const today = Store.getTodayCount();
    const streak = Store.getStreak();
    const topCat = Store.getTopCategory();
    const rp = Store.getRankProgress();
    const ja = I18n.getLang() === 'ja';
    const rankLabel = ja ? rp.current.label : rp.current.labelEn;
    const nextLabel = rp.next ? (ja ? rp.next.label : rp.next.labelEn) : '';
    const progressPct = Math.round(rp.progress * 100);

    // 7-day activity chart
    const weekData = getLast7DaysCounts();
    const maxDay = Math.max(...weekData.map(d => d.count), 1);
    const weekChartHtml = weekData.map(d => {
      const pct = Math.round((d.count / maxDay) * 100);
      return `<div class="wc-col"><div class="wc-bar-wrap"><div class="wc-bar" style="height:${pct}%"></div></div><div class="wc-label">${d.label}</div><div class="wc-count">${d.count}</div></div>`;
    }).join('');

    // Category breakdown
    const monthlyCounts = Store.getMonthlyCounts();
    const catEntries = Object.entries(monthlyCounts).sort((a, b) => b[1] - a[1]);
    const maxCat = catEntries.length > 0 ? catEntries[0][1] : 1;
    const catChartHtml = catEntries.map(([code, count]) => {
      const cat = Data.getCategory(code);
      const pct = Math.round((count / maxCat) * 100);
      const catLabel = cat ? escapeHtml(cat.label) : (code === 'free' ? (I18n.getLang() === 'ja' ? 'じゆうきろく' : 'Free') : code);
      return `<div class="cc-row"><span class="cc-label">${catLabel}</span><div class="cc-bar-wrap"><div class="cc-bar" style="width:${pct}%"></div></div><span class="cc-count">${count}</span></div>`;
    }).join('');

    container.innerHTML = `
      <div class="stat-card stat-rank" style="border-top: 3px solid ${rp.current.color}">
        <div class="stat-value" style="color:${rp.current.color}"><i data-lucide="${rp.current.icon}" style="width:18px;height:18px;color:${rp.current.color};vertical-align:middle"></i> ${rankLabel}</div>
        ${rp.next ? `<div class="rank-progress-bar"><div class="rank-progress-fill" style="width:${progressPct}%;background:${rp.current.color}"></div></div><div class="rank-next-label">${nextLabel} ${ja ? 'まで' : 'to'} ${rp.next.minCoins - total} ${I18n.t('coin')}</div>` : '<div class="rank-next-label">MAX</div>'}
      </div>
      <div class="stat-card"><div class="stat-value">${total}</div><div class="stat-label">${I18n.t('totalCoins')}</div></div>
      <div class="stat-card"><div class="stat-value">${today}</div><div class="stat-label">${I18n.t('today')}</div></div>
      <div class="stat-card"><div class="stat-value"><span class="streak-flame-sm ${streak >= 7 ? 'streak-active' : ''}"><i data-lucide="flame" style="width:16px;height:16px"></i></span>${streak}${I18n.t('streakUnit')}</div><div class="stat-label">${I18n.t('streak')}</div></div>
      ${weekData.some(d => d.count > 0) ? `<div class="stat-chart-card"><div class="sc-title">${ja ? '過去7日間' : 'Last 7 Days'}</div><div class="week-chart">${weekChartHtml}</div></div>` : ''}
      ${catEntries.length > 0 ? `<div class="stat-chart-card"><div class="sc-title">${ja ? 'カテゴリ別（30日）' : 'Categories (30 days)'}</div>${catChartHtml}</div>` : ''}
    `;
  }

  function getLast7DaysCounts() {
    const records = Store.getRecords();
    const days = [];
    const dayLabels = I18n.getLang() === 'ja'
      ? ['日', '月', '火', '水', '木', '金', '土']
      : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const dayStart = d.getTime();
      const dayEnd = dayStart + 86400000;
      const count = records.filter(r => r.timestamp >= dayStart && r.timestamp < dayEnd).length;
      days.push({ label: dayLabels[d.getDay()], count });
    }
    return days;
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
        const witnessHtml = r.witnessed ? `<span class="hi-witnessed">${I18n.t('confirmed')}</span>` : '';
        return `<div class="history-item"><span class="hi-icon">${getCategoryIcon(r.categoryCode, 18)}</span><span class="hi-label">${escapeHtml(r.label)}</span>${witnessHtml}<span class="hi-time">${timeStr}</span><button class="hi-delete" data-id="${r.id}">×</button></div>`;
      }).join('');
      return `<div class="history-date-group"><div class="history-date">${group.date}</div>${items}</div>`;
    }).join('');
    container.querySelectorAll('.hi-delete').forEach(btn => {
      if (btn._bound) return;
      btn._bound = true;
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!await showConfirm(I18n.t('deleteRecordConfirm'), 'trash-2', { okText: I18n.getLang() === 'ja' ? '削除' : 'Delete', danger: true })) return;
        const res = await Store.deleteRecord(btn.dataset.id);
        if (res.error) { showToast(res.error); return; }
        const ja = I18n.getLang() === 'ja'; showToast(ja ? '削除しました' : 'Deleted');
        renderHistory(); updateHeaderCoins();
      });
    });
  }

  // --- Coin History ---
  let _coinHistoryOffset = 0;
  async function renderCoinHistory() {
    const container = document.getElementById('coin-history-list');
    const loadMoreBtn = document.getElementById('btn-load-more-history');
    if (!container) return;
    if (_coinHistoryOffset === 0) container.innerHTML = '<div class="history-empty">読み込み中...</div>';

    try {
      const res = await Store.getCoinHistory(50, _coinHistoryOffset);
      const items = res.history || [];
      const ja = I18n.getLang() === 'ja';

      if (items.length === 0 && _coinHistoryOffset === 0) {
        container.innerHTML = `<div class="history-empty">${ja ? 'コイン履歴がありません' : 'No coin history'}</div>`;
        loadMoreBtn.hidden = true;
        return;
      }

      const html = items.map(item => {
        const d = new Date(item.created_at);
        const dateStr = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
        let typeIcon, typeLabel, amountClass;
        switch (item.type) {
          case 'record': typeIcon = ''; typeLabel = item.label; amountClass = 'ch-plus'; break;
          case 'bonus': typeIcon = '<i data-lucide="gift" style="width:16px;height:16px;color:var(--accent)"></i>'; typeLabel = item.label || item.detail; amountClass = 'ch-plus'; break;
          case 'witness': typeIcon = '<i data-lucide="eye" style="width:16px;height:16px;color:#9C27B0"></i>'; typeLabel = ja ? `目撃ボーナス: ${item.label}` : `Witness: ${item.label}`; amountClass = 'ch-plus'; break;
          case 'spend': typeIcon = '<i data-lucide="shopping-cart" style="width:16px;height:16px;color:var(--danger)"></i>'; typeLabel = item.label; amountClass = 'ch-minus'; break;
          default: typeIcon = '<i data-lucide="help-circle" style="width:16px;height:16px;color:var(--text-light)"></i>'; typeLabel = item.label; amountClass = '';
        }
        const sign = item.amount > 0 ? '+' : '';
        return `<div class="ch-item">
          <span class="ch-icon">${typeIcon}</span>
          <span class="ch-label">${escapeHtml(typeLabel || '')}</span>
          <span class="ch-amount ${amountClass}">${sign}${item.amount}</span>
          <span class="ch-time">${dateStr}</span>
        </div>`;
      }).join('');

      if (_coinHistoryOffset === 0) container.innerHTML = html;
      else container.insertAdjacentHTML('beforeend', html);

      loadMoreBtn.hidden = items.length < 50;
      loadMoreBtn.onclick = async () => { loadMoreBtn.disabled = true; loadMoreBtn.textContent = '...'; _coinHistoryOffset += 50; await renderCoinHistory(); };
    } catch (e) {
      console.error('Coin history failed:', e);
      container.innerHTML = `<div class="history-empty">${ja ? 'エラーが発生しました' : 'Error loading history'}</div>`;
    }
  }

  // --- Friends ---
  function bindFriends() {
    // Friend code request
    document.getElementById('btn-send-friend-request').addEventListener('click', async () => {
      const input = document.getElementById('friend-code-input');
      const code = input.value.trim().toUpperCase();
      if (!code) return;
      const btn = document.getElementById('btn-send-friend-request');
      btn.disabled = true;
      const res = await Store.sendFriendRequest(code);
      btn.disabled = false;
      if (res.error) showToast(res.error);
      else { showToast(I18n.t('friendRequestSent')); input.value = ''; }
    });
    document.getElementById('friend-code-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('btn-send-friend-request').click();
    });

    // Copy friend code
    document.getElementById('btn-copy-friend-code').addEventListener('click', () => {
      const code = document.getElementById('my-friend-code').textContent;
      navigator.clipboard.writeText(code).then(() => showToast('Copied!')).catch(() => showToast('Copy failed'));
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
      btn.addEventListener('click', async () => { const res = await Store.acceptFriendRequest(btn.dataset.id); if (res.error) { showToast(res.error); return; } showToast(I18n.t('friendAdded')); renderFriends(); updateFriendBadge(); });
    });
    container.querySelectorAll('.btn-reject').forEach(btn => {
      btn.addEventListener('click', async () => { const res = await Store.rejectFriendRequest(btn.dataset.id); if (res.error) { showToast(res.error); return; } const ja = I18n.getLang() === 'ja'; showToast(ja ? '申請を拒否しました' : 'Request rejected'); renderFriends(); updateFriendBadge(); });
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
        if (!await showConfirm(I18n.t('removeFriendConfirm'), 'user-minus', { okText: I18n.getLang() === 'ja' ? '削除' : 'Remove', danger: true })) return;
        const res = await Store.removeFriend(btn.dataset.id); if (res.error) { showToast(res.error); return; } const ja = I18n.getLang() === 'ja'; showToast(ja ? 'フレンドを削除しました' : 'Friend removed'); renderFriends();
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
      const ja = I18n.getLang() === 'ja'; showToast(ja ? 'ご褒美を追加しました' : 'Reward added');
      renderExchange();
    });
  }

  function renderExchange() {
    document.getElementById('exchange-balance').textContent = Store.getBalance();
    const badgeList = document.getElementById('badge-list');
    const ja2 = I18n.getLang() === 'ja';
    badgeList.innerHTML = Store.getAllBadges().map(b => {
      let condLabel = '';
      if (b.coins) condLabel = `${b.coins} ${I18n.t('coin')}`;
      else if (b.streak) condLabel = ja2 ? `${b.streak}日連続` : `${b.streak} day streak`;
      else if (b.records) condLabel = ja2 ? `${b.records}回記録` : `${b.records} records`;
      else if (b.friends) condLabel = ja2 ? `${b.friends}人のフレンド` : `${b.friends} friends`;
      else if (b.witness) condLabel = ja2 ? `${b.witness}回応援` : `${b.witness} cheers`;
      return `<div class="badge-card ${b.unlocked ? '' : 'locked'}"><span class="badge-icon"><i data-lucide="${b.icon}" style="width:32px;height:32px;color:${b.iconColor || 'var(--accent)'}"></i></span><span class="badge-label">${ja2 ? b.label : b.labelEn}</span><span class="badge-coins">${condLabel}</span></div>`;
    }).join('');

    const rewardList = document.getElementById('reward-list');
    const rewards = Store.getRewards();
    const balance = Store.getBalance();
    if (rewards.length === 0) {
      rewardList.innerHTML = `<div class="reward-empty">${I18n.t('noRewards')}</div>`;
    } else {
      rewardList.innerHTML = rewards.map(r => `
        <div class="reward-item"><span class="rw-label">${escapeHtml(r.label)}</span><span class="rw-cost"><img src="img/coin.svg" width="14" height="14" class="inline-coin"> ${r.cost}</span><button class="rw-use" data-id="${r.id}" data-cost="${r.cost}" ${balance < r.cost ? 'disabled' : ''}>${I18n.t('btnExchange')}</button><button class="rw-del" data-id="${r.id}">×</button></div>
      `).join('');
      rewardList.querySelectorAll('.rw-use').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (await showConfirm(`${btn.dataset.cost} ${I18n.t('coin')} - ${I18n.t('spendConfirm')}`, 'gift', { okText: I18n.t('btnExchange') })) {
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
          if (await showConfirm(I18n.t('deleteRewardConfirm'), 'trash-2', { okText: I18n.getLang() === 'ja' ? '削除' : 'Delete', danger: true })) { const res = await Store.deleteReward(btn.dataset.id); if (res && res.error) { showToast(res.error); return; } showToast(I18n.getLang() === 'ja' ? '削除しました' : 'Deleted'); renderExchange(); }
        });
      });
    }
  }

  // --- Profile ---
  // --- Themes ---
  const THEMES = [
    { id: 'default', label: 'デフォルト', labelEn: 'Default', cost: 0, accent: '#1B74E4', bg: '#F0F2F5' },
    { id: 'sakura', label: '桜', labelEn: 'Sakura', cost: 30, accent: '#E91E63', bg: '#FFF0F5' },
    { id: 'ocean', label: '海', labelEn: 'Ocean', cost: 30, accent: '#0097A7', bg: '#E0F7FA' },
    { id: 'forest', label: '森', labelEn: 'Forest', cost: 30, accent: '#2E7D32', bg: '#E8F5E9' },
    { id: 'night', label: '夜', labelEn: 'Night', cost: 50, accent: '#7C4DFF', bg: '#EDE7F6' },
    { id: 'sunset', label: '夕焼け', labelEn: 'Sunset', cost: 50, accent: '#FF6D00', bg: '#FFF3E0' },
  ];

  function getOwnedThemes() {
    return JSON.parse(localStorage.getItem('rehacoin_themes') || '["default"]');
  }
  function setOwnedThemes(arr) {
    safeSetItem('rehacoin_themes', JSON.stringify(arr));
  }
  function getCurrentTheme() {
    return localStorage.getItem('rehacoin_current_theme') || 'default';
  }
  function applyTheme(id) {
    const theme = THEMES.find(t => t.id === id);
    if (!theme) return;
    safeSetItem('rehacoin_current_theme', id);
    document.documentElement.style.setProperty('--accent', theme.accent);
    document.documentElement.style.setProperty('--accent-dark', theme.accent);
    document.documentElement.style.setProperty('--bg', theme.bg);
    document.getElementById('app-header').style.background =
      `linear-gradient(135deg, ${theme.accent} 0%, ${adjustColor(theme.accent, 30)} 100%)`;
  }
  function adjustColor(hex, amount) {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, (num >> 16) + amount);
    const g = Math.min(255, ((num >> 8) & 0xFF) + amount);
    const b = Math.min(255, (num & 0xFF) + amount);
    return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
  }

  function renderProfile() {
    const profile = Store.getProfile();
    if (!profile) return;
    const rank = Store.getRank();
    const ja = I18n.getLang() === 'ja';

    document.getElementById('profile-nickname').textContent = profile.nickname;
    const avatarEl = document.getElementById('profile-avatar-circle');
    if (avatarEl) avatarEl.textContent = (profile.nickname || '?')[0].toUpperCase();
    document.getElementById('profile-friend-code').textContent = profile.friendCode;
    document.getElementById('profile-total-coins').textContent = profile.totalCoins;
    document.getElementById('profile-witness-bonus').textContent = profile.witnessBonus;
    document.getElementById('profile-friends-count').textContent = profile.friendCount;
    document.getElementById('profile-created').textContent = new Date(profile.createdAt).toLocaleDateString('ja-JP');

    // Rank badge on avatar
    const avatar = document.querySelector('#screen-profile .profile-avatar');
    if (avatar) {
      avatar.style.boxShadow = `0 0 0 3px ${rank.color}, 0 0 12px ${rank.color}40`;
      avatar.dataset.rank = rank.id;
    }
    // Rank title
    let rankEl = document.getElementById('profile-rank-title');
    if (rankEl) rankEl.innerHTML = `<span style="color:${rank.color}"><i data-lucide="${rank.icon}" style="width:16px;height:16px;vertical-align:middle;color:${rank.iconColor || rank.color}"></i> ${ja ? rank.label : rank.labelEn}</span>`;

    const visSelect = document.getElementById('profile-visibility');
    visSelect.value = profile.feedVisibility;
    visSelect.onchange = async () => { const res = await API.updateProfile({ feedVisibility: visSelect.value }); const ja = I18n.getLang() === 'ja'; if (res.error) showToast(ja ? '設定の保存に失敗しました' : 'Failed to save'); else showToast(ja ? '保存しました' : 'Saved'); };

    const langSelect = document.getElementById('profile-lang');
    langSelect.value = I18n.getLang();

    // Push notification toggle
    setupPushToggle();
    // Theme store
    renderThemeStore();
    // Daily missions
    renderDailyMissions();
    // Daily gacha
    renderGachaSection();
    // Streak freeze
    renderStreakFreeze();
    // Friend ranking
    renderFriendRanking();

    // Exchange content (merged into profile)
    renderExchange();
  }

  async function setupPushToggle() {
    const btn = document.getElementById('btn-toggle-push');
    const setting = document.getElementById('push-setting');
    if (!btn || !setting) return;

    // Hide if push not supported
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setting.style.display = 'none';
      return;
    }

    const ja = I18n.getLang() === 'ja';

    async function getSubscription() {
      const reg = await navigator.serviceWorker.ready;
      return reg.pushManager.getSubscription();
    }

    function updateBtn(subscribed) {
      btn.textContent = subscribed
        ? (ja ? '無効にする' : 'Disable')
        : (ja ? '有効にする' : 'Enable');
      btn.classList.toggle('btn-primary', !subscribed);
      btn.classList.toggle('btn-secondary', subscribed);
    }

    const existing = await getSubscription();
    updateBtn(!!existing);

    btn.onclick = async () => {
      btn.disabled = true;
      try {
        const sub = await getSubscription();
        if (sub) {
          // Unsubscribe
          await sub.unsubscribe();
          await API.unsubscribePush();
          updateBtn(false);
          showToast(ja ? 'プッシュ通知を無効にしました' : 'Push notifications disabled');
        } else {
          // Subscribe
          const vapidRes = await API.getVapidKey();
          if (!vapidRes.key) {
            showToast(ja ? 'サーバーエラー' : 'Server error');
            return;
          }
          const reg = await navigator.serviceWorker.ready;
          const newSub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidRes.key)
          });
          const subJson = newSub.toJSON();
          await API.subscribePush({
            endpoint: subJson.endpoint,
            keys: subJson.keys
          });
          updateBtn(true);
          showToast(ja ? 'プッシュ通知を有効にしました' : 'Push notifications enabled');
        }
      } catch (e) {
        console.error('Push toggle error:', e);
        if (e.name === 'NotAllowedError') {
          showToast(ja ? 'ブラウザの通知許可が必要です' : 'Browser notification permission required');
        } else {
          showToast(ja ? 'エラーが発生しました' : 'An error occurred');
        }
      } finally {
        btn.disabled = false;
      }
    };
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  }

  function renderThemeStore() {
    const container = document.getElementById('theme-store');
    if (!container) return;
    const owned = getOwnedThemes();
    const current = getCurrentTheme();
    const balance = Store.getBalance();
    const ja = I18n.getLang() === 'ja';

    container.innerHTML = THEMES.map(t => {
      const isOwned = owned.includes(t.id);
      const isCurrent = current === t.id;
      const canBuy = balance >= t.cost;
      let btnHtml;
      if (isCurrent) btnHtml = `<span class="theme-active">${ja ? '使用中' : 'Active'}</span>`;
      else if (isOwned) btnHtml = `<button class="theme-use-btn" data-id="${t.id}">${ja ? '使う' : 'Use'}</button>`;
      else btnHtml = `<button class="theme-buy-btn" data-id="${t.id}" ${canBuy ? '' : 'disabled'}><img src="img/coin.svg" width="12" height="12" class="inline-coin"> ${t.cost}</button>`;

      return `<div class="theme-card ${isCurrent ? 'theme-current' : ''}">
        <div class="theme-preview" style="background:${t.bg};border-top:3px solid ${t.accent}"></div>
        <div class="theme-name">${ja ? t.label : t.labelEn}</div>
        ${btnHtml}
      </div>`;
    }).join('');

    container.querySelectorAll('.theme-use-btn').forEach(btn => {
      btn.addEventListener('click', () => { applyTheme(btn.dataset.id); renderThemeStore(); });
    });
    container.querySelectorAll('.theme-buy-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const theme = THEMES.find(t => t.id === btn.dataset.id);
        const ja = I18n.getLang() === 'ja';
        if (await showConfirm(ja ? `「${theme.label}」テーマを${theme.cost}コインで購入？` : `Buy "${theme.labelEn}" for ${theme.cost} coins?`, '')) {
          const res = await API.spendCoinsGeneric(theme.cost, ja ? `テーマ: ${theme.label}` : `Theme: ${theme.labelEn}`);
          if (!res.ok) { showToast(res.error || 'Error'); return; }
          const owned = getOwnedThemes();
          owned.push(theme.id);
          setOwnedThemes(owned);
          applyTheme(theme.id);
          showToast(ja ? `${theme.label}テーマ獲得！` : `${theme.labelEn} theme unlocked!`);
          if (window.confetti) confetti({ particleCount: 40, spread: 50 });
          renderThemeStore();
          updateHeaderCoins();
        }
      });
    });
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
      showConfirm(I18n.t('logoutConfirm'), 'log-out', { okText: I18n.t('logout'), danger: true }).then(ok => { if (ok) API.logout(); });
    });
    document.getElementById('btn-delete-account').addEventListener('click', async () => {
      if (!await showConfirm(I18n.t('deleteAccountConfirm'), 'alert-triangle', { okText: I18n.t('deleteAccount'), danger: true })) return;
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
  window.addEventListener('beforeunload', stopFeedRefresh);

  // --- Daily Missions ---
  const MISSION_POOL = [
    { id: 'm_record1', label: '1回記録する', labelEn: 'Record 1 activity', check: () => Store.getTodayCount() >= 1, reward: 1 },
    { id: 'm_record3', label: '3回記録する', labelEn: 'Record 3 activities', check: () => Store.getTodayCount() >= 3, reward: 3 },
    { id: 'm_record5', label: '5回記録する', labelEn: 'Record 5 activities', check: () => Store.getTodayCount() >= 5, reward: 5 },
    { id: 'm_cheer1', label: '1人を応援する', labelEn: 'Cheer 1 friend', check: () => getDailyCheerCount() >= 1, reward: 2 },
    { id: 'm_cheer3', label: '3人を応援する', labelEn: 'Cheer 3 friends', check: () => getDailyCheerCount() >= 3, reward: 4 },
    { id: 'm_streak', label: '連続記録を維持する', labelEn: 'Keep your streak', check: () => Store.getStreak() >= 1, reward: 2 },
  ];

  function getDailyCheerCount() {
    return parseInt(localStorage.getItem('rehacoin_daily_cheers_' + getTodayKey()) || '0');
  }
  function incrementDailyCheer() {
    const key = 'rehacoin_daily_cheers_' + getTodayKey();
    safeSetItem(key, (parseInt(localStorage.getItem(key) || '0') + 1).toString());
  }
  function getTodayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  function getDailyMissions() {
    const key = 'rehacoin_daily_missions';
    const data = JSON.parse(localStorage.getItem(key) || '{}');
    const today = getTodayKey();
    if (data.date === today) return data;
    // Generate 3 random missions for today
    const shuffled = MISSION_POOL.slice().sort(() => Math.random() - 0.5);
    const missions = shuffled.slice(0, 3).map(m => ({ ...m, claimed: false }));
    const newData = { date: today, missions };
    safeSetItem(key, JSON.stringify(newData));
    return newData;
  }

  function renderDailyMissions() {
    const container = document.getElementById('daily-missions');
    if (!container) return;
    const data = getDailyMissions();
    const ja = I18n.getLang() === 'ja';
    container.innerHTML = data.missions.map((m, i) => {
      const done = m.check();
      const claimed = m.claimed;
      let btnHtml;
      if (claimed) btnHtml = `<span class="mission-done">${ja ? '受取済' : 'Claimed'}</span>`;
      else if (done) btnHtml = `<button class="mission-claim-btn" data-idx="${i}"><img src="img/coin.svg" width="12" height="12" class="inline-coin"> +${m.reward}</button>`;
      else btnHtml = `<span class="mission-pending">${ja ? '未達成' : 'In Progress'}</span>`;
      return `<div class="mission-item ${claimed ? 'claimed' : done ? 'ready' : ''}">
        <span class="mission-check">${claimed ? '<i data-lucide="check-circle-2" style="width:18px;height:18px;color:var(--success)"></i>' : done ? '<i data-lucide="circle-check" style="width:18px;height:18px;color:var(--success)"></i>' : '<i data-lucide="circle" style="width:18px;height:18px;color:var(--text-light)"></i>'}</span>
        <span class="mission-label">${ja ? m.label : m.labelEn}</span>
        ${btnHtml}
      </div>`;
    }).join('');

    // Hide section if empty
    const missionSection = container.closest('.section');
    if (missionSection && data.missions.length === 0) missionSection.hidden = true;
    else if (missionSection) missionSection.hidden = false;
    container.querySelectorAll('.mission-claim-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const idx = parseInt(btn.dataset.idx);
        const data = getDailyMissions();
        const mission = data.missions[idx];
        data.missions[idx].claimed = true;
        safeSetItem('rehacoin_daily_missions', JSON.stringify(data));
        await API.addBonusCoins(mission.reward, 'mission', ja ? mission.label : mission.labelEn);
        showToast(ja ? `ミッション達成！ +${mission.reward}コイン` : `Mission complete! +${mission.reward} coins`);
        if (window.confetti) confetti({ particleCount: 30, spread: 40 });
        updateHeaderCoins(true);
        renderDailyMissions();
      });
    });
  }

  // --- Daily Gacha ---
  const GACHA_ITEMS = [
    // Common (60%)
    { rarity: 'common', icon: 'pill', label: 'ビタミン剤', labelEn: 'Vitamin', coins: 1 },
    { rarity: 'common', icon: 'bandage', label: 'ばんそうこう', labelEn: 'Bandage', coins: 1 },
    { rarity: 'common', icon: 'droplets', label: 'ハンドクリーム', labelEn: 'Hand Cream', coins: 1 },
    { rarity: 'common', icon: 'snowflake', label: 'アイスパック', labelEn: 'Ice Pack', coins: 1 },
    // Uncommon (25%)
    { rarity: 'uncommon', icon: 'ribbon', label: '応援リボン', labelEn: 'Cheer Ribbon', coins: 3 },
    { rarity: 'uncommon', icon: 'cup-soda', label: 'エナジードリンク', labelEn: 'Energy Drink', coins: 3 },
    { rarity: 'uncommon', icon: 'sparkles', label: 'スターチャーム', labelEn: 'Star Charm', coins: 3 },
    // Rare (12%)
    { rarity: 'rare', icon: 'gem', label: 'クリスタル', labelEn: 'Crystal', coins: 5 },
    { rarity: 'rare', icon: 'medal', label: 'ゴールドメダル', labelEn: 'Gold Medal', coins: 5 },
    // Legendary (3%)
    { rarity: 'legendary', icon: 'crown', label: '黄金の王冠', labelEn: 'Golden Crown', coins: 10 },
  ];
  const GACHA_RARITY_COLORS = {
    common: '#9E9E9E', uncommon: '#4CAF50', rare: '#2196F3', legendary: '#FFD700'
  };

  function canDoGacha() {
    const last = localStorage.getItem('rehacoin_gacha_date');
    return last !== getTodayKey();
  }

  async function doGacha() {
    const r = Math.random();
    let pool;
    if (r < 0.03) pool = GACHA_ITEMS.filter(g => g.rarity === 'legendary');
    else if (r < 0.15) pool = GACHA_ITEMS.filter(g => g.rarity === 'rare');
    else if (r < 0.40) pool = GACHA_ITEMS.filter(g => g.rarity === 'uncommon');
    else pool = GACHA_ITEMS.filter(g => g.rarity === 'common');
    const item = pool[Math.floor(Math.random() * pool.length)];
    safeSetItem('rehacoin_gacha_date', getTodayKey());
    // Save to collection
    const collection = JSON.parse(localStorage.getItem('rehacoin_gacha_collection') || '[]');
    collection.push({ ...item, date: Date.now() });
    safeSetItem('rehacoin_gacha_collection', JSON.stringify(collection));
    // Add bonus coins via API
    const ja = I18n.getLang() === 'ja';
    await API.addBonusCoins(item.coins, 'gacha', ja ? `ガチャ: ${item.label}` : `Gacha: ${item.labelEn}`);
    return item;
  }

  function showGachaOverlay(item) {
    const ja = I18n.getLang() === 'ja';
    const color = GACHA_RARITY_COLORS[item.rarity];
    const rarityLabel = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', legendary: 'Legendary' };
    const el = document.createElement('div');
    el.className = 'gacha-overlay';
    el.innerHTML = `
      <div class="gacha-card" style="--gacha-color: ${color}">
        <div class="gacha-rarity">${rarityLabel[item.rarity]}</div>
        <div class="gacha-icon"><i data-lucide="${item.icon}" style="width:56px;height:56px;color:${color}"></i></div>
        <div class="gacha-name">${ja ? item.label : item.labelEn}</div>
        <div class="gacha-reward"><img src="img/coin.svg" width="16" height="16" class="inline-coin"> +${item.coins}</div>
        <button class="btn-primary gacha-close">${ja ? '閉じる' : 'Close'}</button>
      </div>`;
    document.body.appendChild(el);
    if (item.rarity === 'legendary') {
      if (window.confetti) confetti({ particleCount: 200, spread: 120, origin: { y: 0.4 }, colors: ['#FFD700', '#FF6B00', '#FF0000'] });
      if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200, 50, 300]);
    } else if (item.rarity === 'rare') {
      if (window.confetti) confetti({ particleCount: 80, spread: 70, colors: ['#2196F3', '#64B5F6'] });
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    } else {
      if (navigator.vibrate) navigator.vibrate(50);
    }
    el.querySelector('.gacha-close').addEventListener('click', () => {
      el.classList.add('gacha-closing');
      setTimeout(() => el.remove(), 400);
    });
  }

  function renderGachaSection() {
    const container = document.getElementById('gacha-section');
    if (!container) return;
    const ja = I18n.getLang() === 'ja';
    const available = canDoGacha();
    container.innerHTML = `
      <button id="btn-gacha" class="gacha-btn ${available ? '' : 'disabled'}" ${available ? '' : 'disabled'}>
        ${available ? (ja ? 'ガチャを回す（1日1回）' : 'Daily Gacha (1/day)') : (ja ? 'また明日！' : 'Come back tomorrow!')}
      </button>`;
    if (available) {
      container.querySelector('#btn-gacha').addEventListener('click', async (e) => {
        e.target.disabled = true;
        e.target.textContent = '...';
        const item = await doGacha();
        showGachaOverlay(item);
        renderGachaSection();
        updateHeaderCoins(true);
      });
    }
  }

  // --- Streak Freeze ---
  const STREAK_FREEZE_COST = 10;

  function getStreakFreezeCount() {
    return parseInt(localStorage.getItem('rehacoin_streak_freezes') || '0');
  }

  function renderStreakFreeze() {
    const container = document.getElementById('streak-freeze-section');
    if (!container) return;
    const ja = I18n.getLang() === 'ja';
    const freezes = getStreakFreezeCount();
    const balance = Store.getBalance();
    const canBuy = balance >= STREAK_FREEZE_COST;
    container.innerHTML = `
      <div class="sf-info">
        <span class="sf-icon"><i data-lucide="snowflake" style="width:28px;height:28px;color:#00BCD4"></i></span>
        <div class="sf-detail">
          <div class="sf-label">${ja ? 'ストリークフリーズ' : 'Streak Freeze'}</div>
          <div class="sf-desc">${ja ? '1日休んでも連続記録が途切れない' : 'Protect your streak for 1 missed day'}</div>
        </div>
        <span class="sf-count">${ja ? `${freezes}枚` : `${freezes}x`}</span>
      </div>
      <button id="btn-buy-freeze" class="sf-buy-btn" ${canBuy ? '' : 'disabled'}>
        <img src="img/coin.svg" width="14" height="14" class="inline-coin"> ${STREAK_FREEZE_COST} ${ja ? 'で購入' : 'to buy'}
      </button>`;
    container.querySelector('#btn-buy-freeze')?.addEventListener('click', async () => {
      if (!canBuy) return;
      const res = await API.spendCoinsGeneric(STREAK_FREEZE_COST, ja ? 'ストリークフリーズ' : 'Streak Freeze');
      if (res.ok) {
        safeSetItem('rehacoin_streak_freezes', (freezes + 1).toString());
        showToast(ja ? 'ストリークフリーズ獲得！' : 'Streak Freeze acquired!');
        if (navigator.vibrate) navigator.vibrate(50);
        renderStreakFreeze();
        updateHeaderCoins();
      } else {
        showToast(res.error || 'Error');
      }
    });
  }

  // --- Friend Ranking ---
  function renderFriendRanking() {
    const container = document.getElementById('friend-ranking');
    if (!container) return;
    const ja = I18n.getLang() === 'ja';
    const friends = Store.getFriends();
    const profile = Store.getProfile();
    if (!profile || friends.length === 0) {
      container.innerHTML = `<div class="history-empty">${ja ? 'フレンドを追加するとランキングが表示されます' : 'Add friends to see ranking'}</div>`;
      return;
    }
    // Build ranking: self + friends by totalCoins
    const entries = [
      { nickname: profile.nickname, totalCoins: profile.totalCoins, isMe: true },
      ...friends.map(f => ({ nickname: f.nickname, totalCoins: f.totalCoins || 0, isMe: false }))
    ].sort((a, b) => b.totalCoins - a.totalCoins);

    container.innerHTML = entries.map((e, i) => {
      const medal = i === 0 ? '<i data-lucide="medal" style="width:18px;height:18px;color:#FFD700"></i>' : i === 1 ? '<i data-lucide="medal" style="width:18px;height:18px;color:#C0C0C0"></i>' : i === 2 ? '<i data-lucide="medal" style="width:18px;height:18px;color:#CD7F32"></i>' : `${i + 1}`;
      return `<div class="ranking-item ${e.isMe ? 'ranking-me' : ''}">
        <span class="ranking-pos">${medal}</span>
        <span class="ranking-name">${escapeHtml(e.nickname)}</span>
        <span class="ranking-coins"><img src="img/coin.svg" width="14" height="14" class="inline-coin"> ${e.totalCoins}</span>
      </div>`;
    }).join('');
    const rankSection = container.closest('.section');
    if (rankSection) rankSection.hidden = false;
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
