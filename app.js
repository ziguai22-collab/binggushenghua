const KEY = "binggushenghua-v3";
const oldKey = "binggushenghua-v2";
const defaults = {
  version: 4,
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
  proactiveEnabled: false,
  proactiveInterval: 30,
  nextProactiveAt: 0,
  introEnabled: true,
  welcomeMessages: ["欢迎回来。讯号已经接通。", "世界很远，而你们始终在同一条讯号里。"],
  anniversary: "2026-01-06",
  memoryBackgroundImage: "",
  memoryBackgroundBlur: 0,
  memoryTextColor: "#403a38",
  memories: [{ id: "memory-1", name: "我们的纪念日", date: "2026-12-31", repeat: true }],
  memoryQuotes: ["相爱不是某一个瞬间，\n是每一个普通日子都被好好记住。"],
  sections: ["日常", "想念", "安慰", "睡前"],
  cards: [
    { id: "1", section: "日常", content: "等你忙完，我们绕远路一起回家。", triggers: ["下班", "回家", "忙完"], random: true, response: true, enabled: true, combo: false },
    { id: "2", section: "想念", content: "今天也有好好想你。", triggers: ["想你", "想我"], random: true, response: true, enabled: true, combo: false },
    { id: "3", section: "安慰", content: "慢慢来，我一直都在。", triggers: ["难过", "累", "不开心", "害怕"], random: true, response: true, enabled: true, combo: false },
    { id: "4", section: "睡前", content: "晚一点也没关系，困了就来找我。", triggers: ["睡不着", "晚安", "困"], random: true, response: true, enabled: true, combo: false },
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
let proactiveTimer = null;

const $ = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
const safeImage = (value) => typeof value === "string" && value.startsWith("data:image/") ? value : "";

function currentConversation() {
  return state.conversations.find((conversation) => conversation.id === state.activeConversationId) || state.conversations[0];
}

function currentMessages() {
  return currentConversation()?.messages || [];
}

function touchConversation() {
  const conversation = currentConversation();
  if (conversation) conversation.updatedAt = new Date().toISOString();
}

function normalizeState(saved = {}) {
    const migrated = { ...structuredClone(defaults), ...saved };
    migrated.sections = Array.isArray(saved.sections) ? saved.sections.map((item) => typeof item === "string" ? item : item.name).filter(Boolean) : defaults.sections;
    migrated.cards = Array.isArray(saved.cards) ? saved.cards.map((card) => ({
      id: card.id || uid(), section: card.section || migrated.sections.find((name) => name === card.sectionId) || card.sectionId || "日常",
      content: card.content || "", triggers: Array.isArray(card.triggers) ? card.triggers : [],
      random: card.random !== false, response: card.response !== false, enabled: card.enabled !== false,
      combo: card.combo === true,
    })) : defaults.cards;
    migrated.memories = Array.isArray(saved.memories) ? saved.memories : defaults.memories;
    migrated.memoryQuotes = Array.isArray(saved.memoryQuotes) && saved.memoryQuotes.some((quote) => String(quote).trim()) ? saved.memoryQuotes.map((quote) => String(quote).trim()).filter(Boolean) : defaults.memoryQuotes;
    migrated.memoryBackgroundImage = typeof saved.memoryBackgroundImage === "string" && saved.memoryBackgroundImage.startsWith("data:image/") ? saved.memoryBackgroundImage : "";
    migrated.memoryBackgroundBlur = Math.min(24, Math.max(0, Number(saved.memoryBackgroundBlur ?? defaults.memoryBackgroundBlur)));
    migrated.memoryTextColor = /^#[0-9a-f]{6}$/i.test(saved.memoryTextColor || "") ? saved.memoryTextColor : defaults.memoryTextColor;
    migrated.replyDelayMin = Math.min(60, Math.max(1, Number(saved.replyDelayMin ?? defaults.replyDelayMin)));
    migrated.replyDelayMax = Math.min(120, Math.max(migrated.replyDelayMin, Number(saved.replyDelayMax ?? defaults.replyDelayMax)));
    migrated.stickers = Array.isArray(saved.stickers) ? saved.stickers : [];
    const legacyMessages = Array.isArray(saved.messages) ? saved.messages : defaults.messages;
    migrated.conversations = Array.isArray(saved.conversations) && saved.conversations.length ? saved.conversations.map((conversation) => ({
      id: conversation.id || uid(), title: conversation.title || "新对话", createdAt: conversation.createdAt || new Date().toISOString(), updatedAt: conversation.updatedAt || conversation.createdAt || new Date().toISOString(),
      messages: Array.isArray(conversation.messages) ? conversation.messages.map((message) => ({ id: message.id || uid(), type: "text", ...message })) : [],
    })) : [{ id: uid(), title: `与${migrated.loverName}的对话`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messages: legacyMessages.map((message) => ({ id: message.id || uid(), type: "text", ...message })) }];
    migrated.activeConversationId = migrated.conversations.some((conversation) => conversation.id === saved.activeConversationId) ? saved.activeConversationId : migrated.conversations[0].id;
    migrated.proactiveEnabled = saved.proactiveEnabled === true;
    migrated.proactiveInterval = Math.min(120, Math.max(5, Number(saved.proactiveInterval ?? defaults.proactiveInterval)));
    migrated.nextProactiveAt = Number(saved.nextProactiveAt || 0);
    migrated.introEnabled = saved.introEnabled !== false;
    migrated.welcomeMessages = Array.isArray(saved.welcomeMessages) && saved.welcomeMessages.some((item) => String(item).trim()) ? saved.welcomeMessages.map((item) => String(item).trim()).filter(Boolean) : structuredClone(defaults.welcomeMessages);
    migrated.version = 4;
    delete migrated.messages;
    delete migrated.sectionCombos;
    return migrated;
}

function loadState() {
  try {
    return normalizeState(JSON.parse(localStorage.getItem(KEY) || localStorage.getItem(oldKey) || "{}"));
  } catch {
    return normalizeState({});
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

function runOpeningAnimation() {
  const screen = $("openingScreen");
  if (!state.introEnabled) { screen.hidden = true; return; }
  const welcomes = state.welcomeMessages.length ? state.welcomeMessages : defaults.welcomeMessages;
  $("openingWelcome").textContent = welcomes[Math.floor(Math.random() * welcomes.length)];
  const canvas = $("openingCanvas"); const context = canvas.getContext("2d");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let width = 0; let height = 0; let ratio = 1; let frame = 0; const started = performance.now();
  const butterflies = Array.from({ length: reduced ? 2 : 7 }, (_, index) => ({
    direction: index % 3 === 0 ? -1 : 1,
    lane: .15 + Math.random() * .68,
    offset: Math.random() * .24,
    speed: .11 + Math.random() * .08,
    scale: .5 + Math.random() * .85,
    phase: Math.random() * Math.PI * 2,
    drift: 18 + Math.random() * 42,
    tone: index % 2 ? "222,219,230" : "244,238,232",
  }));
  const resize = () => { ratio = Math.min(2, devicePixelRatio || 1); width = innerWidth; height = innerHeight; canvas.width = width * ratio; canvas.height = height * ratio; canvas.style.width = `${width}px`; canvas.style.height = `${height}px`; context.setTransform(ratio, 0, 0, ratio, 0, 0); };
  const drawButterfly = (item, progress, time) => {
    const travel = (progress + item.offset) % 1.28 - .14;
    const x = item.direction > 0 ? travel * width : width - travel * width;
    const y = item.lane * height + Math.sin(time * .0015 + item.phase + travel * 6) * item.drift;
    const beat = .22 + Math.abs(Math.sin(time * .009 + item.phase)) * .78;
    const alpha = Math.min(1, progress * 4, (1.14 - travel) * 6) * .74;
    context.save(); context.translate(x, y); context.rotate(Math.sin(time * .001 + item.phase) * .16 * item.direction); context.scale(item.direction * item.scale, item.scale); context.shadowColor = `rgba(${item.tone},.55)`; context.shadowBlur = 18;
    const gradient = context.createRadialGradient(0, 0, 1, 0, 0, 24); gradient.addColorStop(0, `rgba(${item.tone},${alpha})`); gradient.addColorStop(1, `rgba(${item.tone},${alpha * .08})`); context.fillStyle = gradient;
    [[-1, -beat], [1, beat]].forEach(([side, wing]) => { context.beginPath(); context.moveTo(side * 1, 0); context.bezierCurveTo(side * 9, -17 * wing, side * 28, -19 * wing, side * 24, 1); context.bezierCurveTo(side * 21, 15 * wing, side * 8, 15 * wing, side * 1, 3); context.closePath(); context.fill(); });
    context.fillStyle = `rgba(122,117,128,${alpha * .78})`; context.beginPath(); context.ellipse(0, 2, 1.2, 8, 0, 0, Math.PI * 2); context.fill();
    context.strokeStyle = `rgba(150,145,158,${alpha * .48})`; context.lineWidth = .7; context.beginPath(); context.moveTo(0, -5); context.quadraticCurveTo(-4, -10, -7, -11); context.moveTo(0, -5); context.quadraticCurveTo(4, -10, 7, -11); context.stroke(); context.restore();
  };
  const animate = (time) => {
    const elapsed = time - started; const progress = elapsed / (reduced ? 1300 : 3600);
    context.clearRect(0, 0, width, height);
    const fog = context.createRadialGradient(width * .5, height * .46, 10, width * .5, height * .46, Math.max(width, height) * .65); fog.addColorStop(0, "rgba(255,255,255,.13)"); fog.addColorStop(1, "rgba(255,255,255,0)"); context.fillStyle = fog; context.fillRect(0, 0, width, height);
    butterflies.forEach((item) => drawButterfly(item, progress, time));
    if (progress < 1.12 && !screen.classList.contains("finished")) frame = requestAnimationFrame(animate); else finishOpening();
  };
  const finishOpening = () => { if (screen.classList.contains("finished")) return; cancelAnimationFrame(frame); screen.classList.add("finished"); setTimeout(() => { screen.hidden = true; window.removeEventListener("resize", resize); }, 650); };
  $("skipOpening").onclick = finishOpening;
  resize(); window.addEventListener("resize", resize); frame = requestAnimationFrame(animate);
}

function avatarMarkup(dataUrl, fallback) {
  const safe = safeImage(dataUrl);
  return safe ? `<img src="${safe}" alt="">` : `<span>${escapeHtml((fallback || "?").slice(0, 1))}</span>`;
}

function relationshipDays() {
  const start = new Date(`${state.anniversary}T00:00:00`).getTime();
  return Number.isFinite(start) ? Math.max(1, Math.floor((Date.now() - start) / 86400000) + 1) : 1;
}

function applyAppearance() {
  document.documentElement.dataset.theme = state.theme;
  document.documentElement.style.setProperty("--chat-font-size", `${state.fontSize}px`);
  document.documentElement.style.setProperty("--bubble-radius", `${state.bubbleRadius}px`);
  document.documentElement.style.setProperty("--bg-overlay", String(state.backgroundOverlay / 100));
  $("messageList").style.backgroundImage = safeImage(state.backgroundImage) ? `url("${state.backgroundImage}")` : "";
  $("themeButton").innerHTML = state.theme === "light" ? '<svg viewBox="0 0 24 24"><path d="M18 15a7 7 0 0 1-9-9 7 7 0 1 0 9 9Z"/></svg>' : '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/></svg>';
  $("profileButton").innerHTML = `<span><b>${relationshipDays()}</b><small>DAYS</small></span>`;
  $("profileButton").title = `你和${state.loverName}已经相爱 ${relationshipDays()} 天`;
  $("loverName").textContent = state.loverName;
  document.querySelectorAll(".lover-mark").forEach((node) => { node.innerHTML = avatarMarkup(state.loverAvatar, state.loverName); });
}

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll("[data-mode]").forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
  $("modeLabel").textContent = mode === "random" ? "随机传讯" : "回应传讯";
  saveState();
}

function openChatOptions() {
  renderChatOptions();
  $("chatOptions").classList.add("open"); $("chatOptions").setAttribute("aria-hidden", "false");
  $("optionsScrim").hidden = false;
}

function closeChatOptions() {
  $("chatOptions").classList.remove("open"); $("chatOptions").setAttribute("aria-hidden", "true");
  $("optionsScrim").hidden = true;
}

function renderChatOptions() {
  const conversation = currentConversation();
  $("chatOptionsContent").innerHTML = `<section class="options-section"><div class="section-title"><strong>传讯模式</strong></div><div class="mode-choice"><button data-mode="random" class="${state.mode === "random" ? "active" : ""}">随机<span>字卡与表情包统一抽取</span></button><button data-mode="response" class="${state.mode === "response" ? "active" : ""}">回应<span>关键词筛选字卡，表情包保持随机</span></button></div></section><section class="options-section"><div class="section-title"><strong>主动传讯</strong><span>可选</span></div><label class="option-toggle"><span><b>允许主动发消息</b><small>页面打开或再次回来时检查</small></span><input id="proactiveEnabled" type="checkbox" ${state.proactiveEnabled ? "checked" : ""}><i></i></label><div class="range-field"><div class="range-head"><span>大约间隔</span><b id="proactiveValue">${state.proactiveInterval} 分钟</b></div><input id="proactiveRange" type="range" min="5" max="120" step="5" value="${state.proactiveInterval}"></div><p class="options-note">受手机系统限制，网页被彻底关闭后无法保证实时后台运行；重新打开时会补做检查。</p></section><section class="options-section conversation-actions"><div class="section-title"><strong>当前对话</strong><span>${escapeHtml(conversation.title)}</span></div><button class="secondary-button" id="newConversationFromOptions">新建对话</button><button class="danger-outline-button" id="clearConversation">清除此对话的聊天记录</button></section>`;
  document.querySelectorAll("#chatOptions [data-mode]").forEach((button) => button.addEventListener("click", () => { setMode(button.dataset.mode); renderChatOptions(); }));
  $("proactiveEnabled").addEventListener("change", (event) => { state.proactiveEnabled = event.target.checked; state.nextProactiveAt = 0; saveState(); scheduleProactive(); });
  $("proactiveRange").addEventListener("input", (event) => { state.proactiveInterval = Number(event.target.value); $("proactiveValue").textContent = `${state.proactiveInterval} 分钟`; state.nextProactiveAt = 0; saveState(); scheduleProactive(); });
  $("newConversationFromOptions").addEventListener("click", () => { closeChatOptions(); createConversation(); });
  $("clearConversation").addEventListener("click", () => {
    if (!confirm("清空当前对话的全部聊天记录吗？")) return;
    conversation.messages = []; touchConversation(); saveState(); renderMessages(); renderChatOptions();
  });
}

function deliverProactiveMessage() {
  if (!state.proactiveEnabled) return;
  const cards = state.cards.filter((card) => card.enabled && card.random).map((card) => ({ kind: "card", card }));
  const stickers = state.stickers.map((sticker) => ({ kind: "sticker", sticker }));
  const item = [...cards, ...stickers][Math.floor(Math.random() * (cards.length + stickers.length))];
  if (item?.kind === "sticker") currentMessages().push({ id: uid(), from: "lover", type: "sticker", content: `[表情] ${item.sticker.name}`, dataUrl: item.sticker.dataUrl, createdAt: new Date().toISOString() });
  else if (item?.card) currentMessages().push({ id: uid(), from: "lover", type: "text", content: item.card.content, createdAt: new Date().toISOString() });
  if (item) { touchConversation(); renderMessages(); }
  state.nextProactiveAt = Date.now() + state.proactiveInterval * 60000; saveState(); scheduleProactive();
}

function scheduleProactive() {
  clearTimeout(proactiveTimer);
  if (!state.proactiveEnabled) return;
  if (!state.nextProactiveAt) { state.nextProactiveAt = Date.now() + state.proactiveInterval * 60000; saveState(); }
  const wait = Math.max(800, state.nextProactiveAt - Date.now());
  proactiveTimer = setTimeout(deliverProactiveMessage, Math.min(wait, 2147483647));
}

function messageTimeLabel(value) {
  const date = new Date(value); const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const clock = date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return `今天 ${clock}`;
  if (date.toDateString() === yesterday.toDateString()) return `昨天 ${clock}`;
  return `${date.getMonth() + 1}月${date.getDate()}日 ${clock}`;
}

function renderMessages(scrollToEnd = true) {
  let previousTime = 0;
  $("messages").innerHTML = currentMessages().map((message, index) => {
    const mine = message.from === "me";
    const timestamp = new Date(message.createdAt).getTime();
    const divider = index === 0 || !Number.isFinite(previousTime) || timestamp - previousTime >= 5 * 60000 ? `<div class="time-divider">${messageTimeLabel(message.createdAt)}</div>` : "";
    previousTime = timestamp;
    const quote = message.quote?.content ? `<div class="quoted-message"><span>${escapeHtml(message.quote.from === "me" ? state.myName : state.loverName)}</span><p>${escapeHtml(message.quote.content)}</p></div>` : "";
    const image = ["sticker", "image"].includes(message.type) && safeImage(message.dataUrl);
    const content = image
      ? `${quote}<div class="bubble media-bubble ${message.type === "sticker" ? "sticker-bubble" : "image-bubble"}"><img src="${message.dataUrl}" alt="${escapeHtml(message.content || (message.type === "image" ? "图片" : "表情"))}"></div>`
      : `<div class="bubble">${quote}${escapeHtml(message.content)}</div>`;
    const actions = `<div class="message-actions"><button class="message-delete" data-delete-message="${message.id}" aria-label="删除这条消息" title="删除这条消息"><svg viewBox="0 0 24 24"><path d="M7 7h10l-.7 12H7.7L7 7ZM9 7V4h6v3M5 7h14"/></svg></button></div>`;
    return `${divider}<article class="message-row ${mine ? "me" : "lover"}" data-message-row="${message.id}">${mine ? actions : `<div class="message-avatar avatar lover-mark">${avatarMarkup(state.loverAvatar, state.loverName)}</div>`}<div class="message-body">${content}</div>${mine ? `<div class="message-avatar avatar me-mark">${avatarMarkup(state.myAvatar, state.myName)}</div>` : actions}</article>`;
  }).join("");
  document.querySelectorAll("[data-message-row] .bubble").forEach((bubble) => bubble.addEventListener("click", () => {
    const row = bubble.closest("[data-message-row]");
    const willOpen = !row.classList.contains("actions-open");
    document.querySelectorAll("[data-message-row].actions-open").forEach((item) => item.classList.remove("actions-open"));
    row.classList.toggle("actions-open", willOpen);
  }));
  document.querySelectorAll("[data-delete-message]").forEach((button) => button.addEventListener("click", () => {
    const conversation = currentConversation();
    conversation.messages = conversation.messages.filter((message) => message.id !== button.dataset.deleteMessage);
    touchConversation(); saveState();
    renderMessages(false);
  }));
  updateReplyButton();
  if (scrollToEnd) scrollMessagesToEnd();
}

function scrollMessagesToEnd() {
  requestAnimationFrame(() => {
    const list = $("messageList");
    if (!list) return;
    if (typeof list.scrollTo === "function") list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
    else list.scrollTop = list.scrollHeight;
  });
}

function pendingMessages() {
  let lastLover = -1;
  const messages = currentMessages();
  messages.forEach((message, index) => { if (message.from === "lover") lastLover = index; });
  return messages.slice(lastLover + 1).filter((message) => message.from === "me");
}

function updateReplyButton() {
  $("replyButton").disabled = typing;
}

function sendText() {
  const draft = $("draft");
  const content = draft.value.trim();
  if (!content) return;
  const conversation = currentConversation();
  conversation.messages.push({ id: uid(), from: "me", type: "text", content, createdAt: new Date().toISOString() });
  if (conversation.title === "新对话") conversation.title = content.slice(0, 18);
  touchConversation();
  draft.value = "";
  saveState();
  renderMessages();
}

function sendSticker(sticker) {
  currentMessages().push({ id: uid(), from: "me", type: "sticker", content: `[表情] ${sticker.name}`, dataUrl: sticker.dataUrl, createdAt: new Date().toISOString() });
  touchConversation(); saveState();
  closePopovers();
  renderMessages();
}

async function sendImage(event) {
  const file = event.target.files[0];
  if (!file) return;
  const conversation = currentConversation();
  if (file.size > 8 * 1024 * 1024) { showToast("图片太大，请选择 8MB 以内的图片"); event.target.value = ""; return; }
  try {
    const dataUrl = await compressImage(file, 1600, 0.84);
    const message = { id: uid(), from: "me", type: "image", content: "[图片]", dataUrl, createdAt: new Date().toISOString() };
    conversation.messages.push(message); conversation.updatedAt = new Date().toISOString();
    if (!saveState(false)) conversation.messages = conversation.messages.filter((item) => item.id !== message.id);
    else if (conversation.id === state.activeConversationId) renderMessages();
  } catch { showToast("这张图片暂时无法读取"); }
  event.target.value = "";
}

function buildReplyItems(combined, conversationMessages = currentMessages(), mode = state.mode) {
  const eligibleCards = state.cards.filter((card) => card.enabled && (mode === "random" ? card.random : card.response));
  const stickerItems = state.stickers.map((sticker) => ({ kind: "sticker", sticker }));
  let cardPool = eligibleCards;
  if (mode === "response" && combined) {
    const matched = eligibleCards.filter((card) => card.triggers.some((word) => combined.includes(word)));
    if (matched.length) cardPool = matched;
  }
  const recent = conversationMessages.slice(-16).filter((message) => message.from === "lover").map((message) => message.content);
  const freshCards = cardPool.filter((card) => !recent.includes(card.content));
  if (freshCards.length) cardPool = freshCards;
  const pool = [...cardPool.map((card) => ({ kind: "card", card })), ...stickerItems];
  const picked = pool[Math.floor(Math.random() * pool.length)];
  if (!picked) return [{ kind: "text", content: "这次还没有合适的话。先去字卡里添上一句吧。" }];
  if (picked.kind === "sticker") return [picked];
  if (picked.card.combo && Math.random() < 0.5) {
    const followPool = eligibleCards.filter((card) => card.id !== picked.card.id && card.section !== picked.card.section);
    if (followPool.length) {
      const follow = followPool[Math.floor(Math.random() * followPool.length)];
      const first = picked.card.content.trim().replace(/[，,。！？!?；;\s]+$/, "");
      const second = follow.content.trim().replace(/^[，,\s]+/, "");
      return [{ kind: "text", content: `${first}，${second}` }];
    }
  }
  return [picked];
}

function randomPendingQuote(messages) {
  if (!messages.length || Math.random() >= 0.5) return undefined;
  const message = messages[Math.floor(Math.random() * messages.length)];
  return { from: "me", content: message.content || "[消息]" };
}

function requestReply() {
  if (typing) return;
  const replyConversation = currentConversation();
  const replyMode = state.mode;
  const pending = pendingMessages();
  const combined = pending.map((message) => message.content).join("\n");
  const quoteForReply = randomPendingQuote(pending);
  typing = true;
  $("typing").hidden = false;
  $("presence").textContent = "正在输入…";
  updateReplyButton();
  scrollMessagesToEnd();
  const minimum = Math.min(60, Math.max(1, Number(state.replyDelayMin || 1)));
  const maximum = Math.min(120, Math.max(minimum, Number(state.replyDelayMax || minimum)));
  const delay = Math.round((minimum + Math.random() * (maximum - minimum)) * 1000);
  setTimeout(() => {
    try {
      const now = Date.now();
      buildReplyItems(combined, replyConversation.messages, replyMode).forEach((item, index) => {
        const quote = index === 0 && quoteForReply ? quoteForReply : undefined;
        if (item.kind === "sticker") replyConversation.messages.push({ id: uid(), from: "lover", type: "sticker", content: `[表情] ${item.sticker.name}`, dataUrl: item.sticker.dataUrl, quote, createdAt: new Date(now + index).toISOString() });
        else replyConversation.messages.push({ id: uid(), from: "lover", type: "text", content: item.card?.content || item.content, quote, createdAt: new Date(now + index).toISOString() });
      });
    } finally {
      typing = false;
      $("typing").hidden = true;
      $("presence").textContent = "讯号在线";
      replyConversation.updatedAt = new Date().toISOString(); saveState();
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
  $("toolDrawer").classList.toggle("conversation-drawer", activeTool === "conversations");
  $("toolDrawer").setAttribute("aria-hidden", String(!activeTool));
  $("toolScrim").hidden = !(activeTool === "conversations" && window.matchMedia("(max-width: 760px)").matches);
  closeChatOptions();
  closePopovers();
  if (activeTool) renderDrawer(activeTool);
}

function renderDrawer(tool) {
  const names = { conversations: "对话", cards: "字卡", stickers: "表情包", memories: "纪念日", appearance: "设置", data: "数据" };
  $("drawerTitle").textContent = names[tool];
  if (tool === "conversations") renderConversationsDrawer();
  if (tool === "cards") renderCardsDrawer();
  if (tool === "stickers") renderStickersDrawer();
  if (tool === "memories") renderMemoriesDrawer();
  if (tool === "appearance") renderAppearanceDrawer();
  if (tool === "data") renderDataDrawer();
  $("drawerContent").scrollTop = 0;
}

function renderConversationsDrawer() {
  const items = [
    ["cards", "字卡", "录入、分区和调整回复规则", '<path d="M6 4h12v16H6zM9 8h6M9 12h6M9 16h4"/>'],
    ["stickers", "表情包", "上传和整理聊天图片", '<circle cx="12" cy="12" r="8"/><path d="M9 10h.01M15 10h.01M9 14c1.6 1.4 4.4 1.4 6 0"/>'],
    ["appearance", "设置", "资料、背景、回复节奏和显示模式", '<circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/>'],
    ["data", "数据", "备份、恢复和整理本地记录", '<path d="M5 5h14v14H5zM8 9h8M8 13h8M8 17h5"/>'],
  ];
  const current = currentConversation();
  const history = state.conversations.filter((conversation) => conversation.id !== current.id).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  const sidebarQuotes = state.memoryQuotes.length ? state.memoryQuotes : defaults.memoryQuotes;
  const sidebarQuote = sidebarQuotes[Math.floor(Math.random() * sidebarQuotes.length)];
  const dateText = (value) => new Date(value).toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).replaceAll("/", ".");
  const historyRow = (conversation) => { const last = conversation.messages.at(-1); return `<article class="history-row" data-history-row="${conversation.id}"><button class="history-main" data-conversation="${conversation.id}"><strong>${escapeHtml(conversation.title)}</strong><small>${escapeHtml(last?.content || "还没有消息")}</small></button><time>${dateText(conversation.updatedAt)}</time><button class="history-edit" data-edit-conversation="${conversation.id}" aria-label="编辑对话名称">改名</button><input class="history-name-input" data-conversation-name="${conversation.id}" value="${escapeHtml(conversation.title)}" hidden></article>`; };
  $("drawerContent").innerHTML = `<button class="relationship-summary" id="openMemories"><span>TOGETHER</span><strong>你和 ${escapeHtml(state.loverName)} 已经相爱</strong><b>${relationshipDays()} <i>days</i></b><p>${escapeHtml(sidebarQuote).replace(/\n/g, "<br>")}</p></button><section class="current-conversation"><div><span>CURRENT CONVERSATION</span><strong>${escapeHtml(current.title)}</strong><small>${dateText(current.createdAt)}</small></div><button class="history-edit" data-edit-conversation="${current.id}" aria-label="编辑当前对话名称">改名</button><input class="history-name-input" data-conversation-name="${current.id}" value="${escapeHtml(current.title)}" hidden><button class="new-conversation" id="newConversation">＋ 新建对话</button></section><details class="history-archive"><summary><span>历史对话</span><b>${history.length}</b></summary><div class="conversation-list">${history.map(historyRow).join("") || '<div class="empty-history">旧对话会被收纳在这里。</div>'}</div></details><div class="drawer-subtitle">工具与设置</div><nav class="mobile-menu-list settings-menu">${items.map(([tool, title, description, icon]) => `<button data-menu-tool="${tool}"><svg viewBox="0 0 24 24">${icon}</svg><span><strong>${title}</strong><small>${description}</small></span><b>›</b></button>`).join("")}</nav>`;
  $("openMemories").addEventListener("click", () => openTool("memories"));
  $("newConversation").addEventListener("click", createConversation);
  document.querySelectorAll("[data-conversation]").forEach((button) => button.addEventListener("click", () => {
    state.activeConversationId = button.dataset.conversation; saveState(); renderMessages(); openTool("chat");
  }));
  document.querySelectorAll("[data-edit-conversation]").forEach((button) => button.addEventListener("click", () => {
    const input = document.querySelector(`[data-conversation-name="${CSS.escape(button.dataset.editConversation)}"]`);
    if (!input) return;
    input.hidden = false; input.focus(); input.select();
  }));
  document.querySelectorAll("[data-conversation-name]").forEach((input) => {
    const saveTitle = () => {
      const conversation = state.conversations.find((item) => item.id === input.dataset.conversationName);
      if (!conversation) return;
      conversation.title = input.value.trim() || "未命名对话"; saveState(); renderConversationsDrawer();
    };
    input.addEventListener("blur", saveTitle);
    input.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); input.blur(); } if (event.key === "Escape") renderConversationsDrawer(); });
  });
  document.querySelectorAll("[data-menu-tool]").forEach((button) => button.addEventListener("click", () => openTool(button.dataset.menuTool)));
}

function createConversation() {
  const conversation = { id: uid(), title: "新对话", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messages: [] };
  state.conversations.push(conversation); state.activeConversationId = conversation.id; saveState(); renderMessages(); openTool("chat"); $("draft").focus();
}

function renderCardsDrawer() {
  const visible = state.cards.filter((card) => card.content.includes(cardQuery) || card.section.includes(cardQuery) || card.triggers.some((word) => word.includes(cardQuery)));
  $("drawerContent").innerHTML = `
    <section class="drawer-section"><div class="section-title"><strong>批量录入</strong><span>一行一张字卡</span></div><label class="field-label"><textarea id="bulkCards" placeholder="今天也有好好想你。&#10;慢慢来，我一直都在。"></textarea></label><div class="inline-form"><select id="bulkSection">${state.sections.map((name) => `<option>${escapeHtml(name)}</option>`).join("")}</select><button class="green-button" id="addBulkCards">加入字卡</button></div></section>
    <section class="drawer-section"><div class="section-title"><strong>分区</strong><span>${state.sections.length} 个</span></div><div class="inline-form"><input id="newSection" placeholder="新分区名称"><button class="secondary-button" id="addSection">添加</button></div><div class="section-tags">${state.sections.map((name) => `<span class="section-chip">${escapeHtml(name)}${state.sections.length > 1 ? `<button data-delete-section="${escapeHtml(name)}">×</button>` : ""}</span>`).join("")}</div></section>
    <section class="drawer-section duplicate-check"><div class="section-title"><strong>全库重复检查</strong><span>不区分分组</span></div><button class="secondary-button" id="checkDuplicates">检查全部 ${state.cards.length} 张字卡</button><div id="duplicateResults"></div></section>
    <section><div class="drawer-search"><input id="cardSearch" value="${escapeHtml(cardQuery)}" placeholder="搜索字卡、分区或触发词"><b>${visible.length}/${state.cards.length}</b></div><div class="simple-list card-list">${visible.map((card) => `<article class="card-edit" data-card="${card.id}"><textarea class="card-copy" data-card-field="content">${escapeHtml(card.content)}</textarea><div class="card-meta-row"><select data-card-field="section">${state.sections.map((name) => `<option ${name === card.section ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}</select><input data-card-field="triggers" value="${escapeHtml(card.triggers.join("，"))}" placeholder="触发词，用逗号分隔"></div><div class="card-combo-row"><label class="mini-toggle"><input type="checkbox" data-card-field="combo" ${card.combo ? "checked" : ""}><i></i><span>允许组合</span></label><small>开启后，可能与其他分区的字卡用逗号连成一句</small></div><div class="card-edit-actions"><div class="check-group"><label class="mini-toggle"><input type="checkbox" data-card-field="random" ${card.random ? "checked" : ""}><i></i><span>随机</span></label><label class="mini-toggle"><input type="checkbox" data-card-field="response" ${card.response ? "checked" : ""}><i></i><span>回应</span></label><label class="mini-toggle"><input type="checkbox" data-card-field="enabled" ${card.enabled ? "checked" : ""}><i></i><span>启用</span></label></div><button class="icon-danger" data-delete-card="${card.id}" aria-label="删除字卡"><svg viewBox="0 0 24 24"><path d="M7 7h10l-.7 12H7.7L7 7ZM9 7V4h6v3M5 7h14"/></svg></button></div></article>`).join("") || '<div class="empty-tool">没有符合条件的字卡。</div>'}</div></section>`;
  $("addBulkCards").addEventListener("click", () => {
    const lines = $("bulkCards").value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    lines.forEach((content) => state.cards.push({ id: uid(), section: $("bulkSection").value, content, triggers: [], random: true, response: true, enabled: true, combo: false }));
    if (lines.length) { saveState(); showToast(`已加入 ${lines.length} 张字卡`); renderCardsDrawer(); }
  });
  $("addSection").addEventListener("click", () => {
    const name = $("newSection").value.trim();
    if (name && !state.sections.includes(name)) { state.sections.push(name); saveState(); renderCardsDrawer(); }
  });
  $("cardSearch").addEventListener("input", (event) => { cardQuery = event.target.value; renderCardsDrawer(); requestAnimationFrame(() => $("cardSearch")?.focus()); });
  $("checkDuplicates").addEventListener("click", () => {
    const groups = new Map();
    state.cards.forEach((card) => { const key = card.content.trim().replace(/\s+/g, " "); if (!key) return; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(card); });
    const duplicates = [...groups.entries()].filter(([, cards]) => cards.length > 1);
    $("duplicateResults").innerHTML = duplicates.length ? `<div class="duplicate-summary">发现 ${duplicates.length} 组重复内容</div>${duplicates.map(([content, cards]) => `<article><p>${escapeHtml(content)}</p><span>${cards.map((card) => escapeHtml(card.section)).join(" · ")} · 共 ${cards.length} 张</span></article>`).join("")}` : '<div class="duplicate-clean">✓ 没有发现重复字卡</div>';
  });
  document.querySelectorAll("[data-card-field]").forEach((input) => input.addEventListener(input.matches("textarea,input:not([type='checkbox'])") ? "input" : "change", (event) => {
    const card = state.cards.find((item) => item.id === event.target.closest("[data-card]").dataset.card);
    const field = event.target.dataset.cardField;
    if (!card) return;
    if (["random", "response", "enabled", "combo"].includes(field)) card[field] = event.target.checked;
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
  const memoryBackground = safeImage(state.memoryBackgroundImage);
  $("drawerContent").innerHTML = `<section class="memory-hero ${memoryBackground ? "has-wallpaper" : ""}" style="--memory-color:${state.memoryTextColor};--memory-blur:${state.memoryBackgroundBlur}px"><div class="memory-wallpaper" ${memoryBackground ? `style="background-image:url('${memoryBackground}')"` : ""}></div><div class="memory-veil"></div><div class="memory-content"><span class="memory-kicker">TOGETHER · ${escapeHtml(since)}</span><h3>你和 ${escapeHtml(state.loverName)} 已经相爱</h3><div class="memory-number">${Number.isFinite(days) ? days : "—"}</div><span class="memory-days">days</span><p>${escapeHtml(quote).replace(/\n/g, "<br>")}</p></div></section><section class="drawer-section memory-card-settings"><div class="section-title"><strong>纪念日卡片</strong><span>即时预览</span></div><div class="background-actions"><label class="wallpaper-button">更换卡片壁纸<input id="memoryBackgroundFile" type="file" accept="image/*"></label><button class="restore-button" id="removeMemoryBackground">恢复默认</button></div><div class="range-field"><div class="range-head"><span>壁纸模糊度</span><b id="memoryBlurValue">${state.memoryBackgroundBlur}px</b></div><input id="memoryBlurRange" type="range" min="0" max="24" step="1" value="${state.memoryBackgroundBlur}"></div><div class="memory-color-setting"><span>文字色号</span><input id="memoryColorPicker" type="color" value="${state.memoryTextColor}" aria-label="选择纪念日文字颜色"><input id="memoryColorHex" value="${state.memoryTextColor}" maxlength="7" aria-label="纪念日文字色号"></div></section><section class="memory-date-setting">${inputField("我们从这一天开始", "date", state.anniversary, "anniversary")}</section><section class="drawer-section memory-quotes"><div class="section-title"><strong>纪念日文案</strong><span>侧边栏与卡片随机显示</span></div><label class="field-label"><textarea id="newMemoryQuotes" placeholder="写下一句想看见的话…&#10;可以一行添加一句"></textarea></label><button class="secondary-button memory-add" id="addMemoryQuotes">加入文案库</button><div class="quote-list">${state.memoryQuotes.map((item, index) => `<article><p>${escapeHtml(item)}</p><button data-delete-quote="${index}" aria-label="删除这句文案">×</button></article>`).join("")}</div></section><section class="drawer-section memory-create"><div class="section-title"><strong>新增纪念日</strong><span>时间坐标</span></div><div class="inline-form"><input id="memoryName" placeholder="为这一天取个名字"><input id="memoryDate" type="date"></div><label class="memory-repeat"><input id="memoryRepeat" type="checkbox" checked><i></i><span>每年重复</span></label><button class="green-button memory-add" id="addMemory">保存纪念日</button></section><section class="memory-list"><div class="section-title"><strong>纪念日记录</strong><span>${state.memories.length} 个</span></div>${state.memories.map((memory) => { const countdown = memoryCountdown(memory); return `<article class="memory-row"><div class="memory-date"><b>${escapeHtml(memory.date.slice(5).replace("-", "."))}</b><span>${memory.repeat ? "EVERY YEAR" : memory.date.slice(0, 4)}</span></div><div class="memory-copy"><strong>${escapeHtml(memory.name)}</strong><span>${countdown}</span></div><button data-delete-memory="${memory.id}" aria-label="删除纪念日">×</button></article>`; }).join("") || '<div class="empty-tool">还没有其他纪念日。</div>'}</section>`;
  bindSettingInputs();
  $("memoryBackgroundFile").addEventListener("change", async (event) => {
    const file = event.target.files[0]; if (!file) return;
    state.memoryBackgroundImage = await compressImage(file, 1600, 0.84);
    if (saveState(false)) { renderMemoriesDrawer(); showToast("纪念日卡片壁纸已替换"); }
  });
  $("removeMemoryBackground").addEventListener("click", () => { state.memoryBackgroundImage = ""; saveState(); renderMemoriesDrawer(); showToast("已恢复默认卡片背景"); });
  $("memoryBlurRange").addEventListener("input", (event) => {
    state.memoryBackgroundBlur = Number(event.target.value); $("memoryBlurValue").textContent = `${state.memoryBackgroundBlur}px`;
    document.querySelector(".memory-hero")?.style.setProperty("--memory-blur", `${state.memoryBackgroundBlur}px`); saveState();
  });
  const setMemoryColor = (value) => {
    if (!/^#[0-9a-f]{6}$/i.test(value)) return false;
    state.memoryTextColor = value; $("memoryColorPicker").value = value; $("memoryColorHex").value = value;
    document.querySelector(".memory-hero")?.style.setProperty("--memory-color", value); saveState(); return true;
  };
  $("memoryColorPicker").addEventListener("input", (event) => setMemoryColor(event.target.value));
  $("memoryColorHex").addEventListener("change", (event) => { if (!setMemoryColor(event.target.value.trim())) { event.target.value = state.memoryTextColor; showToast("请输入六位十六进制色号，例如 #403a38"); } });
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
  $("drawerContent").innerHTML = `<section class="drawer-section"><div class="section-title"><strong>双方资料</strong><span>仅保存在本机</span></div>${inputField("我的称呼", "text", state.myName, "myName")}${inputField("爱人的称呼", "text", state.loverName, "loverName")}<div class="avatar-settings"><label class="avatar-upload"><div class="avatar">${avatarMarkup(state.myAvatar, state.myName)}</div><span>替换我的头像</span><input type="file" accept="image/*" data-avatar="myAvatar"></label><label class="avatar-upload"><div class="avatar">${avatarMarkup(state.loverAvatar, state.loverName)}</div><span>替换爱人头像</span><input type="file" accept="image/*" data-avatar="loverAvatar"></label></div></section><section class="drawer-section background-settings"><div class="section-title"><strong>聊天背景</strong><span>消息区域</span></div><div class="background-preview" style="background-image:${safeImage(state.backgroundImage) ? `url('${state.backgroundImage}')` : "none"}"></div><div class="background-actions"><label class="wallpaper-button">更换壁纸<input id="backgroundFile" type="file" accept="image/*"></label><button class="restore-button" id="removeBackground">恢复默认</button></div><div class="range-field"><div class="range-head"><span>聊天字体大小</span><b id="fontSizeValue">${state.fontSize}px</b></div><input id="fontSizeRange" type="range" min="12" max="22" value="${state.fontSize}"></div><div class="range-field"><div class="range-head"><span>气泡圆角</span><b id="radiusValue">${state.bubbleRadius}px</b></div><input id="radiusRange" type="range" min="0" max="18" value="${state.bubbleRadius}"></div><div class="range-field"><div class="range-head"><span>背景遮罩</span><b id="overlayValue">${state.backgroundOverlay}%</b></div><input id="overlayRange" type="range" min="0" max="75" value="${state.backgroundOverlay}"></div></section><section class="drawer-section intro-settings"><div class="section-title"><strong>开屏与欢迎语</strong><span>Canvas 蝴蝶动画</span></div><label class="option-toggle intro-toggle"><span><b>显示开屏动画</b><small>每次重新进入时播放</small></span><input id="introEnabled" type="checkbox" ${state.introEnabled ? "checked" : ""}><i></i></label><label class="field-label"><span>随机欢迎语，一行一句</span><textarea id="welcomeMessagesText" placeholder="欢迎回来。讯号已经接通。">${escapeHtml(state.welcomeMessages.join("\n"))}</textarea></label><button class="secondary-button memory-add" id="saveWelcomeMessages">保存欢迎语</button></section><section class="drawer-section reply-delay-settings"><div class="section-title"><strong>回复等待时间</strong><span>区间内随机</span></div><p class="drawer-intro">点击手动回复后，等待时间会在最短与最长之间随机选择。</p><div class="range-field"><div class="range-head"><span>最短等待</span><b id="delayMinValue">${formatDelay(state.replyDelayMin)}</b></div><input id="delayMinRange" type="range" min="1" max="60" step="1" value="${state.replyDelayMin}"></div><div class="range-field"><div class="range-head"><span>最长等待</span><b id="delayMaxValue">${formatDelay(state.replyDelayMax)}</b></div><input id="delayMaxRange" type="range" min="1" max="120" step="1" value="${state.replyDelayMax}"></div><div class="delay-scale"><span>1 秒</span><span>1 分钟</span><span>2 分钟</span></div></section><section class="drawer-section"><div class="section-title"><strong>显示模式</strong></div><div class="theme-choice"><button data-theme-choice="light" class="${state.theme === "light" ? "active" : ""}">浅色</button><button data-theme-choice="dark" class="${state.theme === "dark" ? "active" : ""}">深色</button></div></section>`;
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
  $("backgroundFile").addEventListener("change", async (event) => {
    const file = event.target.files[0]; if (!file) return;
    state.backgroundImage = await compressImage(file, 1800, 0.82);
    if (saveState(false)) { applyAppearance(); renderAppearanceDrawer(); showToast("聊天背景已替换"); }
  });
  $("removeBackground").addEventListener("click", () => { state.backgroundImage = ""; saveState(); applyAppearance(); renderAppearanceDrawer(); showToast("已恢复默认背景"); });
  $("introEnabled").addEventListener("change", (event) => { state.introEnabled = event.target.checked; saveState(); });
  $("saveWelcomeMessages").addEventListener("click", () => {
    const messages = $("welcomeMessagesText").value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    if (!messages.length) { showToast("请至少保留一句欢迎语"); return; }
    state.welcomeMessages = messages; saveState(); showToast(`已保存 ${messages.length} 句欢迎语`);
  });
  [["fontSizeRange", "fontSize", "fontSizeValue", "px"], ["radiusRange", "bubbleRadius", "radiusValue", "px"], ["overlayRange", "backgroundOverlay", "overlayValue", "%"]].forEach(([id, key, output, unit]) => {
    $(id).addEventListener("input", (event) => { state[key] = Number(event.target.value); $(output).textContent = `${state[key]}${unit}`; applyAppearance(); saveState(); });
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
  $("drawerContent").innerHTML = `<section class="drawer-section"><div class="save-line">✓ <span>聊天、字卡和图片已保存在当前浏览器</span></div><p class="drawer-intro">更换手机、浏览器或清理网站数据前，请先导出完整备份。</p><button class="export-button" id="exportButton">导出完整备份</button><label class="upload-box" style="margin-top:10px">导入备份文件<input id="importFile" type="file" accept="application/json"></label></section><section><div class="section-title"><strong>整理数据</strong><span>操作前建议备份</span></div><div class="button-row"><button class="secondary-button" id="clearHistory">清空全部对话</button><button class="danger-button" id="resetAll">恢复初始状态</button></div></section>`;
  $("exportButton").addEventListener("click", exportData);
  $("importFile").addEventListener("change", importData);
  $("clearHistory").addEventListener("click", () => { if (!confirm("确定清空全部对话记录吗？")) return; state.conversations.forEach((conversation) => { conversation.messages = []; conversation.updatedAt = new Date().toISOString(); }); saveState(); renderMessages(); showToast("全部对话记录已清空"); });
  $("resetAll").addEventListener("click", () => { if (!confirm("确定恢复初始状态吗？所有本机数据都会被覆盖。")) return; state = normalizeState({}); saveState(); applyAppearance(); setMode(state.mode); renderMessages(); renderDataDrawer(); scheduleProactive(); showToast("已恢复初始状态"); });
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
    if (!Array.isArray(incoming.cards) || (!Array.isArray(incoming.messages) && !Array.isArray(incoming.conversations))) throw new Error("invalid");
    state = normalizeState({ ...incoming, version: 4 });
    if (saveState(false)) { applyAppearance(); setMode(state.mode); renderMessages(); renderDataDrawer(); scheduleProactive(); showToast("备份已恢复"); }
  } catch { showToast("无法读取这个备份文件"); }
}

document.querySelectorAll("[data-tool]").forEach((button) => button.addEventListener("click", () => openTool(button.dataset.tool)));
document.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
$("profileButton").addEventListener("click", () => openTool("memories"));
$("chatInfoButton").addEventListener("click", openChatOptions);
$("optionsClose").addEventListener("click", closeChatOptions);
$("optionsScrim").addEventListener("click", closeChatOptions);
$("toolScrim").addEventListener("click", () => openTool("chat"));
$("drawerBack").addEventListener("click", () => {
  if (window.matchMedia("(max-width: 760px)").matches && activeTool && activeTool !== "conversations") openTool("conversations");
  else openTool("chat");
});
$("drawerClose").addEventListener("click", () => openTool("chat"));
$("themeButton").addEventListener("click", () => { state.theme = state.theme === "light" ? "dark" : "light"; saveState(); applyAppearance(); if (activeTool === "appearance") renderAppearanceDrawer(); });
$("mobileMenu").addEventListener("click", () => openTool("conversations"));
$("draft").addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendText(); } });
$("replyButton").addEventListener("click", requestReply);
$("stickerButton").addEventListener("click", toggleStickerPopover);
$("imageFile").addEventListener("change", sendImage);
document.addEventListener("click", (event) => {
  if (!event.target.closest(".popover,.composer")) closePopovers();
  if (!event.target.closest("[data-message-row]")) document.querySelectorAll("[data-message-row].actions-open").forEach((row) => row.classList.remove("actions-open"));
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && state.proactiveEnabled && state.nextProactiveAt <= Date.now()) deliverProactiveMessage();
});
window.addEventListener("resize", () => {
  $("toolScrim").hidden = !(activeTool === "conversations" && window.matchMedia("(max-width: 760px)").matches);
});

applyAppearance();
setMode(state.mode);
renderMessages();
saveState();
scheduleProactive();
runOpeningAnimation();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
