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

  return {
    integer: integer,
    battlePlayerCap: battlePlayerCap,
    pouchPlayerCap: pouchPlayerCap,
    battleItemCap: battleItemCap,
    pouchItemCap: pouchItemCap,
    normalizeDisciple: normalizeDisciple,
    normalizeAccount: normalizeAccount,
    effectiveCaps: effectiveCaps
  };
});
