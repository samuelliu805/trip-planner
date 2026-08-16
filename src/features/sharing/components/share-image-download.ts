export function downloadShareImageParts(permanentSlug: string, partCount: number) {
  for (let partNumber = 1; partNumber <= partCount; partNumber += 1) {
    const link = document.createElement("a");
    link.download = "";
    link.href = `/share/image/${permanentSlug}/part/${partNumber}?download=1`;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
  }
}
