// Robot 2027 - V2.2 Smart Companion Engine
// Features: <=100MB ARM SIMD LLM, Native Android SpeechRecognizer, 10 Real-Time Expressions, Replay Speaker on Every Bubble

let isModelReady = false;
let activeModelName = '';
let isGenerating = false;
let awaitingUserName = false;
let isMicListening = false;
let currentFaceState = 'IDLE_ALIVE';
let expressionTimer = null;
let activeSpeakerBtn = null;

let familyState = {
  activeMemberId: null,
  members: []
};

const statusEl = document.getElementById('modelStatus');
const metricEl = document.getElementById('speedMetric');
const netBadgeEl = document.getElementById('netBadge');
const faceStage = document.getElementById('faceStage');
const mouthEl = document.getElementById('mouthEl');
const stateLabel = document.getElementById('stateLabel');
const speakerBadge = document.getElementById('speakerBadge');
const chatArea = document.getElementById('chatArea');

function getNativeLLM() {
  return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalLLM;
}

function getSpeechBridge() {
  return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.SpeechBridge;
}

function toggleDrawer(id) {
  const el = document.getElementById(id);
  const isOpen = el.classList.contains('open');
  document.querySelectorAll('.drawer').forEach(d => d.classList.remove('open'));
  if (!isOpen) el.classList.add('open');
}

// =========================================================================
// 1. HỆ THỐNG 10 BIỂU CẢM KHUÔN MẶT REAL-TIME CÓ NHỊP NGHỈ SINH HỌC
// =========================================================================
const LEGACY_ANIM_MAP = {
  'IDLE': 'IDLE_ALIVE',
  'HEART_EYES': 'LOVE_WARM',
  'HAPPY_JUMP': 'HAPPY_EXCITED',
  'CLAP': 'HAPPY_EXCITED',
  'DANCE': 'HAPPY_EXCITED',
  'THINKING': 'THINKING_PONDER',
  'GIGGLE': 'PLAYFUL_WINK',
  'SCRATCH_HEAD': 'CURIOUS_TILT'
};

function normalizeFaceState(raw) {
  if (!raw) return 'IDLE_ALIVE';
  const up = raw.toUpperCase();
  return LEGACY_ANIM_MAP[up] || up;
}

function setFaceState(rawState, isTalking = false) {
  const state = normalizeFaceState(rawState);
  currentFaceState = state;
  faceStage.className = 'face-stage gpu-layer ' + state.toLowerCase();
  stateLabel.textContent = state;

  if (isTalking) {
    mouthEl.classList.add('talking');
  } else {
    mouthEl.classList.remove('talking');
  }
}

// Phân tích cảm xúc từ nội dung văn bản (dùng cho cả lời người dùng & từng vế câu của Robot)
function detectEmotionFromText(text, fallback = 'SPEAKING_CHEERFUL') {
  const lower = (text || '').toLowerCase();
  if (/(love|mom|mommy|dad|daddy|hug|sweet|heart|family|grandma|grandpa)/.test(lower)) {
    return 'LOVE_WARM';
  }
  if (/(sad|tired|sleepy|sick|sorry|hurt|cry|upset|unhappy|breath|rest)/.test(lower)) {
    return 'EMPATHY_CARE';
  }
  if (/(wow|whoa|amazing|awesome|fantastic|incredible|roar|blast off|sparkle)/.test(lower) || lower.includes('!')) {
    if (/(wow|whoa|amazing|roar|blast off|giant)/.test(lower)) return 'SURPRISED_WOW';
    return 'HAPPY_EXCITED';
  }
  if (/(play|game|hide and seek|riddle|joke|funny|haha|wink|secret|spy)/.test(lower)) {
    return 'PLAYFUL_WINK';
  }
  if (lower.includes('?') || /(what|why|how|where|when|who|which|wonder|curious)/.test(lower)) {
    return 'CURIOUS_TILT';
  }
  if (/(great|good job|yay|woohoo|high five|happy|excited|proud)/.test(lower)) {
    return 'HAPPY_EXCITED';
  }
  return fallback;
}

// Vòng lặp chớp mắt & liếc đồng tử tự nhiên (có khoảng nghỉ sinh học)
function startBiologicalFaceLoop() {
  const eyeLeft = document.getElementById('eyeLeft');
  const eyeRight = document.getElementById('eyeRight');
  const pupilLeft = document.getElementById('pupilLeft');
  const pupilRight = document.getElementById('pupilRight');

  setInterval(() => {
    if (currentFaceState === 'PLAYFUL_WINK') return;
    eyeLeft.classList.add('blink-now');
    eyeRight.classList.add('blink-now');
    setTimeout(() => {
      eyeLeft.classList.remove('blink-now');
      eyeRight.classList.remove('blink-now');
    }, 140);
  }, 3600);

  setInterval(() => {
    if (currentFaceState !== 'IDLE_ALIVE') return;
    const moves = [
      'translate(0px, 0px)',
      'translate(4px, -2px)',
      'translate(-4px, -1px)',
      'translate(0px, 0px)',
      'translate(2px, 3px)'
    ];
    const pick = moves[Math.floor(Math.random() * moves.length)];
    pupilLeft.style.transform = pick;
    pupilRight.style.transform = pick;
  }, 2600);
}

