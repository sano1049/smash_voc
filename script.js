// ------------------------------------------------------------
// VOC Smash デモ
// Google Places API から取得した店舗情報・口コミをもとに、
// チャットアンケートの質問を動的に生成します。
// ------------------------------------------------------------

const DEMO_DELAY = 1400; // ローディング演出時間（ms）
const BOT_THINK_MS = 450; // ボット返答の間（ms）
const STEP_PAUSE_MS = 350; // 選択肢表示までの間（ms）

// ダミー店舗データ（API が使えない場合のフォールバック）
const DUMMY_STORES = [
  { name: "カフェ ブルー", rating: 4.2, reviews: [] },
  { name: "Burger Stand", rating: 3.9, reviews: [{ text: "接客が雑な印象", rating: 2 }] },
  { name: "寿司 海音", rating: 4.5, reviews: [{ text: "ネタが新鮮で雰囲気も良い", rating: 5 }] },
  { name: "Salon de Miel", rating: 4.7, reviews: [{ text: "スタッフの対応が丁寧", rating: 5 }] },
  { name: "中華料理 龍門", rating: 3.7, reviews: [{ text: "価格が安くて量も多い", rating: 4 }] },
];

/**
 * ローカルプロキシ経由で Google Places API から店舗情報を取得する。
 * @param {string} url
 */
async function fetchStoreInfo(url) {
  const response = await fetch(`/api/place?url=${encodeURIComponent(url)}`);
  if (!response.ok) {
    throw new Error("Failed to fetch store info");
  }
  return await response.json();
}

// ------------------------------------------------------------
// カテゴリ判定
// ------------------------------------------------------------
const CATEGORY_RULES = [
  {
    id: "food",
    label: "飲食",
    keywords: ["restaurant", "cafe", "bar", "bakery", "meal_takeaway", "meal_delivery", "food"],
  },
  {
    id: "retail",
    label: "小売",
    keywords: ["store", "shopping_mall", "supermarket", "convenience_store", "clothing_store", "electronics_store", "home_goods_store", "book_store", "jewelry_store", "shoe_store", "department_store", "furniture_store"],
  },
  {
    id: "service",
    label: "サービス業",
    keywords: ["beauty_salon", "hair_care", "spa", "gym", "health", "dentist", "doctor", "hospital", "bank", "atm", "post_office", "lodging", "travel_agency", "real_estate", "insurance_agency", "lawyer"],
  },
];

function detectCategory(types) {
  if (!types || !types.length) return "other";
  for (const rule of CATEGORY_RULES) {
    if (types.some((t) => rule.keywords.includes(t))) {
      return rule.id;
    }
  }
  return "other";
}

// ------------------------------------------------------------
// 口コミ解析＆動的質問生成
// ------------------------------------------------------------
const TOPIC_KEYWORDS = {
  接客: ["接客", "スタッフ", "対応", "丁寧", "雑", "愛想", "笑顔"],
  料理のクオリティ: ["料理", "味", "美味", "不味", "クオリティ", "ネタ", "新鮮"],
  雰囲気: ["雰囲気", "内装", "落ち着く", "きれい", "オシャレ", "店内"],
  価格: ["価格", "値段", "高い", "安い", "コスパ", "量", "満足"],
  待ち時間: ["待ち", "混雑", "予約", "行列", "遅い", "スムーズ"],
  商品の品質: ["品質", "商品", "素材", "使い心地", "デザイン", "機能"],
  品揃え: ["品揃え", "種類", "在庫", "取り扱い", "ラインナップ"],
  施設の清潔さ: ["清潔", "綺麗", "汚い", "衛生", "臭い", "快適"],
  技術・仕上がり: ["技術", "仕上がり", "カット", "施術", "診察", "アドバイス"],
};

