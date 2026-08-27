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
    let pointerX = window.innerWidth / 2;
    let pointerY = window.innerHeight / 2;

    const renderPointer = () => {
      const xProgress = pointerX / window.innerWidth;
      const yProgress = pointerY / window.innerHeight;
      const watermarkX = (xProgress - 0.5) * 18;
      const watermarkY = (yProgress - 0.5) * 10;

      background.style.setProperty("--pointer-x", `${pointerX}px`);
      background.style.setProperty("--pointer-y", `${pointerY}px`);
      background.style.setProperty("--watermark-x", `${watermarkX}px`);
      background.style.setProperty("--watermark-y", `${watermarkY}px`);
      frame = 0;
    };

    const handlePointerMove = (event: PointerEvent) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (!frame) frame = window.requestAnimationFrame(renderPointer);
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
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