// =========================================================================
// 2. BONG BÓNG CHAT CÓ NÚT LOA (🔊) PHÁT LẠI CHO MỌI TIN NHẮN (USER & BOT)
// =========================================================================
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function addBubble(text, type = 'bot', meta = '', animHint = 'SPEAKING_CHEERFUL') {
  const div = document.createElement('div');
  div.className = 'bubble ' + type;

  if (type === 'sys') {
    div.innerHTML = text + (meta ? `<div class="meta">${meta}</div>` : '');
  } else {
    const body = document.createElement('div');
    body.className = 'bubble-body';

    const textSpan = document.createElement('div');
    textSpan.className = 'bubble-text';
    textSpan.innerHTML = escapeHtml(text);

    const speakBtn = document.createElement('button');
    speakBtn.className = 'speak-icon-btn';
    speakBtn.title = 'Nghe phát âm đoạn này';
    speakBtn.textContent = '🔊';
    speakBtn.onclick = () => {
      replayBubbleAudio(text, type, animHint, speakBtn);
    };

    body.appendChild(textSpan);
    body.appendChild(speakBtn);
    div.appendChild(body);

    if (meta) {
      const metaDiv = document.createElement('div');
      metaDiv.className = 'meta';
      metaDiv.innerHTML = meta;
      div.appendChild(metaDiv);
    }
  }

  chatArea.appendChild(div);
  chatArea.scrollTop = chatArea.scrollHeight;
}

async function replayBubbleAudio(text, type, animHint, btnEl) {
  if (activeSpeakerBtn) {
    activeSpeakerBtn.classList.remove('playing');
  }
  activeSpeakerBtn = btnEl;
  if (btnEl) btnEl.classList.add('playing');

  try {
    if (type === 'user') {
      // Đọc chậm rõ ràng (0.90x) để người dùng kiểm tra phát âm tiếng Anh của chính mình
      await speakSingleSegment(text, 0.90, 1.0);
    } else {
      // Nếu là tin nhắn Robot: diễn lại biểu cảm khuôn mặt + đọc lại
      await speakEnglishWithRealTimeEmotion(text, animHint);
    }
  } finally {
    if (btnEl) btnEl.classList.remove('playing');
    if (activeSpeakerBtn === btnEl) activeSpeakerBtn = null;
  }
}

// Đọc 1 đoạn text qua Native Android TTS (ưu tiên) hoặc Capacitor/Web Speech
async function speakSingleSegment(text, rate = 0.96, pitch = 1.08) {
  const clean = (text || '').trim();
  if (!clean) return;

  const SpeechBridge = getSpeechBridge();
  if (SpeechBridge) {
    try {
      await SpeechBridge.speak({ text: clean, lang: 'en-US', rate, pitch });
      return;
    } catch (e) {
      console.warn('Native TTS fallback:', e);
    }
  }

  const CapTTS = window.Capacitor?.Plugins?.TextToSpeech;
  if (CapTTS) {
    try {
      await CapTTS.speak({ text: clean, lang: 'en-US', rate, pitch, volume: 1.0 });
      return;
    } catch (e) {
      console.warn('CapTTS fallback:', e);
    }
  }

  if ('speechSynthesis' in window) {
    await new Promise((resolve) => {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(clean);
      u.lang = 'en-US';
      u.rate = rate;
      u.pitch = pitch;
      u.onend = resolve;
      u.onerror = resolve;
      window.speechSynthesis.speak(u);
    });
  }
}

// Đọc câu trả lời của Robot và đổi biểu cảm Real-Time theo từng vế câu + nhịp nghỉ tự nhiên
async function speakEnglishWithRealTimeEmotion(fullText, primaryAnim = 'SPEAKING_CHEERFUL') {
  if (expressionTimer) {
    clearTimeout(expressionTimer);
    expressionTimer = null;
  }

  // Tách thành các câu nhỏ theo dấu chấm, chấm hỏi, chấm than để đổi sắc thái từng câu
  const segments = fullText
    .match(/[^.!?]+[.!?]*/g)
    ?.map(s => s.trim())
    .filter(Boolean) || [fullText];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const segAnim = i === 0
      ? detectEmotionFromText(seg, normalizeFaceState(primaryAnim))
      : detectEmotionFromText(seg, 'SPEAKING_CHEERFUL');

    setFaceState(segAnim, true);
    await speakSingleSegment(seg, 0.96, 1.08);

    // Khoảng nghỉ tự nhiên giữa 2 câu (220ms) như người thật lấy hơi
    if (i < segments.length - 1) {
      mouthEl.classList.remove('talking');
      await new Promise(r => setTimeout(r, 220));
    }
  }

  // Giữ biểu cảm cuối câu thêm 1.2 giây trước khi trở về trạng thái thở tự nhiên
  mouthEl.classList.remove('talking');
  expressionTimer = setTimeout(() => {
    setFaceState('IDLE_ALIVE', false);
  }, 1200);
}

