import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");

const isaac = `<ellipse cx="32" cy="49" rx="13" ry="10" fill="#8b8b8b" stroke="#4c4c4c" stroke-width="2"/>
  <circle cx="32" cy="30" r="18" fill="#b6b6b6" stroke="#555555" stroke-width="2"/>
  <rect x="21" y="28" width="22" height="11" rx="3" fill="#343434" stroke="#171717" stroke-width="2"/>
  <rect x="24" y="31" width="7" height="5" fill="#d7d7d7"/><rect x="34" y="31" width="7" height="5" fill="#d7d7d7"/>
  <path d="M29 44q3 3 6 0" fill="none" stroke="#4d4d54" stroke-width="2"/>`;
const robot = `<rect x="38" y="6" width="17" height="17" rx="3" fill="#c2c2c2" stroke="#444444" stroke-width="2"/>
  <path d="M46 6V2" stroke="#444444" stroke-width="2"/><circle cx="46" cy="2" r="2" fill="#eeeeee"/>
  <rect x="41" y="11" width="4" height="5" fill="#eeeeee"/><rect x="49" y="11" width="4" height="5" fill="#eeeeee"/>
  <rect x="43" y="19" width="7" height="2" fill="#394452"/>`;
const creator = `<path d="M19 36Q3 24 8 47L22 51M45 36Q61 24 56 47L42 51" fill="#ededed" stroke="#9a9a9a" stroke-width="2"/>
  <ellipse cx="32" cy="50" rx="13" ry="10" fill="#c4c4c4" stroke="#666666" stroke-width="2"/>
  <circle cx="32" cy="30" r="18" fill="#dddddd" stroke="#666666" stroke-width="2"/>
  <path d="M25 30h3m8 0h3" stroke="#3e2e36" stroke-width="3"/><path d="M30 41q2 2 4 0" fill="none" stroke="#956f65" stroke-width="2"/>
  <ellipse cx="32" cy="8" rx="13" ry="4" fill="none" stroke="#f1f1f1" stroke-width="3"/>`;

function svg(width, height, body) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`);
}

function frame(cropX, cropY, pivotX, pivotY, yPosition = 0) {
  return `<Frame XPosition="0" YPosition="${yPosition}" XPivot="${pivotX}" YPivot="${pivotY}" XCrop="${cropX}" YCrop="${cropY}" Width="32" Height="32" XScale="100" YScale="100" Delay="1" Visible="true" RedTint="255" GreenTint="255" BlueTint="255" AlphaTint="255" RedOffset="0" GreenOffset="0" BlueOffset="0" Rotation="0" Interpolated="false"/>`;
}

function animation(name, index) {
  return `<Animation Name="${name}" FrameNum="1" Loop="false"><RootAnimation><Frame XPosition="0" YPosition="0" XScale="100" YScale="100" Delay="1" Visible="true" RedTint="255" GreenTint="255" BlueTint="255" AlphaTint="255" RedOffset="0" GreenOffset="0" BlueOffset="0" Rotation="0" Interpolated="false"/></RootAnimation><LayerAnimations><LayerAnimation LayerId="0" Visible="true">${frame(index * 32, 0, 16, 28, -5)}</LayerAnimation><LayerAnimation LayerId="1" Visible="true">${frame(index * 32, 32, 16, 24)}</LayerAnimation></LayerAnimations><NullAnimations/><Triggers/></Animation>`;
}

export function creatorCostumeAnm2() {
  return `<AnimatedActor><Info CreatedBy="AIsaac" Version="103" Fps="30"/><Content><Spritesheets><Spritesheet Path="costumes/costume_creator_angel.png" Id="0"/></Spritesheets><Layers><Layer Name="head4" Id="0" SpritesheetId="0"/><Layer Name="body" Id="1" SpritesheetId="0"/></Layers><Nulls/><Events/></Content><Animations DefaultAnimation="HeadDown">${["HeadDown", "HeadRight", "HeadUp", "HeadLeft"].map(animation).join("")}</Animations></AnimatedActor>`;
}

export function characterPortraitsAnm2() {
  const portrait = (name, crop) => `<Animation Name="${name}" FrameNum="1" Loop="false"><RootAnimation><Frame XPosition="0" YPosition="0" XScale="100" YScale="100" Delay="1" Visible="true" RedTint="255" GreenTint="255" BlueTint="255" AlphaTint="255" RedOffset="0" GreenOffset="0" BlueOffset="0" Rotation="0" Interpolated="false"/></RootAnimation><LayerAnimations><LayerAnimation LayerId="0" Visible="true"><Frame XPosition="0" YPosition="0" XPivot="32" YPivot="32" XCrop="${crop}" YCrop="0" Width="64" Height="64" XScale="100" YScale="100" Delay="1" Visible="true" RedTint="255" GreenTint="255" BlueTint="255" AlphaTint="255" RedOffset="0" GreenOffset="0" BlueOffset="0" Rotation="0" Interpolated="false"/></LayerAnimation></LayerAnimations><NullAnimations/><Triggers/></Animation>`;
  return `<AnimatedActor><Info CreatedBy="AIsaac" Version="103" Fps="30"/><Content><Spritesheets><Spritesheet Path="characterportraits.png" Id="0"/></Spritesheets><Layers><Layer Name="Portrait" Id="0" SpritesheetId="0"/></Layers><Nulls/><Events/></Content><Animations DefaultAnimation="AIsaac">${portrait("AIsaac", 0)}${portrait("The Creator", 64)}</Animations></AnimatedActor>`;
}

function clearNameSvg(width) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="32"><rect width="${width}" height="32" fill="#ffffff"/></svg>`;
}

