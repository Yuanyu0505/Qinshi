'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { ROOT } = require('./browser-test-helpers.cjs');

async function fixture(page, width) {
  await page.setViewportSize({ width, height: 760 });
  await page.setContent(`
    <form aria-label="选择测试">
      <label for="long">长选项</label><select name="choice" id="long">
        <optgroup label="第一组">
          ${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${i === 11 ? 'disabled' : ''}>选项 ${i + 1}</option>`).join('')}
        </optgroup>
        <optgroup label="第二组" disabled><option value="13">选项 13</option></optgroup>
        <option value="14">选项 14</option>
      </select><button id="next" type="button">下一项</button>
      <label>短选项<select id="short"><option>甲</option><option>乙</option></select></label>
      <label>已有内嵌列表<select id="embedded" size="10">${Array.from({ length: 12 }, (_, i) => `<option>${i + 1}</option>`).join('')}</select></label>
    </form>`);
  await page.addStyleTag({ path: path.join(ROOT, 'css/select-picker.css') });
  await page.addScriptTag({ path: path.join(ROOT, 'js/select-picker.js') });
}

for (const width of [320, 1280]) {
  test(`long dropdown scrolls within ten options at ${width}px and keeps native form events`, async () => {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    try {
      const page = await browser.newPage();
      await fixture(page, width);
      await page.locator('form').evaluate(form => {
        window.selectionEvents = [];
        for (const name of ['input', 'change']) form.addEventListener(name, event => window.selectionEvents.push([name, event.target.value]));
      });
      await page.locator('#long').click();
      const listbox = page.getByRole('listbox', { name: '长选项' });
      assert.equal(await listbox.isVisible(), true);
      assert.equal(await listbox.getByRole('option').count(), 14);
      const geometry = await listbox.evaluate(list => {
        const rect = list.getBoundingClientRect();
        const firstRow = list.querySelector('[role=option]').getBoundingClientRect();
        return { height: list.clientHeight, content: list.scrollHeight, row: firstRow.height, left: rect.left, right: rect.right };
      });
      assert.ok(geometry.height <= geometry.row * 10 && geometry.content > geometry.height);
      assert.ok(geometry.left >= 0 && geometry.right <= width);
      assert.equal(await listbox.getByRole('option', { name: '选项 13', exact: true }).getAttribute('aria-disabled'), 'true');
      const last = listbox.getByRole('option', { name: '选项 14', exact: true });
      await last.scrollIntoViewIfNeeded();
      await last.click();
      assert.equal(await page.locator('#long').inputValue(), '14');
      assert.deepEqual(await page.evaluate(() => window.selectionEvents), [['input', '14'], ['change', '14']]);
      assert.equal(await page.locator('form').evaluate(form => new FormData(form).get('choice')), '14');
      assert.equal(await listbox.count(), 0);
    } finally {
      await browser.close();
    }
  });
}

test('replaced selects work by keyboard and Tab and Escape do not change the value', async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    await fixture(page, 1000);
    await page.locator('#long').evaluate(select => select.replaceWith(select.cloneNode(true)));
    const select = page.locator('#long');
    await select.focus();
    await select.press('Space');
    const listbox = page.getByRole('listbox', { name: '长选项' });
    assert.equal(await listbox.isVisible(), true);
    await listbox.press('End');
    await listbox.press('ArrowUp');
    await listbox.press('Enter');
    // The prior two options (12 and 13) are disabled.
    assert.equal(await select.inputValue(), '11');
    await select.press('Alt+ArrowDown');
    await listbox.press('Escape');
    assert.equal(await select.evaluate(node => document.activeElement === node), true);
    assert.equal(await select.inputValue(), '11');
    await select.press('Space');
    await listbox.press('Tab');
    assert.equal(await page.locator('#next').evaluate(node => document.activeElement === node), true);
    assert.equal(await listbox.count(), 0);
    await page.locator('#embedded').click();
    assert.equal(await listbox.count(), 0);
  } finally {
    await browser.close();
  }
});

test('touch activation lets a long mobile menu select the final option', async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ hasTouch: true, isMobile: true });
    await fixture(page, 360);
    await page.locator('#long').tap();
    const last = page.getByRole('listbox', { name: '长选项' }).getByRole('option', { name: '选项 14', exact: true });
    await last.scrollIntoViewIfNeeded();
    await last.tap();
    assert.equal(await page.locator('#long').inputValue(), '14');
  } finally {
    await browser.close();
  }
});

test('inscription query search opts out of browser form history suggestions', async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    const markup = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert.equal(await page.evaluate(html => new DOMParser().parseFromString(html, 'text/html').querySelector('#ins-search').autocomplete, markup), 'off');
  } finally {
    await browser.close();
  }
});
