/**
 * Resolves once the screen has stopped showing skeleton loaders (the shimmering outlines AppLoader draws while a
 * screen fetches its data), but not before `minMs` and never later than `maxMs`. Used so the launch logo and the
 * pull-to-refresh logo stay up until real content is behind them, instead of handing the user over to skeletons.
 * `minMs` / `maxMs` count from now.
 */
export function whenSettled(minMs: number, maxMs: number): Promise<void> {
  const start = performance.now();
  return new Promise((resolve) => {
    let quiet = 0;
    const tick = () => {
      const elapsed = performance.now() - start;
      const loading = document.querySelector("#app .skeleton") != null;
      quiet = loading ? 0 : quiet + 1;
      // Two quiet checks in a row: a screen that swaps one loader for the next does not count as settled.
      if (elapsed >= maxMs || (elapsed >= minMs && quiet >= 2)) {
        resolve();
        return;
      }
      window.setTimeout(tick, 100);
    };
    window.setTimeout(tick, 100);
  });
}
