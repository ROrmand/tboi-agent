const args = process.argv.slice(2);
const promptIndex = args.indexOf('--prompt');
const prompt = promptIndex === -1 ? '' : (args[promptIndex + 1] || '').trim();

if (!prompt || prompt.length > 2000) {
  throw Error('Use --prompt with 1–2000 characters.');
}

const response = await fetch('http://127.0.0.1:3000/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt }),
});
const body = await response.json().catch(() => ({}));
if (!response.ok) throw Error(body.error || `Bridge request failed (${response.status}).`);
console.log(`Submitted native profile job: ${body.id}`);
