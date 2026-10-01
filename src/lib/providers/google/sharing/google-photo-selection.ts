/** Preserve provider rank. Inspect at most five photos for an adequately sized,
 * ordinary landscape; unknown dimensions retain Google's original recommendation.
 */
export function selectGooglePlacePhoto<
  Photo extends { name: string; widthPx?: unknown; heightPx?: unknown },
>(photos: Photo[]) {
  function acceptable(photo: Photo) {
    const { widthPx: width, heightPx: height } = photo;
    if (typeof width !== "number" || typeof height !== "number") return true;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
      return false;
    const ratio = width / height;
    return ratio >= 1.2 && ratio <= 2.1 && width >= 800 && height >= 400;
  }
  return photos.slice(0, 5).find(acceptable) ?? photos[0] ?? null;
}
