import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const rootDir = path.resolve(fileURLToPath(import.meta.url), '../..');
const staticDir = path.join(rootDir, 'static');
const iconsDir = path.join(staticDir, 'icons');
const svgPath = path.join(staticDir, 'favicon.svg');

const BRAND_BACKGROUND = '#004170';

async function main() {
    await mkdir(iconsDir, { recursive: true });
    const svgBuffer = await readFile(svgPath);

    await sharp(svgBuffer).resize(192, 192).png().toFile(path.join(iconsDir, 'icon-192.png'));
    await sharp(svgBuffer).resize(512, 512).png().toFile(path.join(iconsDir, 'icon-512.png'));

    const maskableGlyph = await sharp(svgBuffer).resize(358, 358).toBuffer();
    await sharp({
        create: {
            width: 512,
            height: 512,
            channels: 4,
            background: BRAND_BACKGROUND,
        },
    })
        .composite([{ input: maskableGlyph, gravity: 'center' }])
        .png()
        .toFile(path.join(iconsDir, 'maskable-512.png'));

    const appleGlyph = await sharp(svgBuffer).resize(126, 126).toBuffer();
    await sharp({
        create: {
            width: 180,
            height: 180,
            channels: 4,
            background: BRAND_BACKGROUND,
        },
    })
        .composite([{ input: appleGlyph, gravity: 'center' }])
        .flatten({ background: BRAND_BACKGROUND })
        .png()
        .toFile(path.join(iconsDir, 'apple-touch-icon.png'));

    console.log('Generated icons in', iconsDir);
}

main();
