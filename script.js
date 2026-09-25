// ------------------------------------------------------------
// VOC Smash デモ
// Google Places API から取得した店舗情報・口コミをもとに、
// チャットアンケートの質問を動的に生成。
// ------------------------------------------------------------

const DEMO_DELAY = 1400; // ローディング演出時間（ms）
const BOT_THINK_MS = 700; // ボット返答の間（ms）Smashの標準くらい
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
    id: "cafe",
    label: "カフェ",
    keywords: ["cafe", "coffee_shop"],
  },
  {
    id: "hospital",
    label: "病院",
    keywords: ["hospital"],
  },
  {
    id: "clinic",
    label: "クリニック",
    keywords: ["clinic", "doctor", "dentist", "medical_lab", "physiotherapist"],
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
    id: "food",
    label: "飲食",
    keywords: ["restaurant", "bar", "meal_takeaway", "meal_delivery", "food"],
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
    purposeChoices: ["ご自宅用", "ギフト", "誕生日・記念日", "イートイン", "その他"],
    satisfactionQuestion: "今回ご来店いただいた<b>感想</b>をお聞かせください。",
    satisfactionFollowUpChoices: ["接客", "味", "見た目", "価格", "その他", "特にない"],
    secondStep: {
      type: "review",
      praiseText: "口コミでは「{topics}」が評価されています。\nあなたが<b>期待したポイント</b>は何でしょうか？",
      praiseChoices: ["商品のクオリティ", "接客", "見た目", "店内環境", "その他"],
      concernText: "口コミでは「{topics}」に関する声もあります。\nあなたが<b>気にしてほしい点</b>は何でしょうか？",
      concernChoices: ["商品のクオリティ", "接客", "見た目", "店内環境", "その他"],
    },
    improveQuestion: "<b>改善してほしい点</b>はありますか？",
    improveChoices: ["料理のクオリティ", "味", "接客", "店内環境", "雰囲気", "その他", "特にない"],
    editorialQuestion: "このお店は「{summary}」と紹介されています。\n実際に来店して、その<b>ポイント</b>はいかがでしたか？",
  },
  cafe: {
    purposeChoices: ["作業・勉強", "ひまつぶし", "ひとりで過ごす", "待ち合わせ", "友人・家族と"],
    satisfactionQuestion: "今回ご利用いただいた<b>感想</b>をお聞かせください。",
    satisfactionFollowUpChoices: ["接客", "ドリンクのクオリティ", "店内環境", "価格", "その他", "特にない"],
    secondStep: {
      type: "reason",
      text: "ありがとうございます。\nこちらを<b>選んでいただいた理由</b>は何でしょうか？",
      choices: ["口コミが良かった", "近くにあった", "雰囲気が好き", "価格が安い", "その他"],
    },
    improveQuestion: "<b>改善してほしい点</b>はありますか？",
    improveChoices: ["接客", "ドリンクのクオリティ", "店内環境", "価格", "その他", "特にない"],
    editorialQuestion: "このお店は「{summary}」と紹介されています。\n実際に来店して、その<b>ポイント</b>はいかがでしたか？",
  },
  food: {
    purposeChoices: ["昼食", "夕食", "軽食・カフェ", "会食・接待", "飲み会", "その他"],
    satisfactionQuestion: "今回お越しいただいた<b>感想</b>をお聞かせください。",
    satisfactionFollowUpChoices: ["接客", "料理のクオリティ", "店内環境", "価格", "その他", "特にない"],
    secondStep: {
      type: "review",
      praiseText: "口コミでは「{topics}」が評価されています。\nあなたが<b>期待したポイント</b>は何でしょうか？",
      praiseChoices: ["料理のクオリティ", "接客", "店内環境", "その他"],
      concernText: "口コミでは「{topics}」の声もあります。\nあなたが<b>気にしてほしい点</b>は何でしょうか？",
      concernChoices: ["料理のクオリティ", "接客", "店内環境", "その他"],
    },
    improveQuestion: "<b>改善してほしい点</b>はありますか？",
    improveChoices: ["料理のクオリティ", "雰囲気", "接客", "店内環境", "その他", "特にない"],
    editorialQuestion: "このお店は「{summary}」と紹介されています。\n実際に来店して、その<b>ポイント</b>はいかがでしたか？",
  },
  hospital: {
    purposeChoices: ["外来受診", "入院・手術", "検査", "面会"],
    satisfactionQuestion: "受診の<b>感想</b>をお聞かせください。",
    satisfactionFollowUpChoices: ["対応", "説明のわかりやすさ", "待ち時間", "院内環境", "その他", "特にない"],
    secondStep: {
      type: "review",
      concernText: "口コミでは「{topics}」に関する声もあります。\nあなたが<b>気にしてほしい点</b>は何でしょうか？",
      concernChoices: ["対応", "説明のわかりやすさ", "待ち時間", "院内環境", "その他"],
    },
    improveQuestion: "<b>改善してほしい点</b>はありますか？",
    improveChoices: ["対応", "説明のわかりやすさ", "待ち時間", "院内環境", "その他", "特にない"],
    editorialQuestion: "このお店は「{summary}」と紹介されています。\nこの内容について、その通りだと感じましたか？",
  },
  clinic: {
    purposeChoices: ["診察・治療", "健康診断・予防接種", "通院・リハビリ", "薬の受け取り"],
    satisfactionQuestion: "受診の<b>感想</b>をお聞かせください。",
    satisfactionFollowUpChoices: ["対応", "説明のわかりやすさ", "待ち時間", "院内環境", "その他", "特にない"],
    secondStep: {
      type: "review",
      concernText: "口コミでは「{topics}」に関する声もあります。\nあなたが<b>気にしてほしい点</b>は何でしょうか？",
      concernChoices: ["対応", "説明のわかりやすさ", "待ち時間", "院内環境", "その他"],
    },
    improveQuestion: "<b>改善してほしい点</b>はありますか？",
    improveChoices: ["対応", "説明のわかりやすさ", "待ち時間", "院内環境", "その他", "特にない"],
    editorialQuestion: "このお店は「{summary}」と紹介されています。\nこの内容について、その通りだと感じましたか？",
  },
  bank: {
    purposeChoices: ["窓口利用", "各種相談", "ATM利用", "その他"],
    satisfactionQuestion: "今回ご利用いただいた<b>感想</b>をお聞かせください。",
    satisfactionFollowUpChoices: ["接客・対応", "説明のわかりやすさ", "待ち時間", "店舗へのアクセス", "その他", "特にない"],
    secondStep: {
      type: "reason",
      text: "ありがとうございます。\nこちらを<b>選んでいただいた理由</b>は何でしょうか？",
      choices: ["口コミが良かった", "近くにあった", "雰囲気が好き", "その他"],
    },
    improveQuestion: "<b>改善してほしい点</b>はありますか？",
    improveChoices: ["接客・対応", "説明のわかりやすさ", "待ち時間", "店舗へのアクセス", "その他", "特にない"],
    editorialQuestion: "このお店は「{summary}」と紹介されています。\nこの内容について、その通りだと感じましたか？",
  },
  gym: {
    purposeChoices: ["トレーニング", "パーソナルレッスン", "グループレッスン", "見学・体験", "その他"],
    satisfactionQuestion: "今回ご利用いただいた<b>感想</b>をお聞かせください。",
    satisfactionFollowUpChoices: ["接客・対応", "設備の充実度", "混雑具合", "清潔さ", "その他", "特にない"],
    secondStep: {
      type: "reason",
      text: "ありがとうございます。\nこちらを<b>選んでいただいた理由</b>は何でしょうか？",
      choices: ["口コミが良かった", "近くにあった", "雰囲気が好き", "価格が安い", "その他"],
    },
    improveQuestion: "<b>改善してほしい点</b>はありますか？",
    improveChoices: ["接客・対応", "設備の充実度", "混雑具合", "清潔さ", "その他", "特にない"],
    editorialQuestion: "このお店は「{summary}」と紹介されています。\nこの内容について、その通りだと感じましたか？",
  },
  hair_care: {
    purposeChoices: ["カット", "カラー・パーマ", "トリートメント", "相談", "その他"],
    satisfactionQuestion: "今回ご利用いただいた<b>感想</b>をお聞かせください。",
    satisfactionFollowUpChoices: ["接客", "技術・仕上がり", "店内の雰囲気", "価格", "その他", "特にない"],
    secondStep: {
      type: "review",
      praiseText: "口コミでは「{topics}」が評価されています。\nあなたが<b>期待したポイント</b>は何でしょうか？",
      praiseChoices: ["技術・仕上がり", "接客", "雰囲気", "価格が安い", "その他"],
      concernText: "口コミでは「{topics}」に関する声もあります。\nあなたが<b>気にしてほしい点</b>は何でしょうか？",
      concernChoices: ["技術・仕上がり", "接客", "雰囲気", "価格が安い", "その他"],
    },
    improveQuestion: "<b>改善してほしい点</b>はありますか？",
    improveChoices: ["接客", "技術・仕上がり", "店内の雰囲気", "価格", "その他", "特にない"],
    editorialQuestion: "このお店は「{summary}」と紹介されています。\nこの内容について、その通りだと感じましたか？",
  },
  lodging: {
    purposeChoices: ["宿泊", "食事利用", "宴会・会議", "観光拠点", "その他"],
    satisfactionQuestion: "今回ご利用いただいた<b>感想</b>をお聞かせください。",
    satisfactionFollowUpChoices: ["接客", "客室・設備", "食事", "清潔さ", "価格", "その他", "特にない"],
    secondStep: {
      type: "review",
      praiseText: "口コミでは「{topics}」が評価されています。\nあなたが<b>期待したポイント</b>は何でしょうか？",
      praiseChoices: ["食事", "接客", "客室・設備", "その他"],
      concernText: "口コミでは「{topics}」に関する声もあります。\nあなたが<b>気にしてほしい点</b>は何でしょうか？",
      concernChoices: ["食事", "接客", "客室・設備", "その他"],
    },
    improveQuestion: "<b>改善してほしい点</b>はありますか？",
    improveChoices: ["食事", "客室・設備", "接客", "清潔さ", "価格", "その他", "特にない"],
    editorialQuestion: "このお店は「{summary}」と紹介されています。\nこの内容について、その通りだと感じましたか？",
  },
  tourist_attraction: {
    purposeChoices: ["観光", "散策", "写真撮影", "体験・アトラクション", "その他"],
    satisfactionQuestion: "今回ご利用いただいた<b>感想</b>をお聞かせください。",
    satisfactionFollowUpChoices: ["体験内容", "展示・設備", "雰囲気", "アクセス", "案内・表示", "混雑具合", "その他", "特にない"],
    secondStep: {
      type: "reason",
      text: "ありがとうございます。\nこちらを<b>選んでいただいた理由</b>は何でしょうか？",
      choices: ["興味・好みに合う", "口コミが良かった", "近くにあった", "雰囲気が好き", "価格が安い", "その他"],
    },
    improveQuestion: "<b>改善してほしい点</b>はありますか？",
    improveChoices: ["体験内容", "展示・設備", "雰囲気", "アクセス", "案内・表示", "混雑具合", "その他", "特にない"],
    editorialQuestion: "このお店は「{summary}」と紹介されています。\nこの内容について、その通りだと感じましたか？",
  },
  supermarket: {
    purposeChoices: ["普段の買い足し・まとめ買い", "惣菜・お弁当などの購入", "特売・セール品目当て", "ギフト・手土産の購入", "その他"],
    satisfactionQuestion: "今回ご利用いただいた<b>感想</b>をお聞かせください。",
    satisfactionFollowUpChoices: ["商品の品質", "品揃え", "買い物のしやすさ", "価格", "待ち時間", "その他", "特にない"],
    secondStep: {
      type: "review",
      concernText: "口コミでは「{topics}」の声もあります。\nあなたが<b>気にしてほしい点</b>は何でしょうか？",
      concernChoices: ["待ち時間", "商品の品質", "品揃え", "買い物のしやすさ", "価格", "その他"],
    },
    improveQuestion: "<b>改善してほしい点</b>はありますか？",
    improveChoices: ["商品の品質", "品揃え", "買い物のしやすさ", "価格", "待ち時間", "その他", "特にない"],
    editorialQuestion: "このお店は「{summary}」と紹介されています。\nこの内容について、その通りだと感じましたか？",
  },
  shopping_mall: {
    purposeChoices: ["ショッピング", "食事・カフェ", "映画・娯楽", "散策", "その他"],
    satisfactionQuestion: "今回ご利用いただいた<b>感想</b>をお聞かせください。",
    satisfactionFollowUpChoices: ["接客", "店舗の充実度", "施設の使いやすさ", "清潔さ", "その他"],
    secondStep: {
      type: "reason",
      text: "ありがとうございます。\nこちらを<b>選んでいただいた理由</b>は何でしょうか？",
      choices: ["施設が充実している", "行きたいお店がある", "口コミが良かった", "近くにあった", "雰囲気が好き", "その他", "特にない"],
    },
    improveQuestion: "<b>改善してほしい点</b>はありますか？",
    improveChoices: ["接客", "施設の使いやすさ", "店舗の充実度", "清潔さ", "その他", "特にない"],
    editorialQuestion: "このお店は「{summary}」と紹介されています。\nこの内容について、その通りだと感じましたか？",
  },
  convenience_store: {
    purposeChoices: ["食事・食料品の購入", "飲料・おやつ・嗜好品の購入", "日用品・急な買い足し", "サービス利用（ATM・各種手続き等）", "休憩・トイレ利用", "その他"],
    satisfactionQuestion: "今回ご利用いただいた<b>感想</b>をお聞かせください。",
    satisfactionFollowUpChoices: ["接客", "品揃え", "待ち時間", "清潔さ", "その他"],
    secondStep: {
      type: "reason",
      text: "ありがとうございます。\nこちらを<b>選んでいただいた理由</b>は何でしょうか？",
      choices: ["近くにあった", "駐車場が広い", "ブランド・商品目当て", "必要なサービスに対応していた", "その他", "特にない"],
    },
    improveQuestion: "<b>改善してほしい点</b>はありますか？",
    improveChoices: ["接客", "品揃え", "待ち時間", "清潔さ", "その他", "特にない"],
    editorialQuestion: "このお店は「{summary}」と紹介されています。\nこの内容について、その通りだと感じましたか？",
  },
  retail: {
    purposeChoices: ["自分用に購入", "ギフト", "見て回る", "予約・取り置き"],
    satisfactionQuestion: "今回ご来店いただいた<b>感想</b>をお聞かせください。",
    satisfactionFollowUpChoices: ["接客", "商品の品質", "品揃え", "価格", "その他", "特にない"],
    secondStep: {
      type: "reason",
      text: "ありがとうございます。\nこちらを<b>選んでいただいた理由</b>は何でしょうか？",
      choices: ["口コミが良かった", "近くにあった", "雰囲気が好き", "価格が安い", "その他"],
    },
    improveQuestion: "<b>改善してほしい点</b>はありますか？",
    improveChoices: ["接客", "商品の品質", "品揃え", "価格", "その他", "特にない"],
    editorialQuestion: "このお店は「{summary}」と紹介されています。\n実際に来店して、その<b>ポイント</b>はいかがでしたか？",
  },
  service: {
    purposeChoices: ["初回利用", "定期利用", "相談", "ケア・メンテナンス"],
    satisfactionQuestion: "今回ご利用いただいた<b>感想</b>をお聞かせください。",
    satisfactionFollowUpChoices: ["接客", "技術・仕上がり", "施設の清潔さ", "価格", "その他", "特にない"],
    secondStep: {
      type: "reason",
      text: "ありがとうございます。\nこちらを<b>選んでいただいた理由</b>は何でしょうか？",
      choices: ["口コミが良かった", "近くにあった", "雰囲気が好き", "価格が安い", "その他"],
    },
    improveQuestion: "<b>改善してほしい点</b>はありますか？",
    improveChoices: ["接客", "技術・仕上がり", "施設の清潔さ", "価格", "その他", "特にない"],
    editorialQuestion: "このお店は「{summary}」と紹介されています。\n実際にご利用になって、その<b>ポイント</b>はいかがでしたか？",
  },
  other: {
    purposeChoices: ["初めて来店", "定期利用", "友人・家族と", "その他"],
    satisfactionQuestion: "今回ご利用いただいた<b>感想</b>をお聞かせください。",
    satisfactionFollowUpChoices: ["接客", "雰囲気", "価格", "待ち時間", "その他", "特にない"],
    secondStep: {
      type: "reason",
      text: "ありがとうございます。\nこちらを<b>選んでいただいた理由</b>は何でしょうか？",
      choices: ["口コミが良かった", "近くにあった", "雰囲気が好き", "価格が安い", "その他"],
    },
    improveQuestion: "<b>改善してほしい点</b>はありますか？",
    improveChoices: ["接客", "雰囲気", "価格", "待ち時間", "その他", "特にない"],
    editorialQuestion: "このお店は「{summary}」と紹介されています。\n実際にご利用になって、その<b>ポイント</b>はいかがでしたか？",
  },
};

