// app.js — UI, routing, event handlers (API-backed, i18n)

function safeSetItem(k, v) { try { localStorage.setItem(k, v); } catch(e) { console.warn('localStorage write failed:', e); } }

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


  // --- Lucide refresh (debounced, batched) ---
  let _lucideTimer;
  function refreshLucideIcons() {
    clearTimeout(_lucideTimer);
    _lucideTimer = setTimeout(() => {
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }, 150);
  }

  // MutationObserver removed — manual refreshLucideIcons() calls only
  // (Observer was firing on every DOM change, causing heavy re-scans)
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
    // History tabs removed — stats + coin history shown inline
    bindExchange();
    // Profile tabs removed — single-scroll layout
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
    refreshLucideIcons();
    bindHelpButtons();
    startFeedRefresh();
    checkLoginBonus();
  }

  // --- Help buttons (auto-inject "?" next to section titles with data-help) ---
  function bindHelpButtons() {
    document.querySelectorAll('[data-help]').forEach(el => {
      if (el.querySelector('.help-btn')) return;
      const btn = document.createElement('button');
      btn.className = 'help-btn';
      btn.textContent = '?';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const title = el.textContent.replace('?', '').trim();
        showHelpModal(title, el.getAttribute('data-help'));
      });
      el.appendChild(btn);
    });
  }

  function showHelpModal(title, text) {
    const overlay = document.createElement('div');
    overlay.className = 'help-overlay';
    overlay.innerHTML = `
      <div class="help-card">
        <div class="help-header"><i data-lucide="help-circle" style="width:22px;height:22px;color:var(--accent)"></i> ${escapeHtml(title)}</div>
        <div class="help-body">${escapeHtml(text).replace(/\n/g, '<br>')}</div>
        <button class="help-close btn-primary">わかった！</button>
      </div>`;
    overlay.querySelector('.help-close').addEventListener('click', () => {
      overlay.classList.add('help-closing');
      setTimeout(() => overlay.remove(), 200);
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.add('help-closing');
        setTimeout(() => overlay.remove(), 200);
      }
    });
    document.body.appendChild(overlay);
    refreshLucideIcons();
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
    refreshLucideIcons();
  }

  function bindNav() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => showScreen(btn.dataset.screen));
    });
    const homeLink = document.getElementById('header-home-link');
    if (homeLink) homeLink.addEventListener('click', () => showScreen('screen-home'));
  }


  // Profile tabs removed — single-scroll layout

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
    { type: 'cheer', emoji: '💪', lucide: 'dumbbell', label: '頑張ったね！', labelEn: 'Great job!' },
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

    // Own posts: show reactions received + three-dot menu
    const ja = I18n.getLang() === 'ja';
    let reactionBar = '';
    let ownMenuHtml = '';
    if (item.isOwn) {
      ownMenuHtml = `<button class="feed-more-btn" data-id="${item.id}" data-label="${escapeHtml(item.label || '')}"><i data-lucide="more-horizontal" style="width:18px;height:18px"></i></button><div class="feed-more-menu" hidden><button class="feed-edit-btn" data-id="${item.id}" data-label="${escapeHtml(item.label || '')}"><i data-lucide="pencil" style="width:14px;height:14px"></i> ${ja ? '編集' : 'Edit'}</button><button class="feed-delete-btn" data-id="${item.id}"><i data-lucide="trash-2" style="width:14px;height:14px"></i> ${ja ? '削除' : 'Delete'}</button></div>`;
      reactionBar = `<div class="reaction-bar">${reactionSummaryHtml}</div>`;
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
        <div class="${context === 'home' ? 'home-feed-header' : 'feed-header'}"><span class="${context === 'home' ? 'home-feed-name' : 'feed-name'}">${escapeHtml(item.nickname)}</span><span class="${context === 'home' ? 'home-feed-time' : 'feed-time'}">${time}</span>${ownMenuHtml}</div>
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

    // Three-dot menu toggle
    container.querySelectorAll('.feed-more-btn').forEach(btn => {
      if (btn._bound) return;
      btn._bound = true;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const menu = btn.nextElementSibling;
        const wasHidden = menu.hidden;
        // Close all other menus
        container.querySelectorAll('.feed-more-menu').forEach(m => m.hidden = true);
        menu.hidden = !wasHidden;
        if (!wasHidden) return;
        // Close on outside click
        const closeMenu = () => { menu.hidden = true; document.removeEventListener('click', closeMenu); };
        setTimeout(() => document.addEventListener('click', closeMenu, { once: true }), 0);
      });
    });

    // Own post actions: delete & edit
    container.querySelectorAll('.feed-delete-btn').forEach(btn => {
      if (btn._bound) return;
      btn._bound = true;
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        btn.closest('.feed-more-menu')?.setAttribute('hidden', '');
        const ja = I18n.getLang() === 'ja';
        if (!await showConfirm(ja ? 'このきろくをけしますか？' : 'Delete this record?', 'trash-2', { okText: ja ? '削除' : 'Delete', danger: true })) return;
        const res = await Store.deleteRecord(btn.dataset.id);
        if (res.error) { showToast(res.error); return; }
        showToast(ja ? '削除しました' : 'Deleted');
        renderHome(); updateHeaderCoins();
      });
    });

    container.querySelectorAll('.feed-edit-btn').forEach(btn => {
      if (btn._bound) return;
      btn._bound = true;
      btn.addEventListener('click', async () => {
        const ja = I18n.getLang() === 'ja';
        const currentLabel = btn.dataset.label;
        const newLabel = await showPrompt(ja ? '活動名を編集' : 'Edit activity name', currentLabel, { icon: 'pencil' });
        if (!newLabel || newLabel === currentLabel) return;
        const res = await Store.updateRecord(btn.dataset.id, newLabel);
        if (res.error) { showToast(res.error); return; }
        showToast(ja ? '更新しました' : 'Updated');
        renderHome();
      });
    });
  }

  let _reactionLock = new Set();
  async function sendReaction(recordId, type, bar) {
    if (_reactionLock.has(recordId)) return;
    _reactionLock.add(recordId);
    const trigger = bar.querySelector('.reaction-trigger');
    const item = Store.getFeed().find(f => f.id === recordId);
    if (!item) { _reactionLock.delete(recordId); return; }

    // --- Optimistic UI: update immediately before API call ---
    const prevMyReaction = item.myReaction;
    const prevReactions = JSON.parse(JSON.stringify(item.reactions || {}));
    const prevReactors = item.reactors ? [...item.reactors] : [];
    const isToggleOff = (prevMyReaction === type);
    const myNickname = Store.getProfile()?.nickname || 'You';

    // Predict new state
    if (isToggleOff) {
      item.reactions[type] = Math.max(0, (item.reactions[type] || 0) - 1);
      item.myReaction = null;
      item.reactors = (item.reactors || []).filter(r => r.nickname !== myNickname);
    } else {
      if (!item.reactions) item.reactions = {};
      if (prevMyReaction && prevMyReaction !== type) {
        item.reactions[prevMyReaction] = Math.max(0, (item.reactions[prevMyReaction] || 0) - 1);
      }
      item.reactions[type] = (item.reactions[type] || 0) + (prevMyReaction === type ? 0 : 1);
      item.myReaction = type;
      if (!item.reactors) item.reactors = [];
      item.reactors = item.reactors.filter(r => r.nickname !== myNickname);
      item.reactors.unshift({ nickname: myNickname, type });
    }

    // Optimistic coin update
    const coinDelta = isToggleOff ? -1 : (prevMyReaction ? 0 : 1);
    if (coinDelta !== 0) Store.adjustCoins(coinDelta);

    // Instant UI update
    updateReactionUI(bar, item, trigger);
    if (!isToggleOff) {
      if (navigator.vibrate) navigator.vibrate([30, 30, 50]);
      showCoinBurst(trigger);
    }
    updateHeaderCoins(!isToggleOff, isToggleOff ? null : trigger);

    // --- API call in background ---
    const res = await Store.cheerRecord(recordId, type);
    _reactionLock.delete(recordId);

    if (!res.ok) {
      // Rollback on failure
      if (coinDelta !== 0) Store.adjustCoins(-coinDelta);
      item.myReaction = prevMyReaction;
      item.reactions = prevReactions;
      item.reactors = prevReactors;
      updateReactionUI(bar, item, trigger);
      updateHeaderCoins();
      return;
    }

    // Show toast after API confirms
    if (res.reacted) {
      incrementDailyCheer();
      const rd = REACTIONS.find(r => r.type === type);
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
    }
    // Sync final state from store (API may have corrected counts)
    updateHeaderCoins();
  }

  function updateReactionUI(bar, item, trigger) {
    // Update trigger button
    if (item.myReaction) {
      const rd = REACTIONS.find(r => r.type === item.myReaction);
      trigger.className = `reaction-trigger reacted-${item.myReaction}`;
      trigger.innerHTML = `<span class="rt-icon">${REACTION_SVG[item.myReaction]}</span>${I18n.getLang() === 'ja' ? rd.label : rd.labelEn}`;
    } else {
      trigger.className = 'reaction-trigger';
      trigger.innerHTML = `<span class="rt-icon">${REACTION_SVG.like_outline}</span>${I18n.getLang() === 'ja' ? 'いいね！' : 'Like'}`;
    }

    // Update summary
    const reactions = item.reactions || {};
    const total = Object.values(reactions).reduce((a, b) => a + b, 0);
    let summaryEl = bar.querySelector('.reaction-summary');
    if (total > 0) {
      const badges = REACTIONS.filter(r => reactions[r.type] > 0)
        .map(r => `<span class="reaction-icon-badge ri-${r.type}">${r.emoji}</span>`).join('');
      const reactors = item.reactors || [];
      const tooltipItems = reactors.map(r => `<div class="rt-line">${escapeHtml(r.nickname)}</div>`).join('');
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

  function showPrompt(title, defaultValue, opts = {}) {
    return new Promise(resolve => {
      const modal = document.getElementById('confirm-modal');
      const textEl = document.getElementById('confirm-text');
      const iconEl = document.getElementById('confirm-icon');
      iconEl.innerHTML = opts.icon ? '<i data-lucide="' + opts.icon + '" style="width:36px;height:36px;color:var(--accent)"></i>' : '';
      textEl.innerHTML = '';
      const label = document.createElement('div');
      label.textContent = title;
      label.style.cssText = 'margin-bottom:8px;font-weight:600;';
      const input = document.createElement('input');
      input.type = 'text';
      input.value = defaultValue || '';
      input.style.cssText = 'width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:0.95rem;background:var(--bg);color:var(--text);outline:none;';
      input.maxLength = 200;
      textEl.appendChild(label);
      textEl.appendChild(input);
      const ok = document.getElementById('confirm-ok');
      const cancel = document.getElementById('confirm-cancel');
      ok.textContent = opts.okText || (I18n.getLang() === 'ja' ? '保存' : 'Save');
      cancel.textContent = I18n.t('btnCancel');
      ok.classList.remove('confirm-danger');
      modal.hidden = false;
      input.focus();
      input.select();
      function cleanup(result) {
        modal.hidden = true;
        ok.replaceWith(ok.cloneNode(true));
        cancel.replaceWith(cancel.cloneNode(true));
        resolve(result);
      }
      ok.addEventListener('click', () => { const v = input.value.trim(); cleanup(v || null); }, { once: true });
      cancel.addEventListener('click', () => cleanup(null), { once: true });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const v = input.value.trim(); cleanup(v || null); } });
      modal.addEventListener('click', (e) => { if (e.target === modal) cleanup(null); }, { once: true });
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
  function renderHistory() { renderStats(); _coinHistoryOffset = 0; renderCoinHistory(); }

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
    // Free
    { id: 'default', label: 'デフォルト', labelEn: 'Default', cost: 0, premium: false,
      accent: '#0D9488', bg: '#F0F2F5', bgCard: '#FFFFFF', text: '#1C1E21', textMuted: '#65676B',
      border: '#E4E6EB', radius: '14px', desc: '', descEn: '' },
    { id: 'sakura', label: '桜', labelEn: 'Sakura', cost: 0, premium: false,
      accent: '#E91E63', bg: '#FFF0F5', bgCard: '#FFFFFF', text: '#3E2723', textMuted: '#8D6E63',
      border: '#F8BBD0', radius: '16px', desc: '春の桜', descEn: 'Spring cherry blossoms' },
    { id: 'ocean', label: '海', labelEn: 'Ocean', cost: 0, premium: false,
      accent: '#0097A7', bg: '#E0F7FA', bgCard: '#FFFFFF', text: '#004D40', textMuted: '#00796B',
      border: '#B2EBF2', radius: '14px', desc: '穏やかな海', descEn: 'Calm ocean' },
    { id: 'forest', label: '森', labelEn: 'Forest', cost: 0, premium: false,
      accent: '#2E7D32', bg: '#E8F5E9', bgCard: '#FFFFFF', text: '#1B5E20', textMuted: '#4CAF50',
      border: '#C8E6C9', radius: '12px', desc: '深い森', descEn: 'Deep forest' },
    { id: 'night', label: '夜空', labelEn: 'Night Sky', cost: 0, premium: false,
      accent: '#7C4DFF', bg: '#EDE7F6', bgCard: '#FFFFFF', text: '#311B92', textMuted: '#7E57C2',
      border: '#D1C4E9', radius: '14px', desc: '星空', descEn: 'Starry sky' },
    { id: 'sunset', label: '夕焼け', labelEn: 'Sunset', cost: 0, premium: false,
      accent: '#FF6D00', bg: '#FFF3E0', bgCard: '#FFFFFF', text: '#BF360C', textMuted: '#E65100',
      border: '#FFE0B2', radius: '14px', desc: '夕暮れ', descEn: 'Twilight' },
    // Premium
    { id: 'tropical', label: 'トロピカル', labelEn: 'Tropical', cost: 0, premium: false,
      accent: '#00BFA5', bg: '#E0F2F1', bgCard: '#FFFFFF', text: '#004D40', textMuted: '#26A69A',
      border: '#80CBC4', radius: '20px', desc: 'ヤシの木とハイビスカス', descEn: 'Palm trees & hibiscus' },
    { id: 'space', label: 'スペース', labelEn: 'Space', cost: 0, premium: false,
      accent: '#651FFF', bg: '#0D1B2A', bgCard: '#1B2838', text: '#E0E0E0', textMuted: '#90A4AE',
      border: '#37474F', radius: '12px', desc: '宇宙と惑星', descEn: 'Planets & galaxies' },
    { id: 'candy', label: 'キャンディ', labelEn: 'Candy', cost: 0, premium: false,
      accent: '#FF4081', bg: '#FFF8E1', bgCard: '#FFFFFF', text: '#880E4F', textMuted: '#AD1457',
      border: '#F8BBD0', radius: '24px', desc: 'カラフルなお菓子', descEn: 'Colorful sweets' },
    { id: 'retro', label: 'レトロゲーム', labelEn: 'Retro Game', cost: 0, premium: false,
      accent: '#76FF03', bg: '#1A1A2E', bgCard: '#16213E', text: '#E0E0E0', textMuted: '#81C784',
      border: '#2E4057', radius: '4px', desc: '8ビット風', descEn: '8-bit style' },
    { id: 'zen', label: '禅', labelEn: 'Zen', cost: 0, premium: false,
      accent: '#795548', bg: '#EFEBE9', bgCard: '#FFFFFF', text: '#3E2723', textMuted: '#8D6E63',
      border: '#D7CCC8', radius: '8px', desc: '和の静寂', descEn: 'Japanese tranquility' },
    { id: 'aurora', label: 'オーロラ', labelEn: 'Aurora', cost: 0, premium: false,
      accent: '#00E5FF', bg: '#0A1628', bgCard: '#0F2042', text: '#E0F7FA', textMuted: '#80DEEA',
      border: '#1A3A5C', radius: '16px', desc: '幻想的な光', descEn: 'Mystical lights' },
    { id: 'cafe', label: 'カフェ', labelEn: 'Cafe', cost: 0, premium: false,
      accent: '#8D6E63', bg: '#FBF5F0', bgCard: '#FFFFFF', text: '#4E342E', textMuted: '#A1887F',
      border: '#D7CCC8', radius: '16px', desc: 'コーヒーとスイーツ', descEn: 'Coffee & sweets' },
    { id: 'neon', label: 'ネオン', labelEn: 'Neon', cost: 0, premium: false,
      accent: '#FF1744', bg: '#12001A', bgCard: '#1A0025', text: '#F5F5F5', textMuted: '#CE93D8',
      border: '#4A0072', radius: '14px', desc: 'サイバーパンク', descEn: 'Cyberpunk city' },
  ];

  function getOwnedThemes() {
    const freeIds = THEMES.filter(t => !t.premium).map(t => t.id);
    const purchased = JSON.parse(localStorage.getItem('rehacoin_themes_purchased') || '[]');
    return [...new Set([...freeIds, ...purchased])];
  }
  function addPurchasedTheme(id) {
    const purchased = JSON.parse(localStorage.getItem('rehacoin_themes_purchased') || '[]');
    if (!purchased.includes(id)) { purchased.push(id); safeSetItem('rehacoin_themes_purchased', JSON.stringify(purchased)); }
  }
  function getCurrentTheme() {
    return localStorage.getItem('rehacoin_current_theme') || 'default';
  }
  // Theme mascot characters (inline SVG data URIs)
  const THEME_MASCOTS = {
    'default': `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><circle cx="40" cy="36" r="22" fill="%230D9488"/><circle cx="33" cy="31" r="3" fill="%23FFF"/><circle cx="47" cy="31" r="3" fill="%23FFF"/><circle cx="34" cy="31" r="1.5" fill="%23333"/><circle cx="48" cy="31" r="1.5" fill="%23333"/><path d="M35 40 Q40 46 45 40" fill="none" stroke="%23FFF" stroke-width="2" stroke-linecap="round"/><circle cx="26" cy="37" r="5" fill="%23FFF" opacity="0.15"/><circle cx="54" cy="37" r="5" fill="%23FFF" opacity="0.15"/><circle cx="40" cy="62" r="6" fill="%230D9488" opacity="0.6"/><path d="M34 62 L30 70 M46 62 L50 70" stroke="%230D9488" stroke-width="3" stroke-linecap="round" opacity="0.6"/><text x="40" y="18" text-anchor="middle" font-size="10" fill="%23FFE066">★</text></svg>`,
    'sakura': `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><circle cx="40" cy="35" r="22" fill="%23FFB6C1"/><circle cx="33" cy="30" r="3" fill="%23333"/><circle cx="47" cy="30" r="3" fill="%23333"/><path d="M35 38 Q40 44 45 38" fill="none" stroke="%23333" stroke-width="2" stroke-linecap="round"/><circle cx="27" cy="36" r="5" fill="%23FF69B4" opacity="0.3"/><circle cx="53" cy="36" r="5" fill="%23FF69B4" opacity="0.3"/><path d="M30 15 Q35 5 40 15" fill="%23E91E63" opacity="0.6"/><path d="M40 13 Q45 3 50 13" fill="%23E91E63" opacity="0.6"/><path d="M25 18 Q28 8 33 16" fill="%23E91E63" opacity="0.4"/><path d="M47 16 Q52 6 55 18" fill="%23E91E63" opacity="0.4"/></svg>`,
    'ocean': `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><ellipse cx="40" cy="38" rx="22" ry="20" fill="%234DD0E1"/><circle cx="33" cy="33" r="3.5" fill="%23333"/><circle cx="47" cy="33" r="3.5" fill="%23333"/><circle cx="33" cy="32" r="1.5" fill="%23FFF"/><circle cx="47" cy="32" r="1.5" fill="%23FFF"/><path d="M36 42 Q40 47 44 42" fill="none" stroke="%23333" stroke-width="2" stroke-linecap="round"/><path d="M18 38 L12 28 L18 33" fill="%234DD0E1"/><path d="M62 38 L68 28 L62 33" fill="%234DD0E1"/><ellipse cx="40" cy="58" rx="12" ry="3" fill="%230097A7" opacity="0.15"/></svg>`,
    'forest': `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><ellipse cx="40" cy="42" rx="20" ry="18" fill="%2381C784"/><circle cx="34" cy="37" r="3" fill="%23333"/><circle cx="46" cy="37" r="3" fill="%23333"/><path d="M37 44 Q40 48 43 44" fill="none" stroke="%23333" stroke-width="2" stroke-linecap="round"/><path d="M30 26 L34 16 L38 26" fill="%234CAF50"/><path d="M42 26 L46 14 L50 26" fill="%23388E3C"/><path d="M36 28 L40 19 L44 28" fill="%2366BB6A"/><circle cx="26" cy="48" r="4" fill="%23A5D6A7" opacity="0.5"/><circle cx="54" cy="46" r="3" fill="%23C8E6C9" opacity="0.5"/></svg>`,
    'night': `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><circle cx="40" cy="38" r="22" fill="%23B39DDB"/><circle cx="33" cy="33" r="3.5" fill="%23333"/><circle cx="47" cy="33" r="3.5" fill="%23333"/><circle cx="34" cy="32" r="1.5" fill="%23FFF"/><circle cx="48" cy="32" r="1.5" fill="%23FFF"/><path d="M36 42 Q40 46 44 42" fill="none" stroke="%23333" stroke-width="2" stroke-linecap="round"/><path d="M18 18 L20 12 L22 18 L28 20 L22 22 L20 28 L18 22 L12 20Z" fill="%23FDD835" opacity="0.7"/><path d="M58 14 L59 11 L60 14 L63 15 L60 16 L59 19 L58 16 L55 15Z" fill="%23FDD835" opacity="0.5"/><path d="M62 42 Q56 50 62 58 Q72 50 62 42Z" fill="%23FDD835" opacity="0.25"/></svg>`,
    'sunset': `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><circle cx="40" cy="38" r="22" fill="%23FFCC80"/><circle cx="33" cy="33" r="3" fill="%23333"/><circle cx="47" cy="33" r="3" fill="%23333"/><path d="M35 42 Q40 47 45 42" fill="none" stroke="%23333" stroke-width="2" stroke-linecap="round"/><circle cx="27" cy="38" r="4" fill="%23FF8A65" opacity="0.3"/><circle cx="53" cy="38" r="4" fill="%23FF8A65" opacity="0.3"/><circle cx="40" cy="10" r="8" fill="%23FF6D00" opacity="0.3"/><path d="M40 2 L40 6 M32 5 L35 8 M48 5 L45 8" stroke="%23FFB74D" stroke-width="1.5" opacity="0.4"/></svg>`,
    'tropical': `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><ellipse cx="40" cy="42" rx="18" ry="20" fill="%23FFCC80"/><circle cx="34" cy="37" r="3" fill="%23333"/><circle cx="46" cy="37" r="3" fill="%23333"/><path d="M37 45 Q40 50 43 45" fill="none" stroke="%23333" stroke-width="2" stroke-linecap="round"/><path d="M26 22 Q18 8 12 22" fill="%2300BFA5" opacity="0.7"/><path d="M30 19 Q24 5 18 17" fill="%2326A69A" opacity="0.5"/><path d="M54 22 Q62 8 68 22" fill="%2300BFA5" opacity="0.7"/><path d="M50 19 Q56 5 62 17" fill="%2326A69A" opacity="0.5"/><circle cx="40" cy="16" r="6" fill="%23FF7043" opacity="0.6"/><circle cx="40" cy="16" r="2.5" fill="%23FF5722" opacity="0.6"/></svg>`,
    'space': `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><circle cx="40" cy="38" r="18" fill="%2390CAF9"/><circle cx="40" cy="38" r="15" fill="%23E3F2FD"/><circle cx="34" cy="35" r="3.5" fill="%231A237E"/><circle cx="46" cy="35" r="3.5" fill="%231A237E"/><circle cx="35" cy="34" r="1.5" fill="%23FFF"/><circle cx="47" cy="34" r="1.5" fill="%23FFF"/><path d="M37 42 Q40 46 43 42" fill="none" stroke="%231A237E" stroke-width="2" stroke-linecap="round"/><ellipse cx="40" cy="38" rx="28" ry="5" fill="none" stroke="%23FFB74D" stroke-width="2" opacity="0.35" transform="rotate(-15 40 38)"/><circle cx="15" cy="15" r="2.5" fill="%23FFF59D"/><circle cx="65" cy="12" r="2" fill="%23FFF59D"/><circle cx="60" cy="60" r="1.5" fill="%23FFF59D"/><path d="M10 55 L12 49 L14 55 L20 57 L14 59 L12 65 L10 59 L4 57Z" fill="%23FFF59D" opacity="0.5"/></svg>`,
    'candy': `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><circle cx="40" cy="38" r="22" fill="%23F8BBD0"/><circle cx="33" cy="33" r="3.5" fill="%23333"/><circle cx="47" cy="33" r="3.5" fill="%23333"/><path d="M34 42 Q40 50 46 42" fill="%23E91E63" opacity="0.2"/><path d="M34 42 Q40 48 46 42" fill="none" stroke="%23333" stroke-width="2"/><circle cx="16" cy="18" r="7" fill="%23FF4081" opacity="0.5"/><circle cx="16" cy="18" r="4" fill="%23FF80AB" opacity="0.5"/><circle cx="64" cy="20" r="6" fill="%2300BCD4" opacity="0.5"/><circle cx="64" cy="20" r="3" fill="%2380DEEA" opacity="0.5"/><rect x="12" y="55" width="14" height="6" rx="3" fill="%23CE93D8" opacity="0.5"/><circle cx="60" cy="58" r="5" fill="%23FFD740" opacity="0.5"/><circle cx="60" cy="58" r="2.5" fill="%23FFF176" opacity="0.5"/></svg>`,
    'retro': `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect x="22" y="18" width="36" height="36" rx="2" fill="%2376FF03"/><rect x="26" y="22" width="28" height="28" fill="%231A1A2E"/><rect x="31" y="29" width="5" height="5" fill="%2376FF03"/><rect x="44" y="29" width="5" height="5" fill="%2376FF03"/><rect x="33" y="40" width="14" height="3" fill="%2376FF03"/><rect x="18" y="60" width="7" height="7" fill="%23FF1744" opacity="0.7"/><rect x="55" y="60" width="7" height="7" fill="%23FFEA00" opacity="0.7"/><rect x="36" y="60" width="7" height="7" fill="%2300E5FF" opacity="0.7"/></svg>`,
    'zen': `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><circle cx="40" cy="38" r="20" fill="%23D7CCC8"/><circle cx="35" cy="35" r="2.5" fill="%235D4037"/><circle cx="45" cy="35" r="2.5" fill="%235D4037"/><path d="M38 42 Q40 44 42 42" fill="none" stroke="%235D4037" stroke-width="1.5" stroke-linecap="round"/><circle cx="40" cy="68" r="8" fill="none" stroke="%23A1887F" stroke-width="0.8" opacity="0.4"/><circle cx="40" cy="68" r="5" fill="none" stroke="%23A1887F" stroke-width="0.8" opacity="0.3"/><path d="M16 60 Q20 45 24 60" fill="%2381C784" opacity="0.35"/><path d="M20 60 Q24 42 28 60" fill="%23A5D6A7" opacity="0.3"/><circle cx="58" cy="55" r="4" fill="%23BCAAA4" opacity="0.35"/><circle cx="64" cy="59" r="3" fill="%23D7CCC8" opacity="0.35"/><circle cx="60" cy="63" r="2" fill="%23EFEBE9" opacity="0.35"/></svg>`,
    'aurora': `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><circle cx="40" cy="38" r="20" fill="%2380DEEA"/><circle cx="40" cy="38" r="17" fill="%23E0F7FA"/><circle cx="34" cy="35" r="3" fill="%23006064"/><circle cx="46" cy="35" r="3" fill="%23006064"/><circle cx="35" cy="34" r="1.2" fill="%23FFF"/><circle cx="47" cy="34" r="1.2" fill="%23FFF"/><path d="M37 42 Q40 46 43 42" fill="none" stroke="%23006064" stroke-width="2" stroke-linecap="round"/><path d="M8 65 Q18 30 28 50 Q38 70 48 35 Q58 5 68 40 Q75 60 78 55" fill="none" stroke="%2300E5FF" stroke-width="2.5" opacity="0.25"/><path d="M5 70 Q15 40 25 55 Q35 70 45 40 Q55 10 65 45" fill="none" stroke="%2376FF03" stroke-width="2" opacity="0.15"/></svg>`,
    'cafe': `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><path d="M22 60 Q22 32 30 32 L50 32 Q58 32 58 60Z" fill="%238D6E63"/><ellipse cx="40" cy="32" rx="20" ry="5" fill="%23A1887F"/><path d="M58 40 Q68 40 68 48 Q68 56 58 56" fill="none" stroke="%238D6E63" stroke-width="3"/><path d="M30 26 Q34 14 38 26" fill="none" stroke="%23D7CCC8" stroke-width="2" opacity="0.5"/><path d="M38 23 Q42 8 46 23" fill="none" stroke="%23D7CCC8" stroke-width="2" opacity="0.5"/><path d="M46 26 Q50 14 54 26" fill="none" stroke="%23D7CCC8" stroke-width="2" opacity="0.5"/><circle cx="40" cy="46" r="4" fill="%23FFF" opacity="0.1"/></svg>`,
    'neon': `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect x="20" y="16" width="40" height="44" rx="5" fill="none" stroke="%23FF1744" stroke-width="2" opacity="0.7"/><rect x="25" y="21" width="30" height="14" fill="%23FF1744" opacity="0.12"/><circle cx="33" cy="40" r="4" fill="%2300E5FF" opacity="0.9"/><circle cx="47" cy="40" r="4" fill="%2300E5FF" opacity="0.9"/><circle cx="33" cy="39" r="1.5" fill="%23FFF" opacity="0.6"/><circle cx="47" cy="39" r="1.5" fill="%23FFF" opacity="0.6"/><path d="M35 50 Q40 55 45 50" fill="none" stroke="%23E040FB" stroke-width="2.5" stroke-linecap="round"/><rect x="8" y="8" width="10" height="16" rx="2" fill="none" stroke="%23FFEA00" stroke-width="1" opacity="0.35"/><rect x="62" y="10" width="12" height="20" rx="2" fill="none" stroke="%23E040FB" stroke-width="1" opacity="0.35"/><line x1="10" y1="68" x2="70" y2="68" stroke="%2376FF03" stroke-width="1.5" opacity="0.35"/></svg>`,
  };

  // Floating decoration particles per theme
  const THEME_PARTICLES = {
    'sakura': { emoji: '🌸', count: 3, animation: 'float-fall' },
    'ocean': { emoji: '🫧', count: 3, animation: 'float-rise' },
    'forest': { emoji: '🍃', count: 2, animation: 'float-fall' },
    'night': { emoji: '✨', count: 3, animation: 'float-twinkle' },
    'sunset': { emoji: '🌅', count: 0 },
    'tropical': { emoji: '🌺', count: 3, animation: 'float-fall' },
    'space': { emoji: '⭐', count: 4, animation: 'float-twinkle' },
    'candy': { emoji: '🍬', count: 3, animation: 'float-fall' },
    'retro': { emoji: '👾', count: 2, animation: 'float-fall' },
    'zen': { emoji: '🍂', count: 2, animation: 'float-fall' },
    'aurora': { emoji: '❄️', count: 3, animation: 'float-fall' },
    'cafe': { emoji: '☕', count: 0 },
    'neon': { emoji: '💜', count: 2, animation: 'float-rise' },
  };

  function applyTheme(id) {
    const theme = THEMES.find(t => t.id === id);
    if (!theme) return;
    safeSetItem('rehacoin_current_theme', id);
    const root = document.documentElement;
    root.setAttribute('data-theme', id);
    root.style.setProperty('--accent', theme.accent);
    root.style.setProperty('--accent-dark', theme.accent);
    root.style.setProperty('--bg', theme.bg);
    root.style.setProperty('--bg-card', theme.bgCard || '#FFFFFF');
    root.style.setProperty('--text', theme.text || '#1C1E21');
    root.style.setProperty('--text-muted', theme.textMuted || '#65676B');
    root.style.setProperty('--border', theme.border || '#E4E6EB');
    root.style.setProperty('--radius', theme.radius || '14px');
    root.style.setProperty('--border-light', theme.bg);
    root.style.setProperty('--accent-gradient', `linear-gradient(135deg, ${theme.accent} 0%, ${adjustColor(theme.accent, 30)} 100%)`);
    root.style.setProperty('--accent-light', theme.bg);
    document.getElementById('app-header').style.background =
      `linear-gradient(135deg, ${theme.accent} 0%, ${adjustColor(theme.accent, 30)} 100%)`;
    // Update mascot
    updateThemeMascot(id);
    // Update floating particles
    updateThemeParticles(id);
  }

  function updateThemeMascot(id) {
    let el = document.getElementById('theme-mascot');
    if (!el) {
      el = document.createElement('div');
      el.id = 'theme-mascot';
      el.addEventListener('click', () => MascotChat.toggle());
      document.body.appendChild(el);
    }
    const src = THEME_MASCOTS[id];
    if (src) {
      el.innerHTML = '';
      const img = document.createElement('img');
      img.src = src;
      img.alt = '';
      img.width = 64;
      img.height = 64;
      el.appendChild(img);
      el.style.display = 'block';
    } else {
      el.innerHTML = '';
      el.style.display = 'none';
    }
  }

  function updateThemeParticles(id) {
    let container = document.getElementById('theme-particles');
    if (!container) {
      container = document.createElement('div');
      container.id = 'theme-particles';
      document.body.appendChild(container);
    }
    container.innerHTML = '';
    const p = THEME_PARTICLES[id];
    if (!p || !p.count) return;
    for (let i = 0; i < p.count; i++) {
      const span = document.createElement('span');
      span.className = 'theme-particle';
      span.textContent = p.emoji;
      span.style.left = `${Math.random() * 90 + 5}%`;
      span.style.animationDelay = `${Math.random() * 8}s`;
      span.style.animationDuration = `${6 + Math.random() * 6}s`;
      span.style.fontSize = `${12 + Math.random() * 10}px`;
      span.style.opacity = `${0.3 + Math.random() * 0.4}`;
      if (p.animation) span.classList.add(p.animation);
      container.appendChild(span);
    }
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
    // Render sub-sections with error isolation
    const subRenders = [renderThemeStore, renderDailyMissions, renderGachaSection, renderStreakFreeze, renderFriendRanking, renderExchange];
    for (const fn of subRenders) {
      try { fn(); } catch (e) { console.error('renderProfile sub-render failed:', fn.name, e); }
    }
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

      const desc = ja ? (t.desc || '') : (t.descEn || '');
      const premiumTag = t.premium ? `<span class="theme-premium-tag">PREMIUM</span>` : '';
      const costBadge = t.cost === 0 ? `<span class="theme-free-badge">FREE</span>` : `<span class="theme-cost-badge"><img src="img/coin.svg" width="10" height="10"> ${t.cost}</span>`;

      return `<div class="theme-card ${isCurrent ? 'theme-current' : ''}" data-theme-id="${t.id}">
        ${premiumTag}
        <div class="theme-preview" style="background:${t.bg};border-top:3px solid ${t.accent}">
          <div style="width:100%;height:100%;background:linear-gradient(135deg, ${t.accent} 0%, ${adjustColor(t.accent, 40)} 100%);opacity:0.15;border-radius:inherit"></div>
        </div>
        <div class="theme-name">${ja ? t.label : t.labelEn}</div>
        ${desc ? `<div class="theme-desc">${desc}</div>` : ''}
        ${!isOwned ? costBadge : ''}
        ${btnHtml}
      </div>`;
    }).join('');

    // Add mascot images safely via DOM
    container.querySelectorAll('.theme-card').forEach(card => {
      const tid = card.dataset.themeId;
      const src = THEME_MASCOTS[tid];
      if (src) {
        const preview = card.querySelector('.theme-preview');
        if (preview) {
          const img = document.createElement('img');
          img.src = src;
          img.alt = '';
          Object.assign(img.style, { position: 'absolute', right: '4px', bottom: '0', width: '40px', height: '40px' });
          preview.appendChild(img);
        }
      }
    });

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
          addPurchasedTheme(theme.id);
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
    document.getElementById('btn-export').addEventListener('click', () => exportToExcel());
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
    // Privacy policy modal (settings + auth screen)
    const privacyHandler = (e) => { e.preventDefault(); showPrivacyModal(); };
    const privBtn = document.getElementById('btn-privacy');
    if (privBtn) privBtn.addEventListener('click', privacyHandler);
    document.querySelectorAll('.btn-privacy-link').forEach(el => el.addEventListener('click', privacyHandler));
  }

  function showPrivacyModal() {
    const overlay = document.createElement('div');
    overlay.className = 'help-overlay';
    overlay.style.padding = '12px';
    const card = document.createElement('div');
    card.className = 'help-card';
    card.style.maxWidth = '500px';
    card.style.maxHeight = '80vh';
    card.style.overflow = 'auto';
    card.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted)">読み込み中...</div>';
    overlay.appendChild(card);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) { overlay.classList.add('help-closing'); setTimeout(() => overlay.remove(), 200); }
    });
    document.body.appendChild(overlay);
    // Fetch privacy.html and extract body content
    fetch('privacy.html').then(r => r.text()).then(html => {
      const match = html.match(/<div class="card">([\s\S]*?)<\/div>\s*<\/body>/);
      card.innerHTML = (match ? match[1] : html) + '<button class="help-close btn-primary" style="margin-top:16px">閉じる</button>';
      card.querySelector('.help-close').addEventListener('click', () => {
        overlay.classList.add('help-closing'); setTimeout(() => overlay.remove(), 200);
      });
    }).catch(() => {
      card.innerHTML = '<p style="color:var(--text-muted)">読み込めませんでした。</p><button class="help-close btn-primary" style="margin-top:16px">閉じる</button>';
      card.querySelector('.help-close').addEventListener('click', () => {
        overlay.classList.add('help-closing'); setTimeout(() => overlay.remove(), 200);
      });
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
          refreshLucideIcons();
        }
      } catch (e) {
        console.error('Feed refresh failed:', e);
      }
    }, 60000);
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

  // --- Excel Export ---
  async function exportToExcel() {
    // Show progress overlay
    const prog = document.createElement('div');
    prog.className = 'help-overlay';
    prog.innerHTML = `<div class="help-card" style="max-width:300px;text-align:center;padding:28px 24px">
      <div style="font-weight:700;font-size:1rem;margin-bottom:14px">📊 エクスポート中...</div>
      <div style="background:#E5E7EB;border-radius:8px;height:8px;overflow:hidden;margin-bottom:10px">
        <div id="export-bar" style="width:10%;height:100%;background:var(--accent);border-radius:8px;transition:width 0.3s"></div>
      </div>
      <div id="export-status" style="font-size:0.85rem;color:var(--text-muted)">データ取得中...</div>
    </div>`;
    document.body.appendChild(prog);
    const bar = prog.querySelector('#export-bar');
    const status = prog.querySelector('#export-status');

    const profile = Store.getProfile();
    const records = Store.getRecords();
    const rank = Store.getRank();
    const streak = Store.getStreak();
    const badges = Store.getAllBadges();
    bar.style.width = '30%';
    status.textContent = 'コイン履歴を取得中...';

    // Fetch coin history (limit 50 for speed)
    let coinHistory = [];
    try {
      const res = await API.getCoinHistory(50, 0);
      coinHistory = res.history || [];
    } catch (e) { /* ignore */ }
    bar.style.width = '60%';
    status.textContent = 'Excelを生成中...';
    await new Promise(r => setTimeout(r, 50));

    const now = new Date();
    const dateStr = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`;

    // Category label helper
    function catLabel(code) {
      const cat = Data.getCategory(code);
      return cat ? cat.label : code || 'じゆう';
    }

    // Style constants
    const S = {
      accent: '#0D9488',
      accentLight: '#E6FAF8',
      gold: '#FFD700',
      goldLight: '#FFF8DC',
      headerBg: '#0D9488',
      headerText: '#FFFFFF',
      border: '#D1D5DB',
      lightGray: '#F9FAFB',
      text: '#1F2937',
      muted: '#6B7280',
      success: '#059669',
      danger: '#DC2626',
    };

    let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="UTF-8">
<style>
  body { font-family: 'Hiragino Sans', 'Yu Gothic', sans-serif; }
  td, th { padding: 6px 12px; border: 1px solid ${S.border}; vertical-align: middle; }
  th { background: ${S.headerBg}; color: ${S.headerText}; font-weight: bold; font-size: 12px; }
  .title { font-size: 18px; font-weight: bold; color: ${S.accent}; border: none; padding: 12px 0 4px; }
  .subtitle { font-size: 11px; color: ${S.muted}; border: none; padding: 0 0 10px; }
  .stat-label { background: ${S.accentLight}; font-weight: 600; color: ${S.accent}; width: 160px; }
  .stat-val { font-weight: bold; font-size: 14px; }
  .stripe { background: ${S.lightGray}; }
  .coin { color: ${S.accent}; font-weight: bold; }
  .badge-on { background: ${S.goldLight}; color: #92400E; }
  .badge-off { background: #F3F4F6; color: #9CA3AF; }
  .cat { font-weight: 600; }
</style>
</head><body>`;

    // ========== Sheet 1: Profile Summary ==========
    html += `<table>`;
    html += `<tr><td class="title" colspan="4">🪙 リハコイン — マイデータ</td></tr>`;
    html += `<tr><td class="subtitle" colspan="4">エクスポート日: ${dateStr}</td></tr>`;
    html += `<tr><td colspan="4" style="border:none;height:8px"></td></tr>`;

    // Profile info
    html += `<tr><td class="title" colspan="4">📋 プロフィール</td></tr>`;
    const profileRows = [
      ['ニックネーム', profile?.nickname || '-'],
      ['ランク', rank ? rank.label : '-'],
      ['ほゆうコイン', profile?.totalCoins || 0],
      ['おうえんボーナス', profile?.witnessBonus || 0],
      ['フレンド数', profile?.friendCount || 0],
      ['連続記録（ストリーク）', streak + '日'],
      ['今日の記録数', Store.getTodayCount() + '回'],
      ['総記録数', records.length + '回'],
      ['登録日', profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString('ja-JP') : '-'],
    ];
    profileRows.forEach((row, i) => {
      html += `<tr><td class="stat-label">${row[0]}</td><td class="stat-val ${i % 2 ? '' : 'stripe'}" colspan="3">${row[1]}</td></tr>`;
    });

    // Monthly summary
    html += `<tr><td colspan="4" style="border:none;height:16px"></td></tr>`;
    html += `<tr><td class="title" colspan="4">📊 月別きろく数</td></tr>`;
    html += `<tr><th>月</th><th>記録数</th><th colspan="2">グラフ</th></tr>`;
    const monthly = Store.getMonthlyCounts();
    const maxCount = Math.max(...monthly.map(m => m.count), 1);
    monthly.slice(-6).forEach((m, i) => {
      const barLen = Math.round((m.count / maxCount) * 20);
      const bar = '█'.repeat(barLen) + '░'.repeat(20 - barLen);
      html += `<tr class="${i % 2 ? 'stripe' : ''}"><td>${m.label}</td><td class="coin" style="text-align:center">${m.count}</td><td colspan="2" style="font-family:monospace;color:${S.accent};letter-spacing:1px">${bar}</td></tr>`;
    });

    html += `<tr><td colspan="4" style="border:none;height:16px"></td></tr>`;

    // ========== Badges ==========
    html += `<tr><td class="title" colspan="4">🏅 バッジ</td></tr>`;
    html += `<tr><th>バッジ</th><th>条件</th><th>状態</th><th></th></tr>`;
    badges.forEach((b, i) => {
      let cond = '';
      if (b.coins) cond = b.coins + 'コイン';
      else if (b.streak) cond = b.streak + '日連続';
      else if (b.records) cond = b.records + '回記録';
      else if (b.friends) cond = b.friends + '人フレンド';
      else if (b.witness) cond = b.witness + '回応援';
      html += `<tr class="${b.unlocked ? 'badge-on' : 'badge-off'}"><td>${b.label}</td><td>${cond}</td><td style="text-align:center">${b.unlocked ? '✅ 解放済' : '🔒 未解放'}</td><td></td></tr>`;
    });

    html += `<tr><td colspan="4" style="border:none;height:16px"></td></tr>`;

    // ========== Activity Records ==========
    html += `<tr><td class="title" colspan="4">📝 活動きろく（全${records.length}件）</td></tr>`;
    html += `<tr><th>日時</th><th>カテゴリ</th><th>活動</th><th>メモ</th></tr>`;
    records.forEach((r, i) => {
      const d = new Date(r.timestamp);
      const dt = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
      html += `<tr class="${i % 2 ? 'stripe' : ''}"><td style="white-space:nowrap">${dt}</td><td class="cat">${escapeHtml(catLabel(r.categoryCode))}</td><td>${escapeHtml(r.label)}</td><td>${escapeHtml(r.memo || '')}</td></tr>`;
    });

    html += `<tr><td colspan="4" style="border:none;height:16px"></td></tr>`;

    // ========== Coin History ==========
    if (coinHistory.length > 0) {
      html += `<tr><td class="title" colspan="4">💰 コインりれき（直近${coinHistory.length}件）</td></tr>`;
      html += `<tr><th>日時</th><th>種類</th><th>内容</th><th>コイン</th></tr>`;
      coinHistory.forEach((c, i) => {
        const d = new Date(c.created_at || c.timestamp);
        const dt = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
        const typeLabel = { record: '活動記録', witness: '応援', bonus: 'ボーナス', spend: '交換', gacha: 'ガチャ', mission: 'ミッション' }[c.type] || c.type;
        const coinColor = c.amount >= 0 ? S.success : S.danger;
        const sign = c.amount >= 0 ? '+' : '';
        html += `<tr class="${i % 2 ? 'stripe' : ''}"><td style="white-space:nowrap">${dt}</td><td>${typeLabel}</td><td>${escapeHtml(c.description || c.label || '')}</td><td style="color:${coinColor};font-weight:bold;text-align:center">${sign}${c.amount}</td></tr>`;
      });
    }

    html += `</table></body></html>`;

    bar.style.width = '90%';
    status.textContent = 'ダウンロード中...';

    // Small delay to let UI update
    await new Promise(r => setTimeout(r, 50));

    // Download as .xls
    const blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `リハコイン_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.xls`;
    a.click();
    URL.revokeObjectURL(url);

    bar.style.width = '100%';
    status.textContent = '完了！';
    setTimeout(() => { prog.classList.add('help-closing'); setTimeout(() => prog.remove(), 200); }, 600);
    showToast('エクスポートしました！');
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
