const KEY = "binggushenghua-v3";
const oldKey = "binggushenghua-v2";
const DB_NAME = "binggushenghua-local";
const DB_STORE = "app-state";
const DB_KEY = "current";
const defaults = {
  version: 9,
  theme: "light",
  myName: "我",
  loverName: "对方",
  myAvatar: "",
  loverAvatar: "",
  backgroundImage: "",
  backgroundOverlay: 0,
  sidebarBackgroundImage: "",
  sidebarBackgroundBlur: 0,
  fontSize: 14,
  customFontData: "",
  customFontUrl: "",
  customFontName: "",
  bubbleRadius: 4,
  myBubbleColor: "",
  myBubbleTextColor: "",
  loverBubbleColor: "",
  loverBubbleTextColor: "",
  mode: "random",
  replyDelayMin: 2,
  replyDelayMax: 5,
  proactiveEnabled: false,
  proactiveInterval: 30,
  nextProactiveAt: 0,
  replyQuoteEnabled: true,
  replyQuoteProbability: 50,
  replyMaxCount: 3,
  introEnabled: true,
  welcomeMessages: ["欢迎回来。", "新的对话已经准备好。"],
  welcomeShuffle: [],
  lastWelcomeMessage: "",
  lastSavedAt: "",
  lastBackupAt: "",
  anniversary: "",
  memoryBackgroundImage: "",
  memoryBackgroundBlur: 0,
  memoryTextColor: "#403a38",
  memories: [],
  memoryQuotes: ["在这里添加你想随机显示的纪念日文案。"],
  sections: ["日常", "想念", "安慰", "睡前"],
  sectionSettings: {},
  cards: [],
  stickers: [],
  messages: [],
};

const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let state;
let activeTool = null;
let typing = false;
let cardQuery = "";
let toastTimer = null;
let proactiveTimer = null;
let databasePromise = null;
let storageMode = "indexedDB";
let saveTimer = null;
let saveQueue = Promise.resolve(true);
let saveRevision = 0;
let appliedFontSource = "";
let activeCustomFontFace = null;
let fontLoadToken = 0;

const $ = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
const safeImage = (value) => typeof value === "string" && value.startsWith("data:image/") ? value : "";
const safeColor = (value) => /^#[0-9a-f]{6}$/i.test(value || "") ? value.toLowerCase() : "";
const safeFontData = (value) => typeof value === "string" && /^data:(font\/|application\/(font|x-font|octet-stream))/i.test(value) && value.length <= 12 * 1024 * 1024 ? value : "";
const safeFontUrl = (value) => {
  try { const url = new URL(String(value || "").trim()); return url.protocol === "https:" ? url.href : ""; }
  catch { return ""; }
};

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
    migrated.sections = Array.isArray(saved.sections) ? saved.sections.map((item) => typeof item === "string" ? item : item.name).filter(Boolean) : structuredClone(defaults.sections);
    migrated.cards = Array.isArray(saved.cards) ? saved.cards.map((card) => ({
      id: card.id || uid(), section: card.section || migrated.sections.find((name) => name === card.sectionId) || card.sectionId || "日常",
      content: card.content || "", triggers: Array.isArray(card.triggers) ? card.triggers : [],
      random: card.random !== false, response: card.response !== false, enabled: card.enabled !== false,
      combo: card.combo === true,
    })) : structuredClone(defaults.cards);
    const savedSectionSettings = saved.sectionSettings && typeof saved.sectionSettings === "object" ? saved.sectionSettings : {};
    migrated.sectionSettings = {};
    migrated.sections.forEach((section) => {
      const cards = migrated.cards.filter((card) => card.section === section);
      const previous = savedSectionSettings[section] || {};
      const settings = {
        random: typeof previous.random === "boolean" ? previous.random : (cards.length ? cards.some((card) => card.random) : true),
        response: typeof previous.response === "boolean" ? previous.response : (cards.length ? cards.some((card) => card.response) : true),
        enabled: typeof previous.enabled === "boolean" ? previous.enabled : (cards.length ? cards.some((card) => card.enabled) : true),
        combo: typeof previous.combo === "boolean" ? previous.combo : cards.some((card) => card.combo),
      };
      migrated.sectionSettings[section] = settings;
      cards.forEach((card) => Object.assign(card, settings));
    });
    migrated.memories = Array.isArray(saved.memories) ? saved.memories : structuredClone(defaults.memories);
    migrated.memoryQuotes = Array.isArray(saved.memoryQuotes) && saved.memoryQuotes.some((quote) => String(quote).trim()) ? saved.memoryQuotes.map((quote) => String(quote).trim()).filter(Boolean) : structuredClone(defaults.memoryQuotes);
    migrated.memoryBackgroundImage = typeof saved.memoryBackgroundImage === "string" && saved.memoryBackgroundImage.startsWith("data:image/") ? saved.memoryBackgroundImage : "";
    migrated.memoryBackgroundBlur = Math.min(24, Math.max(0, Number(saved.memoryBackgroundBlur ?? defaults.memoryBackgroundBlur)));
    migrated.memoryTextColor = /^#[0-9a-f]{6}$/i.test(saved.memoryTextColor || "") ? saved.memoryTextColor : defaults.memoryTextColor;
    migrated.sidebarBackgroundImage = safeImage(saved.sidebarBackgroundImage);
    migrated.sidebarBackgroundBlur = Math.min(24, Math.max(0, Number(saved.sidebarBackgroundBlur ?? defaults.sidebarBackgroundBlur)));
    migrated.customFontData = safeFontData(saved.customFontData);
    migrated.customFontUrl = migrated.customFontData ? "" : safeFontUrl(saved.customFontUrl);
    migrated.customFontName = typeof saved.customFontName === "string" ? saved.customFontName.slice(0, 120) : "";
    ["myBubbleColor", "myBubbleTextColor", "loverBubbleColor", "loverBubbleTextColor"].forEach((key) => { migrated[key] = safeColor(saved[key]); });
    migrated.replyDelayMin = Math.min(60, Math.max(1, Number(saved.replyDelayMin ?? defaults.replyDelayMin)));
    migrated.replyDelayMax = Math.min(120, Math.max(migrated.replyDelayMin, Number(saved.replyDelayMax ?? defaults.replyDelayMax)));
    migrated.replyQuoteEnabled = saved.replyQuoteEnabled !== false;
    migrated.replyQuoteProbability = Math.min(100, Math.max(0, Number(saved.replyQuoteProbability ?? defaults.replyQuoteProbability)));
    migrated.replyMaxCount = Math.min(6, Math.max(1, Number(saved.replyMaxCount ?? defaults.replyMaxCount)));
    migrated.stickers = Array.isArray(saved.stickers) ? saved.stickers : structuredClone(defaults.stickers);
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
    migrated.welcomeMessages = Array.isArray(saved.welcomeMessages) && saved.welcomeMessages.some((item) => String(item).trim()) ? [...new Set(saved.welcomeMessages.map((item) => String(item).trim()).filter(Boolean))] : structuredClone(defaults.welcomeMessages);
    migrated.welcomeShuffle = Array.isArray(saved.welcomeShuffle) ? saved.welcomeShuffle.map(String).filter((item) => migrated.welcomeMessages.includes(item)) : [];
    migrated.lastWelcomeMessage = typeof saved.lastWelcomeMessage === "string" ? saved.lastWelcomeMessage : "";
    migrated.lastSavedAt = typeof saved.lastSavedAt === "string" ? saved.lastSavedAt : "";
    migrated.lastBackupAt = typeof saved.lastBackupAt === "string" ? saved.lastBackupAt : "";
    migrated.version = 9;
    delete migrated.messages;
    delete migrated.sectionCombos;
    return migrated;
}

