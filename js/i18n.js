// i18n.js — Internationalization (ja/en)

const I18n = (() => {
  const LANG_KEY = 'rehacoin_lang';

  const translations = {
    ja: {
      // Auth
      appName: 'リハコイン',
      authSubtitle: 'リハビリでコインを貯めよう',
      nickname: 'ニックネーム',
      password: 'パスワード',
      login: 'ログイン',
      register: 'アカウント作成',
      newHere: '初めて？',
      createAccount: 'アカウント作成',
      haveAccount: 'アカウントがある？',
      nicknamePlaceholder: 'ニックネーム（2〜20文字）',
      passwordPlaceholder: 'パスワード（8文字以上）',

      // Nav
      navHome: 'ホーム',
      navRecords: 'きろく',
      navFriends: 'フレンド',
      navMyPage: 'マイページ',

      // Home
      searchPlaceholder: 'かつどうをさがす...',
      sectionRecent: 'さいきんのきろく',
      sectionFavorites: 'よくつかうもの',
      sectionCategories: 'カテゴリ',
      sectionFreeInput: '自由入力',
      freeInputPlaceholder: 'じゆうにかつどうをにゅうりょく...',
      btnRecord: '記録',
      btnConfirmRecord: '記録する',
      btnCancel: 'やめる',
      myRecord: 'じぶんのきろく',
      btnBack: '← 戻る',

      // History
      screenRecords: 'きろく',
      tabRecords: 'かつどう',
      tabCoinHistory: 'コインりれき',
      totalCoins: 'もちコイン',
      today: 'きょう',
      streak: 'れんぞく',
      streakUnit: '日',
      top: 'トップ',
      noRecords: 'まだきろくがないよ。\nかつどうをタップしてはじめよう！',
      deleteRecordConfirm: 'このきろくをけしますか？',
      confirmed: 'かくにんずみ',

      // Friends
      screenFriends: 'フレンド',
      myFriendCode: 'マイフレンドコード',
      searchUser: 'ユーザー検索',
      userSearchPlaceholder: 'ニックネームで検索...',
      addFriendByCode: 'コードでフレンド追加',
      addFriend: 'フレンド追加',
      friendCodePlaceholder: 'フレンドコードを入力',
      statusFriend: 'フレンド',
      statusPendingSent: '申請中',
      statusPendingReceived: '申請が届いています',
      btnAddFriend: '追加',
      requestFrom: 'からの申請',
      tabFriendList: 'フレンド',
      tabFriendAdd: '追加',
      tabFriendFeed: 'フィード',
      orLabel: 'または',
      shareCodeHint: 'このコードを共有してフレンドに追加してもらおう',
      removeFriendBtn: '削除',
      btnSend: '送信',
      friendRequests: 'フレンド申請',
      btnAccept: '承認',
      btnReject: '拒否',
      sectionFriends: 'フレンド一覧',
      sectionFeed: 'フレンドの活動',
      noFriends: 'まだフレンドがいないよ。\nコードをきょうゆうしよう！',
      noFeed: 'フレンドのかつどうはまだないよ。',
      removeFriendConfirm: 'このフレンドを削除しますか？',
      friendAdded: 'フレンドになりました！',
      friendRequestSent: 'フレンド申請を送信しました！',
      witnessConfirm: '確認しました！',
      witnessBonus: '+1 ボーナスコイン',
      feedActivityRecorded: '活動を記録',

      // Exchange
      screenExchange: '交換',
      availableCoins: 'つかえるコイン',
      sectionBadges: 'バッジ',
      sectionRewards: 'ごほうびリスト',
      rewardNamePlaceholder: 'ご褒美の名前',
      rewardCostPlaceholder: 'コイン',
      btnAdd: '追加',
      noRewards: 'ごほうびをついかしよう！\n「50コインでカフェ」「100コインでえいが」など',
      btnExchange: '交換',
      spendConfirm: 'コインを使って交換しますか？',
      exchanged: 'ご褒美と交換しました！',
      deleteRewardConfirm: 'このご褒美を削除しますか？',
      coin: 'コイン',

      // Profile
      screenProfile: 'プロフィール',
      profileTotalCoins: 'もちコイン',
      profileWitnessBonus: 'おうえんボーナス',
      profileFriends: 'フレンド',
      friendCode: 'フレンドコード',
      feedPrivacy: 'フィード公開範囲',
      showActivityName: '活動名を見せる',
      coinsOnly: 'コインのみ',
      joined: '登録日',
      version: 'バージョン',
      exportData: 'データをほぞん',
      logout: 'ログアウト',
      logoutConfirm: 'ログアウトしますか？',
      language: '言語',

      // Mining
      mining: 'マイニング中...',
      hashComputing: 'Hash: 計算中...',
      blockConfirmed: 'ブロック確認！ +1 コイン',
      plusOneCoin: 'リハコイン +1',
      badgeUnlocked: 'バッジ解放！',

      // Loading
      loading: 'よみこみちゅう...',
      loadingFriends: 'フレンドよみこみちゅう...',

      // Time
      justNow: 'たったいま',
      mAgo: '分前',
      hAgo: '時間前',

      // Search
      notFound: 'みつかりませんでした',

      // Recovery / Reset
      recoveryCodeTitle: 'リカバリーコード',
      recoveryCodeMessage: 'このコードはパスワードを忘れた時に必要です。\n必ず安全な場所に控えてください。\n（このコードは二度と表示されません）',
      recoveryCodeCopied: 'コピーしました',
      recoveryCodeUnderstood: '控えました',
      forgotPassword: 'パスワードを忘れた？',
      resetPassword: 'パスワードリセット',
      recoveryCodePlaceholder: 'リカバリーコード（8文字）',
      newPasswordPlaceholder: '新しいパスワード（8文字以上）',
      resetSuccess: 'パスワードをリセットしました',
      backToLogin: 'ログインに戻る',
      deleteAccount: 'アカウント削除',
      deleteAccountConfirm: 'アカウントをけしますか？\nすべてのデータがかんぜんにけされます。\nこのそうさはもとにもどせません。',
      deleteAccountDone: 'アカウントを削除しました',
      passwordMinLength: 'パスワードは8文字以上で入力してください',
      privacyPolicy: 'プライバシーポリシー',
      privacyAgree: 'に同意する',
      privacyRequired: 'プライバシーポリシーへの同意が必要です',
      cheerSent: '頑張れ！を送りました',
    },

    en: {
      appName: 'Reha Coin',
      authSubtitle: 'Earn coins for your rehabilitation',
      nickname: 'Nickname',
      password: 'Password',
      login: 'Login',
      register: 'Create account',
      newHere: 'New here?',
      createAccount: 'Create account',
      haveAccount: 'Already have an account?',
      nicknamePlaceholder: 'Nickname (2-20 chars)',
      passwordPlaceholder: 'Password (8+ chars)',

      navHome: 'Home',
      navRecords: 'Records',
      navFriends: 'Friends',
      navMyPage: 'My Page',

      searchPlaceholder: 'Search activities...',
      sectionRecent: 'Recent',
      sectionFavorites: 'Favorites',
      sectionCategories: 'Categories',
      sectionFreeInput: 'Free Input',
      freeInputPlaceholder: 'Enter your activity...',
      btnRecord: 'Record',
      btnConfirmRecord: 'Record it',
      btnCancel: 'Cancel',
      myRecord: 'My Record',
      btnBack: '← Back',

      screenRecords: 'Records',
      tabRecords: 'Activities',
      tabCoinHistory: 'Coin History',
      totalCoins: 'Total Coins',
      today: 'Today',
      streak: 'Streak',
      streakUnit: 'd',
      top: 'Top',
      noRecords: 'No records yet.\nTap an activity to get started!',
      deleteRecordConfirm: 'Delete this record?',
      confirmed: 'confirmed',

      screenFriends: 'Friends',
      myFriendCode: 'My Friend Code',
      searchUser: 'Search Users',
      userSearchPlaceholder: 'Search by nickname...',
      addFriendByCode: 'Add Friend by Code',
      addFriend: 'Add Friend',
      friendCodePlaceholder: 'Enter friend code',
      statusFriend: 'Friend',
      statusPendingSent: 'Pending',
      statusPendingReceived: 'Request received',
      btnAddFriend: 'Add',
      requestFrom: 'request from',
      tabFriendList: 'Friends',
      tabFriendAdd: 'Add',
      tabFriendFeed: 'Feed',
      orLabel: 'or',
      shareCodeHint: 'Share this code so friends can add you',
      removeFriendBtn: 'Remove',
      btnSend: 'Send',
      friendRequests: 'Friend Requests',
      btnAccept: 'Accept',
      btnReject: 'Reject',
      sectionFriends: 'Friends',
      sectionFeed: 'Friend Activity',
      noFriends: 'No friends yet.\nShare your code!',
      noFeed: 'No activity from friends yet.',
      removeFriendConfirm: 'Remove this friend?',
      friendAdded: 'Friend added!',
      friendRequestSent: 'Friend request sent!',
      witnessConfirm: 'Witnessed!',
      witnessBonus: '+1 bonus coin',
      feedActivityRecorded: 'Activity recorded',

      screenExchange: 'Exchange',
      availableCoins: 'Available Coins',
      sectionBadges: 'Badges',
      sectionRewards: 'Rewards',
      rewardNamePlaceholder: 'Reward name',
      rewardCostPlaceholder: 'Coins',
      btnAdd: 'Add',
      noRewards: 'Add rewards!\n"50 coins for coffee" etc.',
      btnExchange: 'Exchange',
      spendConfirm: 'Spend coins to exchange?',
      exchanged: 'Exchanged!',
      deleteRewardConfirm: 'Delete this reward?',
      coin: 'coin',

      screenProfile: 'Profile',
      profileTotalCoins: 'Total Coins',
      profileWitnessBonus: 'Witness Bonus',
      profileFriends: 'Friends',
      friendCode: 'Friend Code',
      feedPrivacy: 'Feed Privacy',
      showActivityName: 'Show activity name',
      coinsOnly: 'Coins only',
      joined: 'Joined',
      version: 'Version',
      exportData: 'Export Data',
      logout: 'Logout',
      logoutConfirm: 'Logout?',
      language: 'Language',

      mining: 'Mining...',
      hashComputing: 'Hash: computing...',
      blockConfirmed: 'Block confirmed! +1 coin',
      plusOneCoin: '+1 coin',
      badgeUnlocked: 'Badge unlocked!',

      loading: 'Loading...',
      loadingFriends: 'Loading friends...',

      justNow: 'just now',
      mAgo: 'm ago',
      hAgo: 'h ago',

      notFound: 'Not found',

      recoveryCodeTitle: 'Recovery Code',
      recoveryCodeMessage: 'You need this code if you forget your password.\nSave it in a safe place.\n(This code will not be shown again)',
      recoveryCodeCopied: 'Copied',
      recoveryCodeUnderstood: 'I saved it',
      forgotPassword: 'Forgot password?',
      resetPassword: 'Reset Password',
      recoveryCodePlaceholder: 'Recovery code (8 chars)',
      newPasswordPlaceholder: 'New password (8+ chars)',
      resetSuccess: 'Password has been reset',
      backToLogin: 'Back to login',
      deleteAccount: 'Delete Account',
      deleteAccountConfirm: 'Delete your account?\nAll data will be permanently deleted.\nThis cannot be undone.',
      deleteAccountDone: 'Account deleted',
      passwordMinLength: 'Password must be at least 8 characters',
      privacyPolicy: 'Privacy Policy',
      privacyAgree: ' - I agree',
      privacyRequired: 'You must agree to the Privacy Policy',
      cheerSent: 'Cheer sent!',
    }
  };

  let lang = localStorage.getItem(LANG_KEY) || 'ja';

  function t(key) {
    return (translations[lang] && translations[lang][key]) || translations.ja[key] || key;
  }

  function setLang(newLang) {
    lang = newLang;
    localStorage.setItem(LANG_KEY, lang);
  }

  function getLang() {
    return lang;
  }

  // Apply translations to elements with data-i18n attribute
  function applyToDOM() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      el.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      el.placeholder = t(key);
    });
  }

  return { t, setLang, getLang, applyToDOM };
})();
