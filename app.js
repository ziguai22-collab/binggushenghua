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
  anniversary: "2026-01-06",
  memories: [{ id: "memory-1", name: "我们的纪念日", date: "2026-12-31", repeat: true }],
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

let state = loadState();
let activeTool = null;
let typing = false;
let cardQuery = "";
let toastTimer = null;

const $ = (id) => document.getElementById(id);
const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
    migrated.stickers = Array.isArray(saved.stickers) ? saved.stickers : [];
    migrated.messages = Array.isArray(saved.messages) ? saved.messages.map((message) => ({ type: "text", ...message })) : defaults.messages;
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

function renderMessages() {
  $("messages").innerHTML = state.messages.map((message) => {
    const mine = message.from === "me";
    const time = new Date(message.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    const content = message.type === "sticker" && safeImage(message.dataUrl)
      ? `<div class="bubble sticker-bubble"><img src="${message.dataUrl}" alt="${escapeHtml(message.content || "表情")}"></div>`
      : `<div class="bubble">${escapeHtml(message.content)}</div>`;
    return `<article class="message-row ${mine ? "me" : "lover"}">${mine ? "" : `<div class="message-avatar avatar lover-mark">${avatarMarkup(state.loverAvatar, state.loverName)}</div>`}<div class="message-body">${content}<time>${time}</time></div>${mine ? `<div class="message-avatar avatar me-mark">${avatarMarkup(state.myAvatar, state.myName)}</div>` : ""}</article>`;
  }).join("");
  updateReplyButton();
  requestAnimationFrame(() => $("messageEnd").scrollIntoView({ behavior: "smooth" }));
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

function requestReply() {
  const pending = pendingMessages();
  if (!pending.length || typing) return;
  const combined = pending.map((message) => message.content).join("\n");
  typing = true;
  $("typing").hidden = false;
  $("presence").textContent = "正在输入…";
  updateReplyButton();
  requestAnimationFrame(() => $("messageEnd").scrollIntoView({ behavior: "smooth" }));
  setTimeout(() => {
    let pool = state.cards.filter((card) => card.enabled && (state.mode === "random" ? card.random : card.response));
    if (state.mode === "response") {
      const matched = pool.filter((card) => card.triggers.some((word) => combined.includes(word)));
      if (matched.length) pool = matched;
    }
    const recent = state.messages.slice(-12).filter((message) => message.from === "lover").map((message) => message.content);
    const fresh = pool.filter((card) => !recent.includes(card.content));
    if (fresh.length) pool = fresh;
    const answer = pool[Math.floor(Math.random() * pool.length)]?.content || "这次还没有合适的话。先去字卡里添上一句吧。";
    state.messages.push({ id: uid(), from: "lover", type: "text", content: answer, createdAt: new Date().toISOString() });
    typing = false;
    $("typing").hidden = true;
    $("presence").textContent = "讯号在线";
    saveState();
    renderMessages();
  }, 850);
}

function closePopovers() {
  $("emojiPopover").hidden = true;
  $("stickerPopover").hidden = true;
}

function toggleEmoji() {
  const popover = $("emojiPopover");
  const emojis = ["微笑", "开心", "难过", "委屈", "生气", "爱心", "拥抱", "晚安", "想你", "亲亲", "害羞", "发呆", "叹气", "加油", "收到", "好的"];
  const symbols = ["🙂", "😄", "😔", "🥺", "😠", "❤️", "🫂", "🌙", "💭", "😘", "☺️", "😶", "😮‍💨", "💪", "👌", "好"];
  $("stickerPopover").hidden = true;
  popover.innerHTML = `<div class="emoji-grid">${symbols.map((symbol, index) => `<button title="${emojis[index]}" data-emoji="${symbol}">${symbol}</button>`).join("")}</div>`;
  popover.hidden = !popover.hidden;
  popover.querySelectorAll("[data-emoji]").forEach((button) => button.addEventListener("click", () => {
    $("draft").value += button.dataset.emoji;
    $("sendButton").disabled = false;
    $("draft").focus();
  }));
}

function toggleStickerPopover() {
  const popover = $("stickerPopover");
  $("emojiPopover").hidden = true;
  popover.innerHTML = state.stickers.length
    ? `<div class="chat-sticker-grid">${state.stickers.map((sticker) => `<button data-send-sticker="${sticker.id}" title="${escapeHtml(sticker.name)}"><img src="${sticker.dataUrl}" alt="${escapeHtml(sticker.name)}"></button>`).join("")}</div>`
    : '<div class="popover-empty">还没有表情包，请从左侧“表情”上传。</div>';
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
  closeMobileRail();
}

function renderDrawer(tool) {
  const names = { cards: "字卡", stickers: "表情包", memories: "纪念日", background: "聊天背景", appearance: "外观与资料", data: "数据" };
  $("drawerTitle").textContent = names[tool];
  if (tool === "cards") renderCardsDrawer();
  if (tool === "stickers") renderStickersDrawer();
  if (tool === "memories") renderMemoriesDrawer();
  if (tool === "background") renderBackgroundDrawer();
  if (tool === "appearance") renderAppearanceDrawer();
  if (tool === "data") renderDataDrawer();
}

function renderCardsDrawer() {
  const visible = state.cards.filter((card) => card.content.includes(cardQuery) || card.section.includes(cardQuery) || card.triggers.some((word) => word.includes(cardQuery)));
  $("drawerContent").innerHTML = `
    <section class="drawer-section"><div class="section-title"><strong>批量录入</strong><span>一行一张字卡</span></div><label class="field-label"><textarea id="bulkCards" placeholder="今天也有好好想你。&#10;慢慢来，我一直都在。"></textarea></label><div class="inline-form"><select id="bulkSection">${state.sections.map((name) => `<option>${escapeHtml(name)}</option>`).join("")}</select><button class="green-button" id="addBulkCards">加入字卡</button></div></section>
    <section class="drawer-section"><div class="section-title"><strong>分区</strong><span>${state.sections.length} 个</span></div><div class="inline-form"><input id="newSection" placeholder="新分区名称"><button class="secondary-button" id="addSection">添加</button></div><div class="section-tags">${state.sections.map((name) => `<span class="section-chip">${escapeHtml(name)}${state.sections.length > 1 ? `<button data-delete-section="${escapeHtml(name)}">×</button>` : ""}</span>`).join("")}</div></section>
    <section><div class="drawer-search"><input id="cardSearch" value="${escapeHtml(cardQuery)}" placeholder="搜索字卡、分区或触发词"><b>${visible.length}/${state.cards.length}</b></div><div class="simple-list">${visible.map((card) => `<article class="card-edit" data-card="${card.id}"><textarea data-card-field="content">${escapeHtml(card.content)}</textarea><select data-card-field="section">${state.sections.map((name) => `<option ${name === card.section ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}</select><input data-card-field="triggers" value="${escapeHtml(card.triggers.join("，"))}" placeholder="触发词，用逗号分隔"><div class="card-edit-actions"><div class="check-group"><label><input type="checkbox" data-card-field="random" ${card.random ? "checked" : ""}>随机</label><label><input type="checkbox" data-card-field="response" ${card.response ? "checked" : ""}>回应</label><label><input type="checkbox" data-card-field="enabled" ${card.enabled ? "checked" : ""}>启用</label></div><button class="danger-button small-button" data-delete-card="${card.id}">删除</button></div></article>`).join("") || '<div class="empty-tool">没有符合条件的字卡。</div>'}</div></section>`;
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
  $("drawerContent").innerHTML = `<section class="drawer-section"><div class="section-title"><strong>上传表情包</strong><span>支持 PNG、JPG、GIF、WebP</span></div><label class="field-label"><span>默认分组</span><input id="stickerGroup" value="日常"></label><label class="upload-box">选择一张或多张图片<input id="stickerFiles" type="file" accept="image/*" multiple></label></section><section><div class="section-title"><strong>我的表情</strong><span>${state.stickers.length} 张</span></div>${state.stickers.length ? `<div class="sticker-grid">${state.stickers.map((sticker) => `<article class="sticker-card" data-sticker="${sticker.id}"><img src="${sticker.dataUrl}" alt="${escapeHtml(sticker.name)}"><button data-delete-sticker="${sticker.id}" title="删除">×</button><input data-sticker-field="name" value="${escapeHtml(sticker.name)}"><input data-sticker-field="group" value="${escapeHtml(sticker.group || "日常")}" placeholder="分组"></article>`).join("")}</div>` : '<div class="empty-tool">还没有表情包。上传后可直接从聊天输入区发送。</div>'}</section>`;
  $("stickerFiles").addEventListener("change", async (event) => {
    const files = [...event.target.files];
    const group = $("stickerGroup").value.trim() || "日常";
    for (const file of files) {
      if (file.size > 1.5 * 1024 * 1024) { showToast(`${file.name} 超过 1.5MB，已跳过`); continue; }
      const dataUrl = await readAsDataUrl(file);
      state.stickers.push({ id: uid(), name: file.name.replace(/\.[^.]+$/, ""), group, dataUrl });
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
  $("drawerContent").innerHTML = `<section class="drawer-section"><div class="memory-count"><strong>${Number.isFinite(days) ? days : "—"}</strong><span>相爱的日子</span></div>${inputField("相爱起始日", "date", state.anniversary, "anniversary")}</section><section class="drawer-section"><div class="section-title"><strong>新增纪念日</strong><span>可以继续添加</span></div><div class="inline-form"><input id="memoryName" placeholder="名称"><input id="memoryDate" type="date"></div><button class="green-button" id="addMemory">添加纪念日</button></section><section><div class="section-title"><strong>纪念日列表</strong><span>${state.memories.length} 个</span></div>${state.memories.map((memory) => `<article class="memory-row"><div><strong>${escapeHtml(memory.name)}</strong><span>${escapeHtml(memory.date)} · ${memory.repeat ? "每年重复" : "仅一次"}</span></div><button data-delete-memory="${memory.id}">删除</button></article>`).join("") || '<div class="empty-tool">还没有纪念日。</div>'}</section>`;
  bindSettingInputs();
  $("addMemory").addEventListener("click", () => {
    const name = $("memoryName").value.trim(); const date = $("memoryDate").value;
    if (!name || !date) { showToast("请填写名称和日期"); return; }
    state.memories.push({ id: uid(), name, date, repeat: true }); saveState(); renderMemoriesDrawer();
  });
  document.querySelectorAll("[data-delete-memory]").forEach((button) => button.addEventListener("click", () => { state.memories = state.memories.filter((item) => item.id !== button.dataset.deleteMemory); saveState(); renderMemoriesDrawer(); }));
}

function renderAppearanceDrawer() {
  $("drawerContent").innerHTML = `<section class="drawer-section"><div class="section-title"><strong>双方资料</strong><span>仅保存在本机</span></div>${inputField("我的称呼", "text", state.myName, "myName")}${inputField("爱人的称呼", "text", state.loverName, "loverName")}<div class="avatar-settings"><label class="avatar-upload"><div class="avatar">${avatarMarkup(state.myAvatar, state.myName)}</div><span>替换我的头像</span><input type="file" accept="image/*" data-avatar="myAvatar"></label><label class="avatar-upload"><div class="avatar">${avatarMarkup(state.loverAvatar, state.loverName)}</div><span>替换爱人头像</span><input type="file" accept="image/*" data-avatar="loverAvatar"></label></div></section><section><div class="section-title"><strong>显示模式</strong></div><div class="theme-choice"><button data-theme-choice="light" class="${state.theme === "light" ? "active" : ""}">浅色</button><button data-theme-choice="dark" class="${state.theme === "dark" ? "active" : ""}">深色</button></div></section>`;
  bindSettingInputs();
  document.querySelectorAll("[data-avatar]").forEach((input) => input.addEventListener("change", async (event) => {
    const file = event.target.files[0]; if (!file) return;
    state[event.target.dataset.avatar] = await compressImage(file, 360, 0.86);
    if (saveState(false)) { applyAppearance(); renderMessages(); renderAppearanceDrawer(); showToast("头像已替换"); }
  }));
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
    state[event.target.dataset.setting] = event.target.value; saveState(); applyAppearance(); renderMessages();
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
    if (saveState(false)) { applyAppearance(); setMode(state.mode); renderMessages(); renderDataDrawer(); showToast("备份已恢复"); }
  } catch { showToast("无法读取这个备份文件"); }
}

function closeMobileRail() { $("sideRail").classList.remove("mobile-open"); $("mobileScrim").classList.remove("show"); }

document.querySelectorAll("[data-tool]").forEach((button) => button.addEventListener("click", () => openTool(button.dataset.tool)));
document.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
$("profileButton").addEventListener("click", () => openTool("appearance"));
$("chatInfoButton").addEventListener("click", () => openTool("background"));
$("drawerBack").addEventListener("click", () => openTool("chat"));
$("drawerClose").addEventListener("click", () => openTool("chat"));
$("themeButton").addEventListener("click", () => { state.theme = state.theme === "light" ? "dark" : "light"; saveState(); applyAppearance(); if (activeTool === "appearance") renderAppearanceDrawer(); });
$("mobileMenu").addEventListener("click", () => { $("sideRail").classList.add("mobile-open"); $("mobileScrim").classList.add("show"); });
$("mobileScrim").addEventListener("click", closeMobileRail);
$("draft").addEventListener("input", (event) => { $("sendButton").disabled = !event.target.value.trim(); });
$("draft").addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendText(); } });
$("sendButton").addEventListener("click", sendText);
$("replyButton").addEventListener("click", requestReply);
$("emojiButton").addEventListener("click", toggleEmoji);
$("stickerButton").addEventListener("click", toggleStickerPopover);
document.addEventListener("click", (event) => { if (!event.target.closest(".popover,.composer-tools")) closePopovers(); });

applyAppearance();
setMode(state.mode);
renderMessages();
saveState();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
