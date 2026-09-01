const KEY = "binggushenghua-v3";
const oldKey = "binggushenghua-v2";
const defaults = {
  version: 3,
  theme: "light",
  myName: "我",
  loverName: "我的唯一",
  myAvatar: "",
  loverAvatar: "",
  backgroundImage: "",
  backgroundOverlay: 0,
  fontSize: 14,
  bubbleRadius: 4,
  mode: "random",
  replyDelayMin: 2,
  replyDelayMax: 5,
  anniversary: "2026-01-06",
  memories: [{ id: "memory-1", name: "我们的纪念日", date: "2026-12-31", repeat: true }],
  memoryQuotes: ["相爱不是某一个瞬间，\n是每一个普通日子都被好好记住。"],
  sections: ["日常", "想念", "安慰", "睡前"],
  cards: [
    { id: "1", section: "日常", content: "等你忙完，我们绕远路一起回家。", triggers: ["下班", "回家", "忙完"], random: true, response: true, enabled: true },
    { id: "2", section: "想念", content: "今天也有好好想你。", triggers: ["想你", "想我"], random: true, response: true, enabled: true },
    { id: "3", section: "安慰", content: "慢慢来，我一直都在。", triggers: ["难过", "累", "不开心", "害怕"], random: true, response: true, enabled: true },
    { id: "4", section: "睡前", content: "晚一点也没关系，困了就来找我。", triggers: ["睡不着", "晚安", "困"], random: true, response: true, enabled: true },
  ],
  stickers: [],
  messages: [{ id: "welcome", from: "lover", type: "text", content: "线路接通了。你想说什么都可以。", createdAt: new Date().toISOString() }],
};

const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let state = loadState();
let activeTool = null;
let typing = false;
let cardQuery = "";
let toastTimer = null;

const $ = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
const safeImage = (value) => typeof value === "string" && value.startsWith("data:image/") ? value : "";

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || localStorage.getItem(oldKey) || "{}");
    const migrated = { ...structuredClone(defaults), ...saved };
    migrated.sections = Array.isArray(saved.sections) ? saved.sections.map((item) => typeof item === "string" ? item : item.name).filter(Boolean) : defaults.sections;
    migrated.cards = Array.isArray(saved.cards) ? saved.cards.map((card) => ({
      id: card.id || uid(), section: card.section || migrated.sections.find((name) => name === card.sectionId) || card.sectionId || "日常",
      content: card.content || "", triggers: Array.isArray(card.triggers) ? card.triggers : [],
      random: card.random !== false, response: card.response !== false, enabled: card.enabled !== false,
    })) : defaults.cards;
    migrated.memories = Array.isArray(saved.memories) ? saved.memories : defaults.memories;
    migrated.memoryQuotes = Array.isArray(saved.memoryQuotes) && saved.memoryQuotes.some((quote) => String(quote).trim()) ? saved.memoryQuotes.map((quote) => String(quote).trim()).filter(Boolean) : defaults.memoryQuotes;
    migrated.replyDelayMin = Math.min(60, Math.max(1, Number(saved.replyDelayMin ?? defaults.replyDelayMin)));
    migrated.replyDelayMax = Math.min(120, Math.max(migrated.replyDelayMin, Number(saved.replyDelayMax ?? defaults.replyDelayMax)));
    migrated.stickers = Array.isArray(saved.stickers) ? saved.stickers : [];
    migrated.messages = Array.isArray(saved.messages) ? saved.messages.map((message) => ({ id: message.id || uid(), type: "text", ...message })) : defaults.messages;
    return migrated;
  } catch {
    return structuredClone(defaults);
  }
}

function saveState(quiet = true) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    if (!quiet) showToast("本机存储空间不足，请减少图片或先导出备份");
    return false;
  }
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2300);
}

function avatarMarkup(dataUrl, fallback) {
  const safe = safeImage(dataUrl);
  return safe ? `<img src="${safe}" alt="">` : `<span>${escapeHtml((fallback || "?").slice(0, 1))}</span>`;
}

