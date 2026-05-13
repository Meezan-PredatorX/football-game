"use client";

import { useEffect, useRef } from "react";
import type Phaser from "phaser";

export default function PhaserGame() {
  const gameRef = useRef<Phaser.Game | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (gameRef.current || !containerRef.current) return;

    const initPhaser = async () => {
      const Phaser = (await import("phaser")).default;
      const { phaserConfig } = await import("@/lib/phaser/config");

      gameRef.current = new Phaser.Game({
        ...phaserConfig,
        parent: containerRef.current!,
      });
    };

    initPhaser();

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0, 
        width: "100vw", 
        height: "100vh",
       }}
    />
  );
}