function openDatabase() {
  if (!("indexedDB" in window)) return Promise.reject(new Error("IndexedDB unavailable"));
  if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(DB_STORE)) request.result.createObjectStore(DB_STORE); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Unable to open IndexedDB"));
  });
  return databasePromise;
}

async function readDatabaseState() {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(DB_STORE, "readonly");
    const request = transaction.objectStore(DB_STORE).get(DB_KEY);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Unable to read local data"));
  });
}

async function writeDatabaseState(snapshot) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(DB_STORE, "readwrite");
    transaction.objectStore(DB_STORE).put(snapshot, DB_KEY);
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error || new Error("Unable to save local data"));
    transaction.onabort = () => reject(transaction.error || new Error("Local save was aborted"));
  });
}

function readLegacyState() {
  try { return JSON.parse(localStorage.getItem(KEY) || localStorage.getItem(oldKey) || "{}"); }
  catch { return {}; }
}

async function loadState() {
  try {
    const stored = await readDatabaseState();
    if (stored) return normalizeState(stored);
    const migrated = normalizeState(readLegacyState());
    await writeDatabaseState(migrated);
    return migrated;
  } catch {
    storageMode = "localStorage";
    return normalizeState(readLegacyState());
  }
}

function setSaveStatus(status, label) {
  const indicator = $("saveIndicator");
  if (!indicator) return;
  indicator.dataset.status = status;
  indicator.textContent = label;
}

async function persistState(quiet = true) {
  const savedAt = new Date().toISOString();
  const snapshot = structuredClone({ ...state, version: 7, lastSavedAt: savedAt });
  const task = async () => {
    try {
      if (storageMode === "indexedDB") await writeDatabaseState(snapshot);
      else localStorage.setItem(KEY, JSON.stringify(snapshot));
      state.lastSavedAt = savedAt;
      setSaveStatus("saved", `已保存 ${new Date(savedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`);
      return true;
    } catch {
      setSaveStatus("failed", "保存失败");
      if (!quiet) showToast("保存失败，请先导出备份并检查本地空间");
      return false;
    }
  };
  saveQueue = saveQueue.then(task, task);
  return saveQueue;
}

function saveState(quiet = true) {
  saveRevision += 1;
  const revision = saveRevision;
  setSaveStatus("saving", "保存中…");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { if (revision === saveRevision) persistState(quiet); }, 180);
  return true;
}

async function saveStateNow(quiet = true) {
  clearTimeout(saveTimer);
  saveRevision += 1;
  setSaveStatus("saving", "保存中…");
  return persistState(quiet);
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2300);
}

function appendSaveAction(container, label) {
  const action = document.createElement("div");
  action.className = "section-save-action";
  action.innerHTML = `<button class="section-save-button">${escapeHtml(label)}</button>`;
  container.append(action);
  const button = action.querySelector("button");
  button.addEventListener("click", async () => {
    button.disabled = true; button.textContent = "保存中…";
    const saved = await saveStateNow(false);
    if (!button.isConnected) return;
    button.disabled = false; button.classList.toggle("saved", saved); button.textContent = saved ? "已保存" : "重新保存";
    if (saved) setTimeout(() => { if (button.isConnected) { button.classList.remove("saved"); button.textContent = label; } }, 1300);
  });
}

function nextWelcomeMessage() {
  const welcomes = state.welcomeMessages.length ? [...new Set(state.welcomeMessages)] : structuredClone(defaults.welcomeMessages);
  let bag = Array.isArray(state.welcomeShuffle) ? state.welcomeShuffle.filter((item, index, items) => welcomes.includes(item) && items.indexOf(item) === index) : [];
  if (!bag.length) {
    bag = [...welcomes];
    for (let index = bag.length - 1; index > 0; index -= 1) {
      const target = Math.floor(Math.random() * (index + 1));
      [bag[index], bag[target]] = [bag[target], bag[index]];
    }
    if (bag.length > 1 && bag[0] === state.lastWelcomeMessage) [bag[0], bag[1]] = [bag[1], bag[0]];
  }
  const next = bag.shift() || welcomes[0];
  state.welcomeShuffle = bag;
  state.lastWelcomeMessage = next;
  saveState();
  return next;
}

