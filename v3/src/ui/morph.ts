// Minimal DOM patching: update an element's children to match new HTML while
// keeping every node that stays the same in place. Re-rendering the HUD this
// way keeps hover states, focus and in-progress clicks intact (replacing
// innerHTML would recreate a button between mouse-down and mouse-up and
// swallow the click, and make hovered buttons blink on every update).

const template = document.createElement("template");

export function morphHtml(target: Element, html: string): void {
  template.innerHTML = html;
  morphChildren(target, template.content);
}

function sameKind(a: Node, b: Node): boolean {
  if (a.nodeType !== b.nodeType) return false;
  if (a.nodeType !== Node.ELEMENT_NODE) return true;
  const ea = a as Element;
  const eb = b as Element;
  // Different actions mean a different control: replace rather than morph.
  return ea.tagName === eb.tagName && ea.getAttribute("data-action") === eb.getAttribute("data-action") && ea.id === eb.id;
}

function morphChildren(target: Node, source: Node): void {
  const want = Array.from(source.childNodes);
  let cur = target.firstChild;
  for (const node of want) {
    if (cur && sameKind(cur, node)) {
      morphNode(cur, node);
      cur = cur.nextSibling;
    } else {
      target.insertBefore(node, cur);
    }
  }
  while (cur) {
    const next = cur.nextSibling;
    target.removeChild(cur);
    cur = next;
  }
}

function morphNode(el: Node, src: Node): void {
  if (el.nodeType === Node.TEXT_NODE || el.nodeType === Node.COMMENT_NODE) {
    if (el.nodeValue !== src.nodeValue) el.nodeValue = src.nodeValue;
    return;
  }
  const a = el as Element;
  const b = src as Element;
  for (const attr of Array.from(a.attributes)) if (!b.hasAttribute(attr.name)) a.removeAttribute(attr.name);
  for (const attr of Array.from(b.attributes)) if (a.getAttribute(attr.name) !== attr.value) a.setAttribute(attr.name, attr.value);
  // Form state lives in properties, not attributes.
  if (a instanceof HTMLInputElement && b instanceof HTMLInputElement) {
    if (a.type === "checkbox") a.checked = b.checked;
    return; // never clobber what the player is typing
  }
  if (a instanceof HTMLButtonElement) a.disabled = (b as HTMLButtonElement).disabled;
  morphChildren(a, b);
}
