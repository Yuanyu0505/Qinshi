(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SECRET_REALM_PLANNER = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MAX = BigInt(Number.MAX_SAFE_INTEGER);
  const fail = message => { throw new Error(message); };
  function integer(value, label, positive) {
    if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0)) fail(label + '必须是安全非负整数');
    return value;
  }
  function safe(value, label) {
    if (value < 0n || value > MAX) fail(label + '超出安全整数范围');
    return Number(value);
  }
  function add(left, right, label) { return safe(BigInt(left) + BigInt(right), label); }

  // Parse the decimal the user actually supplied, including exponential form.
  // All monetary arithmetic and discount half-up rounding remain exact.
  function decimal(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) fail(label + '必须是有效非负数');
    const parts = String(value).toLowerCase().split('e');
    const digits = parts[0].split('.');
    const exponent = Number(parts[1] || 0) - (digits[1] || '').length;
    let numerator = BigInt(digits.join(''));
    let denominator = 1n;
    if (exponent >= 0) numerator *= 10n ** BigInt(exponent);
    else denominator = 10n ** BigInt(-exponent);
    return { numerator, denominator };
  }
  function money(value, label) {
    const fraction = decimal(value, label);
    const scaled = fraction.numerator * 100n;
    if (scaled % fraction.denominator !== 0n) fail(label + '最多允许两位小数');
    return safe(scaled / fraction.denominator, label);
  }
  function cashExact(cents, discount) {
    const numerator = BigInt(cents) * discount.numerator;
    const denominator = discount.denominator * 10n;
    return (numerator * 2n + denominator) / (denominator * 2n);
  }
  function cash(cents, discount) { return safe(cashExact(cents, discount), '折后金额'); }

  function validate(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail('规划输入无效');
    const cumulative = integer(input.cumulative, '累计抽数');
    const inventory = integer(input.inventory, '库存抽数');
    const target = integer(input.target, '目标抽数');
    const base = add(cumulative, inventory, '累计和库存');
    const discount = decimal(input.discount, '折扣');
    if (input.discount <= 0 || input.discount > 10) fail('折扣必须大于0且不超过10');
    const vouchers = money(input.vouchers, '代金');
    if (typeof input.useVouchers !== 'boolean') fail('代金开关无效');
    if (!Array.isArray(input.periods)) fail('期次列表无效');
    let last = 0;
    let finiteMaximum = base;
    let finiteCost = 0;
    let unlimited = null;
    let rowIndex = 0;
    const periods = input.periods.map(period => {
      if (!period || typeof period !== 'object') fail('期次无效');
      const number = integer(period.number, '期数', true);
      if (number <= last) fail('期数必须递增且不得重复');
      last = number;
      if (!Array.isArray(period.sources)) fail('来源列表无效');
      const ids = new Set();
      const sources = period.sources.map(source => {
        if (!source || typeof source !== 'object' || typeof source.id !== 'string' || !source.id.trim()
          || typeof source.name !== 'string') fail('来源信息无效');
        if (ids.has(source.id)) fail('同一期来源不得重复');
        ids.add(source.id);
        const draws = integer(source.draws, '每份抽数', true);
        const availableDraws = integer(source.availableDraws, '可获抽数');
        const price = money(source.price, '礼包价格');
        const maxPurchases = source.maxPurchases === null ? null : integer(source.maxPurchases, '购买上限');
        const row = { id: source.id, name: source.name, draws, availableDraws, price, maxPurchases, index: rowIndex++ };
        finiteMaximum = add(finiteMaximum, availableDraws, '最大可获抽数');
        if (maxPurchases === null) {
          if (unlimited && (unlimited.draws !== draws || unlimited.price !== price)) {
            fail('无限礼包的每份抽数和价格必须一致');
          }
          unlimited = row;
        } else {
          finiteMaximum = add(finiteMaximum, safe(BigInt(draws) * BigInt(maxPurchases), '有限来源抽数'), '最大可获抽数');
          finiteCost = add(finiteCost, safe(BigInt(price) * BigInt(maxPurchases), '有限来源费用'), '有限来源费用');
        }
        return row;
      });
      return { number, sources };
    });
    return { base, target, discount, vouchers: input.useVouchers ? vouchers : 0, periods,
      maxReachable: unlimited ? null : finiteMaximum };
  }

  // Binary splitting turns each bounded source into O(log(limit)) 0/1 items.
  // Indexing is by FINITE available purchase draws, never by the user's target.
  // One minimum original-price state per exact draw count is sufficient: both
  // rounded cash and voucher use are monotone in original price. We retain every
  // draw count because rounding can make a dearer, lower-surplus state preferable.
  function appendSource(states, source) {
    if (!source.maxPurchases) return states;
    let left = source.maxPurchases;
    let chunk = 1;
    while (left > 0) {
      const count = Math.min(chunk, left);
      const draws = count * source.draws;
      const price = count * source.price;
      const previousLength = states.length;
      states.length += draws;
      for (let index = previousLength - 1; index >= 0; index--) {
        const prior = states[index];
        if (!prior) continue;
        const next = index + draws;
        const cost = prior.cost + price;
        if (!states[next] || cost < states[next].cost) {
          states[next] = { cost, node: { source: source.index, count, previous: prior.node } };
        }
      }
      left -= count;
      chunk *= 2;
    }
    return states;
  }

  function better(candidate, incumbent, mode) {
    if (!incumbent) return true;
    const keys = mode === 'fastest' ? ['number', 'after', 'voucher', 'surplus']
      : ['after', 'voucher', 'number', 'surplus'];
    for (const key of keys) {
      if (candidate[key] !== incumbent[key]) return candidate[key] < incumbent[key];
    }
    return false;
  }

  function reconstruct(candidate, data) {
    if (!candidate) return null;
    // Rank with exact BigInts first. Discarding an overflowing candidate before
    // ranking would quietly replace the actual fastest plan with a later one.
    const selected = { ...candidate };
    for (const key of ['total', 'surplus', 'before', 'voucher', 'after', 'unlimitedCount']) {
      selected[key] = safe(candidate[key], '规划抽数或费用');
    }
    candidate = selected;
    const counts = new Map();
    for (let node = candidate.node; node; node = node.previous) {
      counts.set(node.source, (counts.get(node.source) || 0) + node.count);
    }
    if (candidate.unlimitedCount) counts.set(candidate.unlimited.index, candidate.unlimitedCount);
    let vouchersLeft = data.vouchers;
    let totalRemaining = 0;
    let previousCash = 0;
    const periods = data.periods.slice(0, candidate.last + 1).map(period => {
      let draws = 0;
      let before = 0;
      let voucherUsed = 0;
      let after = 0;
      const rows = period.sources.map(source => {
        const purchases = counts.get(source.index) || 0;
        const rowBefore = purchases * source.price;
        const voucher = Math.min(vouchersLeft, rowBefore);
        vouchersLeft -= voucher;
        totalRemaining += rowBefore - voucher;
        const cumulativeCash = cash(totalRemaining, data.discount);
        const rowAfter = cumulativeCash - previousCash;
        previousCash = cumulativeCash;
        const rowDraws = source.availableDraws + purchases * source.draws;
        draws += rowDraws;
        before += rowBefore;
        voucherUsed += voucher;
        after += rowAfter;
        return { id: source.id, name: source.name, availableDraws: source.availableDraws,
          purchases, draws: rowDraws, before: rowBefore / 100, voucherUsed: voucher / 100, after: rowAfter / 100 };
      });
      return { number: period.number, draws, before: before / 100, voucherUsed: voucherUsed / 100,
        after: after / 100, rows };
    });
    return { reachPeriod: candidate.number, availableTotal: candidate.total, surplus: candidate.surplus,
      totalBefore: candidate.before / 100, voucherUsed: candidate.voucher / 100,
      totalAfter: candidate.after / 100, periods };
  }

  function plan(input) {
    try {
      const data = validate(input);
      const result = { valid: true, error: null, fastest: null, cheapest: null,
        maxReachable: data.maxReachable, shortfall: 0 };
      if (data.base >= data.target) {
        const empty = { reachPeriod: null, availableTotal: data.base, surplus: data.base - data.target,
          totalBefore: 0, voucherUsed: 0, totalAfter: 0, periods: [] };
        result.fastest = empty;
        result.cheapest = { ...empty, periods: [] };
        return result;
      }
      if (data.maxReachable !== null && data.maxReachable < data.target) {
        result.shortfall = data.target - data.maxReachable;
        return result;
      }
      const states = [{ cost: 0, node: null }];
      let available = data.base;
      let unlimited = null;
      let fastest = null;
      let cheapest = null;
      data.periods.forEach((period, last) => {
        period.sources.forEach(source => {
          available = add(available, source.availableDraws, '免费和已购抽数');
          if (source.maxPurchases === null) unlimited = unlimited || source;
          else appendSource(states, source);
        });
        for (let draws = 0; draws < states.length; draws++) {
          const state = states[draws];
          if (!state) continue;
          const finiteTotal = BigInt(available) + BigInt(draws);
          const missing = BigInt(data.target) - finiteTotal;
          if (missing > 0n && !unlimited) continue;
          const count = missing > 0n ? (missing + BigInt(unlimited.draws) - 1n) / BigInt(unlimited.draws) : 0n;
          const total = finiteTotal + (count ? count * BigInt(unlimited.draws) : 0n);
          const before = BigInt(state.cost) + (count ? count * BigInt(unlimited.price) : 0n);
          const voucher = before < BigInt(data.vouchers) ? before : BigInt(data.vouchers);
          const candidate = { number: period.number, last, total, surplus: total - BigInt(data.target),
            before, voucher, after: cashExact(before - voucher, data.discount),
            node: state.node, unlimited, unlimitedCount: count };
          if (better(candidate, fastest, 'fastest')) fastest = candidate;
          if (better(candidate, cheapest, 'cheapest')) cheapest = candidate;
        }
      });
      result.fastest = reconstruct(fastest, data);
      result.cheapest = reconstruct(cheapest, data);
      return result;
    } catch (error) {
      return { valid: false, error: error && error.message ? error.message : '规划计算失败',
        fastest: null, cheapest: null, maxReachable: null, shortfall: null };
    }
  }

  return Object.freeze({ plan });
});
