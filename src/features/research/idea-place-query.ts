export function ideaPlaceQuery(
  name: string | null | undefined,
  location: string | null | undefined,
) {
  const title = name?.trim() ?? "";
  const area = location?.trim() ?? "";
  if (!title) return area;
  if (!area || title.toLocaleLowerCase().includes(area.toLocaleLowerCase())) return title;
  return `${title} ${area}`;
}