const CATEGORY_FLOWS = {
  food: {
    purposeQuestion: "本日の来店目的を教えてください。",
    purposeChoices: ["ランチ", "ディナー", "打ち合わせ・作業", "友人・家族と"],
    satisfactionLabel: "ご来店の感想",
    improveDefaults: ["接客", "料理のクオリティ", "店内環境", "価格", "特になし"],
  },
  retail: {
    purposeQuestion: "本日のご来店の目的を教えてください。",
    purposeChoices: ["自分用に購入", "ギフト", "見て回る", "予約・取り置き"],
    satisfactionLabel: "ご来店の感想",
    improveDefaults: ["接客", "商品の品質", "品揃え", "価格", "特になし"],
  },
  service: {
    purposeQuestion: "本日のご利用の目的を教えてください。",
    purposeChoices: ["初回利用", "定期利用", "相談", "ケア・メンテナンス"],
    satisfactionLabel: "サービスの感想",
    improveDefaults: ["接客", "技術・仕上がり", "施設の清潔さ", "価格", "特になし"],
  },
  other: {
    purposeQuestion: "本日のご来店の目的を教えてください。",
    purposeChoices: ["初めて来店", "定期利用", "友人・家族と", "その他"],
    satisfactionLabel: "ご利用の感想",
    improveDefaults: ["接客", "雰囲気", "価格", "待ち時間", "特になし"],
  },
};

function detectTopics(reviews) {
  const text = reviews.map((r) => r.text).join(" ");
  const scores = {};
  for (const [topic, words] of Object.entries(TOPIC_KEYWORDS)) {
    scores[topic] = words.reduce((sum, word) => {
      const regex = new RegExp(word, "gi");
      const matches = text.match(regex);
      return sum + (matches ? matches.length : 0);
    }, 0);
  }
  return Object.entries(scores)
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([topic]) => topic);
}

function buildChatFlow(info) {
  const { name, rating, reviews, types } = info;
  const category = detectCategory(types || []);
  const flow = CATEGORY_FLOWS[category];
  const topics = detectTopics(reviews || []);
  const topTopic = topics[0] || "雰囲気";
  const isHighRated = rating != null && rating >= 4.3;
  const isLowRated = rating != null && rating <= 3.9;

  const secondStep = isHighRated
    ? {
        text: `高評価の口コミが多いこのお店。\nあなたが期待するポイントは何ですか？`,
        choices: uniqueChoices([topTopic, ...flow.improveDefaults.slice(0, 3)]),
      }
    : isLowRated
    ? {
        text: `改善の声も見られるこのお店。\n気にしてほしい点は何ですか？`,
        choices: uniqueChoices([topTopic, ...flow.improveDefaults.slice(0, 3)]),
      }
    : {
        text: "ありがとうございます。\nお店を選んだ理由は何ですか？",
        choices: ["口コミが良かった", "近くにあった", "雰囲気が好き", "価格が安い"],
      };

  const improveChoices = topics.length
    ? uniqueChoices([...topics.slice(0, 2), ...flow.improveDefaults])
    : flow.improveDefaults;

  return [
    {
      type: "bot",
      text: `{storeName}へようこそ！\n${flow.purposeQuestion}`,
      choices: flow.purposeChoices,
    },
    { type: "bot", ...secondStep },
    {
      type: "bot",
      text: `${flow.satisfactionLabel}をお聞かせください。`,
      choices: ["とても満足", "まあまあ満足", "やや不満", "かなり不満"],
    },
    {
      type: "bot",
      text: "改善してほしい点はありますか？（任意）",
      choices: improveChoices,
    },
    {
      type: "bot",
      text: "このアンケートはいかがでしたか？",
      choices: ["テンポが良い", "普通", "もう少し短く", "分かりやすい"],
    },
    {
      type: "final",
      text: "実際の VOC Smash では、\n口コミや店舗特性に合わせて質問が自動で最適化されます。",
    },
  ];
}

function uniqueChoices(items) {
  return [...new Set(items)].slice(0, 4);
}

