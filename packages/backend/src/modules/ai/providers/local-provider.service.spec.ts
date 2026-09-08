import axios from 'axios';
import { LocalProviderService } from './local-provider.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('LocalProviderService.explainSql (COR-06)', () => {
  let provider: LocalProviderService;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new LocalProviderService();
  });

  it('uses the org-configured endpoint and model, not hardcoded defaults', async () => {
    mockedAxios.post.mockResolvedValue({
      data: { response: 'This query selects all users.' },
    });

    const settings = {
      aiApiEndpoint: 'http://gpu-box:11434',
      aiModel: 'qwen2.5-coder',
    } as any;

    const result = await provider.explainSql(
      'SELECT * FROM users',
      { connections: [] } as any,
      settings,
    );

    expect(result).toBe('This query selects all users.');
    const [url, body] = mockedAxios.post.mock.calls[0];
    expect(url).toContain('http://gpu-box:11434');
    expect((body as any).model).toBe('qwen2.5-coder');
  });

  it('propagates provider errors instead of returning a canned string', async () => {
    mockedAxios.post.mockRejectedValue(new Error('connection refused'));
    await expect(
      provider.explainSql('SELECT 1', { connections: [] } as any, {
        aiApiEndpoint: 'http://gpu-box:11434',
        aiModel: 'qwen2.5-coder',
      } as any),
    ).rejects.toThrow('connection refused');
  });
});

describe('LocalProviderService.generateJson', () => {
  let provider: LocalProviderService;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new LocalProviderService();
  });

  it('requests Ollama JSON format and parses the result', async () => {
    mockedAxios.post.mockResolvedValue({ data: { response: '{"a":1}' } });
    const out = await provider.generateJson('give me json', {
      aiApiEndpoint: 'http://gpu:11434',
      aiModel: 'qwen3-30b-16k',
    } as any);
    expect(out).toEqual({ a: 1 });
    const [, body] = mockedAxios.post.mock.calls[0];
    expect((body as any).format).toBe('json');
    expect((body as any).model).toBe('qwen3-30b-16k');
  });

  it('retries once on unparseable output, then succeeds', async () => {
    mockedAxios.post
      .mockResolvedValueOnce({ data: { response: 'not json' } })
      .mockResolvedValueOnce({ data: { response: '{"ok":true}' } });
    const out = await provider.generateJson('x', {
      aiApiEndpoint: 'http://gpu:11434',
      aiModel: 'qwen3-4b-fast',
    } as any);
    expect(out).toEqual({ ok: true });
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
  });

  it('throws after the second failure', async () => {
    mockedAxios.post.mockResolvedValue({ data: { response: 'still not json' } });
    await expect(
      provider.generateJson('x', { aiApiEndpoint: 'http://gpu:11434', aiModel: 'm' } as any),
    ).rejects.toThrow();
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
  });
});
