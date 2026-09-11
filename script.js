// ------------------------------------------------------------
// VOC Smash デモ
// Google Places API から取得した店舗情報・口コミをもとに、
// チャットアンケートの質問を動的に生成します。
// ------------------------------------------------------------

const DEMO_DELAY = 1400; // ローディング演出時間（ms）
const BOT_THINK_MS = 700; // ボット返答の間（ms）
const STEP_PAUSE_MS = 460; // 選択肢表示までの間（ms）

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
    id: "hospital",
    label: "病院・医療機関",
    keywords: ["hospital", "doctor", "dentist", "medical_lab", "physiotherapist"],
  },
  {
    id: "bank",
    label: "銀行",
    keywords: ["bank", "atm"],
  },
  {
    id: "gym",
    label: "フィットネスジム",
    keywords: ["gym", "fitness_center"],
  },
  {
    id: "hair_care",
    label: "美容院・理髪店",
    keywords: ["hair_care", "beauty_salon"],
  },
  {
    id: "lodging",
    label: "宿泊施設",
    keywords: ["lodging", "hotel", "motel", "guest_house", "hostel", "resort"],
  },
  {
    id: "tourist_attraction",
    label: "観光名所",
    keywords: ["tourist_attraction", "landmark", "museum", "park", "amusement_park", "zoo", "aquarium"],
  },
  {
    id: "supermarket",
    label: "スーパーマーケット",
    keywords: ["supermarket"],
  },
  {
    id: "shopping_mall",
    label: "ショッピングモール",
    keywords: ["shopping_mall"],
  },
  {
    id: "convenience_store",
    label: "コンビニエンスストア",
    keywords: ["convenience_store"],
  },
  {
    id: "retail",
    label: "小売",
    keywords: ["store", "clothing_store", "electronics_store", "home_goods_store", "book_store", "jewelry_store", "shoe_store", "department_store", "furniture_store"],
  },
  {
    id: "service",
    label: "サービス業",
    keywords: ["spa", "health", "post_office", "travel_agency", "real_estate", "insurance_agency", "lawyer"],
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
  院内の清潔さ: ["清潔", "綺麗", "院内", "衛生", "消毒", "臭い"],
  説明のわかりやすさ: ["説明", "わかりやすい", "分かりやす", "納得", "不安"],
  予約のしやすさ: ["予約", "取りやすい", "取れない", "電話", "ネット"],
  店舗の利便性: ["利便性", "近い", "アクセス", "営業時間", "駐車場"],
  設備の充実度: ["設備", "機材", "充実", "新しい", "整う", "少ない"],
  混雑具合: ["混雑", "空いている", "人が多い", "静か", "にぎやか", "込む"],
  店内の雰囲気: ["雰囲気", "内装", "落ち着く", "オシャレ", "清潔", "店内"],
  "客室・設備": ["客室", "部屋", "設備", "ベッド", "アメニティ", "広い"],
  食事: ["食事", "朝食", "夕食", "美味", "バイキング", "メニュー"],
  アクセス: ["アクセス", "駅", "バス", "近い", "遠い", "駐車場"],
  案内・表示: ["案内", "表示", "看板", "分かりやすい", "地図", "案内所"],
  店内の動線: ["動線", "棚", "レジ", "通路", "買い物", "分かりやすい"],
  施設の使いやすさ: ["使いやすさ", "案内", "エレベーター", "トイレ", "ベンチ", "休憩"],
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
  院内の清潔さ: ["清潔", "綺麗", "衛生的", "快適", "心地良い"],
  説明のわかりやすさ: ["わかりやすい", "丁寧", "納得", "安心"],
  予約のしやすさ: ["取りやすい", "スムーズ", "便利"],
  店舗の利便性: ["近い", "便利", "駐車場", "アクセス"],
  設備の充実度: ["充実", "新しい", "整う", "豊富"],
  混雑具合: ["空いている", "静か", "快適", "ゆっくり"],
  店内の雰囲気: ["落ち着く", "オシャレ", "きれい", "居心地"],
  "客室・設備": ["綺麗", "広い", "快適", "充実"],
  食事: ["美味", "豊富", "満足", "朝食"],
  アクセス: ["近い", "便利", "駅", "バス"],
  案内・表示: ["分かりやすい", "親切", "充実"],
  店内の動線: ["分かりやすい", "買いやすい", "スムーズ"],
  施設の使いやすさ: ["使いやすい", "便利", "快適"],
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
  院内の清潔さ: ["汚い", "不潔", "臭い", "埃", "雑"],
  説明のわかりやすさ: ["わかりにくい", "不充分", "説明不足", "不安"],
  予約のしやすさ: ["取れない", "電話がつながらない", "面倒", "不便"],
  店舗の利便性: ["遠い", "不便", "駐車場がない", "営業時間"],
  設備の充実度: ["古い", "少ない", "整っていない", "不満"],
  混雑具合: ["混雑", "込む", "人が多い", "待たされる", "うるさい"],
  店内の雰囲気: ["うるさい", "暗い", "汚い", "古い", "狭い"],
  "客室・設備": ["狭い", "古い", "不潔", "不足", "不満"],
  食事: ["不味", "少ない", "バリエーション", "不満"],
  アクセス: ["遠い", "不便", "駅から", "バス"],
  案内・表示: ["分かりにくい", "少ない", "不親切", "迷う"],
  店内の動線: ["分かりにくい", "混雑", "レジ待ち", "不便"],
  施設の使いやすさ: ["使いにくい", "不便", "不親切", "不足"],
};

