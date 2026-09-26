/**
 * Signature interaction: the dish's photo plate travels into the tray in one decisive arc.
 * Plain WAAPI (no React state, no re-render): a fixed-position clone of the image is animated from
 * its box to whichever tray target is visible (header button on desktop, the dock on phones), then
 * removed. With reduced motion there is no flight; the tray count still ticks.
 */
export const TRAY_LANDED_EVENT = "rp:tray-landed";

function visibleTarget(): HTMLElement | null {
  const targets = Array.from(document.querySelectorAll<HTMLElement>("[data-tray-target]"));
  return (
    targets.find((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
    }) ?? null
  );
}

export function flyToTray(source: HTMLImageElement | null): void {
  const landed = () => window.dispatchEvent(new CustomEvent(TRAY_LANDED_EVENT));
  const target = visibleTarget();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!source || !target || reduce || !source.currentSrc) {
    landed();
    return;
  }

  const from = source.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  const size = Math.min(from.width, from.height, 160);
  const startX = from.left + from.width / 2 - size / 2;
  const startY = from.top + from.height / 2 - size / 2;
  const dx = to.left + to.width / 2 - (startX + size / 2);
  const dy = to.top + to.height / 2 - (startY + size / 2);

  const ghost = document.createElement("img");
  ghost.src = source.currentSrc;
  ghost.alt = "";
  ghost.setAttribute("aria-hidden", "true");
  Object.assign(ghost.style, {
    position: "fixed",
    left: `${startX}px`,
    top: `${startY}px`,
    width: `${size}px`,
    height: `${size}px`,
    objectFit: "cover",
    borderRadius: "16px",
    zIndex: "60",
    pointerEvents: "none",
    boxShadow: "0 18px 40px -16px rgba(0,0,0,0.45)",
    willChange: "transform, opacity",
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(ghost);

  // an arc: rise slightly first, then drop into the target (strong in-out, well under a second)
  const animation = ghost.animate(
    [
      { transform: "translate(0, 0) scale(1)", opacity: 1, borderRadius: "16px" },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 60}px) scale(0.62)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.12)`, opacity: 0.2, borderRadius: "999px" },
    ],
    { duration: 620, easing: "cubic-bezier(0.77, 0, 0.175, 1)", fill: "forwards" },
  );
  animation.onfinish = () => {
    ghost.remove();
    landed();
  };
}
