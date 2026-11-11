"use client";
import { useCallback, useRef, useState } from "react";

export function useToast() {
  const [msg, setMsg] = useState<{ text: string; kind: "ok" | "err" } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((text: string, kind: "ok" | "err" = "ok") => {
    setMsg({ text, kind });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 3500);
  }, []);

  const node = msg ? <div className={`toast toast-${msg.kind}`} role="status">{msg.text}</div> : null;
  return { toast, node };
}