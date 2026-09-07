// Vercel サーバーレス関数用：/api/place?url=...
// Google Places API (New) を呼び出して店舗情報を返す

const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function extractPlaceIdFromData(dataParam) {
  if (!dataParam || dataParam[0] !== "!") return null;
  const sliced = dataParam.slice(1);
  const firstSep = sliced.indexOf("!");
  const tail = firstSep >= 0 ? sliced.slice(firstSep + 1) : "";
  const elements = tail ? tail.split("!") : [];
  for (const el of elements) {
    if (el.startsWith("1s")) return el.slice(2);
  }
  return null;
}

function extractPlaceIdFromUrl(url) {
  try {
    const chijMatch = url.match(/(ChIJ[0-9A-Za-z_-]{23,})/);
    if (chijMatch) return chijMatch[1];

    const parsed = new URL(url);
    const q = parsed.searchParams.get("q") || "";
    const qMatch = q.match(/place_id:?(ChIJ[0-9A-Za-z_-]{23,})/);
    if (qMatch) return qMatch[1];

    const direct = parsed.searchParams.get("place_id");
    if (direct) return direct;

    const dataMatch = url.match(/\/data=([^?\u0026#]+)/);
    if (dataMatch) {
      return extractPlaceIdFromData(decodeURIComponent(dataMatch[1]));
    }
    return null;
  } catch {
    return null;
  }
}

async function resolveByLatLng(name, lat, lng) {
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_API_KEY,
      "X-Goog-FieldMask": "places.id,places.displayName,places.rating,places.reviews,places.types",
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

    if (/(ChIJ[0-9A-Za-z_-]{23,})/.test(expanded)) {
      return { url: expanded, resolved: null };
    }

    const resolved = await resolvePlaceFromLongUrl(expanded);
    return { url: expanded, resolved };
  } catch {
    return { url, resolved: null };
  }
}

async function fetchPlaceDetails(placeId) {
  const apiUrl = `https://places.googleapis.com/v1/places/${encodeURIComponent(
    placeId
  )}?fields=id,displayName,rating,reviews,types&languageCode=ja&key=${GOOGLE_API_KEY}`;

  const response = await fetch(apiUrl);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(JSON.stringify(data));
  }
  return data;
}

function formatResponse(data, placeIdUsed) {
  const reviews = (data.reviews || [])
    .filter((r) => r.originalText?.text)
    .map((r) => ({
      text: r.originalText.text,
      rating: r.rating ?? null,
    }));

  return {
    name: data.displayName?.text || data.displayName || "名称不明",
    rating: data.rating ?? null,
    placeId: placeIdUsed,
    types: data.types || [],
    reviews,
  };
}

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

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

  try {
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

    let data;
    let placeIdUsed = placeId;

    if (resolvedPlace) {
      data = resolvedPlace;
      placeIdUsed = resolvedPlace.id;
    } else {
      data = await fetchPlaceDetails(placeId);
    }

    return res.status(200).json(formatResponse(data, placeIdUsed));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