const DEFAULT_REASON_TEXT = "ありがとうございます。\nこちらを<b>選んでいただいた理由</b>は何でしょうか？";
const DEFAULT_REASON_CHOICES = ["口コミが良かった", "近くにあった", "雰囲気が好き", "価格が安い", "その他"];
const DEFAULT_EDITORIAL_QUESTION = "このお店は「{summary}」と紹介されています。\n実際に来店して、その<b>ポイント</b>はいかがでしたか？";
const FEEDBACK_CHOICES = ["テンポが良い", "わかりやすい", "普通", "もう少し短く", "もっとやってみたい"];

const CATEGORY_TOPICS = {
  confectionery: ["接客", "料理のクオリティ", "雰囲気", "価格", "待ち時間"],
  cafe: ["接客", "料理のクオリティ", "雰囲気", "価格", "待ち時間"],
  food: ["接客", "料理のクオリティ", "雰囲気", "価格", "待ち時間"],
  hospital: ["接客", "説明のわかりやすさ", "待ち時間", "院内の清潔さ"],
  clinic: ["接客", "説明のわかりやすさ", "待ち時間", "院内の清潔さ"],
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
  const isHighRated = rating != null && rating >= 4.3;
  const isLowRated = rating != null && rating <= 3.9;
  const hasPriceLevel = priceLevel != null;
  const hasEditorialSummary = !!editorialSummary;

  const topicPhrase = (arr) => escapeHtml(arr.slice(0, 2).join("・"));

  let secondStep;
  if (flow.secondStep.type === "review") {
    let reviewTopics = [];
    let isPraise = false;
    if (flow.secondStep.praiseText && isHighRated && positiveTopics.length) {
      reviewTopics = positiveTopics;
      isPraise = true;
    } else if (flow.secondStep.concernText && (negativeTopics.length || positiveTopics.length)) {
      reviewTopics = negativeTopics.length ? negativeTopics : positiveTopics;
    }
    if (reviewTopics.length) {
      const tpl = isPraise ? flow.secondStep.praiseText : flow.secondStep.concernText;
      const choices = isPraise ? flow.secondStep.praiseChoices : flow.secondStep.concernChoices;
      secondStep = {
        type: "bot",
        text: tpl.replace("{topics}", topicPhrase(reviewTopics)),
        choices,
        multi: true,
      };
    } else {
      secondStep = {
        type: "bot",
        text: flow.secondStep.reasonText || DEFAULT_REASON_TEXT,
        choices: flow.secondStep.reasonChoices || DEFAULT_REASON_CHOICES,
        multi: true,
      };
    }
  } else {
    secondStep = {
      type: "bot",
      text: flow.secondStep.text,
      choices: flow.secondStep.choices,
      multi: true,
    };
  }

  const steps = [
    {
      type: "bot",
      text: `<b>${escapeHtml(name)}</b>へお越しいただき、ありがとうございました！今回の<b>目的</b>を教えてください。`,
      choices: flow.purposeChoices,
    },
    secondStep,
    {
      type: "bot",
      text: flow.satisfactionQuestion,
      choices: ["とても満足", "まあまあ満足", "やや不満", "かなり不満"],
    },
  ];

  if (hasPriceLevel) {
    const priceLabel = formatPriceLevel(priceLevel);
    steps.push({
      type: "bot",
      text: `Googleマップでは価格帯が「${escapeHtml(priceLabel)}」です。\n実際の<b>価格</b>についてはいかがでしたか？`,
      choices: priceLevelChoices(priceLevel),
    });
  }

  if (hasEditorialSummary) {
    const editorialQuestion = flow.editorialQuestion || DEFAULT_EDITORIAL_QUESTION;
    steps.push({
      type: "bot",
      text: editorialQuestion.replace("{summary}", escapeHtml(editorialSummary)),
      choices: ["強く感じた", "まあまあ感じた", "あまり感じられなかった", "特に気にしていない"],
    });
  }

  steps.push(
    {
      type: "bot",
      text: flow.improveQuestion || "<b>改善してほしい点</b>はありますか？",
      choices: flow.improveChoices,
      multi: true,
      skipIfDissatisfied: true,
    },
    {
      type: "bot",
      text: "このアンケートはいかがでしたか？",
      choices: FEEDBACK_CHOICES,
      multi: true,
    },
    {
      type: "final",
      text: "Smash VOCでは、GoogleマップURL以外にも、簡単なやりとりでアンケートが作成できます。\n回答者一人ひとりと「対話」するアンケート、あなたのお店でも取り入れてみませんか？",
    }
  );

  return steps;
}

