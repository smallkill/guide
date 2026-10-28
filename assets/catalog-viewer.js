/* catalog-viewer.js — 收藏圖鑑共用檢視器(行為以 yuping/plush 為準)
 *
 * 頁面需要的 DOM(id 固定):
 *   header > .wrap: #tgl(篩選/搜尋 收合鈕)、#views(縮圖/照片)、[#tabs]、.panel(#sub #q #modes #chips)
 *   #count、#grid、#modal > .box > #close + #mimg + #mbody
 *
 * CatalogViewer.init(cfg) 只要提供資料與欄位對應,行為(收合、檢視切換、縮圖滑動、
 * 點擊 vs 滑動、照片模式、大圖視窗、懶載入)都在這裡。cfg 欄位:
 *   load()        -> Promise<{items, build?, raw?}>  或用 json:'items.json' + parse(d)->{items,build}
 *   imgBase       圖片路徑前綴(預設 'images/'),會 encodeURI 並加 ?v=build
 *   emptyIcon     沒圖時顯示的 emoji
 *   name(c)       主要名稱
 *   photos(c)     照片路徑陣列(預設 c.photos || [c.main_image])
 *   mainImage(c)  單張照片卡的縮圖(預設 c.main_image)
 *   photoLabel(p,c,i) -> [標籤, 'mine'|'' , 額外 class(會加在 .sl 與 .pth)]
 *   thumb:{badges(c), meta(c)}            縮圖卡:圖上徽章 HTML、下方文字 HTML
 *   photo:{code(c), conf(c)->[cls,label]|null, sub(c), pills(c)->[str|{t,cls}], note(c)}  照片卡
 *   detail(c)     大圖視窗下方內容 HTML
 *   search(c)     -> 可搜尋字串陣列(空白分詞 AND、不分大小寫)
 *   chips:{values(c)->[], top:14}         分類篩選 chip(再點一次取消)
 *   modes:[{id,label,key(c),order?(keys,groups),label?(k),sort?(a,b)}]  分組方式(依作品/依廠商…)
 *   tabs:[{id,label,intro?,match(c)}]     分頁(收合時仍顯示;標籤後自動附符合件數)
 *   summary(raw,items) / count(list,items)  #sub、#count 文字
 *   onLoad(raw,items)  資料載入後、第一次 render 前
 *   keyArrows     大圖視窗支援鍵盤 ←/→(預設 false,plush 原本沒有)
 *
 * 注意:thumb.badges / thumb.meta / detail / tabs[].intro 回傳的是 HTML,資料欄位要自己 esc()。
 * 改了本檔或 .css,四頁的 ?v= 要一起改(grep -rl "catalog-viewer" --include=index.html)。
 */
