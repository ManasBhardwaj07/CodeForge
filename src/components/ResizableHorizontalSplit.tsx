"use client";
import React, { useRef, useEffect, useState } from "react";
import { Panel, Group, Separator, GroupImperativeHandle, Layout } from "react-resizable-panels";

export function ResizableHorizontalSplit({
  left,
  right,
  storageKey = "workspace-horizontal-layout",
}: {
  left: React.ReactNode;
  right: React.ReactNode;
  storageKey?: string;
}) {
  const [isMounted, setIsMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const panelGroupRef = useRef<GroupImperativeHandle>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMounted(true);
    const mediaQuery = window.matchMedia("(max-width: 639px)"); // sm
    const handleChange = () => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsMobile(mediaQuery.matches);
    };
    handleChange();
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (isMounted) {
      try {
        const savedLayout = localStorage.getItem(`${storageKey}-${isMobile ? 'v' : 'h'}`);
        if (savedLayout && panelGroupRef.current) {
          panelGroupRef.current.setLayout(JSON.parse(savedLayout));
        }
      } catch (e) {
        console.error("Failed to restore horizontal layout", e);
      }
    }
  }, [isMounted, isMobile, storageKey]);

  const handleLayoutChange = (layout: Layout) => {
    localStorage.setItem(`${storageKey}-${isMobile ? 'v' : 'h'}`, JSON.stringify(layout));
  };

  const desktopFallback = (
    <div className="flex w-full h-full">
      <div className="w-1/2 flex flex-col min-h-0 overflow-hidden border-r border-[#1e3058]">{left}</div>
      <div className="w-1/2 flex flex-col min-h-0 overflow-hidden">{right}</div>
    </div>
  );

  if (!isMounted) return desktopFallback;

  return (
    <Group 
      orientation={isMobile ? "vertical" : "horizontal"} 
      groupRef={panelGroupRef} 
      onLayoutChange={handleLayoutChange}
      className="w-full h-full"
    >
      <Panel defaultSize={40} minSize={20} className="flex flex-col min-h-0">
        {left}
      </Panel>
      <Separator className={`bg-[#0d1526] hover:bg-[#1e3058] active:bg-[#22d3ee]/30 transition-colors flex justify-center items-center group z-10 relative ${isMobile ? 'h-1.5 cursor-row-resize border-t border-b border-[#1e3058]' : 'w-1.5 cursor-col-resize border-l border-r border-[#1e3058]'}`}>
        <div className={`rounded-full bg-[#334155] group-hover:bg-[#94a3b8] transition-colors ${isMobile ? 'w-6 h-0.5' : 'h-6 w-0.5'}`} />
      </Separator>
      <Panel defaultSize={60} minSize={20} className="flex flex-col min-h-0">
        {right}
      </Panel>
    </Group>
  );
}

