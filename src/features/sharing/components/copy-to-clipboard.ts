export async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Some embedded browsers expose the API but still deny permission.
    }
  }

  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "");
  input.style.cssText =
    "position:fixed;inset:0 auto auto 0;width:1px;height:1px;opacity:0;pointer-events:none;font-size:16px";
  document.body.append(input);
  input.select();
  input.setSelectionRange(0, text.length);

  try {
    if (!document.execCommand("copy")) throw new Error("Copy command was rejected");
  } finally {
    input.remove();
  }
}
