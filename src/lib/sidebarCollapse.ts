"use client";

import { useSyncExternalStore } from "react";

const COLLAPSE_KEY = "sidebar-collapsed";
const COLLAPSE_EVENT = "sidebarcollapsechange";

function subscribe(callback: () => void) {
  window.addEventListener(COLLAPSE_EVENT, callback);
  return () => window.removeEventListener(COLLAPSE_EVENT, callback);
}

function getSnapshot() {
  return localStorage.getItem(COLLAPSE_KEY) === "1";
}

function getServerSnapshot() {
  return false;
}

/** Same localStorage + custom-event pattern as ThemeToggle, so every sidebar consumer (nav links, header, footer) stays in sync without prop drilling. */
export function useSidebarCollapsed(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function toggleSidebarCollapsed() {
  const next = localStorage.getItem(COLLAPSE_KEY) !== "1";
  localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
  window.dispatchEvent(new Event(COLLAPSE_EVENT));
}