function runOpeningAnimation() {
  const screen = $("openingScreen");
  if (!state.introEnabled) { screen.hidden = true; return; }
  $("openingWelcome").textContent = nextWelcomeMessage();
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

function defaultBubbleColors() {
  return state.theme === "dark"
    ? { myBubbleColor: "#3c7550", myBubbleTextColor: "#ffffff", loverBubbleColor: "#2c2c2c", loverBubbleTextColor: "#ededed" }
    : { myBubbleColor: "#95ec69", myBubbleTextColor: "#111111", loverBubbleColor: "#ffffff", loverBubbleTextColor: "#191919" };
}

function shownBubbleColor(key) {
  return safeColor(state[key]) || defaultBubbleColors()[key];
}

async function applyGlobalFont() {
  const source = safeFontData(state.customFontData) || safeFontUrl(state.customFontUrl);
  if (source === appliedFontSource) return true;
  const token = ++fontLoadToken;
  if (!source) {
    if (activeCustomFontFace) document.fonts.delete(activeCustomFontFace);
    activeCustomFontFace = null; appliedFontSource = "";
    document.documentElement.style.removeProperty("--global-font");
    return true;
  }
  try {
    const face = new FontFace("UserGlobalFont", `url(${JSON.stringify(source)})`, { display: "swap" });
    await face.load();
    if (token !== fontLoadToken) return false;
    if (activeCustomFontFace) document.fonts.delete(activeCustomFontFace);
    document.fonts.add(face); activeCustomFontFace = face; appliedFontSource = source;
    document.documentElement.style.setProperty("--global-font", '"UserGlobalFont","PingFang SC","Microsoft YaHei",system-ui,sans-serif');
    return true;
  } catch { return false; }
}

function applyAppearance() {
  document.documentElement.dataset.theme = state.theme;
  document.documentElement.style.setProperty("--chat-font-size", `${state.fontSize}px`);
  document.documentElement.style.setProperty("--bubble-radius", `${state.bubbleRadius}px`);
  document.documentElement.style.setProperty("--bg-overlay", String(state.backgroundOverlay / 100));
  document.documentElement.style.setProperty("--mine", shownBubbleColor("myBubbleColor"));
  document.documentElement.style.setProperty("--mine-ink", shownBubbleColor("myBubbleTextColor"));
  document.documentElement.style.setProperty("--friend", shownBubbleColor("loverBubbleColor"));
  document.documentElement.style.setProperty("--friend-ink", shownBubbleColor("loverBubbleTextColor"));
  document.documentElement.style.setProperty("--sidebar-blur", `${state.sidebarBackgroundBlur}px`);
  document.documentElement.style.setProperty("--sidebar-wallpaper", safeImage(state.sidebarBackgroundImage) ? `url("${state.sidebarBackgroundImage}")` : "none");
  document.documentElement.style.setProperty("--chat-wallpaper", safeImage(state.backgroundImage) ? `url("${state.backgroundImage}")` : "none");
  void applyGlobalFont();
  $("messageList").style.backgroundImage = "";
  [$("toolDrawer"), $("chatOptions")].forEach((drawer) => drawer.classList.toggle("has-sidebar-wallpaper", Boolean(safeImage(state.sidebarBackgroundImage))));
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
  $("chatOptionsContent").innerHTML = `<section class="options-section"><div class="section-title"><strong>传讯模式</strong></div><div class="mode-choice"><button data-mode="random" class="${state.mode === "random" ? "active" : ""}">随机<span>字卡与表情包统一抽取</span></button><button data-mode="response" class="${state.mode === "response" ? "active" : ""}">回应<span>关键词筛选字卡，表情包保持随机</span></button></div></section><section class="options-section"><div class="section-title"><strong>引用消息</strong><span>本轮消息</span></div><label class="option-toggle"><span><b>允许随机引用</b><small>关闭后，回复不会附带引用</small></span><input id="replyQuoteEnabled" type="checkbox" ${state.replyQuoteEnabled ? "checked" : ""}><i></i></label><div class="range-field"><div class="range-head"><span>引用概率</span><b id="replyQuoteValue">${state.replyQuoteProbability}%</b></div><input id="replyQuoteRange" type="range" min="0" max="100" step="5" value="${state.replyQuoteProbability}" ${state.replyQuoteEnabled ? "" : "disabled"}></div></section><section class="options-section"><div class="section-title"><strong>主动传讯</strong><span>可选</span></div><label class="option-toggle"><span><b>允许主动发消息</b><small>页面打开或再次回来时检查</small></span><input id="proactiveEnabled" type="checkbox" ${state.proactiveEnabled ? "checked" : ""}><i></i></label><div class="range-field"><div class="range-head"><span>大约间隔</span><b id="proactiveValue">${state.proactiveInterval} 分钟</b></div><input id="proactiveRange" type="range" min="5" max="120" step="5" value="${state.proactiveInterval}"></div><p class="options-note">受手机系统限制，网页被彻底关闭后无法保证实时后台运行；重新打开时会补做检查。</p></section><section class="options-section conversation-actions"><div class="section-title"><strong>当前对话</strong><span>${escapeHtml(conversation.title)}</span></div><button class="danger-outline-button" id="clearConversation">清除此对话的聊天记录</button></section>`;
  $("proactiveEnabled").closest(".options-section").insertAdjacentHTML("beforebegin", `<section class="options-section"><div class="section-title"><strong>每轮回复条数</strong><span>随机生成</span></div><div class="range-field"><div class="range-head"><span>最多回复</span><b id="replyMaxValue">${state.replyMaxCount} 条</b></div><input id="replyMaxRange" type="range" min="1" max="6" step="1" value="${state.replyMaxCount}"></div><p class="options-note">每轮会在 1 条到所选上限之间随机，不会固定发满。</p></section>`);
  document.querySelectorAll("#chatOptions [data-mode]").forEach((button) => button.addEventListener("click", () => { setMode(button.dataset.mode); renderChatOptions(); }));
  $("replyQuoteEnabled").addEventListener("change", (event) => { state.replyQuoteEnabled = event.target.checked; saveState(); renderChatOptions(); });
  $("replyQuoteRange").addEventListener("input", (event) => { state.replyQuoteProbability = Number(event.target.value); $("replyQuoteValue").textContent = `${state.replyQuoteProbability}%`; saveState(); });
  $("replyMaxRange").addEventListener("input", (event) => { state.replyMaxCount = Number(event.target.value); $("replyMaxValue").textContent = `${state.replyMaxCount} 条`; saveState(); });
  $("proactiveEnabled").addEventListener("change", (event) => { state.proactiveEnabled = event.target.checked; state.nextProactiveAt = 0; saveState(); scheduleProactive(); });
  $("proactiveRange").addEventListener("input", (event) => { state.proactiveInterval = Number(event.target.value); $("proactiveValue").textContent = `${state.proactiveInterval} 分钟`; state.nextProactiveAt = 0; saveState(); scheduleProactive(); });
  $("clearConversation").addEventListener("click", () => {
    if (!confirm("清空当前对话的全部聊天记录吗？")) return;
    conversation.messages = []; touchConversation(); saveState(); renderMessages(); renderChatOptions();
  });
  appendSaveAction($("chatOptionsContent"), "保存聊天设置");
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
      : quote
        ? `<div class="bubble has-quote">${quote}<div class="bubble-text">${escapeHtml(message.content)}</div></div>`
        : `<div class="bubble">${escapeHtml(message.content)}</div>`;
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
    if (!await saveStateNow(false)) conversation.messages = conversation.messages.filter((item) => item.id !== message.id);
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
  if (!pool.length) return [{ kind: "text", content: "这次还没有合适的话。先去字卡里添上一句吧。" }];
  const maximum = Math.min(Math.max(1, Number(state.replyMaxCount) || 1), pool.length);
  const count = 1 + Math.floor(Math.random() * maximum);
  const available = [...pool];
  const replies = [];
  while (replies.length < count && available.length) {
    const picked = available.splice(Math.floor(Math.random() * available.length), 1)[0];
    if (picked.kind === "sticker") { replies.push(picked); continue; }
    if (picked.card.combo && Math.random() < 0.5) {
      const followPool = eligibleCards.filter((card) => card.id !== picked.card.id && card.section !== picked.card.section);
      if (followPool.length) {
        const follow = followPool[Math.floor(Math.random() * followPool.length)];
        const followIndex = available.findIndex((item) => item.kind === "card" && item.card.id === follow.id);
        if (followIndex >= 0) available.splice(followIndex, 1);
        const first = picked.card.content.trim().replace(/[，,。！？!?；;\s]+$/, "");
        const second = follow.content.trim().replace(/^[，,\s]+/, "");
        replies.push({ kind: "text", content: `${first} ${second}` });
        continue;
      }
    }
    replies.push(picked);
  }
  return replies;
}

function randomPendingQuote(messages) {
  if (!state.replyQuoteEnabled || !messages.length || Math.random() * 100 >= state.replyQuoteProbability) return undefined;
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
  const names = { conversations: "", cards: "字卡", stickers: "表情包", memories: "纪念日", appearance: "设置", data: "数据" };
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
  const memoryBackground = safeImage(state.memoryBackgroundImage);
  const dateText = (value) => new Date(value).toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).replaceAll("/", ".");
  const pencilIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4.2-1 10.4-10.4-3.2-3.2L5 15.8 4 20ZM13.8 7l3.2 3.2"/></svg>';
  const deleteIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10l-.7 12H7.7L7 7ZM9 7V4h6v3M5 7h14"/></svg>';
  const historyRow = (conversation) => { const last = conversation.messages.at(-1); return `<article class="history-row" data-history-row="${conversation.id}"><button class="history-main" data-conversation="${conversation.id}"><strong>${escapeHtml(conversation.title)}</strong><small>${escapeHtml(last?.content || "还没有消息")}</small></button><time>${dateText(conversation.updatedAt)}</time><span class="history-actions"><button class="history-edit" data-edit-conversation="${conversation.id}" aria-label="编辑对话名称">${pencilIcon}</button><button class="history-delete" data-delete-conversation="${conversation.id}" aria-label="删除历史对话">${deleteIcon}</button></span><input class="history-name-input" data-conversation-name="${conversation.id}" value="${escapeHtml(conversation.title)}" hidden></article>`; };
  $("drawerContent").innerHTML = `<button class="relationship-summary ${memoryBackground ? "has-wallpaper" : ""}" id="openMemories" style="--memory-color:${state.memoryTextColor};--memory-blur:${state.memoryBackgroundBlur}px"><span class="relationship-wallpaper" ${memoryBackground ? `style="background-image:url('${memoryBackground}')"` : ""}></span><span class="relationship-veil"></span><span class="relationship-content"><span class="relationship-kicker">TOGETHER</span><b class="relationship-title">你和 ${escapeHtml(state.loverName)} 已经相爱</b><b class="relationship-number">${relationshipDays()} <i>days</i></b><span class="relationship-quote">${escapeHtml(sidebarQuote).replace(/\n/g, "<br>")}</span></span></button><section class="current-conversation"><div><span>CURRENT CONVERSATION</span><strong>${escapeHtml(current.title)}</strong><small>${dateText(current.createdAt)}</small></div><button class="history-edit" data-edit-conversation="${current.id}" aria-label="编辑当前对话名称">${pencilIcon}</button><input class="history-name-input" data-conversation-name="${current.id}" value="${escapeHtml(current.title)}" hidden><button class="new-conversation" id="newConversation">＋ 新建对话</button></section><div class="drawer-subtitle">工具与设置</div><nav class="mobile-menu-list settings-menu">${items.map(([tool, title, description, icon]) => `<button data-menu-tool="${tool}"><svg viewBox="0 0 24 24">${icon}</svg><span><strong>${title}</strong><small>${description}</small></span><b>›</b></button>`).join("")}</nav><details class="history-archive"><summary><span>历史对话</span><b>${history.length}</b></summary><div class="conversation-list">${history.map(historyRow).join("") || '<div class="empty-history">旧对话会被收纳在这里。</div>'}</div></details>`;
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
  document.querySelectorAll("[data-delete-conversation]").forEach((button) => button.addEventListener("click", () => {
    const conversation = state.conversations.find((item) => item.id === button.dataset.deleteConversation);
    if (!conversation || !confirm(`删除对话“${conversation.title}”及其中全部记录吗？`)) return;
    state.conversations = state.conversations.filter((item) => item.id !== conversation.id); saveState(); renderConversationsDrawer();
  }));
  document.querySelectorAll("[data-menu-tool]").forEach((button) => button.addEventListener("click", () => openTool(button.dataset.menuTool)));
}