// =========================================================================
// 3. THU ÂM GIỌNG NÓI NATIVE ANDROID (KHẮC PHỤC TRIỆT ĐỂ LỖI TỰ TẮT MIC)
// =========================================================================
function setMicVisual(listening, liveMessage = '') {
  isMicListening = listening;
  const micBtn = document.getElementById('micBtn');
  const liveBar = document.getElementById('micLiveBar');
  const liveText = document.getElementById('micLiveText');

  if (listening) {
    micBtn.classList.add('active');
    liveBar.classList.add('show');
    liveText.textContent = liveMessage || '🎙️ Đang nghe tiếng Anh... Hãy nói rõ vào micro!';
    setFaceState('LISTENING_ATTENTIVE', false);
  } else {
    micBtn.classList.remove('active');
    liveBar.classList.remove('show');
  }
}

async function toggleMic() {
  if (isMicListening) {
    await stopNativeMic();
    return;
  }

  const SpeechBridge = getSpeechBridge();
  if (SpeechBridge) {
    try {
      setMicVisual(true, '🎙️ Đang khởi động micro...');
      await SpeechBridge.startListening({ lang: 'en-US' });
    } catch (err) {
      setMicVisual(false);
      setFaceState('IDLE_ALIVE', false);
      const msg = err?.message || 'Không thể mở micro trên thiết bị này.';
      addBubble(`⚠️ ${msg}`, 'sys');
    }
    return;
  }

  // Dự phòng khi mở giao diện trên trình duyệt Chrome máy tính
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    alert('Tính năng thu âm Native chỉ hoạt động khi cài APK trên Android hoặc mở bằng Chrome!');
    return;
  }

  const rec = new SpeechRec();
  rec.lang = 'en-US';
  rec.interimResults = true;
  setMicVisual(true);

  rec.onresult = (event) => {
    const transcript = Array.from(event.results).map(r => r[0].transcript).join('');
    document.getElementById('textInput').value = transcript;
    document.getElementById('micLiveText').textContent = '🎙️ Đang nghe: ' + transcript;
    if (event.results[0].isFinal) {
      setMicVisual(false);
      sendChat();
    }
  };
  rec.onerror = () => {
    setMicVisual(false);
    setFaceState('IDLE_ALIVE', false);
  };
  rec.onend = () => {
    setMicVisual(false);
  };
  rec.start();
}

async function stopNativeMic() {
  const SpeechBridge = getSpeechBridge();
  if (SpeechBridge) {
    try {
      await SpeechBridge.stopListening();
    } catch (e) {}
  }
  setMicVisual(false);
  setFaceState('IDLE_ALIVE', false);
}

// =========================================================================
// 4. QUẢN LÝ MẠNG, 18 VAI TRÒ & BỘ NHỚ GIA ĐÌNH (LOCAL + CLOUD SYNC)
// =========================================================================
function updateNetworkBadge() {
  const online = navigator.onLine;
  if (online) {
    netBadgeEl.className = 'pill ready';
    netBadgeEl.textContent = '🟢 Online';
  } else {
    netBadgeEl.className = 'pill err';
    netBadgeEl.textContent = '🔴 Offline';
  }
  return online;
}

window.addEventListener('online', () => {
  updateNetworkBadge();
  addBubble('🌐 Đã có kết nối mạng trở lại! Sẵn sàng gọi Server API.', 'sys');
});
window.addEventListener('offline', () => {
  updateNetworkBadge();
  if (isModelReady) {
    addBubble('📡 Mất mạng! Tự động chuyển sang dùng Bộ não AI cục bộ (&le; 100 MB).', 'sys');
  } else {
    addBubble('⚠️ Mất mạng và máy chưa tải Bộ não AI cục bộ. Hãy kết nối mạng để tải Model!', 'sys');
  }
});