function applyAppearance() {
  document.documentElement.dataset.theme = state.theme;
  document.documentElement.style.setProperty("--chat-font-size", `${state.fontSize}px`);
  document.documentElement.style.setProperty("--bubble-radius", `${state.bubbleRadius}px`);
  document.documentElement.style.setProperty("--bg-overlay", String(state.backgroundOverlay / 100));
  $("messageList").style.backgroundImage = safeImage(state.backgroundImage) ? `url("${state.backgroundImage}")` : "";
  $("themeButton").innerHTML = state.theme === "light" ? '<svg viewBox="0 0 24 24"><path d="M18 15a7 7 0 0 1-9-9 7 7 0 1 0 9 9Z"/></svg>' : '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/></svg>';
  $("profileButton").innerHTML = avatarMarkup(state.myAvatar, state.myName);
  $("loverTopAvatar").innerHTML = avatarMarkup(state.loverAvatar, state.loverName);
  $("loverName").textContent = state.loverName;
  document.querySelectorAll(".lover-mark").forEach((node) => { node.innerHTML = avatarMarkup(state.loverAvatar, state.loverName); });
}

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll("[data-mode]").forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
  $("modeLabel").textContent = mode === "random" ? "随机传讯" : "回应传讯";
  saveState();
}

function renderMessages(scrollToEnd = true) {
  $("messages").innerHTML = state.messages.map((message) => {
    const mine = message.from === "me";
    const time = new Date(message.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    const media = ["sticker", "image"].includes(message.type) && safeImage(message.dataUrl);
    const content = media
      ? `<div class="bubble media-bubble ${message.type === "sticker" ? "sticker-bubble" : "image-bubble"}"><img src="${message.dataUrl}" alt="${escapeHtml(message.content || (message.type === "image" ? "图片" : "表情"))}"></div>`
      : `<div class="bubble">${escapeHtml(message.content)}</div>`;
    const remove = `<button class="message-delete" data-delete-message="${message.id}" aria-label="删除这条消息" title="删除这条消息"><svg viewBox="0 0 24 24"><path d="M7 7h10l-.7 12H7.7L7 7ZM9 7V4h6v3M5 7h14"/></svg></button>`;
    return `<article class="message-row ${mine ? "me" : "lover"}" data-message-row="${message.id}">${mine ? remove : `<div class="message-avatar avatar lover-mark">${avatarMarkup(state.loverAvatar, state.loverName)}</div>`}<div class="message-body">${content}<time>${time}</time></div>${mine ? `<div class="message-avatar avatar me-mark">${avatarMarkup(state.myAvatar, state.myName)}</div>` : remove}</article>`;
  }).join("");
  document.querySelectorAll("[data-message-row] .bubble").forEach((bubble) => bubble.addEventListener("click", () => {
    const row = bubble.closest("[data-message-row]");
    const willOpen = !row.classList.contains("actions-open");
    document.querySelectorAll("[data-message-row].actions-open").forEach((item) => item.classList.remove("actions-open"));
    row.classList.toggle("actions-open", willOpen);
  }));
  document.querySelectorAll("[data-delete-message]").forEach((button) => button.addEventListener("click", () => {
    if (!confirm("删除这条消息吗？")) return;
    state.messages = state.messages.filter((message) => message.id !== button.dataset.deleteMessage);
    saveState();
    renderMessages(false);
  }));
  updateReplyButton();
  if (scrollToEnd) requestAnimationFrame(() => $("messageEnd").scrollIntoView({ behavior: "smooth" }));
}

function pendingMessages() {
  let lastLover = -1;
  state.messages.forEach((message, index) => { if (message.from === "lover") lastLover = index; });
  return state.messages.slice(lastLover + 1).filter((message) => message.from === "me");
}

function updateReplyButton() {
  $("replyButton").disabled = typing || pendingMessages().length === 0;
}

function sendText() {
  const draft = $("draft");
  const content = draft.value.trim();
  if (!content) return;
  state.messages.push({ id: uid(), from: "me", type: "text", content, createdAt: new Date().toISOString() });
  draft.value = "";
  $("sendButton").disabled = true;
  saveState();
  renderMessages();
}

function sendSticker(sticker) {
  state.messages.push({ id: uid(), from: "me", type: "sticker", content: `[表情] ${sticker.name}`, dataUrl: sticker.dataUrl, createdAt: new Date().toISOString() });
  saveState();
  closePopovers();
  renderMessages();
}

async function sendImage(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) { showToast("图片太大，请选择 8MB 以内的图片"); event.target.value = ""; return; }
  try {
    const dataUrl = await compressImage(file, 1600, 0.84);
    state.messages.push({ id: uid(), from: "me", type: "image", content: "[图片]", dataUrl, createdAt: new Date().toISOString() });
    if (saveState(false)) renderMessages();
  } catch { showToast("这张图片暂时无法读取"); }
  event.target.value = "";
}

