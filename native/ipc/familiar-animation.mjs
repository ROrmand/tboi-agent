// One predeclared animation per artwork slot. Isaac only discovers anm2 paths
// at startup, so generation overwrites the matching sheet instead of adding a
// filename the game has never seen.
export const FAMILIAR_FRAME_COUNT = 8;
export const FAMILIAR_FRAME_SIZE = 32;
export const FAMILIAR_CLIPS = [
  { name: "Idle", start: 0, count: 2 },
  { name: "Float", start: 2, count: 2 },
  { name: "Hop", start: 4, count: 2 },
  { name: "Spin", start: 6, count: 2 },
];

const TINT = 'Visible="true" RedTint="255" GreenTint="255" BlueTint="255" AlphaTint="255" RedOffset="0" GreenOffset="0" BlueOffset="0" Rotation="0" Interpolated="false"';

function rootFrame() {
  return `<Frame XPosition="0" YPosition="0" XScale="100" YScale="100" Delay="3" ${TINT}/>`;
}

function layerFrame(cropX) {
  return `<Frame XPosition="0" YPosition="0" XPivot="16" YPivot="16" XCrop="${cropX}" YCrop="0" Width="${FAMILIAR_FRAME_SIZE}" Height="${FAMILIAR_FRAME_SIZE}" XScale="200" YScale="200" Delay="3" ${TINT}/>`;
}

// Isaac's animation loader crashes the process on this file. It expects the
// same short lines as its own anm2 files, plus Nulls and Events. A single
// packed line overflows that reader when the familiar is spawned.
export function familiarAnimationXml(sheetPath) {
  const animations = FAMILIAR_CLIPS.map((clip) => {
    const roots = Array.from({ length: clip.count }, () => `\t\t\t\t${rootFrame()}`).join("\n");
    const layers = Array.from({ length: clip.count }, (_, index) => `\t\t\t\t\t${layerFrame((clip.start + index) * FAMILIAR_FRAME_SIZE)}`).join("\n");
    return [
      `\t\t<Animation Name="${clip.name}" FrameNum="${clip.count}" Loop="true">`,
      "\t\t\t<RootAnimation>",
      roots,
      "\t\t\t</RootAnimation>",
      "\t\t\t<LayerAnimations>",
      "\t\t\t\t<LayerAnimation LayerId=\"0\" Visible=\"true\">",
      layers,
      "\t\t\t\t</LayerAnimation>",
      "\t\t\t</LayerAnimations>",
      "\t\t\t<NullAnimations/>",
      "\t\t\t<Triggers/>",
      "\t\t</Animation>",
    ].join("\n");
  }).join("\n");
  return [
    "<AnimatedActor>",
    "\t<Info CreatedBy=\"tboi-agent\" CreatedOn=\"10/14/2026 8:46:00 PM\" Version=\"1\" Fps=\"30\"/>",
    "\t<Content>",
    "\t\t<Spritesheets>",
    `\t\t\t<Spritesheet Path="${sheetPath}" Id="0"/>`,
    "\t\t</Spritesheets>",
    "\t\t<Layers>",
    "\t\t\t<Layer Name=\"body\" Id=\"0\" SpritesheetId=\"0\"/>",
    "\t\t</Layers>",
    "\t\t<Nulls/>",
    "\t\t<Events/>",
    "\t</Content>",
    "\t<Animations DefaultAnimation=\"Idle\">",
    animations,
    "\t</Animations>",
    "</AnimatedActor>",
    "",
  ].join("\n");
}
