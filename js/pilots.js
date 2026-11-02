(function (root, factory) {
  var core = factory();
  if (typeof module === 'object' && module.exports) module.exports = core;
  if (root) root.PILOTS_CORE = core;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function normalize(value) {
    return String(value == null ? '' : value).toLowerCase().replace(/[\s·•・]/g, '');
  }
  function visibleEffects(disciple, filters) {
    filters = filters || {};
    return disciple.effects.filter(function (effect) {
      // Rank is a non-pilot reference filter, not a reclassification rule.
      return filters.type !== 'nonPilot' || !filters.rank || effect.rank === Number(filters.rank);
    });
  }
  function filterDisciples(data, filters) {
    filters = filters || {};
    var words = String(filters.query || '').trim().split(/\s+/).map(normalize).filter(Boolean);
    return data.disciples.filter(function (disciple) {
      var isPilot = disciple.pilotCategories.length > 0;
      if (filters.type === 'pilot' && !isPilot) return false;
      if (filters.type === 'nonPilot' && isPilot) return false;
      if (filters.type === 'pilot' && filters.category && disciple.pilotCategories.indexOf(filters.category) === -1) return false;
      var effects = visibleEffects(disciple, filters);
      if (!effects.length) return false;
      var searchable = normalize([disciple.name, disciple.notes.join(' '), effects.map(function (effect) {
        return [effect.text, effect.condition, effect.note].join(' ');
      }).join(' ')].join(' '));
      return words.every(function (word) { return searchable.indexOf(word) !== -1; });
    });
  }
  return { normalize: normalize, visibleEffects: visibleEffects, filterDisciples: filterDisciples };
});
