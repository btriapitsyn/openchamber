import { useEffect, useState } from "react";
import {
  fetchDesktopServerInfo,
  isDesktopRuntime,
  type DesktopServerInfo
} from "@/lib/desktop";

export const useDesktopServerInfo = (pollInterval = 5000): DesktopServerInfo | null => {
  const [info, setInfo] = useState<DesktopServerInfo | null>(null);

  useEffect(() => {
    if (!isDesktopRuntime()) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      const payload = await fetchDesktopServerInfo();
      if (!cancelled) {
        setInfo(payload);
        timer = setTimeout(poll, pollInterval);
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [pollInterval]);

  return info;
};
