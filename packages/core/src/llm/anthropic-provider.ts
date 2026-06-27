/**
 * AnthropicProvider — the DEFAULT behavioral-analysis backend.
 *
 * Uses the official @anthropic-ai/sdk (/v1/messages):
 *  - system prompt as the top-level `system` param;
 *  - STRUCTURED OUTPUT via a forced tool call whose input_schema IS the
 *    {summary, flags} JSON schema — no brittle fence-strip / JSON.parse of prose;
 *  - NO `temperature` (current Claude models 400 on sampling params);
 *  - 429/5xx retry + backoff handled by the SDK (maxRetries).
 */

import Anthropic from '@anthropic-ai/sdk';
import type { LLMConfig } from './config.js';
import type {
  DescribeFunctionInput,
  DescribeFunctionResult,
  LLMProvider,
} from './provider.js';
import {
  ANALYSIS_JSON_SCHEMA,
  ANALYSIS_TOOL_NAME,
  DEFAULT_SYSTEM_PROMPT,
  buildUserPrompt,
  normalizeAnalysis,
} from './prompt.js';

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  readonly model: string;

  private readonly client: Anthropic;
  private readonly config: LLMConfig;
  private readonly systemPrompt: string;

  constructor(config: LLMConfig) {
    this.config = config;
    this.model = config.model;
    this.systemPrompt = config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    this.client = new Anthropic({
      apiKey: config.apiKey,
      ...(config.baseURL ? { baseURL: config.baseURL } : {}),
      timeout: config.timeout,
      maxRetries: config.maxRetries,
    });
  }

  async describeFunction(input: DescribeFunctionInput): Promise<DescribeFunctionResult> {
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: this.config.maxTokens,
      // No temperature — current Claude models reject sampling params.
      system: this.systemPrompt,
      tools: [
        {
          name: ANALYSIS_TOOL_NAME,
          description:
            'Record the behavioral analysis (summary + side-effect flags) for the function.',
          input_schema: ANALYSIS_JSON_SCHEMA as unknown as Anthropic.Tool.InputSchema,
        },
      ],
      // Force the model to emit the structured tool call (single, parallel disabled).
      tool_choice: {
        type: 'tool',
        name: ANALYSIS_TOOL_NAME,
        disable_parallel_tool_use: true,
      },
      messages: [
        {
          role: 'user',
          content: buildUserPrompt(input, this.config.maxCodeLength),
        },
      ],
    });

    const toolUse = message.content.find(
      (block): block is Anthropic.ToolUseBlock =>
        block.type === 'tool_use' && block.name === ANALYSIS_TOOL_NAME,
    );

    if (!toolUse) {
      throw new Error(
        `Anthropic response contained no '${ANALYSIS_TOOL_NAME}' tool_use block (stop_reason=${message.stop_reason}).`,
      );
    }

    // toolUse.input is the structured object validated against ANALYSIS_JSON_SCHEMA.
    return normalizeAnalysis(toolUse.input);
  }
}
