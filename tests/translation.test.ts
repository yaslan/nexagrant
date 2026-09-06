import { describe, it, expect } from 'vitest';
import { translateText, translateTopicsBatch } from '../src/lib/translation';

describe('Translation Utility', () => {
  it('should translate common EU dictionary terms to Turkish', async () => {
    const tr = await translateText('Advanced AI solutions for climate modeling', 'tr');
    expect(tr).toContain('İklim Modellemesi');
  });

  it('should translate a batch of topics to Turkish', async () => {
    const topics = [
      { title: 'Digital democracy and civic engagement', description: 'Sample description' },
      { title: 'Quantum computing algorithms for SMEs', description: 'Another description' }
    ];

    const translated = await translateTopicsBatch(topics, 'tr');
    expect(translated[0].title).not.toEqual('Digital democracy and civic engagement');
    expect(translated[1].title).not.toEqual('Quantum computing algorithms for SMEs');
  });
});
