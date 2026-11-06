import { useEffect, useState } from 'react';

/** Re-renderar varje frame medan `active` är sant. Returnerar performance.now(). */
export function useNow(active = true): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const loop = (t: number) => {
      setNow(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return now;
}
