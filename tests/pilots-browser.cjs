const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let browser;
before(async () => { browser = await chromium.launch({ channel: 'msedge', headless: true }); });
after(async () => { if (browser) await browser.close(); });

for (const width of [375, 768, 1280]) {
  test('pilot standalone controls, escaping and responsive layout at ' + width + 'px', async () => {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.setContent('<style>body{margin:0;background:#171a1d;font-family:sans-serif}.seg{transition:none!important}</style><section id="partition-pilots"></section>');
      await page.addStyleTag({ path: path.join(__dirname, '../css/style.css') });
      await page.addStyleTag({ path: path.join(__dirname, '../css/pilots.css') });
      for (const file of ['data/pilots.js', 'js/pilots.js', 'js/pilots-ui.js']) {
        await page.addScriptTag({ path: path.join(__dirname, '..', file) });
      }
      await page.evaluate(() => { window.PILOTS_UI.init(); window.PILOTS_UI.init(); });
      assert.equal(await page.locator('.pilots-workbench').count(), 1);
      assert.equal(await page.locator('.pilots-card').count(), 0);
      assert.equal(await page.locator('.pilots-result-count').isVisible(), false);
      assert.equal(await page.locator('.pilots-grid').isVisible(), false);
      assert.equal(await page.locator('[data-pilots-category-notes]').isVisible(), false);
      assert.doesNotMatch(await page.locator('.pilots-heading').textContent(), /机师 · 神将突破参考/);
      assert.equal(await page.locator('.pilots-reference h3').textContent(), '机师时装图名称');
      assert.equal(await page.locator('.pilots-reference .pilots-badge').count(), 9);
      assert.equal(await page.locator('.pilots-reference p, .pilots-reference summary, .pilots-reference li').count(), 0);
      await page.locator('#pilots-search').fill('   ');
      assert.equal(await page.locator('.pilots-card').count(), 0);
      await page.locator('#pilots-search').fill('神朱家');
      assert.equal(await page.locator('.pilots-card').count(), 1);
      assert.equal(await page.locator('.pilots-result-count').isVisible(), true);
      await page.locator('#pilots-search').fill('');
      assert.equal(await page.locator('.pilots-card').count(), 0);
      await page.locator('[data-pilots-type="nonPilot"]').click();
      const rankLayout = await page.evaluate(() => {
        const bounds = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
        return { type: bounds('[aria-label="弟子分类"]'), ranks: bounds('[data-pilots-ranks]'), search: bounds('#pilots-search') };
      });
      assert.ok(rankLayout.ranks.y >= rankLayout.type.bottom && rankLayout.ranks.y - rankLayout.type.bottom <= 14, 'rank filters immediately follow type filters');
      assert.ok(rankLayout.search.y > rankLayout.ranks.bottom, 'rank filters precede search');
      assert.equal(await page.locator('[data-pilots-category-notes]').isVisible(), false);
      const selectedStyle = await page.locator('[data-pilots-type="nonPilot"]').evaluate(el => {
        const sample = document.createElement('button'); sample.className = 'seg active'; document.body.append(sample);
        const actual = getComputedStyle(el), expected = getComputedStyle(sample);
        const result = { actual: [actual.backgroundColor, actual.backgroundImage, actual.borderTopColor, actual.color], expected: [expected.backgroundColor, expected.backgroundImage, expected.borderTopColor, expected.color] };
        sample.remove(); return result;
      });
      assert.deepEqual(selectedStyle.actual, selectedStyle.expected);
      assert.equal(await page.locator('[data-pilots-type="nonPilot"]').getAttribute('class'), 'seg active');
      await page.locator('[data-pilots-rank="20"]').click();
      await page.locator('#pilots-search').fill('神朱家 暴击率');
      assert.equal(await page.locator('.pilots-card').count(), 1);
      assert.equal(await page.locator('.pilots-effect-title').textContent(), '20阶突破');
      assert.equal(await page.locator('[data-pilots-categories]').isVisible(), false);
      await page.locator('[data-pilots-type="pilot"]').click();
      assert.equal(await page.locator('[data-pilots-category-notes]').isVisible(), true);
      assert.equal(await page.locator('[data-pilots-category-notes] > p').count(), 3);
      for (const [category, condition] of [['backpack', /25阶.*不在机师位/], ['god25', /25阶.*在机师位置/], ['traditional', /技能.*机师位置.*进化.*时装/]]) {
        const note = page.locator('[data-pilots-category-note="' + category + '"]');
        assert.match(await note.textContent(), condition);
        assert.equal(await note.evaluate((el, id) => el.textContent.includes(window.PILOTS_DATA.categories.find(category => category.id === id).condition), category), true);
      }
      const categoryLayout = await page.evaluate(() => {
        const bounds = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
        const row = document.querySelector('[data-pilots-categories]');
        return {
          type: bounds('[aria-label="弟子分类"]'), categories: bounds('[data-pilots-categories]'), search: bounds('#pilots-search'), notes: bounds('[data-pilots-category-notes]'),
          buttons: Array.from(row.querySelectorAll('button'), button => button.getBoundingClientRect().toJSON()),
          directButtons: Array.from(row.children).every(child => child.matches('button'))
        };
      });
      assert.equal(categoryLayout.directButtons, true, 'category buttons share one compact row without expanding hint wrappers');
      assert.ok(categoryLayout.categories.y >= categoryLayout.type.bottom && categoryLayout.categories.y - categoryLayout.type.bottom <= 14, 'category filters immediately follow type filters');
      assert.ok(categoryLayout.search.y > categoryLayout.categories.bottom, 'category filters precede search');
      assert.ok(categoryLayout.notes.y >= categoryLayout.search.bottom && categoryLayout.notes.y - categoryLayout.search.bottom <= 14, 'one shared note block immediately follows search');
      for (let i = 1; i < categoryLayout.buttons.length; i++) {
        const previous = categoryLayout.buttons[i - 1], current = categoryLayout.buttons[i];
        if (Math.abs(current.y - previous.y) < 1) assert.ok(current.x - previous.right <= 10, 'adjacent category buttons stay tightly spaced');
      }
      await page.locator('#pilots-search').fill('神典庆 80%');
      await page.locator('[data-pilots-category="traditional"]').click();
      assert.equal(await page.locator('.pilots-card').count(), 1);
      assert.match(await page.locator('.pilots-card').textContent(), /15阶突破/);
      assert.match(await page.locator('.pilots-card').textContent(), /80%/);
      const effectStyle = await page.locator('.pilots-effects p').first().evaluate(el => ({ fontSize: parseFloat(getComputedStyle(el).fontSize), lineHeight: parseFloat(getComputedStyle(el).lineHeight) }));
      assert.ok(effectStyle.fontSize >= 14 && effectStyle.lineHeight >= effectStyle.fontSize * 1.75, 'effect paragraphs remain comfortably readable');
      assert.equal(await page.locator('.pilots-effect-title:not(h4)').count(), 0);
      assert.equal(await page.locator('[data-pilots-ranks]').isVisible(), false);
      await page.locator('#pilots-search').fill('不应存在的关键词');
      assert.equal(await page.locator('.pilots-card').count(), 0);
      assert.match(await page.locator('.pilots-empty').textContent(), /没有符合条件/);
      await page.locator('[data-pilots-type="all"]').click();
      await page.locator('#pilots-search').fill('');
      assert.equal(await page.locator('.pilots-card').count(), 0);
      assert.equal(await page.locator('.pilots-result-count').isVisible(), false);
      assert.equal(await page.locator('.pilots-grid').isVisible(), false);
      assert.equal(await page.locator('[data-pilots-category-notes]').isVisible(), false);
      await page.locator('[data-pilots-type="pilot"]').click();
      assert.equal(await page.locator('.pilots-card').count(), 32);
      await page.locator('[data-pilots-type="nonPilot"]').click();
      const nonpilotBackground = await page.locator('.pilots-badge-nonpilot').first().evaluate(el => getComputedStyle(el).backgroundColor);
      await page.locator('[data-pilots-type="pilot"]').click();
      const backgrounds = [nonpilotBackground];
      for (const category of ['backpack', 'god25', 'traditional']) backgrounds.push(await page.locator('.pilots-badge-' + category).first().evaluate(el => getComputedStyle(el).backgroundColor));
      assert.equal(new Set(backgrounds).size, 4);
      assert.equal(await page.locator('.pilots-condition, .pilots-source').count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}