export function characterMenuAnm2() {
  const layers = ["Background", "Left Arrow", "Right Arrow", "Name", "Life Icon", "Speed Icon", "Power Icon", "Item Icon", "Item Name", "Life Stat", "Speed Stat", "Power Stat", "Item Icon 2", "Item Name 2", "Item Icon 3", "Item Name 3", "Unlocked By", "Blood", "Blood2", "Overlay", "Blood3"];
  const baseLayers = layers.map((name, index) => `<Layer Name="${name}" Id="${index}" SpritesheetId="0"/>`).join("");
  const staticLayers = `<LayerAnimation LayerId="0" Visible="true"/><LayerAnimation LayerId="1" Visible="true"><Frame XPosition="157" YPosition="140" XPivot="0" YPivot="0" XCrop="195" YCrop="71" Width="32" Height="16" XScale="100" YScale="100" Delay="1" Visible="true"/></LayerAnimation><LayerAnimation LayerId="2" Visible="true"><Frame XPosition="291" YPosition="140" XPivot="0" YPivot="0" XCrop="227" YCrop="71" Width="32" Height="16" XScale="100" YScale="100" Delay="1" Visible="true"/></LayerAnimation><LayerAnimation LayerId="4" Visible="true"><Frame XPosition="167" YPosition="172" XPivot="16" YPivot="16" XCrop="128" YCrop="0" Width="32" Height="32" XScale="100" YScale="100" Delay="1" Visible="true"/></LayerAnimation><LayerAnimation LayerId="5" Visible="true"><Frame XPosition="230" YPosition="172" XPivot="16" YPivot="16" XCrop="160" YCrop="0" Width="32" Height="32" XScale="100" YScale="100" Delay="1" Visible="true"/></LayerAnimation><LayerAnimation LayerId="6" Visible="true"><Frame XPosition="291" YPosition="173" XPivot="16" YPivot="16" XCrop="192" YCrop="0" Width="32" Height="32" XScale="100" YScale="100" Delay="1" Visible="true"/></LayerAnimation><LayerAnimation LayerId="7" Visible="true"><Frame XPosition="190" YPosition="205" XPivot="16" YPivot="16" XCrop="96" YCrop="0" Width="32" Height="32" XScale="100" YScale="100" Delay="1" Visible="true"/></LayerAnimation><LayerAnimation LayerId="8" Visible="true"><Frame XPosition="270" YPosition="202" XPivot="58" YPivot="10" XCrop="196" YCrop="37" Width="120" Height="25" XScale="100" YScale="100" Delay="1" Visible="true"/></LayerAnimation>${[12,13,14,15].map((id) => `<LayerAnimation LayerId="${id}" Visible="false"/>`).join("")}<LayerAnimation LayerId="9" Visible="true"><Frame XPosition="196" YPosition="172" XPivot="16" YPivot="16" XCrop="96" YCrop="64" Width="32" Height="32" XScale="100" YScale="100" Delay="1" Visible="true"/></LayerAnimation><LayerAnimation LayerId="10" Visible="true"><Frame XPosition="260" YPosition="172" XPivot="16" YPivot="16" XCrop="128" YCrop="32" Width="32" Height="32" XScale="100" YScale="100" Delay="1" Visible="true"/></LayerAnimation><LayerAnimation LayerId="11" Visible="true"><Frame XPosition="316" YPosition="172" XPivot="16" YPivot="16" XCrop="128" YCrop="32" Width="32" Height="32" XScale="100" YScale="100" Delay="1" Visible="true"/></LayerAnimation>${[16,17,18,20,19].map((id) => `<LayerAnimation LayerId="${id}" Visible="true"/>`).join("")}`;
  const animation = (name, xCrop) => `<Animation Name="${name}" FrameNum="1" Loop="false"><RootAnimation><Frame XPosition="0" YPosition="0" XScale="100" YScale="100" Delay="1" Visible="true"/></RootAnimation><LayerAnimations>${staticLayers}<LayerAnimation LayerId="3" Visible="true"><Frame XPosition="216" YPosition="147" XPivot="60" YPivot="16" XCrop="${xCrop}" YCrop="64" Width="120" Height="32" XScale="100" YScale="100" Delay="1" Visible="true"/></LayerAnimation></LayerAnimations><NullAnimations/><Triggers/></Animation>`;
  return `<AnimatedActor><Info CreatedBy="AIsaac" Version="58" Fps="30"/><Content><Spritesheets><Spritesheet Path="charactermenu.png" Id="0"/></Spritesheets><Layers>${baseLayers}</Layers><Nulls/><Events/></Content><Animations DefaultAnimation="AIsaac">${animation("AIsaac", 0)}${animation("The Creator", 120)}</Animations></AnimatedActor>`;
}

