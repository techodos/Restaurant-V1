"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useReducedMotion } from "motion/react";
import { cn } from "@/shared/utils";
import type { StageMotion } from "./burger-scene";

// three.js + R3F load only here, only in the browser, only after the capability check below
const BurgerScene = dynamic(() => import("./burger-scene"), { ssr: false });

interface HeroStageProps {
  /** static picture shown on the server render, while the scene loads, and as the fallback */
  poster: string | null;
  posterAlt: string;
  modelUrl: string | null;
  brand: string;
  accent: string;
  label: string;
}

/**
 * Can this device draw the scene well? No WebGL, software-only WebGL, Save-Data, or a low-end device (≤ 2 GB
 * memory or ≤ 2 CPU cores, where the browser tells us) keeps the static poster instead.
 */
function canRender3d(): boolean {
  try {
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    if (nav.connection?.saveData) return false;
    if (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 2) return false;
    if (typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency <= 2) return false;
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2") ?? probe.getContext("webgl");
    if (!gl) return false;
    // WebGL drawn on the CPU (no GPU acceleration: SwiftShader, llvmpipe, Microsoft Basic Render) can stall
    // the whole page; treat it as low-end
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = String(debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    const software = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer);
    gl.getExtension("WEBGL_lose_context")?.loseContext(); // free the probe's context straight away
    return !software;
  } catch {
    return false;
  }
}

/** only http(s) URLs and site paths; anything else falls back to the built-in model */
function safeModelUrl(url: string | null): string | null {
  return url && /^(https?:\/\/|\/(?!\/))/i.test(url) ? url : null;
}

export function HeroStage({ poster, posterAlt, modelUrl, brand, accent, label }: HeroStageProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const motion = useRef<StageMotion>({ x: 0, y: 0, scroll: 0 });
  const reduced = useReducedMotion() ?? false;
  const [capable, setCapable] = useState(false);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(true);

  useEffect(() => {
    setCapable(canRender3d());
  }, []);

  // stop drawing while the hero is off screen
  useEffect(() => {
    const element = wrap.current;
    if (!capable || !element) return;
    const observer = new IntersectionObserver(([entry]) => setActive(Boolean(entry?.isIntersecting)), { rootMargin: "120px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [capable]);

  // pointer and scroll feed the scene through a ref: no React re-render per event
  useEffect(() => {
    if (!capable || reduced) return;
    const onPointer = (event: PointerEvent) => {
      motion.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      motion.current.y = -((event.clientY / window.innerHeight) * 2 - 1);
    };
    const onScroll = () => {
      const height = wrap.current?.closest("section")?.offsetHeight ?? window.innerHeight;
      motion.current.scroll = Math.min(Math.max(window.scrollY / (height * 0.8), 0), 1);
    };
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("scroll", onScroll);
    };
  }, [capable, reduced]);

  return (
    <div ref={wrap} className="relative aspect-square w-full" role="img" aria-label={label}>
      {/* the poster: a tilted "sticker" of the restaurant's photo; fades out once the 3D scene is drawn */}
      <div
        aria-hidden
        className={cn(
          "absolute inset-[14%] transition-[opacity,transform] duration-700 [transition-timing-function:var(--ease-out)]",
          ready ? "scale-90 opacity-0" : "opacity-100",
        )}
      >
        <div className="relative size-full rotate-[-6deg] overflow-hidden rounded-[2rem] border-4 border-white/90 bg-[radial-gradient(circle_at_30%_25%,color-mix(in_srgb,var(--color-brand-accent)_70%,white),var(--color-brand))] shadow-[0_30px_60px_-20px_rgb(0_0_0/0.6)]">
          {poster ? <Image src={poster} alt={posterAlt} fill sizes="(min-width: 1024px) 40vw, 80vw" priority className="object-cover" /> : null}
        </div>
      </div>

      {capable ? (
        <div className={cn("absolute inset-0 transition-opacity duration-700", ready ? "opacity-100" : "opacity-0")}>
          <BurgerScene
            brand={brand}
            accent={accent}
            modelUrl={safeModelUrl(modelUrl)}
            animate={!reduced}
            active={active}
            motion={motion}
            onReady={() => setReady(true)}
            onLost={() => {
              setReady(false);
              setCapable(false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
