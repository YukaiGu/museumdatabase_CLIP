import { loadModels, textEmbedding } from '../server/embeddings.js';
console.log('Preparing the local CLIP model. The first run downloads model weights to data/models.');
await loadModels(console.log);
const vector = await textEmbedding('a painting of a sailing ship');
console.log(`CLIP ready: ${vector.length}-dimensional embeddings. No API key required.`);
