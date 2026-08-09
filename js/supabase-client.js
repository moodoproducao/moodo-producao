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
  // chamou deve semear com o estado local de exemplo, ver store.js).
  // --------------------------------------------------------------------------
  Supa.carregarEstado = async () => {
    const { data, error } = await Supa.client.from("estado_operacional").select("dados").eq("id", 1).maybeSingle();
    if (error) { console.error("[Moodo] erro ao ler estado do Supabase:", error); return null; }
    return data ? data.dados : null;
  };

  // --------------------------------------------------------------------------
  // ESCRITA — grava (upsert) o estado inteiro. Chamado pelo store.js depois
  // de cada mutação (o mesmo momento em que hoje ele grava no localStorage).
  // Envia o nome de quem está gravando só pra rastro (atualizado_por fica
  // nulo até o login por senha existir e conseguirmos ligar ao colaborador).
  // --------------------------------------------------------------------------
  Supa.salvarEstado = async (estado) => {
    const { error } = await Supa.client.from("estado_operacional")
      .upsert({ id: 1, dados: estado, atualizado_em: new Date().toISOString() });
    if (error) console.error("[Moodo] erro ao salvar estado no Supabase:", error);
    return !error;
  };

  // --------------------------------------------------------------------------
  // TEMPO REAL — quando outro aparelho (outro celular, o desktop, a TV) grava
  // uma mudança, esta assinatura dispara "cb" com o novo estado inteiro, para
  // o app local se atualizar sem precisar de F5. Ignora o próprio eco (o
  // callback recebe o payload cru; quem chamou decide se aplica ou não).
  // --------------------------------------------------------------------------
  Supa.assinarMudancas = (cb) => {
    const canal = Supa.client.channel("moodo-estado-realtime");
    canal.on("postgres_changes", { event: "UPDATE", schema: "public", table: "estado_operacional" },
      (payload) => cb(payload.new && payload.new.dados));
    canal.subscribe();
    return () => Supa.client.removeChannel(canal);
  };
})();