const CATEGORY_FLOWS = {
  confectionery: {
    purposeQuestion: "本日の来店目的を教えてください。",
    purposeChoices: ["自分用に購入", "ギフト", "テイクアウト", "友人・家族と"],
    satisfactionLabel: "ご来店の感想",
    improveDefaults: ["接客", "味", "見た目", "価格", "特にない"],
  },
  food: {
    purposeQuestion: "本日の来店目的を教えてください。",
    purposeChoices: ["ランチ", "ディナー", "会食・接待", "友人・家族と"],
    satisfactionLabel: "ご来店の感想",
    improveDefaults: ["接客", "料理のクオリティ", "店内環境", "価格", "特にない"],
  },
  hospital: {
    purposeQuestion: "本日の受診目的を教えてください。",
    purposeChoices: ["問診・検査", "処方箋", "通院・リハビリ", "健康診断"],
    satisfactionLabel: "受診の感想",
    improveDefaults: ["接客", "説明のわかりやすさ", "待ち時間", "院内の清潔さ", "特にない"],
  },
  bank: {
    purposeQuestion: "本日のご利用目的を教えてください。",
    purposeChoices: ["窓口相談", "ローン・保険", "振込・手続き", "ATM利用"],
    satisfactionLabel: "ご利用の感想",
    improveDefaults: ["接客", "説明のわかりやすさ", "待ち時間", "店舗の利便性", "特にない"],
  },
  gym: {
    purposeQuestion: "本日のご利用目的を教えてください。",
    purposeChoices: ["トレーニング", "パーソナルレッスン", "グループレッスン", "見学・体験"],
    satisfactionLabel: "ご利用の感想",
    improveDefaults: ["接客", "設備の充実度", "混雑具合", "清潔さ", "特にない"],
  },
  hair_care: {
    purposeQuestion: "本日のご利用目的を教えてください。",
    purposeChoices: ["カット", "カラー・パーマ", "トリートメント", "相談"],
    satisfactionLabel: "施術の感想",
    improveDefaults: ["接客", "技術・仕上がり", "店内の雰囲気", "価格", "特にない"],
  },
  lodging: {
    purposeQuestion: "本日のご利用目的を教えてください。",
    purposeChoices: ["宿泊", "食事利用", "宴会・会議", "観光拠点"],
    satisfactionLabel: "宿泊・利用の感想",
    improveDefaults: ["接客", "客室・設備", "食事", "清潔さ", "特にない"],
  },
  tourist_attraction: {
    purposeQuestion: "本日のご来場目的を教えてください。",
    purposeChoices: ["観光", "散策", "写真撮影", "家族・友人と"],
    satisfactionLabel: "ご来場の感想",
    improveDefaults: ["雰囲気", "アクセス", "案内・表示", "混雑具合", "特にない"],
  },
  supermarket: {
    purposeQuestion: "本日のご来店目的を教えてください。",
    purposeChoices: ["普段の買い物", "特売品を求めて", "夕食の材料", "日用品"],
    satisfactionLabel: "ご来店の感想",
    improveDefaults: ["接客", "商品の品質", "品揃え", "店内の動線", "特にない"],
  },
  shopping_mall: {
    purposeQuestion: "本日のご利用目的を教えてください。",
    purposeChoices: ["ショッピング", "食事", "映画・娯楽", "家族と"],
    satisfactionLabel: "ご利用の感想",
    improveDefaults: ["接客", "店舗の充実度", "施設の使いやすさ", "清潔さ", "特にない"],
  },
  convenience_store: {
    purposeQuestion: "本日のご利用目的を教えてください。",
    purposeChoices: ["食料品購入", "ATM・宅配", "夜食", "急ぎの買い物"],
    satisfactionLabel: "ご利用の感想",
    improveDefaults: ["接客", "商品の品質", "品揃え", "清潔さ", "特にない"],
  },
  retail: {
    purposeQuestion: "本日のご来店の目的を教えてください。",
    purposeChoices: ["自分用に購入", "ギフト", "見て回る", "予約・取り置き"],
    satisfactionLabel: "ご来店の感想",
    improveDefaults: ["接客", "商品の品質", "品揃え", "価格", "特にない"],
  },
  service: {
    purposeQuestion: "本日のご利用の目的を教えてください。",
    purposeChoices: ["初回利用", "定期利用", "相談", "ケア・メンテナンス"],
    satisfactionLabel: "サービスの感想",
    improveDefaults: ["接客", "技術・仕上がり", "施設の清潔さ", "価格", "特にない"],
  },
  other: {
    purposeQuestion: "本日のご来店の目的を教えてください。",
    purposeChoices: ["初めて来店", "定期利用", "友人・家族と", "その他"],
    satisfactionLabel: "ご利用の感想",
    improveDefaults: ["接客", "雰囲気", "価格", "待ち時間", "特にない"],
  },
};

