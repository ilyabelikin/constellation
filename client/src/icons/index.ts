import { Pickaxe, Zap, Landmark, FlaskConical } from "lucide";

type IconNode = [tag: string, attrs: Record<string, string | number>][];

const SVG_ATTRS = [
  'xmlns="http://www.w3.org/2000/svg"',
  'width="24"',
  'height="24"',
  'viewBox="0 0 24 24"',
  'fill="none"',
  'stroke="currentColor"',
  'stroke-width="2"',
  'stroke-linecap="round"',
  'stroke-linejoin="round"',
].join(" ");

function iconToSvg(node: IconNode): string {
  const children = node
    .map(([tag, attrs]) => {
      const a = Object.entries(attrs)
        .map(([k, v]) => `${k}="${v}"`)
        .join(" ");
      return `<${tag} ${a}/>`;
    })
    .join("");
  return `<svg ${SVG_ATTRS}>${children}</svg>`;
}

export const icons = {
  pickaxe: iconToSvg(Pickaxe as IconNode),
  energy: iconToSvg(Zap as IconNode),
  ruins: iconToSvg(Landmark as IconNode),
  science: iconToSvg(FlaskConical as IconNode),
} as const;

export type IconName = keyof typeof icons;
