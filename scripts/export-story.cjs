// Export the current game text directly, so the reading copy cannot drift from it.
const fs = require('node:fs');
const read = name => JSON.parse(fs.readFileSync(`src/data/${name}.json`, 'utf8'));
const prologue = read('story-prologue');
const chapters = read('campaign-story');
const episodes = read('charevents');
const rumors = read('misunderstandings');
const dialogue = read('dialogue');
const events = read('events');
const personalities = read('personalities');
const blocks = [];
const fill = text => text.replaceAll('{name}', 'ユウト').replaceAll('{leader}', '隊長').replaceAll('{enemy}', '敵').replaceAll('{a}', '冒険者A').replaceAll('{b}', '冒険者B');
const add = (type, text) => blocks.push({type, text: fill(text)});
const heading = (level, text) => add(`h${level}`, text);
const paragraph = text => { if(text) add('p', text); };
const line = value => {
  if(!value.speaker) return paragraph(value.text);
  const text = value.text.replace(/^\(/, '（').replace(/\)$/, '）');
  paragraph(`${value.speaker}${text.startsWith('（') ? text : `「${text}」`}`);
};
heading(1, 'ギルドクエスト ― 見えちゃうギルドマスター ― 全ストーリー');
paragraph('推敲稿。主人公名は「ユウト」で統一しています。序章と本編に続き、二つの終章、個人エピソード、街の噂を収録しました。後半には探索中の文章・台詞、人物紹介と依頼文も全文掲載しています。');
paragraph('本編の章は進行条件に応じて開くため、掲載順とゲームで読む順番が異なる場合があります。期限超過の終章を読んだ後も、討伐の終章へ進めます。噂や探索中の文章は、該当する状況で選ばれる別々の短編です。');
heading(2, '序章');
prologue.forEach(line);
heading(2, '本編');
for(const chapter of chapters.filter(c => !c.ending)) {
  heading(3, chapter.title);
  chapter.lines.forEach(line);
}
heading(2, '二つの終章');
for(const chapter of chapters.filter(c => c.ending)) {
  heading(3, chapter.title);
  paragraph(chapter.ending === 'clear' ? '灰竜の討伐に成功したとき。' : '三十日を過ぎても、灰竜を討伐していないとき。');
  chapter.lines.forEach(line);
}
heading(2, '個人エピソード');
paragraph('仲間の経験や状況に応じて発生する会話です。読む順番は固定されていません。');
for(const episode of episodes) { heading(3, episode.title); episode.lines.forEach(line); }
heading(2, '街の噂');
const rumorLabels = {hire_talent:'素質のある新人を雇う',hire_cheap_newbie:'駆け出しを雇う',job_change_big:'向いている職業へ変える',dispatch_newbie_gather:'経験の浅い隊を採取へ送る',dispatch_safe_weak:'経験の浅い隊に安全な方針を伝える',dispatch_split_pair:'折り合いの悪い二人を別の編成にする',dispatch_potions:'回復薬を持たせる',return_first_success:'最初の依頼成功',return_retreat_safe:'負傷せずに撤退する',return_success_clean:'負傷のない成功報告',return_underdog:'難しい依頼から成功して戻る',day_idle:'派遣のない一日',reject_expensive:'高い日給の候補を見送る',rest_tired:'疲れた仲間を休ませる',facility_built:'施設を整える',rep_milestone:'街の評判が上がる'};
rumors.forEach((rumor,i) => {
  if(!rumorLabels[rumor.tag]) throw Error(`Missing rumor title: ${rumor.tag}`);
  heading(3, `${i+1}. ${rumorLabels[rumor.tag]}`);
  rumor.scene.forEach(paragraph);
  paragraph(`ユウト${rumor.thought}`);
});
heading(2, '探索中の出来事');
paragraph('複数の文章がある項目では、その場面に応じた文章が選ばれます。「冒険者A」「冒険者B」「隊長」「敵」は、ゲームでは該当する名前に置き換わります。');
const eventTitles = {combat_generic:'敵との遭遇',combat_ambush:'不意打ち',treasure_chest:'古い宝箱',treasure_hidden:'隠された財宝',gather_herb:'薬草を採る',gather_ore:'鉱石を掘る',gather_relic:'遺物を回収する',trap_spike:'杭の罠',trap_rockfall:'落石',lost_path:'道に迷う',merchant:'行商人',injured_traveler:'困っている旅人',ruin_site:'小さな遺構',hidden_path:'隠れた道'};
for(const event of events) {
  if(!(event.texts||[]).some(Boolean)) continue;
  if(!eventTitles[event.id]) throw Error(`Missing event title: ${event.id}`);
  heading(3,eventTitles[event.id]);
  event.texts.forEach(paragraph);
  for(const [key,title] of [['ok','うまく対処できたとき'],['ng','うまくいかなかったとき']]) if(event[key]?.length) {
    heading(4,title); event[key].forEach(paragraph);
  }
}
heading(2, '探索中の会話');
const situations = {battleEnd:'戦闘の後',chest:'宝箱',retreat:'撤退',camp:'野営',hurt:'負傷',lost:'迷ったとき',praise:'助けられたとき',blame:'連携がうまくいかなかったとき'};
for(const personality of personalities) {
  heading(3,personality.name);
  for(const [key,values] of Object.entries(dialogue[personality.id])) {
    if(!situations[key]) throw Error(`Missing dialogue title: ${key}`);
    heading(4,situations[key]); values.forEach(value=>paragraph(`「${value}」`));
  }
}
for(const [key,title] of [['_chat','仲間同士の雑談'],['_quarrel','仲間同士の言い合い'],['_coop','仲間同士の助け合い']]) {
  heading(3,title); dialogue[key].forEach(paragraph);
}
heading(2, '人物紹介と依頼文');
for(const character of read('characters').members) {
  heading(3,character.name); paragraph(character.bio); paragraph(`${character.name}「${character.quote}」`);
}
for(const area of read('areas')) { heading(3,area.name); paragraph(area.desc); }
for(const quest of read('quests')) { heading(3,quest.name); paragraph(quest.desc); }
const markdown = blocks.map(b => b.type === 'p' ? b.text : `${'#'.repeat(Number(b.type[1]))} ${b.text}`).join('\n\n')+'\n';
fs.writeFileSync('docs/STORY-FULL.md', markdown);
const escape = text => text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
let index = 0;
const toc = [], body = blocks.map(b => {
  let attr='';
  if(b.type === 'h2') { const id=`part-${++index}`; attr=` id="${id}"`; toc.push(`<a href="#${id}">${escape(b.text)}</a>`); }
  return `<${b.type}${attr}>${escape(b.text).replaceAll('\n','<br>')}</${b.type}>`;
}).join('\n');
fs.writeFileSync('public/story-manuscript.html', `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ギルドクエスト 全ストーリー</title>
<style>body{margin:0;background:#f7f4ec;color:#242725;font-family:"Yu Mincho","Hiragino Mincho ProN",serif}main{max-width:780px;margin:auto;padding:40px 24px 100px}h1{font-size:1.65rem;line-height:1.65}h2{font-size:1.5rem;border-top:1px solid #c4bda9;padding-top:28px;margin-top:64px;scroll-margin-top:24px}h3{font-size:1.15rem;margin-top:40px}h4{font-size:1rem;color:#565e57;margin-top:28px}p{font-size:1.05rem;line-height:2.05;overflow-wrap:anywhere;margin:1.3em 0}nav{display:flex;gap:12px 22px;flex-wrap:wrap;border-bottom:1px solid #c4bda9;padding-bottom:24px;line-height:1.6}a{color:#275d57;text-underline-offset:4px}@media(max-width:500px){main{padding:24px 18px 64px}p{font-size:1rem}}@media print{nav{display:none}body{background:white}h2{break-before:page}h2,h3,h4{break-after:avoid}}</style>
</head><body><main><nav aria-label="目次">${toc.join('')}</nav>${body}</main></body></html>\n`);
console.log(JSON.stringify({prologue:prologue.length,chapters:chapters.length,chapterLines:chapters.reduce((n,c)=>n+c.lines.length,0),episodes:episodes.length,rumors:rumors.length,paragraphs:blocks.filter(b=>b.type==='p').length,characters:markdown.length}));