function createConversation() {
  const conversation = { id: uid(), title: "新对话", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messages: [] };
  state.conversations.push(conversation); state.activeConversationId = conversation.id; saveState(); renderMessages(); openTool("chat"); $("draft").focus();
}

function duplicateCardGroups() {
  const groups = new Map();
  state.cards.forEach((card) => {
    const key = card.content.trim().replace(/\s+/g, " ");
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(card);
  });
  return [...groups.entries()].filter(([, cards]) => cards.length > 1);
}

function renderCardsDrawer() {
  const query = cardQuery.trim();
  const visibleCards = state.cards.filter((card) => card.content.includes(query) || card.section.includes(query) || card.triggers.some((word) => word.includes(query)));
  const visibleSections = state.sections.filter((name) => !query || name.includes(query) || visibleCards.some((card) => card.section === name));
  const groupedCards = visibleSections.map((name) => {
    const cards = state.cards.filter((card) => card.section === name);
    const rules = state.sectionSettings[name] || { random: true, response: true, enabled: true, combo: false };
    const contents = cards.map((card) => card.content).join("\n");
    const ruleToggle = (key, label) => `<label class="mini-toggle"><input type="checkbox" data-section-rule="${key}" data-section="${escapeHtml(name)}" ${rules[key] ? "checked" : ""}><i></i><span>${label}</span></label>`;
    return `<details class="card-group" ${query ? "open" : ""}><summary><span><strong>${escapeHtml(name)}</strong><small data-section-count="${escapeHtml(name)}">${cards.length} 张字卡</small></span><b>⌄</b></summary><div class="card-group-editor"><div class="section-rule-toggles">${ruleToggle("random", "随机")}${ruleToggle("response", "回应")}${ruleToggle("enabled", "启用")}${ruleToggle("combo", "组合")}</div><p>开关统一作用于整个分区。一行一张字卡，可直接在下方增删修改。</p><textarea class="section-card-editor" data-card-section="${escapeHtml(name)}" placeholder="在这里输入字卡，一行一张" spellcheck="false" autocapitalize="off" autocomplete="off">${escapeHtml(contents)}</textarea><button class="group-save-button" data-save-section="${escapeHtml(name)}">保存这个分区</button></div></details>`;
  }).join("");
  $("drawerContent").innerHTML = `
    <section class="drawer-section"><div class="section-title"><strong>分区</strong><span>${state.sections.length} 个</span></div><div class="inline-form"><input id="newSection" placeholder="新分区名称"><button class="secondary-button" id="addSection">添加</button></div><div class="section-tags">${state.sections.map((name) => `<span class="section-chip">${escapeHtml(name)}${state.sections.length > 1 ? `<button data-delete-section="${escapeHtml(name)}">×</button>` : ""}</span>`).join("")}</div></section>
    <section class="drawer-section duplicate-check"><div class="section-title"><strong>全库重复检查</strong><span>不区分分组</span></div><button class="secondary-button" id="checkDuplicates">检查全部 ${state.cards.length} 张字卡</button><div id="duplicateResults"></div></section>
    <section><div class="drawer-search"><input id="cardSearch" value="${escapeHtml(cardQuery)}" placeholder="搜索字卡或分区"><b>${visibleCards.length}/${state.cards.length}</b></div><div class="card-groups">${groupedCards || '<div class="empty-tool">没有符合条件的分区。</div>'}</div></section>`;
  $("addSection").addEventListener("click", () => {
    const name = $("newSection").value.trim();
    if (name && !state.sections.includes(name)) {
      state.sections.push(name);
      state.sectionSettings[name] = { random: true, response: true, enabled: true, combo: false };
      saveState(); renderCardsDrawer();
    }
  });
  $("cardSearch").addEventListener("input", (event) => { cardQuery = event.target.value; renderCardsDrawer(); requestAnimationFrame(() => $("cardSearch")?.focus()); });
  $("checkDuplicates").addEventListener("click", () => {
    const duplicates = duplicateCardGroups();
    $("duplicateResults").innerHTML = duplicates.length ? `<div class="duplicate-summary">发现 ${duplicates.length} 组重复内容</div>${duplicates.map(([content, cards]) => `<article><p>${escapeHtml(content)}</p><span>${cards.map((card) => escapeHtml(card.section)).join(" · ")} · 共 ${cards.length} 张</span></article>`).join("")}<button class="deduplicate-button" id="deduplicateCards">去除重复 · 每组保留第一张</button>` : '<div class="duplicate-clean">✓ 没有发现重复字卡</div>';
    $("deduplicateCards")?.addEventListener("click", () => {
      const repeatedIds = new Set(duplicateCardGroups().flatMap(([, cards]) => cards.slice(1).map((card) => card.id)));
      state.cards = state.cards.filter((card) => !repeatedIds.has(card.id));
      saveState(); showToast(`已去除 ${repeatedIds.size} 张重复字卡`); renderCardsDrawer();
    });
  });
  document.querySelectorAll("[data-section-rule]").forEach((input) => input.addEventListener("change", () => {
    const section = input.dataset.section;
    const rule = input.dataset.sectionRule;
    state.sectionSettings[section] ||= { random: true, response: true, enabled: true, combo: false };
    state.sectionSettings[section][rule] = input.checked;
    state.cards.filter((card) => card.section === section).forEach((card) => { card[rule] = input.checked; });
    saveState();
  }));
  document.querySelectorAll("[data-save-section]").forEach((button) => button.addEventListener("click", async () => {
    const section = button.dataset.saveSection;
    const group = button.closest(".card-group");
    const textarea = group?.querySelector("[data-card-section]");
    if (!textarea) return;
    const lines = textarea.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const previousCards = structuredClone(state.cards);
    const existing = state.cards.filter((card) => card.section === section);
    const rules = state.sectionSettings[section] || { random: true, response: true, enabled: true, combo: false };
    const remaining = [...existing];
    const updated = lines.map((content) => {
      let matchIndex = remaining.findIndex((card) => card.content === content);
      if (matchIndex < 0 && remaining.length) matchIndex = 0;
      const previous = matchIndex >= 0 ? remaining.splice(matchIndex, 1)[0] : null;
      return previous
        ? { ...previous, ...rules, section, content }
        : { id: uid(), section, content, triggers: [], ...rules };
    });
    state.cards = state.cards.filter((card) => card.section !== section).concat(updated);
    button.disabled = true; button.textContent = "保存中…";
    const saved = await saveStateNow(false);
    button.disabled = false; button.textContent = saved ? "已保存" : "重新保存"; button.classList.toggle("saved", saved);
    if (!saved) state.cards = previousCards;
    else {
      const count = group.querySelector("[data-section-count]");
      if (count) count.textContent = `${updated.length} 张字卡`;
      setTimeout(() => { if (button.isConnected) { button.textContent = "保存这个分区"; button.classList.remove("saved"); } }, 1200);
    }
  }));
  document.querySelectorAll("[data-delete-section]").forEach((button) => button.addEventListener("click", () => {
    const name = button.dataset.deleteSection;
    const count = state.cards.filter((card) => card.section === name).length;
    if (count && !confirm(`分区“${name}”中有 ${count} 张字卡。确定连同这些字卡一起删除吗？`)) return;
    state.cards = state.cards.filter((card) => card.section !== name);
    state.sections = state.sections.filter((section) => section !== name);
    delete state.sectionSettings[name];
    saveState(); renderCardsDrawer();
  }));
}

