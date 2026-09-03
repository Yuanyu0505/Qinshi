(function (root, factory) {
  var core = factory();
  if (typeof module === "object" && module.exports) module.exports = core;
  if (root) root.BATTLE_BOX_PILL_POUCH_CORE = core;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function integer(value, fallback, maximum) {
    var number = Number(value);
    var safeFallback = fallback === undefined ? 0 : fallback;
    if (!Number.isFinite(number) || number < 0) return safeFallback;
    var result = Math.floor(number);
    return maximum === undefined ? result : Math.min(maximum, result);
  }

  function capFromRanges(playerLevel, ranges) {
    var level = integer(playerLevel);
    for (var index = 0; index < ranges.length; index += 1) {
      var range = ranges[index];
      if (level >= range.min && (range.max === null || level <= range.max)) return range.cap;
    }
    return null;
  }

  function battlePlayerCap(playerLevel, data) {
    return capFromRanges(playerLevel, data.battlePlayerCaps);
  }

  function pouchPlayerCap(playerLevel, data) {
    return capFromRanges(playerLevel, data.pouchPlayerCaps);
  }

  function battleItemCap(slots, data) {
    return (Array.isArray(slots) ? slots : []).reduce(function (total, slot) {
      if (!slot || !String(slot.itemName || "").trim()) return total;
      return total + integer(data.battleQualityCaps[slot.quality]);
    }, data.defaults.baseCap);
  }

  function pouchItemCap(slots, data) {
    return (Array.isArray(slots) ? slots : []).reduce(function (total, slot) {
      if (!slot || !data.pouchQualityCaps[slot.quality]) return total;
      return total + data.pouchQualityCaps[slot.quality];
    }, data.defaults.baseCap);
  }

  function normalizeEquipmentSlot(definition, raw, data) {
    var source = raw && typeof raw === "object" ? raw : {};
    var itemName = String(source.itemName || "").trim();
    var quality = itemName && data.battleQualityCaps[source.quality]
      ? source.quality
      : itemName ? data.defaults.defaultQuality : null;
    return {
      slotId: definition.id,
      itemId: itemName && source.itemId ? String(source.itemId) : null,
      itemName: itemName,
      sourceType: itemName && source.sourceType === "catalog" ? "catalog" : itemName ? "custom" : null,
      quality: quality
    };
  }

  function normalizePouchSlot(raw, data) {
    var quality = raw && data.pouchQualityCaps[raw.quality] ? raw.quality : null;
    return { quality: quality };
  }

  function normalizeDisciple(raw, data) {
    var source = raw && typeof raw === "object" ? raw : {};
    var battle = source.battle && typeof source.battle === "object" ? source.battle : {};
    var pouch = source.pouch && typeof source.pouch === "object" ? source.pouch : {};
    var rawBattleSlots = Array.isArray(battle.slots) ? battle.slots : [];
    var bySlot = {};
    rawBattleSlots.forEach(function (slot) {
      if (slot && slot.slotId) bySlot[slot.slotId] = slot;
    });
    var sourceType = source.sourceType === "atlas" && source.atlasId ? "atlas" : "custom";
    var currentBattle = integer(battle.currentLevel, 0, 90);
    var currentPouch = integer(pouch.currentLevel, 0, 90);
    return {
      id: String(source.id || ""),
      name: String(source.name || "").trim(),
      sourceType: sourceType,
      atlasId: sourceType === "atlas" ? String(source.atlasId) : null,
      battle: {
        currentLevel: currentBattle,
        targetLevel: integer(battle.targetLevel, currentBattle, 90),
        enabled: battle.enabled !== false,
        slots: data.equipmentSlots.map(function (definition, index) {
          return normalizeEquipmentSlot(definition, bySlot[definition.id] || rawBattleSlots[index], data);
        })
      },
      pouch: {
        currentLevel: currentPouch,
        targetLevel: integer(pouch.targetLevel, currentPouch, 90),
        enabled: pouch.enabled !== false,
        slots: Array.from({ length: 8 }, function (_, index) {
          return normalizePouchSlot(Array.isArray(pouch.slots) ? pouch.slots[index] : null, data);
        })
      }
    };
  }

  function normalizePurchase(raw, fallback) {
    var source = raw && typeof raw === "object" ? raw : {};
    var packSize = integer(source.packSize, fallback.packSize);
    return {
      packSize: packSize > 0 ? packSize : fallback.packSize,
      packPrice: integer(source.packPrice, fallback.packPrice)
    };
  }

  function normalizeAccount(raw, data) {
    var source = raw && typeof raw === "object" ? raw : {};
    var inventory = source.inventory && typeof source.inventory === "object" ? source.inventory : {};
    var purchase = source.purchase && typeof source.purchase === "object" ? source.purchase : {};
    return {
      playerLevel: integer(source.playerLevel),
      inventory: {
        pearls: integer(inventory.pearls),
        shells: integer(inventory.shells)
      },
      purchase: {
        pearls: normalizePurchase(purchase.pearls, data.defaults.purchase.pearls),
        shells: normalizePurchase(purchase.shells, data.defaults.purchase.shells)
      },
      systemPriority: source.systemPriority === "pouch" ? "pouch" : "battle"
    };
  }

  function capSnapshot(playerCap, itemCap, currentLevel) {
    var effectiveCap = playerCap === null ? null : Math.min(playerCap, itemCap);
    return {
      unlocked: playerCap !== null,
      playerCap: playerCap,
      itemCap: itemCap,
      effectiveCap: effectiveCap,
      currentLevel: currentLevel,
      overCap: effectiveCap !== null && currentLevel > effectiveCap
    };
  }

  function effectiveCaps(playerLevel, disciple, data) {
    return {
      battle: capSnapshot(
        battlePlayerCap(playerLevel, data),
        battleItemCap(disciple.battle.slots, data),
        disciple.battle.currentLevel
      ),
      pouch: capSnapshot(
        pouchPlayerCap(playerLevel, data),
        pouchItemCap(disciple.pouch.slots, data),
        disciple.pouch.currentLevel
      )
    };
  }

  function costBetween(levels, currentLevel, targetLevel) {
    var maximum = Math.max(0, levels.length - 1);
    var current = integer(currentLevel, 0, maximum);
    var target = integer(targetLevel, current, maximum);
    var totals = { pearls: 0, shells: 0 };
    for (var level = current + 1; level <= target; level += 1) {
      totals.pearls += integer(levels[level] && levels[level].pearls);
      totals.shells += integer(levels[level] && levels[level].shells);
    }
    return totals;
  }

  function keyReferenceRows(levels) {
    var previousLevel = 0;
    return levels.filter(function (row) {
      return row && (row.level === 1 || row.level % 10 === 0) && row.level > 0;
    }).map(function (row) {
      var totals = costBetween(levels, previousLevel, row.level);
      previousLevel = row.level;
      return Object.assign({}, row, totals);
    });
  }

  function attributeDelta(kind, currentLevel, targetLevel, data) {
    var levels = kind === "pouch" ? data.pouchLevels : data.battleLevels;
    var maximum = levels.length - 1;
    var current = levels[integer(currentLevel, 0, maximum)] || levels[0];
    var target = levels[integer(targetLevel, 0, maximum)] || current;
    if (kind === "pouch") {
      return { bonusPercent: target.bonusPercent - current.bonusPercent };
    }
    return {
      attack: target.attack - current.attack,
      defense: target.defense - current.defense,
      health: target.health - current.health,
      pvpMitigation: target.pvpMitigation - current.pvpMitigation
    };
  }

  function selectionItem(disciple, caps, kind, targetLevel, enabled, data) {
    var progress = disciple[kind];
    var snapshot = caps[kind];
    if (!enabled) return null;
    var target = integer(targetLevel, progress.currentLevel, 90);
    var errors = [];
    if (!snapshot.unlocked) errors.push("玩家等级未达到46级");
    if (snapshot.overCap) errors.push("当前等级超过实际等级上限");
    if (target < progress.currentLevel) errors.push("目标等级不能低于当前等级");
    if (snapshot.effectiveCap !== null && target > snapshot.effectiveCap) errors.push("目标等级超过实际等级上限");
    return {
      discipleId: disciple.id,
      discipleName: disciple.name,
      kind: kind,
      currentLevel: progress.currentLevel,
      targetLevel: target,
      effectiveCap: snapshot.effectiveCap,
      valid: errors.length === 0,
      errors: errors,
      required: errors.length ? { pearls: 0, shells: 0 } : costBetween(
        kind === "battle" ? data.battleLevels : data.pouchLevels,
        progress.currentLevel,
        target
      ),
      targetDelta: errors.length ? attributeDelta(kind, progress.currentLevel, progress.currentLevel, data)
        : attributeDelta(kind, progress.currentLevel, target, data)
    };
  }

  function buildPlanItems(selected, account, data) {
    var items = [];
    (Array.isArray(selected) ? selected : []).forEach(function (selection) {
      if (!selection || !selection.disciple) return;
      var disciple = normalizeDisciple(selection.disciple, data);
      var caps = effectiveCaps(account.playerLevel, disciple, data);
      var priority = selection.systemPriority === "pouch" ? "pouch"
        : selection.systemPriority === "battle" ? "battle" : account.systemPriority;
      var candidates = {
        battle: selectionItem(
          disciple,
          caps,
          "battle",
          selection.battleTarget === undefined ? disciple.battle.targetLevel : selection.battleTarget,
          selection.battleEnabled !== false,
          data
        ),
        pouch: selectionItem(
          disciple,
          caps,
          "pouch",
          selection.pouchTarget === undefined ? disciple.pouch.targetLevel : selection.pouchTarget,
          selection.pouchEnabled !== false,
          data
        )
      };
      [priority, priority === "battle" ? "pouch" : "battle"].forEach(function (kind) {
        if (candidates[kind]) items.push(candidates[kind]);
      });
    });
    return items;
  }

  function allocateInventory(items, inventory, data) {
    var remaining = {
      pearls: integer(inventory && inventory.pearls),
      shells: integer(inventory && inventory.shells)
    };
    var allocations = items.map(function (item) {
      var levels = item.kind === "battle" ? data.battleLevels : data.pouchLevels;
      var reachableLevel = item.currentLevel;
      var allocated = { pearls: 0, shells: 0 };
      var shortageAt = null;
      if (item.valid) {
        for (var level = item.currentLevel + 1; level <= item.targetLevel; level += 1) {
          var row = levels[level];
          if (remaining.pearls < row.pearls || remaining.shells < row.shells) {
            shortageAt = level;
            break;
          }
          remaining.pearls -= row.pearls;
          remaining.shells -= row.shells;
          allocated.pearls += row.pearls;
          allocated.shells += row.shells;
          reachableLevel = level;
        }
      }
      return Object.assign({}, item, {
        reachableLevel: reachableLevel,
        allocated: allocated,
        shortageAt: shortageAt,
        reachableDelta: attributeDelta(item.kind, item.currentLevel, reachableLevel, data)
      });
    });
    return { allocations: allocations, remaining: remaining };
  }

  function purchaseFor(shortage, settings) {
    var packSize = Math.max(1, integer(settings && settings.packSize, 1));
    var packPrice = integer(settings && settings.packPrice);
    var missing = integer(shortage);
    var packs = Math.ceil(missing / packSize);
    return {
      shortage: missing,
      packSize: packSize,
      packPrice: packPrice,
      packs: packs,
      bought: packs * packSize,
      remaining: packs * packSize - missing,
      price: packs * packPrice
    };
  }

  function fullTargetSummary(items, inventory, purchaseSettings) {
    var totals = items.reduce(function (result, item) {
      if (!item.valid) return result;
      result.pearls += item.required.pearls;
      result.shells += item.required.shells;
      return result;
    }, { pearls: 0, shells: 0 });
    var available = {
      pearls: integer(inventory && inventory.pearls),
      shells: integer(inventory && inventory.shells)
    };
    var shortage = {
      pearls: Math.max(0, totals.pearls - available.pearls),
      shells: Math.max(0, totals.shells - available.shells)
    };
    var purchase = {
      pearls: purchaseFor(shortage.pearls, purchaseSettings.pearls),
      shells: purchaseFor(shortage.shells, purchaseSettings.shells)
    };
    purchase.totalPrice = purchase.pearls.price + purchase.shells.price;
    return { totals: totals, available: available, shortage: shortage, purchase: purchase };
  }

  function calculatePlan(selected, rawAccount, data) {
    var account = normalizeAccount(rawAccount, data);
    var items = buildPlanItems(selected, account, data);
    var allocated = allocateInventory(items, account.inventory, data);
    return {
      valid: items.length > 0 && items.every(function (item) { return item.valid; }),
      errors: items.reduce(function (all, item) {
        return all.concat(item.errors.map(function (message) {
          return item.discipleName + "的" + (item.kind === "battle" ? "战匣" : "丹囊") + "：" + message;
        }));
      }, []),
      items: items,
      allocations: allocated.allocations,
      remaining: allocated.remaining,
      fullTarget: fullTargetSummary(items, account.inventory, account.purchase)
    };
  }

  return {
    integer: integer,
    battlePlayerCap: battlePlayerCap,
    pouchPlayerCap: pouchPlayerCap,
    battleItemCap: battleItemCap,
    pouchItemCap: pouchItemCap,
    normalizeDisciple: normalizeDisciple,
    normalizeAccount: normalizeAccount,
    effectiveCaps: effectiveCaps,
    costBetween: costBetween,
    keyReferenceRows: keyReferenceRows,
    attributeDelta: attributeDelta,
    buildPlanItems: buildPlanItems,
    allocateInventory: allocateInventory,
    fullTargetSummary: fullTargetSummary,
    calculatePlan: calculatePlan
  };
});
