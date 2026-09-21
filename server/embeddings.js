import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { env, AutoTokenizer, AutoProcessor, CLIPTextModelWithProjection, CLIPVisionModelWithProjection, RawImage } from '@huggingface/transformers';

export const MODEL_ID = 'Xenova/clip-vit-base-patch32';
env.cacheDir = fileURLToPath(new URL('../data/models/', import.meta.url));
env.allowLocalModels = false;
let loaded;
export const modelStatus = { state: 'not_loaded', model: MODEL_ID };

export function normalize(vector) {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return Array.from(vector, value => value / norm);
}

export function average(vectors) {
  if (!vectors.length) throw new Error('No query features supplied.');
  return normalize(vectors[0].map((_, i) => vectors.reduce((sum, vector) => sum + vector[i], 0) / vectors.length));
}

export function distance(a, b, metric = 'cosine') {
  if (!a?.length || a.length !== b?.length) throw new Error('Incompatible embeddings.');
  if (metric === 'cosine') return 1 - a.reduce((sum, value, i) => sum + value * b[i], 0);
  const sum = a.reduce((total, value, i) => total + (metric === 'manhattan' ? Math.abs(value - b[i]) : (value - b[i]) ** 2), 0);
  return metric === 'manhattan' ? sum : Math.sqrt(sum);
}

export async function loadModels(onProgress = () => {}) {
  if (!loaded) {
    modelStatus.state = 'loading';
    const options = { dtype: 'q8', session_options: { intraOpNumThreads: 2, interOpNumThreads: 1 }, progress_callback: info => { if (info.status === 'done') onProgress(`Loaded ${info.file}`); } };
    loaded = Promise.all([
      AutoTokenizer.from_pretrained(MODEL_ID), AutoProcessor.from_pretrained(MODEL_ID),
      CLIPTextModelWithProjection.from_pretrained(MODEL_ID, options),
      CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, options),
    ]).then(([tokenizer, processor, text, vision]) => {
      modelStatus.state = 'ready'; return { tokenizer, processor, text, vision };
    }).catch(error => { loaded = undefined; modelStatus.state = 'error'; modelStatus.error = error.message; throw error; });
  }
  return loaded;
}

export async function textEmbedding(query) {
  const { tokenizer, text } = await loadModels();
  const { text_embeds } = await text(tokenizer(query, { padding: true, truncation: true }));
  return normalize(Array.from(text_embeds.data));
}

export async function cleanImage(buffer) {
  return sharp(buffer, { limitInputPixels: 40_000_000, animated: false }).rotate().resize(768, 768, { fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 85 }).toBuffer();
}

export async function imageEmbedding(buffer, method = 'clip') {
  if (method === 'raw') {
    const raw = await sharp(buffer, { limitInputPixels: 40_000_000 }).flatten({ background: '#ffffff' }).resize(16, 16, { fit: 'fill' }).removeAlpha().toColourspace('srgb').raw().toBuffer();
    return normalize(Array.from(raw, value => value / 255));
  }
  const { processor, vision } = await loadModels();
  const image = await RawImage.fromBlob(new Blob([buffer], { type: 'image/jpeg' }));
  const { image_embeds } = await vision(await processor(image));
  return normalize(Array.from(image_embeds.data));
}
