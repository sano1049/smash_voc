const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

app.use(cors());
app.use(express.json());
app.use(express.static("."));

/**
 * GoogleマップURLの data パラメータから place_id を取り出す。
 * 例: data=!3m1!4b1!4m5!3m4!1s0x808f...:0xdd294...!8m2!...
 */
function extractPlaceIdFromData(dataParam) {
  if (!dataParam || dataParam[0] !== "!") return null;

  // 先頭の '!' を除き、最初の '!' 以降を全部取得（Ruby split(limit) と同等）
  const sliced = dataParam.slice(1);
  const firstSep = sliced.indexOf("!");
  const tail = firstSep >= 0 ? sliced.slice(firstSep + 1) : "";
  const elements = tail ? tail.split("!") : [];

  for (const el of elements) {
    if (el.startsWith("1s")) {
      return el.slice(2);
    }
  }
  return null;
}

const FIELD_MASK =
  "places.id,places.displayName,places.rating,places.reviews,places.types";

async function resolveByLatLng(name, lat, lng) {
  const apiUrl = `https://places.googleapis.com/v1/places:searchText`;
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_API_KEY,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery: name,
      locationBias: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: 50,
        },
      },
      languageCode: "ja",
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(JSON.stringify(data));
  }
  return data.places?.[0] || null;
}

async function resolvePlaceFromLongUrl(url) {
  try {
    const coordMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    const nameMatch = url.match(/\/place\/([^/@]+)/);
    if (!coordMatch || !nameMatch) return null;

    const lat = parseFloat(coordMatch[1]);
    const lng = parseFloat(coordMatch[2]);
    const name = decodeURIComponent(nameMatch[1]).replace(/\+/g, " ");
    return await resolveByLatLng(name, lat, lng);
  } catch {
    return null;
  }
}

async function expandAndResolveShortUrl(url) {
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    const expanded = response.url || url;

    // 展開先に ChIJ... があればそのまま返す
    if (/(ChIJ[0-9A-Za-z_-]{23,})/.test(expanded)) {
      return { url: expanded, resolved: null };
    }

    // 緯度経度を持つ場合は Text Search で解決
    const resolved = await resolvePlaceFromLongUrl(expanded);
    return { url: expanded, resolved };
  } catch {
    return { url, resolved: null };
  }
}

function extractPlaceIdFromUrl(url) {
  try {
    const parsed = new URL(url);

    // 1. URL 中に ChIJ... が含まれていればそれを優先
    const chijMatch = url.match(/(ChIJ[0-9A-Za-z_-]{23,})/);
    if (chijMatch) return chijMatch[1];

    // 2. ?q=place_id:ChIJ...
    const q = parsed.searchParams.get("q") || "";
    const qMatch = q.match(/place_id:?(ChIJ[0-9A-Za-z_-]{23,})/);
    if (qMatch) return qMatch[1];

    // 3. ?place_id=ChIJ...
    const direct = parsed.searchParams.get("place_id");
    if (direct) return direct;

    // 4. /data=!...1s0x...:0x... の内部ID（Places API では直接使用不可）
    const dataMatch = url.match(/\/data=([^?&#]+)/);
    if (dataMatch) {
      const fromData = extractPlaceIdFromData(decodeURIComponent(dataMatch[1]));
      if (fromData) return fromData;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * GET /api/place?url=https://www.google.com/maps/place/...
 */
app.get("/api/place", async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: "url is required" });
  }
  if (!GOOGLE_API_KEY) {
    return res.status(500).json({ error: "GOOGLE_PLACES_API_KEY is not set" });
  }

  let targetUrl = url;
  let resolvedPlace = null;

  const isShortUrl =
    targetUrl.includes("maps.app.goo.gl") || targetUrl.includes("goo.gl/maps");
  const hasInternalId = /\/data=[^?&]*1s0x[a-f0-9]+:0x[a-f0-9]+/i.test(targetUrl);

  if (isShortUrl) {
    const result = await expandAndResolveShortUrl(targetUrl);
    targetUrl = result.url;
    resolvedPlace = result.resolved;
  } else if (hasInternalId) {
    resolvedPlace = await resolvePlaceFromLongUrl(targetUrl);
  }

  const placeId = resolvedPlace?.id || extractPlaceIdFromUrl(targetUrl);
  if (!placeId) {
    return res.status(400).json({ error: "Could not extract place_id from URL" });
  }

  try {
    let data;
    let placeIdUsed = placeId;

    if (resolvedPlace) {
      data = resolvedPlace;
      placeIdUsed = resolvedPlace.id;
    } else {
      const apiUrl = `https://places.googleapis.com/v1/places/${encodeURIComponent(
        placeId
      )}?fields=id,displayName,rating,reviews,types&languageCode=ja&key=${GOOGLE_API_KEY}`;

      const response = await fetch(apiUrl);
      data = await response.json();

      if (!response.ok) {
        return res.status(response.status).json({ error: data });
      }
    }

    const reviews = (data.reviews || [])
      .filter((r) => r.originalText?.text)
      .map((r) => ({
        text: r.originalText.text,
        rating: r.rating ?? null,
      }));

    res.json({
      name: data.displayName?.text || data.displayName || "名称不明",
      rating: data.rating ?? null,
      placeId: placeIdUsed,
      types: data.types || [],
      reviews,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  if (!GOOGLE_API_KEY) {
    console.warn("Warning: GOOGLE_PLACES_API_KEY is not set");
  }
});
