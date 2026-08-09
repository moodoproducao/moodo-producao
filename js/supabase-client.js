/* ============================================================================
   MOODO PRODUÇÃO — camada de integração com o Supabase (v2 · estado único)
   ============================================================================
   Este arquivo fala com UMA tabela (estado_operacional) que guarda o mesmo
   objeto de estado que store.js já mantém em memória — obras, tarefas,
   pendências, etapas configuráveis, tudo. Isso significa que nenhuma função
   de negócio em store.js precisa mudar: só a forma como o estado entra
   (carregarEstado) e sai (salvarEstado) da memória.

   Como plugar:
   1. Preencha supabase-config.js com a URL e a publishable key do seu projeto.
   2. Inclua estes dois arquivos no index.html, ANTES de store.js:
        <script src="js/supabase-config.js"></script>
        <script src="js/supabase-client.js"></script>
   3. store.js já sabe usar M.Supa quando M.Supa.habilitado for true (ver os
      comentários "// SUPABASE:" em store.js).

   Enquanto SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY estiverem vazios em
   supabase-config.js, nada disso roda — o app continua 100% no localStorage,
   exatamente como hoje.
   ============================================================================ */
(function(){
  "use strict";
  window.M = window.M || {};
  const M = window.M;

  const habilitado = !!(M.SUPABASE_URL && M.SUPABASE_PUBLISHABLE_KEY);
  const Supa = { habilitado, client: null, ready: Promise.resolve(false) };
  M.Supa = Supa;

  if (!habilitado) {
    console.info("[Moodo] Supabase não configurado — usando localStorage local (modo protótipo).");
    return;
  }

  function carregarSupabaseJs() {
    return new Promise((resolve, reject) => {
      if (window.supabase) return resolve();
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js";
      s.onload = resolve;
      s.onerror = () => reject(new Error("Não consegui carregar a biblioteca do Supabase (CDN). Verifique a conexão."));
      document.head.appendChild(s);
    });
  }

  Supa.ready = carregarSupabaseJs().then(() => {
    Supa.client = window.supabase.createClient(M.SUPABASE_URL, M.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
    console.info("[Moodo] Conectado ao Supabase.");
    return true;
  }).catch(err => {
    console.error("[Moodo] Falha ao iniciar Supabase, caindo de volta pro localStorage:", err);
    Supa.habilitado = false;
    return false;
  });

  // --------------------------------------------------------------------------
  // AUTENTICAÇÃO — pronta pro dia em que o login por senha for ligado; hoje
  // o app ainda usa o seletor de perfil na barra lateral, sem senha.
  // --------------------------------------------------------------------------
  Supa.login = async (email, senha) => {
    const { data, error } = await Supa.client.auth.signInWithPassword({ email, password: senha });
    if (error) throw error;
    return data;
  };
  Supa.logout = () => Supa.client.auth.signOut();
  Supa.colaboradorLogado = async () => {
    const { data: { user } } = await Supa.client.auth.getUser();
    if (!user) return null;
    const { data, error } = await Supa.client.from("colaboradores").select("*").eq("auth_user_id", user.id).single();
    if (error) return null;
    return data;
  };

  // --------------------------------------------------------------------------
  // EQUIPE — tabela relacional própria (colaboradores), separada do blob de
  // estado_operacional. É a mesma tabela que auth_user_id vai usar quando o
  // login por senha for ligado, então a equipe já nasce pronta pra isso.
  // --------------------------------------------------------------------------
  Supa.listarColaboradores = async () => {
    const { data, error } = await Supa.client.from("colaboradores").select("*").order("criado_em", { ascending: true });
    if (error) { console.error("[Moodo] erro ao listar colaboradores:", error); return null; }
    return data;
  };
  Supa.criarColaborador = async (dados) => {
    const { data, error } = await Supa.client.from("colaboradores").insert(dados).select().single();
    if (error) throw error;
    return data;
  };
  Supa.atualizarColaborador = async (id, dados) => {
    const { data, error } = await Supa.client.from("colaboradores").update(dados).eq("id", id).select().single();
    if (error) throw error;
    return data;
  };
  // dispara "cb" sempre que QUALQUER aparelho criar/editar/desativar alguém —
  // quem chamou decide o que fazer (aqui, sempre recarrega a lista inteira).
  Supa.assinarMudancasColaboradores = (cb) => {
    const canal = Supa.client.channel("moodo-colaboradores-realtime");
    canal.on("postgres_changes", { event: "*", schema: "public", table: "colaboradores" }, () => cb());
    canal.subscribe();
    return () => Supa.client.removeChannel(canal);
  };

  // --------------------------------------------------------------------------
  // LEITURA — busca a linha única de estado_operacional. Retorna null se a
  // tabela ainda estiver vazia (primeiro acesso de todos — nesse caso quem
  // chamou deve semear com o estado local de exemplo, ver store.js). Também
  // devolve atualizadoEm — é o "carimbo" que salvarEstado usa pra saber se
  // ninguém mais gravou por cima entre a leitura e a escrita (ver abaixo).
  // --------------------------------------------------------------------------
  Supa.carregarEstado = async () => {
    const { data, error } = await Supa.client.from("estado_operacional").select("dados, atualizado_em").eq("id", 1).maybeSingle();
    if (error) { console.error("[Moodo] erro ao ler estado do Supabase:", error); return null; }
    return data ? { dados: data.dados, atualizadoEm: data.atualizado_em } : null;
  };

  // --------------------------------------------------------------------------
  // ESCRITA — grava o estado inteiro, COM TRAVA DE CONCORRÊNCIA (risco real
  // encontrado na auditoria: o app inteiro guarda tudo — obras, tarefas,
  // pendências — num blob único; se dois aparelhos gravarem quase ao mesmo
  // tempo, o "upsert" de quem chegasse por último apagava silenciosamente a
  // mudança do outro, sem aviso nenhum). Agora a gravação só acontece se
  // atualizado_em no banco ainda for o mesmo que este aparelho leu por último
  // (atualizadoEmConhecido) — se outra pessoa já gravou nesse meio tempo, o
  // update não bate em nenhuma linha (0 resultados) e devolvemos conflito:true
  // em vez de sobrescrever. Não precisa de coluna nova: atualizado_em já existia.
  // Devolve {ok, atualizadoEm} em caso de sucesso, ou {ok:false, conflito:true}
  // quando outra gravação venceu a corrida, ou {ok:false} em erro de rede/etc.
  // --------------------------------------------------------------------------
  Supa.salvarEstado = async (estado, atualizadoEmConhecido) => {
    const agora = new Date().toISOString();
    if(!atualizadoEmConhecido){
      // primeiro carregamento desta sessão ainda sem carimbo conhecido: tenta
      // criar a linha (primeiro acesso de todos). Se já existir (outra pessoa
      // criou primeiro), cai pro caminho condicional abaixo lendo o carimbo atual.
      const { error: erroInsert } = await Supa.client.from("estado_operacional")
        .insert({ id: 1, dados: estado, atualizado_em: agora });
      if(!erroInsert) return { ok:true, atualizadoEm: agora };
    }
    let base = atualizadoEmConhecido;
    if(!base){
      const atual = await Supa.client.from("estado_operacional").select("atualizado_em").eq("id", 1).maybeSingle();
      base = atual.data ? atual.data.atualizado_em : null;
    }
    let query = Supa.client.from("estado_operacional").update({ dados: estado, atualizado_em: agora }).eq("id", 1);
    query = base ? query.eq("atualizado_em", base) : query;
    const { data, error } = await query.select("atualizado_em");
    if (error) { console.error("[Moodo] erro ao salvar estado no Supabase:", error); return { ok:false }; }
    if (!data || !data.length) return { ok:false, conflito:true };
    return { ok:true, atualizadoEm: agora };
  };

  // --------------------------------------------------------------------------
  // TEMPO REAL — quando outro aparelho (outro celular, o desktop, a TV) grava
  // uma mudança, esta assinatura dispara "cb" com o novo estado inteiro E o
  // carimbo atualizado_em dessa gravação, para o app local se atualizar sem
  // precisar de F5 e manter o carimbo em dia (senão a próxima gravação local
  // acharia — errado — que houve conflito).
  // --------------------------------------------------------------------------
  Supa.assinarMudancas = (cb) => {
    const canal = Supa.client.channel("moodo-estado-realtime");
    canal.on("postgres_changes", { event: "UPDATE", schema: "public", table: "estado_operacional" },
      (payload) => cb(payload.new && payload.new.dados, payload.new && payload.new.atualizado_em));
    canal.subscribe();
    return () => Supa.client.removeChannel(canal);
  };
})();
