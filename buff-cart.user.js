// ==UserScript==
// @name         CS2  BUFF 購物車
// @namespace    https://github.com/yuijst/cs2-buff-cart
// @version      2.1
// @description  在 BUFF 加入 3 槽位購物車，支援港幣/台幣一鍵切換、實時抓取價格、手續費、預算提醒與分享/導入清單
// @author       yuijst
// @license      MIT
// @match        https://buff.163.com/*
// @grant        GM_addStyle
// @downloadURL  https://raw.githubusercontent.com/yuijst/cs2-buff-cart/main/buff-cart.user.js
// @updateURL    https://raw.githubusercontent.com/yuijst/cs2-buff-cart/main/buff-cart.user.js
// ==/UserScript==

(function () {
  'use strict';

  const OLD_CART_KEY = 'buff_hkd_cart_v1';
  const STORAGE_SLOTS = 'buff_hkd_slots_v2';
  const STORAGE_CFG = 'buff_hkd_cfg_v1';

  const CURRENCIES = {
    HKD: { code: 'HKD', symbol: 'HK$', name: '港幣', defaultRate: 1.174 },
    TWD: { code: 'TWD', symbol: 'NT$', name: '台幣', defaultRate: 4.5 }
  };

  function loadSlotsState() {
    const saved = localStorage.getItem(STORAGE_SLOTS);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.slots) && parsed.slots.length === 3) {
          return parsed;
        }
      } catch (e) {}
    }
    let oldItems = [];
    try {
      oldItems = JSON.parse(localStorage.getItem(OLD_CART_KEY) || '[]');
    } catch (e) {}
    return {
      active: 0,
      slots: [
        { name: '方案 1', items: Array.isArray(oldItems) ? oldItems : [] },
        { name: '方案 2', items: [] },
        { name: '方案 3', items: [] }
      ]
    };
  }

  function loadCfg() {
    let raw = {};
    try {
      raw = JSON.parse(localStorage.getItem(STORAGE_CFG) || '{}');
    } catch (e) {}
    const rates = Object.assign(
      { HKD: raw.rate || CURRENCIES.HKD.defaultRate, TWD: CURRENCIES.TWD.defaultRate },
      raw.rates || {}
    );
    return {
      currency: raw.currency === 'TWD' ? 'TWD' : 'HKD',
      rates,
      fee: typeof raw.fee === 'number' ? raw.fee : 0,
      budget: typeof raw.budget === 'number' ? raw.budget : 0,
      open: Boolean(raw.open)
    };
  }

  let state = loadSlotsState();
  let cfg = loadCfg();

  function getCur() {
    const meta = CURRENCIES[cfg.currency] || CURRENCIES.HKD;
    const rate = cfg.rates[meta.code] || meta.defaultRate;
    return { ...meta, rate };
  }

  function getActiveCart() {
    return state.slots[state.active].items;
  }

  function saveState() {
    localStorage.setItem(STORAGE_SLOTS, JSON.stringify(state));
    localStorage.setItem(STORAGE_CFG, JSON.stringify(cfg));
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function parsePrice(text) {
    if (!text) return null;
    const cleaned = text.replace(/,/g, '');
    const m = cleaned.match(/(\d+(?:\.\d+)?)/);
    return m ? parseFloat(m[1]) : null;
  }

  function calcLocal(cny) {
    const cur = getCur();
    return cny * cur.rate * (1 + cfg.fee / 100);
  }

  function encodeShareCode(items) {
    const compact = items.map((i) => ({
      n: i.name,
      p: i.priceCNY,
      u: i.url || '',
      t: i.note || ''
    }));
    const json = JSON.stringify(compact);
    return 'BUFFCART:' + btoa(unescape(encodeURIComponent(json)));
  }

  function decodeShareCode(inputText) {
    const match = String(inputText).match(/BUFFCART:([A-Za-z0-9+/=]+)/);
    if (!match) return null;
    const json = decodeURIComponent(escape(atob(match[1])));
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return null;
    return arr
      .filter((i) => i && typeof i.n === 'string' && typeof i.p === 'number')
      .map((i) => ({
        name: i.n,
        priceCNY: i.p,
        url: i.u || 'https://buff.163.com/market/csgo',
        note: i.t || ''
      }));
  }

  const css = `
    .cs2-hkd-add-btn {
      display: inline-block;
      margin-top: 6px;
      padding: 3px 8px;
      background: #f59e0b;
      color: #0f172a !important;
      border: none;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      line-height: 1.4;
      transition: background 0.15s;
    }
    .cs2-hkd-add-btn:hover { background: #d97706; }
    .cs2-hkd-add-btn.added { background: #22c55e; color: #fff !important; }

    #cs2-hkd-dock {
      position: fixed;
      right: 20px;
      bottom: 20px;
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #f8fafc;
    }
    #cs2-hkd-toggle {
      background: #0f172a;
      border: 2px solid #f59e0b;
      color: #f8fafc;
      padding: 10px 16px;
      border-radius: 999px;
      cursor: pointer;
      font-weight: 700;
      font-size: 14px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.45);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    #cs2-hkd-toggle span.hkd { color: #f59e0b; }

    #cs2-hkd-panel {
      width: 390px;
      max-height: 82vh;
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 12px;
      box-shadow: 0 12px 36px rgba(0,0,0,0.6);
      display: none;
      flex-direction: column;
      overflow: hidden;
    }
    #cs2-hkd-panel.open { display: flex; }

    .cs2-hkd-head {
      background: #1e293b;
      padding: 10px 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      border-bottom: 1px solid #334155;
    }
    .cs2-hkd-head h3 { margin: 0; font-size: 15px; color: #f59e0b; white-space: nowrap; }
    .cs2-hkd-head-right { display: flex; align-items: center; gap: 8px; }

    .cs2-cur-switch {
      display: inline-flex;
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 6px;
      overflow: hidden;
    }
    .cs2-cur-btn {
      background: transparent;
      border: none;
      color: #94a3b8;
      font-size: 11px;
      font-weight: 700;
      padding: 4px 8px;
      cursor: pointer;
    }
    .cs2-cur-btn.active {
      background: #f59e0b;
      color: #0f172a;
    }

    #cs2-hkd-close {
      background: transparent;
      border: none;
      color: #94a3b8;
      font-size: 18px;
      cursor: pointer;
      padding: 0 4px;
    }
    #cs2-hkd-close:hover { color: #fff; }

    .cs2-hkd-tabs {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      background: #0f172a;
      border-bottom: 1px solid #334155;
    }
    .cs2-hkd-tab {
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      color: #94a3b8;
      padding: 8px 4px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
    }
    .cs2-hkd-tab:hover { color: #f8fafc; background: #162033; }
    .cs2-hkd-tab.active {
      color: #f59e0b;
      border-bottom-color: #f59e0b;
      background: #162033;
    }

    .cs2-hkd-cfg {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 8px;
      padding: 10px 14px;
      background: #162033;
      border-bottom: 1px solid #334155;
      font-size: 12px;
    }
    .cs2-hkd-cfg label { display: flex; flex-direction: column; gap: 3px; color: #94a3b8; }
    .cs2-hkd-cfg input {
      width: 100%;
      box-sizing: border-box;
      padding: 4px 6px;
      border-radius: 4px;
      border: 1px solid #334155;
      background: #0f172a;
      color: #fff;
      font-size: 12px;
    }

    .cs2-hkd-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px 14px;
      max-height: 300px;
    }
    .cs2-hkd-empty { color: #94a3b8; font-size: 13px; text-align: center; padding: 24px 0; }
    .cs2-hkd-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      padding: 8px 0;
      border-bottom: 1px solid #1e293b;
    }
    .cs2-hkd-item:last-child { border-bottom: none; }
    .cs2-hkd-item-info { min-width: 0; flex: 1; }
    .cs2-hkd-item-name {
      font-size: 13px;
      color: #f8fafc;
      text-decoration: none;
      display: block;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .cs2-hkd-item-name:hover { color: #f59e0b; text-decoration: underline; }
    .cs2-hkd-item-sub { font-size: 11px; color: #94a3b8; margin-top: 2px; }
    .cs2-hkd-del {
      background: #ef4444;
      color: #fff;
      border: none;
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 11px;
      cursor: pointer;
    }

    .cs2-hkd-foot {
      background: #1e293b;
      padding: 12px 14px;
      border-top: 1px solid #334155;
      font-size: 13px;
      line-height: 1.7;
    }
    .cs2-hkd-total-row { display: flex; justify-content: space-between; align-items: baseline; }
    .cs2-hkd-big { font-size: 18px; font-weight: 800; color: #f59e0b; }
    .cs2-hkd-budget { font-size: 12px; margin-top: 2px; }
    .cs2-hkd-budget.ok { color: #4ade80; }
    .cs2-hkd-budget.over { color: #f87171; font-weight: 700; }

    .cs2-hkd-actions { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; margin-top: 10px; }
    .cs2-hkd-actions button {
      padding: 6px 4px;
      border-radius: 6px;
      border: none;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
    }
    .cs2-btn-share { background: #2563eb; color: #fff; }
    .cs2-btn-share:hover { background: #1d4ed8; }
    .cs2-btn-import { background: #0d9488; color: #fff; }
    .cs2-btn-import:hover { background: #0f766e; }
    .cs2-btn-clear { background: #334155; color: #f8fafc; }
    .cs2-btn-clear:hover { background: #475569; }
  `;

  if (typeof GM_addStyle === 'function') {
    GM_addStyle(css);
  } else {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  const dock = document.createElement('div');
  dock.id = 'cs2-hkd-dock';
  dock.innerHTML = `
    <button id="cs2-hkd-toggle" type="button">
      🛒 <span id="cs2-hkd-slot-label">方案 1</span> (<span id="cs2-hkd-badge">0</span>) ｜ <span class="hkd"><span id="cs2-mini-sym">HK$</span> <span id="cs2-hkd-mini">0.0</span></span>
    </button>
    <div id="cs2-hkd-panel">
      <div class="cs2-hkd-head">
        <h3>BUFF 購物車</h3>
        <div class="cs2-hkd-head-right">
          <div class="cs2-cur-switch">
            <button class="cs2-cur-btn" data-cur="HKD" type="button">HKD 港幣</button>
            <button class="cs2-cur-btn" data-cur="TWD" type="button">TWD 台幣</button>
          </div>
          <button id="cs2-hkd-close" type="button" title="縮小">✕</button>
        </div>
      </div>
      <div class="cs2-hkd-tabs">
        <button class="cs2-hkd-tab" data-slot="0" type="button">方案 1 (0)</button>
        <button class="cs2-hkd-tab" data-slot="1" type="button">方案 2 (0)</button>
        <button class="cs2-hkd-tab" data-slot="2" type="button">方案 3 (0)</button>
      </div>
      <div class="cs2-hkd-cfg">
        <label><span id="cs2-lbl-rate">匯率 (1¥→HK$)</span><input id="cs2-cfg-rate" type="number" step="0.001" /></label>
        <label>損耗/手續費 (%)<input id="cs2-cfg-fee" type="number" step="0.1" /></label>
        <label><span id="cs2-lbl-budget">預算 (HK$)</span><input id="cs2-cfg-budget" type="number" step="50" placeholder="0=不限" /></label>
      </div>
      <div id="cs2-hkd-list" class="cs2-hkd-list"></div>
      <div class="cs2-hkd-foot">
        <div class="cs2-hkd-total-row">
          <span>BUFF 總計 (CNY)</span>
          <strong>¥ <span id="cs2-sum-cny">0.00</span></strong>
        </div>
        <div class="cs2-hkd-total-row">
          <span id="cs2-lbl-total">實付港幣 (HKD)</span>
          <span class="cs2-hkd-big"><span id="cs2-sum-sym">HK$</span> <span id="cs2-sum-local">0.00</span></span>
        </div>
        <div id="cs2-hkd-budget-msg" class="cs2-hkd-budget"></div>
        <div class="cs2-hkd-actions">
          <button id="cs2-hkd-share" class="cs2-btn-share" type="button">分享清單</button>
          <button id="cs2-hkd-import" class="cs2-btn-import" type="button">導入清單</button>
          <button id="cs2-hkd-clear" class="cs2-btn-clear" type="button">清空本槽</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(dock);

  const toggleBtn = document.getElementById('cs2-hkd-toggle');
  const panel = document.getElementById('cs2-hkd-panel');
  const rateInput = document.getElementById('cs2-cfg-rate');
  const feeInput = document.getElementById('cs2-cfg-fee');
  const budgetInput = document.getElementById('cs2-cfg-budget');
  const tabBtns = dock.querySelectorAll('.cs2-hkd-tab');
  const curBtns = dock.querySelectorAll('.cs2-cur-btn');

  feeInput.value = cfg.fee;
  budgetInput.value = cfg.budget || '';

  function syncCurrencyInputs() {
    const cur = getCur();
    rateInput.value = cur.rate;
    document.getElementById('cs2-lbl-rate').textContent = `匯率 (1¥→${cur.symbol})`;
    document.getElementById('cs2-lbl-budget').textContent = `預算 (${cur.symbol})`;
    document.getElementById('cs2-lbl-total').textContent = `實付${cur.name} (${cur.code})`;
    document.getElementById('cs2-mini-sym').textContent = cur.symbol;
    document.getElementById('cs2-sum-sym').textContent = cur.symbol;
    curBtns.forEach((b) => b.classList.toggle('active', b.dataset.cur === cur.code));
  }

  function setPanelOpen(isOpen) {
    cfg.open = isOpen;
    panel.classList.toggle('open', isOpen);
    toggleBtn.style.display = isOpen ? 'none' : 'flex';
    saveState();
  }

  toggleBtn.addEventListener('click', () => setPanelOpen(true));
  document.getElementById('cs2-hkd-close').addEventListener('click', () => setPanelOpen(false));

  curBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      cfg.currency = btn.dataset.cur;
      saveState();
      syncCurrencyInputs();
      renderCart();
    });
  });

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      state.active = Number(btn.dataset.slot);
      saveState();
      renderCart();
    });
  });

  document.getElementById('cs2-hkd-clear').addEventListener('click', () => {
    const cart = getActiveCart();
    if (!cart.length) return;
    if (confirm(`確定要清空「${state.slots[state.active].name}」內的所有皮膚嗎？`)) {
      state.slots[state.active].items = [];
      saveState();
      renderCart();
    }
  });

  document.getElementById('cs2-hkd-share').addEventListener('click', async () => {
    const cart = getActiveCart();
    if (!cart.length) {
      alert('目前槽位是空的，先加入幾件皮膚再分享吧！');
      return;
    }
    const cur = getCur();
    let sumCNY = 0;
    const lines = cart.map((item, i) => {
      sumCNY += item.priceCNY;
      return `${i + 1}. ${item.name} - ¥${item.priceCNY.toFixed(2)} (${cur.symbol}${calcLocal(item.priceCNY).toFixed(1)})`;
    });
    const code = encodeShareCode(cart);
    const shareText = [
      `【CS2 BUFF 購物清單 - ${state.slots[state.active].name}】`,
      ...lines,
      `總計：¥${sumCNY.toFixed(2)} ｜ 實付約 ${cur.symbol}${calcLocal(sumCNY).toFixed(2)}（匯率 ${cur.rate}，手續費 ${cfg.fee}%）`,
      `---`,
      `導入代碼（複製整段貼進「導入清單」即可還原）：`,
      code
    ].join('\n');

    try {
      await navigator.clipboard.writeText(shareText);
      const btn = document.getElementById('cs2-hkd-share');
      btn.textContent = '✓ 已複製！';
      setTimeout(() => (btn.textContent = '分享清單'), 1500);
    } catch (e) {
      prompt('請手動複製以下分享內容：', shareText);
    }
  });

  document.getElementById('cs2-hkd-import').addEventListener('click', () => {
    const raw = prompt('請貼上朋友分享的訊息（或 BUFFCART: 開頭的導入代碼）：');
    if (!raw || !raw.trim()) return;
    try {
      const items = decodeShareCode(raw.trim());
      if (!items || !items.length) {
        alert('找不到有效的導入代碼，請確認有完整複製 BUFFCART:... 這一段。');
        return;
      }
      const current = getActiveCart();
      if (current.length > 0) {
        const replace = confirm(
          `目前「${state.slots[state.active].name}」已有 ${current.length} 件皮膚。\n按「確定」覆蓋目前清單，按「取消」則追加在後面。`
        );
        state.slots[state.active].items = replace ? items : current.concat(items);
      } else {
        state.slots[state.active].items = items;
      }
      saveState();
      renderCart();
      alert(`成功導入 ${items.length} 件皮膚到「${state.slots[state.active].name}」！`);
    } catch (e) {
      alert('導入失敗：代碼格式不正確或已被截斷。');
    }
  });

  rateInput.addEventListener('input', () => {
    const cur = getCur();
    cfg.rates[cur.code] = parseFloat(rateInput.value) || cur.defaultRate;
    saveState();
    renderCart();
  });

  [feeInput, budgetInput].forEach((el) => {
    el.addEventListener('input', () => {
      cfg.fee = parseFloat(feeInput.value) || 0;
      cfg.budget = parseFloat(budgetInput.value) || 0;
      saveState();
      renderCart();
    });
  });

  function addItem(name, priceCNY, url, note = '') {
    getActiveCart().push({ name, priceCNY, url, note });
    saveState();
    renderCart();
  }

  function renderCart() {
    const cart = getActiveCart();
    const cur = getCur();
    const list = document.getElementById('cs2-hkd-list');
    let sumCNY = 0;

    tabBtns.forEach((btn, idx) => {
      const slot = state.slots[idx];
      btn.textContent = `${slot.name} (${slot.items.length})`;
      btn.classList.toggle('active', idx === state.active);
    });

    if (!cart.length) {
      list.innerHTML = `<div class="cs2-hkd-empty">「${state.slots[state.active].name}」目前是空的，點擊頁面上的「+ 加入購物車」即可累加！</div>`;
    } else {
      list.innerHTML = cart
        .map((item, idx) => {
          sumCNY += item.priceCNY;
          const localPrice = calcLocal(item.priceCNY);
          return `
            <div class="cs2-hkd-item">
              <div class="cs2-hkd-item-info">
                <a class="cs2-hkd-item-name" href="${escapeHtml(item.url)}" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</a>
                <div class="cs2-hkd-item-sub">¥ ${item.priceCNY.toFixed(2)} ｜ ${cur.symbol} ${localPrice.toFixed(1)}${item.note ? ' ｜ ' + escapeHtml(item.note) : ''}</div>
              </div>
              <button class="cs2-hkd-del" data-idx="${idx}" type="button">移除</button>
            </div>
          `;
        })
        .join('');

      list.querySelectorAll('.cs2-hkd-del').forEach((btn) => {
        btn.addEventListener('click', () => {
          cart.splice(Number(btn.dataset.idx), 1);
          saveState();
          renderCart();
        });
      });
    }

    const totalLocal = calcLocal(sumCNY);
    document.getElementById('cs2-hkd-slot-label').textContent = state.slots[state.active].name;
    document.getElementById('cs2-hkd-badge').textContent = cart.length;
    document.getElementById('cs2-hkd-mini').textContent = totalLocal.toFixed(1);
    document.getElementById('cs2-sum-cny').textContent = sumCNY.toFixed(2);
    document.getElementById('cs2-sum-local').textContent = totalLocal.toFixed(2);

    const budgetMsg = document.getElementById('cs2-hkd-budget-msg');
    if (cfg.budget > 0) {
      const diff = cfg.budget - totalLocal;
      if (diff >= 0) {
        budgetMsg.className = 'cs2-hkd-budget ok';
        budgetMsg.textContent = `預算剩餘：${cur.symbol} ${diff.toFixed(1)}`;
      } else {
        budgetMsg.className = 'cs2-hkd-budget over';
        budgetMsg.textContent = `⚠️ 已超出預算：${cur.symbol} ${Math.abs(diff).toFixed(1)}`;
      }
    } else {
      budgetMsg.textContent = '';
    }
  }

  function injectButtons() {
    document.querySelectorAll('ul.card_csgo > li, .list_card li').forEach((card) => {
      if (card.dataset.hkdInjected) return;
      const titleEl = card.querySelector('h3 a');
      const priceEl = card.querySelector('p strong.f_Strong, .f_Strong');
      if (!titleEl || !priceEl) return;

      const price = parsePrice(priceEl.textContent);
      if (!price) return;

      card.dataset.hkdInjected = '1';
      const name = (titleEl.getAttribute('title') || titleEl.textContent).trim();
      const url = titleEl.href;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cs2-hkd-add-btn';
      btn.textContent = '+ 加入購物車';
      btn.style.width = '100%';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        addItem(name, price, url);
        btn.textContent = `✓ 已加入${state.slots[state.active].name}`;
        btn.classList.add('added');
        setTimeout(() => {
          btn.textContent = '+ 加入購物車';
          btn.classList.remove('added');
        }, 900);
      });

      const priceRow = priceEl.closest('p') || card;
      priceRow.appendChild(btn);
    });

    const goodsTitleEl = document.querySelector('.detail-cont h1, h1');
    const goodsName = goodsTitleEl ? goodsTitleEl.textContent.trim() : document.title;

    document.querySelectorAll('tr.selling').forEach((row) => {
      if (row.dataset.hkdInjected) return;
      const priceEl = row.querySelector('strong.f_Strong');
      if (!priceEl) return;

      const price = parsePrice(priceEl.textContent);
      if (!price) return;

      row.dataset.hkdInjected = '1';
      const wearEl = row.querySelector('.wear-value');
      const note = wearEl ? wearEl.textContent.trim() : '';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cs2-hkd-add-btn';
      btn.textContent = '+ 加入購物車';
      btn.style.marginLeft = '6px';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        addItem(goodsName, price, location.href, note);
        btn.textContent = '✓ 已加入';
        btn.classList.add('added');
        setTimeout(() => {
          btn.textContent = '+ 加入購物車';
          btn.classList.remove('added');
        }, 900);
      });

      const targetCell = row.querySelector('td:last-child') || priceEl.parentElement;
      targetCell.appendChild(btn);
    });
  }

  syncCurrencyInputs();
  setPanelOpen(cfg.open);
  renderCart();
  injectButtons();

  const observer = new MutationObserver(() => injectButtons());
  observer.observe(document.body, { childList: true, subtree: true });
})();