function requestReply() {
  const pending = pendingMessages();
  if (!pending.length || typing) return;
  const combined = pending.map((message) => message.content).join("\n");
  typing = true;
  $("typing").hidden = false;
  $("presence").textContent = "正在输入…";
  updateReplyButton();
  requestAnimationFrame(() => $("messageEnd").scrollIntoView({ behavior: "smooth" }));
  const minimum = Math.min(60, Math.max(1, Number(state.replyDelayMin || 1)));
  const maximum = Math.min(120, Math.max(minimum, Number(state.replyDelayMax || minimum)));
  const delay = Math.round((minimum + Math.random() * (maximum - minimum)) * 1000);
  setTimeout(() => {
    let answer = "这次还没有合适的话。先去字卡里添上一句吧。";
    try {
      let pool = state.cards.filter((card) => card.enabled && (state.mode === "random" ? card.random : card.response));
      if (state.mode === "response") {
        const matched = pool.filter((card) => card.triggers.some((word) => combined.includes(word)));
        if (matched.length) pool = matched;
      }
      const recent = state.messages.slice(-12).filter((message) => message.from === "lover").map((message) => message.content);
      const fresh = pool.filter((card) => !recent.includes(card.content));
      if (fresh.length) pool = fresh;
      answer = pool[Math.floor(Math.random() * pool.length)]?.content || answer;
    } finally {
      state.messages.push({ id: uid(), from: "lover", type: "text", content: answer, createdAt: new Date().toISOString() });
      typing = false;
      $("typing").hidden = true;
      $("presence").textContent = "讯号在线";
      saveState();
      renderMessages();
    }
  }, delay);
}

function closePopovers() {
  $("stickerPopover").hidden = true;
}

function toggleStickerPopover() {
  const popover = $("stickerPopover");
  popover.innerHTML = state.stickers.length
    ? `<div class="chat-sticker-grid">${state.stickers.map((sticker) => `<button data-send-sticker="${sticker.id}" title="${escapeHtml(sticker.name)}"><img src="${sticker.dataUrl}" alt="${escapeHtml(sticker.name)}"></button>`).join("")}</div>`
    : '<div class="popover-empty">还没有表情包，请先从功能菜单上传。</div>';
  popover.hidden = !popover.hidden;
  popover.querySelectorAll("[data-send-sticker]").forEach((button) => button.addEventListener("click", () => {
    const sticker = state.stickers.find((item) => item.id === button.dataset.sendSticker);
    if (sticker) sendSticker(sticker);
  }));
}

function inputField(label, type, value, key) {
  return `<label class="field-label"><span>${label}</span><input type="${type}" value="${escapeHtml(value)}" data-setting="${key}"></label>`;
}

function openTool(tool) {
  activeTool = tool === "chat" ? null : tool;
  document.querySelectorAll("[data-tool]").forEach((button) => button.classList.toggle("active", button.dataset.tool === (activeTool || "chat")));
  $("toolDrawer").classList.toggle("open", Boolean(activeTool));
  $("toolDrawer").setAttribute("aria-hidden", String(!activeTool));
  closePopovers();
  if (activeTool) renderDrawer(activeTool);
}

function renderDrawer(tool) {
  const names = { menu: "功能", cards: "字卡", stickers: "表情包", memories: "纪念日", background: "聊天背景", appearance: "设置", data: "数据" };
  $("drawerTitle").textContent = names[tool];
  if (tool === "menu") renderMenuDrawer();
  if (tool === "cards") renderCardsDrawer();
  if (tool === "stickers") renderStickersDrawer();
  if (tool === "memories") renderMemoriesDrawer();
  if (tool === "background") renderBackgroundDrawer();
  if (tool === "appearance") renderAppearanceDrawer();
  if (tool === "data") renderDataDrawer();
  $("drawerContent").scrollTop = 0;
}

function renderMenuDrawer() {
  const items = [
    ["cards", "字卡", "录入、分区和调整回复规则", '<path d="M6 4h12v16H6zM9 8h6M9 12h6M9 16h4"/>'],
    ["stickers", "表情包", "上传和整理聊天图片", '<circle cx="12" cy="12" r="8"/><path d="M9 10h.01M15 10h.01M9 14c1.6 1.4 4.4 1.4 6 0"/>'],
    ["memories", "纪念日", "记录相爱的日子", '<path d="M6 5h12v15H6zM8 3v4M16 3v4M6 9h12M9 13h2M13 13h2M9 16h2"/>'],
    ["background", "聊天背景", "背景、字号和气泡设置", '<path d="M4 5h16v14H4zM7 16l4-4 3 3 2-2 2 3M15 9h.01"/>'],
    ["appearance", "设置", "头像、称呼、回复节奏和显示模式", '<circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/>'],
    ["data", "数据", "备份、恢复和整理本地记录", '<path d="M5 5h14v14H5zM8 9h8M8 13h8M8 17h5"/>'],
  ];
  $("drawerContent").innerHTML = `<section class="mobile-menu-profile"><div class="avatar">${avatarMarkup(state.myAvatar, state.myName)}</div><div><strong>${escapeHtml(state.myName)}</strong><span>所有内容仅保存在这台设备</span></div></section><nav class="mobile-menu-list">${items.map(([tool, title, description, icon]) => `<button data-menu-tool="${tool}"><svg viewBox="0 0 24 24">${icon}</svg><span><strong>${title}</strong><small>${description}</small></span><b>›</b></button>`).join("")}</nav>`;
  document.querySelectorAll("[data-menu-tool]").forEach((button) => button.addEventListener("click", () => openTool(button.dataset.menuTool)));
}

