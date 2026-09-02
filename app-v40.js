const KEY = "binggushenghua-v3";
const oldKey = "binggushenghua-v2";
const DB_NAME = "binggushenghua-local";
const DB_STORE = "app-state";
const DB_KEY = "current";
const defaults = {
  version: 16,
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
  choiceCardColor: "",
  colorPickerPositions: {},
  tarotBackgroundImage: "",
  tarotBackgroundBlur: 4,
  tarotBackgroundOverlay: 38,
  tarotGlow: 58,
  tarotReversed: true,
  mode: "random",
  replyDelayMin: 2,
  replyDelayMax: 5,
  proactiveEnabled: false,
  proactiveInterval: 30,
  nextProactiveAt: 0,
  replyQuoteEnabled: true,
  replyQuoteProbability: 50,
  replyMaxCount: 3,
  diceReplyTriggers: ["骰子", "投骰子"],
  rpsReplyTriggers: ["剪刀石头布", "猜拳"],
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

const TAROT_MAJOR = [
  ["愚者", "THE FOOL"], ["魔术师", "THE MAGICIAN"], ["女祭司", "THE HIGH PRIESTESS"], ["皇后", "THE EMPRESS"], ["皇帝", "THE EMPEROR"], ["教皇", "THE HIEROPHANT"], ["恋人", "THE LOVERS"], ["战车", "THE CHARIOT"], ["力量", "STRENGTH"], ["隐者", "THE HERMIT"], ["命运之轮", "WHEEL OF FORTUNE"], ["正义", "JUSTICE"], ["倒吊人", "THE HANGED MAN"], ["死神", "DEATH"], ["节制", "TEMPERANCE"], ["恶魔", "THE DEVIL"], ["高塔", "THE TOWER"], ["星星", "THE STAR"], ["月亮", "THE MOON"], ["太阳", "THE SUN"], ["审判", "JUDGEMENT"], ["世界", "THE WORLD"],
];
const TAROT_SUITS = [["权杖", "WANDS", "✦"], ["圣杯", "CUPS", "◡"], ["宝剑", "SWORDS", "†"], ["星币", "PENTACLES", "◇"]];
const TAROT_RANKS = [["王牌", "ACE"], ["二", "TWO"], ["三", "THREE"], ["四", "FOUR"], ["五", "FIVE"], ["六", "SIX"], ["七", "SEVEN"], ["八", "EIGHT"], ["九", "NINE"], ["十", "TEN"], ["侍从", "PAGE"], ["骑士", "KNIGHT"], ["王后", "QUEEN"], ["国王", "KING"]];
const TAROT_DECK = [
  ...TAROT_MAJOR.map(([name, english], index) => ({ id: `major-${index}`, arcana: "major", index, name, english, symbol: ["○", "☿", "☾", "♀", "♄", "♃", "♡", "✧", "∞", "◇", "✺", "⚖", "▽", "✦", "△", "♑", "⚡", "☆", "☽", "☉", "♢", "◎"][index] })),
  ...TAROT_SUITS.flatMap(([suit, suitEnglish, symbol], suitIndex) => TAROT_RANKS.map(([rank, rankEnglish], rankIndex) => ({ id: `minor-${suitIndex}-${rankIndex}`, arcana: "minor", index: rankIndex + 1, suit, suitEnglish, rank, name: `${suit}${rank}`, english: `${rankEnglish} OF ${suitEnglish}`, symbol }))),
];

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
let manualReplyQuote = null;
let replyAudioContext = null;
const MESSAGE_PAGE_SIZE = 60;
let visibleMessageCount = MESSAGE_PAGE_SIZE;
let renderedConversationId = "";
let loadingEarlierMessages = false;
let suppressEarlierLoad = false;
let selectedChoiceMode = "single";
let colorPickerSession = null;
let tarotAnimationFrame = 0;
let tarotRitualMode = "draw";
let activeTarotRequest = null;
let activeTarotConversation = null;
let tarotRevealTimer = 0;
const animatedPlayMessages = new Set();

const $ = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
const safeImage = (value) => typeof value === "string" && value.startsWith("data:image/") ? value : "";
const safeColor = (value) => /^#[0-9a-f]{6}$/i.test(value || "") ? value.toLowerCase() : "";
const hexToHsv = (value) => {
  const color = safeColor(value) || "#ff0000";
  const [red, green, blue] = [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16) / 255);
  const maximum = Math.max(red, green, blue); const minimum = Math.min(red, green, blue); const distance = maximum - minimum;
  let hue = 0;
  if (distance) {
    if (maximum === red) hue = 60 * (((green - blue) / distance) % 6);
    else if (maximum === green) hue = 60 * ((blue - red) / distance + 2);
    else hue = 60 * ((red - green) / distance + 4);
  }
  if (hue < 0) hue += 360;
  return { h: Math.round(hue), s: Math.round(maximum ? distance / maximum * 100 : 0), v: Math.round(maximum * 100) };
};
const hsvToHex = (hue, saturation, value) => {
  const h = ((Number(hue) % 360) + 360) % 360; const s = Math.min(100, Math.max(0, Number(saturation))) / 100; const v = Math.min(100, Math.max(0, Number(value))) / 100;
  const chroma = v * s; const section = h / 60; const offset = chroma * (1 - Math.abs(section % 2 - 1));
  const [red, green, blue] = section < 1 ? [chroma, offset, 0] : section < 2 ? [offset, chroma, 0] : section < 3 ? [0, chroma, offset] : section < 4 ? [0, offset, chroma] : section < 5 ? [offset, 0, chroma] : [chroma, 0, offset];
  const match = v - chroma;
  return `#${[red, green, blue].map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, "0")).join("")}`;
};
const safeFontData = (value) => typeof value === "string" && /^data:(font\/|application\/(font|x-font|octet-stream))/i.test(value) && value.length <= 12 * 1024 * 1024 ? value : "";
const safeFontUrl = (value) => {
  try { const url = new URL(String(value || "").trim()); return url.protocol === "https:" ? url.href : ""; }
  catch { return ""; }
};

function ensureReplyAudio() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    replyAudioContext ||= new AudioContextClass();
    if (replyAudioContext.state === "suspended") void replyAudioContext.resume();
  } catch {}
}

function playReplySound() {
  if (!replyAudioContext || replyAudioContext.state !== "running") return;
  try {
    const start = replyAudioContext.currentTime;
    const oscillator = replyAudioContext.createOscillator();
    const gain = replyAudioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, start);
    oscillator.frequency.exponentialRampToValueAtTime(1180, start + 0.1);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.045, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
    oscillator.connect(gain).connect(replyAudioContext.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.15);
  } catch {}
}

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
      const legacyTriggers = [...new Set(cards.flatMap((card) => Array.isArray(card.triggers) ? card.triggers : []).map((word) => String(word).trim()).filter(Boolean))];
      const settings = {
        random: typeof previous.random === "boolean" ? previous.random : (cards.length ? cards.some((card) => card.random) : true),
        response: typeof previous.response === "boolean" ? previous.response : (cards.length ? cards.some((card) => card.response) : true),
        enabled: typeof previous.enabled === "boolean" ? previous.enabled : (cards.length ? cards.some((card) => card.enabled) : true),
        combo: typeof previous.combo === "boolean" ? previous.combo : cards.some((card) => card.combo),
        triggers: Array.isArray(previous.triggers) ? [...new Set(previous.triggers.map((word) => String(word).trim()).filter(Boolean))] : legacyTriggers,
      };
      migrated.sectionSettings[section] = settings;
      cards.forEach((card) => Object.assign(card, settings, { triggers: [...settings.triggers] }));
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
    migrated.tarotBackgroundImage = safeImage(saved.tarotBackgroundImage);
    migrated.tarotBackgroundBlur = Math.min(24, Math.max(0, Number(saved.tarotBackgroundBlur ?? defaults.tarotBackgroundBlur)));
    migrated.tarotBackgroundOverlay = Math.min(80, Math.max(0, Number(saved.tarotBackgroundOverlay ?? defaults.tarotBackgroundOverlay)));
    migrated.tarotGlow = Math.min(100, Math.max(0, Number(saved.tarotGlow ?? defaults.tarotGlow)));
    migrated.tarotReversed = saved.tarotReversed !== false;
    ["myBubbleColor", "myBubbleTextColor", "loverBubbleColor", "loverBubbleTextColor", "choiceCardColor"].forEach((key) => { migrated[key] = safeColor(saved[key]); });
    migrated.colorPickerPositions = {};
    if (saved.colorPickerPositions && typeof saved.colorPickerPositions === "object") Object.entries(saved.colorPickerPositions).forEach(([key, position]) => {
      if (!position || typeof position !== "object") return;
      const hex = safeColor(position.hex); const h = Number(position.h); const s = Number(position.s); const v = Number(position.v);
      if (hex && Number.isFinite(h) && Number.isFinite(s) && Number.isFinite(v)) migrated.colorPickerPositions[key] = { hex, h: Math.min(360, Math.max(0, h)), s: Math.min(100, Math.max(0, s)), v: Math.min(100, Math.max(0, v)) };
    });
    migrated.replyDelayMin = Math.min(60, Math.max(1, Number(saved.replyDelayMin ?? defaults.replyDelayMin)));
    migrated.replyDelayMax = Math.min(120, Math.max(migrated.replyDelayMin, Number(saved.replyDelayMax ?? defaults.replyDelayMax)));
    migrated.replyQuoteEnabled = saved.replyQuoteEnabled !== false;
    migrated.replyQuoteProbability = Math.min(100, Math.max(0, Number(saved.replyQuoteProbability ?? defaults.replyQuoteProbability)));
    migrated.replyMaxCount = Math.min(6, Math.max(1, Number(saved.replyMaxCount ?? defaults.replyMaxCount)));
    migrated.diceReplyTriggers = Array.isArray(saved.diceReplyTriggers) ? [...new Set(saved.diceReplyTriggers.map((item) => String(item).trim()).filter(Boolean))] : structuredClone(defaults.diceReplyTriggers);
    migrated.rpsReplyTriggers = Array.isArray(saved.rpsReplyTriggers) ? [...new Set(saved.rpsReplyTriggers.map((item) => String(item).trim()).filter(Boolean))] : structuredClone(defaults.rpsReplyTriggers);
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
    migrated.version = 16;
    delete migrated.replyStickerProbability;
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
  const snapshot = structuredClone({ ...state, version: 16, lastSavedAt: savedAt });
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

function defaultChoiceCardColor() {
  return state.theme === "dark" ? "#343a37" : "#eef0ed";
}

function shownSettingColor(key) {
  if (key === "choiceCardColor") return safeColor(state.choiceCardColor) || defaultChoiceCardColor();
  if (key === "memoryTextColor") return safeColor(state.memoryTextColor) || defaults.memoryTextColor;
  return shownBubbleColor(key);
}