function renderStickersDrawer() {
  $("drawerContent").innerHTML = `<section class="drawer-section sticker-upload-section"><div class="section-title"><strong>表情包</strong><span>支持 PNG、JPG、GIF、WebP</span></div><p class="drawer-intro">上传后会直接出现在聊天输入栏的笑脸按钮里，不需要再分类。</p><label class="upload-box">＋ 选择一张或多张图片<input id="stickerFiles" type="file" accept="image/*" multiple></label></section><section><div class="section-title"><strong>已保存</strong><span>${state.stickers.length} 张</span></div>${state.stickers.length ? `<div class="sticker-grid">${state.stickers.map((sticker) => `<article class="sticker-card" data-sticker="${sticker.id}"><img src="${sticker.dataUrl}" alt="${escapeHtml(sticker.name)}"><button data-delete-sticker="${sticker.id}" title="删除" aria-label="删除表情">×</button><input data-sticker-field="name" value="${escapeHtml(sticker.name)}" aria-label="表情名称"></article>`).join("")}</div>` : '<div class="empty-tool">还没有表情包。上传后可直接从聊天输入区发送。</div>'}</section>`;
  $("stickerFiles").addEventListener("change", async (event) => {
    const files = [...event.target.files];
    const previousStickers = structuredClone(state.stickers);
    for (const file of files) {
      if (file.size > 1.5 * 1024 * 1024) { showToast(`${file.name} 超过 1.5MB，已跳过`); continue; }
      const dataUrl = await readAsDataUrl(file);
      state.stickers.push({ id: uid(), name: file.name.replace(/\.[^.]+$/, ""), dataUrl });
    }
    if (await saveStateNow(false)) { showToast(`已上传 ${files.length} 张表情`); renderStickersDrawer(); }
    else state.stickers = previousStickers;
  });
  document.querySelectorAll("[data-sticker-field]").forEach((input) => input.addEventListener("change", (event) => {
    const sticker = state.stickers.find((item) => item.id === event.target.closest("[data-sticker]").dataset.sticker);
    if (sticker) { sticker[event.target.dataset.stickerField] = event.target.value; saveState(); }
  }));
  document.querySelectorAll("[data-delete-sticker]").forEach((button) => button.addEventListener("click", () => {
    state.stickers = state.stickers.filter((item) => item.id !== button.dataset.deleteSticker); saveState(); renderStickersDrawer();
  }));
  appendSaveAction($("drawerContent"), "保存表情包设置");
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
    const previous = state.memoryBackgroundImage;
    state.memoryBackgroundImage = await compressImage(file, 1600, 0.84);
    if (await saveStateNow(false)) { renderMemoriesDrawer(); showToast("纪念日卡片壁纸已替换"); }
    else state.memoryBackgroundImage = previous;
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
  appendSaveAction($("drawerContent"), "保存纪念日设置");
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

function colorSettingHtml(label, key) {
  const value = shownBubbleColor(key);
  return `<label class="color-setting"><span>${label}</span><input type="color" value="${value}" data-color-picker="${key}" aria-label="${label}"><input value="${value}" maxlength="7" data-color-hex="${key}" aria-label="${label}色号"></label>`;
}

function renderAppearanceDrawer() {
  $("drawerContent").innerHTML = `
    <section class="drawer-section"><div class="section-title"><strong>双方资料</strong><span>仅保存在本机</span></div>${inputField("我的称呼", "text", state.myName, "myName")}${inputField("爱人的称呼", "text", state.loverName, "loverName")}<div class="avatar-settings"><label class="avatar-upload"><div class="avatar">${avatarMarkup(state.myAvatar, state.myName)}</div><span>替换我的头像</span><input type="file" accept="image/*" data-avatar="myAvatar"></label><label class="avatar-upload"><div class="avatar">${avatarMarkup(state.loverAvatar, state.loverName)}</div><span>替换爱人头像</span><input type="file" accept="image/*" data-avatar="loverAvatar"></label></div></section>
    <section class="drawer-section custom-font-settings"><div class="section-title"><strong>全局字体</strong><span>保留纪念日花体</span></div><div class="font-live-preview"><b>Aa 你好，今天也在这里。</b><span>${escapeHtml(state.customFontName || "当前使用系统默认字体")}</span></div><div class="background-actions"><label class="wallpaper-button">上传字体文件<input id="customFontFile" type="file" accept=".ttf,.otf,.woff,.woff2,font/*"></label><button class="restore-button" id="removeCustomFont">恢复默认</button></div><label class="field-label"><span>字体文件直链（HTTPS，支持 TTF、OTF、WOFF、WOFF2）</span><input id="customFontUrl" type="url" value="${escapeHtml(state.customFontUrl)}" placeholder="https://example.com/font.woff2"></label><button class="secondary-button font-url-apply" id="applyFontUrl">应用字体链接</button><p class="font-help">仅替换全站普通文字；纪念日数字、英文装饰和原有花体保持不变。</p></section>
    <section class="drawer-section background-settings"><div class="section-title"><strong>聊天外观</strong><span>消息区域</span></div><div class="background-preview" style="background-image:${safeImage(state.backgroundImage) ? `url('${state.backgroundImage}')` : "none"}"></div><div class="background-actions"><label class="wallpaper-button">更换聊天壁纸<input id="backgroundFile" type="file" accept="image/*"></label><button class="restore-button" id="removeBackground">恢复默认</button></div><div class="range-field"><div class="range-head"><span>聊天字体大小</span><b id="fontSizeValue">${state.fontSize}px</b></div><input id="fontSizeRange" type="range" min="12" max="22" value="${state.fontSize}"></div><div class="range-field"><div class="range-head"><span>气泡圆角</span><b id="radiusValue">${state.bubbleRadius}px</b></div><input id="radiusRange" type="range" min="0" max="18" value="${state.bubbleRadius}"></div><div class="range-field"><div class="range-head"><span>背景遮罩</span><b id="overlayValue">${state.backgroundOverlay}%</b></div><input id="overlayRange" type="range" min="0" max="75" value="${state.backgroundOverlay}"></div><div class="bubble-color-grid">${colorSettingHtml("我的气泡", "myBubbleColor")}${colorSettingHtml("我的文字", "myBubbleTextColor")}${colorSettingHtml("他的气泡", "loverBubbleColor")}${colorSettingHtml("他的文字", "loverBubbleTextColor")}</div><button class="restore-button color-reset" id="resetBubbleColors">恢复默认气泡配色</button></section>
    <section class="drawer-section sidebar-background-settings"><div class="section-title"><strong>侧边栏壁纸</strong><span>同时作用于左右两侧</span></div><div class="sidebar-background-preview ${safeImage(state.sidebarBackgroundImage) ? "has-image" : ""}" style="--preview-sidebar-image:${safeImage(state.sidebarBackgroundImage) ? `url('${state.sidebarBackgroundImage}')` : "none"};--preview-sidebar-blur:${state.sidebarBackgroundBlur}px"><i></i><span>左侧栏</span><span>右侧栏</span></div><div class="background-actions"><label class="wallpaper-button">更换侧栏壁纸<input id="sidebarBackgroundFile" type="file" accept="image/*"></label><button class="restore-button" id="removeSidebarBackground">恢复默认</button></div><div class="range-field"><div class="range-head"><span>壁纸模糊度</span><b id="sidebarBlurValue">${state.sidebarBackgroundBlur}px</b></div><input id="sidebarBlurRange" type="range" min="0" max="24" step="1" value="${state.sidebarBackgroundBlur}"></div></section>
    <section class="drawer-section intro-settings"><div class="section-title"><strong>开屏与欢迎语</strong><span>Canvas 蝴蝶动画</span></div><label class="option-toggle intro-toggle"><span><b>显示开屏动画</b><small>每次重新进入时播放</small></span><input id="introEnabled" type="checkbox" ${state.introEnabled ? "checked" : ""}><i></i></label><label class="field-label"><span>随机欢迎语，一行一句</span><textarea id="welcomeMessagesText" placeholder="欢迎回来。讯号已经接通。">${escapeHtml(state.welcomeMessages.join("\n"))}</textarea></label><button class="secondary-button memory-add" id="saveWelcomeMessages">保存欢迎语</button></section>
    <section class="drawer-section reply-delay-settings"><div class="section-title"><strong>回复等待时间</strong><span>区间内随机</span></div><p class="drawer-intro">点击手动回复后，等待时间会在最短与最长之间随机选择。</p><div class="range-field"><div class="range-head"><span>最短等待</span><b id="delayMinValue">${formatDelay(state.replyDelayMin)}</b></div><input id="delayMinRange" type="range" min="1" max="60" step="1" value="${state.replyDelayMin}"></div><div class="range-field"><div class="range-head"><span>最长等待</span><b id="delayMaxValue">${formatDelay(state.replyDelayMax)}</b></div><input id="delayMaxRange" type="range" min="1" max="120" step="1" value="${state.replyDelayMax}"></div><div class="delay-scale"><span>1 秒</span><span>1 分钟</span><span>2 分钟</span></div></section>
    <section class="drawer-section"><div class="section-title"><strong>显示模式</strong></div><div class="theme-choice"><button data-theme-choice="light" class="${state.theme === "light" ? "active" : ""}">浅色</button><button data-theme-choice="dark" class="${state.theme === "dark" ? "active" : ""}">深色</button></div></section>`;
  document.querySelector(".background-settings .background-actions").insertAdjacentHTML("afterend", `<div class="bubble-live-preview"><div class="bubble-preview-row lover"><i>${escapeHtml((state.loverName || "对").slice(0, 1))}</i><span>对方消息预览</span></div><div class="bubble-preview-row me"><span>我的消息预览</span><i>${escapeHtml((state.myName || "我").slice(0, 1))}</i></div></div>`);
  bindSettingInputs();
  document.querySelectorAll("[data-avatar]").forEach((input) => input.addEventListener("change", async (event) => {
    const file = event.target.files[0]; if (!file) return;
    const key = event.target.dataset.avatar; const previous = state[key];
    state[key] = await compressImage(file, 360, 0.86);
    if (await saveStateNow(false)) { applyAppearance(); renderMessages(); renderAppearanceDrawer(); showToast("头像已替换"); }
    else state[key] = previous;
  }));
  $("customFontFile").addEventListener("change", async (event) => {
    const file = event.target.files[0]; if (!file) return;
    if (!/\.(ttf|otf|woff2?)$/i.test(file.name)) { showToast("请选择 TTF、OTF、WOFF 或 WOFF2 字体文件"); return; }
    if (file.size > 8 * 1024 * 1024) { showToast("字体文件请控制在 8MB 以内"); return; }
    const previous = { data: state.customFontData, url: state.customFontUrl, name: state.customFontName };
    state.customFontData = await readAsDataUrl(file); state.customFontUrl = ""; state.customFontName = file.name;
    if (!await applyGlobalFont()) {
      state.customFontData = previous.data; state.customFontUrl = previous.url; state.customFontName = previous.name; await applyGlobalFont();
      showToast("字体无法读取，请换一个字体文件"); return;
    }
    if (await saveStateNow(false)) { renderAppearanceDrawer(); showToast("全局字体已更新"); }
    else { state.customFontData = previous.data; state.customFontUrl = previous.url; state.customFontName = previous.name; await applyGlobalFont(); }
  });
  $("applyFontUrl").addEventListener("click", async () => {
    const url = safeFontUrl($("customFontUrl").value);
    if (!url) { showToast("请输入 HTTPS 字体文件直链"); return; }
    const previous = { data: state.customFontData, url: state.customFontUrl, name: state.customFontName };
    let filename = "链接字体";
    try { filename = decodeURIComponent(new URL(url).pathname.split("/").pop() || filename); } catch {}
    state.customFontData = ""; state.customFontUrl = url; state.customFontName = filename;
    if (!await applyGlobalFont()) {
      state.customFontData = previous.data; state.customFontUrl = previous.url; state.customFontName = previous.name; await applyGlobalFont();
      showToast("字体链接加载失败，请确认它是允许跨域访问的字体文件直链"); return;
    }
    if (await saveStateNow(false)) { renderAppearanceDrawer(); showToast("链接字体已应用"); }
    else { state.customFontData = previous.data; state.customFontUrl = previous.url; state.customFontName = previous.name; await applyGlobalFont(); }
  });
  $("removeCustomFont").addEventListener("click", async () => {
    state.customFontData = ""; state.customFontUrl = ""; state.customFontName = "";
    await applyGlobalFont(); saveState(); renderAppearanceDrawer(); showToast("已恢复系统默认字体");
  });
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
    const previous = state.backgroundImage;
    state.backgroundImage = await compressImage(file, 1800, 0.82);
    if (await saveStateNow(false)) { applyAppearance(); renderAppearanceDrawer(); showToast("聊天背景已替换"); }
    else state.backgroundImage = previous;
  });
  $("removeBackground").addEventListener("click", () => { state.backgroundImage = ""; saveState(); applyAppearance(); renderAppearanceDrawer(); showToast("已恢复默认背景"); });
  $("sidebarBackgroundFile").addEventListener("change", async (event) => {
    const file = event.target.files[0]; if (!file) return;
    const previous = state.sidebarBackgroundImage;
    state.sidebarBackgroundImage = await compressImage(file, 1800, 0.82);
    if (await saveStateNow(false)) { applyAppearance(); renderAppearanceDrawer(); showToast("侧边栏壁纸已替换"); }
    else state.sidebarBackgroundImage = previous;
  });
  $("removeSidebarBackground").addEventListener("click", () => { state.sidebarBackgroundImage = ""; saveState(); applyAppearance(); renderAppearanceDrawer(); showToast("已恢复默认侧栏背景"); });
  $("sidebarBlurRange").addEventListener("input", (event) => {
    state.sidebarBackgroundBlur = Number(event.target.value);
    $("sidebarBlurValue").textContent = `${state.sidebarBackgroundBlur}px`;
    document.querySelector(".sidebar-background-preview")?.style.setProperty("--preview-sidebar-blur", `${state.sidebarBackgroundBlur}px`);
    applyAppearance(); saveState();
  });
  document.querySelectorAll("[data-color-picker]").forEach((input) => input.addEventListener("input", (event) => {
    const key = event.target.dataset.colorPicker; state[key] = event.target.value.toLowerCase();
    document.querySelector(`[data-color-hex="${key}"]`).value = state[key]; applyAppearance(); saveState();
  }));
  document.querySelectorAll("[data-color-hex]").forEach((input) => input.addEventListener("change", (event) => {
    const key = event.target.dataset.colorHex; const color = safeColor(event.target.value);
    if (!color) { event.target.value = shownBubbleColor(key); showToast("请输入六位色号，例如 #95ec69"); return; }
    state[key] = color; document.querySelector(`[data-color-picker="${key}"]`).value = color; event.target.value = color; applyAppearance(); saveState();
  }));
  $("resetBubbleColors").addEventListener("click", () => {
    ["myBubbleColor", "myBubbleTextColor", "loverBubbleColor", "loverBubbleTextColor"].forEach((key) => { state[key] = ""; });
    saveState(); applyAppearance(); renderAppearanceDrawer(); showToast("已恢复当前模式的默认气泡配色");
  });
  $("introEnabled").addEventListener("change", (event) => { state.introEnabled = event.target.checked; saveState(); });
  $("saveWelcomeMessages").addEventListener("click", () => {
    const messages = [...new Set($("welcomeMessagesText").value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))];
    if (!messages.length) { showToast("请至少保留一句欢迎语"); return; }
    state.welcomeMessages = messages; state.welcomeShuffle = []; state.lastWelcomeMessage = ""; saveState(); showToast(`已保存 ${messages.length} 句欢迎语`);
  });
  [["fontSizeRange", "fontSize", "fontSizeValue", "px"], ["radiusRange", "bubbleRadius", "radiusValue", "px"], ["overlayRange", "backgroundOverlay", "overlayValue", "%"]].forEach(([id, key, output, unit]) => {
    $(id).addEventListener("input", (event) => { state[key] = Number(event.target.value); $(output).textContent = `${state[key]}${unit}`; applyAppearance(); saveState(); });
  });
  document.querySelectorAll("[data-theme-choice]").forEach((button) => button.addEventListener("click", () => { state.theme = button.dataset.themeChoice; saveState(); applyAppearance(); renderAppearanceDrawer(); }));
  appendSaveAction($("drawerContent"), "保存外观设置");
}

