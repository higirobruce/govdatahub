import axios from 'axios';
import { EmbeddingsService } from './embeddings.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('EmbeddingsService', () => {
  let service: EmbeddingsService;
  beforeEach(() => {
    jest.clearAllMocks();
    service = new EmbeddingsService();
  });

  it('embeds a batch via the org-configured Ollama endpoint', async () => {
    mockedAxios.post.mockResolvedValue({ data: { embeddings: [[0.1, 0.2], [0.3, 0.4]] } });
    const out = await service.embed(['a', 'b'], { aiApiEndpoint: 'http://gpu:11434' } as any);
    expect(out).toEqual([[0.1, 0.2], [0.3, 0.4]]);
    const [url, body] = mockedAxios.post.mock.calls[0];
    expect(url).toBe('http://gpu:11434/api/embed');
    expect((body as any).model).toBe('bge-m3');
    expect((body as any).input).toEqual(['a', 'b']);
  });

  it('chunks batches of more than 32 inputs', async () => {
    mockedAxios.post.mockResolvedValue({ data: { embeddings: Array(32).fill([0]) } });
    await service.embed(Array(40).fill('x'), { aiApiEndpoint: 'http://gpu:11434' } as any);
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
  });

  it('formats pgvector literals', () => {
    expect(service.toVectorLiteral([0.1, -0.2, 3])).toBe('[0.1,-0.2,3]');
  });
});
