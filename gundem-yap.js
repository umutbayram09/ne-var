// YouTube gündemi: trend ve kanal verilerindeki değişikliklerden kısa haber cümleleri üretir.
const fs = require("fs");
const oku = (yol, varsayilan) => { try { return JSON.parse(fs.readFileSync(yol, "utf8")); } catch (e) { return varsayilan; } };

const eskiTrend = oku("/tmp/eski-trend.json", { videolar: [] }).videolar || [];
const yeniTrend = oku("data/trend.json", { videolar: [] }).videolar || [];
const eskiAkis = oku("/tmp/eski-akis.json", { videolar: [] }).videolar || [];
const yeniAkis = oku("data/akis.json", { videolar: [] }).videolar || [];
const kayit = oku("data/gundem.json", { olaylar: [] });

let olaylar = kayit.olaylar || [];
const bilinen = new Set(olaylar.map(o => o.id));
const simdi = new Date();
const simdiYazi = simdi.toISOString();
let eklenen = 0;

const ekle = (id, tur, metin, v) => {
  if (bilinen.has(id)) return;
  bilinen.add(id);
  olaylar.push({ id, tur, metin, tarih: simdiYazi, videoId: v.id, baslik: v.baslik, kanal: v.kanal, kanalId: v.kanalId, resim: v.resim });
  eklenen++;
};
const tirnak = s => "“" + s + "”";
const saatYaz = t => new Date(t).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", weekday: "long", hour: "2-digit", minute: "2-digit" });

// 1. Trend değişiklikleri (önceki veri yoksa ilk çalışmada sel olmasın diye atlanır)
if (eskiTrend.length) {
  const eskiSira = new Map(eskiTrend.map((v, i) => [v.id, i + 1]));
  yeniTrend.slice(0, 20).forEach((v, i) => {
    const sira = i + 1;
    const once = eskiSira.get(v.id);
    if (!once) {
      ekle("trend-" + v.id, "trend", v.kanal + " kanalının " + tirnak(v.baslik) + " videosu trendlere " + sira + ". sıradan girdi.", v);
    } else if (sira === 1 && once !== 1) {
      ekle("zirve-" + v.id, "zirve", tirnak(v.baslik) + " trendlerin zirvesine yerleşti. " + v.kanal + " kanalının videosu " + once + ". sıradan 1. sıraya çıktı.", v);
    }
  });
}

// 2. Canlı yayınlar ve planlanan yayınlar
if (eskiAkis.length) {
  const eskiDurum = new Map(eskiAkis.map(v => [v.id, v.durum]));
  yeniAkis.forEach(v => {
    if (v.durum === "live" && eskiDurum.get(v.id) !== "live") {
      ekle("canli-" + v.id, "canli", v.kanal + " canlı yayına başladı: " + tirnak(v.baslik), v);
    }
    if (v.durum === "upcoming" && v.planlanan && !eskiDurum.has(v.id) && new Date(v.planlanan) > simdi) {
      ekle("plan-" + v.id, "plan", v.kanal + ", " + saatYaz(v.planlanan) + " için canlı yayın planladı: " + tirnak(v.baslik), v);
    }
  });
}

// 3. İzlenme eşikleri: son 3 günün videoları için
const ESIKLER = [[5000000, "5 milyon"], [1000000, "1 milyon"], [500000, "500 bin"], [100000, "100 bin"]];
const gorulen = new Set();
yeniAkis.concat(yeniTrend).forEach(v => {
  if (gorulen.has(v.id)) return;
  gorulen.add(v.id);
  if (v.durum && v.durum !== "none") return;
  const saat = (simdi - new Date(v.tarih)) / 3600000;
  if (!(saat > 0 && saat <= 72)) return;
  const esik = ESIKLER.find(([sayi]) => v.izlenme >= sayi);
  if (!esik) return;
  const id = "esik-" + esik[0] + "-" + v.id;
  if (bilinen.has(id)) return;
  ESIKLER.filter(([sayi]) => sayi < esik[0]).forEach(([sayi]) => bilinen.add("esik-" + sayi + "-" + v.id));
  const sure = saat < 24 ? Math.max(1, Math.round(saat)) + " saatte" : Math.round(saat / 24) + " günde";
  ekle(id, "esik", v.kanal + " kanalının " + tirnak(v.baslik) + " videosu " + sure + " " + esik[1] + " izlenmeyi geçti.", v);
});

// Son 48 saati ve en fazla 300 olayı tut
const sinir = simdi - 48 * 3600000;
olaylar = olaylar
  .filter(o => new Date(o.tarih).getTime() > sinir)
  .sort((a, b) => new Date(b.tarih) - new Date(a.tarih))
  .slice(0, 300);

fs.writeFileSync("data/gundem.json", JSON.stringify({ guncelleme: simdiYazi, olaylar }, null, 2));
console.log("Gundem: " + eklenen + " yeni olay, toplam " + olaylar.length);
