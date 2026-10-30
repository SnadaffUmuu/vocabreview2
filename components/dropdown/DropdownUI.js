/*
   DropdownUI: replacement for system selects (ugly on Android) and a button
   with a list of actions. It is a markup factory plus one shared click
   behaviour: a view embeds DropdownUI.select()/burger() output in its own
   template and reacts to a choice via DropdownUI.on(id, handler).
  
   The component keeps no value: the owner (domain/view state) is the source
   of truth and pushes it back with setValue(). Disabled items are placeholders
   for actions that do not exist yet; they never produce a selection.
*/
const DropdownUI = {
  name: 'DropdownUI',

  events: {
    click: { '##': 'onClick' },
  },

  // items: [{ value, label, disabled }]
  itemsHtml(items) {
    return items.map(item => {
      const value = Utils.escapeHtml(item.value);
      const label = Utils.escapeHtml(item.label ?? item.value);
      const disabled = item.disabled ? ' disabled' : '';
      return `<li class="dropdown-item${disabled}" data-value="${value}">${label}</li>`;
    }).join('');
  },

  menuHtml(items, menuCls) {
    return `
      <div class="dropdown-menu hidden ${Utils.escapeHtml(menuCls || '')}">
        <ul class="dropdown-list">${this.itemsHtml(items)}</ul>
      </div>`;
  },

  // Button with a list of commands; selecting an item reports its value.
  burger({ id, items = [], cls = '', menuCls = '' }) {
    return `
      <span class="dd" id="${Utils.escapeHtml(id)}">
        <button class="button burger-button dd-trigger ${Utils.escapeHtml(cls)}" type="button" aria-label="Menu"><span></span><span></span><span></span></button>${this.menuHtml(items, menuCls)}
      </span>`;
  },

  // Button labelled with the chosen item; the chosen item is highlighted.
  // The label is filled by setValue() once the markup is in the document.
  select({ id, items = [], placeholder = '', cls = '', menuCls = '' }) {
    return `
      <span class="dd" id="${Utils.escapeHtml(id)}" data-placeholder="${Utils.escapeHtml(placeholder)}">
        <div class="button select-button dd-trigger ${Utils.escapeHtml(cls)}" role="button">${Utils.escapeHtml(placeholder)}</div>${this.menuHtml(items, menuCls)}
      </span>`;
  },

  // Subscribe to a choice made in the dropdown with the given id.
  on(id, handler) {
    Bus.on(Bus.events.dropdownSelected, payload => {
      if(payload.id === id) handler(payload.value);
    });
  },

  // Show the value as chosen (label + highlight). Unknown/empty value shows
  // the placeholder.
  setValue(id, value) {
    const dd = document.getElementById(id);
    if(!dd) return;
    let label = dd.dataset.placeholder || '';
    dd.querySelectorAll('.dropdown-item').forEach(li => {
      const chosen = value != null && li.dataset.value === String(value);
      li.classList.toggle('selected', chosen);
      if(chosen) label = li.textContent;
    });
    const trigger = dd.querySelector('.select-button');
    if(trigger) trigger.textContent = label;
  },

  // ---- behaviour ------------------------------------------------------------------

  onClick(target) {
    const trigger = target.closest('.dd-trigger');
    if(trigger) {
      const dd = trigger.closest('.dd');
      const wasOpen = this.isOpen(dd);
      this.closeAll();
      if(!wasOpen) this.open(dd);
      return;
    }
    const item = target.closest('.dropdown-item');
    if(item) {
      if(item.classList.contains('disabled')) return;
      const dd = item.closest('.dd');
      this.closeAll();
      Bus.emit(Bus.events.dropdownSelected, { id: dd.id, value: item.dataset.value });
      return;
    }
    if(target.closest('.dropdown-menu')) return;
    this.closeAll();
  },

  isOpen(dd) {
    return !dd.querySelector('.dropdown-menu').classList.contains('hidden');
  },

  open(dd) {
    const menu = dd.querySelector('.dropdown-menu');
    const trigger = dd.querySelector('.dd-trigger');
    this.position(menu, trigger);
    menu.classList.remove('hidden');
    trigger.classList.add('is-active');
    menu.querySelector('.dropdown-item.selected')?.scrollIntoView(true);
  },

  closeAll() {
    document.querySelectorAll('.dd .dropdown-menu:not(.hidden)').forEach(menu => {
      menu.classList.add('hidden');
      menu.parentElement.querySelector('.dd-trigger').classList.remove('is-active');
    });
  },

  // Under the trigger; left-aligned if it fits, otherwise right-aligned, and
  // narrowed when neither side has enough room.
  position(menu, trigger) {
    const rect = trigger.getBoundingClientRect();
    menu.style.width = '';
    menu.classList.remove('hidden');
    const menuWidth = menu.offsetWidth;
    // offsetParent is null while the menu is hidden, so read it now.
    const offsetParent = menu.offsetParent;
    menu.classList.add('hidden');

    const spaceRight = window.innerWidth - rect.left;
    const spaceLeft = rect.right;
    let left = rect.left;
    if(menuWidth > spaceRight) {
      if(spaceLeft > spaceRight) {
        left = Math.max(0, rect.right - menuWidth);
        if(menuWidth > spaceLeft) menu.style.width = `${spaceLeft}px`;
      } else {
        menu.style.width = `${spaceRight}px`;
      }
    }

    // Absolute menus are placed relative to their positioned ancestor.
    let offsetLeft = 0;
    let offsetTop = 0;
    if(getComputedStyle(menu).position === 'absolute' && offsetParent) {
      const parentRect = offsetParent.getBoundingClientRect();
      offsetLeft = parentRect.left + offsetParent.clientLeft;
      offsetTop = parentRect.top + offsetParent.clientTop;
    }
    menu.style.left = `${left - offsetLeft}px`;
    menu.style.top = `${rect.bottom - offsetTop}px`;
  },
};

Components.push(DropdownUI);
