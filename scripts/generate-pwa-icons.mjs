// PWA 아이콘을 public/images/bogle.png(보글이 마스코트)에서 생성한다.
// 로고가 바뀌면 이 스크립트를 다시 실행해서 아이콘을 갱신하면 된다.
//   node scripts/generate-pwa-icons.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const SRC = "public/images/bogle.png";
const OUT_DIR = "public/icons";
// app/globals.css의 --bg-page(크림 배경)와 맞춘다.
const BG = "#f6ede0";

mkdirSync(OUT_DIR, { recursive: true });

async function trimmedCharacter() {
  // 원본은 흰 배경에 캐릭터가 가운데 작게 들어있는 정사각형 이미지라, 여백을
  // 잘라내고 캐릭터만 남긴 버퍼를 아이콘마다 재사용한다.
  return sharp(SRC).trim().toBuffer();
}

// size: 캔버스 한 변, scale: 캔버스 대비 캐릭터가 차지할 비율(작을수록 여백↑).
async function makeIcon(character, size, scale, outPath) {
  const contentSize = Math.round(size * scale);
  const resizedCharacter = await sharp(character)
    .resize(contentSize, contentSize, { fit: "inside" })
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 3, background: BG } })
    .composite([{ input: resizedCharacter, gravity: "center" }])
    .png()
    .toFile(outPath);
  console.log(`wrote ${outPath} (${size}x${size}, scale ${scale})`);
}

const character = await trimmedCharacter();

// 일반 아이콘 — 여백을 적당히 두되 꽉 차 보이게.
await makeIcon(character, 192, 0.82, `${OUT_DIR}/icon-192.png`);
await makeIcon(character, 512, 0.82, `${OUT_DIR}/icon-512.png`);
// 마스커블 아이콘 — OS가 원형/둥근사각형 등으로 잘라내므로, 안전 영역(가운데
// 지름 80%) 안에만 내용이 있도록 더 작게(56%) 배치한다.
await makeIcon(character, 512, 0.56, `${OUT_DIR}/icon-512-maskable.png`);
// iOS 홈 화면 아이콘 — 투명 배경을 무시하므로 불투명 배경으로 채운다(위와 동일).
await makeIcon(character, 180, 0.82, `${OUT_DIR}/apple-touch-icon.png`);

console.log("done");