export async function generateCharacterArt(target = root) {
  const gfx = path.join(target, "content/gfx");
  const characters = path.join(target, "resources/gfx/characters");
  await mkdir(gfx, { recursive: true });
  await mkdir(path.join(characters, "costumes"), { recursive: true });
  const menu = svg(128, 64, `<g transform="translate(8 8) scale(.75)">${isaac}${robot}</g><g transform="translate(72 8) scale(.75)">${creator}</g>`);
  await sharp(menu).png().toFile(path.join(gfx, "characterportraits.png"));
  await writeFile(path.join(gfx, "characterportraits.anm2"), characterPortraitsAnm2());
  const baseMenu = sharp(await readFile(path.join(import.meta.dirname, "character-menu-base.png")));
  const heart = await baseMenu.clone().extract({ left: 128, top: 0, width: 32, height: 32 }).resize(9, 9, { kernel: "nearest" }).png().toBuffer();
  const generator = await sharp(await readFile(path.join(import.meta.dirname, "menu-item-generator.png"))).grayscale().resize(24, 24, { kernel: "nearest" }).png().toBuffer();
  const [aisaacName, creatorName, itemName] = await Promise.all([
    readFile(path.join(import.meta.dirname, "menu-label-aisaac.png")),
    readFile(path.join(import.meta.dirname, "menu-label-creator.png")),
    readFile(path.join(import.meta.dirname, "menu-label-ai-item.png")),
  ]);
  const health = await sharp({ create: { width: 32, height: 32, channels: 4, background: "#00000000" } })
    .composite([0, 11, 22].map((left) => ({ input: heart, left, top: 11 }))).png().toBuffer();
  const characterMenu = await baseMenu.composite([
    { input: Buffer.from(clearNameSvg(240)), left: 0, top: 64, blend: "dest-out" },
    { input: Buffer.from(clearNameSvg(32)), left: 96, top: 64, blend: "dest-out" },
    { input: Buffer.from(clearNameSvg(32)), left: 96, top: 0, blend: "dest-out" },
    { input: Buffer.from(clearNameSvg(120)), left: 196, top: 37, blend: "dest-out" },
    { input: aisaacName, left: 0, top: 64 },
    { input: creatorName, left: 120, top: 64 },
    { input: health, left: 96, top: 64 },
    { input: generator, left: 100, top: 4 },
    { input: itemName, left: 196, top: 37 },
  ]).png().toBuffer();
  await sharp(characterMenu).png().toFile(path.join(gfx, "charactermenu.png"));
  await writeFile(path.join(gfx, "charactermenu.anm2"), characterMenuAnm2());
  const halo = `<ellipse cx="16" cy="6" rx="10" ry="3" fill="none" stroke="#f7dd75" stroke-width="2"/>`;
  const wings = `<path d="M8 13Q0 7 2 24L13 25M24 13Q32 7 30 24L19 25" fill="#f6f3dc" stroke="#b4a688" stroke-width="2"/>`;
  const cells = [0, 1, 2, 3].map((index) => `<g transform="translate(${index * 32},0)">${halo}</g><g transform="translate(${index * 32},32)">${wings}</g>`).join("");
  await sharp(svg(128, 64, cells)).png().toFile(path.join(characters, "costumes/costume_creator_angel.png"));
  await writeFile(path.join(characters, "creator_angel.anm2"), creatorCostumeAnm2());
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await generateCharacterArt();
  console.log("Generated AIsaac and Creator portraits and the Creator angel costume.");
}
