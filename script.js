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
    id: "confectionery",
    label: "洋菓子店",
    keywords: ["bakery", "pastry_shop", "dessert_shop", "cake_shop", "confectionery"],
  },
  {
    id: "food",
    label: "飲食",
    keywords: ["restaurant", "cafe", "bar", "meal_takeaway", "meal_delivery", "food"],
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

const CATEGORY_LABELS = Object.fromEntries(
  CATEGORY_RULES.map((rule) => [rule.id, rule.label]).concat([["other", "その他"]])
);

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

const POSITIVE_WORDS = {
  接客: ["丁寧", "親切", "優しい", "笑顔", "気遣い", "感じが良い"],
  料理のクオリティ: ["美味", "美味しい", "絶品", "新鮮", "満足", "最高"],
  雰囲気: ["落ち着く", "きれい", "オシャレ", "素敵", "居心地", "静か"],
  価格: ["安い", "コスパ", "お得", "リーズナブル", "満足"],
  待ち時間: ["早い", "スムーズ", "待たない", "効率", "すぐ"],
  商品の品質: ["良い", "高品質", "丈夫", "使いやすい", "満足"],
  品揃え: ["豊富", "揃う", "充実", "色々", "見応え"],
  施設の清潔さ: ["清潔", "綺麗", "衛生的", "快適", "心地良い"],
  技術・仕上がり: ["上手", "丁寧", "満足", "仕上がりが良い", "的確"],
};

const NEGATIVE_WORDS = {
  接客: ["雑", "無愛想", "冷たい", "態度", "悪い", "無視"],
  料理のクオリティ: ["不味", "美味しくない", "冷たい", "硬い", "残念", "微妙"],
  雰囲気: ["うるさい", "暗い", "汚い", "古い", "狭い", "騒がしい"],
  価格: ["高い", "高すぎ", "割高", "コスパ悪い", "もったいない"],
  待ち時間: ["遅い", "待たされる", "混雑", "行列", "時間がかかる"],
  商品の品質: ["悪い", "低品質", "壊れ", "使いにくい", "残念"],
  品揃え: ["少ない", "ない", "品薄", "偏り", "物足りない"],
  施設の清潔さ: ["汚い", "不潔", "臭い", "埃", "雑"],
  技術・仕上がり: ["下手", "雑", "満足できない", "失敗", "不安"],
};

const CATEGORY_FLOWS = {
  confectionery: {
    purposeQuestion: "本日の来店目的を教えてください。",
    purposeChoices: ["自分用に購入", "ギフト", "テイクアウト", "友人・家族と"],
    satisfactionLabel: "ご来店の感想",
    improveDefaults: ["接客", "味", "見た目", "価格", "特になし"],
  },
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

const CATEGORY_TOPICS = {
  confectionery: ["接客", "料理のクオリティ", "雰囲気", "価格", "待ち時間"],
  food: ["接客", "料理のクオリティ", "雰囲気", "価格", "待ち時間"],
  retail: ["接客", "商品の品質", "品揃え", "価格", "待ち時間"],
  service: ["接客", "技術・仕上がり", "施設の清潔さ", "価格", "待ち時間"],
  other: ["接客", "雰囲気", "価格", "待ち時間"],
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

function analyzeReviewSentiment(reviews) {
  const positives = [];
  const negatives = [];

  for (const [topic, words] of Object.entries(TOPIC_KEYWORDS)) {
    const posWords = POSITIVE_WORDS[topic] || [];
    const negWords = NEGATIVE_WORDS[topic] || [];
    let posCount = 0;
    let negCount = 0;

    for (const review of reviews) {
      const text = review.text || "";
      if (!words.some((w) => text.includes(w))) continue;

      if (posWords.some((w) => text.includes(w))) {
        posCount++;
      }
      if (negWords.some((w) => text.includes(w))) {
        negCount++;
      }
    }

    if (posCount > 0) positives.push({ topic, count: posCount });
    if (negCount > 0) negatives.push({ topic, count: negCount });
  }

  positives.sort((a, b) => b.count - a.count);
  negatives.sort((a, b) => b.count - a.count);

  return { positives, negatives };
}

function formatPriceLevel(priceLevel) {
  const labels = { 0: "無料", 1: "安価", 2: "お手頃", 3: "やや高め", 4: "高級" };
  return labels[priceLevel] || "";
}

function priceLevelChoices(priceLevel) {
  const expensive = priceLevel >= 3;
  return expensive
    ? ["価格に見合っている", "もう少し安いと嬉しい", "高いと感じた", "特に気にしない"]
    : ["コスパが良い", "価格に見合っている", "もう少し安いと嬉しい", "特に気にしない"];
}

function buildChatFlow(info) {
  const { name, rating, reviews, types, priceLevel } = info;
  const category = detectCategory(types || []);
  const flow = CATEGORY_FLOWS[category];
  const allowedTopics = CATEGORY_TOPICS[category] || Object.keys(TOPIC_KEYWORDS);
  const topics = detectTopics(reviews || []).filter((t) => allowedTopics.includes(t));
  const sentiment = analyzeReviewSentiment(reviews || []);
  const positiveTopics = sentiment.positives
    .filter((p) => allowedTopics.includes(p.topic))
    .map((p) => p.topic);
  const negativeTopics = sentiment.negatives
    .filter((n) => allowedTopics.includes(n.topic))
    .map((n) => n.topic);
  const topTopic = topics[0] || flow.improveDefaults[0];
  const isHighRated = rating != null && rating >= 4.3;
  const isLowRated = rating != null && rating <= 3.9;
  const hasPriceLevel = priceLevel != null;

  let secondStep;
  if (isHighRated && positiveTopics.length) {
    const praise = positiveTopics.slice(0, 2).join("・");
    secondStep = {
      text: `口コミでも「${praise}」が評価されているこのお店。\nあなたが期待するポイントは何ですか？`,
      choices: uniqueChoices([topTopic, ...flow.improveDefaults.slice(0, 3)]),
    };
  } else if (isLowRated && negativeTopics.length) {
    const concern = negativeTopics.slice(0, 2).join("・");
    secondStep = {
      text: `口コミで「${concern}」の声もあるこのお店。\n気にしてほしい点は何ですか？`,
      choices: uniqueChoices([topTopic, ...flow.improveDefaults.slice(0, 3)]),
    };
  } else {
    secondStep = {
      text: "ありがとうございます。\nお店を選んだ理由は何ですか？",
      choices: ["口コミが良かった", "近くにあった", "雰囲気が好き", "価格が安い"],
    };
  }

  const improveChoices = topics.length
    ? uniqueChoices([...topics.slice(0, 2), ...flow.improveDefaults])
    : flow.improveDefaults;

  const steps = [
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
  ];

  if (hasPriceLevel) {
    const priceLabel = formatPriceLevel(priceLevel);
    steps.push({
      type: "bot",
      text: `Googleマップでは価格帯が「${priceLabel}」となっています。\n実際の価格についてはいかがでしたか？`,
      choices: priceLevelChoices(priceLevel),
    });
  }

  steps.push(
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
    }
  );

  return steps;
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
const storeCategoryEl = document.getElementById("store-category");
const storeRatingEl = document.getElementById("store-rating");
const storePriceLevelEl = document.getElementById("store-price-level");
const chatBody = document.getElementById("chat-body");
const chatChoices = document.getElementById("chat-choices");

let currentStep = 0;
let storeInfo = null;
let CHAT_FLOW = [];
let botMood = "happy";

const MOOD_CHOICES = {
  happy: ["とても満足", "まあまあ満足", "テンポが良い", "分かりやすい"],
  sad: ["かなり不満", "やや不満", "もう少し短く"],
};

function moodForChoice(label) {
  if (MOOD_CHOICES.happy.includes(label)) return "happy";
  if (MOOD_CHOICES.sad.includes(label)) return "sad";
  return null;
}

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
  const category = detectCategory(info.types || []);
  storeNameEl.textContent = info.name;
  storeCategoryEl.textContent = CATEGORY_LABELS[category] || "その他";
  storeRatingEl.textContent = info.rating != null ? `★ ${info.rating.toFixed(1)}` : "★ -";
  storePriceLevelEl.textContent = formatPriceLevel(info.priceLevel) || "";
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
    addMessage("bot", interpolate(step.text, storeInfo), botMood);
    await wait(STEP_PAUSE_MS);
    renderChoices(step.choices);
    scrollToBottom();
  } else if (step.type === "final") {
    await wait(BOT_THINK_MS);
    addFinalCard(interpolate(step.text, storeInfo));
    scrollToBottom();
  }
}

function addMessage(sender, text, mood = "neutral") {
  const row = document.createElement("div");
  row.className = `message-row ${sender}`;

  if (sender === "bot" && mood && mood !== "neutral") {
    const img = document.createElement("img");
    img.src = `images/${mood}.png`;
    img.alt = mood === "happy" ? "どうぞ" : "かなしい";
    img.className = "avatar";
    row.appendChild(img);
  }

  const bubble = document.createElement("div");
  bubble.className = `message ${sender}`;
  const p = document.createElement("p");
  p.textContent = text;
  bubble.appendChild(p);

  row.appendChild(bubble);
  chatBody.appendChild(row);
  scrollToBottom();
}

async function handleChoice(label) {
  addMessage("user", label);
  const nextMood = moodForChoice(label);
  if (nextMood) botMood = nextMood;
  chatChoices.innerHTML = "";
  await wait(STEP_PAUSE_MS);
  renderStep(currentStep + 1);
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
