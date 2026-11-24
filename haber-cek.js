const fs = require("fs");
// Sadece YouTube dünyasıyla ilgili haberleri tutar: genel anahtar kelimeler + listedeki içerik üreticilerinin adları.
const GENEL = ["youtube", "youtuber", "twitch", "kick yayıncısı", "içerik üreticisi", "sosyal medya fenomeni"];
const KISI_KATEGORILERI = ["Eğlence ve Tepki", "Oyun", "Komedi ve Skeç", "Sohbet ve Podcast", "Aile ve Vlog", "Bilgi ve Belgesel", "Yemek", "Gezi", "Güzellik ve Moda", "Teknoloji"];
const BELIRSIZ = ["hayrettin", "beyaz kurt", "mantra", "tamer", "edis", "tefo", "lia minecraft", "onedio", "webtekno", "technopat", "teknoseyir", "megabayt", "shiftdelete.net", "donanımhaber", "yemek.com", "masterchef türkiye", "nefis yemek tarifleri", "arabam.com", "otokolik", "motor1 türkiye"];
const kucuk = s => (s || "").toLocaleLowerCase("tr");
let kanalAdlari = [];
try {
  kanalAdlari = JSON.parse(fs.readFileSync("data/kanallar.json", "utf8"))
    .filter(k => k.id && KISI_KATEGORILERI.includes(k.kategori))
    .map(k => kucuk(k.ad))
    .filter(ad => ad.length >= 5 && !BELIRSIZ.includes(ad));
} catch (e) {}
const ARANANLAR = [...new Set(GENEL.concat(kanalAdlari))];
const HARF = "a-zçğıöşüâîû0-9";
const kalip = ARANANLAR.map(k => [k, new RegExp("(^|[^" + HARF + "])" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "($|[^" + HARF + "])")]);
const eslesen = metin => { const m = kucuk(metin); const bulunan = kalip.find(([, r]) => r.test(m)); return bulunan ? bulunan[0] : null; };
const satirlar = fs.readFileSync("haber-kaynaklari.txt", "utf8").split("\n").map(s => s.trim()).filter(s => s && !s.startsWith("#"));
const cozum = s => (s || "")
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d)))
  .replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
const duzYazi = s => cozum(cozum(s).replace(/<[^>]+>/g, " ")).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const al = (x, ad) => { const m = x.match(new RegExp("<" + ad + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + ad + ">", "i")); return m ? m[1] : ""; };
const nitelik = (x, ad, n) => { const m = x.match(new RegExp("<" + ad + "\\b[^>]*?\\s" + n + "=[\"']([^\"']+)[\"']", "i")); return m ? cozum(m[1]) : ""; };
const oku = async (url) => {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; NeVarBot/1.0; +https://umutbayram09.github.io/ne-var/)" }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const ham = Buffer.from(await r.arrayBuffer());
  const bas = ham.subarray(0, 300).toString("latin1");
  const kod = ((bas.match(/encoding=["']([^"']+)["']/i) || [])[1] || (r.headers.get("content-type") || "").split("charset=")[1] || "utf-8").trim().toLowerCase();
  try { return new TextDecoder(kod).decode(ham); } catch (e) { return ham.toString("utf8"); }
};
const ayikla = (xml, kaynak, konu) => {
  const ogeler = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];
  return ogeler.map(x => {
    const baslik = duzYazi(al(x, "title"));
    let link = duzYazi(al(x, "link")) || nitelik(x, "link", "href") || duzYazi(al(x, "guid"));
    const tarihHam = duzYazi(al(x, "pubDate") || al(x, "dc:date") || al(x, "published") || al(x, "updated"));
    const t = new Date(tarihHam);
    const icerik = al(x, "description") || al(x, "summary") || al(x, "content:encoded") || al(x, "content");
    let resim = "";
    const enc = x.match(/<enclosure\b[^>]*>/i);
    if (enc && /image/i.test(enc[0])) resim = nitelik(enc[0], "enclosure", "url");
    resim = resim || nitelik(x, "media:content", "url") || nitelik(x, "media:thumbnail", "url") || nitelik(x, "image", "url") || duzYazi(al(x, "image"));
    if (!resim) { const img = cozum(icerik).match(/<img\b[^>]*?src=["']([^"']+)["']/i); if (img) resim = img[1]; }
    if (resim && !/^https?:\/\//i.test(resim)) resim = "";
    const ozet = duzYazi(icerik).slice(0, 220);
    return { baslik, link, kaynak, konu, tarih: isNaN(t) ? null : t.toISOString(), resim, ozet };
  }).filter(h => h.baslik && /^https?:\/\//i.test(h.link));
};
(async () => {
  const sinir = Date.now() - 7 * 86400000;
  const tum = [], rapor = [];
  for (const satir of satirlar) {
    const [kaynak, konu, url] = satir.split("|").map(s => (s || "").trim());
    if (!url) continue;
    try {
      const tumu = ayikla(await oku(url), kaynak, konu);
      const haberler = tumu
        .filter(h => !h.tarih || new Date(h.tarih).getTime() > sinir)
        .map(h => Object.assign(h, { eslesen: eslesen(h.baslik + " " + h.ozet) }))
        .filter(h => h.eslesen)
        .slice(0, 30);
      tum.push(...haberler);
      rapor.push({ kaynak, konu, url, durum: tumu.length ? "OK" : "BOS", okunan: tumu.length, adet: haberler.length });
    } catch (e) {
      rapor.push({ kaynak, konu, url, durum: "HATA", adet: 0, hata: e.message });
    }
  }
  const simdi = new Date().toISOString();
  tum.forEach(h => { if (!h.tarih) h.tarih = simdi; });
  const gorulen = new Set();
  const haberler = tum
    .filter(h => !gorulen.has(h.link) && gorulen.add(h.link))
    .sort((a, b) => new Date(b.tarih) - new Date(a.tarih))
    .slice(0, 500);
  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync("data/haberler.json", JSON.stringify({ guncelleme: simdi, haberler, kaynaklar: rapor }, null, 2));
  rapor.forEach(r => console.log((r.durum + "     ").slice(0, 6) + r.kaynak + "  (" + (r.okunan || 0) + " haber okundu, " + r.adet + " tanesi YouTube ile ilgili)" + (r.hata ? "  " + r.hata : "")));
  console.log("");
  console.log("Aranan kelime/kanal sayisi: " + ARANANLAR.length);
  console.log("Toplam: " + haberler.length + " YouTube haberi | calisan kaynak: " + rapor.filter(r => r.durum === "OK").length + "/" + rapor.length);
  const sorunlu = rapor.filter(r => r.durum !== "OK");
  if (sorunlu.length) console.log("Sorunlu kaynaklar: " + sorunlu.map(r => r.kaynak).join(", "));
})().catch(e => { console.error(e.message); process.exit(1); });
