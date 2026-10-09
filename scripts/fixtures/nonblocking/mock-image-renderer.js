export async function renderTimelineExport(input) {
  window.__renderedSnapshot = input.itinerary;
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 320;
  const context = canvas.getContext("2d");
  context.fillStyle = "white";
  context.fillRect(0, 0, 1080, 320);
  context.fillStyle = "black";
  context.font = "24px sans-serif";
  context.fillText(input.itinerary.metadata.title, 30, 60);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg"));
  return [{ blob, width: 1080, height: 320 }];
}
export async function sha256(blob) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()))]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}
