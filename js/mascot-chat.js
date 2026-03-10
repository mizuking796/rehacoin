// mascot-chat.js — Mascot character chat with rule-based responses + randomness

const MascotChat = (() => {
  let isOpen = false;
  let chatEl = null;
  let messagesEl = null;
  let currentTheme = 'default';

  // Character personalities per theme
  const PERSONALITIES = {
    default: { name: 'リハコ', suffix: ['だよ', 'よ', 'ね', 'だね'], greeting: 'やっほー！' },
    sakura: { name: 'さくらん', suffix: ['だよ♪', 'よ♪', 'ね♪', 'なの♪'], greeting: 'こんにちは♪' },
    ocean: { name: 'うみまる', suffix: ['だよ〜', 'よ〜', 'ね〜', 'だぞ〜'], greeting: 'やぁ〜！' },
    forest: { name: 'もりん', suffix: ['だよ', 'だね', 'なんだ', 'さ'], greeting: 'よく来たね！' },
    night: { name: 'ほしみ', suffix: ['だよ☆', 'よ☆', 'ね☆', 'かも☆'], greeting: 'こんばんは☆' },
    sunset: { name: 'ゆうひ', suffix: ['だよ', 'ね', 'かな', 'だよね'], greeting: 'おつかれさま！' },
    tropical: { name: 'ハイビー', suffix: ['だよ！', 'さ！', 'ね！', 'だぜ！'], greeting: 'アロハ〜！' },
    space: { name: 'コスモ', suffix: ['である', 'だ', 'なのだ', 'だぞ'], greeting: '宇宙から来たぞ！' },
    candy: { name: 'あめちゃん', suffix: ['だよ〜♡', 'ね〜♡', 'よ〜♡', 'なの〜♡'], greeting: 'あま〜い♡' },
    retro: { name: 'ピクセル', suffix: ['ﾋﾟｺ!', 'ﾋﾟﾎﾟ!', 'ﾋﾟｺﾎﾟ!', 'ﾋﾟ!'], greeting: 'ﾋﾟｺｯ！ｽﾀｰﾄ！' },
    zen: { name: '和心', suffix: ['でござる', 'じゃ', 'のう', 'でござるよ'], greeting: 'ようこそ。' },
    aurora: { name: 'ひかり', suffix: ['だよ...', 'ね...', 'かな...', 'よ...'], greeting: '...きれいな夜だね' },
    cafe: { name: 'ラテ', suffix: ['だよ☕', 'ね☕', 'よ☕', 'かな☕'], greeting: 'いらっしゃい☕' },
    neon: { name: 'ネオ', suffix: ['ッス', 'ッスね', 'ッスよ', 'だッス'], greeting: 'ヨッ！ネオンシティへようこそッス！' },
  };

  // Response categories and rules
  const CATEGORIES = [
    { id: 'howto', label: 'つかいかた', labelEn: 'How to use', icon: '📖' },
    { id: 'trouble', label: 'こまったこと', labelEn: 'Troubleshooting', icon: '😥' },
    { id: 'cheer', label: 'はげまして', labelEn: 'Cheer me up', icon: '💪' },
    { id: 'recommend', label: 'おすすめ', labelEn: 'Recommend', icon: '⭐' },
    { id: 'about', label: 'このアプリ', labelEn: 'About this app', icon: '📱' },
  ];

  // Response pools (multiple variants per topic for randomness)
  const RESPONSES = {
    howto: [
      { q: 'きろくのしかた', qEn: 'How to record', answers: [
        'ホーム画面のカテゴリをタップして、かつどうを選ぶだけ{s}！\nタップ→確認→コインゲット！かんたん{s}',
        'かつどうをきろくするには、ホームのカテゴリから選んでタップ{s}\n「じゆうきろく」で好きなかつどうも書ける{s}',
        'まずホーム画面を開いて、やったかつどうのカテゴリを選ぶ{s}\nあとはかつどうをタップするだけ{s}！',
      ]},
      { q: 'コインのつかいみち', qEn: 'How to use coins', answers: [
        'コインは「ご褒美」で自分へのごほうびと交換できる{s}\n「50コインでカフェ」みたいに自分で作れる{s}！',
        'マイページの「ご褒美」タブで、好きなごほうびを追加して交換{s}\nがんばったぶんだけ自分にごほうびをあげよう{s}！',
      ]},
      { q: 'フレンドのついか', qEn: 'Adding friends', answers: [
        'フレンドタブで「追加」を選んで、コードを入力するか検索{s}\nフレンドがきろくすると、フィードに表示される{s}',
        'マイフレンドコードをきょうゆうするか、あいてのコードを入力{s}\nフレンドがいるとランキングも見られる{s}！',
      ]},
      { q: 'テーマのかえかた', qEn: 'Changing themes', answers: [
        'マイページの「ゲーム」タブの一番下にテーマがある{s}\n好きなテーマを選んで「使う」をタップ{s}！',
        'テーマを変えるとアプリの見た目がガラッと変わる{s}\nマスコットも変わるから色々ためしてみて{s}！',
      ]},
    ],
    trouble: [
      { q: 'ログインできない', qEn: "Can't login", answers: [
        'パスワードをわすれた場合は、リカバリーコードが必要{s}\nログイン画面の「パスワードを忘れた？」から再設定できる{s}',
        'ニックネームとパスワードを確認してみて{s}\nそれでもだめなら、リカバリーコードでパスワードリセット{s}',
      ]},
      { q: 'きろくがきえた', qEn: 'Records disappeared', answers: [
        'ログアウトしてないか確認してみて{s}\n同じアカウントでログインすれば、きろくはサーバーに残ってる{s}',
        'データはサーバーに保存されてるから、同じアカウントでログインすれば大丈夫{s}\nもしきえてたらお問い合わせ{s}',
      ]},
      { q: 'コインがふえない', qEn: "Coins don't increase", answers: [
        'きろくするとコインがもらえる{s}\nデイリーミッションやガチャでもゲットできる{s}！',
        'かつどうを記録したら1コイン{s}\nミッション達成やフレンドの応援でボーナスももらえる{s}！',
      ]},
    ],
    cheer: [
      { q: 'やるきが出ない', qEn: 'No motivation', answers: [
        'だいじょうぶ{s}！今日できることを1つだけやってみよう{s}\nちいさな一歩でも、すごいこと{s}！',
        '無理しなくていい{s}\nでも、ここを開いてくれたってことは、がんばりたい気持ちがある{s}！',
        'きのうよりちょっとだけ多くできたら、それで100点{s}！\nあなたのペースで大丈夫{s}',
      ]},
      { q: 'つかれた', qEn: "I'm tired", answers: [
        'おつかれさま{s}！きちんと休むのもリハビリ{s}\n今日がんばった自分をほめてあげて{s}',
        'いっぱいがんばったんだね{s}\nゆっくり休んで、また明日{s}！',
        '休むことも大切なトレーニング{s}\n体と相談しながら、マイペースでいこう{s}！',
      ]},
      { q: 'ほめて！', qEn: 'Praise me!', answers: [
        'すごい{s}！！リハビリ続けてるの、ほんとにえらい{s}！\nコツコツ続けられるの、なかなかできないこと{s}',
        'えらい{s}！！あなたが毎日がんばってること、ちゃんと知ってる{s}\nこれからも応援してる{s}！',
        'がんばってるね{s}！そのちょうしそのちょうし{s}！\nきろくを見返してみて、すごく成長してるはず{s}！',
      ]},
    ],
    recommend: [
      { q: 'はじめてのおすすめ', qEn: 'For beginners', answers: [
        'まずは「かんたんなストレッチ」カテゴリから始めてみて{s}\n1日1回でも記録できたら、それだけでコインゲット{s}！',
        'まずはかんたんなかつどうからスタート{s}\n「さんぽ」や「ストレッチ」が始めやすい{s}！',
      ]},
      { q: 'コインのためかた', qEn: 'Earning coins', answers: [
        'デイリーミッションを毎日チェックするのがおすすめ{s}\n連続きろくのストリークボーナスも大きい{s}！',
        'かつどうきろく、ミッション、ガチャ、フレンド応援{s}\n全部活用するとコインがたまりやすい{s}！',
      ]},
      { q: 'たのしみかた', qEn: 'How to enjoy', answers: [
        'フレンドを追加してフィードを見るのがたのしい{s}\nお互い応援しあえるとモチベーションUP{s}！',
        'テーマを変えたり、バッジを集めたり{s}\nご褒美リストに好きなものを入れて、目標にするのもおすすめ{s}！',
      ]},
    ],
    about: [
      { q: 'リハコインって？', qEn: 'What is RehaCoin?', answers: [
        'リハビリのかつどうを記録して、コインを貯めるアプリ{s}\nゲーム感覚でリハビリを続けられるように作られてる{s}！',
        'まいにちのリハビリを楽しく記録するためのアプリ{s}\nかつどうするとコインがもらえて、ご褒美と交換できる{s}',
      ]},
      { q: 'マスコットは何者？', qEn: 'Who is the mascot?', answers: [
        '{name}だよ{s}！あなたのリハビリを応援するパートナー{s}\nテーマを変えると、ぼくも変身する{s}！',
        '{name}って呼んで{s}！テーマごとに姿が変わる{s}\nいつもあなたのそばで応援してる{s}！',
      ]},
    ],
  };

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function fillTemplate(text, themeId) {
    const p = PERSONALITIES[themeId] || PERSONALITIES.default;
    return text
      .replace(/\{s\}/g, () => pick(p.suffix))
      .replace(/\{name\}/g, p.name);
  }

  function createChatUI() {
    if (chatEl) return;
    chatEl = document.createElement('div');
    chatEl.id = 'mascot-chat';
    chatEl.innerHTML = `
      <div class="mc-header">
        <span class="mc-name"></span>
        <button class="mc-close">×</button>
      </div>
      <div class="mc-messages"></div>
      <div class="mc-options"></div>
    `;
    document.body.appendChild(chatEl);
    messagesEl = chatEl.querySelector('.mc-messages');

    chatEl.querySelector('.mc-close').addEventListener('click', closeChat);
  }

  function openChat(themeId) {
    createChatUI();
    currentTheme = themeId || getCurrentThemeId();
    const p = PERSONALITIES[currentTheme] || PERSONALITIES.default;
    chatEl.querySelector('.mc-name').textContent = p.name;
    isOpen = true;
    chatEl.classList.add('open');
    messagesEl.innerHTML = '';
    // Greeting + show categories
    addBotMessage(p.greeting);
    setTimeout(() => {
      const ja = (typeof I18n !== 'undefined' && I18n.getLang() === 'ja');
      addBotMessage(ja ? 'なにか聞きたいことある？' : 'What would you like to know?');
      showCategories();
    }, 800);
  }

  function closeChat() {
    isOpen = false;
    if (chatEl) chatEl.classList.remove('open');
  }

  function getCurrentThemeId() {
    return localStorage.getItem('rehacoin_current_theme') || 'default';
  }

  function addBotMessage(text) {
    const div = document.createElement('div');
    div.className = 'mc-msg mc-bot';
    // Typing indicator first
    div.innerHTML = '<span class="mc-typing"><span>.</span><span>.</span><span>.</span></span>';
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    const delay = 400 + Math.random() * 600;
    setTimeout(() => {
      div.innerHTML = '';
      // Type out text character by character
      typeText(div, text, 0);
    }, delay);
  }

  function typeText(el, text, idx) {
    if (idx >= text.length) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return;
    }
    const ch = text[idx];
    if (ch === '\n') {
      el.appendChild(document.createElement('br'));
    } else {
      el.appendChild(document.createTextNode(ch));
    }
    const speed = 25 + Math.random() * 35;
    setTimeout(() => typeText(el, text, idx + 1), speed);
    if (idx % 5 === 0) messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function addUserMessage(text) {
    const div = document.createElement('div');
    div.className = 'mc-msg mc-user';
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function showCategories() {
    const optionsEl = chatEl.querySelector('.mc-options');
    const ja = (typeof I18n !== 'undefined' && I18n.getLang() === 'ja');
    optionsEl.innerHTML = '';
    CATEGORIES.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'mc-option-btn';
      btn.textContent = `${cat.icon} ${ja ? cat.label : cat.labelEn}`;
      btn.addEventListener('click', () => {
        addUserMessage(ja ? cat.label : cat.labelEn);
        optionsEl.innerHTML = '';
        showSubTopics(cat.id);
      });
      optionsEl.appendChild(btn);
    });
  }

  function showSubTopics(categoryId) {
    const topics = RESPONSES[categoryId];
    if (!topics) return;
    const ja = (typeof I18n !== 'undefined' && I18n.getLang() === 'ja');
    const p = PERSONALITIES[currentTheme] || PERSONALITIES.default;

    setTimeout(() => {
      addBotMessage(fillTemplate(ja ? 'どれについて聞きたい{s}？' : 'Which topic{s}?', currentTheme));
      setTimeout(() => {
        const optionsEl = chatEl.querySelector('.mc-options');
        optionsEl.innerHTML = '';
        topics.forEach(topic => {
          const btn = document.createElement('button');
          btn.className = 'mc-option-btn mc-option-sub';
          btn.textContent = ja ? topic.q : topic.qEn;
          btn.addEventListener('click', () => {
            addUserMessage(ja ? topic.q : topic.qEn);
            optionsEl.innerHTML = '';
            const answer = fillTemplate(pick(topic.answers), currentTheme);
            setTimeout(() => {
              addBotMessage(answer);
              // After answer, show "more?" options
              setTimeout(() => showFollowUp(categoryId), answer.length * 35 + 1000);
            }, 300);
          });
          optionsEl.appendChild(btn);
        });
        // Back button
        const backBtn = document.createElement('button');
        backBtn.className = 'mc-option-btn mc-option-back';
        backBtn.textContent = ja ? '← もどる' : '← Back';
        backBtn.addEventListener('click', () => {
          optionsEl.innerHTML = '';
          showCategories();
        });
        optionsEl.appendChild(backBtn);
      }, 1200);
    }, 200);
  }

  function showFollowUp(lastCategoryId) {
    const ja = (typeof I18n !== 'undefined' && I18n.getLang() === 'ja');
    addBotMessage(fillTemplate(ja ? 'ほかに聞きたいことある{s}？' : 'Anything else{s}?', currentTheme));
    setTimeout(() => {
      const optionsEl = chatEl.querySelector('.mc-options');
      optionsEl.innerHTML = '';
      // Same category
      const sameBtn = document.createElement('button');
      sameBtn.className = 'mc-option-btn';
      const cat = CATEGORIES.find(c => c.id === lastCategoryId);
      sameBtn.textContent = ja ? `${cat.icon} ${cat.label}のつづき` : `${cat.icon} More ${cat.labelEn}`;
      sameBtn.addEventListener('click', () => {
        optionsEl.innerHTML = '';
        showSubTopics(lastCategoryId);
      });
      optionsEl.appendChild(sameBtn);
      // Other categories
      const otherBtn = document.createElement('button');
      otherBtn.className = 'mc-option-btn';
      otherBtn.textContent = ja ? '📋 ほかのカテゴリ' : '📋 Other topics';
      otherBtn.addEventListener('click', () => {
        optionsEl.innerHTML = '';
        showCategories();
      });
      optionsEl.appendChild(otherBtn);
      // Close
      const closeBtn = document.createElement('button');
      closeBtn.className = 'mc-option-btn mc-option-back';
      closeBtn.textContent = ja ? '👋 おわる' : '👋 Close';
      closeBtn.addEventListener('click', () => {
        addBotMessage(fillTemplate(ja ? 'またいつでも話しかけて{s}！' : 'Talk to me anytime{s}!', currentTheme));
        optionsEl.innerHTML = '';
        setTimeout(closeChat, 1500);
      });
      optionsEl.appendChild(closeBtn);
    }, 1500);
  }

  function toggle() {
    if (isOpen) closeChat();
    else openChat();
  }

  return { openChat, closeChat, toggle, isOpen: () => isOpen };
})();
