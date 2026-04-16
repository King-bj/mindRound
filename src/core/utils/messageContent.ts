/**
 * 助手消息展示前处理：去掉模型内部思考链，避免在气泡中露出。
 */

const FENCE = '\u0060\u0060\u0060';

/** fenced：```think ... ``` / ```thinking ... ``` */
const FENCED_THINK = new RegExp(
  FENCE + '\\s*(?:think|thinking|reasoning)\\s*[\\s\\S]*?' + FENCE,
  'gi'
);

/** XML 风格 `<think>...</think>`（think 为标签名） */
const TAG_THINK = new RegExp(
  '<\\s*think\\b[^>]*>[\\s\\S]*?<\\/\\s*think\\s*>',
  'gi'
);

/** `<redacted_thinking>...</redacted_thinking>` */
const TAG_REDACTED_THINKING = new RegExp(
  '<\\s*redacted_thinking\\b[^>]*>[\\s\\S]*?<\\/\\s*redacted_thinking\\s*>',
  'gi'
);

/** `<reasoning>...</reasoning>` */
const TAG_REASONING = new RegExp(
  '<\\s*reasoning\\b[^>]*>[\\s\\S]*?<\\/\\s*reasoning\\s*>',
  'gi'
);

const PATTERNS = [FENCED_THINK, TAG_THINK, TAG_REDACTED_THINKING, TAG_REASONING];

/**
 * 移除思考/推理块，仅保留应对用户展示的正文。
 */
export function stripModelThinkBlocks(text: string): string {
  if (!text) return '';
  let out = text;
  for (const re of PATTERNS) {
    out = out.replace(re, '');
  }
  return out.replace(/\n{3,}/g, '\n\n').trim();
}
