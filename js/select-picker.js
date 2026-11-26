(function () {
  'use strict';

  // A native select remains the source of truth for labels, focus, form
  // submission and event handlers. Only the long, single-select popup changes.
  var MAX_OPTIONS = 10;
  var active = null;

  function longSelect(target) {
    var select = target.closest && target.closest('select');
    return select && !select.matches(':disabled, [multiple], [aria-hidden="true"]') &&
      select.size <= 1 && select.options.length > MAX_OPTIONS ? select : null;
  }

  function optionDisabled(option) {
    return option.disabled || option.parentElement.tagName === 'OPTGROUP' && option.parentElement.disabled;
  }

  function focus(node) {
    if (node.isConnected) node.focus({ preventScroll: true });
  }

  function restoreAttribute(node, name, value) {
    if (value === null) node.removeAttribute(name);
    else node.setAttribute(name, value);
  }

  function close(restoreFocus) {
    if (!active) return;
    var state = active;
    active = null;
    state.observer.disconnect();
    if (state.popup.hidePopover && state.popup.matches(':popover-open')) state.popup.hidePopover();
    state.popup.remove();
    restoreAttribute(state.select, 'aria-expanded', state.expanded);
    restoreAttribute(state.select, 'aria-controls', state.controls);
    if (restoreFocus) focus(state.select);
  }

  function labelList(list, select) {
    var labelledBy = select.getAttribute('aria-labelledby');
    var name = select.getAttribute('aria-label');
    if (labelledBy) list.setAttribute('aria-labelledby', labelledBy);
    else {
      if (!name && select.labels) name = Array.from(select.labels, function (label) {
        var copy = label.cloneNode(true);
        copy.querySelectorAll('select, button').forEach(function (node) { node.remove(); });
        return copy.textContent.trim();
      }).filter(Boolean).join(' ');
      list.setAttribute('aria-label', name || '可选项');
    }
  }

  function place() {
    if (!active) return;
    var popup = active.popup;
    var trigger = active.select.getBoundingClientRect();
    var visual = window.visualViewport;
    var left = visual ? visual.offsetLeft : 0, top = visual ? visual.offsetTop : 0;
    var width = visual ? visual.width : document.documentElement.clientWidth;
    var height = visual ? visual.height : document.documentElement.clientHeight;
    if (!trigger.width || !trigger.height || trigger.bottom <= top || trigger.top >= top + height) {
      close(false);
      return;
    }
    var margin = 6, gap = 4;
    var popupWidth = Math.min(Math.max(trigger.width, 184), Math.max(1, width - margin * 2));
    popup.style.width = popupWidth + 'px';
    popup.style.left = Math.max(left + margin, Math.min(trigger.left, left + width - margin - popupWidth)) + 'px';
    var below = Math.max(0, top + height - margin - trigger.bottom - gap);
    var above = Math.max(0, trigger.top - gap - top - margin);
    // The fixed row height limits a full viewport to ten choices. Reduce
    // further when the browser/screen keyboard leaves less vertical room.
    var rowHeight = parseFloat(getComputedStyle(popup).getPropertyValue('--qin-select-row'));
    var maxHeight = rowHeight * MAX_OPTIONS + 2;
    var flip = below < maxHeight && above > below;
    var available = flip ? above : below;
    popup.style.maxHeight = Math.max(0, Math.min(available, maxHeight)) + 'px';
    popup.style.top = (flip ? trigger.top - gap - popup.offsetHeight : trigger.bottom + gap) + 'px';
  }

  function mark(index, scroll) {
    if (!active || index < 0 || !active.rows[index] || !active.enabled.includes(index)) return;
    var prior = active.rows[active.index];
    if (prior) prior.classList.remove('is-active');
    active.index = index;
    var row = active.rows[index];
    row.classList.add('is-active');
    active.popup.setAttribute('aria-activedescendant', row.id);
    if (scroll) {
      var relative = row.offsetTop - active.popup.scrollTop;
      if (relative < 0) active.popup.scrollTop += relative;
      else if (relative + row.offsetHeight > active.popup.clientHeight) active.popup.scrollTop += relative + row.offsetHeight - active.popup.clientHeight;
    }
  }

  function choose(index) {
    if (!active || !active.enabled.includes(index)) return;
    var select = active.select, option = active.options[index];
    if (!select.isConnected || select.matches(':disabled') || select.options[index] !== option || optionDisabled(option)) {
      close(false);
      return;
    }
    var changed = select.selectedIndex !== index;
    select.selectedIndex = index;
    close(true);
    if (changed) {
      select.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function open(select) {
    if (active && active.select === select) { close(true); return; }
    close(false);
    var popup = document.createElement('div');
    popup.id = 'qin-select-options';
    popup.className = 'qin-select-popover';
    if (select.closest('#formation-max-reference')) popup.classList.add('formation-max-popover');
    popup.tabIndex = -1;
    popup.setAttribute('role', 'listbox');
    labelList(popup, select);
    var options = Array.from(select.options), rows = [], enabled = [], group;
    options.forEach(function (option, index) {
      if (option.hidden || option.parentElement.hidden) return;
      if (option.parentElement !== group && option.parentElement.tagName === 'OPTGROUP') {
        group = option.parentElement;
        var title = document.createElement('div');
        title.className = 'qin-select-group';
        title.textContent = group.label;
        title.setAttribute('aria-hidden', 'true');
        popup.append(title);
      }
      var row = document.createElement('div');
      row.id = popup.id + '-' + index;
      row.className = 'qin-select-option';
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(index === select.selectedIndex));
      if (optionDisabled(option)) row.setAttribute('aria-disabled', 'true');
      else enabled.push(index);
      row.dataset.qinOption = index;
      if (option.parentElement.tagName === 'OPTGROUP') row.dataset.qinGroup = option.parentElement.label;
      row.textContent = option.label;
      row.title = option.label;
      rows[index] = row;
      popup.append(row);
    });
    var host = select.closest('dialog[open]') || document.body;
    if (typeof popup.showPopover === 'function') popup.setAttribute('popover', 'manual');
    host.append(popup);
    if (popup.hasAttribute('popover')) popup.showPopover();
    var observer = new MutationObserver(function () {
      if (!select.isConnected || select.matches(':disabled') || select.options.length !== options.length ||
          options.some(function (option, index) {
            var row = rows[index];
            var hidden = option.hidden || option.parentElement.hidden;
            return select.options[index] !== option || Boolean(row) === hidden || (row && (row.textContent !== option.label ||
              (row.getAttribute('aria-disabled') === 'true') !== optionDisabled(option) ||
              option.parentElement.tagName === 'OPTGROUP' && option.parentElement.label !== row.dataset.qinGroup));
          })) close(false);
      else if (!select.getClientRects().length) close(false);
    });
    active = { select: select, popup: popup, rows: rows, options: options, enabled: enabled,
      observer: observer, index: -1, letters: '', typedAt: 0,
      expanded: select.getAttribute('aria-expanded'), controls: select.getAttribute('aria-controls') };
    select.setAttribute('aria-expanded', 'true');
    select.setAttribute('aria-controls', popup.id);
    // Follow replacement of either the control or its options while open.
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled', 'hidden', 'label'] });
    place();
    if (!active) return;
    mark(enabled.includes(select.selectedIndex) ? select.selectedIndex : enabled[0], true);
    focus(popup);
  }

  // Mouse default on mousedown can open a platform menu before click.
  document.addEventListener('mousedown', function (event) {
    if (event.button === 0 && longSelect(event.target)) event.preventDefault();
  }, true);

  document.addEventListener('pointerdown', function (event) {
    if (active && !active.popup.contains(event.target) && !active.select.contains(event.target)) close(false);
  }, true);

  document.addEventListener('click', function (event) {
    if (event.button !== 0) return;
    if (active && active.popup.contains(event.target)) {
      var option = event.target.closest('[data-qin-option]');
      if (option) choose(Number(option.dataset.qinOption));
      return;
    }
    var select = longSelect(event.target);
    if (!select) return;
    event.preventDefault();
    open(select);
  }, true);

  document.addEventListener('keydown', function (event) {
    if (event.isComposing) return;
    var key = event.key;
    if (!active || event.target !== active.popup) {
      var select = longSelect(event.target);
      if (select && (key === ' ' || key === 'Enter' || key === 'F4' || event.altKey && (key === 'ArrowDown' || key === 'ArrowUp'))) {
        event.preventDefault();
        open(select);
      }
      return;
    }
    if (key === 'Tab') { close(true); return; }
    if (key === 'Escape' || key === 'F4' || event.altKey && key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (key === ' ' || key === 'Enter') { event.preventDefault(); choose(active.index); return; }
    var enabled = active.enabled, current = enabled.indexOf(active.index);
    if (key === 'Home' || key === 'End' || key === 'ArrowDown' || key === 'ArrowUp' || key === 'PageDown' || key === 'PageUp') {
      event.preventDefault();
      var movement = { ArrowDown: 1, ArrowUp: -1, PageDown: MAX_OPTIONS - 1, PageUp: 1 - MAX_OPTIONS };
      var next = key === 'Home' ? 0 : key === 'End' ? enabled.length - 1 : Math.max(0, Math.min(enabled.length - 1, current + movement[key]));
      mark(enabled[next], true);
      return;
    }
    if (key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      var letter = key.toLocaleLowerCase(), now = Date.now();
      active.letters = now - active.typedAt > 650 ? letter : active.letters + letter;
      active.typedAt = now;
      var ordered = enabled.slice(current + 1).concat(enabled.slice(0, current + 1));
      function matching(prefix) {
        return ordered.find(function (index) { return active.options[index].label.trim().toLocaleLowerCase().startsWith(prefix); });
      }
      var found = matching(active.letters);
      if (found === undefined && active.letters !== letter) { active.letters = letter; found = matching(letter); }
      if (found !== undefined) mark(found, true);
    }
  }, true);

  document.addEventListener('focusin', function (event) {
    if (active && !active.popup.contains(event.target) && active.select !== event.target) close(false);
  }, true);
  document.addEventListener('change', function (event) {
    if (active && active.select === event.target) close(false);
  }, true);
  window.addEventListener('resize', place, { passive: true });
  document.addEventListener('scroll', function (event) {
    if (active && event.target !== active.popup) place();
  }, { capture: true, passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', place, { passive: true });
    window.visualViewport.addEventListener('scroll', place, { passive: true });
  }
  document.addEventListener('qinshi:partitionchange', function () { close(false); });
  window.addEventListener('pagehide', function () { close(false); });
})();
