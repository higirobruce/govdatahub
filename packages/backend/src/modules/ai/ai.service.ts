import { Injectable, BadRequestException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import axios from 'axios';
import { AiConfigService } from './ai-config.service';
import { Nl2SqlRequestDto, Nl2SqlResponseDto } from './dto/ai-config.dto';

const SYSTEM_PROMPT = `You are an expert SQL assistant. Convert natural language questions into SQL queries.
Always respond with valid JSON in this exact format:
{
  "sql": "<the SQL query>",
  "explanation": "<brief explanation of what the query does>"
}
Never include markdown code blocks or any text outside the JSON object.`;

@Injectable()
export class AiService {
  constructor(private readonly aiConfigService: AiConfigService) {}

  async nl2sql(organizationId: string, dto: Nl2SqlRequestDto): Promise<Nl2SqlResponseDto> {
    const cfg = await this.aiConfigService.getFullConfig(organizationId);
    if (!cfg) {
      throw new BadRequestException('AI is not configured for this organization. Please set up an AI provider in Settings.');
    }

    const userMessage = `Database schema:\n${dto.schemaContext}\n\nQuestion: ${dto.question}${dto.dialect ? `\n\nTarget SQL dialect: ${dto.dialect}` : ''}`;

    switch (cfg.provider) {
      case 'anthropic':
        return this.callAnthropic(organizationId, userMessage);
      case 'openai':
        return this.callOpenAI(organizationId, userMessage, cfg.model);
      case 'ollama':
        return this.callOllama(cfg.ollamaUrl, cfg.ollamaModel, userMessage);
      default:
        throw new BadRequestException(`Unknown AI provider: ${cfg.provider}`);
    }
  }

  private async callAnthropic(organizationId: string, userMessage: string): Promise<Nl2SqlResponseDto> {
    const apiKey = await this.aiConfigService.getDecryptedApiKey(organizationId);
    if (!apiKey) throw new BadRequestException('Anthropic API key not configured');

    const cfg = await this.aiConfigService.getFullConfig(organizationId);
    const model = cfg?.model || 'claude-sonnet-4-5';

    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = message.content.find((c) => c.type === 'text')?.text ?? '';
    return this.parseJsonResponse(text);
  }

  private async callOpenAI(organizationId: string, userMessage: string, model: string | null): Promise<Nl2SqlResponseDto> {
    const apiKey = await this.aiConfigService.getDecryptedApiKey(organizationId);
    if (!apiKey) throw new BadRequestException('OpenAI API key not configured');

    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 1024,
      response_format: { type: 'json_object' },
    });

    const text = completion.choices[0]?.message?.content ?? '';
    return this.parseJsonResponse(text);
  }

  private async callOllama(ollamaUrl: string | null, ollamaModel: string | null, userMessage: string): Promise<Nl2SqlResponseDto> {
    const baseUrl = (ollamaUrl || 'http://localhost:11434').replace(/\/$/, '');
    const model = ollamaModel || 'llama3';

    const response = await axios.post(
      `${baseUrl}/api/chat`,
      {
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        stream: false,
        format: 'json',
      },
      { timeout: 60000 },
    );

    const text = response.data?.message?.content ?? '';
    return this.parseJsonResponse(text);
  }

  private parseJsonResponse(text: string): Nl2SqlResponseDto {
    try {
      const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (!parsed.sql) throw new Error('Missing sql field');
      return { sql: parsed.sql, explanation: parsed.explanation || '' };
    } catch {
      throw new BadRequestException(`AI returned an unexpected response format: ${text.slice(0, 200)}`);
    }
  }
}
