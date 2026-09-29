const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '..');

function currentAppVersion() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8')).version;
}

function previousPatchVersion(version) {
  const parts = String(version).split('.').map(Number);
  if (parts.length !== 3 || parts.some(part => !Number.isInteger(part)) || parts[2] <= 0) return '0.0.0';
  return [parts[0], parts[1], parts[2] - 1].join('.');
}

async function ensureTestAccount(page) {
  await page.waitForFunction(() => Boolean(window.QinshiAccounts));
  const created = await page.evaluate(() => {
    if (window.QinshiAccounts.currentAccount()) return false;
    window.QinshiAccounts.createAccount({ name: '自动化测试账号', server: '测试服' });
    return true;
  });
  if (created) await page.reload({ waitUntil: 'networkidle' });
}

async function openApp(page, url, options = {}) {
  await page.goto(url, Object.assign({ waitUntil: 'networkidle' }, options));
  await ensureTestAccount(page);
  return page;
}

async function setAccountItem(page, key, value) {
  await page.evaluate(({ logicalKey, rawValue }) => {
    window.QinshiAccounts.setItem(logicalKey, rawValue);
  }, { logicalKey: key, rawValue: String(value) });
}

async function getAccountItem(page, key) {
  return page.evaluate(logicalKey => window.QinshiAccounts.getItem(logicalKey), key);
}

async function setAccountJson(page, key, value) {
  await setAccountItem(page, key, JSON.stringify(value));
}

async function getAccountJson(page, key) {
  const raw = await getAccountItem(page, key);
  return raw == null ? null : JSON.parse(raw);
}

module.exports = {
  ROOT,
  currentAppVersion,
  previousPatchVersion,
  ensureTestAccount,
  openApp,
  setAccountItem,
  getAccountItem,
  setAccountJson,
  getAccountJson
};
