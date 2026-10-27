import type { Page } from "@playwright/test";

/**
 * Layout defects a screenshot shows but a plain "no horizontal scroll" check misses. Runs inside the page;
 * returns one readable line per defect. Rules (each one found a real bug in the 2026-10-18 audit):
 * - overflow:   the document is wider than the viewport.
 * - escape:     an element sticks out of the viewport (outside any horizontal scroller).
 * - clipped:    a control is cut off by an `overflow: hidden|clip` ancestor (the grid menu's "Add to Cart" was).
 * - overlap:    two controls in the same layer cover each other (input under its own button, etc.).
 * - text:       text cut off by its box with no ellipsis / line clamp.
 * Hover-revealed (opacity 0), sr-only and off-screen drawer content is ignored.
 */
export async function auditLayout(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const defects: string[] = [];
    const describe = (el: Element) => {
      const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 3).join(".") : "";
      const label = ((el as HTMLElement).innerText || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 32);
      return `<${el.tagName.toLowerCase()}${cls ? "." + cls : ""}> "${label}"`;
    };
    const shown = (el: Element) => {
      for (let node: Element | null = el; node; node = node.parentElement) {
        const s = getComputedStyle(node);
        if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
        if (node.closest("[inert], [aria-hidden='true']") && node === el) return false;
      }
      const r = el.getBoundingClientRect();
      return r.width > 2 && r.height > 2;
    };
    const srOnly = (el: Element) => {
      const s = getComputedStyle(el);
      return s.position === "absolute" && (s.clip !== "auto" || s.clipPath !== "none") && el.getBoundingClientRect().width <= 1;
    };
    const scrollsX = (el: Element) => /(auto|scroll)/.test(getComputedStyle(el).overflowX) && el.scrollWidth > el.clientWidth;
    const inScroller = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) if (scrollsX(p)) return true;
      return false;
    };
    const layerOf = (el: Element) => {
      for (let p: Element | null = el; p; p = p.parentElement) {
        const pos = getComputedStyle(p).position;
        if (pos === "fixed" || pos === "sticky") return p;
      }
      return document.body;
    };

    if (document.documentElement.scrollWidth > vw + 1) defects.push(`overflow: page is ${document.documentElement.scrollWidth - vw}px wider than the viewport`);

    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || (r.right <= vw + 1 && r.left >= -1)) continue;
      if (srOnly(el) || inScroller(el) || !shown(el)) continue;
      const s = getComputedStyle(el);
      if (s.position === "fixed" && (r.left >= vw - 1 || r.right <= 1)) continue; // a closed drawer parked off-screen
      // an ancestor that clips it already hides the overhang, and its own rule below reports controls
      let clippedAway = false;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (/(hidden|clip)/.test(getComputedStyle(p).overflowX)) { const pr = p.getBoundingClientRect(); if (pr.right <= vw + 1 && pr.left >= -1) { clippedAway = true; break; } }
      }
      if (clippedAway) continue;
      defects.push(`escape: ${describe(el)} spans ${Math.round(r.left)}..${Math.round(r.right)} of ${vw}`);
      if (defects.length > 12) break;
    }

    const controls = [...document.querySelectorAll<HTMLElement>(
      "a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=radio], [role=switch], [role=checkbox]",
    )].filter((el) => !srOnly(el) && shown(el) && !(el.matches("input[type=radio], input[type=checkbox]") && el.closest("label")));

    for (const el of controls) {
      const r = el.getBoundingClientRect();
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const s = getComputedStyle(p);
        const clipX = /(hidden|clip)/.test(s.overflowX);
        const clipY = /(hidden|clip)/.test(s.overflowY);
        if (!clipX && !clipY) continue;
        if (scrollsX(p) || (/(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight)) break;
        const pr = p.getBoundingClientRect();
        const cutX = clipX && (r.left < pr.left - 2 || r.right > pr.right + 2);
        const cutY = clipY && (r.top < pr.top - 2 || r.bottom > pr.bottom + 2);
        // fully outside = a carousel slide or collapsed panel, not a clipped control
        const outside = r.right <= pr.left || r.left >= pr.right || r.bottom <= pr.top || r.top >= pr.bottom;
        if ((cutX || cutY) && !outside) defects.push(`clipped: ${describe(el)} is cut off by ${describe(p)}`);
        break;
      }
    }

    const boxes = controls.map((el) => ({ el, r: el.getBoundingClientRect(), layer: layerOf(el) }));
    // an action drawn inside a field (show password, clear) is fine when the field's padding keeps its text clear of it
    const inFieldAction = (field: (typeof boxes)[number], action: (typeof boxes)[number]) => {
      if (!field.el.matches("input, textarea") || action.el.matches("input, select, textarea")) return false;
      const s = getComputedStyle(field.el);
      const textLeft = field.r.left + parseFloat(s.paddingLeft);
      const textRight = field.r.right - parseFloat(s.paddingRight);
      return action.r.left >= textRight - 1 || action.r.right <= textLeft + 1;
    };
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!, b = boxes[j]!;
        if (a.layer !== b.layer || a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (w > 4 && h > 4 && !inFieldAction(a, b) && !inFieldAction(b, a)) defects.push(`overlap: ${describe(a.el)} and ${describe(b.el)} overlap by ${Math.round(w)}x${Math.round(h)}px`);
      }
    }

    for (const el of document.querySelectorAll<HTMLElement>("body *")) {
      if (el.children.length > 0 || !el.textContent?.trim() || !shown(el) || srOnly(el)) continue;
      const s = getComputedStyle(el);
      if (!/(hidden|clip)/.test(s.overflowX) || s.textOverflow === "ellipsis" || s.webkitLineClamp !== "none") continue;
      if (el.scrollWidth > el.clientWidth + 1) defects.push(`text: ${describe(el)} is cut off (${el.scrollWidth}px in ${el.clientWidth}px)`);
    }
    return [...new Set(defects)];
  });
}
