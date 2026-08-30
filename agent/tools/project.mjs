import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { defineTool } from './contracts.mjs';

function projectFiles(template) {
  if (template === 'static-site') return {
    'index.html': '<!doctype html>\n<html lang="pt-BR">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>Novo site</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <main>\n    <p class="eyebrow">CRIADO PELO NEXO</p>\n    <h1>Seu novo site está pronto.</h1>\n    <p>Edite este projeto com o agente local.</p>\n    <button id="action">Começar</button>\n  </main>\n  <script src="app.js"></script>\n</body>\n</html>\n',
    'style.css': ':root{font-family:Inter,system-ui;color:#18181b;background:#f5f3ff}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center}main{width:min(680px,90vw);padding:56px;border:1px solid #ddd6fe;border-radius:28px;background:#fff;box-shadow:0 30px 80px #4c1d9520}h1{font-size:clamp(2.5rem,8vw,5rem);line-height:.95;letter-spacing:-.06em;margin:.3em 0}.eyebrow{font-size:.75rem;letter-spacing:.18em;color:#7c3aed}button{border:0;border-radius:12px;background:#7c3aed;color:white;padding:12px 20px;font-weight:700}\n',
    'app.js': "document.querySelector('#action').addEventListener('click',()=>alert('Projeto funcionando!'));\n",
    'README.md': '# Site estático\n\nAbra `index.html` no navegador ou use um servidor local.\n',
  };
  if (template === 'node-api') return {
    'package.json': '{"name":"nexo-node-api","private":true,"type":"module","scripts":{"start":"node server.js"}}\n',
    'server.js': "import { createServer } from 'node:http';\nconst port=8080;\ncreateServer((req,res)=>{\n  res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'http://localhost:3000'});\n  res.end(JSON.stringify({ok:true,message:'API local criada pelo Nexo'}));\n}).listen(port,'127.0.0.1',()=>console.log(`API em http://127.0.0.1:${port}`));\n",
    'README.md': '# API Node local\n\nExecute `npm start`. O servidor fica restrito a `127.0.0.1:8080`.\n',
  };
  if (template === 'python-api') return {
    'server.py': "from http.server import BaseHTTPRequestHandler, HTTPServer\nimport json\n\nclass Handler(BaseHTTPRequestHandler):\n    def do_GET(self):\n        body = json.dumps({'ok': True, 'message': 'API Python local criada pelo Nexo'}).encode()\n        self.send_response(200)\n        self.send_header('Content-Type', 'application/json')\n        self.send_header('Content-Length', str(len(body)))\n        self.end_headers()\n        self.wfile.write(body)\n\nHTTPServer(('127.0.0.1', 8080), Handler).serve_forever()\n",
    'README.md': '# API Python local\n\nExecute `python server.py`. O servidor fica restrito a `127.0.0.1:8080`.\n',
  };
  if (template === 'ai-service') return {
    'package.json': '{"name":"nexo-ai-service","private":true,"type":"module","scripts":{"start":"node server.js"}}\n',
    'server.js': "import { createServer } from 'node:http';\nconst port=8081;\ncreateServer(async(req,res)=>{\n  if(req.method!=='POST'){res.writeHead(405);return res.end();}\n  let body='';for await(const chunk of req)body+=chunk;\n  const input=JSON.parse(body||'{}');\n  const upstream=await fetch('http://127.0.0.1:11434/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'qwen2.5-coder:7b-instruct-q3_K_S',stream:false,messages:[{role:'user',content:String(input.prompt||'')} ]})});\n  const data=await upstream.text();res.writeHead(upstream.status,{'Content-Type':'application/json'});res.end(data);\n}).listen(port,'127.0.0.1',()=>console.log(`IA local em http://127.0.0.1:${port}`));\n",
    'README.md': '# Serviço de IA local\n\nExecute `npm start` com o Ollama aberto. Envie POST JSON para `http://127.0.0.1:8081`.\n',
  };
  throw new Error('Modelo de projeto não permitido.');
}

export function createProjectTools(filesystem) {
  return [defineTool({
    name: 'project.create', aliases: ['create_project'], description: 'Cria um projeto pequeno a partir de um template local permitido.', risk: 'write',
    inputSchema: { type: 'object', properties: {
      path: { type: 'string', minLength: 1, maxLength: 1000 }, template: { type: 'string', enum: ['static-site', 'node-api', 'python-api', 'ai-service'] },
    }, required: ['path', 'template'], additionalProperties: false },
    execute: async input => {
      const target = filesystem.safePath(input.path);
      try { await stat(target); throw new Error('A pasta do projeto já existe.'); } catch (error) { if (error instanceof Error && error.message === 'A pasta do projeto já existe.') throw error; }
      const files = projectFiles(input.template); await mkdir(target, { recursive: false });
      await Promise.all(Object.entries(files).map(([name, content]) => writeFile(filesystem.safePath(join(input.path, name)), content, 'utf8')));
      return { path: relative(filesystem.safePath('.'), target), template: input.template, files: Object.keys(files) };
    },
  })];
}
