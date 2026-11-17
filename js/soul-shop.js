(function (root, factory) {
  var api = factory(typeof module === 'object' && module.exports ? require('./forbidden.js') : root.FORBIDDEN);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SOUL_SHOP = api;
})(typeof self !== 'undefined' ? self : this, function (dates) {
  'use strict';
  function dayKey(day) { return day.getFullYear() + '-' + String(day.getMonth() + 1).padStart(2, '0') + '-' + String(day.getDate()).padStart(2, '0'); }
  function normalizeNeeds(value) {
    if (value == null) return { version: 1, events: Object.create(null) };
    if (value.version !== 1 || !value.events || typeof value.events !== 'object' || Array.isArray(value.events)) throw new Error('魂店需求数据格式不受支持，请先备份并检查数据。');
    var events = Object.create(null);
    Object.keys(value.events).forEach(function (id) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(id) || !Array.isArray(value.events[id]) || value.events[id].some(function (n) { return typeof n !== 'string'; })) throw new Error('魂店需求数据损坏，请先备份并检查数据。');
      var names = Array.from(new Set(value.events[id].map(function (n) { return n.trim(); }).filter(Boolean)));
      if (names.length) events[id] = names;
    });
    return { version: 1, events: events };
  }
  function selected(needs, id, name) { return Boolean(needs.events[id] && needs.events[id].includes(name)); }
  function parseStored(raw) {
    if (raw === null) return normalizeNeeds(null);
    var value = JSON.parse(raw);
    if (value === null) throw new Error('魂店需求不是有效的版本数据，请先备份并检查数据。');
    return normalizeNeeds(value);
  }
  function clearHistory(data, needs, today) {
    var next = normalizeNeeds(needs);
    data.occurrences.forEach(function (p) { if (dates.statusFor(p, today) === 'history') delete next.events[p.id]; });
    return next;
  }
  function changeSelection(data, needs, id, name, checked, future, today) {
    var next = clearHistory(data, needs, today), source = data.occurrences.find(function (p) { return p.id === id; });
    if (!source || dates.statusFor(source, today) === 'history' || !source.disciples.some(function (d) { return d.name === name; })) return next;
    data.occurrences.forEach(function (p) {
      if (p.id !== id && (!future || p.start < source.start)) return;
      if (dates.statusFor(p, today) === 'history' || !p.disciples.some(function (d) { return d.name === name; })) return;
      var names = (next.events[p.id] || []).filter(function (n) { return n !== name; });
      if (checked) names.push(name);
      if (names.length) next.events[p.id] = names; else delete next.events[p.id];
    });
    return next;
  }
  function discipleMatches(d, query) {
    var q = String(query || '').trim().replace(/内力/g, '内');
    var match = q.match(/^(神|普通|普)?([攻防血内])$/);
    if (match) return match[1] === '神' ? d.divine === match[2] : match[1] ? d.base === match[2] : d.base === match[2] || d.divine === match[2];
    return d.name.toLowerCase().includes(q.toLowerCase());
  }
  function matchingDisciples(p, options, needs) {
    options = options || {};
    var q = String(options.query || '').trim(), dateMatch = q && dates.dateAliases(p).some(function (s) { return dates.normalize(s).includes(dates.normalize(q)); });
    return p.disciples.filter(function (d) {
      if (options.selectedOnly && !selected(needs, p.id, d.name)) return false;
      var attribute = options.attribute === '内力' ? '内' : options.attribute;
      if (attribute && d.base !== attribute && d.divine !== attribute) return false;
      return !q || dateMatch || discipleMatches(d, q);
    });
  }
  function matches(p, options, needs) { return matchingDisciples(p, options, needs).length > 0; }
  return { dayKey: dayKey, normalizeNeeds: normalizeNeeds, parseStored: parseStored, selected: selected, clearHistory: clearHistory, changeSelection: changeSelection, matchingDisciples: matchingDisciples, matches: matches, status: dates.statusFor, view: function (data, today) { return dates.getDefaultView(data.occurrences, today); } };
});
