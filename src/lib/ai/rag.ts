import { prisma } from '@/lib/db';
import OpenAI from 'openai';
const pdfParse = require('pdf-parse');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'sk-mock-key-for-testing',
});

export async function processPdfAndStore(
  fileBuffer: Buffer,
  tenantId: string | null,
  kind: string,
  title: string,
  sourceUrl?: string
) {
  const data = await pdfParse(fileBuffer);
  const text = data.text;
  
  // Basic text chunking
  const chunks = chunkText(text, 1000, 200);
  
  // Save document
  const doc = await prisma.document.create({
    data: {
      tenantId,
      kind,
      title,
      sourceUrl
    }
  });

  // Get embeddings and save chunks
  // Simple batching to respect rate limits
  for (let i = 0; i < chunks.length; i++) {
    const chunkStr = chunks[i];
    
    // Skip empty chunks
    if (chunkStr.trim().length === 0) continue;
    
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-large',
      input: chunkStr,
    });
    
    const embedding = embeddingResponse.data[0].embedding;
    // Format embedding array to pgvector string format: '[0.1, 0.2, ...]'
    const embeddingStr = `[${embedding.join(',')}]`;
    
    // Save to chunk with pgvector
    await prisma.$executeRaw`
      INSERT INTO "Chunk" ("id", "documentId", "tenantId", "ordinal", "text", "embedding")
      VALUES (gen_random_uuid(), ${doc.id}, ${tenantId}, ${i}, ${chunkStr}, ${embeddingStr}::vector)
    `;
  }
  
  return doc;
}

export async function semanticSearch(query: string, tenantId?: string | null, topK = 5) {
  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-large',
    input: query,
  });
  
  const embedding = embeddingResponse.data[0].embedding;
  const embeddingStr = `[${embedding.join(',')}]`;
  
  // Use cosine distance (<=>)
  let results;
  if (tenantId) {
    results = await prisma.$queryRaw`
      SELECT c.id, c.text, c."documentId", 1 - (c.embedding <=> ${embeddingStr}::vector) as similarity
      FROM "Chunk" c
      WHERE c."tenantId" = ${tenantId} OR c."tenantId" IS NULL
      ORDER BY c.embedding <=> ${embeddingStr}::vector
      LIMIT ${topK}
    `;
  } else {
    results = await prisma.$queryRaw`
      SELECT c.id, c.text, c."documentId", 1 - (c.embedding <=> ${embeddingStr}::vector) as similarity
      FROM "Chunk" c
      WHERE c."tenantId" IS NULL
      ORDER BY c.embedding <=> ${embeddingStr}::vector
      LIMIT ${topK}
    `;
  }
  
  return results;
}

function chunkText(text: string, size: number, overlap: number): string[] {
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + size));
    i += size - overlap;
  }
  return chunks;
}
