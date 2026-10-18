/**
 * Full-screen 1920×1080 title cards for the demo video (intro, chapter, closing CTA). Plain HTML + CSS animations,
 * recorded live by `Recorder.card()`. Edit the copy and brand here.
 */

export const BRAND = {
  name: "TechOdos",
  tagline: "Restaurant ordering & operations, in one platform",
  cta: "Book a Free Demo",
  /** shown under the CTA; replace with your real site/contact */
  contact: "techodos.com  ·  thetechodos@gmail.com",
  green: "#1f6b4f",
  mint: "#9fe0b9",
  ink: "#0b1411",
};

const base = (body: string, extraCss = "") => `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=block" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1920px;height:1080px;overflow:hidden}
body{font-family:Inter,'Segoe UI',system-ui,sans-serif;color:#fff;background:radial-gradient(1200px 800px at 18% 12%,#1d5a43 0%,transparent 60%),radial-gradient(1000px 700px at 85% 90%,#123d2e 0%,transparent 60%),${BRAND.ink};display:grid;place-items:center;-webkit-font-smoothing:antialiased}
.grain{position:fixed;inset:0;background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:64px 64px;mask-image:radial-gradient(900px 600px at 50% 50%,#000 30%,transparent 80%)}
.mark{display:inline-grid;place-items:center;width:84px;height:84px;border-radius:24px;background:linear-gradient(145deg,${BRAND.mint},#4fbf88);box-shadow:0 20px 60px rgba(79,191,136,.35)}
.mark span{font-weight:800;font-size:40px;color:${BRAND.ink};letter-spacing:-.04em}
.word{font-weight:800;letter-spacing:-.035em}
.up{opacity:0;transform:translateY(26px)}
body.go .up{animation:up .9s cubic-bezier(.2,.8,.2,1) forwards}
@keyframes up{to{opacity:1;transform:none}}
.d1{animation-delay:.15s}.d2{animation-delay:.45s}.d3{animation-delay:.75s}.d4{animation-delay:1.05s}.d5{animation-delay:1.35s}
.kicker{font-size:20px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:${BRAND.mint}}
${extraCss}
</style></head><body><div class="grain"></div>${body}</body></html>`;

export function introCard(): string {
  return base(
    `<div style="text-align:center;position:relative">
      <div class="up d1" style="display:flex;align-items:center;justify-content:center;gap:26px">
        <div class="mark"><span>T</span></div>
        <div class="word" style="font-size:112px">${BRAND.name}</div>
      </div>
      <p class="up d2" style="margin-top:34px;font-size:40px;font-weight:500;color:#d6e9df">${BRAND.tagline}</p>
      <div class="up d3" style="margin-top:56px;display:flex;gap:16px;justify-content:center">
        ${["Online ordering", "Kitchen display", "Live order tracking", "Reports & payments"].map((t) => `<span style="font-size:22px;font-weight:600;padding:12px 22px;border-radius:999px;background:rgba(255,255,255,.07);box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)">${t}</span>`).join("")}
      </div>
    </div>`,
  );
}

export function chapterCard(kicker: string, title: string, subtitle: string): string {
  return base(
    `<div style="text-align:center;max-width:1400px">
      <p class="kicker up d1">${kicker}</p>
      <h1 class="word up d2" style="margin-top:22px;font-size:96px;line-height:1.05">${title}</h1>
      <p class="up d3" style="margin-top:28px;font-size:34px;color:#cfe3d8;font-weight:500">${subtitle}</p>
    </div>`,
  );
}

export function outroCard(): string {
  return base(
    `<div style="text-align:center">
      <div class="up d1" style="display:flex;align-items:center;justify-content:center;gap:22px">
        <div class="mark" style="width:72px;height:72px;border-radius:20px"><span style="font-size:34px">T</span></div>
        <div class="word" style="font-size:80px">${BRAND.name}</div>
      </div>
      <h1 class="word up d2" style="margin-top:46px;font-size:76px;line-height:1.08">Your restaurant, online and in control.</h1>
      <p class="up d3" style="margin-top:26px;font-size:32px;color:#cfe3d8">Branded ordering website · Admin & kitchen · Multi-branch · Payments</p>
      <div class="up d4" style="margin-top:58px"><span style="display:inline-block;font-size:38px;font-weight:800;color:${BRAND.ink};background:linear-gradient(145deg,${BRAND.mint},#56c48e);padding:26px 60px;border-radius:999px;box-shadow:0 24px 70px rgba(86,196,142,.4)">${BRAND.cta} →</span></div>
      <p class="up d5" style="margin-top:34px;font-size:26px;color:#a9c7b8;font-weight:500">${BRAND.contact}</p>
    </div>`,
  );
}