function readableInk(hex) {
  const color = safeColor(hex) || "#ffffff";
  const channels = [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16) / 255).map((value) => value <= .03928 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722 > .46 ? "#202321" : "#f4f5f4";
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
  document.documentElement.style.setProperty("--choice-card", shownSettingColor("choiceCardColor"));
  document.documentElement.style.setProperty("--choice-card-ink", readableInk(shownSettingColor("choiceCardColor")));
  document.documentElement.style.setProperty("--sidebar-blur", `${state.sidebarBackgroundBlur}px`);
  document.documentElement.style.setProperty("--sidebar-wallpaper", safeImage(state.sidebarBackgroundImage) ? `url("${state.sidebarBackgroundImage}")` : "none");
  document.documentElement.style.setProperty("--chat-wallpaper", safeImage(state.backgroundImage) ? `url("${state.backgroundImage}")` : "none");
  void applyGlobalFont();
  $("messageList").style.backgroundImage = "";
  $("chatWallpaper").style.backgroundImage = safeImage(state.backgroundImage) ? `url("${state.backgroundImage}")` : "";
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
  $("chatOptionsContent").innerHTML = `<section class="options-section"><div class="section-title"><strong>传讯模式</strong></div><div class="mode-choice"><button data-mode="random" class="${state.mode === "random" ? "active" : ""}">随机<span>字卡与表情包统一抽取</span></button><button data-mode="response" class="${state.mode === "response" ? "active" : ""}">回应<span>命中关键词时保证对应分区一条</span></button></div></section><section class="options-section"><div class="section-title"><strong>引用消息</strong><span>本轮消息</span></div><label class="option-toggle"><span><b>允许随机引用</b><small>文字和表情包回复都可能附带引用</small></span><input id="replyQuoteEnabled" type="checkbox" ${state.replyQuoteEnabled ? "checked" : ""}><i></i></label><div class="range-field"><div class="range-head"><span>引用概率</span><b id="replyQuoteValue">${state.replyQuoteProbability}%</b></div><input id="replyQuoteRange" type="range" min="0" max="100" step="5" value="${state.replyQuoteProbability}" ${state.replyQuoteEnabled ? "" : "disabled"}></div></section><section class="options-section"><div class="section-title"><strong>主动传讯</strong><span>可选</span></div><label class="option-toggle"><span><b>允许主动发消息</b><small>页面打开或再次回来时检查</small></span><input id="proactiveEnabled" type="checkbox" ${state.proactiveEnabled ? "checked" : ""}><i></i></label><div class="range-field"><div class="range-head"><span>大约间隔</span><b id="proactiveValue">${state.proactiveInterval} 分钟</b></div><input id="proactiveRange" type="range" min="5" max="120" step="5" value="${state.proactiveInterval}"></div><p class="options-note">受手机系统限制，网页被彻底关闭后无法保证实时后台运行；重新打开时会补做检查。</p></section><section class="options-section conversation-actions"><div class="section-title"><strong>当前对话</strong><span>${escapeHtml(conversation.title)}</span></div><button class="danger-outline-button" id="clearConversation">清除此对话的聊天记录</button></section>`;
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
  const cards = state.cards.filter((card) => {
    const rules = state.sectionSettings[card.section];
    return rules?.enabled !== false && rules?.random !== false;
  }).map((card) => ({ kind: "card", card }));
  const stickers = state.stickers.map((sticker) => ({ kind: "sticker", sticker }));
  const item = [...cards, ...stickers][Math.floor(Math.random() * (cards.length + stickers.length))];
  if (item?.kind === "sticker") currentMessages().push({ id: uid(), from: "lover", type: "sticker", content: `[表情] ${item.sticker.name}`, dataUrl: item.sticker.dataUrl, createdAt: new Date().toISOString() });
  else if (item?.card) currentMessages().push({ id: uid(), from: "lover", type: "text", content: item.card.content, createdAt: new Date().toISOString() });
  if (item) { touchConversation(); renderMessages(); playReplySound(); }
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

function shuffled(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function choiceModeLabel(mode) {
  return ({ single: "单选", multiple: "多选", ranking: "排序" })[mode] || "单选";
}

function diceFace(value) {
  const positions = {
    1: [5],
    2: [1, 9],
    3: [1, 5, 9],
    4: [1, 3, 7, 9],
    5: [1, 3, 5, 7, 9],
    6: [1, 3, 4, 6, 7, 9],
  }[Math.min(6, Math.max(1, Number(value) || 1))];
  return positions.map((position) => `<i class="die-pip die-pip-${position}" aria-hidden="true"></i>`).join("");
}

function gestureIcon(gesture) {
  const paths = {
    rock: '<path d="M8 11V8.2a1.5 1.5 0 0 1 3 0V6.8a1.5 1.5 0 0 1 3 0v1a1.5 1.5 0 0 1 3 0v1.3a1.5 1.5 0 0 1 2.7.9v3.8c0 4-2.6 6.2-6.4 6.2h-.8C8.5 20 5 17.2 5 13.8V12a1.5 1.5 0 0 1 3 0v1.2"/>',
    paper: '<path d="M6.5 12V5.8a1.4 1.4 0 0 1 2.8 0V4.6a1.4 1.4 0 0 1 2.8 0v1.2-2a1.4 1.4 0 0 1 2.8 0v2.4-1a1.4 1.4 0 0 1 2.8 0v7.6c0 4.2-2.5 7.2-6.4 7.2h-.7C7.3 20 4 17.2 4 13.7V12a1.25 1.25 0 0 1 2.5 0Z"/>',
    scissors: '<path d="m8.6 11-3-5.8A1.6 1.6 0 0 1 8.4 3.7l3.1 5.6M12.7 9.6l1.6-5.5a1.6 1.6 0 0 1 3.1.9l-1.5 5.4M8 12v-1a1.5 1.5 0 0 1 3 0v-1a1.5 1.5 0 0 1 3 0v.7a1.5 1.5 0 0 1 3 0v1.2a1.5 1.5 0 0 1 2.7.9v2c0 3.4-2.5 5.2-6.1 5.2h-.8C8.4 20 5 17.3 5 14v-1a1.5 1.5 0 0 1 3 0v.8"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[gesture] || paths.rock}</svg>`;
}

function tarotCardFace(card, compact = false) {
  const orientation = card.reversed ? "reversed" : "upright";
  return `<article class="tarot-card-face ${orientation} ${compact ? "compact" : ""}" aria-label="${escapeHtml(card.name)} ${card.reversed ? "逆位" : "正位"}"><div class="tarot-card-frame"><span class="tarot-card-index">${card.arcana === "major" ? String(card.index).padStart(2, "0") : escapeHtml(card.suitEnglish?.slice(0, 1) || "·")}</span><i class="tarot-card-symbol">${escapeHtml(card.symbol || "✦")}</i><div class="tarot-card-stars" aria-hidden="true">· ✦ ·</div><strong>${escapeHtml(card.name)}</strong><small>${escapeHtml(card.english)}</small><em>${card.reversed ? "逆位" : "正位"}</em></div></article>`;
}

function tarotCount(value) {
  return Math.min(78, Math.max(1, Math.round(Number(value) || 1)));
}

function createTarotDraw(request) {
  const payload = request.payload || (request.payload = {});
  const count = tarotCount(payload.count);
  const stored = Array.isArray(payload.drawn) ? payload.drawn.filter((card) => card && TAROT_DECK.some((item) => item.id === card.id)) : [];
  if (stored.length === count && new Set(stored.map((card) => card.id)).size === count) return stored;
  const drawn = shuffled(TAROT_DECK).slice(0, count).map((card) => ({ ...card, reversed: payload.allowReversed !== false && Math.random() < 0.5 }));
  payload.count = count;
  payload.drawn = drawn;
  request.status = "drawing";
  return drawn;
}

function pendingTarotRequests(conversation) {
  return conversation.messages.filter((message) => message.from === "me" && message.type === "tarot-request" && message.status !== "resolved");
}

function renderPlayMessage(message) {
  const payload = message.payload || {};
  if (message.type === "choice-request") {
    const options = Array.isArray(payload.options) ? payload.options : [];
    return `<div class="bubble play-card choice-request-card"><div class="play-card-head"><span>我问你 · ${choiceModeLabel(payload.mode)}</span><i>${message.status === "resolved" ? "已回答" : "等待回答"}</i></div><strong>${escapeHtml(payload.question || message.content)}</strong><ol>${options.map((option, index) => `<li><b>${payload.mode === "ranking" ? index + 1 : "○"}</b><span>${escapeHtml(option)}</span></li>`).join("")}</ol></div>`;
  }
  if (message.type === "choice-result") {
    const selected = Array.isArray(payload.selected) ? payload.selected : [];
    return `<div class="bubble play-card choice-result-card"><div class="play-card-head"><span>我的回答 · ${choiceModeLabel(payload.mode)}</span></div><small>${escapeHtml(payload.question || "这一次的选择")}</small>${payload.mode === "ranking" ? `<ol class="choice-ranking">${selected.map((option, index) => `<li><b>${index + 1}</b><span>${escapeHtml(option)}</span></li>`).join("")}</ol>` : `<div class="choice-selected">${selected.map((option) => `<span>${escapeHtml(option)}</span>`).join("")}</div>`}</div>`;
  }
  if (message.type === "dice") {
    const value = Math.min(6, Math.max(1, Number(payload.value) || 1));
    const animate = Date.now() - new Date(message.createdAt).getTime() < 10000 && !animatedPlayMessages.has(message.id);
    return `<div class="bubble play-throw dice-card" aria-label="骰子 ${value} 点"><div class="die-scene"><div class="die-result ${animate ? "rolling" : ""}" data-value="${value}" aria-hidden="true">${diceFace(value)}</div></div></div>`;
  }
  if (message.type === "rps") {
    const gesture = ["rock", "paper", "scissors"].includes(payload.gesture) ? payload.gesture : "rock";
    const label = ({ rock: "石头", paper: "布", scissors: "剪刀" })[gesture];
    const animate = Date.now() - new Date(message.createdAt).getTime() < 10000 && !animatedPlayMessages.has(message.id);
    return `<div class="bubble play-throw rps-card ${animate ? "revealing" : ""}" aria-label="${label}"><div class="gesture-mark" aria-hidden="true">${gestureIcon(gesture)}</div></div>`;
  }
  if (message.type === "tarot-request") {
    return `<div class="bubble play-card tarot-request-card"><div class="play-card-head"><span>TAROT INVITATION</span><i>${message.status === "resolved" ? "已抽牌" : message.status === "drawing" ? "等待揭牌" : "等待他抽牌"}</i></div><strong>${escapeHtml(payload.question || "请替我从牌里带回一句回答")}</strong><small>${tarotCount(payload.count)} 张牌 · ${payload.allowReversed === false ? "仅正位" : "含正逆位"}</small></div>`;
  }
  if (message.type === "tarot-result") {
    const cards = Array.isArray(payload.cards) ? payload.cards : [];
    return `<div class="bubble play-card tarot-result-card"><div class="tarot-result-preview">${cards.map((card) => `<div class="tarot-chat-card">${tarotCardFace(card, true)}<span>${escapeHtml(card.name)} · ${card.reversed ? "逆位" : "正位"}</span></div>`).join("")}</div></div>`;
  }
  return "";
}

function renderMessages(scrollToEnd = true) {
  const conversation = currentConversation();
  if (!conversation) return;
  if (renderedConversationId !== conversation.id) {
    renderedConversationId = conversation.id;
    visibleMessageCount = MESSAGE_PAGE_SIZE;
  }
  const allMessages = conversation.messages;
  const startIndex = Math.max(0, allMessages.length - visibleMessageCount);
  const displayedMessages = allMessages.slice(startIndex);
  let previousTime = 0;
  const earlierControl = startIndex ? `<button class="load-earlier-messages" id="loadEarlierMessages"><span>查看更早消息</span><small>还有 ${startIndex} 条</small></button>` : "";
  $("messages").innerHTML = earlierControl + displayedMessages.map((message, index) => {
    const mine = message.from === "me";
    const timestamp = new Date(message.createdAt).getTime();
    const divider = index === 0 || !Number.isFinite(previousTime) || timestamp - previousTime >= 5 * 60000 ? `<div class="time-divider">${messageTimeLabel(message.createdAt)}</div>` : "";
    previousTime = timestamp;
    const quotedImage = ["sticker", "image"].includes(message.quote?.type) && safeImage(message.quote?.dataUrl);
    const quote = message.quote?.content ? `<div class="quoted-message"><span class="quoted-author">${escapeHtml(message.quote.from === "me" ? state.myName : state.loverName)}</span>${quotedImage ? `<img class="quoted-thumbnail" src="${quotedImage}" alt="${escapeHtml(message.quote.content)}">` : `<p>${escapeHtml(message.quote.content)}</p>`}</div>` : "";
    const image = ["sticker", "image"].includes(message.type) && safeImage(message.dataUrl);
    const playContent = renderPlayMessage(message);
    const content = playContent ? `${quote}${playContent}` : (image
      ? `${quote}<div class="bubble media-bubble ${message.type === "sticker" ? "sticker-bubble" : "image-bubble"}"><img src="${message.dataUrl}" alt="${escapeHtml(message.content || (message.type === "image" ? "图片" : "表情"))}"></div>`
      : quote
        ? `<div class="bubble has-quote">${quote}<div class="bubble-text">${escapeHtml(message.content)}</div></div>`
        : `<div class="bubble">${escapeHtml(message.content)}</div>`);
    const expandAction = image ? `<button class="message-expand" data-expand-message="${message.id}" aria-label="放大查看" title="放大查看"><svg viewBox="0 0 24 24"><path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"/></svg></button>` : message.type === "tarot-result" ? `<button class="message-expand" data-expand-tarot="${message.id}" aria-label="查看全部牌面" title="查看全部牌面"><svg viewBox="0 0 24 24"><path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"/></svg></button>` : "";
    const actions = `<div class="message-actions"><button class="message-quote" data-quote-message="${message.id}" aria-label="引用这条消息" title="引用这条消息"><svg viewBox="0 0 24 24"><path d="M10 8 5 12l5 4M6 12h7c3.4 0 5 1.8 5 5"/></svg></button>${expandAction}<button class="message-delete" data-delete-message="${message.id}" aria-label="删除这条消息" title="删除这条消息"><svg viewBox="0 0 24 24"><path d="M7 7h10l-.7 12H7.7L7 7ZM9 7V4h6v3M5 7h14"/></svg></button></div>`;
    return `${divider}<article class="message-row ${mine ? "me" : "lover"}" data-message-row="${message.id}">${mine ? actions : `<div class="message-avatar avatar lover-mark">${avatarMarkup(state.loverAvatar, state.loverName)}</div>`}<div class="message-body">${content}</div>${mine ? `<div class="message-avatar avatar me-mark">${avatarMarkup(state.myAvatar, state.myName)}</div>` : actions}</article>`;
  }).join("");
  displayedMessages.filter((message) => ["dice", "rps"].includes(message.type)).forEach((message) => animatedPlayMessages.add(message.id));
  document.querySelectorAll("[data-message-row] .bubble").forEach((bubble) => bubble.addEventListener("click", () => {
    const row = bubble.closest("[data-message-row]");
    const willOpen = !row.classList.contains("actions-open");
    document.querySelectorAll("[data-message-row].actions-open").forEach((item) => item.classList.remove("actions-open"));
    row.classList.toggle("actions-open", willOpen);
  }));
  $("loadEarlierMessages")?.addEventListener("click", loadEarlierMessages);
  document.querySelectorAll("[data-expand-message]").forEach((button) => button.addEventListener("click", () => {
    const message = currentMessages().find((item) => item.id === button.dataset.expandMessage);
    if (message && safeImage(message.dataUrl)) openMediaViewer(message.dataUrl, message.content);
  }));
  document.querySelectorAll("[data-expand-tarot]").forEach((button) => button.addEventListener("click", () => {
    const message = currentMessages().find((item) => item.id === button.dataset.expandTarot);
    if (message?.type === "tarot-result") openTarotResult(message);
  }));
  document.querySelectorAll("[data-delete-message]").forEach((button) => button.addEventListener("click", () => {
    const conversation = currentConversation();
    conversation.messages = conversation.messages.filter((message) => message.id !== button.dataset.deleteMessage);
    touchConversation(); saveState();
    renderMessages(false);
  }));
  document.querySelectorAll("[data-quote-message]").forEach((button) => button.addEventListener("click", () => {
    const message = currentMessages().find((item) => item.id === button.dataset.quoteMessage);
    if (!message) return;
    manualReplyQuote = { from: message.from, type: message.type, content: message.content || "[消息]", dataUrl: safeImage(message.dataUrl) || undefined };
    renderComposerQuote();
    document.querySelectorAll("[data-message-row].actions-open").forEach((row) => row.classList.remove("actions-open"));
    $("draft").focus();
  }));
  updateReplyButton();
  if (scrollToEnd) scrollMessagesToEnd();
}

function loadEarlierMessages() {
  if (loadingEarlierMessages) return;
  const messages = currentMessages();
  if (visibleMessageCount >= messages.length) return;
  loadingEarlierMessages = true;
  const list = $("messageList");
  const oldHeight = list.scrollHeight;
  const oldTop = list.scrollTop;
  visibleMessageCount = Math.min(messages.length, visibleMessageCount + MESSAGE_PAGE_SIZE);
  renderMessages(false);
  requestAnimationFrame(() => {
    list.scrollTop = Math.max(1, list.scrollHeight - oldHeight + oldTop);
    loadingEarlierMessages = false;
  });
}

function openMediaViewer(source, label = "聊天图片") {
  const viewer = $("mediaViewer");
  const image = $("mediaViewerImage");
  if (!viewer || !image || !safeImage(source)) return;
  image.src = source;
  image.alt = label || "聊天图片";
  viewer.hidden = false;
  document.body.classList.add("media-viewer-open");
}

function closeMediaViewer() {
  const viewer = $("mediaViewer");
  if (!viewer) return;
  viewer.hidden = true;
  $("mediaViewerImage").removeAttribute("src");
  document.body.classList.remove("media-viewer-open");
}

function renderComposerQuote() {
  const preview = $("composerQuote");
  if (!preview) return;
  if (!manualReplyQuote) { preview.hidden = true; preview.innerHTML = ""; return; }
  const image = ["sticker", "image"].includes(manualReplyQuote.type) && safeImage(manualReplyQuote.dataUrl);
  preview.hidden = false;
  preview.innerHTML = `<div>${image ? `<img src="${image}" alt="引用图片">` : ""}<span><b>回复 ${escapeHtml(manualReplyQuote.from === "me" ? state.myName : state.loverName)}</b><small>${escapeHtml(image ? manualReplyQuote.content : manualReplyQuote.content.slice(0, 48))}</small></span></div><button id="cancelManualQuote" aria-label="取消引用">×</button>`;
  $("cancelManualQuote").addEventListener("click", () => { manualReplyQuote = null; renderComposerQuote(); });
}

function takeManualReplyQuote() {
  if (!manualReplyQuote) return undefined;
  const quote = structuredClone(manualReplyQuote);
  manualReplyQuote = null;
  renderComposerQuote();
  return quote;
}

function scrollMessagesToEnd() {
  suppressEarlierLoad = true;
  requestAnimationFrame(() => {
    const list = $("messageList");
    if (!list) { suppressEarlierLoad = false; return; }
    if (typeof list.scrollTo === "function") list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
    else list.scrollTop = list.scrollHeight;
    setTimeout(() => { suppressEarlierLoad = false; }, 600);
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
  conversation.messages.push({ id: uid(), from: "me", type: "text", content, quote: takeManualReplyQuote(), createdAt: new Date().toISOString() });
  if (conversation.title === "新对话") conversation.title = content.slice(0, 18);
  touchConversation();
  draft.value = "";
  saveState();
  renderMessages();
}

function sendSticker(sticker) {
  currentMessages().push({ id: uid(), from: "me", type: "sticker", content: `[表情] ${sticker.name}`, dataUrl: sticker.dataUrl, quote: takeManualReplyQuote(), createdAt: new Date().toISOString() });
  touchConversation(); saveState();
  closePopovers();
  renderMessages();
}

function sendPlayMessage(type) {
  const conversation = currentConversation();
  if (!conversation || !["dice", "rps"].includes(type)) return;
  const payload = type === "dice"
    ? { value: 1 + Math.floor(Math.random() * 6) }
    : { gesture: ["rock", "paper", "scissors"][Math.floor(Math.random() * 3)] };
  const content = type === "dice" ? `[骰子] ${payload.value}` : `[剪刀石头布] ${{ rock: "石头", paper: "布", scissors: "剪刀" }[payload.gesture]}`;
  conversation.messages.push({ id: uid(), from: "me", type, content, payload, quote: takeManualReplyQuote(), createdAt: new Date().toISOString() });
  touchConversation(); saveState(); closePopovers(); renderMessages();
}

function openChoiceEditor() {
  closePopovers();
  selectedChoiceMode = "single";
  $("choiceQuestion").value = "";
  $("choiceOptions").value = "";
  document.querySelectorAll("[data-choice-mode]").forEach((button) => button.classList.toggle("active", button.dataset.choiceMode === selectedChoiceMode));
  $("choiceModeHelp").textContent = "他会从所有选项里选择一个。";
  $("choiceEditor").hidden = false;
  requestAnimationFrame(() => $("choiceQuestion").focus());
}

function closeChoiceEditor() {
  $("choiceEditor").hidden = true;
}

function sendChoiceRequest() {
  const question = $("choiceQuestion").value.trim();
  const options = [...new Set($("choiceOptions").value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))];
  if (!question) { showToast("先写下想问他的问题"); return; }
  if (options.length < 2) { showToast("至少需要两个不同的答案选项"); return; }
  if (options.length > 12) { showToast("一次最多设置 12 个选项"); return; }
  const conversation = currentConversation();
  const message = { id: uid(), from: "me", type: "choice-request", content: `[我问你] ${question}`, status: "pending", payload: { question, options, mode: selectedChoiceMode }, quote: takeManualReplyQuote(), createdAt: new Date().toISOString() };
  conversation.messages.push(message);
  if (conversation.title === "新对话") conversation.title = question.slice(0, 18);
  touchConversation(); saveState(); closeChoiceEditor(); renderMessages();
}

function applyTarotAppearance() {
  const source = safeImage(state.tarotBackgroundImage);
  [$("tarotEditorWallpaper"), $("tarotRitualWallpaper")].forEach((layer) => {
    if (!layer) return;
    layer.style.backgroundImage = source ? `url("${source}")` : "";
    layer.style.filter = `blur(${state.tarotBackgroundBlur}px) scale(${1 + state.tarotBackgroundBlur / 120})`;
  });
  [$("tarotEditor"), $("tarotRitual")].forEach((root) => {
    if (!root) return;
    root.style.setProperty("--tarot-overlay", `${state.tarotBackgroundOverlay / 100}`);
    root.style.setProperty("--tarot-glow", `${state.tarotGlow / 100}`);
  });
}

function updateTarotCount(value) {
  $("tarotCount").value = String(tarotCount(value));
}

function openTarotEditor() {
  closePopovers();
  const pending = pendingTarotRequests(currentConversation());
  if (pending.length) { showToast("上一份抽牌邀请还在等待他回应"); return; }
  $("tarotQuestion").value = "";
  updateTarotCount(3);
  $("tarotReversed").checked = state.tarotReversed;
  applyTarotAppearance();
  $("tarotEditor").hidden = false;
  requestAnimationFrame(() => $("tarotQuestion").focus());
}

function closeTarotEditor() {
  $("tarotEditor").hidden = true;
}

function sendTarotRequest() {
  const conversation = currentConversation();
  if (pendingTarotRequests(conversation).length) { showToast("上一份抽牌邀请还在等待他回应"); return; }
  const question = $("tarotQuestion").value.trim();
  const count = tarotCount($("tarotCount").value);
  const allowReversed = $("tarotReversed").checked;
  state.tarotReversed = allowReversed;
  conversation.messages.push({ id: uid(), from: "me", type: "tarot-request", content: `[塔罗] ${question || "请替我抽一次牌"}`, status: "pending", payload: { question, count, allowReversed }, quote: takeManualReplyQuote(), createdAt: new Date().toISOString() });
  if (conversation.title === "新对话") conversation.title = (question || "塔罗占卜").slice(0, 18);
  touchConversation(); saveState(); closeTarotEditor(); renderMessages();
}

function stopTarotAmbient() {
  cancelAnimationFrame(tarotAnimationFrame);
  tarotAnimationFrame = 0;
}

function startTarotAmbient() {
  stopTarotAmbient();
  const canvas = $("tarotCanvas");
  const context = canvas?.getContext("2d");
  if (!canvas || !context) return;
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const particles = Array.from({ length: 34 }, () => ({ x: Math.random(), y: Math.random(), r: 0.5 + Math.random() * 1.7, phase: Math.random() * Math.PI * 2, speed: 0.00025 + Math.random() * 0.00055 }));
  const resize = () => { canvas.width = Math.round(innerWidth * ratio); canvas.height = Math.round(innerHeight * ratio); canvas.style.width = `${innerWidth}px`; canvas.style.height = `${innerHeight}px`; };
  resize();
  const draw = (time) => {
    context.clearRect(0, 0, canvas.width, canvas.height);
    const glow = state.tarotGlow / 100;
    particles.forEach((particle) => {
      const x = particle.x * canvas.width + Math.sin(time * particle.speed + particle.phase) * 18 * ratio;
      const y = particle.y * canvas.height + Math.cos(time * particle.speed * 0.7 + particle.phase) * 24 * ratio;
      const alpha = (0.12 + (Math.sin(time * 0.0012 + particle.phase) + 1) * 0.12) * glow;
      const gradient = context.createRadialGradient(x, y, 0, x, y, particle.r * 9 * ratio);
      gradient.addColorStop(0, `rgba(231,215,166,${alpha})`);
      gradient.addColorStop(1, "rgba(175,137,220,0)");
      context.fillStyle = gradient;
      context.beginPath(); context.arc(x, y, particle.r * 9 * ratio, 0, Math.PI * 2); context.fill();
    });
    tarotAnimationFrame = requestAnimationFrame(draw);
  };
  tarotAnimationFrame = requestAnimationFrame(draw);
}

function renderTarotRitualCards(cards) {
  $("tarotRitualCards").innerHTML = cards.map((card) => tarotCardFace(card)).join("");
}

function tarotResultMessage(request) {
  const conversation = activeTarotConversation || currentConversation();
  const existing = conversation.messages.find((message) => message.type === "tarot-result" && message.interactionId === request.id);
  if (existing) return existing;
  const cards = createTarotDraw(request);
  request.status = "resolved";
  const message = { id: uid(), from: "lover", type: "tarot-result", content: `[塔罗结果] ${cards.map((card) => `${card.name}${card.reversed ? "逆位" : "正位"}`).join("、")}`, payload: { question: request.payload?.question || "", cards, count: cards.length }, interactionId: request.id, createdAt: new Date().toISOString() };
  conversation.messages.push(message);
  conversation.updatedAt = new Date().toISOString();
  saveStateNow(true);
  if (conversation.id === state.activeConversationId) renderMessages();
  playReplySound();
  return message;
}

function revealTarotRitual({ immediate = false } = {}) {
  clearTimeout(tarotRevealTimer);
  tarotRevealTimer = 0;
  let cards = [];
  if (tarotRitualMode === "draw" && activeTarotRequest) cards = tarotResultMessage(activeTarotRequest).payload.cards;
  else cards = Array.isArray(activeTarotRequest?.payload?.cards) ? activeTarotRequest.payload.cards : [];
  $("tarotShuffleStage").hidden = true;
  renderTarotRitualCards(cards);
  $("tarotRitualCards").hidden = false;
  $("tarotSkip").hidden = true;
  $("tarotRitualDone").hidden = false;
  $("tarotRitualKicker").textContent = tarotRitualMode === "draw" ? "THE ANSWER HAS ARRIVED" : "YOUR TAROT ARCHIVE";
  $("tarotRitualTitle").textContent = tarotRitualMode === "draw" ? "他替你带回了牌面" : "这一次的牌面";
  if (!immediate && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    $("tarotRitualCards").querySelectorAll(".tarot-card-face").forEach((card, index) => card.animate([{ opacity: 0, transform: "translateY(24px) rotateY(88deg)" }, { opacity: 1, transform: "translateY(0) rotateY(0)" }], { duration: 620, delay: Math.min(index, 12) * 90, easing: "cubic-bezier(.2,.72,.2,1)", fill: "both" }));
  }
  typing = false;
  $("typing").hidden = true;
  $("presence").textContent = "讯号在线";
  updateReplyButton();
}

function closeTarotRitual() {
  clearTimeout(tarotRevealTimer);
  tarotRevealTimer = 0;
  stopTarotAmbient();
  $("tarotRitual").hidden = true;
  document.body.classList.remove("tarot-open");
  activeTarotRequest = null;
  activeTarotConversation = null;
  tarotRitualMode = "draw";
  if (typing) { typing = false; $("typing").hidden = true; $("presence").textContent = "讯号在线"; updateReplyButton(); }
}

async function startTarotRitual(request, conversation) {
  activeTarotRequest = request;
  activeTarotConversation = conversation;
  tarotRitualMode = "draw";
  const cards = createTarotDraw(request);
  await saveStateNow(true);
  applyTarotAppearance();
  $("tarotRitualQuestion").textContent = request.payload?.question || "有些答案，会在安静的牌面里抵达。";
  $("tarotRitualKicker").textContent = "THE CARDS ARE LISTENING";
  $("tarotRitualTitle").textContent = "他正在洗牌";
  $("tarotRitualCards").hidden = true;
  $("tarotRitualDone").hidden = true;
  $("tarotSkip").hidden = false;
  const visibleBacks = Math.min(13, Math.max(7, cards.length + 5));
  $("tarotShuffleStage").hidden = false;
  $("tarotShuffleStage").innerHTML = Array.from({ length: visibleBacks }, (_, index) => `<i class="tarot-card-back" style="--card-index:${index}"><span>✦</span></i>`).join("");
  $("tarotRitual").hidden = false;
  document.body.classList.add("tarot-open");
  startTarotAmbient();
  const backs = $("tarotShuffleStage").querySelectorAll(".tarot-card-back");
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) backs.forEach((card, index) => card.animate([
    { transform: `translate3d(0,0,0) rotate(${(index - visibleBacks / 2) * 0.6}deg)` },
    { transform: `translate3d(${index % 2 ? 72 : -72}px,${index % 3 ? -8 : 12}px,0) rotate(${index % 2 ? 7 : -7}deg)`, offset: .34 },
    { transform: `translate3d(${index % 2 ? -48 : 48}px,4px,0) rotate(${index % 2 ? -4 : 4}deg)`, offset: .67 },
    { transform: `translate3d(0,0,0) rotate(${(index - visibleBacks / 2) * 0.45}deg)` }
  ], { duration: 1450, delay: index * 22, easing: "cubic-bezier(.42,0,.18,1)", fill: "both" }));
  tarotRevealTimer = setTimeout(() => revealTarotRitual(), matchMedia("(prefers-reduced-motion: reduce)").matches ? 120 : 1900);
}

function openTarotResult(message) {
  activeTarotRequest = message;
  activeTarotConversation = currentConversation();
  tarotRitualMode = "view";
  applyTarotAppearance();
  $("tarotRitualQuestion").textContent = message.payload?.question || "有些答案，会在安静的牌面里抵达。";
  $("tarotShuffleStage").hidden = true;
  $("tarotRitual").hidden = false;
  document.body.classList.add("tarot-open");
  startTarotAmbient();
  revealTarotRitual({ immediate: true });
}

function toggleMorePopover() {
  const popover = $("morePopover");
  $("stickerPopover").hidden = true;
  popover.innerHTML = `<div class="more-action-grid"><button data-more-action="image"><i><svg viewBox="0 0 24 24"><path d="M4 5h16v14H4zM7 16l4-4 3 3 2-2 2 3M15 9h.01"/></svg></i><span>图片</span></button><button data-more-action="choice"><i><svg viewBox="0 0 24 24"><path d="M5 6h14v12H5zM8 10h8M8 14h5"/></svg></i><span>我问你</span></button><button data-more-action="tarot"><i><svg viewBox="0 0 24 24"><path d="M7 3h10v18H7zM9.5 6h5M12 9v7M9.5 12h5"/></svg></i><span>塔罗</span></button><button data-more-action="dice"><i><svg viewBox="0 0 24 24"><path d="M5 5h14v14H5z"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="15" r="1"/></svg></i><span>骰子</span></button><button data-more-action="rps"><i>${gestureIcon("scissors")}</i><span>猜拳</span></button></div>`;
  popover.hidden = !popover.hidden;
  popover.querySelectorAll("[data-more-action]").forEach((button) => button.addEventListener("click", () => {
    const action = button.dataset.moreAction;
    if (action === "image") { closePopovers(); $("imageFile").click(); }
    else if (action === "choice") openChoiceEditor();
    else if (action === "tarot") openTarotEditor();
    else sendPlayMessage(action === "rps" ? "rps" : "dice");
  }));
}

async function sendImage(event) {
  const file = event.target.files[0];
  if (!file) return;
  const conversation = currentConversation();
  if (file.size > 8 * 1024 * 1024) { showToast("图片太大，请选择 8MB 以内的图片"); event.target.value = ""; return; }
  try {
    const dataUrl = await compressImage(file, 1600, 0.84);
    const message = { id: uid(), from: "me", type: "image", content: "[图片]", dataUrl, quote: takeManualReplyQuote(), createdAt: new Date().toISOString() };
    conversation.messages.push(message); conversation.updatedAt = new Date().toISOString();
    if (!await saveStateNow(false)) conversation.messages = conversation.messages.filter((item) => item.id !== message.id);
    else if (conversation.id === state.activeConversationId) renderMessages();
  } catch { showToast("这张图片暂时无法读取"); }
  event.target.value = "";
}

function buildReplyItems(combined, conversationMessages = currentMessages(), mode = state.mode) {
  const enabledSections = new Set(state.sections.filter((section) => {
    const rules = state.sectionSettings[section];
    return rules?.enabled !== false && (mode === "random" ? rules?.random !== false : rules?.response !== false);
  }));
  const eligibleCards = state.cards.filter((card) => enabledSections.has(card.section));
  const cardPool = eligibleCards;
  const matchedSections = new Set();
  if (mode === "response") {
    const normalizedCombined = String(combined || "").toLocaleLowerCase();
    enabledSections.forEach((section) => {
      const triggers = (state.sectionSettings[section]?.triggers || []).map((word) => String(word).trim()).filter(Boolean);
      if (triggers.some((word) => normalizedCombined.includes(word.toLocaleLowerCase()))) matchedSections.add(section);
    });
  }
  const pool = [...cardPool.map((card) => ({ kind: "card", card })), ...state.stickers.map((sticker) => ({ kind: "sticker", sticker }))];
  if (!pool.length) return [{ kind: "text", content: "这次还没有合适的话。先去字卡里添上一句吧。" }];
  const maximum = Math.max(1, Number(state.replyMaxCount) || 1);
  const count = 1 + Math.floor(Math.random() * maximum);
  const replies = [];
  if (mode === "response" && matchedSections.size && cardPool.length) {
    const matchedPool = cardPool.filter((card) => matchedSections.has(card.section));
    if (matchedPool.length) replies.push({ kind: "card", card: matchedPool[Math.floor(Math.random() * matchedPool.length)] });
  }
  while (replies.length < count) {
    const picked = pool[Math.floor(Math.random() * pool.length)];
    if (picked.kind === "sticker") { replies.push(picked); continue; }
    if (picked.card.combo && Math.random() < 0.5) {
      const followPool = eligibleCards.filter((card) => card.id !== picked.card.id && card.section !== picked.card.section);
      if (followPool.length) {
        const follow = followPool[Math.floor(Math.random() * followPool.length)];
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

function pendingChoiceRequests(conversation) {
  return conversation.messages.filter((message) => message.from === "me" && message.type === "choice-request" && message.status !== "resolved");
}

function resolveChoiceRequest(request) {
  const payload = request.payload || {};
  const options = Array.isArray(payload.options) ? payload.options.map(String).filter(Boolean) : [];
  let selected = [];
  if (payload.mode === "ranking") selected = shuffled(options);
  else if (payload.mode === "multiple") {
    const count = Math.max(1, Math.min(options.length, 1 + Math.floor(Math.random() * options.length)));
    selected = shuffled(options).slice(0, count);
  } else if (options.length) selected = [options[Math.floor(Math.random() * options.length)]];
  return { question: payload.question || request.content, mode: payload.mode || "single", selected };
}

function buildTriggeredPlayItems(combined) {
  if (!combined) return [];
  const normalizedCombined = String(combined).toLocaleLowerCase();
  const matched = [];
  if (state.diceReplyTriggers.some((word) => word && normalizedCombined.includes(String(word).toLocaleLowerCase()))) matched.push({ kind: "dice", value: 1 + Math.floor(Math.random() * 6) });
  if (state.rpsReplyTriggers.some((word) => word && normalizedCombined.includes(String(word).toLocaleLowerCase()))) matched.push({ kind: "rps", gesture: ["rock", "paper", "scissors"][Math.floor(Math.random() * 3)] });
  return matched;
}

function randomPendingQuote(messages) {
  if (!state.replyQuoteEnabled || !messages.length || Math.random() * 100 >= state.replyQuoteProbability) return undefined;
  const message = messages[Math.floor(Math.random() * messages.length)];
  return { from: "me", type: message.type, content: message.content || "[消息]", dataUrl: safeImage(message.dataUrl) || undefined };
}

function requestReply() {
  if (typing) return;
  const replyConversation = currentConversation();
  const replyMode = state.mode;
  const pending = pendingMessages();
  const combined = pending.map((message) => message.content).join("\n");
  const tarotRequest = pendingTarotRequests(replyConversation).at(-1);
  if (tarotRequest) {
    ensureReplyAudio();
    typing = true;
    $("typing").hidden = false;
    $("presence").textContent = "正在洗牌…";
    updateReplyButton();
    scrollMessagesToEnd();
    const minimum = Math.min(60, Math.max(1, Number(state.replyDelayMin || 1)));
    const maximum = Math.min(120, Math.max(minimum, Number(state.replyDelayMax || minimum)));
    const delay = Math.round((minimum + Math.random() * (maximum - minimum)) * 1000);
    setTimeout(() => {
      $("typing").hidden = true;
      $("presence").textContent = "正在抽牌…";
      startTarotRitual(tarotRequest, replyConversation).catch(() => {
        typing = false;
        $("typing").hidden = true;
        $("presence").textContent = "讯号在线";
        updateReplyButton();
        showToast("牌室暂时没有打开，请再试一次");
      });
    }, delay);
    return;
  }
  const quoteForReply = randomPendingQuote(pending);
  const choiceItems = pendingChoiceRequests(replyConversation).map((request) => ({ kind: "choice-result", request, result: resolveChoiceRequest(request) }));
  const playItems = buildTriggeredPlayItems(combined);
  const normalItems = playItems.length ? [] : buildReplyItems(combined, replyConversation.messages, replyMode);
  const replyItems = [...choiceItems, ...playItems, ...normalItems];
  const quoteTargetIndex = choiceItems.length + playItems.length;
  ensureReplyAudio();
  typing = true;
  $("typing").hidden = false;
  $("presence").textContent = "正在输入…";
  updateReplyButton();
  scrollMessagesToEnd();
  const minimum = Math.min(60, Math.max(1, Number(state.replyDelayMin || 1)));
  const maximum = Math.min(120, Math.max(minimum, Number(state.replyDelayMax || minimum)));
  const delay = Math.round((minimum + Math.random() * (maximum - minimum)) * 1000);
  const finishReply = () => {
    typing = false;
    $("typing").hidden = true;
    $("presence").textContent = "讯号在线";
    replyConversation.updatedAt = new Date().toISOString();
    saveState();
    renderMessages();
  };
  const deliverReplyItem = (index) => {
    try {
      const item = replyItems[index];
      if (!item) { finishReply(); return; }
      const quote = index === quoteTargetIndex && quoteForReply && normalItems.length ? quoteForReply : undefined;
      if (item.kind === "choice-result") {
        item.request.status = "resolved";
        const selectedText = item.result.selected.join(item.result.mode === "ranking" ? " → " : "、");
        replyConversation.messages.push({ id: uid(), from: "lover", type: "choice-result", content: `[选择结果] ${selectedText}`, payload: item.result, interactionId: item.request.id, createdAt: new Date().toISOString() });
      } else if (item.kind === "dice") replyConversation.messages.push({ id: uid(), from: "lover", type: "dice", content: `[骰子] ${item.value}`, payload: { value: item.value }, createdAt: new Date().toISOString() });
      else if (item.kind === "rps") replyConversation.messages.push({ id: uid(), from: "lover", type: "rps", content: `[剪刀石头布] ${{ rock: "石头", paper: "布", scissors: "剪刀" }[item.gesture]}`, payload: { gesture: item.gesture }, createdAt: new Date().toISOString() });
      else if (item.kind === "sticker") replyConversation.messages.push({ id: uid(), from: "lover", type: "sticker", content: `[表情] ${item.sticker.name}`, dataUrl: item.sticker.dataUrl, quote, createdAt: new Date().toISOString() });
      else replyConversation.messages.push({ id: uid(), from: "lover", type: "text", content: item.card?.content || item.content, quote, createdAt: new Date().toISOString() });
      replyConversation.updatedAt = new Date().toISOString();
      saveState();
      if (replyConversation.id === state.activeConversationId) renderMessages();
      playReplySound();
      if (index + 1 < replyItems.length) {
        $("typing").hidden = false;
        $("presence").textContent = "正在输入…";
        scrollMessagesToEnd();
        setTimeout(() => deliverReplyItem(index + 1), 700 + Math.round(Math.random() * 900));
      } else finishReply();
    } catch { finishReply(); }
  };
  setTimeout(() => deliverReplyItem(0), delay);
}

function closePopovers() {
  $("stickerPopover").hidden = true;
  $("morePopover").hidden = true;
}

function toggleStickerPopover() {
  const popover = $("stickerPopover");
  $("morePopover").hidden = true;
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
    state.activeConversationId = button.dataset.conversation; manualReplyQuote = null; renderComposerQuote(); saveState(); renderMessages(); openTool("chat");
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
  state.conversations.push(conversation); state.activeConversationId = conversation.id; manualReplyQuote = null; renderComposerQuote(); saveState(); renderMessages(); openTool("chat"); $("draft").focus();
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
  const visibleSections = state.sections.filter((name) => !query || name.includes(query) || (state.sectionSettings[name]?.triggers || []).some((word) => word.includes(query)) || visibleCards.some((card) => card.section === name));
  const groupedCards = visibleSections.map((name) => {
    const cards = state.cards.filter((card) => card.section === name);
    const rules = state.sectionSettings[name] || { random: true, response: true, enabled: true, combo: false, triggers: [] };
    const contents = cards.map((card) => card.content).join("\n");
    const ruleToggle = (key, label) => `<label class="mini-toggle"><input type="checkbox" data-section-rule="${key}" data-section="${escapeHtml(name)}" ${rules[key] ? "checked" : ""}><i></i><span>${label}</span></label>`;
    return `<details class="card-group" ${query ? "open" : ""}><summary><span><strong>${escapeHtml(name)}${rules.combo ? '<em class="combo-badge">可组合</em>' : ""}</strong><small data-section-count="${escapeHtml(name)}">${cards.length} 张字卡</small></span><b>⌄</b></summary><div class="card-group-editor"><div class="section-rule-toggles">${ruleToggle("random", "随机")}${ruleToggle("response", "回应")}${ruleToggle("enabled", "启用")}${ruleToggle("combo", "组合")}</div><label class="section-trigger-setting"><span>回应关键词</span><input data-section-triggers="${escapeHtml(name)}" value="${escapeHtml((rules.triggers || []).join("，"))}" placeholder="例如：想你，晚安，难过" spellcheck="false" autocomplete="off"></label><p>回应模式始终保留所有已开启分区；同时命中多个分区时，会合并成一个候选池并从中保证抽取一条。一行一张字卡，可直接在下方增删修改。</p><textarea class="section-card-editor" data-card-section="${escapeHtml(name)}" placeholder="在这里输入字卡，一行一张" spellcheck="false" autocapitalize="off" autocomplete="off">${escapeHtml(contents)}</textarea><button class="group-save-button" data-save-section="${escapeHtml(name)}">保存这个分区</button></div></details>`;
  }).join("");
  $("drawerContent").innerHTML = `
    <section class="drawer-section"><div class="section-title"><strong>分区</strong><span>${state.sections.length} 个</span></div><div class="inline-form"><input id="newSection" placeholder="新分区名称"><button class="secondary-button" id="addSection">添加</button></div><div class="section-tags">${state.sections.map((name) => `<span class="section-chip">${escapeHtml(name)}${state.sections.length > 1 ? `<button data-delete-section="${escapeHtml(name)}">×</button>` : ""}</span>`).join("")}</div></section>
    <section class="drawer-section duplicate-check"><div class="section-title"><strong>全库检查</strong><span>不区分分组</span></div><div class="duplicate-keyword-search"><input id="cardKeywordLookup" placeholder="查找某个词是否存在" spellcheck="false"><button class="secondary-button" id="searchCardKeyword">查找</button></div><div id="keywordLookupResults"></div><button class="secondary-button" id="checkDuplicates">检查全部 ${state.cards.length} 张字卡是否重复</button><div id="duplicateResults"></div></section>
    <section><div class="drawer-search"><input id="cardSearch" value="${escapeHtml(cardQuery)}" placeholder="搜索字卡或分区"><b>${visibleCards.length}/${state.cards.length}</b></div><div class="card-groups">${groupedCards || '<div class="empty-tool">没有符合条件的分区。</div>'}</div></section>`;
  $("addSection").addEventListener("click", () => {
    const name = $("newSection").value.trim();
    if (name && !state.sections.includes(name)) {
      state.sections.push(name);
      state.sectionSettings[name] = { random: true, response: true, enabled: true, combo: false, triggers: [] };
      saveState(); renderCardsDrawer();
    }
  });
  $("cardSearch").addEventListener("input", (event) => { cardQuery = event.target.value; renderCardsDrawer(); requestAnimationFrame(() => $("cardSearch")?.focus()); });
  const searchCardKeyword = () => {
    const keyword = $("cardKeywordLookup").value.trim();
    if (!keyword) { $("keywordLookupResults").innerHTML = '<div class="keyword-empty">输入关键词后即可检查全库。</div>'; return; }
    const matches = state.cards.filter((card) => card.content.includes(keyword));
    $("keywordLookupResults").innerHTML = matches.length
      ? `<div class="keyword-summary">找到 ${matches.length} 张包含“${escapeHtml(keyword)}”的字卡</div><div class="keyword-result-list">${matches.map((card) => `<article><span>${escapeHtml(card.section)}</span><p>${escapeHtml(card.content)}</p></article>`).join("")}</div>`
      : `<div class="keyword-empty">没有找到包含“${escapeHtml(keyword)}”的字卡。</div>`;
  };
  $("searchCardKeyword").addEventListener("click", searchCardKeyword);
  $("cardKeywordLookup").addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); searchCardKeyword(); } });
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
    state.sectionSettings[section] ||= { random: true, response: true, enabled: true, combo: false, triggers: [] };
    state.sectionSettings[section][rule] = input.checked;
    state.cards.filter((card) => card.section === section).forEach((card) => { card[rule] = input.checked; });
    saveState();
    if (rule === "combo") {
      const title = input.closest(".card-group")?.querySelector("summary strong");
      title?.querySelector(".combo-badge")?.remove();
      if (input.checked && title) title.insertAdjacentHTML("beforeend", '<em class="combo-badge">可组合</em>');
    }
  }));
  document.querySelectorAll("[data-section-triggers]").forEach((input) => input.addEventListener("input", () => {
    const section = input.dataset.sectionTriggers;
    const triggers = [...new Set(input.value.split(/[,，\n]+/).map((word) => word.trim()).filter(Boolean))];
    state.sectionSettings[section] ||= { random: true, response: true, enabled: true, combo: false, triggers: [] };
    state.sectionSettings[section].triggers = triggers;
    state.cards.filter((card) => card.section === section).forEach((card) => { card.triggers = [...triggers]; });
    saveState();
  }));
  document.querySelectorAll("[data-save-section]").forEach((button) => button.addEventListener("click", async () => {
    const section = button.dataset.saveSection;
    const group = button.closest(".card-group");
    const textarea = group?.querySelector("[data-card-section]");
    const triggerInput = group?.querySelector("[data-section-triggers]");
    if (!textarea) return;
    const lines = textarea.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const triggers = [...new Set(String(triggerInput?.value || "").split(/[,，\n]+/).map((word) => word.trim()).filter(Boolean))];
    const previousCards = structuredClone(state.cards);
    const previousRules = structuredClone(state.sectionSettings[section] || {});
    const existing = state.cards.filter((card) => card.section === section);
    const rules = state.sectionSettings[section] || { random: true, response: true, enabled: true, combo: false, triggers: [] };
    rules.triggers = triggers;
    state.sectionSettings[section] = rules;
    const remaining = [...existing];
    const updated = lines.map((content) => {
      let matchIndex = remaining.findIndex((card) => card.content === content);
      if (matchIndex < 0 && remaining.length) matchIndex = 0;
      const previous = matchIndex >= 0 ? remaining.splice(matchIndex, 1)[0] : null;
      return previous
        ? { ...previous, ...rules, section, content }
        : { id: uid(), section, content, ...rules, triggers: [...triggers] };
    });
    state.cards = state.cards.filter((card) => card.section !== section).concat(updated);
    button.disabled = true; button.textContent = "保存中…";
    const saved = await saveStateNow(false);
    button.disabled = false; button.textContent = saved ? "已保存" : "重新保存"; button.classList.toggle("saved", saved);
    if (!saved) { state.cards = previousCards; state.sectionSettings[section] = previousRules; }
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
  $("drawerContent").innerHTML = `<section class="drawer-section sticker-upload-section"><div class="section-title"><strong>表情包</strong><span>支持 PNG、JPG、GIF、WebP</span></div><p class="drawer-intro">上传后会直接出现在聊天输入栏的笑脸按钮里，不需要再分类。</p><label class="upload-box">＋ 选择一张或多张图片<input id="stickerFiles" type="file" accept="image/*" multiple></label></section><section class="drawer-section play-trigger-settings"><div class="section-title"><strong>玩法触发词</strong><span>爱人的回复</span></div><p class="drawer-intro">关键词用逗号或换行分隔。命中后这一轮只回复对应玩法，不再抽取字卡或普通表情包。</p><label class="field-label"><span>骰子关键词</span><input id="diceReplyKeywords" value="${escapeHtml(state.diceReplyTriggers.join("，"))}" placeholder="例如：骰子，投骰子"></label><label class="field-label"><span>剪刀石头布关键词</span><input id="rpsReplyKeywords" value="${escapeHtml(state.rpsReplyTriggers.join("，"))}" placeholder="例如：猜拳，剪刀石头布"></label></section><section><div class="section-title"><strong>已保存</strong><span>${state.stickers.length} 张</span></div>${state.stickers.length ? `<div class="sticker-library-scroll"><div class="sticker-grid">${state.stickers.map((sticker) => `<article class="sticker-card" data-sticker="${sticker.id}"><img src="${sticker.dataUrl}" alt="${escapeHtml(sticker.name)}"><button data-delete-sticker="${sticker.id}" title="删除" aria-label="删除表情">×</button><input data-sticker-field="name" value="${escapeHtml(sticker.name)}" aria-label="表情名称"></article>`).join("")}</div></div>` : '<div class="empty-tool">还没有表情包。上传后可直接从聊天输入区发送。</div>'}</section>`;
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
  const bindPlayKeywords = (id, key) => $(id).addEventListener("input", (event) => {
    state[key] = [...new Set(event.target.value.split(/[,，\n]+/).map((item) => item.trim()).filter(Boolean))];
    saveState();
  });
  bindPlayKeywords("diceReplyKeywords", "diceReplyTriggers");
  bindPlayKeywords("rpsReplyKeywords", "rpsReplyTriggers");
  appendSaveAction($("drawerContent"), "保存表情包设置");
}

function renderMemoriesDrawer() {
  const days = Math.max(1, Math.floor((Date.now() - new Date(`${state.anniversary}T00:00:00`).getTime()) / 86400000) + 1);
  const since = state.anniversary ? state.anniversary.replaceAll("-", " · ") : "尚未设定";
  const quotes = state.memoryQuotes.length ? state.memoryQuotes : defaults.memoryQuotes;
  const quote = quotes[Math.floor(Math.random() * quotes.length)];
  const memoryBackground = safeImage(state.memoryBackgroundImage);
  $("drawerContent").innerHTML = `<section class="memory-hero ${memoryBackground ? "has-wallpaper" : ""}" style="--memory-color:${state.memoryTextColor};--memory-blur:${state.memoryBackgroundBlur}px"><div class="memory-wallpaper" ${memoryBackground ? `style="background-image:url('${memoryBackground}')"` : ""}></div><div class="memory-veil"></div><div class="memory-content"><span class="memory-kicker">TOGETHER · ${escapeHtml(since)}</span><h3>你和 ${escapeHtml(state.loverName)} 已经相爱</h3><div class="memory-number">${Number.isFinite(days) ? days : "—"}</div><span class="memory-days">days</span><p>${escapeHtml(quote).replace(/\n/g, "<br>")}</p></div></section><section class="drawer-section memory-card-settings"><div class="section-title"><strong>纪念日卡片</strong><span>即时预览</span></div><div class="background-actions"><label class="wallpaper-button">更换卡片壁纸<input id="memoryBackgroundFile" type="file" accept="image/*"></label><button class="restore-button" id="removeMemoryBackground">恢复默认</button></div><div class="range-field"><div class="range-head"><span>壁纸模糊度</span><b id="memoryBlurValue">${state.memoryBackgroundBlur}px</b></div><input id="memoryBlurRange" type="range" min="0" max="24" step="1" value="${state.memoryBackgroundBlur}"></div>${colorSettingHtml("文字颜色", "memoryTextColor")}</section><section class="memory-date-setting">${inputField("我们从这一天开始", "date", state.anniversary, "anniversary")}</section><section class="drawer-section memory-quotes"><div class="section-title"><strong>纪念日文案</strong><span>侧边栏与卡片随机显示</span></div><label class="field-label"><textarea id="newMemoryQuotes" placeholder="写下一句想看见的话…&#10;可以一行添加一句"></textarea></label><button class="secondary-button memory-add" id="addMemoryQuotes">加入文案库</button><div class="quote-list">${state.memoryQuotes.map((item, index) => `<article><p>${escapeHtml(item)}</p><button data-delete-quote="${index}" aria-label="删除这句文案">×</button></article>`).join("")}</div></section><section class="drawer-section memory-create"><div class="section-title"><strong>新增纪念日</strong><span>时间坐标</span></div><div class="inline-form"><input id="memoryName" placeholder="为这一天取个名字"><input id="memoryDate" type="date"></div><label class="memory-repeat"><input id="memoryRepeat" type="checkbox" checked><i></i><span>每年重复</span></label><button class="green-button memory-add" id="addMemory">保存纪念日</button></section><section class="memory-list"><div class="section-title"><strong>纪念日记录</strong><span>${state.memories.length} 个</span></div>${state.memories.map((memory) => { const countdown = memoryCountdown(memory); return `<article class="memory-row"><div class="memory-date"><b>${escapeHtml(memory.date.slice(5).replace("-", "."))}</b><span>${memory.repeat ? "EVERY YEAR" : memory.date.slice(0, 4)}</span></div><div class="memory-copy"><strong>${escapeHtml(memory.name)}</strong><span>${countdown}</span></div><button data-delete-memory="${memory.id}" aria-label="删除纪念日">×</button></article>`; }).join("") || '<div class="empty-tool">还没有其他纪念日。</div>'}</section>`;
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
  bindColorSettingControls($("drawerContent"));
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
  const value = shownSettingColor(key);
  return `<div class="color-setting" data-color-setting="${key}"><span>${label}</span><button class="color-swatch" type="button" style="--swatch:${value}" data-color-picker="${key}" data-color-label="${escapeHtml(label)}" aria-label="选择${label}"></button><input value="${value}" maxlength="7" data-color-hex="${key}" aria-label="${label}色号"></div>`;
}

function syncColorControl(key, value) {
  const color = safeColor(value) || shownSettingColor(key);
  const control = document.querySelector(`[data-color-setting="${key}"]`);
  if (!control) return;
  const picker = control.querySelector(`[data-color-picker="${key}"]`);
  const hex = control.querySelector(`[data-color-hex="${key}"]`);
  if (picker) picker.style.setProperty("--swatch", color);
  if (hex) hex.value = color;
}

function commitSettingColor(key, value, hsv = hexToHsv(value)) {
  const color = safeColor(value);
  if (!color) return false;
  state[key] = color;
  state.colorPickerPositions ||= {};
  state.colorPickerPositions[key] = { hex: color, h: hsv.h, s: hsv.s, v: hsv.v };
  syncColorControl(key, color);
  if (key === "memoryTextColor") document.querySelector(".memory-hero")?.style.setProperty("--memory-color", color);
  applyAppearance();
  saveState();
  return true;
}

function ensureHsvColorPicker() {
  if ($("hsvColorPicker")) return;
  document.body.insertAdjacentHTML("beforeend", `<div class="hsv-color-picker" id="hsvColorPicker" hidden role="dialog" aria-modal="true" aria-label="选择颜色"><button class="hsv-picker-scrim" id="hsvPickerScrim" aria-label="取消选择颜色"></button><section class="hsv-picker-sheet"><header><strong id="hsvPickerTitle">选择颜色</strong><span id="hsvPickerHex">#ff0000</span></header><label class="hsv-slider hue"><span>色调 <b id="hsvHueValue">360</b></span><input id="hsvHue" type="range" min="0" max="360" step="1" value="360"></label><label class="hsv-slider saturation"><span>饱和度 <b id="hsvSaturationValue">100</b></span><input id="hsvSaturation" type="range" min="0" max="100" step="1" value="100"></label><label class="hsv-slider value"><span>明度 <b id="hsvValueValue">100</b></span><input id="hsvValue" type="range" min="0" max="100" step="1" value="100"></label><div class="hsv-picker-result"><span>当前颜色</span><i id="hsvPickerPreview"></i></div><footer><button id="hsvPickerCancel">取消</button><button id="hsvPickerConfirm">设置</button></footer></section></div>`);
  ["hsvHue", "hsvSaturation", "hsvValue"].forEach((id) => $(id).addEventListener("input", () => {
    if (!colorPickerSession) return;
    colorPickerSession.hsv = { h: Number($("hsvHue").value), s: Number($("hsvSaturation").value), v: Number($("hsvValue").value) };
    updateHsvColorPicker();
  }));
  const close = () => { $("hsvColorPicker").hidden = true; colorPickerSession = null; };
  $("hsvPickerScrim").addEventListener("click", close);
  $("hsvPickerCancel").addEventListener("click", close);
  $("hsvPickerConfirm").addEventListener("click", () => {
    if (!colorPickerSession) return;
    const { key, hsv } = colorPickerSession;
    commitSettingColor(key, hsvToHex(hsv.h, hsv.s, hsv.v), hsv);
    close();
  });
}

function updateHsvColorPicker() {
  if (!colorPickerSession) return;
  const hsv = colorPickerSession.hsv; const color = hsvToHex(hsv.h, hsv.s, hsv.v);
  $("hsvHue").value = hsv.h; $("hsvSaturation").value = hsv.s; $("hsvValue").value = hsv.v;
  $("hsvHueValue").textContent = Math.round(hsv.h); $("hsvSaturationValue").textContent = Math.round(hsv.s); $("hsvValueValue").textContent = Math.round(hsv.v);
  $("hsvPickerHex").textContent = color; $("hsvPickerPreview").style.background = color;
  const sheet = document.querySelector(".hsv-picker-sheet");
  sheet.style.setProperty("--hsv-hue", `hsl(${hsv.h} 100% 50%)`);
  sheet.style.setProperty("--hsv-saturation-start", hsvToHex(hsv.h, 0, hsv.v));
  sheet.style.setProperty("--hsv-saturation-end", hsvToHex(hsv.h, 100, hsv.v));
  sheet.style.setProperty("--hsv-value-end", hsvToHex(hsv.h, hsv.s, 100));
}

function openHsvColorPicker(key, label) {
  ensureHsvColorPicker();
  const color = shownSettingColor(key); const remembered = state.colorPickerPositions?.[key];
  const hasCustomColor = key === "memoryTextColor" ? safeColor(state.memoryTextColor) !== defaults.memoryTextColor : Boolean(safeColor(state[key]));
  const hsv = remembered?.hex === color ? { h: remembered.h, s: remembered.s, v: remembered.v } : hasCustomColor ? hexToHsv(color) : { h: 360, s: 100, v: 100 };
  colorPickerSession = { key, hsv };
  $("hsvPickerTitle").textContent = label || "选择颜色";
  $("hsvColorPicker").hidden = false;
  updateHsvColorPicker();
}

function bindColorSettingControls(container = document) {
  container.querySelectorAll("[data-color-picker]").forEach((button) => button.addEventListener("click", () => openHsvColorPicker(button.dataset.colorPicker, button.dataset.colorLabel)));
  container.querySelectorAll("[data-color-hex]").forEach((input) => input.addEventListener("change", (event) => {
    const key = event.target.dataset.colorHex; const color = safeColor(event.target.value);
    if (!color) { event.target.value = shownSettingColor(key); showToast("请输入六位色号，例如 #95ec69"); return; }
    commitSettingColor(key, color, hexToHsv(color));
  }));
}

function renderAppearanceDrawer() {
  $("drawerContent").innerHTML = `
    <section class="drawer-section"><div class="section-title"><strong>双方资料</strong><span>仅保存在本机</span></div>${inputField("我的称呼", "text", state.myName, "myName")}${inputField("爱人的称呼", "text", state.loverName, "loverName")}<div class="avatar-settings"><label class="avatar-upload"><div class="avatar">${avatarMarkup(state.myAvatar, state.myName)}</div><span>替换我的头像</span><input type="file" accept="image/*" data-avatar="myAvatar"></label><label class="avatar-upload"><div class="avatar">${avatarMarkup(state.loverAvatar, state.loverName)}</div><span>替换爱人头像</span><input type="file" accept="image/*" data-avatar="loverAvatar"></label></div></section>
    <section class="drawer-section custom-font-settings"><div class="section-title"><strong>全局字体</strong><span>保留纪念日花体</span></div><div class="font-live-preview"><b>Aa 你好，今天也在这里。</b><span>${escapeHtml(state.customFontName || "当前使用系统默认字体")}</span></div><div class="background-actions"><label class="wallpaper-button">上传字体文件<input id="customFontFile" type="file" accept=".ttf,.otf,.woff,.woff2,font/*"></label><button class="restore-button" id="removeCustomFont">恢复默认</button></div><label class="field-label"><span>字体文件直链（HTTPS，支持 TTF、OTF、WOFF、WOFF2）</span><input id="customFontUrl" type="url" value="${escapeHtml(state.customFontUrl)}" placeholder="https://example.com/font.woff2"></label><button class="secondary-button font-url-apply" id="applyFontUrl">应用字体链接</button><p class="font-help">仅替换全站普通文字；纪念日数字、英文装饰和原有花体保持不变。</p></section>
    <section class="drawer-section background-settings"><div class="section-title"><strong>聊天外观</strong><span>消息区域</span></div><div class="background-preview" style="background-image:${safeImage(state.backgroundImage) ? `url('${state.backgroundImage}')` : "none"}"></div><div class="background-actions"><label class="wallpaper-button">更换聊天壁纸<input id="backgroundFile" type="file" accept="image/*"></label><button class="restore-button" id="removeBackground">恢复默认</button></div><div class="range-field"><div class="range-head"><span>聊天字体大小</span><b id="fontSizeValue">${state.fontSize}px</b></div><input id="fontSizeRange" type="range" min="12" max="22" value="${state.fontSize}"></div><div class="range-field"><div class="range-head"><span>气泡圆角</span><b id="radiusValue">${state.bubbleRadius}px</b></div><input id="radiusRange" type="range" min="0" max="18" value="${state.bubbleRadius}"></div><div class="range-field"><div class="range-head"><span>背景遮罩</span><b id="overlayValue">${state.backgroundOverlay}%</b></div><input id="overlayRange" type="range" min="0" max="75" value="${state.backgroundOverlay}"></div><div class="bubble-color-grid">${colorSettingHtml("我的气泡", "myBubbleColor")}${colorSettingHtml("我的文字", "myBubbleTextColor")}${colorSettingHtml("他的气泡", "loverBubbleColor")}${colorSettingHtml("他的文字", "loverBubbleTextColor")}</div><button class="restore-button color-reset" id="resetBubbleColors">恢复默认气泡配色</button></section>
    <section class="drawer-section choice-card-settings"><div class="section-title"><strong>“我问你”卡片</strong><span>底色即时预览</span></div><div class="choice-card-live-preview"><article><small>我问你 · 单选</small><strong>今天想去哪里？</strong><span>○ 海边</span><span>○ 山里</span></article><article><small>我的回答</small><strong>海边</strong></article></div>${colorSettingHtml("卡片底色", "choiceCardColor")}<button class="restore-button color-reset" id="resetChoiceCardColor">恢复默认卡片底色</button></section>
    <section class="drawer-section sidebar-background-settings"><div class="section-title"><strong>侧边栏壁纸</strong><span>同时作用于左右两侧</span></div><div class="sidebar-background-preview ${safeImage(state.sidebarBackgroundImage) ? "has-image" : ""}" style="--preview-sidebar-image:${safeImage(state.sidebarBackgroundImage) ? `url('${state.sidebarBackgroundImage}')` : "none"};--preview-sidebar-blur:${state.sidebarBackgroundBlur}px"><i></i><span>左侧栏</span><span>右侧栏</span></div><div class="background-actions"><label class="wallpaper-button">更换侧栏壁纸<input id="sidebarBackgroundFile" type="file" accept="image/*"></label><button class="restore-button" id="removeSidebarBackground">恢复默认</button></div><div class="range-field"><div class="range-head"><span>壁纸模糊度</span><b id="sidebarBlurValue">${state.sidebarBackgroundBlur}px</b></div><input id="sidebarBlurRange" type="range" min="0" max="24" step="1" value="${state.sidebarBackgroundBlur}"></div></section>
    <section class="drawer-section tarot-room-settings"><div class="section-title"><strong>塔罗牌室</strong><span>独立外观</span></div><div class="tarot-settings-preview ${safeImage(state.tarotBackgroundImage) ? "has-image" : ""}" style="--tarot-preview-image:${safeImage(state.tarotBackgroundImage) ? `url('${state.tarotBackgroundImage}')` : "none"};--tarot-preview-blur:${state.tarotBackgroundBlur}px;--tarot-preview-overlay:${state.tarotBackgroundOverlay / 100};--tarot-preview-glow:${state.tarotGlow / 100}"><i>✦</i><span>TAROT ROOM</span></div><div class="background-actions"><label class="wallpaper-button">更换牌室壁纸<input id="tarotBackgroundFile" type="file" accept="image/*"></label><button class="restore-button" id="removeTarotBackground">恢复默认</button></div><div class="range-field"><div class="range-head"><span>壁纸模糊</span><b id="tarotBlurValue">${state.tarotBackgroundBlur}px</b></div><input id="tarotBlurRange" type="range" min="0" max="24" value="${state.tarotBackgroundBlur}"></div><div class="range-field"><div class="range-head"><span>暗色遮罩</span><b id="tarotOverlayValue">${state.tarotBackgroundOverlay}%</b></div><input id="tarotOverlayRange" type="range" min="0" max="80" value="${state.tarotBackgroundOverlay}"></div><div class="range-field"><div class="range-head"><span>星光强度</span><b id="tarotGlowValue">${state.tarotGlow}%</b></div><input id="tarotGlowRange" type="range" min="0" max="100" value="${state.tarotGlow}"></div></section>
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
  $("tarotBackgroundFile").addEventListener("change", async (event) => {
    const file = event.target.files[0]; if (!file) return;
    if (file.size > 10 * 1024 * 1024) { showToast("壁纸请控制在 10MB 以内"); event.target.value = ""; return; }
    const previous = state.tarotBackgroundImage;
    try {
      state.tarotBackgroundImage = await compressImage(file, 1800, 0.84);
      if (await saveStateNow(false)) { applyTarotAppearance(); renderAppearanceDrawer(); showToast("塔罗牌室壁纸已替换"); }
      else state.tarotBackgroundImage = previous;
    } catch { state.tarotBackgroundImage = previous; showToast("这张壁纸暂时无法读取"); }
  });
  $("removeTarotBackground").addEventListener("click", () => { state.tarotBackgroundImage = ""; applyTarotAppearance(); saveState(); renderAppearanceDrawer(); showToast("已恢复默认牌室背景"); });
  [["tarotBlurRange", "tarotBackgroundBlur", "tarotBlurValue", "px"], ["tarotOverlayRange", "tarotBackgroundOverlay", "tarotOverlayValue", "%"], ["tarotGlowRange", "tarotGlow", "tarotGlowValue", "%"]].forEach(([id, key, output, unit]) => {
    $(id).addEventListener("input", (event) => {
      state[key] = Number(event.target.value); $(output).textContent = `${state[key]}${unit}`;
      const preview = document.querySelector(".tarot-settings-preview");
      if (preview) { preview.style.setProperty("--tarot-preview-blur", `${state.tarotBackgroundBlur}px`); preview.style.setProperty("--tarot-preview-overlay", `${state.tarotBackgroundOverlay / 100}`); preview.style.setProperty("--tarot-preview-glow", `${state.tarotGlow / 100}`); }
      applyTarotAppearance(); saveState();
    });
  });
  bindColorSettingControls($("drawerContent"));
  $("resetBubbleColors").addEventListener("click", () => {
    ["myBubbleColor", "myBubbleTextColor", "loverBubbleColor", "loverBubbleTextColor"].forEach((key) => { state[key] = ""; delete state.colorPickerPositions?.[key]; });
    saveState(); applyAppearance(); renderAppearanceDrawer(); showToast("已恢复当前模式的默认气泡配色");
  });
  $("resetChoiceCardColor").addEventListener("click", () => {
    state.choiceCardColor = ""; delete state.colorPickerPositions?.choiceCardColor; saveState(); applyAppearance(); renderAppearanceDrawer(); showToast("已恢复默认卡片底色");
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
  $("plusButton").addEventListener("click", toggleMorePopover);
  $("stickerButton").addEventListener("click", toggleStickerPopover);
  $("imageFile").addEventListener("change", sendImage);
  $("choiceEditorClose").addEventListener("click", closeChoiceEditor);
  $("choiceEditorScrim").addEventListener("click", closeChoiceEditor);
  $("choiceSubmit").addEventListener("click", sendChoiceRequest);
  $("tarotEditorClose").addEventListener("click", closeTarotEditor);
  $("tarotEditorScrim").addEventListener("click", closeTarotEditor);
  $("tarotSubmit").addEventListener("click", sendTarotRequest);
  $("tarotCountDown").addEventListener("click", () => updateTarotCount(Number($("tarotCount").value) - 1));
  $("tarotCountUp").addEventListener("click", () => updateTarotCount(Number($("tarotCount").value) + 1));
  $("tarotCount").addEventListener("change", (event) => updateTarotCount(event.target.value));
  $("tarotReversed").addEventListener("change", (event) => { state.tarotReversed = event.target.checked; saveState(); });
  $("tarotSkip").addEventListener("click", () => revealTarotRitual({ immediate: true }));
  $("tarotRitualDone").addEventListener("click", closeTarotRitual);
  $("tarotRitualClose").addEventListener("click", () => { if (tarotRitualMode === "draw" && activeTarotRequest?.status !== "resolved") revealTarotRitual({ immediate: true }); closeTarotRitual(); });
  document.querySelectorAll("[data-choice-mode]").forEach((button) => button.addEventListener("click", () => {
    selectedChoiceMode = button.dataset.choiceMode;
    document.querySelectorAll("[data-choice-mode]").forEach((item) => item.classList.toggle("active", item === button));
    $("choiceModeHelp").textContent = ({ single: "他会从所有选项里选择一个。", multiple: "他会随机选择一个或多个答案。", ranking: "他会将全部答案排出先后顺序。" })[selectedChoiceMode];
  }));
  $("mediaViewerClose").addEventListener("click", closeMediaViewer);
  $("mediaViewer").addEventListener("click", (event) => { if (event.target === $("mediaViewer")) closeMediaViewer(); });
  $("messageList").addEventListener("scroll", () => {
    const list = $("messageList");
    if (!suppressEarlierLoad && list.scrollTop <= 8 && list.scrollHeight > list.clientHeight) loadEarlierMessages();
  }, { passive: true });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!$("mediaViewer").hidden) closeMediaViewer();
    else if (!$("tarotRitual").hidden) { if (tarotRitualMode === "draw" && activeTarotRequest?.status !== "resolved") revealTarotRitual({ immediate: true }); closeTarotRitual(); }
    else if (!$("tarotEditor").hidden) closeTarotEditor();
    else if (!$("choiceEditor").hidden) closeChoiceEditor();
  });
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
