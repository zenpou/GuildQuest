// Optional authoring helper; generated PNGs are retained under artifacts/source-art.
// Requires sharp, or SHARP_MODULE pointing to a bundled sharp installation.
const sharp = require(process.env.SHARP_MODULE || 'sharp');
(async () => {
  for (const id of ['guild-dawn','ruins-vow']) {
    await sharp(`artifacts/source-art/${id}.png`).webp({quality:85}).toFile(`public/art/${id}.webp`);
  }
  for (const [file,size] of [['icon-192',192],['icon-512',512],['maskable-512',512],['apple-touch-icon',180]]) {
    await sharp('public/icons/guild.svg').resize(size,size).png().toFile(`public/icons/${file}.png`);
  }
})();
