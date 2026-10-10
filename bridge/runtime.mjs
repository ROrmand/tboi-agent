import { writeFile, rename } from 'node:fs/promises';
import sharp from 'sharp';

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