function initPersonasDropdown() {
  const sel = document.getElementById('personaSelect');
  sel.innerHTML = '';
  ROBOT_PERSONAS.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.icon} ${p.label}`;
    sel.appendChild(opt);
  });
}

function getActivePersonaObj() {
  const id = document.getElementById('personaSelect').value;
  return ROBOT_PERSONAS.find(p => p.id === id) || ROBOT_PERSONAS[0];
}

function onPersonaManualChange() {
  const p = getActivePersonaObj();
  const member = getActiveMember();
  if (member) {
    member.preferredPersona = p.id;
    saveFamilyMemory();
  }
  addBubble(`Đã đổi vai trò Robot sang: <b>${p.icon} ${p.label}</b>`, 'sys');
}

function detectPersonaSwitchFromText(text) {
  const lower = text.toLowerCase();
  const intentTriggers = ['be my', 'act like', 'pretend to be', 'switch to', 'become a', 'you are a', 'teach me', 'tell me a story'];
  const hasTrigger = intentTriggers.some(t => lower.includes(t));
  if (!hasTrigger) return null;

  for (const p of ROBOT_PERSONAS) {
    if (p.keywords.some(kw => lower.includes(kw))) {
      document.getElementById('personaSelect').value = p.id;
      const member = getActiveMember();
      if (member) {
        member.preferredPersona = p.id;
        saveFamilyMemory();
      }
      return p;
    }
  }
  return null;
}

function loadFamilyMemory() {
  try {
    const raw = localStorage.getItem('robot2027_family_v2');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.members)) {
        familyState = parsed;
      }
    }
  } catch (e) {}
  renderFamilyUI();
}

function saveFamilyMemory() {
  localStorage.setItem('robot2027_family_v2', JSON.stringify(familyState));
  renderFamilyUI();
}

function getActiveMember() {
  if (!familyState.activeMemberId) return null;
  return familyState.members.find(m => m.id === familyState.activeMemberId) || null;
}

function renderFamilyUI() {
  const speakerSel = document.getElementById('speakerSelect');
  speakerSel.innerHTML = '';

  const unknownOpt = document.createElement('option');
  unknownOpt.value = '';
  unknownOpt.textContent = '❓ Người mới (Tự nhận diện)';
  speakerSel.appendChild(unknownOpt);

  familyState.members.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = `👤 ${m.name} (${m.age || '?'}t)`;
    speakerSel.appendChild(opt);
  });

  speakerSel.value = familyState.activeMemberId || '';

  const active = getActiveMember();
  if (active) {
    speakerBadge.textContent = `👤 ${active.name} (${active.age || '?'}t)`;
    if (active.preferredPersona) {
      document.getElementById('personaSelect').value = active.preferredPersona;
    }
  } else {
    speakerBadge.textContent = '👤 Chưa rõ tên';
  }

  const listEl = document.getElementById('familyList');
  if (familyState.members.length === 0) {
    listEl.innerHTML = '<div style="color:#94a3b8;font-size:11px;">Chưa lưu thành viên nào. Hãy trò chuyện để Bot tự hỏi tên và ghi nhớ!</div>';
    return;
  }

  listEl.innerHTML = '';
  familyState.members.forEach(m => {
    const isAct = m.id === familyState.activeMemberId;
    const pObj = ROBOT_PERSONAS.find(p => p.id === m.preferredPersona) || ROBOT_PERSONAS[0];
    const card = document.createElement('div');
    card.className = 'member-card' + (isAct ? ' active' : '');
    card.innerHTML = `
      <div class="member-info" onclick="switchActiveMember('${m.id}')" style="cursor:pointer;flex:1;">
        <b>${escapeHtml(m.name)}</b> • ${m.age || '?'} tuổi • ${escapeHtml(m.familyRole || 'Thành viên')}
        <div class="member-sub">Vai trò: ${pObj.icon} ${pObj.id} • Đã nói: ${m.chatCount || 0} lượt</div>
      </div>
      <div style="display:flex;gap:4px;">
        <button class="btn-sm ${isAct ? 'green' : 'gray'}" onclick="switchActiveMember('${m.id}')">${isAct ? 'Đang nói' : 'Chọn'}</button>
        <button class="btn-sm red" onclick="deleteMember('${m.id}')">✕</button>
      </div>
    `;
    listEl.appendChild(card);
  });
}

function onSpeakerSelectChange() {
  const val = document.getElementById('speakerSelect').value;
  if (!val) {
    startNewPersonGreeting();
  } else {
    switchActiveMember(val);
  }
}

function switchActiveMember(memberId) {
  familyState.activeMemberId = memberId;
  awaitingUserName = false;
  saveFamilyMemory();
  const m = getActiveMember();
  if (m) {
    const greet = `Welcome back, ${m.name}! What would you like to talk about today?`;
    addBubble(greet, 'bot', `Đã nhận diện thành viên: ${m.name} (${m.age || '?'} tuổi)`, 'HAPPY_EXCITED');
    speakEnglishWithRealTimeEmotion(greet, 'HAPPY_EXCITED');
  }
}

function startNewPersonGreeting() {
  familyState.activeMemberId = null;
  awaitingUserName = true;
  saveFamilyMemory();
  const promptAsk = "Hello! I am Robot 2027. What is your name?";
  addBubble(promptAsk, 'bot', '🤖 Bot chủ động chào & hỏi danh tính', 'CURIOUS_TILT');
  speakEnglishWithRealTimeEmotion(promptAsk, 'CURIOUS_TILT');
}

function manualAddMember() {
  const name = document.getElementById('newMemberName').value.trim();
  const age = parseInt(document.getElementById('newMemberAge').value || '6', 10);
  if (!name) return;

  upsertFamilyMember(name, age, 'Thành viên');
  document.getElementById('newMemberName').value = '';
  document.getElementById('newMemberAge').value = '';
  toggleDrawer('familyDrawer');
}

function deleteMember(id) {
  familyState.members = familyState.members.filter(m => m.id !== id);
  if (familyState.activeMemberId === id) {
    familyState.activeMemberId = familyState.members[0]?.id || null;
  }
  saveFamilyMemory();
}

function upsertFamilyMember(name, age = null, familyRole = null) {
  const cleanName = name.charAt(0).toUpperCase() + name.slice(1);
  let existing = familyState.members.find(m => m.name.toLowerCase() === cleanName.toLowerCase());

  if (existing) {
    if (age) existing.age = age;
    if (familyRole) existing.familyRole = familyRole;
    existing.lastSeen = new Date().toISOString();
    familyState.activeMemberId = existing.id;
    saveFamilyMemory();
    return { member: existing, isNew: false };
  }

  let inferredRole = familyRole || 'Child';
  let inferredAge = age || 6;
  const lower = cleanName.toLowerCase();
  if (['dad', 'father', 'bố', 'ba'].includes(lower)) {
    inferredRole = 'Parent (Dad)';
    inferredAge = age || 35;
  } else if (['mom', 'mother', 'mẹ', 'má'].includes(lower)) {
    inferredRole = 'Parent (Mom)';
    inferredAge = age || 33;
  } else if (['grandma', 'grandpa', 'ông', 'bà'].includes(lower)) {
    inferredRole = 'Grandparent';
    inferredAge = age || 65;
  }

  const newMember = {
    id: 'mem_' + Date.now(),
    name: cleanName,
    age: inferredAge,
    familyRole: inferredRole,
    preferredPersona: document.getElementById('personaSelect').value || 'ENGLISH_TEACHER',
    chatCount: 1,
    lastSeen: new Date().toISOString()
  };

  familyState.members.push(newMember);
  familyState.activeMemberId = newMember.id;
  saveFamilyMemory();
  return { member: newMember, isNew: true };
}

function extractIdentityFromSpeech(text) {
  const clean = text.trim();
  let detectedName = null;
  let detectedAge = null;

  const ageMatch = clean.match(/(?:i am|i'm|age|is)\s+(\d{1,2})/i) || clean.match(/(\d{1,2})\s+years?\s+old/i);
  if (ageMatch) {
    detectedAge = parseInt(ageMatch[1], 10);
  }

  const namePatterns = [
    /(?:my name is|my name's|call me|this is|it is|it's)\s+([a-zA-ZÀ-ỹ]{2,15})/i,
    /(?:i am|i'm)\s+([a-zA-ZÀ-ỹ]{2,15})/i
  ];

  const ignoredWords = new Set([
    'a', 'an', 'the', 'good', 'fine', 'happy', 'sad', 'tired', 'hungry', 'ready', 'free',
    'here', 'back', 'sorry', 'playing', 'studying', 'learning', 'six', 'seven', 'eight', 'five', 'old'
  ]);

  for (const pat of namePatterns) {
    const m = clean.match(pat);
    if (m && m[1] && !ignoredWords.has(m[1].toLowerCase())) {
      detectedName = m[1];
      break;
    }
  }

  if (!detectedName && awaitingUserName) {
    const words = clean.replace(/[^a-zA-ZÀ-ỹ\s]/g, '').trim().split(/\s+/);
    if (words.length >= 1 && words.length <= 2 && !ignoredWords.has(words[0].toLowerCase())) {
      detectedName = words[words.length - 1];
    }
  }

  if (detectedName) {
    awaitingUserName = false;
    return upsertFamilyMember(detectedName, detectedAge);
  }
  return null;
}

function getSyncEndpointUrl() {
  const chatUrl = document.getElementById('backendUrlInput').value.trim();
  return chatUrl.replace(/api_chat\.php.*$/i, 'api_sync.php');
}

async function syncFamilyToCloud() {
  try {
    const res = await fetch(getSyncEndpointUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'sync_family',
        bot_id: 'BOT_VN_001',
        family_members: familyState.members
      })
    });
    const data = await res.json();
    if (data.status === 'ok') {
      addBubble(`☁️ Đã lưu <b>${data.saved_count}</b> thành viên gia đình lên Cloud (${getSyncEndpointUrl()})!`, 'sys');
    } else {
      addBubble(`⚠️ Lỗi Sync Cloud: ${data.message || 'Không rõ'}`, 'sys');
    }
  } catch (e) {
    addBubble(`⚠️ Không kết nối được Cloud Sync: ${e.message}`, 'sys');
  }
}

async function loadFamilyFromCloud() {
  try {
    const res = await fetch(getSyncEndpointUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'get_family',
        bot_id: 'BOT_VN_001'
      })
    });
    const data = await res.json();
    if (data.status === 'ok' && Array.isArray(data.family_members)) {
      familyState.members = data.family_members;
      if (familyState.members.length > 0 && !familyState.activeMemberId) {
        familyState.activeMemberId = familyState.members[0].id;
      }
      saveFamilyMemory();
      addBubble(`📥 Đã khôi phục <b>${data.family_members.length}</b> thành viên gia đình từ Cloud!`, 'sys');
    } else {
      addBubble(`⚠️ Chưa có dữ liệu gia đình trên Cloud hoặc lỗi: ${data.message || ''}`, 'sys');
    }
  } catch (e) {
    addBubble(`⚠️ Không tải được từ Cloud: ${e.message}`, 'sys');
  }
}

function exportFamilySyncJson() {
  const pre = document.getElementById('syncJsonPreview');
  if (pre.style.display === 'block') {
    pre.style.display = 'none';
    return;
  }
  const syncPayload = {
    bot_id: 'BOT_VN_001',
    synced_at: new Date().toISOString(),
    family_members: familyState.members
  };
  pre.textContent = JSON.stringify(syncPayload, null, 2);
  pre.style.display = 'block';
}

// =========================================================================
// 5. KHỞI TẠO APP, TẢI MODEL <= 100 MB & GỬI TIN NHẮN
// =========================================================================
function dismissSetupModal() {
  localStorage.setItem('robot2027_dismissed_modal_v22', '1');
  document.getElementById('setupModal').classList.remove('show');
}

function acceptDownloadFromModal() {
  document.getElementById('setupModal').classList.remove('show');
  toggleDrawer('modelDrawer');
  startDownloadModel();
}

function onPresetChange() {
  const val = document.getElementById('modelPresetSelect').value;
  const parts = val.split('|');
  if (parts[1]) {
    document.getElementById('modelUrlInput').value = parts[1];
  }
}

async function initAppStartup() {
  updateNetworkBadge();
  initPersonasDropdown();
  loadFamilyMemory();
  startBiologicalFaceLoop();

  const savedUrl = localStorage.getItem('robot_backend_url_v22');
  if (savedUrl) document.getElementById('backendUrlInput').value = savedUrl;
  const savedTier = localStorage.getItem('robot_tier');
  if (savedTier) document.getElementById('tierSelect').value = savedTier;

  // Đăng ký lắng nghe sự kiện từ Native SpeechBridge (Micro + TTS)
  const SpeechBridge = getSpeechBridge();
  if (SpeechBridge) {
    try {
      await SpeechBridge.requestMicPermission();
    } catch (e) {}

    SpeechBridge.addListener('speechPartial', (info) => {
      if (info && info.text) {
        document.getElementById('textInput').value = info.text;
        document.getElementById('micLiveText').textContent = '🎙️ Đang nghe: ' + info.text;
      }
    });

    SpeechBridge.addListener('speechResult', (info) => {
      setMicVisual(false);
      if (info && info.text && info.text.trim()) {
        document.getElementById('textInput').value = info.text.trim();
        sendChat();
      } else {
        setFaceState('IDLE_ALIVE', false);
      }
    });

    SpeechBridge.addListener('speechError', (info) => {
      setMicVisual(false);
      setFaceState('IDLE_ALIVE', false);
      if (info && info.message) {
        addBubble(`🎙️ ${info.message}`, 'sys');
      }
    });
  }

  const LocalLLM = getNativeLLM();
  if (LocalLLM) {
    LocalLLM.addListener('downloadProgress', (info) => {
      const wrap = document.getElementById('progressWrap');
      const bar = document.getElementById('progressBar');
      const txt = document.getElementById('downloadText');
      wrap.style.display = 'block';
      bar.style.width = (info.percent || 0) + '%';
      txt.textContent = `Đang tải: ${info.downloadedMB} MB / ${info.totalMB} MB (${info.percent}%)`;
    });

    try {
      const check = await LocalLLM.checkModels();
      if (check.models && check.models.length > 0) {
        const preferred = localStorage.getItem('robot_active_model');
        const found = check.models.find(m => m.name === preferred) || check.models[0];
        await loadLocalModelFile(found.name, true);
      } else {
        statusEl.className = 'pill warn';
        statusEl.textContent = '📦 Chưa tải AI';
        if (!localStorage.getItem('robot2027_dismissed_modal_v22')) {
          document.getElementById('setupModal').classList.add('show');
        }
      }
    } catch (e) {
      console.warn('checkModels err:', e);
    }
  } else {
    statusEl.className = 'pill warn';
    statusEl.textContent = '🌐 Web Mode';
  }

  const active = getActiveMember();
  if (active) {
    const welcome = `Hello ${active.name}! I am Robot 2027. Ready to chat in English?`;
    addBubble(welcome, 'bot', `Đã nhận diện: ${active.name} (${active.age} tuổi)`, 'HAPPY_EXCITED');
  } else {
    awaitingUserName = true;
    const askName = "Hello! I am Robot 2027. What is your name?";
    addBubble(askName, 'bot', '🤖 Bot chủ động chào & hỏi tên người dùng mới', 'CURIOUS_TILT');
  }
}

async function startDownloadModel() {
  const LocalLLM = getNativeLLM();
  if (!LocalLLM) {
    alert('Tính năng tải Model C++ chỉ chạy khi cài file APK trên điện thoại Android!');
    return;
  }

  const url = document.getElementById('modelUrlInput').value.trim();
  if (!url) return;

  let fileName = url.split('/').pop().split('?')[0];
  if (!fileName.endsWith('.gguf')) fileName = 'brain_local.gguf';

  const btn = document.getElementById('btnDownloadModel');
  btn.disabled = true;
  btn.textContent = '⏳ Đang tải...';
  statusEl.className = 'pill warn';
  statusEl.textContent = '⬇️ Đang tải AI...';

  try {
    const res = await LocalLLM.downloadModel({ url, fileName });
    document.getElementById('downloadText').textContent = `Tải xong ${res.fileName} (${res.sizeMB} MB)! Đang nạp ARM SIMD...`;
    await loadLocalModelFile(res.fileName, false);
    toggleDrawer('modelDrawer');
  } catch (err) {
    statusEl.className = 'pill err';
    statusEl.textContent = '❌ Lỗi tải AI';
    document.getElementById('downloadText').textContent = 'Lỗi tải: ' + (err.message || JSON.stringify(err));
  } finally {
    btn.disabled = false;
    btn.textContent = '⬇️ Tải & Kích hoạt Model';
  }
}

async function loadLocalModelFile(fileName, silent = false) {
  const LocalLLM = getNativeLLM();
  statusEl.className = 'pill warn';
  statusEl.textContent = '⏳ Nạp C++...';
  const t0 = performance.now();

  await LocalLLM.loadModel({
    fileName: fileName,
    nCtx: 512,
    nThreads: 4
  });

  const ms = Math.round(performance.now() - t0);
  isModelReady = true;
  activeModelName = fileName;
  localStorage.setItem('robot_active_model', fileName);

  document.getElementById('modeSelect').value = 'API_PLUS_LLM';

  statusEl.className = 'pill ready';
  statusEl.textContent = '✅ ' + fileName.split('-')[0].toUpperCase();
  metricEl.textContent = `Nạp: ${ms} ms`;
  if (!silent) {
    addBubble(`✅ Đã tải & kích hoạt xong bộ não <b>${fileName}</b> (${ms} ms)!`, 'sys');
  }
}

function saveApiSettings() {
  localStorage.setItem('robot_backend_url_v22', document.getElementById('backendUrlInput').value.trim());
  localStorage.setItem('robot_tier', document.getElementById('tierSelect').value);
  toggleDrawer('apiDrawer');
  addBubble('Đã lưu cấu hình Server API.', 'sys');
}

function setQuickUrl(url) {
  document.getElementById('backendUrlInput').value = url;
  saveApiSettings();
}

async function callBackendApi(userText, member, personaObj) {
  const apiUrl = document.getElementById('backendUrlInput').value.trim();
  const payload = {
    bot_id: 'BOT_VN_001',
    member_name: member ? member.name : 'Friend',
    member_age: member ? (member.age || 6) : 6,
    persona: personaObj.backendRole,
    tier: document.getElementById('tierSelect').value,
    text: userText
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  const t0 = performance.now();
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const data = await response.json();
    const apiMs = Math.round(performance.now() - t0);

    const top = data.candidates && data.candidates[0];
    const fact = top ? (top.fact || '') : '';
    const followUp = top ? (top.follow_up || '') : '';
    const combined = `${fact} ${followUp}`.trim();

    return {
      ok: true,
      apiMs,
      topic: data.topic || 'general',
      anim: normalizeFaceState(data.anim || 'SPEAKING_CHEERFUL'),
      strict: !!data.strict,
      combined
    };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

function quickAsk(text) {
  document.getElementById('textInput').value = text;
  sendChat();
}

async function sendChat() {
  if (isGenerating) return;
  const inputEl = document.getElementById('textInput');
  const userText = inputEl.value.trim();
  if (!userText) return;

  inputEl.value = '';
  addBubble(userText, 'user');

  // Nhận diện cảm xúc ngay từ lời người dùng trong lúc Robot đang suy nghĩ
  const userEmotion = detectEmotionFromText(userText, 'THINKING_PONDER');
  setFaceState(userEmotion === 'EMPATHY_CARE' ? 'EMPATHY_CARE' : 'THINKING_PONDER', false);

  const identityResult = extractIdentityFromSpeech(userText);
  const switchedPersona = detectPersonaSwitchFromText(userText);

  const member = getActiveMember();
  if (member) {
    member.chatCount = (member.chatCount || 0) + 1;
    member.lastSeen = new Date().toISOString();
    saveFamilyMemory();
  }

  const personaObj = getActivePersonaObj();
  const mode = document.getElementById('modeSelect').value;
  const LocalLLM = getNativeLLM();
  const isOnline = updateNetworkBadge();

  isGenerating = true;

  try {
    if (identityResult && identityResult.isNew) {
      const m = identityResult.member;
      const welcomeNew = `Nice to meet you, ${m.name}! I saved you in my family memory. How can I help you today?`;
      addBubble(welcomeNew, 'bot', `🧠 Đã ghi nhớ thành viên mới: ${m.name} (${m.age} tuổi • ${m.familyRole})`, 'LOVE_WARM');
      await speakEnglishWithRealTimeEmotion(welcomeNew, 'LOVE_WARM');
      return;
    }

    if (switchedPersona && userText.split(' ').length <= 6) {
      const roleAck = `Okay${member ? ', ' + member.name : ''}! I am now your ${switchedPersona.label.split('(')[1]?.replace(')', '') || switchedPersona.id}. Let's start!`;
      addBubble(roleAck, 'bot', `🎭 Đã hóa thân: ${switchedPersona.icon} ${switchedPersona.id}`, 'HAPPY_EXCITED');
      await speakEnglishWithRealTimeEmotion(roleAck, 'HAPPY_EXCITED');
      return;
    }

    if (isOnline && mode !== 'OFFLINE_LLM') {
      try {
        const api = await callBackendApi(userText, member, personaObj);

        if (mode === 'API_DIRECT') {
          const reply = api.combined || "Beep boop! Can you say that again?";
          metricEl.textContent = `⚡ API: ${api.apiMs} ms`;
          addBubble(reply, 'bot', `🌐 Chế độ 1 (API) • Topic: ${api.topic} • ${api.apiMs} ms`, api.anim);
          await speakEnglishWithRealTimeEmotion(reply, api.anim);
          return;
        }

        if (mode === 'API_PLUS_LLM') {
          if (api.strict && api.combined) {
            metricEl.textContent = `⚡ STRICT: ${api.apiMs} ms`;
            addBubble(api.combined, 'bot', `🔒 STRICT MODE • ${api.apiMs} ms`, api.anim);
            await speakEnglishWithRealTimeEmotion(api.combined, api.anim);
            return;
          }

          if (LocalLLM && isModelReady) {
            const speakerInfo = member ? `${member.name} (age ${member.age})` : 'a friend';
            const sysPrompt = `You are Robot 2027 (${personaObj.style}) talking to ${speakerInfo}. Rephrase naturally in 1 short sentence: "${api.combined}"`;
            const chatML = `<|im_start|>system\n${sysPrompt}<|im_end|>\n<|im_start|>user\n${userText}<|im_end|>\n<|im_start|>assistant\n`;

            const tLlm = performance.now();
            const gen = await LocalLLM.generate({ prompt: chatML, maxTokens: 32 });
            const llmMs = Math.round(performance.now() - tLlm);

            let reply = cleanLlmOutput(gen.text) || api.combined;
            metricEl.textContent = `⚡ ${api.apiMs + llmMs} ms`;
            addBubble(reply, 'bot', `🌐+🧠 Chế độ 2 (API ${api.apiMs}ms + AI ${llmMs}ms) • ${personaObj.icon} ${personaObj.id}`, api.anim);
            await speakEnglishWithRealTimeEmotion(reply, api.anim);
            return;
          } else {
            const fallbackApi = api.combined || "Please download the <=100MB AI brain for smarter replies!";
            metricEl.textContent = `⚡ API: ${api.apiMs} ms`;
            addBubble(fallbackApi, 'bot', `🌐 Chưa tải Model -> Dùng thẳng API (${api.apiMs} ms)`, api.anim);
            await speakEnglishWithRealTimeEmotion(fallbackApi, api.anim);
            return;
          }
        }
      } catch (networkErr) {
        addBubble('⚠️ Server không phản hồi, chuyển sang dùng Bộ não AI trên máy...', 'sys');
      }
    }

    if (!LocalLLM || !isModelReady) {
      const warnMsg = '⚠️ Thiết bị đang <b>Offline</b> (hoặc mất kết nối Server) và chưa có <b>Bộ não AI</b>. Vui lòng bật mạng và bấm nút <b>🧠</b> ở góc trên để tải model &le; 100 MB!';
      addBubble(warnMsg, 'sys');
      setFaceState('IDLE_ALIVE', false);
      return;
    }

    const speakerInfo = member ? `${member.name} (age ${member.age}, ${member.familyRole})` : 'a new friend';
    const sysOffline = `You are Robot 2027 (${personaObj.style}) talking to ${speakerInfo}. Reply in 1 short, friendly English sentence.`;
    const chatML = `<|im_start|>system\n${sysOffline}<|im_end|>\n<|im_start|>user\n${userText}<|im_end|>\n<|im_start|>assistant\n`;

    const t0 = performance.now();
    const gen = await LocalLLM.generate({ prompt: chatML, maxTokens: 32 });
    const llmMs = Math.round(performance.now() - t0);

    let reply = cleanLlmOutput(gen.text) || "Beep boop! Tell me more!";
    const replyAnim = detectEmotionFromText(reply, 'SPEAKING_CHEERFUL');
    metricEl.textContent = `⚡ ${llmMs} ms`;
    addBubble(reply, 'bot', `📡 Offline AI (${activeModelName}) • ${personaObj.icon} ${personaObj.id} • ${llmMs} ms`, replyAnim);
    await speakEnglishWithRealTimeEmotion(reply, replyAnim);

  } finally {
    isGenerating = false;
  }
}

function cleanLlmOutput(raw) {
  if (!raw) return '';
  return raw
    .replace(/<\|im_end\|>/g, '')
    .replace(/<\|endoftext\|>/g, '')
    .replace(/^["']|["']$/g, '')
    .trim();
}

window.addEventListener('DOMContentLoaded', initAppStartup);
