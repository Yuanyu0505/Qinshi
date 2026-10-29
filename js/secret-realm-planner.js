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
  // All monetary arithmetic and whole-yuan ceiling remain exact.
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
    const denominator = discount.denominator * 10n * 100n;
    return ((numerator + denominator - 1n) / denominator) * 100n;
  }
  function cash(cents, discount) { return safe(cashExact(cents, discount), '折后金额'); }

  function validate(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail('规划输入无效');
    const cumulative = integer(input.cumulative, '累计抽数');
    const inventory = integer(input.inventory, '库存抽数');
    const target = integer(input.target, '目标抽数');
    const targetEnabled = input.targetEnabled === undefined ? true : input.targetEnabled;
    const currencyTargetEnabled = input.currencyTargetEnabled === undefined ? false : input.currencyTargetEnabled;
    if (typeof targetEnabled !== 'boolean' || typeof currencyTargetEnabled !== 'boolean') fail('目标开关无效');
    if (!targetEnabled && !currencyTargetEnabled) fail('请至少启用一个目标');
    const currency = integer(input.currency === undefined ? 0 : input.currency, '当前兑换道具');
    const currencyTarget = integer(input.currencyTarget === undefined ? 0 : input.currencyTarget, '兑换道具目标');
    const drawMode = input.drawMode === undefined ? 'stop' : input.drawMode;
    if (drawMode !== 'stop' && drawMode !== 'all') fail('抽取模式无效');
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
        const availableCurrency = integer(source.availableCurrency === undefined ? 0 : source.availableCurrency, '可领兑换道具');
        const purchaseCurrency = integer(source.purchaseCurrency === undefined ? 0 : source.purchaseCurrency, '每份额外兑换道具');
        const row = { id: source.id, name: source.name, draws, availableDraws, price, maxPurchases, availableCurrency, purchaseCurrency, index: rowIndex++ };
        finiteMaximum = add(finiteMaximum, availableDraws, '最大可获抽数');
        if (maxPurchases === null) {
          if (unlimited && (unlimited.draws !== draws || unlimited.price !== price || unlimited.purchaseCurrency !== purchaseCurrency)) {
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
    return { base, cumulative, inventory, target: targetEnabled ? target : cumulative, targetEnabled, currency, currencyTargetEnabled, currencyTarget, drawMode, discount, vouchers: input.useVouchers ? vouchers : 0, periods,
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
          directCurrency: source.availableCurrency + purchases * source.purchaseCurrency,
          purchases, draws: rowDraws, before: rowBefore / 100, voucherUsed: voucher / 100, after: rowAfter / 100 };
      });
      return { number: period.number, draws, before: before / 100, voucherUsed: voucherUsed / 100,
        after: after / 100, rows };
    });
    return { reachPeriod: candidate.number, availableTotal: candidate.total, surplus: candidate.surplus,
      totalBefore: candidate.before / 100, voucherUsed: candidate.voucher / 100,
      totalAfter: candidate.after / 100, periods };
  }

  // Draws and direct gifts are independent resources. Enumerate the small
  // currency-bearing bounded catalog; zero-gift sources use the existing exact
  // finite-draw DP. Unlimited purchases need only a bounded window: cheap finite
  // tickets can reduce their count by at most ceil(finite tickets / pack draws).
  function currencyCandidates(data) {
    let fastest = null, cheapest = null, freeTickets = data.inventory, freeCurrency = data.currency;
    let maxTickets = data.inventory, maxCurrency = data.currency, unlimited = null;
    const zero = [{cost:0,node:null}], groups = new Map();
    const needDraws = BigInt(Math.max(0, data.target - data.cumulative));
    const needCurrency = BigInt(data.currencyTargetEnabled ? data.currencyTarget : 0);
    const ceil = (n,d) => n > 0n ? (n+d-1n)/d : 0n;
    const max = (...xs) => xs.reduce((a,b)=>a>b?a:b,0n);
    function consider(last, number, available, direct, before, node, count, unbounded) {
      const total = BigInt(data.cumulative) + available;
      const voucher = before < BigInt(data.vouchers) ? before : BigInt(data.vouchers);
      const candidate = {number,last,total,surplus:total-BigInt(data.target),before,voucher,
        after:cashExact(before-voucher,data.discount),node,unlimited:unbounded,unlimitedCount:count};
      if (available < needDraws || available + direct < needCurrency) return;
      if (better(candidate,fastest,'fastest')) fastest=candidate;
      if (better(candidate,cheapest,'cheapest')) cheapest=candidate;
    }
    if (BigInt(freeTickets)>=needDraws && BigInt(freeTickets)+BigInt(freeCurrency)>=needCurrency) {
      return {fastest:{reachPeriod:null,availableTotal:data.base,surplus:data.base-data.target,totalBefore:0,voucherUsed:0,totalAfter:0,periods:[]},cheapest:{reachPeriod:null,availableTotal:data.base,surplus:data.base-data.target,totalBefore:0,voucherUsed:0,totalAfter:0,periods:[]},maxReachable:data.base,shortfall:0,currencyShortfall:0};
    }
    data.periods.forEach((period,last)=>{
      period.sources.forEach(source=>{
        freeTickets=add(freeTickets,source.availableDraws,'免费抽数');freeCurrency=add(freeCurrency,source.availableCurrency,'免费兑换道具');
        maxTickets=add(maxTickets,source.availableDraws,'最大抽数');maxCurrency=add(maxCurrency,source.availableCurrency,'最大道具');
        if (source.maxPurchases===null) unlimited=unlimited||source;
        else {
          maxTickets=add(maxTickets,safe(BigInt(source.draws)*BigInt(source.maxPurchases),'有限抽数'),'最大抽数');
          maxCurrency=add(maxCurrency,safe(BigInt(source.purchaseCurrency)*BigInt(source.maxPurchases),'有限道具'),'最大道具');
          if (!source.purchaseCurrency) appendSource(zero,source);
          else {
            const key=[source.draws,source.price,source.purchaseCurrency].join('/');
            if (!groups.has(key)) groups.set(key,{draws:source.draws,price:source.price,gift:source.purchaseCurrency,limit:0,rows:[]});
            const group=groups.get(key);group.limit+=source.maxPurchases;group.rows.push(source);
          }
        }
      });
      const suffix=Array(zero.length);let best=null;
      for(let i=zero.length-1;i>=0;i--){if(zero[i]&&(!best||zero[i].cost<=best.state.cost))best={draws:i,state:zero[i]};suffix[i]=best;}
      const catalog=Array.from(groups.values()),chosen=[];
      function visit(index,tickets,gifts,cost) {
        if(index<catalog.length){const g=catalog[index];for(let n=0;n<=g.limit;n++){chosen[index]=n;visit(index+1,tickets+n*g.draws,gifts+n*g.gift,cost+n*g.price);}return;}
        const t=BigInt(freeTickets+tickets),g=BigInt(freeCurrency+gifts),cheapMax=BigInt(zero.length-1);
        const a=needDraws-t,b=needCurrency-t-g;
        const low=unlimited?max(ceil(a-cheapMax,BigInt(unlimited.draws)),ceil(b-cheapMax,BigInt(unlimited.draws+unlimited.purchaseCurrency))):0n;
        const high=unlimited?max(ceil(a,BigInt(unlimited.draws)),ceil(b,BigInt(unlimited.draws+unlimited.purchaseCurrency))):0n;
        for(let k=low;k<=high;k++){
          const uDraws=unlimited?k*BigInt(unlimited.draws):0n,uGift=unlimited?k*BigInt(unlimited.purchaseCurrency):0n;
          const required=max(a-uDraws,b-uDraws-uGift);
          if(required>cheapMax)continue;
          let fill=suffix[Number(required)];if(!fill)continue;
          const fixed=BigInt(cost)+(unlimited?k*BigInt(unlimited.price):0n);
          const fee = price => {const before=fixed+BigInt(price),v=before<BigInt(data.vouchers)?before:BigInt(data.vouchers);return [cashExact(before-v,data.discount),v];};
          const bestFee=fee(fill.state.cost);
          // Tiny custom discounts may round two different original costs to the
          // same cash. Preserve the smaller-surplus candidate in that tie.
          for(let d=Number(required);d<fill.draws;d++)if(zero[d]){const f=fee(zero[d].cost);if(f[0]===bestFee[0]&&f[1]===bestFee[1]){fill={draws:d,state:zero[d]};break;}}
          let node=fill.state.node;
          catalog.forEach((group,index)=>{let n=chosen[index];for(const source of group.rows){const take=Math.min(n,source.maxPurchases);if(take)node={source:source.index,count:take,previous:node};n-=take;}});
          consider(last,period.number,t+BigInt(fill.draws)+uDraws,g+uGift,fixed+BigInt(fill.state.cost),node,k,unlimited);
        }
      }
      visit(0,0,0,0);
    });
    return {fastest:reconstruct(fastest,data),cheapest:reconstruct(cheapest,data),maxReachable:unlimited?null:add(data.cumulative,maxTickets,'最大累计'),
      shortfall:unlimited?0:Math.max(0,data.target-data.cumulative-maxTickets),currencyShortfall:unlimited?0:Math.max(0,(data.currencyTargetEnabled?data.currencyTarget:0)-maxTickets-maxCurrency)};
  }

  function drawDetails(plan,data) {
    if(!plan)return null;
    let direct=0;
    plan.periods.forEach(p=>p.rows.forEach(r=>{direct=add(direct,r.directCurrency||0,'直接兑换道具');}));
    const tickets=plan.availableTotal-data.cumulative;
    const minimum=Math.max(0,data.target-data.cumulative,data.currencyTargetEnabled?data.currencyTarget-data.currency-direct:0);
    let toDraw=data.drawMode==='all'?tickets:minimum;
    if(toDraw>tickets)fail('方案抽取券不足');
    const totalDraws=toDraw;
    let held=data.inventory, balance=data.currency, completed=data.cumulative;
    const ownedDraws=Math.min(held,toDraw);held-=ownedDraws;toDraw-=ownedDraws;balance=add(balance,ownedDraws,'兑换道具');completed=add(completed,ownedDraws,'累计抽数');
    plan.initialDraws=ownedDraws;
    plan.periods.forEach(p=>{
      const received=p.rows.reduce((sum,r)=>add(sum,r.directCurrency||0,'兑换道具'),0);
      held=add(held,p.draws,'抽取券');balance=add(balance,received,'兑换道具');
      const used=Math.min(held,toDraw);held-=used;toDraw-=used;balance=add(balance,used,'兑换道具');completed=add(completed,used,'累计抽数');
      Object.assign(p,{plannedDraws:used,remainingTickets:held,directCurrency:received,currencyFromDraws:used,currencyBalance:balance,cumulative:completed});
    });
    Object.assign(plan,{plannedDraws:totalDraws,remainingTickets:held,directCurrency:direct,currencyFromDraws:totalDraws,currencyBalance:balance,finalCumulative:completed});
    return plan;
  }

  function plan(input) {
    try {
      const data = validate(input);
      if(data.currencyTargetEnabled){const r=currencyCandidates(data);r.valid=true;r.error=null;drawDetails(r.fastest,data);drawDetails(r.cheapest,data);return r;}
      const result = { valid: true, error: null, fastest: null, cheapest: null,
        maxReachable: data.maxReachable, shortfall: 0 };
      if (data.base >= data.target) {
        const empty = { reachPeriod: null, availableTotal: data.base, surplus: data.base - data.target,
          totalBefore: 0, voucherUsed: 0, totalAfter: 0, periods: [] };
        result.fastest = empty;
        result.cheapest = { ...empty, periods: [] };
        drawDetails(result.fastest,data);drawDetails(result.cheapest,data);return result;
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
      drawDetails(result.fastest,data);drawDetails(result.cheapest,data);
      return result;
    } catch (error) {
      return { valid: false, error: error && error.message ? error.message : '规划计算失败',
        fastest: null, cheapest: null, maxReachable: null, shortfall: null };
    }
  }

  return Object.freeze({ plan });
});
