// blockchain.js — SHA-256ハッシュチェーン、マイニング、検証

const Blockchain = (() => {
  const CHAIN_KEY = 'rehacoin_chain';
  const DIFFICULTY = 2; // ハッシュ先頭 "00" を要求
  const PREFIX = '0'.repeat(DIFFICULTY);
  const MIN_MINE_MS = 800;
  const MAX_MINE_MS = 2500;

  // --- SHA-256 (Web Crypto API) ---
  async function sha256(text) {
    const data = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // --- チェーン永続化 ---
  function getChain() {
    try {
      return JSON.parse(localStorage.getItem(CHAIN_KEY)) || [];
    } catch {
      return [];
    }
  }

  function saveChain(chain) {
    localStorage.setItem(CHAIN_KEY, JSON.stringify(chain));
  }

  function clearChain() {
    localStorage.removeItem(CHAIN_KEY);
  }

  // --- ブロックハッシュ計算 ---
  async function calcHash(block) {
    const str = block.index + block.timestamp + JSON.stringify(block.data) + block.prevHash + block.nonce;
    return sha256(str);
  }

  // --- ジェネシスブロック ---
  async function createGenesisBlock() {
    const block = {
      index: 0,
      timestamp: Date.now(),
      data: { type: 'genesis', message: 'リハコイン ブロックチェーン開始' },
      prevHash: '0'.repeat(64),
      nonce: 0,
      hash: ''
    };
    block.hash = await calcHash(block);
    return block;
  }

  // --- マイニング（rAFベースでUIブロック防止） ---
  // onProgress(nonce, hash) コールバックで演出更新
  async function mineBlock(data, onProgress) {
    const chain = getChain();
    const prev = chain[chain.length - 1];
    const block = {
      index: prev.index + 1,
      timestamp: Date.now(),
      data,
      prevHash: prev.hash,
      nonce: 0,
      hash: ''
    };

    const startTime = Date.now();

    // nonceを探索（rAFで分割）
    return new Promise((resolve) => {
      let nonce = 0;
      const BATCH = 32; // 1フレームあたりの試行数

      async function step() {
        for (let i = 0; i < BATCH; i++) {
          block.nonce = nonce;
          block.hash = await calcHash(block);

          if (onProgress && nonce % 16 === 0) {
            onProgress(nonce, block.hash);
          }

          if (block.hash.startsWith(PREFIX)) {
            // 最低時間を保証
            const elapsed = Date.now() - startTime;
            if (elapsed < MIN_MINE_MS) {
              await new Promise(r => setTimeout(r, MIN_MINE_MS - elapsed));
            }
            chain.push(block);
            saveChain(chain);
            resolve(block);
            return;
          }
          nonce++;
        }

        // タイムアウト：最大時間超過なら現在のnonceで強制確定
        if (Date.now() - startTime > MAX_MINE_MS) {
          // difficulty無視で確定（演出優先）
          block.nonce = nonce;
          block.hash = await calcHash(block);
          chain.push(block);
          saveChain(chain);
          resolve(block);
          return;
        }

        requestAnimationFrame(step);
      }

      requestAnimationFrame(step);
    });
  }

  // --- チェーン検証 ---
  async function verifyChain() {
    const chain = getChain();
    if (chain.length === 0) return { valid: true, length: 0, errors: [] };

    const errors = [];

    // ジェネシスブロック検証
    const genesisHash = await calcHash(chain[0]);
    if (genesisHash !== chain[0].hash) {
      errors.push({ index: 0, message: 'ジェネシスブロックのハッシュが不正' });
    }

    for (let i = 1; i < chain.length; i++) {
      const block = chain[i];
      const prev = chain[i - 1];

      // prevHashの整合性
      if (block.prevHash !== prev.hash) {
        errors.push({ index: i, message: `prevHashが前ブロックのhashと不一致` });
      }

      // ハッシュ再計算
      const recalc = await calcHash(block);
      if (recalc !== block.hash) {
        errors.push({ index: i, message: `ハッシュ再計算が一致しない` });
      }
    }

    return { valid: errors.length === 0, length: chain.length, errors };
  }

  // --- 既存レコードのマイグレーション ---
  // onProgress(current, total) コールバック
  async function migrateExistingRecords(onProgress) {
    const chain = getChain();
    if (chain.length > 0) return false; // 既にチェーンがある

    const records = Store.getRecords().sort((a, b) => a.timestamp - b.timestamp);
    if (records.length === 0) {
      // レコードなし → ジェネシスのみ
      const genesis = await createGenesisBlock();
      saveChain([genesis]);
      return false;
    }

    // ジェネシス生成
    const newChain = [await createGenesisBlock()];
    const total = records.length;

    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      const prev = newChain[newChain.length - 1];
      const block = {
        index: newChain.length,
        timestamp: r.timestamp,
        data: {
          recordId: r.id,
          activityId: r.activityId,
          label: r.label,
          icon: r.icon,
          categoryCode: r.categoryCode
        },
        prevHash: prev.hash,
        nonce: 0,
        hash: ''
      };

      // マイグレーションではdifficulty無視（高速処理）
      block.hash = await calcHash(block);
      newChain.push(block);

      if (onProgress && i % 10 === 0) {
        onProgress(i + 1, total);
        // UIフリーズ防止
        await new Promise(r => setTimeout(r, 0));
      }
    }

    saveChain(newChain);
    return true; // マイグレーション実行
  }

  // --- 初期化 ---
  async function init(onMigrationProgress) {
    const chain = getChain();
    if (chain.length === 0) {
      const migrated = await migrateExistingRecords(onMigrationProgress);
      if (!migrated) {
        // レコードもない場合はジェネシスだけ作成済み
      }
      return migrated;
    }
    return false;
  }

  // --- 公開API ---
  return {
    init,
    getChain,
    clearChain,
    mineBlock,
    verifyChain,
    sha256
  };
})();