const CATEGORY_TOPICS = {
  confectionery: ["接客", "料理のクオリティ", "雰囲気", "価格", "待ち時間"],
  food: ["接客", "料理のクオリティ", "雰囲気", "価格", "待ち時間"],
  hospital: ["接客", "説明のわかりやすさ", "待ち時間", "院内の清潔さ"],
  bank: ["接客", "説明のわかりやすさ", "待ち時間", "店舗の利便性"],
  gym: ["接客", "設備の充実度", "混雑具合", "清潔さ"],
  hair_care: ["接客", "技術・仕上がり", "店内の雰囲気", "価格"],
  lodging: ["接客", "客室・設備", "食事", "清潔さ"],
  tourist_attraction: ["雰囲気", "アクセス", "案内・表示", "混雑具合"],
  supermarket: ["接客", "商品の品質", "品揃え", "店内の動線"],
  shopping_mall: ["接客", "店舗の充実度", "施設の使いやすさ", "清潔さ"],
  convenience_store: ["接客", "商品の品質", "品揃え", "清潔さ"],
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
  const { name, rating, reviews, types, priceLevel, editorialSummary } = info;
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
  const hasEditorialSummary = !!editorialSummary;

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
    ? uniqueChoices([...topics.slice(0, 2), ...flow.improveDefaults, "特にない"])
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

  if (hasEditorialSummary) {
    steps.push({
      type: "bot",
      text: `このお店は「${editorialSummary}」と紹介されています。\n実際に来店して、その点はいかがでしたか？`,
      choices: ["強く感じた", "まあまあ感じた", "あまり感じられなかった", "特に気にしていない"],
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
      text: "実際の Smash　VOCでは、\nさらに便利で面白いアンケートが簡単に作れます。",
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
let lastSatisfaction = null;

const MOOD_CHOICES = {
  happy: ["とても満足", "まあまあ満足", "テンポが良い", "分かりやすい"],
  sad: ["かなり不満", "やや不満", "もう少し短く"],
};

function moodForChoice(label) {
  if (MOOD_CHOICES.sad.includes(label)) return "sad";
  return "happy";
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
  lastSatisfaction = null;
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
  botMood = moodForChoice(label);

  if (isSatisfactionChoice(label)) {
    lastSatisfaction = label;
    insertSatisfactionDeepDive(currentStep + 1);
  }

  chatChoices.innerHTML = "";
  await wait(STEP_PAUSE_MS);
  renderStep(currentStep + 1);
}

const SATISFACTION_CHOICES = ["とても満足", "まあまあ満足", "やや不満", "かなり不満"];

function isSatisfactionChoice(label) {
  return SATISFACTION_CHOICES.includes(label);
}

function insertSatisfactionDeepDive(atIndex) {
  if (!storeInfo) return;
  const category = detectCategory(storeInfo.types || []);
  const flow = CATEGORY_FLOWS[category];
  const choices = flow.improveDefaults;

  const isPositive = ["とても満足", "まあまあ満足"].includes(lastSatisfaction);
  const text = isPositive
    ? "満足いただけたとのこと、ありがとうございます。\n特に良かったポイントを教えてください。"
    : "ご不便をおかけして申し訳ございません。\n特に改善してほしい点を教えてください。";

  CHAT_FLOW.splice(atIndex, 0, { type: "bot", text, choices });
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
