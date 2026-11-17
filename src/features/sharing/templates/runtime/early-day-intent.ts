// Server-rendered dates can be touched before React's event listeners are ready.
// Capture only explicit day buttons; replay the latest intent after hydration.
export type PublicDayIntentRoot = HTMLElement & { publicDayIntent?: string };

export const earlyDayIntentScript = `(() => {
  const key = Symbol.for('trip-planner.public-day-intent');
  if (document[key]) return;
  document[key] = true;
  const capture = (event) => {
    const button = event.target instanceof Element
      ? event.target.closest('button[data-public-day-target]') : null;
    const root = button?.closest('.public-itinerary-shell');
    if (root && root.dataset.publicReaderReady !== 'true')
      root.publicDayIntent = button.dataset.publicDayTarget;
  };
  // Hydration can stop propagation at React's container before it reaches the
  // reader. Document capture also survives a streamed reader being replaced.
  document.addEventListener('click', capture, true);
})();`;
