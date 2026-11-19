'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const data=require('../data/other-reference-data.js');
const ui=require('../js/other-reference-ui.js');
test('directory order is a complete unique catalog, including migrated modules',()=>{
  const ids=data.sections.map(s=>s.id);
  assert.equal(ids.length,17);
  assert.deepEqual(data.sections.filter(s=>s.partition).map(s=>s.partition),['pilots','battle-box-pill-pouch','quiz','zhulu','loulan','formations','settings']);
  assert.deepEqual(ui.normalizeSectionOrder(data.sections,['settings','settings','unknown','cards']),['settings','cards'].concat(ids.filter(id=>!['settings','cards'].includes(id))));
  assert.deepEqual(ui.normalizeSectionOrder(data.sections,{}),ids);
});
test('directory search matches only names, trims spaces and preserves catalog',()=>{
  const before=JSON.stringify(data.sections);
  assert.deepEqual(ui.filterSections(data.sections,'  战匣 ').map(s=>s.id),['battle-box-pill-pouch']);
  assert.equal(ui.filterSections(data.sections,'副属性档位').length,0);
  assert.equal(ui.filterSections(data.sections,'不存在的分区').length,0);
  assert.equal(ui.filterSections(data.sections,'').length,17);
  assert.equal(JSON.stringify(data.sections),before);
});

test('migrated directory entries expose concise descriptions without extending name search',()=>{
  const expected={pilots:'助阵效果、突破与时装资料','battle-box-pill-pouch':'培养进度、材料需求与目标计算',quiz:'题库关键词检索与答案查询',zhulu:'进度奖励与赛季典籍查询',loulan:'楼兰探索与棋阵图解',formations:'位置换算、个人进度与阵容推荐',settings:'账号、同步、备份与应用更新'};
  for(const [id,description] of Object.entries(expected))assert.equal(data.sections.find(s=>s.id===id).description,description);
  assert.equal(ui.filterSections(data.sections,'助阵效果').length,0);
});
