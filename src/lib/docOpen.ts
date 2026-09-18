// Lets search results open a document directly on the Appendix page,
// even while the page is still mounting after navigation.
let pending: string | null = null;

export function requestDocOpen(latinCode: string) {
  pending = latinCode;
  window.dispatchEvent(new Event('doc-open-request'));
}

export function consumeDocOpen(): string | null {
  const c = pending;
  pending = null;
  return c;
}
