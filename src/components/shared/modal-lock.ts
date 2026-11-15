/** Shared by stacked native dialogs; queued close events cannot unlock another surface. */
const holders = new Set<symbol>();
let previousOverflow = "";
export function lockModalPage(holder: symbol) {
  if (!holders.size) previousOverflow = document.body.style.overflow;
  holders.add(holder); document.body.style.overflow = "hidden";
}
export function unlockModalPage(holder: symbol) {
  if (!holders.delete(holder)) return;
  if (!holders.size) document.body.style.overflow = previousOverflow;
}