function renderCardsDrawer() {
  const visible = state.cards.filter((card) => card.content.includes(cardQuery) || card.section.includes(cardQuery) || card.triggers.some((word) => word.includes(cardQuery)));
  $("drawerContent").innerHTML = `
    <section class="drawer-section"><div class="section-title"><strong>批量录入</strong><span>一行一张字卡</span></div><label class="field-label"><textarea id="bulkCards" placeholder="今天也有好好想你。&#10;慢慢来，我一直都在。"></textarea></label><div class="inline-form"><select id="bulkSection">${state.sections.map((name) => `<option>${escapeHtml(name)}</option>`).join("")}</select><button class="green-button" id="addBulkCards">加入字卡</button></div></section>
    <section class="drawer-section"><div class="section-title"><strong>分区</strong><span>${state.sections.length} 个</span></div><div class="inline-form"><input id="newSection" placeholder="新分区名称"><button class="secondary-button" id="addSection">添加</button></div><div class="section-tags">${state.sections.map((name) => `<span class="section-chip">${escapeHtml(name)}${state.sections.length > 1 ? `<button data-delete-section="${escapeHtml(name)}">×</button>` : ""}</span>`).join("")}</div></section>
    <section><div class="drawer-search"><input id="cardSearch" value="${escapeHtml(cardQuery)}" placeholder="搜索字卡、分区或触发词"><b>${visible.length}/${state.cards.length}</b></div><div class="simple-list card-list">${visible.map((card) => `<article class="card-edit" data-card="${card.id}"><textarea class="card-copy" data-card-field="content">${escapeHtml(card.content)}</textarea><div class="card-meta-row"><select data-card-field="section">${state.sections.map((name) => `<option ${name === card.section ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}</select><input data-card-field="triggers" value="${escapeHtml(card.triggers.join("，"))}" placeholder="触发词，用逗号分隔"></div><div class="card-edit-actions"><div class="check-group"><label class="mini-toggle"><input type="checkbox" data-card-field="random" ${card.random ? "checked" : ""}><i></i><span>随机</span></label><label class="mini-toggle"><input type="checkbox" data-card-field="response" ${card.response ? "checked" : ""}><i></i><span>回应</span></label><label class="mini-toggle"><input type="checkbox" data-card-field="enabled" ${card.enabled ? "checked" : ""}><i></i><span>启用</span></label></div><button class="icon-danger" data-delete-card="${card.id}" aria-label="删除字卡"><svg viewBox="0 0 24 24"><path d="M7 7h10l-.7 12H7.7L7 7ZM9 7V4h6v3M5 7h14"/></svg></button></div></article>`).join("") || '<div class="empty-tool">没有符合条件的字卡。</div>'}</div></section>`;
  $("addBulkCards").addEventListener("click", () => {
    const lines = $("bulkCards").value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    lines.forEach((content) => state.cards.push({ id: uid(), section: $("bulkSection").value, content, triggers: [], random: true, response: true, enabled: true }));
    if (lines.length) { saveState(); showToast(`已加入 ${lines.length} 张字卡`); renderCardsDrawer(); }
  });
  $("addSection").addEventListener("click", () => {
    const name = $("newSection").value.trim();
    if (name && !state.sections.includes(name)) { state.sections.push(name); saveState(); renderCardsDrawer(); }
  });
  $("cardSearch").addEventListener("input", (event) => { cardQuery = event.target.value; renderCardsDrawer(); requestAnimationFrame(() => $("cardSearch")?.focus()); });
  document.querySelectorAll("[data-card-field]").forEach((input) => input.addEventListener("change", (event) => {
    const card = state.cards.find((item) => item.id === event.target.closest("[data-card]").dataset.card);
    const field = event.target.dataset.cardField;
    if (!card) return;
    if (["random", "response", "enabled"].includes(field)) card[field] = event.target.checked;
    else if (field === "triggers") card.triggers = event.target.value.split(/[，,]/).map((word) => word.trim()).filter(Boolean);
    else card[field] = event.target.value;
    saveState();
  }));
  document.querySelectorAll("[data-delete-card]").forEach((button) => button.addEventListener("click", () => {
    if (!confirm("确定删除这张字卡吗？")) return;
    state.cards = state.cards.filter((card) => card.id !== button.dataset.deleteCard); saveState(); renderCardsDrawer();
  }));
  document.querySelectorAll("[data-delete-section]").forEach((button) => button.addEventListener("click", () => {
    const name = button.dataset.deleteSection;
    if (state.cards.some((card) => card.section === name)) { showToast("请先把该分区的字卡移到其他分区"); return; }
    state.sections = state.sections.filter((section) => section !== name); saveState(); renderCardsDrawer();
  }));
}

function renderStickersDrawer() {
  $("drawerContent").innerHTML = `<section class="drawer-section sticker-upload-section"><div class="section-title"><strong>表情包</strong><span>支持 PNG、JPG、GIF、WebP</span></div><p class="drawer-intro">上传后会直接出现在聊天输入栏的笑脸按钮里，不需要再分类。</p><label class="upload-box">＋ 选择一张或多张图片<input id="stickerFiles" type="file" accept="image/*" multiple></label></section><section><div class="section-title"><strong>已保存</strong><span>${state.stickers.length} 张</span></div>${state.stickers.length ? `<div class="sticker-grid">${state.stickers.map((sticker) => `<article class="sticker-card" data-sticker="${sticker.id}"><img src="${sticker.dataUrl}" alt="${escapeHtml(sticker.name)}"><button data-delete-sticker="${sticker.id}" title="删除" aria-label="删除表情">×</button><input data-sticker-field="name" value="${escapeHtml(sticker.name)}" aria-label="表情名称"></article>`).join("")}</div>` : '<div class="empty-tool">还没有表情包。上传后可直接从聊天输入区发送。</div>'}</section>`;
  $("stickerFiles").addEventListener("change", async (event) => {
    const files = [...event.target.files];
    for (const file of files) {
      if (file.size > 1.5 * 1024 * 1024) { showToast(`${file.name} 超过 1.5MB，已跳过`); continue; }
      const dataUrl = await readAsDataUrl(file);
      state.stickers.push({ id: uid(), name: file.name.replace(/\.[^.]+$/, ""), dataUrl });
    }
    if (saveState(false)) { showToast(`已上传 ${files.length} 张表情`); renderStickersDrawer(); }
  });
  document.querySelectorAll("[data-sticker-field]").forEach((input) => input.addEventListener("change", (event) => {
    const sticker = state.stickers.find((item) => item.id === event.target.closest("[data-sticker]").dataset.sticker);
    if (sticker) { sticker[event.target.dataset.stickerField] = event.target.value; saveState(); }
  }));
  document.querySelectorAll("[data-delete-sticker]").forEach((button) => button.addEventListener("click", () => {
    state.stickers = state.stickers.filter((item) => item.id !== button.dataset.deleteSticker); saveState(); renderStickersDrawer();
  }));
}

function renderMemoriesDrawer() {
  const days = Math.max(1, Math.floor((Date.now() - new Date(`${state.anniversary}T00:00:00`).getTime()) / 86400000) + 1);
  const since = state.anniversary ? state.anniversary.replaceAll("-", " · ") : "尚未设定";
  const quotes = state.memoryQuotes.length ? state.memoryQuotes : defaults.memoryQuotes;
  const quote = quotes[Math.floor(Math.random() * quotes.length)];
  $("drawerContent").innerHTML = `<section class="memory-hero"><span class="memory-kicker">TOGETHER · SINCE</span><div class="memory-flourish">❦</div><div class="memory-number">${Number.isFinite(days) ? days : "—"}</div><span class="memory-days">days</span><p>${escapeHtml(quote).replace(/\n/g, "<br>")}</p><small>${escapeHtml(since)}</small></section><section class="memory-date-setting">${inputField("我们从这一天开始", "date", state.anniversary, "anniversary")}</section><section class="drawer-section memory-quotes"><div class="section-title"><strong>纪念日文案</strong><span>进入时随机显示</span></div><label class="field-label"><textarea id="newMemoryQuotes" placeholder="写下一句想在纪念日页面看见的话…&#10;可以一行添加一句"></textarea></label><button class="secondary-button memory-add" id="addMemoryQuotes">加入文案库</button><div class="quote-list">${state.memoryQuotes.map((item, index) => `<article><p>${escapeHtml(item)}</p><button data-delete-quote="${index}" aria-label="删除这句文案">×</button></article>`).join("")}</div></section><section class="drawer-section memory-create"><div class="section-title"><strong>再留下一枚时间坐标</strong><span>纪念日</span></div><div class="inline-form"><input id="memoryName" placeholder="为这一天取个名字"><input id="memoryDate" type="date"></div><label class="memory-repeat"><input id="memoryRepeat" type="checkbox" checked><i></i><span>每年都记得这一天</span></label><button class="green-button memory-add" id="addMemory">保存纪念日</button></section><section class="memory-list"><div class="section-title"><strong>被珍藏的日子</strong><span>${state.memories.length} 个</span></div>${state.memories.map((memory) => { const countdown = memoryCountdown(memory); return `<article class="memory-row"><div class="memory-date"><b>${escapeHtml(memory.date.slice(5).replace("-", "."))}</b><span>${memory.repeat ? "EVERY YEAR" : memory.date.slice(0, 4)}</span></div><div class="memory-copy"><strong>${escapeHtml(memory.name)}</strong><span>${countdown}</span></div><button data-delete-memory="${memory.id}" aria-label="删除纪念日">×</button></article>`; }).join("") || '<div class="empty-tool">往后的日子，会在这里慢慢长出来。</div>'}</section>`;
  bindSettingInputs();
  $("addMemoryQuotes").addEventListener("click", () => {
    const additions = $("newMemoryQuotes").value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    if (!additions.length) { showToast("先写下一句文案吧"); return; }
    state.memoryQuotes.push(...additions); saveState(); renderMemoriesDrawer(); showToast(`已加入 ${additions.length} 句文案`);
  });
  document.querySelectorAll("[data-delete-quote]").forEach((button) => button.addEventListener("click", () => {
    state.memoryQuotes.splice(Number(button.dataset.deleteQuote), 1); saveState(); renderMemoriesDrawer();
  }));
  $("addMemory").addEventListener("click", () => {
    const name = $("memoryName").value.trim(); const date = $("memoryDate").value;
    if (!name || !date) { showToast("请填写名称和日期"); return; }
    state.memories.push({ id: uid(), name, date, repeat: $("memoryRepeat").checked }); saveState(); renderMemoriesDrawer();
  });
  document.querySelectorAll("[data-delete-memory]").forEach((button) => button.addEventListener("click", () => { state.memories = state.memories.filter((item) => item.id !== button.dataset.deleteMemory); saveState(); renderMemoriesDrawer(); }));
}

function memoryCountdown(memory) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const parts = String(memory.date || "").split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return "等待日期被补全";
  let target = memory.repeat ? new Date(today.getFullYear(), parts[1] - 1, parts[2]) : new Date(parts[0], parts[1] - 1, parts[2]);
  if (memory.repeat && target < today) target = new Date(today.getFullYear() + 1, parts[1] - 1, parts[2]);
  const distance = Math.round((target - today) / 86400000);
  if (distance === 0) return "就是今天";
  if (distance > 0) return `还有 ${distance} 天抵达`;
  return `已经珍藏 ${Math.abs(distance)} 天`;
}

function formatDelay(seconds) {
  const value = Math.max(1, Number(seconds) || 1);
  return value < 60 ? `${value} 秒` : value === 60 ? "1 分钟" : `${Math.floor(value / 60)} 分 ${String(value % 60).padStart(2, "0")} 秒`;
}

function renderAppearanceDrawer() {
  $("drawerContent").innerHTML = `<section class="drawer-section"><div class="section-title"><strong>双方资料</strong><span>仅保存在本机</span></div>${inputField("我的称呼", "text", state.myName, "myName")}${inputField("爱人的称呼", "text", state.loverName, "loverName")}<div class="avatar-settings"><label class="avatar-upload"><div class="avatar">${avatarMarkup(state.myAvatar, state.myName)}</div><span>替换我的头像</span><input type="file" accept="image/*" data-avatar="myAvatar"></label><label class="avatar-upload"><div class="avatar">${avatarMarkup(state.loverAvatar, state.loverName)}</div><span>替换爱人头像</span><input type="file" accept="image/*" data-avatar="loverAvatar"></label></div></section><section class="drawer-section reply-delay-settings"><div class="section-title"><strong>回复等待时间</strong><span>区间内随机</span></div><p class="drawer-intro">点击手动回复后，等待时间会在最短与最长之间随机选择。</p><div class="range-field"><div class="range-head"><span>最短等待</span><b id="delayMinValue">${formatDelay(state.replyDelayMin)}</b></div><input id="delayMinRange" type="range" min="1" max="60" step="1" value="${state.replyDelayMin}"></div><div class="range-field"><div class="range-head"><span>最长等待</span><b id="delayMaxValue">${formatDelay(state.replyDelayMax)}</b></div><input id="delayMaxRange" type="range" min="1" max="120" step="1" value="${state.replyDelayMax}"></div><div class="delay-scale"><span>1 秒</span><span>1 分钟</span><span>2 分钟</span></div></section><section class="drawer-section"><div class="section-title"><strong>显示模式</strong></div><div class="theme-choice"><button data-theme-choice="light" class="${state.theme === "light" ? "active" : ""}">浅色</button><button data-theme-choice="dark" class="${state.theme === "dark" ? "active" : ""}">深色</button></div></section>`;
  bindSettingInputs();
  document.querySelectorAll("[data-avatar]").forEach((input) => input.addEventListener("change", async (event) => {
    const file = event.target.files[0]; if (!file) return;
    state[event.target.dataset.avatar] = await compressImage(file, 360, 0.86);
    if (saveState(false)) { applyAppearance(); renderMessages(); renderAppearanceDrawer(); showToast("头像已替换"); }
  }));
  $("delayMinRange").addEventListener("input", (event) => {
    state.replyDelayMin = Number(event.target.value);
    if (state.replyDelayMax < state.replyDelayMin) { state.replyDelayMax = state.replyDelayMin; $("delayMaxRange").value = state.replyDelayMax; }
    $("delayMinValue").textContent = formatDelay(state.replyDelayMin); $("delayMaxValue").textContent = formatDelay(state.replyDelayMax); saveState();
  });
  $("delayMaxRange").addEventListener("input", (event) => {
    state.replyDelayMax = Math.max(state.replyDelayMin, Number(event.target.value));
    event.target.value = state.replyDelayMax; $("delayMaxValue").textContent = formatDelay(state.replyDelayMax); saveState();
  });
  document.querySelectorAll("[data-theme-choice]").forEach((button) => button.addEventListener("click", () => { state.theme = button.dataset.themeChoice; saveState(); applyAppearance(); renderAppearanceDrawer(); }));
}

function renderBackgroundDrawer() {
  $("drawerContent").innerHTML = `<section class="drawer-section"><div class="section-title"><strong>聊天背景</strong><span>只影响消息区域</span></div><div class="background-preview" style="background-image:${safeImage(state.backgroundImage) ? `url('${state.backgroundImage}')` : "none"}"></div><label class="upload-box">选择背景图片<input id="backgroundFile" type="file" accept="image/*"></label><div class="button-row"><button class="secondary-button" id="removeBackground">恢复默认背景</button></div></section><section><div class="section-title"><strong>文字与气泡</strong><span>即时预览</span></div><div class="range-field"><div class="range-head"><span>聊天字体大小</span><b id="fontSizeValue">${state.fontSize}px</b></div><input id="fontSizeRange" type="range" min="12" max="22" value="${state.fontSize}"></div><div class="range-field"><div class="range-head"><span>气泡圆角</span><b id="radiusValue">${state.bubbleRadius}px</b></div><input id="radiusRange" type="range" min="0" max="18" value="${state.bubbleRadius}"></div><div class="range-field"><div class="range-head"><span>背景遮罩</span><b id="overlayValue">${state.backgroundOverlay}%</b></div><input id="overlayRange" type="range" min="0" max="75" value="${state.backgroundOverlay}"></div></section>`;
  $("backgroundFile").addEventListener("change", async (event) => {
    const file = event.target.files[0]; if (!file) return;
    state.backgroundImage = await compressImage(file, 1800, 0.82);
    if (saveState(false)) { applyAppearance(); renderBackgroundDrawer(); showToast("聊天背景已替换"); }
  });
  $("removeBackground").addEventListener("click", () => { state.backgroundImage = ""; saveState(); applyAppearance(); renderBackgroundDrawer(); });
  [["fontSizeRange", "fontSize", "fontSizeValue", "px"], ["radiusRange", "bubbleRadius", "radiusValue", "px"], ["overlayRange", "backgroundOverlay", "overlayValue", "%"]].forEach(([id, key, output, unit]) => {
    $(id).addEventListener("input", (event) => { state[key] = Number(event.target.value); $(output).textContent = `${state[key]}${unit}`; applyAppearance(); saveState(); });
  });
}

function renderDataDrawer() {
  $("drawerContent").innerHTML = `<section class="drawer-section"><div class="save-line">✓ <span>聊天、字卡和图片已保存在当前浏览器</span></div><p class="drawer-intro">更换手机、浏览器或清理网站数据前，请先导出完整备份。</p><button class="export-button" id="exportButton">导出完整备份</button><label class="upload-box" style="margin-top:10px">导入备份文件<input id="importFile" type="file" accept="application/json"></label></section><section><div class="section-title"><strong>整理数据</strong><span>操作前建议备份</span></div><div class="button-row"><button class="secondary-button" id="clearHistory">清空聊天</button><button class="danger-button" id="resetAll">恢复初始状态</button></div></section>`;
  $("exportButton").addEventListener("click", exportData);
  $("importFile").addEventListener("change", importData);
  $("clearHistory").addEventListener("click", () => { if (!confirm("确定清空全部聊天记录吗？")) return; state.messages = []; saveState(); renderMessages(); showToast("聊天记录已清空"); });
  $("resetAll").addEventListener("click", () => { if (!confirm("确定恢复初始状态吗？所有本机数据都会被覆盖。")) return; state = structuredClone(defaults); saveState(); applyAppearance(); setMode(state.mode); renderMessages(); renderDataDrawer(); showToast("已恢复初始状态"); });
}

function bindSettingInputs() {
  document.querySelectorAll("[data-setting]").forEach((input) => input.addEventListener("change", (event) => {
    const key = event.target.dataset.setting;
    state[key] = event.target.value; saveState(); applyAppearance(); renderMessages();
    if (key === "anniversary" && activeTool === "memories") renderMemoriesDrawer();
  }));
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
}

async function compressImage(file, maxSide, quality) {
  if (file.type === "image/gif") return readAsDataUrl(file);
  const source = await readAsDataUrl(file);
  const image = await new Promise((resolve, reject) => { const item = new Image(); item.onload = () => resolve(item); item.onerror = reject; item.src = source; });
  const ratio = Math.min(1, maxSide / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(image.width * ratio)); canvas.height = Math.max(1, Math.round(image.height * ratio));
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob); const link = document.createElement("a");
  link.href = url; link.download = `病骨生花-完整备份-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url);
}

