'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const data = require('../data/other-reference-data.js');
const tables = require('../data/other-reference-tables-b.js').tables;
const source = '02_补充资料/补图08_木抵抗组合.png';
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

test('wood resistance points to the preserved user-supplied source image', () => {
  const wood = tables.find(table => table.id === 'elements-wood-mappings');
  assert.deepEqual(wood.sourcePaths, [source]);
  assert.ok(data.sections.find(section => section.id === 'elements').sourcePaths.includes(source));
  const image = data.images.find(image => image.path === source);
  assert.ok(image, 'wood image must be registered');
  const bytes = fs.readFileSync(path.join(__dirname, '../assets/other-reference/sources', source));
  const originalHash = 'd72f973b746a7a0ea0498a38d02247268057e82ed8b250f810d25947c5847b76';
  assert.equal(sha256(bytes), originalHash, 'original image bytes must not be edited');
  assert.equal(image.sha256, originalHash);
  assert.equal(bytes.length, 157198);
  assert.equal(image.size, 157198);
  assert.deepEqual(image.pixels, [1090, 1116]);
  assert.equal(bytes.readUInt32BE(16), image.pixels[0]);
  assert.equal(bytes.readUInt32BE(20), image.pixels[1]);
});

test('wood provenance restores metadata without changing confirmed business rows or other tables', () => {
  const wood = tables.find(table => table.id === 'elements-wood-mappings');
  assert.equal(wood.verification, 'user-confirmed');
  assert.equal(wood.rows.length, 25);
  assert.equal(sha256(JSON.stringify(wood.rows)), 'f99eec336ba6058426019540e8f55421a072b7396aa6dc3c83b65cd162436dcd');
  assert.equal(sha256(JSON.stringify(tables.filter(table => table.id !== wood.id))), 'f83aee7e99e9cab075f747d3973d1da1a4ca36ce5d4eb5d836a6ef2ad998db5d');
});
