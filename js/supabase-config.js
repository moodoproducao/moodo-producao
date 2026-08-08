/* ============================================================
   MOODO PRODUÇÃO — configuração do Supabase
   ============================================================
   Preencha as duas linhas abaixo com os dados do SEU projeto Supabase
   (Configurações do projeto → API → "Project URL" e "anon public key").

   Enquanto SUPABASE_URL estiver vazio, o app continua funcionando
   exatamente como hoje, salvando no localStorage do navegador — nada
   quebra. No momento em que você preencher as duas linhas e publicar,
   o app passa a ler/gravar direto no seu banco Supabase.
   ============================================================ */
window.M = window.M || {};
window.M.SUPABASE_URL = "";       // ex.: "https://xxxxxxxxxxxx.supabase.co"
window.M.SUPABASE_ANON_KEY = "";  // a chave "anon public", NUNCA a "service_role"