async function importData(event) {
  const file = event.target.files[0]; if (!file) return;
  try {
    const incoming = JSON.parse(await file.text());
    if (!Array.isArray(incoming.messages) || !Array.isArray(incoming.cards)) throw new Error("invalid");
    state = { ...structuredClone(defaults), ...incoming, version: 3 };
    state.memoryQuotes = Array.isArray(incoming.memoryQuotes) && incoming.memoryQuotes.length ? incoming.memoryQuotes.map((quote) => String(quote).trim()).filter(Boolean) : structuredClone(defaults.memoryQuotes);
    state.replyDelayMin = Math.min(60, Math.max(1, Number(incoming.replyDelayMin ?? defaults.replyDelayMin)));
    state.replyDelayMax = Math.min(120, Math.max(state.replyDelayMin, Number(incoming.replyDelayMax ?? defaults.replyDelayMax)));
    if (saveState(false)) { applyAppearance(); setMode(state.mode); renderMessages(); renderDataDrawer(); showToast("备份已恢复"); }
  } catch { showToast("无法读取这个备份文件"); }
}

document.querySelectorAll("[data-tool]").forEach((button) => button.addEventListener("click", () => openTool(button.dataset.tool)));
document.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
$("profileButton").addEventListener("click", () => openTool("appearance"));
$("chatInfoButton").addEventListener("click", () => openTool("background"));
$("drawerBack").addEventListener("click", () => {
  if (window.matchMedia("(max-width: 760px)").matches && activeTool && activeTool !== "menu") openTool("menu");
  else openTool("chat");
});
$("drawerClose").addEventListener("click", () => openTool("chat"));
$("themeButton").addEventListener("click", () => { state.theme = state.theme === "light" ? "dark" : "light"; saveState(); applyAppearance(); if (activeTool === "appearance") renderAppearanceDrawer(); });
$("mobileMenu").addEventListener("click", () => openTool("menu"));
$("draft").addEventListener("input", (event) => { $("sendButton").disabled = !event.target.value.trim(); });
$("draft").addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendText(); } });
$("sendButton").addEventListener("click", sendText);
$("replyButton").addEventListener("click", requestReply);
$("stickerButton").addEventListener("click", toggleStickerPopover);
$("imageFile").addEventListener("change", sendImage);
document.addEventListener("click", (event) => {
  if (!event.target.closest(".popover,.composer")) closePopovers();
  if (!event.target.closest("[data-message-row]")) document.querySelectorAll("[data-message-row].actions-open").forEach((row) => row.classList.remove("actions-open"));
});

applyAppearance();
setMode(state.mode);
renderMessages();
saveState();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
