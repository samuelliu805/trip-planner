/** Select within the existing `photos` response, retaining provider order on ties.
 * Missing dimensions keep the original fallback; no extra lookup or pixel analysis.
 */
export function selectGooglePlacePhoto<
  Photo extends { name: string; widthPx?: unknown; heightPx?: unknown },
>(photos: Photo[]) {
  function score(photo: Photo) {
    const { widthPx: width, heightPx: height } = photo;
    if (
      typeof width !== "number" ||
      typeof height !== "number" ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    )
      return 0;
    const ratio = width / height;
    const landscape = ratio >= 1.2 && ratio <= 2.1;
    const sufficient = width >= 800 && height >= 400;
    return (
      (landscape ? 30 : ratio >= 0.8 && ratio <= 2.5 ? 10 : -10) +
      (sufficient ? 10 : -10) -
      Math.min(Math.abs(ratio - 1.5), 3)
    );
  }
  return photos.reduce<Photo | null>(
    (best, photo) => (!best || score(photo) > score(best) ? photo : best),
    null,
  );
}
