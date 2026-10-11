"use client";

import { useEffect } from "react";

const CARDS = "article[data-dish].flex, figure.group";
const MAX_DEG = 7;

/**
 * 3D template only: dish cards and gallery photos lean toward the pointer. One delegated, rAF-throttled
 * listener for the whole page; it only writes two CSS variables (globals.css turns them into a perspective
 * transform). Mouse and trackpad only; nothing on touch, and nothing under prefers-reduced-motion.
 */
export function DepthTilt() {
  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let current: HTMLElement | null = null;
    let frame = 0;
    let last: PointerEvent | null = null;

    const release = () => {
      if (!current) return;
      current.style.removeProperty("--tilt-x");
      current.style.removeProperty("--tilt-y");
      current.removeAttribute("data-tilting");
      current = null;
    };

    const apply = () => {
      frame = 0;
      const event = last;
      if (!event) return;
      const card = event.target instanceof Element ? event.target.closest<HTMLElement>(CARDS) : null;
      if (card !== current) release();
      if (!card) return;
      const box = card.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width - 0.5;
      const y = (event.clientY - box.top) / box.height - 0.5;
      card.style.setProperty("--tilt-x", `${(-y * MAX_DEG).toFixed(2)}deg`);
      card.style.setProperty("--tilt-y", `${(x * MAX_DEG).toFixed(2)}deg`);
      card.setAttribute("data-tilting", "");
      current = card;
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || !fine.matches || reduce.matches) return;
      last = event;
      if (!frame) frame = requestAnimationFrame(apply);
    };

    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", release);
    window.addEventListener("blur", release);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", release);
      window.removeEventListener("blur", release);
      if (frame) cancelAnimationFrame(frame);
      release();
    };
  }, []);

  return null;
}