(function () {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = s => document.querySelector(s);

  function init(cfg) {
    const grid = $('#grid');
    const S = { items: [], build: '', filter: null, mode: cfg.modes && cfg.modes.length ? cfg.modes[0].id : null,
      tab: cfg.tabs && cfg.tabs.length ? cfg.tabs[0].id : null, raw: null };
    const imgBase = cfg.imgBase ?? 'images/';
    const ICON = cfg.emptyIcon || '🖼';
    // 先編碼再跳脫:也用在 url('...') 與屬性裡
    const IMG = p => esc(`${imgBase}${encodeURI(p)}${S.build ? ('?v=' + encodeURIComponent(S.build)) : ''}`);
    const nameOf = cfg.name || (c => c.name_zh || c.name_en || c.name_ja || c.id);
    const photoList = cfg.photos || (c => {
      let ps = (c.photos && c.photos.length) ? c.photos.slice() : [];
      if (!ps.length && c.main_image) ps = [c.main_image];
      return ps;
    });
    const mainImage = cfg.mainImage || (c => c.main_image);
    const plabel = cfg.photoLabel || (() => ['', '', '']);
    const T = cfg.thumb || {}, P = cfg.photo || {};

    // ===== HTML =====
    function imgHtml(c, cls) {
      const mi = mainImage(c);
      if (mi) return `<div class="thumb ${cls || ''}" style="background-image:url('${IMG(mi)}')"></div>`;
      return `<div class="thumb none ${cls || ''}">${ICON}</div>`;
    }
    function sliderHtml(c, cls, label) {
      const ps = photoList(c);
      if (!ps.length) return `<div class="thumb none ${cls}">${ICON}</div>`;
      const sl = ps.map((p, i) => { const [l, k, x] = plabel(p, c, i);
        return `<div class="sl${x ? ' ' + x : ''}"><img src="${IMG(p)}" loading="lazy" alt="${esc(label)}">${l ? `<span class="pl ${k}">${esc(l)}</span>` : ''}</div>`; }).join('');
      const multi = ps.length > 1;
      return `<div class="slider ${cls}"><div class="slides" role="group" aria-label="${esc(label)} 照片" ${multi ? 'tabindex="0"' : ''}>${sl}</div>` +
        (multi ? `<div class="dots" aria-hidden="true">${ps.map((_, i) => `<i${i ? '' : ' class="on"'}></i>`).join('')}</div>
    <button type="button" class="sbtn prev" aria-label="上一張">‹</button><button type="button" class="sbtn next" aria-label="下一張">›</button>` : '') + `</div>`;
    }
    // 縮圖卡:多張照片才用滑動條(單張維持靜態縮圖)
    function thumbImg(c) { return photoList(c).length > 1 ? sliderHtml(c, 'tsl', nameOf(c)) : imgHtml(c); }
    function cardThumb(c) {
      return `<div class="card" data-id="${esc(c.id)}">
    <div class="cardhead">${thumbImg(c)}${T.badges ? T.badges(c) : ''}</div>
    <div class="meta">${T.meta ? T.meta(c) : `<div class="nm">${esc(nameOf(c))}</div>`}</div></div>`;
    }
    function cardPhoto(c) {
      const name = nameOf(c);
      const cfv = P.conf ? P.conf(c) : null;
      const cf = cfv ? `<span class="pcf ${esc(cfv[0])}">${esc(cfv[1])}</span>` : '';
      const code = P.code ? P.code(c) : '';
      const sub = P.sub ? P.sub(c) : c.name_ja;
      const pills = (P.pills ? P.pills(c) : []).filter(Boolean).map(x => typeof x === 'object'
        ? `<span class="pill ${esc(x.cls || '')}">${esc(x.t)}</span>` : `<span class="pill">${esc(x)}</span>`).join('');
      const note = P.note ? P.note(c) : c.notes;
      return `<div class="card pcard" data-id="${esc(c.id)}">
    <div class="cardhead">${sliderHtml(c, '', name)}${code ? `<span class="pcode">${esc(code)}</span>` : ''}${cf}</div>
    <div class="meta"><div class="nm">${esc(name)}</div>${sub && sub !== name ? `<div class="nja">${esc(sub)}</div>` : ''}
    ${pills ? `<div class="pills">${pills}</div>` : ''}${note ? `<div class="pnote">${esc(note)}</div>` : ''}</div></div>`;
    }
    const card = c => VIEW === 'photo' ? cardPhoto(c) : cardThumb(c);
    function galleryHtml(c) {
      const ps = photoList(c);
      if (!ps.length) return `<div class="thumb none" style="height:200px">${ICON}</div>`;
      const main = sliderHtml(c, 'msl', nameOf(c));
      if (ps.length === 1) return main;
      const strip = `<div class="strip">` + ps.map((p, i) => { const [l, cl, x] = plabel(p, c, i);
        return `<div class="pth ${cl}${x ? ' ' + x : ''}${i === 0 ? ' on' : ''}" data-i="${i}"><img src="${IMG(p)}" loading="lazy" alt="">${l ? `<span>${esc(l)}</span>` : ''}</div>`; }).join('') + `</div>`;
      return main + strip;
    }

    // ===== 篩選 / 分組 / render =====
    function matches(c, q) {
      if (!q) return true;
      const hay = (cfg.search ? cfg.search(c) : [nameOf(c), c.id]).map(x => Array.isArray(x) ? x.join(' ') : (x ?? '')).join(' ').toLowerCase();
      return q.split(/\s+/).every(t => hay.includes(t));
    }
    const curMode = () => (cfg.modes || []).find(m => m.id === S.mode);
    const curTab = () => (cfg.tabs || []).find(t => t.id === S.tab);
    function render() {
      const q = $('#q').value.trim().toLowerCase();
      let list = S.items.filter(c => matches(c, q));
      if (S.filter) list = list.filter(c => (cfg.chips.values(c) || []).includes(S.filter));
      if (cfg.tabs) {
        const tabs = $('#tabs');
        cfg.tabs.forEach(t => { const b = tabs.querySelector(`[data-t="${t.id}"]`);
          if (b) b.textContent = `${t.label} ${list.filter(t.match).length}`; });
      }
      const tab = curTab();
      if (tab) list = list.filter(tab.match);
      const gcls = `grid${VIEW === 'photo' ? ' pgrid' : ''}`;
      const intro = tab && tab.intro ? `<p class="tabintro">${tab.intro}</p>` : '';
      const m = curMode();
      let html;
      if (m) {
        const groups = {};
        list.forEach(c => { const k = m.key(c); (groups[k] = groups[k] || []).push(c); });
        if (m.sort) Object.values(groups).forEach(a => a.sort(m.sort));
        const keys = m.order ? m.order(Object.keys(groups), groups)
          : Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length || a.localeCompare(b, 'ja'));
        html = keys.filter(k => groups[k] && groups[k].length).map(k => `<div class="gsec"><div class="ghdr">${esc(m.groupLabel ? m.groupLabel(k) : k)}<span>${groups[k].length}</span></div>
    <div class="${gcls}">${groups[k].map(card).join('')}</div></div>`).join('');
      } else {
        html = list.length ? `<div class="gsec"><div class="${gcls}">${list.map(card).join('')}</div></div>` : '';
      }
      grid.innerHTML = intro + (html || `<div class="count">${esc(cfg.emptyText || '沒有符合的項目')}</div>`);
      $('#count').textContent = cfg.count ? cfg.count(list, S.items) : `顯示 ${list.length} / ${S.items.length} 件`;
      syncTgl();
    }

    // ===== 大圖視窗 =====
    const modal = $('#modal'), mimg = $('#mimg');
    function open(id, idx) {
      const c = S.items.find(x => x.id === id); if (!c) return;
      mimg.innerHTML = galleryHtml(c);
      $('#mbody').innerHTML = cfg.detail ? cfg.detail(c) : `<h2>${esc(nameOf(c))}</h2>`;
      modal.classList.add('on');
      const ms = mimg.querySelector('.slides');
      if (ms) { ms.scrollLeft = Math.max(0, idx | 0) * ms.clientWidth; updSlide(ms); }
    }
    const closeModal = () => modal.classList.remove('on');
    // 滑動後放開不算點擊:位移 >10px 或 slides 有捲動就不開大圖
    let PD = null;
    grid.addEventListener('pointerdown', e => { const s = e.target.closest('.slides'); PD = { x: e.clientX, y: e.clientY, s, l: s ? s.scrollLeft : 0 }; }, true);
    function wasSwipe(e) {
      const p = PD; PD = null; if (!p || !e.isTrusted || e.detail === 0) return false;
      return Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10 || (p.s && Math.abs(p.s.scrollLeft - p.l) > 2);
    }
    grid.addEventListener('click', e => {
      if (slideNav(e)) return; if (wasSwipe(e)) return;
      const t = e.target.closest('.card');
      if (t) { const sl = t.querySelector('.slides'); open(t.dataset.id, sl ? Math.round(sl.scrollLeft / Math.max(1, sl.clientWidth)) : 0); }
    });
    $('#close').onclick = closeModal;
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeModal();
      else if (cfg.keyArrows && modal.classList.contains('on') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        const s = mimg.querySelector('.slides'); if (!s || e.target.closest && e.target.closest('.slides')) return;
        e.preventDefault(); go(s, (e.key === 'ArrowRight' ? 1 : -1));
      }
    });
    mimg.addEventListener('click', e => {
      if (slideNav(e)) return; const t = e.target.closest('.pth'); if (!t) return;
      const s = mimg.querySelector('.slides'); if (s) s.scrollTo({ left: (+t.dataset.i) * s.clientWidth, behavior: 'smooth' });
    });

    // ===== 左右滑動 =====
    function go(s, d) {
      // 用絕對位置(Firefox + scroll-snap-stop 下 scrollBy 會卡在原地)
      const w = Math.max(1, s.clientWidth), i = Math.round(s.scrollLeft / w) + d;
      s.scrollTo({ left: Math.max(0, Math.min(s.children.length - 1, i)) * w, behavior: 'smooth' });
    }
    function slideNav(e) {
      const b = e.target.closest('.sbtn'); if (!b) return false;
      e.stopPropagation();
      go(b.parentNode.querySelector('.slides'), b.classList.contains('next') ? 1 : -1);
      return true;
    }
    function updSlide(s) {
      const i = Math.round(s.scrollLeft / Math.max(1, s.clientWidth));
      s.parentNode.querySelectorAll('.dots i').forEach((d, j) => d.classList.toggle('on', j === i));
      const m = s.closest('#mimg'); if (m) m.querySelectorAll('.pth').forEach((x, j) => x.classList.toggle('on', j === i));
    }
    document.addEventListener('scroll', e => { const t = e.target; if (t && t.classList && t.classList.contains('slides')) updSlide(t); }, true);

    // ===== 檢視:縮圖 / 照片(每頁各自記住) =====
    const VKEY = 'viewMode:' + location.pathname;
    let VIEW = cfg.defaultView === 'photo' ? 'photo' : 'thumb';
    try { const v = localStorage.getItem(VKEY); if (v) VIEW = v === 'photo' ? 'photo' : 'thumb'; } catch (_) {}
    function syncViews() { document.querySelectorAll('.vchip').forEach(b => { const on = b.dataset.v === VIEW; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }); }
    $('#views').addEventListener('click', e => {
      const t = e.target.closest('.vchip'); if (!t) return;
      VIEW = t.dataset.v === 'photo' ? 'photo' : 'thumb'; try { localStorage.setItem(VKEY, VIEW); } catch (_) {}
      syncViews(); render();
    });
    syncViews();

    // ===== 分組方式 / 分頁 / 搜尋 =====
    const modesEl = $('#modes');
    if (modesEl && cfg.modes && cfg.modes.length > 1) {
      modesEl.innerHTML = cfg.modes.map((m, i) => `<span class="mchip${i ? '' : ' on'}" data-m="${esc(m.id)}">${esc(m.label)}</span>`).join('\n    ');
      modesEl.addEventListener('click', e => {
        const t = e.target.closest('.mchip'); if (!t) return;
        S.mode = t.dataset.m; modesEl.querySelectorAll('.mchip').forEach(x => x.classList.toggle('on', x === t)); render();
      });
    }
    const tabsEl = $('#tabs');
    if (tabsEl && cfg.tabs) {
      tabsEl.setAttribute('role', 'group');
      tabsEl.innerHTML = cfg.tabs.map((t, i) => `<button type="button" class="mchip${i ? '' : ' on'}" data-t="${esc(t.id)}" aria-pressed="${!i}">${esc(t.label)}</button>`).join('');
      tabsEl.addEventListener('click', e => {
        const t = e.target.closest('.mchip'); if (!t) return;
        S.tab = t.dataset.t;
        tabsEl.querySelectorAll('.mchip').forEach(x => { x.classList.toggle('on', x === t); x.setAttribute('aria-pressed', x === t); });
        render();
      });
    }
    $('#q').addEventListener('input', render);

    // ===== 功能區可收合(所有螢幕);手機或矮螢幕預設收起,點「篩選」展開 =====
    const hdr = document.querySelector('header'), tgl = $('#tgl'), q = $('#q');
    function syncTgl() {
      const opened = !hdr.classList.contains('collapsed');
      const on = q.value.trim() || document.querySelector('#chips .chip.on');
      tgl.textContent = (opened ? '收起 ▴' : '篩選 / 搜尋 ▾'); tgl.classList.toggle('act', !opened && !!on);
      tgl.setAttribute('aria-expanded', opened);
    }
    if (matchMedia('(max-width:700px), (max-height:900px)').matches) hdr.classList.add('collapsed');
    tgl.addEventListener('click', () => { hdr.classList.toggle('collapsed'); syncTgl(); });
    syncTgl();

    // ===== 載入資料 =====
    const loader = cfg.load ? cfg.load() : fetch(cfg.json + '?v=' + Date.now()).then(r => r.json()).then(d => Object.assign({ raw: d }, cfg.parse(d)));
    Promise.resolve(loader).then(r => {
      S.items = r.items || []; S.build = r.build || ''; S.raw = r.raw ?? r;
      if (cfg.onLoad) cfg.onLoad(S.raw, S.items);
      if (cfg.summary) $('#sub').textContent = cfg.summary(S.raw, S.items);
      const chipsEl = $('#chips');
      if (cfg.chips && chipsEl) {
        const cats = {}; S.items.forEach(c => (cfg.chips.values(c) || []).forEach(k => cats[k] = (cats[k] || 0) + 1));
        chipsEl.innerHTML = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, cfg.chips.top || 14)
          .map(([k, n]) => `<span class="chip" data-k="${esc(k)}">${esc(k)} ${n}</span>`).join('');
        chipsEl.addEventListener('click', e => {
          const t = e.target.closest('.chip'); if (!t) return;
          S.filter = S.filter === t.dataset.k ? null : t.dataset.k;
          chipsEl.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x.dataset.k === S.filter)); render();
        });
      }
      render();
    }).catch(e => { $('#sub').textContent = (cfg.loadError || '資料載入失敗:') + e; });

    return { render, open, state: S };
  }

  window.CatalogViewer = { init, esc };
})();