function uniqueChoices(items) {
  return [...new Set(items)].slice(0, 4);
}

function updateStepCount() {
  if (!stepCountEl || !CHAT_FLOW.length) return;
  const remaining = CHAT_FLOW.slice(currentStep).filter((s) => s.type === "bot").length;
  stepCountEl.textContent = remaining > 0 ? `あと ${remaining} 問` : "";
}
function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/\u0026/g, "\u0026amp;")
    .replace(/\u003c/g, "\u0026lt;")
    .replace(/\u003e/g, "\u0026gt;")
    .replace(/"/g, "\u0026quot;")
    .replace(/'/g, "\u0026#039;");
}

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
const stepCountEl = document.getElementById("step-count");

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
  const labels = Array.isArray(label) ? label : [label];
  if (labels.some((l) => MOOD_CHOICES.sad.includes(l))) return "sad";
  return "happy";
}

function isDissatisfied() {
  return ["やや不満", "かなり不満"].includes(lastSatisfaction);
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
  if (stepCountEl) stepCountEl.textContent = "";
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

  if (step.skipIfDissatisfied && isDissatisfied()) {
    renderStep(index + 1);
    return;
  }

  // updateStepCount();

  if (step.type === "bot") {
    await wait(BOT_THINK_MS);
    addMessage("bot", interpolate(step.text, storeInfo), botMood);
    await wait(STEP_PAUSE_MS);
    renderChoices(step.choices, step.multi);
    scrollToBottom();
  } else if (step.type === "final") {
    await wait(BOT_THINK_MS);
    addFinalCard(interpolate(step.text, storeInfo));
    if (stepCountEl) stepCountEl.textContent = "";
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
  if (sender === "bot") {
    p.innerHTML = text.replace(/\n/g, "<br>");
  } else {
    p.textContent = text;
  }
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
  const choices = flow.satisfactionFollowUpChoices;

  const isPositive = ["とても満足", "まあまあ満足"].includes(lastSatisfaction);
  const text = isPositive
    ? "ご満足いただけたとのこと、ありがとうございます。\n<b>特に良かった点</b>を教えてください。"
    : "この度はご期待に添えず、申し訳ございません。\n特に<b>気になった点</b>を教えていただけますでしょうか。";

  CHAT_FLOW.splice(atIndex, 0, { type: "bot", text, choices, multi: true });
}

function renderChoices(choices, multi = false) {
  chatChoices.innerHTML = "";

  if (!multi) {
    choices.forEach((label) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice";
      btn.textContent = label;
      btn.addEventListener("click", () => handleChoice(label));
      chatChoices.appendChild(btn);
    });
    return;
  }

  const selected = new Set();

  choices.forEach((label) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "choice";
    btn.textContent = label;
    btn.addEventListener("click", () => {
      if (selected.has(label)) {
        selected.delete(label);
        btn.classList.remove("selected");
      } else {
        selected.add(label);
        btn.classList.add("selected");
      }
      nextBtn.disabled = selected.size === 0;
    });
    chatChoices.appendChild(btn);
  });

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "btn btn-primary choice-next";
  nextBtn.textContent = "次へ";
  nextBtn.disabled = true;
  nextBtn.addEventListener("click", () => handleMultiChoice(Array.from(selected)));
  chatChoices.appendChild(nextBtn);
}

async function handleMultiChoice(labels) {
  addMessage("user", labels.join("、"));
  botMood = moodForChoice(labels);

  chatChoices.innerHTML = "";
  await wait(STEP_PAUSE_MS);
  renderStep(currentStep + 1);
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
  cta.textContent = "30日間無料で試す";
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
