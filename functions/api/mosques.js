// Cloudflare Pages Function: /api/mosques
export async function onRequestGet(context) {
  const { searchParams } = new URL(context.request.url);
  const lat = parseFloat(searchParams.get('lat') || '31.9539');
  const lon = parseFloat(searchParams.get('lng') || searchParams.get('lon') || '35.9106');
  const radius = Math.min(parseInt(searchParams.get('rad') || '67000', 10), 100000);

  const xr = (e, t, i, s) => {
    const o = Math.PI / 180,
      a = Math.sin((i - e) * o / 2) ** 2 + Math.cos(e * o) * Math.cos(i * o) * Math.sin((s - t) * o / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(a));
  };

  const dLat = radius / 111320;
  const dLon = radius / (111320 * Math.cos(lat * Math.PI / 180));
  const s1 = (lat - dLat).toFixed(4);
  const n1 = (lat + dLat).toFixed(4);
  const w1 = (lon - dLon).toFixed(4);
  const e1 = (lon + dLon).toFixed(4);

  // Overpass QL with quadtile spatial indexing (up to 5x faster)
  const q = `[out:json][timeout:25];(node[amenity=place_of_worship][religion=muslim](${s1},${w1},${n1},${e1});way[amenity=place_of_worship][religion=muslim](${s1},${w1},${n1},${e1});node[building=mosque](${s1},${w1},${n1},${e1});way[building=mosque](${s1},${w1},${n1},${e1}););out center qt;`;

  const mirrors = [
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass.openstreetmap.fr/api/interpreter',
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];

  let elements = [];
  for (const m of mirrors) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(`${m}?data=${encodeURIComponent(q)}`, {
        signal: controller.signal,
        headers: { 'User-Agent': 'NoorAlHidayah/1.0 (Cloudflare Edge)' }
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        if (data && data.elements && data.elements.length > 0) {
          elements = data.elements;
          break;
        }
      }
    } catch {}
  }

  // Fallback to Nominatim if all Overpass instances fail
  if (!elements || elements.length === 0) {
    try {
      const nomUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=50&accept-language=ar&bounded=1&viewbox=${w1},${n1},${e1},${s1}&q=${encodeURIComponent('مسجد')}`;
      const res = await fetch(nomUrl, {
        headers: { 'User-Agent': 'NoorAlHidayah/1.0 (Cloudflare Edge)' }
      });
      if (res.ok) {
        const nomData = await res.json();
        if (Array.isArray(nomData)) {
          elements = nomData.map(f => ({
            type: f.osm_type ? f.osm_type[0] : 'n',
            id: f.osm_id,
            lat: +f.lat,
            lon: +f.lon,
            tags: { name: f.name || f.display_name?.split('،')[0]?.trim() || 'مسجد' }
          }));
        }
      }
    } catch {}
  }

  // Process & Deduplicate
  const Qu = 'مسجد (بلا اسم في الخريطة)';
  const mapped = elements
    .map(h => {
      const f = h.lat ?? h.center?.lat;
      const p = h.lon ?? h.center?.lon;
      const v = h.tags || {};
      const name = v['name:ar'] || v.name || Qu;
      const addr = [v['addr:street'], v['addr:suburb'], v['addr:city']].filter(Boolean).join('، ');
      const dist = xr(lat, lon, f, p);
      return {
        id: (h.type || 'n') + h.id,
        la: f,
        lo: p,
        n: name,
        ad: addr,
        d: dist
      };
    })
    .filter(m => m.la != null && m.d <= (radius / 1000))
    .sort((a, b) => a.d - b.d);

  return new Response(JSON.stringify(mapped), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600'
    }
  });
}
