import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { AutoTokenizer, AutoModel } from '@huggingface/transformers';
import { dataDirectory } from './hosting.js';
import { normalize } from './embeddings.js';

export const MULTILINGUAL_MODEL_ID = 'sentence-transformers/clip-ViT-B-32-multilingual-v1';
const revision = '58edf8cada9e398793dca955574a48cbb7f18be2';
export const multilingualStatus = { state: 'not_loaded', model: MULTILINGUAL_MODEL_ID };
let loaded;
export function readProjection(bytes) {
  const headerSize = Number(bytes.readBigUInt64LE(0));
  const header = JSON.parse(bytes.subarray(8, 8 + headerSize).toString());
  const weight = header['linear.weight'];
  if (!weight || weight.dtype !== 'F32' || weight.shape.join(',') !== '512,768' || weight.data_offsets[1] - weight.data_offsets[0] !== 512 * 768 * 4) throw new Error('Invalid multilingual projection weights.');
  const offset = 8 + headerSize + weight.data_offsets[0];
  if (offset + 512 * 768 * 4 > bytes.length) throw new Error('Truncated multilingual projection.');
  return Float32Array.from({ length: 512 * 768 }, (_, i) => bytes.readFloatLE(offset + i * 4));
}
export function poolAndProject(hidden, mask, weights) {
  const [batch, tokens, width] = hidden.dims;
  if (batch !== 1 || width !== 768 || mask.data.length !== tokens || weights.length !== 512 * 768) throw new Error('Unexpected multilingual tensor dimensions.');
  const pooled = new Float32Array(width); let count = 0;
  for (let t = 0; t < tokens; t++) {
    if (!Number(mask.data[t])) continue;
    count++;
    for (let d = 0; d < width; d++) pooled[d] += hidden.data[t * width + d];
  }
  if (!count) throw new Error('Empty multilingual input.');
  const projected = new Float32Array(512);
  for (let out = 0; out < 512; out++) for (let d = 0; d < width; d++) projected[out] += weights[out * width + d] * pooled[d] / count;
  return normalize(projected);
}
export async function loadMultilingual() {
  if (!loaded) {
    multilingualStatus.state = 'loading';
    loaded = (async () => {
      const cache = `${dataDirectory}models/multilingual-${revision}`;
      await mkdir(cache, { recursive: true });
      let bytes;
      try { bytes = await readFile(`${cache}/projection.safetensors`); }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        const response = await fetch(`https://huggingface.co/${MULTILINGUAL_MODEL_ID}/resolve/${revision}/2_Dense/model.safetensors`, { signal: AbortSignal.timeout(120000) });
        if (!response.ok) throw new Error(`Multilingual projection download failed: ${response.status}`);
        bytes = Buffer.from(await response.arrayBuffer()); readProjection(bytes);
        await writeFile(`${cache}/projection.safetensors`, bytes);
      }
      const weights = readProjection(bytes);
      const [tokenizer, model] = await Promise.all([
        AutoTokenizer.from_pretrained(MULTILINGUAL_MODEL_ID, { revision }),
        AutoModel.from_pretrained(MULTILINGUAL_MODEL_ID, { revision, dtype: 'fp32', model_file_name: process.arch === 'arm64' ? 'model_qint8_arm64' : 'model_quint8_avx2', session_options: { intraOpNumThreads: 2, interOpNumThreads: 1 } }),
      ]);
      multilingualStatus.state = 'ready'; delete multilingualStatus.error;
      return { tokenizer, model, weights };
    })().catch(error => { loaded = undefined; multilingualStatus.state = 'error'; multilingualStatus.error = error.message; throw error; });
  }
  return loaded;
}
export async function multilingualTextEmbedding(query) {
  const { tokenizer, model, weights } = await loadMultilingual();
  const inputs = tokenizer(query, { padding: true, truncation: true, max_length: 128 });
  const output = await model(inputs);
  return poolAndProject(output.last_hidden_state, inputs.attention_mask, weights);
}
