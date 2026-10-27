import { writeFile, rename } from 'node:fs/promises';
import sharp from 'sharp';
import { FAMILIAR_FRAME_COUNT, FAMILIAR_FRAME_SIZE } from '../native/ipc/familiar-animation.mjs';

const SHEET_CELL_WIDTH = 128;
const SHEET_CELL_HEIGHT = 256;

export function toLua(value) {
  if (value == null) return 'nil';
  if (typeof value === 'string') return '"' + value.replace(/[\\"\x00-\x1f\x7f]/g, c => '\\' + c.charCodeAt(0).toString().padStart(3, '0')) + '"';
  if (typeof value !== 'object') return String(value);
  return '{' + Object.entries(value).map(([k,v]) => `[${Array.isArray(value) ? Number(k)+1 : toLua(k)}]=${toLua(v)}`).join(',') + '}';
}
export async function atomicWrite(file, data) {
  const temp = file + '.tmp';
  await writeFile(temp, data);
  await rename(temp, file);
}
export function validateSchema(value, schema, location = 'profile') {
  if (schema.anyOf) {
    const errors = [];
    for (const candidate of schema.anyOf) {
      try { validateSchema(value, candidate, location); return; }
      catch (error) { errors.push(error.message); }
    }
    throw Error(`${location} matches no allowed shape: ${errors.join('; ')}`);
  }
  if (Object.hasOwn(schema, 'const') && value !== schema.const) throw Error(`${location} has an unsupported value`);
  if (!schema.type && Object.hasOwn(schema, 'const')) return;
  const type = schema.type;
  if (type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(`${location} must be an object`);
    for (const key of schema.required || []) if (!(key in value)) throw Error(`${location}.${key} is required`);
    for (const [key, item] of Object.entries(value)) {
      if (!schema.properties[key]) throw Error(`${location}.${key} is unsupported`);
      validateSchema(item, schema.properties[key], `${location}.${key}`);
    }
  } else if (type === 'array') {
    if (!Array.isArray(value) || value.length < (schema.minItems || 0) || value.length > (schema.maxItems ?? Infinity)) throw Error(`${location} has invalid array length`);
    value.forEach((item, i) => validateSchema(item, schema.items, `${location}[${i}]`));
  } else if (type === 'string') {
    if (typeof value !== 'string' || value.length < (schema.minLength || 0) || value.length > (schema.maxLength ?? Infinity)) throw Error(`${location} has invalid text length`);
  } else if (type === 'boolean') {
    if (typeof value !== 'boolean') throw Error(`${location} must be a boolean`);
  } else if (!Number.isFinite(value) || (type === 'integer' && !Number.isInteger(value)) || value < schema.minimum || value > schema.maximum) throw Error(`${location} is outside allowed numeric bounds`);
  if (schema.enum && !schema.enum.includes(value)) throw Error(`${location} has an unsupported value`);
}

// Remove only near-white pixels connected to the image border. Interior white
// highlights remain intact. The image prompt requests this solid backdrop.
export async function makeIcon(source) {
  const {data, info} = await sharp(source).resize(256,256,{fit:'inside'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const {width:w,height:h} = info;
  const seen = new Uint8Array(w*h), queue = [];
  const visit = i => { if (i < 0 || i >= w*h || seen[i]) return; seen[i]=1; const p=i*4; if (data[p]>235 && data[p+1]>235 && data[p+2]>235) queue.push(i); };
  for(let x=0;x<w;x++){visit(x);visit((h-1)*w+x);}
  for(let y=0;y<h;y++){visit(y*w);visit(y*w+w-1);}
  for(let n=0;n<queue.length;n++){const i=queue[n];data[i*4+3]=0; if(i%w)visit(i-1);if(i%w<w-1)visit(i+1);visit(i-w);visit(i+w);}
  let left=w,top=h,right=-1,bottom=-1;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(data[(y*w+x)*4+3]>32){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  if(right<left) throw Error('Artwork was empty after background removal. Try a more specific object.');
  return sharp(data,{raw:info}).extract({left,top,width:right-left+1,height:bottom-top+1}).resize(28,28,{fit:'contain',kernel:'nearest',background:'#00000000'}).extend({top:2,bottom:2,left:2,right:2,background:'#00000000'}).png().toBuffer();
}

function clearBorderWhite(data, width, height) {
  const seen = new Uint8Array(width * height);
  const queue = [];
  const visit = (index) => {
    if (index < 0 || index >= width * height || seen[index]) return;
    seen[index] = 1;
    const pixel = index * 4;
    if (data[pixel] > 235 && data[pixel + 1] > 235 && data[pixel + 2] > 235) queue.push(index);
  };
  for (let x = 0; x < width; x++) { visit(x); visit((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { visit(y * width); visit(y * width + width - 1); }
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const index = queue[cursor];
    data[index * 4 + 3] = 0;
    if (index % width) visit(index - 1);
    if (index % width < width - 1) visit(index + 1);
    visit(index - width);
    visit(index + width);
  }
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3] > 32) {
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  return right < left ? null : { left, top, width: right - left + 1, height: bottom - top + 1 };
}

async function fitFrame(data, width, height) {
  const bounds = clearBorderWhite(data, width, height);
  if (!bounds) return sharp({ create: { width: FAMILIAR_FRAME_SIZE, height: FAMILIAR_FRAME_SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
  return sharp(data, { raw: { width, height, channels: 4 } }).extract(bounds).resize(FAMILIAR_FRAME_SIZE - 4, FAMILIAR_FRAME_SIZE - 4, { fit: 'contain', kernel: 'nearest', background: { r: 0, g: 0, b: 0, alpha: 0 } }).extend({ top: 2, bottom: 2, left: 2, right: 2, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}

// Comfy paints one wide strip. Slice it into the fixed 8-frame grid the
// predeclared anm2 files already name.
export async function makeSpriteSheet(source) {
  const sheet = sharp(source).resize(FAMILIAR_FRAME_COUNT * SHEET_CELL_WIDTH, SHEET_CELL_HEIGHT, { fit: 'fill' }).ensureAlpha();
  const frames = [];
  for (let index = 0; index < FAMILIAR_FRAME_COUNT; index++) {
    const cell = await sheet.clone().extract({ left: index * SHEET_CELL_WIDTH, top: 0, width: SHEET_CELL_WIDTH, height: SHEET_CELL_HEIGHT }).raw().toBuffer({ resolveWithObject: true });
    frames.push(await fitFrame(cell.data, cell.info.width, cell.info.height));
  }
  return sharp({
    create: { width: FAMILIAR_FRAME_COUNT * FAMILIAR_FRAME_SIZE, height: FAMILIAR_FRAME_SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite(frames.map((input, index) => ({ input, left: index * FAMILIAR_FRAME_SIZE, top: 0 }))).png().toBuffer();
}