// ------------------------------------------------------------
// DOM 要素
// ------------------------------------------------------------
const demoForm = document.getElementById("demo-form");
const mapUrlInput = document.getElementById("map-url");
const loading = document.getElementById("loading");
const chatApp = document.getElementById("chat-app");
const storeNameEl = document.getElementById("store-name");
const storeRatingEl = document.getElementById("store-rating");
const chatBody = document.getElementById("chat-body");
const chatChoices = document.getElementById("chat-choices");

let currentStep = 0;
let storeInfo = null;
let CHAT_FLOW = [];

// ------------------------------------------------------------
// イベントハンドラ
// ------------------------------------------------------------
demoForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const url = mapUrlInput.value.trim();
  if (!url) return;

  resetDemo();
  setLoading(true);

  try {
    storeInfo = await fetchStoreInfo(url);
  } catch (err) {
    // API が使えない場合はダミーデータでフォールバック
    const index = url.length % DUMMY_STORES.length;
    storeInfo = { ...DUMMY_STORES[index] };
  }

  setLoading(false);
  initChat(storeInfo);
});

// ------------------------------------------------------------
// ユーティリティ
// ------------------------------------------------------------
function resetDemo() {
  currentStep = 0;
  CHAT_FLOW = [];
  chatBody.innerHTML = "";
  chatChoices.innerHTML = "";
  chatApp.hidden = true;
}

function setLoading(isLoading) {
  loading.hidden = !isLoading;
  demoForm.querySelector("button").disabled = isLoading;
  mapUrlInput.disabled = isLoading;
}

function initChat(info) {
  storeInfo = info;
  CHAT_FLOW = buildChatFlow(info);
  storeNameEl.textContent = info.name;
  storeRatingEl.textContent = info.rating != null ? `★ ${info.rating.toFixed(1)}` : "★ -";
  chatApp.hidden = false;
  chatApp.scrollIntoView({ behavior: "smooth", block: "start" });

  renderStep(0);
}

function interpolate(text, info) {
  return text.replace(/{storeName}/g, info.name);
}

async function renderStep(index) {
  currentStep = index;
  const step = CHAT_FLOW[index];
  if (!step) return;

  // 以前の選択肢を無効化
  disableChoices();

  if (step.type === "bot") {
    await wait(BOT_THINK_MS);
    addMessage("bot", interpolate(step.text, storeInfo));
    await wait(STEP_PAUSE_MS);
    renderChoices(step.choices);
    scrollToBottom();
  } else if (step.type === "final") {
    await wait(BOT_THINK_MS);
    addFinalCard(interpolate(step.text, storeInfo));
    scrollToBottom();
  }
}

function addMessage(sender, text) {
  const wrapper = document.createElement("div");
  wrapper.className = `message ${sender}`;
  const p = document.createElement("p");
  p.textContent = text;
  wrapper.appendChild(p);
  chatBody.appendChild(wrapper);
  scrollToBottom();
}

function renderChoices(choices) {
  chatChoices.innerHTML = "";
  choices.forEach((label) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "choice";
    btn.textContent = label;
    btn.addEventListener("click", () => handleChoice(label));
    chatChoices.appendChild(btn);
  });
}

function disableChoices() {
  const buttons = chatChoices.querySelectorAll("button");
  buttons.forEach((btn) => (btn.disabled = true));
}

async function handleChoice(label) {
  addMessage("user", label);
  chatChoices.innerHTML = "";
  await wait(STEP_PAUSE_MS);
  renderStep(currentStep + 1);
}

function addFinalCard(text) {
  const card = document.createElement("div");
  card.className = "final-card";

  const p = document.createElement("p");
  p.textContent = text;
  card.appendChild(p);

  const cta = document.createElement("a");
  cta.href = "#";
  cta.className = "btn btn-primary";
  cta.textContent = "無料で試す";
  cta.addEventListener("click", (e) => {
    e.preventDefault();
    alert("ここから本登録フローへ繋がります（デモ）");
  });
  card.appendChild(cta);

  chatBody.appendChild(card);
}

function scrollToBottom() {
  chatBody.scrollTop = chatBody.scrollHeight;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
