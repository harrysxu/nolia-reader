import { mkdir, readdir, stat, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

const root = process.cwd();
const targets = ["chrome", "edge", "firefox"];
const outputDir = path.join(root, "release");
await mkdir(outputDir, { recursive: true });

for (const target of targets) {
  const sourceDir = path.join(root, "dist", target);
  const zip = new JSZip();
  await addDir(zip, sourceDir, "");
  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  await writeFile(path.join(outputDir, `nolia-reader-${target}.zip`), buffer);
}

async function addDir(zip, sourceDir, zipDir) {
  const entries = await readdir(sourceDir);
  for (const entry of entries) {
    const absolute = path.join(sourceDir, entry);
    const relative = zipDir ? `${zipDir}/${entry}` : entry;
    const entryStat = await stat(absolute);
    if (entryStat.isDirectory()) {
      await addDir(zip, absolute, relative);
    } else {
      zip.file(relative, await readFile(absolute));
    }
  }
}