function renderBackgroundDrawer() {
  $("drawerContent").innerHTML = `<section class="drawer-section"><div class="section-title"><strong>聊天背景</strong><span>只影响消息区域</span></div><div class="background-preview" style="background-image:${safeImage(state.backgroundImage) ? `url('${state.backgroundImage}')` : "none"}"></div><label class="upload-box">选择背景图片<input id="backgroundFile" type="file" accept="image/*"></label><div class="button-row"><button class="secondary-button" id="removeBackground">恢复默认背景</button></div></section><section><div class="section-title"><strong>文字与气泡</strong><span>即时预览</span></div><div class="range-field"><div class="range-head"><span>聊天字体大小</span><b id="fontSizeValue">${state.fontSize}px</b></div><input id="fontSizeRange" type="range" min="12" max="22" value="${state.fontSize}"></div><div class="range-field"><div class="range-head"><span>气泡圆角</span><b id="radiusValue">${state.bubbleRadius}px</b></div><input id="radiusRange" type="range" min="0" max="18" value="${state.bubbleRadius}"></div><div class="range-field"><div class="range-head"><span>背景遮罩</span><b id="overlayValue">${state.backgroundOverlay}%</b></div><input id="overlayRange" type="range" min="0" max="75" value="${state.backgroundOverlay}"></div></section>`;
  $("backgroundFile").addEventListener("change", async (event) => {
    const file = event.target.files[0]; if (!file) return;
    const previous = state.backgroundImage;
    state.backgroundImage = await compressImage(file, 1800, 0.82);
    if (await saveStateNow(false)) { applyAppearance(); renderBackgroundDrawer(); showToast("聊天背景已替换"); }
    else state.backgroundImage = previous;
  });
  $("removeBackground").addEventListener("click", () => { state.backgroundImage = ""; saveState(); applyAppearance(); renderBackgroundDrawer(); });
  [["fontSizeRange", "fontSize", "fontSizeValue", "px"], ["radiusRange", "bubbleRadius", "radiusValue", "px"], ["overlayRange", "backgroundOverlay", "overlayValue", "%"]].forEach(([id, key, output, unit]) => {
    $(id).addEventListener("input", (event) => { state[key] = Number(event.target.value); $(output).textContent = `${state[key]}${unit}`; applyAppearance(); saveState(); });
  });
}

