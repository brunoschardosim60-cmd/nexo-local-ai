import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { defineTool } from '../tools/contracts.mjs';
import { RISK } from '../safety/policies.mjs';

const USER_AGENT = 'NexoLocalAI/2.0 (local research assistant)';
const SOURCE_QUALITY = Object.freeze({ wikipedia: { authority: 0.72, kind: 'encyclopedia', caveat: 'fonte terciária editável' }, openalex: { authority: 0.88, kind: 'academic-index', caveat: 'índice e metadados não substituem leitura do estudo' }, stackoverflow: { authority: 0.66, kind: 'community-technical', caveat: 'respostas variam em data e qualidade' } });
const PRIVATE_V4 = /^(?:10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|0\.|224\.|255\.)/;
const QUERY_STOP_WORDS = new Set(['pesquise','pesquisar','busque','buscar','procure','fontes','publicas','publicos','sobre','cite','citando','links','link','explique','mostre','liste','praticos','praticas','dois','duas','uma','para','com','que']);

export function normalizeSearchQuery(value = '') {
  const quoted = String(value).match(/["“]([^"”]{2,120})["”]/)?.[1];
  if (quoted) return quoted.trim();
  const focused = String(value)
    .replace(/^\s*(?:pesquise|busque|procure)(?:\s+em)?(?:\s+fontes?\s+p[uú]blicas?)?\s*/i, '')
    .replace(/^\s*(?:o que (?:é|e)|quem (?:é|e)|como funciona)\s+/i, '')
    .split(/\s+e\s+(?:d[eê]|liste|mostre|explique|compare|cite)(?:\s|$)|[,;]/iu)[0]
    .trim();
  return focused || String(value).trim();
}

function searchTerms(value) {
  return [...new Set(String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().match(/[a-z0-9+#.-]{3,}/g) || [])]
    .filter(term => !QUERY_STOP_WORDS.has(term));
}

function relevance(result, query) {
  const normalizedQuery = normalizeSearchQuery(query).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const title = String(result.title || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const snippet = String(result.snippet || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const terms = searchTerms(normalizedQuery);
  let score = normalizedQuery && title.includes(normalizedQuery) ? 10 : 0;
  for (const term of terms) score += title.includes(term) ? 3 : snippet.includes(term) ? 1 : 0;
  return score;
}

function decodeHtml(value = '') {
  return String(value).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code))).replace(/\s+/g, ' ').trim();
}

function isPrivateAddress(address) {
  if (isIP(address) === 4) return PRIVATE_V4.test(address);
  const value = address.toLowerCase();
  return value === '::1' || value === '::' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:') || value.startsWith('::ffff:127.') || value.startsWith('::ffff:10.') || value.startsWith('::ffff:192.168.');
}

export async function assertSafeUrl(value, { allowLocalhost = false, resolveHost = lookup } = {}) {
  let url; try { url = new URL(value); } catch { throw new Error('URL inválida.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Somente URLs HTTP(S) sem credenciais são permitidas.');
  const host = url.hostname.toLowerCase(); const local = host === 'localhost' || host.endsWith('.localhost');
  if (local) { if (!allowLocalhost) throw new Error('Acesso a localhost não é permitido nesta ferramenta.'); return url; }
  if (isPrivateAddress(host)) throw new Error('Acesso a endereços privados foi bloqueado.');
  const addresses = await resolveHost(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(item => isPrivateAddress(item.address))) throw new Error('O host resolveu para uma rede privada ou inválida.');
  return url;
}

export async function request(fetchImpl, url, { timeoutMs = 12_000, maxBytes = 1_500_000, allowLocalhost = false, resolveHost = lookup } = {}) {
  let current = await assertSafeUrl(url, { allowLocalhost, resolveHost });
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await fetchImpl(current, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs), headers: { Accept: 'application/json,text/html,text/plain;q=0.9', 'User-Agent': USER_AGENT } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirects === 3) throw new Error('Redirecionamentos demais.');
      const location = response.headers.get('location'); if (!location) throw new Error('Redirecionamento sem destino.');
      current = await assertSafeUrl(new URL(location, current).href, { allowLocalhost, resolveHost }); continue;
    }
    if (!response.ok) throw new Error(`A fonte respondeu com HTTP ${response.status}.`);
    const declared = Number(response.headers.get('content-length') || 0); if (declared > maxBytes) throw new Error('Conteúdo remoto excede o limite seguro.');
    const bytes = new Uint8Array(await response.arrayBuffer()); if (bytes.byteLength > maxBytes) throw new Error('Conteúdo remoto excede o limite seguro.');
    return { url: current.href, contentType: response.headers.get('content-type') || '', text: new TextDecoder().decode(bytes) };
  }
  throw new Error('Falha ao seguir redirecionamento.');
}

function extractPage(html, url) {
  const title = decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || new URL(url).hostname).slice(0, 300);
  const withoutNoise = html.replace(/<(script|style|svg|noscript|template)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  const links = [...withoutNoise.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(match => {
    try { const href = new URL(match[1], url); return ['http:', 'https:'].includes(href.protocol) ? { text: decodeHtml(match[2]).slice(0, 180), url: href.href } : null; } catch { return null; }
  }).filter(Boolean).filter((item, index, all) => item.text && all.findIndex(candidate => candidate.url === item.url) === index).slice(0, 60);
  const text = decodeHtml(withoutNoise.replace(/<!--([\s\S]*?)-->/g, ' ').replace(/<[^>]+>/g, ' ')).slice(0, 80_000);
  return { url, title, text, excerpt: text.slice(0, 4_000), links };
}

async function wikipedia(fetchImpl, query, limit) {
  const url = new URL('https://pt.wikipedia.org/w/api.php');
  Object.entries({ action: 'query', format: 'json', list: 'search', srsearch: query, srlimit: String(limit), utf8: '1', origin: '*' }).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(10_000), headers: { 'User-Agent': USER_AGENT } }); if (!response.ok) throw new Error(`Wikipedia: HTTP ${response.status}`);
  const data = await response.json();
  const matches = data.query?.search || [];
  const pageIds = matches.map(item => item.pageid).filter(value => Number.isInteger(value));
  const pages = new Map();
  if (pageIds.length) {
    try {
      const detailsUrl = new URL('https://pt.wikipedia.org/w/api.php');
      Object.entries({ action: 'query', format: 'json', prop: 'extracts|info', pageids: pageIds.join('|'), exintro: '1', explaintext: '1', inprop: 'url', origin: '*' }).forEach(([key, value]) => detailsUrl.searchParams.set(key, value));
      const detailsResponse = await fetchImpl(detailsUrl, { signal: AbortSignal.timeout(10_000), headers: { 'User-Agent': USER_AGENT } });
      if (detailsResponse.ok) {
        const details = await detailsResponse.json();
        for (const page of Object.values(details.query?.pages || {})) pages.set(Number(page.pageid), page);
      }
    } catch {
      // O resultado da busca continua útil caso o enriquecimento da página falhe.
    }
  }
  return matches.map(item => {
    const page = pages.get(Number(item.pageid));
    const snippet = decodeHtml(page?.extract || item.snippet).slice(0, 3_000);
    return { source: 'wikipedia', title: item.title, url: page?.fullurl || `https://pt.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`, snippet, publishedAt: item.timestamp || null, evidence: `Wikipedia: ${snippet}` };
  });
}

async function openAlex(fetchImpl, query, limit) {
  const url = new URL('https://api.openalex.org/works'); url.searchParams.set('search', query); url.searchParams.set('per_page', String(limit)); url.searchParams.set('select', 'id,display_name,publication_date,doi,primary_location,cited_by_count');
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(12_000), headers: { 'User-Agent': USER_AGENT } }); if (!response.ok) throw new Error(`OpenAlex: HTTP ${response.status}`);
  const data = await response.json();
  return (data.results || []).map(item => ({ source: 'openalex', title: item.display_name, url: item.doi || item.primary_location?.landing_page_url || item.id, snippet: `Trabalho acadêmico publicado em ${item.publication_date || 'data desconhecida'}; ${item.cited_by_count || 0} citações no índice.`, publishedAt: item.publication_date || null, evidence: `OpenAlex ${item.id}; citações: ${item.cited_by_count || 0}` }));
}

