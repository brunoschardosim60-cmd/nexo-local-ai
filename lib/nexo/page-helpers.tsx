import type { ReactNode } from 'react';
import type { ChatMessage, NexoAction } from '@/lib/nexo/types';

export function safeParse<T>(value: string | null, fallback: T): T {
  try {
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function stripFence(content: string) {
  return content
    .replace(/^```(?:csv|svg|xml)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

export function cleanSvg(content: string) {
  const match = stripFence(content).match(/<svg[\s\S]*<\/svg>/i);
  const sanitized = (match?.[0] ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+=(?:"[^"]*"|'[^']*')/gi, '');
  if (!sanitized) return '';
  return /<svg\b[^>]*\bxmlns=/i.test(sanitized)
    ? sanitized
    : sanitized.replace(/^<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
}

export function normalizeInput(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[?!.,]+$/g, '');
}

export function formatDuration(milliseconds?: number) {
  if (milliseconds === undefined) return '';
  if (milliseconds < 1000) return `${Math.max(1, Math.round(milliseconds))} ms`;
  return `${(milliseconds / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
}

export function isImageCreationRequest(
  question: string,
  history: ChatMessage[],
) {
  const normalized = normalizeInput(question);
  const direct =
    /\b(crie|cria|gere|gera|desenhe|desenha|faca|faz)\b.*\b(imagem|ilustracao|desenho|logo|icone|avatar|capa|poster|wallpaper|foto)\b/.test(
      normalized,
    ) ||
    /\b(quero|preciso de)\b.*\b(imagem|ilustracao|desenho|logo|icone|avatar|capa|poster|wallpaper)\b/.test(
      normalized,
    );
  if (direct) return true;
  const isShortCommand =
    /^(crie|cria|gere|gera|desenhe|desenha|faca|faz)\b/.test(normalized) &&
    normalized.length < 100;
  const recentImageContext = history
    .slice(-4)
    .some((message) =>
      /\b(imagem|ilustracao|desenho|svg|logo|icone)\b/.test(
        normalizeInput(message.content),
      ),
    );
  return isShortCommand && recentImageContext;
}

export function weatherDescription(code: number) {
  if (code === 0) return 'céu limpo';
  if (code <= 3) return 'parcialmente nublado';
  if (code <= 48) return 'neblina';
  if (code <= 67) return 'chuva';
  if (code <= 77) return 'neve';
  if (code <= 82) return 'pancadas de chuva';
  return 'tempestade';
}

function renderInline(content: string): ReactNode[] {
  const parts = content.split(
    /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))/g,
  );
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`'))
      return <code key={index}>{part.slice(1, -1)}</code>;
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
    if (link)
      return (
        <a key={index} href={link[2]} target="_blank" rel="noreferrer">
          {link[1]}
        </a>
      );
    return part;
  });
}

export function RichText({ content }: { content: string }) {
  const lines = content.replace(/\r/g, '').split('\n');
  const blocks: ReactNode[] = [];
  let index = 0;
  const isBlockStart = (line: string) =>
    !line.trim() ||
    /^```|^#{1,3}\s+|^>\s?|^\s*[-*]\s+|^\s*\d+[.)]\s+/.test(line);

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (line.startsWith('```')) {
      const language = line.slice(3).trim();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith('```')) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push(
        <div className="nexo-code" key={`code-${index}`}>
          <div>
            <span>{language || 'código'}</span>
          </div>
          <pre>
            <code>{code.join('\n')}</code>
          </pre>
        </div>,
      );
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(
        level === 1 ? (
          <h2 key={index}>{renderInline(heading[2])}</h2>
        ) : level === 2 ? (
          <h3 key={index}>{renderInline(heading[2])}</h3>
        ) : (
          <h4 key={index}>{renderInline(heading[2])}</h4>
        ),
      );
      index += 1;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length) {
        if (/^\s*[-*]\s+/.test(lines[index])) {
          items.push(lines[index].replace(/^\s*[-*]\s+/, ''));
          index += 1;
          continue;
        }
        if (
          !lines[index].trim() &&
          /^\s*[-*]\s+/.test(lines[index + 1] ?? '')
        ) {
          index += 1;
          continue;
        }
        break;
      }
      blocks.push(
        <ul key={`ul-${index}`}>
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      const start = Number(line.match(/^\s*(\d+)[.)]\s+/)?.[1] ?? 1);
      while (index < lines.length) {
        if (/^\s*\d+[.)]\s+/.test(lines[index])) {
          items.push(lines[index].replace(/^\s*\d+[.)]\s+/, ''));
          index += 1;
          continue;
        }
        if (
          !lines[index].trim() &&
          /^\s*\d+[.)]\s+/.test(lines[index + 1] ?? '')
        ) {
          index += 1;
          continue;
        }
        break;
      }
      blocks.push(
        <ol start={start} key={`ol-${index}`}>
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item)}</li>
          ))}
        </ol>,
      );
      continue;
    }
    if (line.startsWith('>')) {
      const quote: string[] = [];
      while (index < lines.length && lines[index].startsWith('>')) {
        quote.push(lines[index].replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push(
        <blockquote key={`quote-${index}`}>
          {renderInline(quote.join(' '))}
        </blockquote>,
      );
      continue;
    }
    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && !isBlockStart(lines[index])) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(<p key={`p-${index}`}>{renderInline(paragraph.join(' '))}</p>);
  }
  return <div className="nexo-rich-text">{blocks}</div>;
}

export function parseAction(content: string): NexoAction | null {
  try {
    const parsed = JSON.parse(stripFence(content)) as {
      nexo_action?: NexoAction;
    };
    const action = parsed.nexo_action;
    if (
      !action ||
      ![
        'write_file',
        'create_folder',
        'read_file',
        'list_files',
        'create_project',
      ].includes(action.type) ||
      !action.path ||
      !action.reason
    )
      return null;
    if (
      action.type === 'create_project' &&
      !['static-site', 'node-api', 'python-api', 'ai-service'].includes(
        action.template ?? '',
      )
    )
      return null;
    return { ...action, status: action.status ?? 'pending' };
  } catch {
    return null;
  }
}

export function actionTitle(action: NexoAction) {
  return {
    write_file: 'Criar ou alterar arquivo',
    create_folder: 'Criar pasta',
    read_file: 'Ler arquivo',
    list_files: 'Listar pasta',
    create_project: `Criar projeto · ${action.template ?? ''}`,
  }[action.type];
}

export function actionButton(action: NexoAction) {
  return ['write_file', 'create_folder', 'create_project'].includes(action.type)
    ? 'Revisar e aprovar'
    : 'Permitir leitura';
}
