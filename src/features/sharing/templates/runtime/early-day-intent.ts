// Server-rendered dates can be touched before React's event listeners are ready.
// Capture only explicit day buttons; replay the latest intent after hydration.
export type PublicDayIntentRoot = HTMLElement & { publicDayIntent?: string };

export const earlyDayIntentScript = `(() => {
  const root = document.currentScript?.closest('.public-itinerary-shell');
  if (!root) return;
  const capture = (event) => {
    if (root.dataset.publicReaderReady === 'true') return;
    const button = event.target instanceof Element
      ? event.target.closest('button[data-public-day-target]') : null;
    if (button) root.publicDayIntent = button.dataset.publicDayTarget;
  };
  root.addEventListener('click', capture, true);
  root.addEventListener('public-reader-ready', () => {
    root.removeEventListener('click', capture, true);
  }, { once: true });
})();`;