async function stackExchange(fetchImpl, query, limit) {
  const url = new URL('https://api.stackexchange.com/2.3/search/advanced'); url.searchParams.set('site', 'stackoverflow'); url.searchParams.set('q', query); url.searchParams.set('pagesize', String(limit)); url.searchParams.set('order', 'desc'); url.searchParams.set('sort', 'relevance');
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(10_000), headers: { 'User-Agent': USER_AGENT } }); if (!response.ok) throw new Error(`Stack Exchange: HTTP ${response.status}`);
  const data = await response.json();
  return (data.items || []).map(item => ({ source: 'stackoverflow', title: decodeHtml(item.title), url: item.link, snippet: `${item.answer_count || 0} respostas · score ${item.score || 0}${item.is_answered ? ' · respondida' : ''}.`, publishedAt: item.creation_date ? new Date(item.creation_date * 1000).toISOString() : null, evidence: `Stack Overflow: score ${item.score || 0}; respostas ${item.answer_count || 0}` }));
}

export function createResearchAgent({ fetchImpl = fetch, resolveHost = lookup } = {}) {
  const providers = { wikipedia, openalex: openAlex, stackoverflow: stackExchange };
  async function search({ query, sources = Object.keys(providers), limit = 5 }) {
    const providerQuery = normalizeSearchQuery(query);
    const selected = [...new Set(sources)].filter(source => providers[source]);
    const settled = await Promise.allSettled(selected.map(source => providers[source](fetchImpl, providerQuery, limit)));
    const errors = []; const results = [];
    settled.forEach((item, index) => item.status === 'fulfilled' ? results.push(...item.value) : errors.push({ source: selected[index], error: item.reason instanceof Error ? item.reason.message : 'Falha desconhecida.' }));
    const unique = results.map(item => ({ ...item, relevance: relevance(item, providerQuery) }))
      .filter(item => item.url && item.relevance > 0)
      .filter((item, index, all) => all.findIndex(candidate => candidate.url === item.url) === index)
      .sort((left, right) => right.relevance - left.relevance)
      .slice(0, limit * selected.length);
    return { query, providerQuery, sources: selected, results: unique, errors, researchedAt: new Date().toISOString() };
  }

  async function investigate({ question, sources = Object.keys(providers), limitPerQuery = 4 }) {
    const fragments = String(question).split(/\b(?:versus|vs\.?|e tamb[eé]m|compare com)\b|[;?]+/i).map(value => value.trim()).filter(value => value.length >= 4);
    const queries = [...new Set([String(question).trim(), ...fragments])].slice(0, 5);
    const batches = await Promise.all(queries.map(query => search({ query, sources, limit: limitPerQuery })));
    const evidence = batches.flatMap(batch => batch.results.map(result => ({ query: batch.query, title: result.title, url: result.url, source: result.source, evidence: result.evidence || result.snippet, publishedAt: result.publishedAt, quality: SOURCE_QUALITY[result.source] || { authority: 0.5, kind: 'unknown', caveat: 'autoridade não classificada' } })));
    const unique = evidence.filter((item, index, all) => all.findIndex(candidate => candidate.url === item.url) === index);
    const sourceCoverage = Object.fromEntries(sources.map(source => [source, unique.filter(item => item.source === source).length]));
    const gaps = queries.filter(query => !evidence.some(item => item.query === query)).map(query => `Sem resultado para: ${query}`);
    const dates = unique.map(item => item.publishedAt).filter(Boolean).sort((left, right) => String(left).localeCompare(String(right)));
    const evidenceGraph = { nodes: [...queries.map((query, index) => ({ id: `q-${index + 1}`, type: 'question', label: query })), ...unique.map((item, index) => ({ id: `e-${index + 1}`, type: 'evidence', label: item.title, url: item.url, authority: item.quality.authority }))], edges: unique.map((item, index) => ({ from: `q-${queries.indexOf(item.query) + 1}`, to: `e-${index + 1}`, relation: 'supported-by' })) };
    return {
      question, queries, evidence: unique, sourceCoverage, gaps,
      evidenceGraph, averageAuthority: unique.length ? unique.reduce((sum, item) => sum + item.quality.authority, 0) / unique.length : 0,
      divergenceSignals: unique.length > 1 ? ['Compare datas, metodologia e autoridade das fontes antes de sintetizar; resultados recuperados não são automaticamente verdadeiros.'] : ['Pouca diversidade de evidência; trate a conclusão como incerta.'],
      dateRange: dates.length ? { oldest: dates[0], newest: dates.at(-1) } : null,
      researchedAt: new Date().toISOString(),
    };
  }

  const definitions = [
    defineTool({
      name: 'research.search', aliases: ['web.search'], description: 'Pesquisa em fontes públicas e devolve URLs, trechos e evidências normalizadas.', risk: RISK.NETWORK,
      inputSchema: { type: 'object', required: ['query'], additionalProperties: false, properties: { query: { type: 'string', minLength: 2, maxLength: 500 }, sources: { type: 'array', maxItems: 3, items: { type: 'string', enum: Object.keys(providers) } }, limit: { type: 'integer', minimum: 1, maximum: 10, default: 5 } } },
      execute: search,
    }),
    defineTool({
      name: 'research.fetch', aliases: ['web.fetch'], description: 'Lê uma página HTTP(S) externa com bloqueio de SSRF, redirecionamento e tamanho.', risk: RISK.NETWORK,
      inputSchema: { type: 'object', required: ['url'], additionalProperties: false, properties: { url: { type: 'string', minLength: 8, maxLength: 2000 }, maxBytes: { type: 'integer', minimum: 1_000, maximum: 2_000_000, default: 1_000_000 } } },
      execute: async ({ url, maxBytes = 1_000_000 }) => { const page = await request(fetchImpl, url, { maxBytes, resolveHost }); return extractPage(page.text, page.url); },
    }),
    defineTool({
      name: 'research.investigate', description: 'Decompõe uma pergunta, pesquisa várias fontes em paralelo e devolve matriz de evidências, cobertura, datas, divergências e lacunas.', risk: RISK.NETWORK,
      inputSchema: { type: 'object', required: ['question'], additionalProperties: false, properties: { question: { type: 'string', minLength: 4, maxLength: 1000 }, sources: { type: 'array', maxItems: 3, items: { type: 'string', enum: Object.keys(providers) } }, limitPerQuery: { type: 'integer', minimum: 1, maximum: 8, default: 4 } } },
      execute: investigate,
    }),
  ];

  return { definitions, search, investigate, extractPage, fetchPage: async (url, options = {}) => { const page = await request(fetchImpl, url, { ...options, resolveHost }); return extractPage(page.text, page.url); }, health: () => ({ providers: Object.keys(providers), paidKeysRequired: false, multiQueryEvidence: true, sourceQuality: true, evidenceGraph: true }) };
}

export { extractPage };
