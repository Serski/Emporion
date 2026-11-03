// Package the production build as one self-contained page for a claude.ai
// artifact: CSS and JS inlined, the page's own <head>/<body> stripped (the
// artifact host supplies them), images left as files beside it.
//   pnpm --filter @emporion/web build && node scripts/artifact.mjs
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const out = join(root, "dist-artifact");
const html = readFileSync(join(dist, "index.html"), "utf8");

const css = [...html.matchAll(/<link rel="stylesheet"[^>]*href="\.\/([^"]+\.css)"[^>]*>/g)].map((m) => readFileSync(join(dist, m[1]), "utf8")).join("\n");
const js = [...html.matchAll(/<script type="module"[^>]*src="\.\/([^"]+\.js)"[^>]*><\/script>/g)].map((m) => readFileSync(join(dist, m[1]), "utf8")).join("\n");
if (!css || !js) throw new Error("could not find the built CSS and JS in dist/index.html");
const fonts = (html.match(/<link rel="preconnect"[^>]*>|<link href="https:\/\/fonts\.googleapis\.com[^>]*>/g) ?? []).join("\n");

const page = `<title>Emporion</title>
<meta name="claude:viewport-fit-sides" content="cover">
${fonts}
<style>
${css}
</style>
<div id="root"></div>
<script type="module">
${js.replaceAll("</script", "<\\/script")}
</script>
`;

if (existsSync(out)) rmSync(out, { recursive: true });
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "index.html"), page);
cpSync(join(root, "public", "assets"), join(out, "assets"), { recursive: true });
cpSync(join(root, "public", "map"), join(out, "map"), { recursive: true });
console.log(`dist-artifact/index.html ${(page.length / 1024).toFixed(0)} KB`);
