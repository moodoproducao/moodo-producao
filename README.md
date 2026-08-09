# Moodo Produção

Sistema operacional de fábrica da Moodo — PCP, produção, pendências, tarefas, montagem e
assistência. É um app **estático**: HTML/CSS/JS puro, **sem bundler e sem passo de build**
(sem Vite, sem Webpack, sem `npm run build`). O que está no repositório é exatamente o que
sobe para produção.

> Para o histórico de features e decisões de produto, ver `LEIA-ME.md`. Este arquivo cobre
> só o que é necessário para rodar, configurar e publicar o projeto.

## Arquitetura real

- **Frontend**: JavaScript puro no namespace global `window.M`, sem framework. Navegação por
  hash router (`js/router.js`), com uma função `M.render()` (`js/main.js`) que reconstrói a
  tela inteira a cada mudança de estado ou de rota — não há Virtual DOM nem componentes.
- **Ordem de carregamento dos scripts** é definida no `index.html` e importa: `js/data.js`
  (dados/constantes) → `js/supabase-config.js` + `js/supabase-client.js` (integração opcional
  com a nuvem) → `js/store.js` (estado + lógica de negócio) → `js/calc.js` → `js/ui.js` →
  `js/actions.js` → páginas (`js/pages/*.js`) → `js/router.js` → `js/main.js` (bootstrap).
- **Persistência — duas camadas, não uma só:**
  - `localStorage` do navegador guarda o estado operacional completo (obras, tarefas,
    pendências, assistências, etapas, configurações etc.) e é sempre gravado, mesmo sem
    Supabase configurado — é o que garante que o app abre instantaneamente e funciona offline.
  - **Supabase** (quando `js/supabase-config.js` está preenchido) sincroniza esse mesmo bloco
    de estado na tabela `estado_operacional` (uma linha, coluna `dados` em JSONB) e replica em
    tempo real entre aparelhos via Realtime. **Exceção:** a tabela **`colaboradores`** (equipe)
    é relacional de verdade e é lida/gravada diretamente pelo app — não faz parte do blob JSON.
- **Sem processo de build**: todo `.js`/`.css` do repositório é servido como está. Não existe
  TypeScript, JSX, Sass ou qualquer transpilação.

## Como rodar localmente

Não precisa de `npm install` (não há dependências de runtime). Qualquer servidor estático
funciona:

```bash
# opção 1 — Python (já vem em quase todo sistema)
python3 -m http.server 8765

# opção 2 — usando o script do package.json (baixa o pacote "serve" na hora via npx)
npm start
```

Depois abra `http://localhost:8765` (ou a porta que o `serve` indicar). Sem preencher o
Supabase, o app funciona 100% no `localStorage` do navegador — nada quebra, só não sincroniza
entre aparelhos.

## Onde configurar o Supabase

Edite `js/supabase-config.js`:

```js
window.M.SUPABASE_URL = "https://SEU-PROJETO.supabase.co";
window.M.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_...";
```

Os dois valores vêm de **Project Settings → API** no painel do Supabase. Use sempre a chave
**"publishable"** (prefixo `sb_publishable_...`) — nunca a `sb_secret_...` nem a
`service_role`, que dão acesso total ao banco e não podem existir no navegador.

Enquanto os dois campos estiverem vazios, o app roda só em `localStorage` (modo protótipo).
Depois de preencher e publicar, o schema (`schema.sql`/`seed.sql`, mantidos junto ao projeto
de backend) precisa já ter sido executado no SQL Editor do Supabase, e a replicação em tempo
real da tabela `estado_operacional` precisa estar ativada:

```sql
alter publication supabase_realtime add table estado_operacional;
```

`js/supabase-config.js` **é seguro de versionar** — só contém a URL e a chave publicável, que
são projetadas para ficar no navegador. O `.env.example` na raiz existe **só como
documentação** do que preencher ali; como o projeto não usa bundler, nenhum arquivo `.env` é
lido automaticamente pelo app.

## Quais dados podem ficar no frontend

- **Pode**: `SUPABASE_URL` e a chave `sb_publishable_...` — são públicas por design (o
  equivalente à antiga `anon key`), protegidas pelas policies de RLS do banco, não por sigilo.
- **Nunca pode**: chave `sb_secret_...`, `service_role`, senha do banco Postgres, ou qualquer
  credencial que dê acesso administrativo. Nenhuma dessas deve aparecer em nenhum arquivo
  `.js`/`.html` deste repositório — só em variáveis de ambiente do lado do servidor, se algum
  dia existir um backend próprio.
- **Situação atual do banco**: as policies de RLS das tabelas `perfis`, `colaboradores` e
  `estado_operacional` estão como `using (true)` — abertas para qualquer cliente com a chave
  publicável, porque ainda não há login por senha ligado na interface. Isso é aceitável apenas
  enquanto o app roda para uma única empresa confiável; **antes de qualquer piloto
  multiempresa ou de expor a chave publicamente fora da equipe, as policies precisam ser
  reescritas para checar `auth.uid()`**.

## Como publicar na Vercel

1. Conecte o repositório do GitHub a um novo projeto Vercel — **framework preset "Other"**
   (não é um projeto Next.js/Vite, é estático).
2. Não é preciso configurar build command nem output directory (o projeto não tem passo de
   build; a raiz do repositório já é o que deve ser servido).
3. O roteamento é 100% client-side por **hash** (`#/rota`), não por caminho de URL — o
   navegador nunca pede `/producao` ao servidor, só `/` com um fragmento depois do `#`. Por
   isso **não é necessário nenhum rewrite no `vercel.json`** para as rotas do app funcionarem
   com acesso direto ou F5; o `vercel.json` existente só define cabeçalhos de cache (service
   worker sempre revalidado, `manifest.json` com cache curto, ícones com cache longo).
4. Depois do primeiro deploy, confirme que `js/supabase-config.js` já está preenchido com os
   valores do projeto Supabase de produção antes de divulgar a URL para a equipe.
5. Ao fazer um deploy que muda algum arquivo `.js`, lembre de subir também a versão
   (`APP_VERSION` em `js/main.js` e `CACHE_NAME` em `service-worker.js`) — são duas strings
   independentes que precisam ser incrementadas juntas para o service worker descartar o cache
   antigo e mostrar o aviso de "nova versão disponível" aos usuários já instalados como PWA.
