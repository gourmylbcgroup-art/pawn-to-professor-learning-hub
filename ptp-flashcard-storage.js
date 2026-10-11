/* Pawn to Professor — Lesson Flashcard Storage Client v1 */
(() => {
  'use strict';
  const CHANNEL='ptp-flashcard-storage-v1';
  const pending=new Map();

  function cfg(){
    const c=globalThis.PTP_FLASHCARD_CONFIG || {};
    const unitKey=String(c.unitKey || '').trim();
    const lessonKey=String(c.lessonKey || 'main').trim();
    if(!unitKey) throw new Error('PTP_FLASHCARD_CONFIG.unitKey is required.');
    return {unitKey,lessonKey};
  }

  function request(action,payload={}){
    const {unitKey,lessonKey}=cfg();
    if(window.parent===window){
      return Promise.reject(new Error('Open this lesson through Pawn to Professor to use saved sets.'));
    }
    const requestId=globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;

    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{
        pending.delete(requestId);
        reject(new Error('The Learning Hub did not respond.'));
      },12000);

      pending.set(requestId,{resolve,reject,timer});
      window.parent.postMessage({
        channel:CHANNEL,type:'request',requestId,action,unitKey,lessonKey,...payload
      },'*');
    });
  }

  window.addEventListener('message',event=>{
    if(event.source!==window.parent) return;
    const msg=event.data;
    if(!msg || msg.channel!==CHANNEL || msg.type!=='response') return;
    const p=pending.get(msg.requestId);
    if(!p) return;
    clearTimeout(p.timer);
    pending.delete(msg.requestId);
    msg.ok ? p.resolve(msg) : p.reject(new Error(msg.error || 'Flashcard storage failed.'));
  });

  globalThis.PTPFlashcardStorage={
    version:'1',
    async listSets(){
      const r=await request('list');
      return r.sets || [];
    },
    async saveSet({id=null,setName,cardIds=[],hiddenCardIds=[],metadata={}}){
      const r=await request('save',{id,setName,cardIds,hiddenCardIds,metadata});
      return r.set;
    },
    async deleteSet(id){
      await request('delete',{id});
      return true;
    }
  };
})();
