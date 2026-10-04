const fs = require('node:fs');
const read = p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const write = (p,x)=>fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n');
const cast = (list)=>list.split(' ').filter(Boolean).map((entry,i,all)=>{const [character,pose='neutral']=entry.split(':'); return {character,pose,position:all.length===1?'center':all.length===2?(i===0?'left':'right'):['left','center','right'][i]};});
const n='neutral', t='thoughtful', h='happy';
const directions = {
 first_desk: ['mirei yuto:thoughtful','aldo:thoughtful mina yuto','aldo yuto:happy','mina:happy aldo','mirei:happy yuto'],
 first_return: ['mirei yuto','aldo:happy yuto','mina:thoughtful aldo','yuto:thoughtful mirei','mirei:happy yuto','yuto:thoughtful mirei:happy'],
 policy: ['bruno:thoughtful aldo','aldo:thoughtful bruno','yuto bruno','mina:happy yuto','mirei yuto'],
 recruit: ['lina:happy yuto:thoughtful','lina yuto','bruno:thoughtful lina','mirei yuto','lina:thoughtful yuto:happy'],
 facilities: ['mina:thoughtful yuto','mina yuto:thoughtful','bruno:thoughtful yuto','mirei yuto','mina:happy yuto'],
 charter: ['mirei:thoughtful yuto','lina:thoughtful mirei','bruno aldo','yuto:thoughtful lina','mirei yuto'],
 aldo_trust: ['aldo:thoughtful yuto','aldo:thoughtful yuto','aldo:happy yuto','mina:happy aldo:happy'],
 mine: ['lina:thoughtful bruno','lina:thoughtful bruno','yuto lina','lina:thoughtful yuto','bruno:happy lina:happy'],
 bruno: ['bruno:thoughtful aldo','aldo bruno:thoughtful','bruno:thoughtful aldo','yuto bruno','bruno:happy aldo:happy'],
 mina: ['mina:happy yuto','lina:happy mina','mina:thoughtful lina','yuto mina','mina:happy yuto:happy'],
 ruins: ['mirei:thoughtful yuto','aldo yuto:thoughtful','aldo yuto:thoughtful','bruno yuto','lina:happy bruno'],
 eve: ['mirei:thoughtful yuto','yuto mirei','aldo:thoughtful yuto','mina:happy aldo'],
 extension: ['mirei:thoughtful yuto','lina:happy yuto','yuto mirei','bruno:happy yuto:happy'],
 homecoming: ['mirei:happy yuto:happy','aldo:happy yuto','mina:happy yuto','bruno:happy yuto','lina:happy yuto','yuto:thoughtful','yuto:happy',''],
};
const sounds = {first_desk:'paper',first_return:'door',policy:'paper',recruit:'door',facilities:'step',charter:'paper',aldo_trust:'step',mine:'paper',bruno:'step',mina:'cup',ruins:'paper',eve:'paper',extension:'paper',homecoming:'water'};
const chapters = read('src/data/campaign-story.json');
for (const chapter of chapters) {
 const list=directions[chapter.id];
 if(!list||list.length!==chapter.lines.length) throw new Error(`Direction count ${chapter.id}: ${list?.length}/${chapter.lines.length}`);
 chapter.lines.forEach((line,i)=>{
  line.background='guild'; line.cast=cast(list[i]); line.transition=i===0?'fade':'cut';
  delete line.still; delete line.sfx; delete line.effect;
  if(i===0) line.sfx=sounds[chapter.id];
  if(chapter.id==='homecoming'&&i>=5) { line.still='ruins-vow'; line.cast=[]; line.transition=i===5?'fade':'cut'; }
  if(chapter.id==='mina'&&i===4) line.sfx='cup';
 });
}
write('src/data/campaign-story.json',chapters);
const prologue=read('src/data/story-prologue.json');
// The prologue owns its directions beside each line so dialogue insertions do
// not shift portraits, wardrobe changes, or sound cues onto unrelated lines.
prologue.forEach((line,i)=>{
 if(!Array.isArray(line.cast)) throw new Error(`Missing prologue cast at ${i}`);
 line.background=line.bg;
 line.transition ??= i===0||line.bg!==prologue[i-1]?.bg?'fade':'cut';
});
write('src/data/story-prologue.json',prologue);
const events=read('src/data/charevents.json');
const eventDirections={
 aldo_bow:['aldo:thoughtful yuto','aldo yuto','aldo:happy yuto','aldo:happy yuto:thoughtful'],
 aldo_caution:['aldo:thoughtful mina','mina:thoughtful aldo','yuto:thoughtful aldo'],
 mina_herb:['mina:happy aldo','aldo:happy mina','yuto mina'],
 mina_worry:['mina:thoughtful yuto','mina yuto','mina:happy yuto'],
 lina_lost:['mirei:thoughtful lina','lina:thoughtful mirei','yuto:thoughtful lina'],
 lina_money:['lina:thoughtful bruno','bruno lina','lina:thoughtful bruno','yuto:thoughtful lina'],
 bruno_glory:['bruno:happy lina','lina:thoughtful bruno','mirei:happy yuto','yuto:thoughtful mirei'],
 bruno_knee:['bruno:thoughtful yuto','yuto bruno','bruno:happy yuto','bruno:happy yuto:thoughtful'],
};
const speakerIds={'アルド':'aldo','ミナ':'mina','リナ':'lina','ブルーノ':'bruno','ミレイ':'mirei','{name}':'yuto'};
for(const event of events) {
 if(eventDirections[event.id]?.length!==event.lines.length) throw new Error(`Event direction count ${event.id}`);
 event.lines.forEach((line,i)=>{
  const proposed = eventDirections[event.id]?.[i];
  let actors = cast(proposed||`${speakerIds[line.speaker]||event.char} yuto`);
  const speaker=speakerIds[line.speaker];
  if(speaker&&!actors.some(a=>a.character===speaker)) actors=cast(`${speaker} ${speaker==='yuto'?event.char:'yuto'}`);
  line.background='guild'; line.cast=actors; line.transition=i===0?'fade':'cut'; if(i===0)line.sfx='paper';
 });
}
write('src/data/charevents.json',events);
console.log(`${chapters.length} chapters / ${chapters.reduce((n,c)=>n+c.lines.length,0)} lines; ${prologue.length} prologue lines; ${events.length} character events staged`);
