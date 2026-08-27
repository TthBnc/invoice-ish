"use client";

import { useEffect, useRef } from "react";

export function InteractiveBackground() {
  const backgroundRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const background = backgroundRef.current;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarsePointer = window.matchMedia("(pointer: coarse)");

    if (!background || reducedMotion.matches || coarsePointer.matches) {
      return;
    }

    let frame = 0;
    let currentX = 0;
    let currentY = 0;
    let targetX = 0;
    let targetY = 0;

    const renderWatermark = () => {
      currentX += (targetX - currentX) * 0.12;
      currentY += (targetY - currentY) * 0.12;

      background.style.setProperty("--watermark-x", `${currentX}px`);
      background.style.setProperty("--watermark-y", `${currentY}px`);

      if (Math.abs(targetX - currentX) > 0.02 || Math.abs(targetY - currentY) > 0.02) {
        frame = window.requestAnimationFrame(renderWatermark);
      } else {
        frame = 0;
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      targetX = (event.clientX / window.innerWidth - 0.5) * 6;
      targetY = (event.clientY / window.innerHeight - 0.5) * 4;
      if (!frame) frame = window.requestAnimationFrame(renderWatermark);
    };

    const resetWatermark = () => {
      targetX = 0;
      targetY = 0;
      if (!frame) frame = window.requestAnimationFrame(renderWatermark);
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("blur", resetWatermark);
    document.documentElement.addEventListener("pointerleave", resetWatermark);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("blur", resetWatermark);
      document.documentElement.removeEventListener("pointerleave", resetWatermark);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={backgroundRef} className="interactive-background" aria-hidden="true">
      <div className="ledger-field" />
      <div className="background-watermark">INVOICE-ISH</div>
    </div>
  );
}
