/**
 * Ambient module declarations so the bundled image/CSS imports used by this
 * template typecheck under `tsc --noEmit`. The host app only ever referenced
 * images via public-path strings, so it never needed these. Scoped here as a
 * new file rather than modifying any existing config.
 *
 * (Vite's own `vite/client` types would cover these, but they aren't wired into
 * this project's tsconfig.)
 */

declare module "*.jpg" {
  const src: string;
  export default src;
}

declare module "*.jpeg" {
  const src: string;
  export default src;
}

declare module "*.png" {
  const src: string;
  export default src;
}

declare module "*.webp" {
  const src: string;
  export default src;
}

declare module "*.css";
