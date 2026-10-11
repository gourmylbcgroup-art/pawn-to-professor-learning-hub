/* Pawn to Professor — Flashcard Storage Bridge v1 */
(() => {
  'use strict';
  const CHANNEL = 'ptp-flashcard-storage-v1';
  const TABLE = 'user_flashcard_sets';
  const frame = document.getElementById('gameFrame');

  function reply(target, origin, requestId, ok, payload = {}) {
    try { target.postMessage({channel:CHANNEL,type:'response',requestId,ok,...payload}, origin); } catch {}
  }

  function clean(v='', max=120){ return String(v ?? '').trim().slice(0,max); }

  async function getClient() {
    if (globalThis.activeClient) return globalThis.activeClient;
    if (!globalThis.supabase?.createClient) throw new Error('Supabase client is unavailable.');
    const r = await fetch('/api/config', {cache:'no-store'});
    if (!r.ok) throw new Error('Portal configuration is unavailable.');
    const cfg = await r.json();
    return globalThis.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{
      auth:{persistSession:true,autoRefreshToken:true}
    });
  }

  window.addEventListener('message', async event => {
    const msg = event.data;
    if (!msg || msg.channel !== CHANNEL || msg.type !== 'request') return;
    if (!frame?.contentWindow || event.source !== frame.contentWindow) return;

    const target = event.source;
    const origin = event.origin;
    const requestId = String(msg.requestId || '');

    try {
      const client = await getClient();
      const {data:{session}} = await client.auth.getSession();
      if (!session?.user?.id) throw new Error('You must be logged in.');

      const unitKey = clean(msg.unitKey);
      const lessonKey = clean(msg.lessonKey || 'main');
      if (!unitKey) throw new Error('Missing unitKey.');

      if (msg.action === 'list') {
        const {data,error} = await client.from(TABLE)
          .select('id,set_name,unit_key,lesson_key,card_ids,hidden_card_ids,metadata,created_at,updated_at')
          .eq('unit_key',unitKey)
          .eq('lesson_key',lessonKey)
          .order('updated_at',{ascending:false});
        if (error) throw error;
        return reply(target,origin,requestId,true,{sets:data || []});
      }

      if (msg.action === 'save') {
        const row = {
          set_name: clean(msg.setName,100),
          unit_key: unitKey,
          lesson_key: lessonKey,
          card_ids: Array.isArray(msg.cardIds) ? msg.cardIds : [],
          hidden_card_ids: Array.isArray(msg.hiddenCardIds) ? msg.hiddenCardIds : [],
          metadata: msg.metadata && typeof msg.metadata === 'object' && !Array.isArray(msg.metadata) ? msg.metadata : {}
        };
        if (!row.set_name) throw new Error('Enter a set name.');

        const query = msg.id
          ? client.from(TABLE).update(row).eq('id',String(msg.id)).select().single()
          : client.from(TABLE).insert(row).select().single();

        const {data,error} = await query;
        if (error) {
          if (String(error.message || '').includes('FLASHCARD_SET_LIMIT_REACHED')) {
            throw new Error('You already have 20 saved sets for this lesson. Delete one first.');
          }
          throw error;
        }
        return reply(target,origin,requestId,true,{set:data});
      }

      if (msg.action === 'delete') {
        const id = String(msg.id || '');
        if (!id) throw new Error('Missing set ID.');
        const {error} = await client.from(TABLE).delete().eq('id',id);
        if (error) throw error;
        return reply(target,origin,requestId,true);
      }

      throw new Error('Unknown flashcard storage action.');
    } catch (err) {
      reply(target,origin,requestId,false,{error:err?.message || 'Flashcard storage failed.'});
    }
  });

  globalThis.PTP_FLASHCARD_BRIDGE = {version:'1'};
})();
