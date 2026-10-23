/* 秘境纯状态核：不访问存储、系统时钟或网络，所有时间由调用方传入。 */
(function(root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SECRET_REALM_CORE = api;
})(typeof self !== 'undefined' ? self : this, function() {
  'use strict';
  var DAY = 86400000;
  var OFFSET = 8 * 3600000;
  var own = function(object, key) { return Object.prototype.hasOwnProperty.call(object, key); };
  function fail(message) { throw new Error(message); }
  function object(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) fail(label + '必须是对象');
    return value;
  }
  function integer(value, label, maximum) {
    if (!Number.isSafeInteger(value) || value < 0 || (maximum !== undefined && value > maximum)) fail(label + '必须是范围内的非负安全整数');
    return value;
  }
  function boolean(value, label) { if (typeof value !== 'boolean') fail(label + '必须是布尔值'); return value; }
  function add(a, b) { return integer(a + b, '计算结果溢出'); }
  function multiply(a, b) { return integer(a * b, '计算结果溢出'); }
  function money(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || !Number.isSafeInteger(Math.round(value * 100)) || Math.abs(value * 100 - Math.round(value * 100)) > 0.0000001) fail(label + '必须是有效的非负金额，最多两位小数');
    return value;
  }
  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (value && typeof value === 'object') { var result = {}; Object.keys(value).forEach(function(key) { if (key === '__proto__') fail('存储字段非法'); result[key] = clone(value[key]); }); return result; }
    return value;
  }
  function time(now) { if (!Number.isSafeInteger(now) || !Number.isFinite(new Date(now + OFFSET).getTime())) fail('当前时间无效'); return now; }
  function dateText(timestamp) { return new Date(timestamp + OFFSET).toISOString().slice(0, 10); }
  function dateTime(date) {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) fail('日期必须使用YYYY-MM-DD格式');
    var value = Date.parse(date + 'T00:00:00+08:00');
    if (!Number.isFinite(value) || dateText(value) !== date) fail('日期不存在');
    return value;
  }
  function sourceData(data, id) { var source = data.sources.find(function(s) { return s.id === id; }); if (!source) fail('来源不存在'); return source; }
  function sourceDefaults() { return { enabled: true, obtained: 0, purchased: 0, todayDate: null, todayObtained: 0, todayPurchased: 0, currencyObtained: 0 }; }
  function makePeriod(number, historical, data) {
    var period = { startDate: null, locked: historical, ended: historical, sources: {} };
    if (!historical) data.sources.forEach(function(source) {
      if (source.firstOnly && number !== 1) return;
      var record = sourceDefaults(); record.enabled = source.id !== 'pack648'; period.sources[source.id] = record;
    });
    return period;
  }
  function createDefault(data) {
    var state = { schemaVersion: 2, realms: {}, settings: { platformId: data.platforms[0].id, platforms: clone(data.platforms), vouchers: 0, useVouchers: true } };
    data.realms.forEach(function(definition) {
      var realm = { currentPeriod: definition.firstPeriod, cumulative: 0, inventory: 0, target: 4550, currency: 0, targetEnabled: true, currencyTargetEnabled: false, currencyTarget: 0, drawMode: 'stop', finished: false, periods: {} };
      for (var number = 1; number <= data.maxPeriods; number++) realm.periods[number] = makePeriod(number, number < definition.firstPeriod, data);
      state.realms[definition.id] = realm;
    });
    return state;
  }
  function validateSettings(settings) {
    object(settings, '平台设置');
    if (!Array.isArray(settings.platforms) || !settings.platforms.length) fail('至少需要一个充值平台');
    var ids = {};
    settings.platforms.forEach(function(platform) {
      object(platform, '充值平台');
      if (typeof platform.id !== 'string' || !platform.id.trim() || platform.id === '__proto__' || own(ids, platform.id)) fail('平台标识无效或重复');
      ids[platform.id] = true;
      if (typeof platform.name !== 'string' || !platform.name.trim()) fail('平台名称不能为空');
      if (typeof platform.discount !== 'number' || !Number.isFinite(platform.discount) || platform.discount <= 0 || platform.discount > 10) fail('平台折扣必须大于0且不超过10');
    });
    if (typeof settings.platformId !== 'string' || !own(ids, settings.platformId)) fail('所选平台不存在');
    money(settings.vouchers, '代金'); boolean(settings.useVouchers, '使用代金');
  }
  function validateSource(record, source, period, legacy) {
    object(record, '来源记录'); boolean(record.enabled, '来源启用状态');
    integer(record.obtained, '已获取抽数'); integer(record.purchased, '已购买份数');
    integer(record.todayObtained, '今日已获取抽数', source.daily ? source.draws : 0);
    integer(record.todayPurchased, '今日已购买份数', source.daily && source.price > 0 ? 1 : 0);
    if (record.todayDate !== null) dateTime(record.todayDate);
    if (record.todayDate === null && (record.todayObtained || record.todayPurchased)) fail('今日记录必须填写日期');
    if (record.todayObtained > record.obtained || record.todayPurchased > record.purchased) fail('今日记录不能超过累计记录');
    if (source.limit !== null && record.purchased > source.limit) fail('已购买份数超过单期上限');
    if (!source.price && record.purchased !== 0) fail('免费来源不能记录购买份数');
    var entitlement = source.price ? multiply(record.purchased, source.draws) : multiply(source.limit, source.draws);
    if (record.obtained > entitlement) fail('已获取抽数超过来源可领取权益');
    if (source.price) multiply(record.purchased, Math.round(source.price * 100));
    if (!legacy) {
      integer(record.currencyObtained, '本期已领取兑换道具', source.currencyReceipt ? (source.price ? multiply(record.purchased, source.currency) : source.currency) : 0);
      if (source.id === 'pack6' && (record.obtained !== multiply(record.purchased, 3) || record.todayObtained !== 0)) fail('6元礼包购买即得3抽，不支持独立领取记录');
    }
    if (!source.daily && record.todayDate !== null) fail('非每日来源不能填写今日日期');
    if (record.todayDate !== null && period.startDate !== null) {
      var stamp = dateTime(record.todayDate), begin = dateTime(period.startDate);
      if (stamp < begin || stamp >= begin + 14 * DAY) fail('今日记录日期不在本期内');
    }
  }
  function validateDates(realm, data) {
    var previousEnd = null;
    for (var number = 1; number <= data.maxPeriods; number++) {
      var period = realm.periods[number];
      if (period.startDate === null) continue;
      var begin = dateTime(period.startDate);
      if (previousEnd !== null && begin < previousEnd) fail('同秘境各期日期不能重叠或逆序');
      previousEnd = begin + data.periodDays * DAY;
    }
  }
  function validate(state, data) {
    object(state, '秘境存储');
    if (state.schemaVersion !== 1 && state.schemaVersion !== 2) fail('秘境存储版本不支持');
    var legacy = state.schemaVersion === 1;
    object(state.realms, '秘境列表'); validateSettings(state.settings);
    Object.keys(state.realms).forEach(function(id) {
      if (!data.realms.some(function(item) { return item.id === id; })) fail('秘境标识不存在');
      var realm = object(state.realms[id], '秘境记录');
      integer(realm.currentPeriod, '当前期数', data.maxPeriods); if (realm.currentPeriod < 1) fail('当前期数至少为1');
      integer(realm.cumulative, '累计已抽'); integer(realm.inventory, '持有未用'); integer(realm.target, '规划目标'); add(realm.cumulative, realm.inventory);
      if (!legacy) {
        integer(realm.currency, '当前兑换道具'); integer(realm.currencyTarget, '兑换道具目标');
        boolean(realm.targetEnabled, '启用抽数目标'); boolean(realm.currencyTargetEnabled, '启用道具目标');
        if (realm.drawMode !== 'stop' && realm.drawMode !== 'all') fail('抽取模式无效');
      }
      boolean(realm.finished, '结束标记'); object(realm.periods, '期次记录');
      Object.keys(realm.periods).forEach(function(key) { if (!/^[1-6]$/.test(key) || Number(key) > data.maxPeriods) fail('存储期数无效'); });
      for (var number = 1; number <= data.maxPeriods; number++) {
        var period = object(realm.periods[number], '第' + number + '期记录');
        if (period.startDate !== null) dateTime(period.startDate);
        boolean(period.locked, '日期锁定'); boolean(period.ended, '期次结束'); object(period.sources, '来源明细');
        if (period.ended && !period.locked) fail('已结束期必须永久锁定');
        if (period.locked && !period.ended && period.startDate === null) fail('已开始期的锁定记录缺少开始日期');
        if (number > realm.currentPeriod && (period.ended || period.locked)) fail('未来期次不能提前结束或锁定');
        if (number < realm.currentPeriod && !period.ended) fail('历史期必须结束');
        if (period.ended && Object.keys(period.sources).length) fail('已结束期不应保留来源实际明细');
        Object.keys(period.sources).forEach(function(sourceId) {
          var source = sourceData(data, sourceId);
          if (source.firstOnly && number !== 1) fail('首期赠送不能出现在后续期');
          var record = period.sources[sourceId]; validateSource(record, source, period, legacy);
          if ((!period.locked || period.startDate === null || number > realm.currentPeriod) && (record.obtained || record.purchased || record.todayObtained || record.todayPurchased || record.todayDate !== null || (!legacy && record.currencyObtained))) fail('未开始的期次不能有实际记录');
        });
        if (!period.ended) data.sources.forEach(function(source) { if ((!source.firstOnly || number === 1) && !own(period.sources, source.id)) fail('来源明细缺失'); });
      }
      if (realm.finished && (realm.currentPeriod !== data.maxPeriods || !realm.periods[data.maxPeriods].ended)) fail('秘境结束状态与期次不一致');
      validateDates(realm, data);
    });
    return state;
  }
  function normalize(raw, data) {
    if (raw === null || raw === undefined) return createDefault(data);
    validate(raw, data);
    var next = clone(raw);
    if (next.schemaVersion === 1) {
      next.schemaVersion = 2;
      Object.keys(next.realms).forEach(function(id) {
        var realm = next.realms[id];
        Object.assign(realm, {currency:0,targetEnabled:true,currencyTargetEnabled:false,currencyTarget:0,drawMode:'stop'});
        Object.keys(realm.periods).forEach(function(number) { Object.keys(realm.periods[number].sources).forEach(function(id) {
          var record = realm.periods[number].sources[id]; record.currencyObtained = 0;
          if (id === 'pack6') { record.obtained = multiply(record.purchased, 3); record.todayObtained = 0; }
        }); });
      });
      validate(next, data);
    }
    return next;
  }
  function getRealm(state, id) { if (!own(state.realms, id)) fail('秘境不存在或已删除'); return state.realms[id]; }
  function getPeriod(realm, number, data) {
    integer(number, '期数', data.maxPeriods); if (number < 1 || !own(realm.periods, number)) fail('期次不存在'); return realm.periods[number];
  }
  function status(realm, number, now, data) {
    time(now); var period = getPeriod(realm, number, data), begin = period.startDate === null ? null : dateTime(period.startDate);
    var end = begin === null ? null : begin + data.periodDays * DAY;
    var phase = period.ended || (end !== null && now >= end) ? 'ended' : begin === null || (now < begin && !period.locked) ? 'upcoming' : 'active';
    return { phase: phase, today: dateText(now), day: phase === 'active' ? Math.max(1, Math.min(data.periodDays, Math.floor((now - begin) / DAY) + 1)) : phase === 'ended' && begin !== null ? data.periodDays : 0, endDate: end === null ? null : dateText(end) };
  }
  function advance(state, now, data) {
    time(now); var next = normalize(state, data);
    Object.keys(next.realms).forEach(function(id) {
      var realm = next.realms[id];
      while (!realm.finished) {
        var number = realm.currentPeriod, period = realm.periods[number], phase = status(realm, number, now, data).phase;
        if (phase === 'upcoming') {
          // A supplied later start is authoritative that undated predecessors
          // have finished. Do not fabricate their dates or block the known event.
          var laterStarted = false;
          if (period.startDate === null) {
            for (var later = number + 1; later <= data.maxPeriods; later++) {
              var laterDate = realm.periods[later].startDate;
              if (laterDate !== null && dateTime(laterDate) <= now) { laterStarted = true; break; }
            }
          }
          if (!laterStarted) break;
          phase = 'ended';
        }
        period.locked = true;
        if (phase === 'active') break;
        period.ended = true; period.sources = {};
        if (number === data.maxPeriods) { realm.finished = true; break; }
        realm.currentPeriod++;
      }
    });
    return next;
  }
  function editable(state, id, number, now, data) {
    var realm = getRealm(state, id), period = getPeriod(realm, number, data);
    if (realm.finished || number < realm.currentPeriod || status(realm, number, now, data).phase === 'ended') fail('已结束或历史期次不能修改');
    return period;
  }
  function setStartDate(state, id, number, date, now, data) {
    var next = advance(state, now, data), period = editable(next, id, number, now, data);
    if (period.locked || status(next.realms[id], number, now, data).phase !== 'upcoming') fail('本期已经开始，日期已锁定');
    if (date !== null && dateTime(date) + data.periodDays * DAY <= now) fail('首次设置不能使用已结束的日期');
    period.startDate = date;
    validateDates(next.realms[id], data);
    return advance(next, now, data);
  }
  function patchValues(target, values, keys, label) {
    object(values, label);
    Object.keys(values).forEach(function(key) { if (keys.indexOf(key) < 0) fail(label + '包含不支持的字段'); target[key] = clone(values[key]); });
  }
  function updateTotals(state, id, values, data) {
    var next = normalize(state, data); patchValues(getRealm(next, id), values, ['cumulative', 'inventory', 'target', 'currency', 'targetEnabled', 'currencyTargetEnabled', 'currencyTarget', 'drawMode'], '进度输入'); return validate(next, data);
  }
  function updateSource(state, id, number, sourceId, values, now, data) {
    var next = advance(state, now, data), period = editable(next, id, number, now, data), realm = next.realms[id];
    var current = status(realm, number, now, data);
    if (number !== realm.currentPeriod || current.phase !== 'active') fail('只有进行中的当前期可以保存实际记录');
    if (!own(period.sources, sourceId)) fail('本期来源不存在');
    var source = sourceData(data, sourceId), record = period.sources[sourceId];
    patchValues(record, values, ['obtained', 'purchased', 'todayDate', 'todayObtained', 'todayPurchased', 'currencyObtained'], '来源输入');
    if (sourceId === 'pack6') {
      if ((own(values,'obtained') && values.obtained !== multiply(record.purchased,3)) || (own(values,'todayObtained') && values.todayObtained !== 0)) fail('6元礼包不支持独立领取');
      record.obtained = multiply(record.purchased,3); record.todayObtained = 0;
    }
    if (source.daily) {
      if ((record.todayObtained || record.todayPurchased) && record.todayDate !== current.today) fail('今日记录日期已变化，请重新确认后保存');
      if (record.todayDate !== null && record.todayDate > current.today) fail('今日记录日期不能晚于当前日期');
      if (record.obtained > multiply(current.day, source.draws) || record.purchased > current.day) fail('每日来源累计记录超过已开放天数');
    }
    return validate(next, data);
  }
  function setEnabled(state, id, number, sourceId, enabled, now, data) {
    boolean(enabled, '来源启用状态'); var next = advance(state, now, data), period = editable(next, id, number, now, data);
    if (!own(period.sources, sourceId)) fail('本期来源不存在'); period.sources[sourceId].enabled = enabled; return next;
  }
  function setAll(state, id, number, enabled, now, data) {
    boolean(enabled, '全选状态'); var next = advance(state, now, data), period = editable(next, id, number, now, data);
    Object.keys(period.sources).forEach(function(id) { period.sources[id].enabled = enabled && id !== 'pack648'; }); return next;
  }
  function applyFollowing(state, id, number, now, data) {
    var next = advance(state, now, data), sourcePeriod = editable(next, id, number, now, data), realm = next.realms[id];
    for (var later = number + 1; later <= data.maxPeriods; later++) {
      var period = editable(next, id, later, now, data);
      Object.keys(period.sources).forEach(function(sourceId) { if (own(sourcePeriod.sources, sourceId)) period.sources[sourceId].enabled = sourcePeriod.sources[sourceId].enabled; });
    }
    return next;
  }
  function updateSettings(state, settings, data) {
    var next = normalize(state, data); patchValues(next.settings, settings, ['platformId', 'platforms', 'vouchers', 'useVouchers'], '平台设置'); return validate(next, data);
  }
  function deleteRealm(state, id, now, data) {
    var next = advance(state, now, data); if (!getRealm(next, id).finished) fail('只有全部结束的秘境可以删除'); delete next.realms[id]; return next;
  }
  function deletePlatform(state, id, data) {
    var next = normalize(state, data);
    if (data.platforms.some(function(p) { return p.id === id; })) fail('系统预设平台不能删除');
    if (!next.settings.platforms.some(function(p) { return p.id === id; })) fail('平台不存在');
    next.settings.platforms = next.settings.platforms.filter(function(p) { return p.id !== id; });
    if (next.settings.platformId === id) next.settings.platformId = 'direct';
    return validate(next, data);
  }
  function buildPlanningInput(state, id, now, data) {
    var next = advance(state, now, data), realm = getRealm(next, id), settings = next.settings;
    var input = { cumulative: realm.cumulative, inventory: realm.inventory, target: realm.target, currency: realm.currency, targetEnabled: realm.targetEnabled, currencyTargetEnabled: realm.currencyTargetEnabled, currencyTarget: realm.currencyTarget, drawMode: realm.drawMode, discount: settings.platforms.find(function(p) { return p.id === settings.platformId; }).discount, vouchers: settings.vouchers, useVouchers: settings.useVouchers, periods: [] };
    var availableTotal = add(realm.cumulative, realm.inventory);
    if (realm.finished) return input;
    for (var number = realm.currentPeriod; number <= data.maxPeriods; number++) {
      var period = realm.periods[number], current = status(realm, number, now, data);
      if (current.phase === 'ended') continue;
      var sources = [];
      data.sources.forEach(function(source) {
        var record = period.sources[source.id];
        if (!record || !record.enabled || (source.firstOnly && number !== 1)) return;
        var today = record.todayDate === current.today, remainingDays = current.phase === 'active' ? data.periodDays - current.day + 1 : data.periodDays;
        var available = source.price ? multiply(record.purchased, source.draws) - record.obtained : multiply(source.limit, source.draws) - record.obtained;
        var purchases = !source.price ? 0 : source.limit === null ? null : source.limit - record.purchased;
        if (source.daily) {
          if (source.price) purchases = Math.min(purchases, remainingDays - (today ? record.todayPurchased : 0));
          else available = Math.min(available, multiply(remainingDays, source.draws) - (today ? record.todayObtained : 0));
        }
        integer(available, '剩余可领抽数'); if (purchases !== null) integer(purchases, '剩余购买份数');
        availableTotal = add(availableTotal, available);
        if (purchases !== null) add(availableTotal, multiply(purchases, source.draws));
        var availableCurrency = source.currencyReceipt ? (source.price ? multiply(record.purchased,source.currency) : source.currency) - record.currencyObtained : 0;
        sources.push({ id: source.id, name: source.name, draws: source.draws, price: source.price, maxPurchases: purchases, availableDraws: available, availableCurrency: availableCurrency, purchaseCurrency: source.price ? source.currency : 0 });
      });
      input.periods.push({ number: number, sources: sources });
    }
    return input;
  }
  return { createDefault: createDefault, normalize: normalize, advance: advance, status: status, setStartDate: setStartDate, updateTotals: updateTotals, updateSource: updateSource, setEnabled: setEnabled, setAll: setAll, applyFollowing: applyFollowing, updateSettings: updateSettings, deletePlatform: deletePlatform, deleteRealm: deleteRealm, buildPlanningInput: buildPlanningInput };
});
