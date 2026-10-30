/*
   DragDrop: one gesture engine for dragging cards between zones. It only works
   out the target; the owner of the cards changes its state in response to
   Bus.events.dragDropped and re-renders. The engine never mutates view state.
  
   Markup contract (written by the View's template):
     [data-drag-scope="<name>"]  root of one View; a drag never leaves its scope
     [data-drop-zone="<name>"]   a place for cards; cards must be its direct children
     [data-drop-mode="free"]     on a zone: cards lie where they are dropped (Panel)
                                 instead of being inserted into the flow (Board)
     [data-drag-id="<id>"]       a draggable card
     [data-drag-scroll]          a box that scrolls while a card is held near its edge
   Event payload: { scope, id, zone, beforeId, x, y }. beforeId is the card of
   the zone the dropped one goes in front of (null = to the end); a free zone has
   no order, so it is always null there. x, y is the top-left of the dropped card
   inside the zone (its padding box, scroll included), kept within the zone so
   that a card cannot be dropped out of reach. Flow zones ignore it.
  
   Constraints and reasons:
     - Touch starts with a long press so that scrolling and taps keep working.
       A mouse starts after a small move, so that clicks on a card still work.
     - Native HTML5 drag is not used: on Android it competes with touch events.
     - Raw listeners instead of Events.js: a gesture needs move/end events for
       its whole duration and a non-passive touchmove to stop page scrolling.
       The touchmove listener is added in touchstart, before any scrolling can
       begin, otherwise the browser may ignore preventDefault().
     - The original card stays in the DOM (hidden) until the drop; a clone
       follows the pointer and a placeholder shows the insertion point. These
       are ephemeral drag visuals, the allowed direct-DOM exception.
     - On a successful drop the original card is put where the placeholder was
       (in a free zone: at the dropped position) before the visuals are
       removed. The owner learns about the drop later (Bus is asynchronous) and
       re-renders; without this the card would show at its old place for a few
       frames. The owner's render() replaces it.
     - One drag at a time. Timings and margins are tuning values, not contracts.
*/
const DragDrop = {
  name: 'DragDrop',

  scopeSelector: '[data-drag-scope]',
  cardSelector: '[data-drag-id]',
  zoneSelector: '[data-drop-zone]',
  scrollSelector: '[data-drag-scroll]',
  freeMode: 'free',

  longPressMs: 250,
  moveTolerance: 8,
  scrollEdge: 50,
  scrollStep: 8,

  gesture: null,

  init() {
    document.addEventListener('touchstart', e => this.onTouchStart(e), { passive: true });
    document.addEventListener('mousedown', e => this.onMouseDown(e));
    // The long press that starts a drag must not open the browser context menu.
    document.addEventListener('contextmenu', e => {
      if(this.gesture || e.target.closest?.(this.cardSelector)) e.preventDefault();
    });
  },

  // ---- pure geometry (checked in Node) ---------------------------------------------

  /*
     Index of the card the pointer is in front of, for rects of cards laid out
     left to right in wrapping rows. rects.length means "after the last card".
     The next row of a wrapping layout starts below the lowest card of the
     previous one, so a card whose top is above the row bottom is in that row.
  */
  insertionIndex(rects, x, y) {
    const rows = [];
    rects.forEach((rect, i) => {
      const row = rows[rows.length - 1];
      if(row && rect.top < row.bottom) {
        row.end = i + 1;
        row.top = Math.min(row.top, rect.top);
        row.bottom = Math.max(row.bottom, rect.bottom);
      } else {
        rows.push({ start: i, end: i + 1, top: rect.top, bottom: rect.bottom });
      }
    });
    for(const row of rows) {
      if(y >= row.bottom) continue;
      if(y < row.top) return row.start;
      for(let i = row.start; i < row.end; i++) {
        if(x < (rects[i].left + rects[i].right) / 2) return i;
      }
      return row.end;
    }
    return rects.length;
  },

  /*
     Position of a card's edge inside a zone of the given size, so that the whole
     card stays inside. A card larger than the zone sticks to its start.
  */
  clampPosition(pos, cardSize, zoneSize) {
    return Math.round(Math.max(0, Math.min(pos, zoneSize - cardSize)));
  },

  // -step / 0 / +step: scroll direction for a pointer position along one axis.
  scrollDelta(pos, start, end) {
    if(pos < start + this.scrollEdge) return -this.scrollStep;
    if(pos > end - this.scrollEdge) return this.scrollStep;
    return 0;
  },

  // ---- gesture start ---------------------------------------------------------------

  onTouchStart(e) {
    if(this.gesture || e.touches.length !== 1) return;
    const card = this.cardAt(e.target);
    if(!card) return;
    const touch = e.touches[0];
    this.begin(card, touch.clientX, touch.clientY, 'touch');
  },

  onMouseDown(e) {
    if(this.gesture || e.button !== 0) return;
    const card = this.cardAt(e.target);
    if(!card) return;
    this.begin(card, e.clientX, e.clientY, 'mouse');
  },

  cardAt(target) {
    const card = target.closest?.(this.cardSelector);
    return card && card.closest(this.scopeSelector) ? card : null;
  },

  begin(card, x, y, kind) {
    const gesture = {
      kind,
      card,
      scope: card.closest(this.scopeSelector),
      startX: x,
      startY: y,
      x,
      y,
      dragging: false,
      timer: null,
      raf: null,
      clone: null,
      placeholder: null,
      zone: null,
      beforeId: null,
      offsetX: 0,
      offsetY: 0,
      width: 0,
      height: 0,
      listeners: [],
    };
    this.gesture = gesture;

    const listen = (type, handler, options) => {
      document.addEventListener(type, handler, options);
      gesture.listeners.push([type, handler, options]);
    };
    if(kind === 'touch') {
      listen('touchmove', e => this.onMove(e), { passive: false });
      listen('touchend', e => this.finish(e, true));
      listen('touchcancel', e => this.finish(e, false));
      gesture.timer = setTimeout(() => this.startDrag(), this.longPressMs);
    } else {
      listen('mousemove', e => this.onMove(e));
      listen('mouseup', e => this.finish(e, true));
    }
  },

  // ---- gesture ---------------------------------------------------------------------

  pointOf(e) {
    return e.touches?.[0] || e.changedTouches?.[0] || e;
  },

  onMove(e) {
    const g = this.gesture;
    if(!g) return;
    const point = this.pointOf(e);
    g.x = point.clientX;
    g.y = point.clientY;

    if(!g.dragging) {
      const moved = Math.hypot(g.x - g.startX, g.y - g.startY) > this.moveTolerance;
      if(!moved) return;
      // Moving before the long press ends means the user scrolls.
      if(g.kind === 'touch') {
        this.cleanup();
        return;
      }
      this.startDrag();
    }
    if(e.cancelable) e.preventDefault();
    this.updateDrag();
  },

  startDrag() {
    const g = this.gesture;
    if(!g || g.dragging) return;
    clearTimeout(g.timer);
    g.timer = null;
    g.dragging = true;

    const rect = g.card.getBoundingClientRect();
    g.offsetX = g.startX - rect.left;
    g.offsetY = g.startY - rect.top;
    g.width = rect.width;
    g.height = rect.height;

    g.clone = g.card.cloneNode(true);
    g.clone.removeAttribute('data-drag-id');
    g.clone.classList.add('dragClone');
    g.clone.style.width = `${rect.width}px`;
    // A freely placed card carries its own z-index inline; the clone must stay
    // above everything, which only the stylesheet guarantees.
    g.clone.style.removeProperty('z-index');
    // The color of a zone reaches its cards through an inherited variable; the
    // clone is outside the zone, so it takes the resolved value along.
    const cardBg = getComputedStyle(g.card).getPropertyValue('--cardBg');
    if(cardBg) g.clone.style.setProperty('--cardBg', cardBg);
    // Inside the scope, not in <body>: the View's CSS variables must reach it.
    g.scope.appendChild(g.clone);

    g.placeholder = document.createElement('div');
    g.placeholder.className = 'dragPlaceholder';
    g.placeholder.style.width = `${rect.width}px`;
    g.placeholder.style.height = `${rect.height}px`;

    g.card.classList.add('dragged');
    this.updateDrag();
    g.raf = requestAnimationFrame(() => this.autoScrollLoop());
  },

  updateDrag() {
    const g = this.gesture;
    if(!g || !g.dragging) return;
    g.clone.style.left = `${g.x - g.offsetX}px`;
    g.clone.style.top = `${g.y - g.offsetY}px`;

    g.zone = this.zoneAt(g);
    if(g.zone) {
      this.placeIndicator(g);
    } else {
      g.placeholder.remove();
      g.beforeId = null;
    }
  },

  // The clone has pointer-events: none, so the point hits what is under it.
  zoneAt(g) {
    const zone = document.elementFromPoint(g.x, g.y)?.closest(this.zoneSelector);
    return zone && zone.closest(this.scopeSelector) === g.scope ? zone : null;
  },

  isFree(zone) {
    return zone.dataset.dropMode === this.freeMode;
  },

  /*
     The placeholder is removed before measuring: cards are measured without
     it, so it cannot shift them and make the indicator jump back and forth.
     A free zone has no insertion point, so it gets no placeholder.
  */
  placeIndicator(g) {
    g.placeholder.remove();
    if(this.isFree(g.zone)) {
      g.beforeId = null;
      return;
    }
    const cards = Array.from(g.zone.querySelectorAll(this.cardSelector))
      .filter(card => card !== g.card);
    const rects = cards.map(card => card.getBoundingClientRect());
    const before = cards[this.insertionIndex(rects, g.x, g.y)] || null;
    g.beforeId = before ? before.dataset.dragId : null;
    g.zone.insertBefore(g.placeholder, before);
  },

  autoScrollLoop() {
    const g = this.gesture;
    if(!g || !g.dragging) return;
    if(this.autoScroll(g)) this.updateDrag();
    g.raf = requestAnimationFrame(() => this.autoScrollLoop());
  },

  /*
     Scrolls the innermost box under the pointer that can still scroll in the
     wanted direction. Returns true when something moved.
  */
  autoScroll(g) {
    const boxes = Array.from(g.scope.querySelectorAll(this.scrollSelector))
      .map(el => ({ el, rect: el.getBoundingClientRect() }))
      .filter(({ rect }) => g.x >= rect.left && g.x <= rect.right
        && g.y >= rect.top && g.y <= rect.bottom)
      .sort((a, b) => a.rect.width * a.rect.height - b.rect.width * b.rect.height);

    const dx = box => this.scrollDelta(g.x, box.rect.left, box.rect.right);
    const dy = box => this.scrollDelta(g.y, box.rect.top, box.rect.bottom);
    const canX = (el, d) => d < 0
      ? el.scrollLeft > 0
      : el.scrollLeft < el.scrollWidth - el.clientWidth - 1;
    const canY = (el, d) => d < 0
      ? el.scrollTop > 0
      : el.scrollTop < el.scrollHeight - el.clientHeight - 1;

    let moved = false;
    const boxX = boxes.find(box => dx(box) && canX(box.el, dx(box)));
    if(boxX) {
      boxX.el.scrollLeft += dx(boxX);
      moved = true;
    }
    const boxY = boxes.find(box => dy(box) && canY(box.el, dy(box)));
    if(boxY) {
      boxY.el.scrollTop += dy(boxY);
      moved = true;
    }
    return moved;
  },

  // ---- gesture end -----------------------------------------------------------------

  finish(e, drop) {
    const g = this.gesture;
    if(!g) return;
    if(g.dragging && drop) {
      const point = this.pointOf(e);
      if(point.clientX != null) {
        g.x = point.clientX;
        g.y = point.clientY;
      }
      g.zone = this.zoneAt(g);
    }
    const payload = g.dragging && drop && g.zone ? this.payloadOf(g) : null;
    /*
       The placeholder may be in another zone if the pointer moved since the
       last update; then there is no reliable place, and the owner's render
       decides alone.
    */
    if(payload && this.isFree(g.zone)) {
      g.zone.appendChild(g.card);
      g.card.classList.add('placed');
      g.card.style.left = `${payload.x}px`;
      g.card.style.top = `${payload.y}px`;
    } else if(payload && g.placeholder.parentNode === g.zone) {
      g.zone.insertBefore(g.card, g.placeholder);
    }
    this.cleanup();

    if(g.dragging) this.swallowNextClick();
    if(payload) Bus.emit(Bus.events.dragDropped, payload);
  },

  payloadOf(g) {
    const zone = g.zone;
    const zoneRect = zone.getBoundingClientRect();
    return {
      scope: g.scope.dataset.dragScope,
      id: g.card.dataset.dragId,
      zone: zone.dataset.dropZone,
      beforeId: g.beforeId,
      x: this.clampPosition(
        g.x - g.offsetX - zoneRect.left - zone.clientLeft + zone.scrollLeft,
        g.width,
        zone.clientWidth,
      ),
      y: this.clampPosition(
        g.y - g.offsetY - zoneRect.top - zone.clientTop + zone.scrollTop,
        g.height,
        zone.clientHeight,
      ),
    };
  },

  cleanup() {
    const g = this.gesture;
    if(!g) return;
    this.gesture = null;
    clearTimeout(g.timer);
    cancelAnimationFrame(g.raf);
    g.listeners.forEach(([type, handler, options]) =>
      document.removeEventListener(type, handler, options));
    if(g.dragging) {
      g.card.classList.remove('dragged');
      g.clone.remove();
      g.placeholder.remove();
    }
  },

  /*
     A finished drag may be followed by a click on whatever is under the
     pointer (always for a mouse, sometimes for a long touch). It must not act.
  */
  swallowNextClick() {
    const stop = e => {
      e.stopPropagation();
      e.preventDefault();
    };
    window.addEventListener('click', stop, true);
    setTimeout(() => window.removeEventListener('click', stop, true), 350);
  },
};

Components.push(DragDrop);