function formatBytes(value) {
  if (!Number.isFinite(value) || value <= 0) return "0 KB";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1024 / 1024).toFixed(value < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

async function renderStorageStats() {
  const output = $("storageStats"); if (!output) return;
  const stateSize = new Blob([JSON.stringify(state)]).size;
  let usage = stateSize; let quota = 0; let persistent = false;
  try {
    const estimate = await navigator.storage?.estimate?.();
    usage = estimate?.usage || usage; quota = estimate?.quota || 0;
    persistent = await navigator.storage?.persisted?.() || false;
  } catch {}
  output.innerHTML = `<div><span>本站数据</span><b>${formatBytes(usage)}${quota ? ` / ${formatBytes(quota)}` : ""}</b></div><div><span>当前数据包</span><b>${formatBytes(stateSize)}</b></div><div><span>保存方式</span><b>${storageMode === "indexedDB" ? "大容量本地数据库" : "兼容模式"}</b></div><div><span>长期保留</span><b>${persistent ? "已获得浏览器保护" : "由浏览器管理"}</b></div>`;
}

function renderDataDrawer() {
  const backupText = state.lastBackupAt ? `上次备份：${new Date(state.lastBackupAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}` : "尚未导出过完整备份";
  $("drawerContent").innerHTML = `<section class="drawer-section"><div class="save-line">✓ <span>聊天、字卡和图片已保存在当前浏览器</span></div><div class="storage-stats" id="storageStats"><div><span>正在读取本地空间…</span></div></div><p class="backup-note">${backupText}</p><p class="drawer-intro">更换手机、浏览器或清理网站数据前，请先导出完整备份。</p><button class="export-button" id="exportButton">导出完整备份</button><label class="upload-box" style="margin-top:10px">导入备份文件<input id="importFile" type="file" accept="application/json"></label><button class="secondary-button storage-protect" id="protectStorage">请求浏览器长期保留</button></section><section><div class="section-title"><strong>整理数据</strong><span>操作前建议备份</span></div><div class="button-row"><button class="secondary-button" id="clearHistory">清空全部对话</button><button class="danger-button" id="resetAll">恢复初始状态</button></div></section>`;
  renderStorageStats();
  $("exportButton").addEventListener("click", exportData);
  $("importFile").addEventListener("change", importData);
  $("protectStorage").hidden = !navigator.storage?.persist;
  $("protectStorage").addEventListener("click", async () => {
    const granted = await navigator.storage.persist();
    showToast(granted ? "浏览器已允许长期保留本站数据" : "浏览器暂未授予长期保留权限"); renderStorageStats();
  });
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

async function exportData() {
  state.lastBackupAt = new Date().toISOString();
  await saveStateNow(true);
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob); const link = document.createElement("a");
  link.href = url; link.download = `病骨生花-完整备份-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url);
}

async function importData(event) {
  const file = event.target.files[0]; if (!file) return;
  const previous = structuredClone(state);
  try {
    const incoming = JSON.parse(await file.text());
    if (!Array.isArray(incoming.cards) || (!Array.isArray(incoming.messages) && !Array.isArray(incoming.conversations))) throw new Error("invalid");
    state = normalizeState({ ...incoming, version: 7 });
    if (await saveStateNow(false)) { applyAppearance(); setMode(state.mode); renderMessages(); renderDataDrawer(); scheduleProactive(); showToast("备份已恢复"); }
    else state = previous;
  } catch { state = previous; showToast("无法读取这个备份文件"); }
}

function bindGlobalEvents() {
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
    if (document.hidden) saveStateNow(true);
    else if (state.proactiveEnabled && state.nextProactiveAt <= Date.now()) deliverProactiveMessage();
  });
  window.addEventListener("pagehide", () => saveStateNow(true));
  window.addEventListener("resize", () => { $("toolScrim").hidden = !(activeTool === "conversations" && window.matchMedia("(max-width: 760px)").matches); });
}

async function bootstrap() {
  state = await loadState();
  bindGlobalEvents();
  applyAppearance();
  setMode(state.mode);
  renderMessages();
  await saveStateNow(true);
  scheduleProactive();
  runOpeningAnimation();
  if ("serviceWorker" in navigator) navigator.serviceWorker.getRegistrations().then((registrations) => registrations.forEach((registration) => registration.unregister())).catch(() => {});
}

bootstrap().catch(() => { setSaveStatus("failed", "载入失败"); showToast("本地数据载入失败，请刷新后重试"); });
