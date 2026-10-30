/*
   CardUI: markup of one compact card (an entry shown as a chip), shared by the
   Views that put cards on boards. It is a pure template factory: no state, no
   events, no DOM access. The owner View builds the card view model, handles the
   clicks and decides where the card is drawn; sizes and colors of the zones are
   set by the View's own CSS through variables (see card.css).
  
   Interactive parts are leaf elements, because Events.js matches the exact
   event target.
  
   card = {
     id, tag, reviewLevel,
     reversed,          // show the "reversed entry" mark
     count,             // number of sides
     side,              // the current side { index, role, text, speakable, compact } or null
     reading,           // text of the reading line or null
     info, infoOpen,    // entry info text or null, and whether it is shown
     draggable,         // gets data-drag-id for DragDrop
     expanded, top,     // the open card with actions; top is its viewport offset
     lineExpanded,      // the current side is not clamped
     covered, size,     // the place of a card that is shown expanded elsewhere, and
                        // its frozen size { width, height } or null. The place must not
                        // follow the content of the card, or its neighbours would move
                        // every time the open card changes its side.
   }
*/
const CardUI = {
  name: 'CardUI',

  // Numbers only, so nothing has to be escaped.
  styleOf(card) {
    if(card.expanded) return `top:${Number(card.top) || 0}px`;
    const parts = [];
    if(card.place) {
      parts.push(
        `left:${Number(card.place.x) || 0}px`,
        `top:${Number(card.place.y) || 0}px`,
        `z-index:${Number(card.place.z) || 0}`,
      );
    }
    if(card.covered && card.size) {
      parts.push(
        `width:${Number(card.size.width) || 0}px`,
        `height:${Number(card.size.height) || 0}px`,
      );
    }
    return parts.join(';');
  },

  template(card) {
    const id = Utils.escapeHtml(card.id);
    const style = this.styleOf(card);
    return `
      <div class="entryCard
        ${card.expanded ? 'expanded' : ''}
        ${card.lineExpanded ? 'lineExpanded' : ''}
        ${card.reversed ? 'reversedShown' : ''}
        ${card.place ? 'placed' : ''}
        ${card.covered ? 'covered' : ''}"
        data-entry-id="${id}"
        ${card.draggable ? `data-drag-id="${id}"` : ''}
        ${card.tag ? `data-tag="${Utils.escapeHtml(card.tag)}"` : ''}
        ${style ? `style="${style}"` : ''}
        >
        ${card.info ? '<div class="cardInfoMark">i</div>' : ''}
        <div class="cardCounter">${Utils.escapeHtml(card.count)}</div>
        ${card.expanded ? '' : '<div class="cardTapZone"></div>'}
        ${card.side ? this.sideTemplate(card) : ''}
        ${card.expanded ? this.actionsTemplate(card) : ''}
        ${card.expanded && card.info && card.infoOpen ? `
        <div class="cardInfo">ⓘ&nbsp;${Utils.escapeHtml(card.info)}</div>` : ''}
      </div>
      `;
  },

  sideTemplate(card) {
    const side = card.side;
    return `
      <div class="cardSide ${side.compact ? 'compact' : ''}"
        data-index="${Utils.escapeHtml(side.index)}"
        ${side.role ? `data-role="${Utils.escapeHtml(side.role)}"` : ''}
        ${side.speakable ? `data-reading="${Utils.escapeHtml(side.text)}"` : ''}
        ${card.reviewLevel && side.index === 0 ? `
        data-review-level="${Utils.escapeHtml(card.reviewLevel)}"` : ''}
        >${Utils.escapeHtml(side.text)}</div>
      `;
  },

  // Swatches of the entry tags, styled like the cards that carry the tag.
  legendTemplate(tags) {
    return `
      <div class="tagsLegend">
        ${tags.map(tag => `
        <div data-tag="${Utils.escapeHtml(tag)}"><span>${Utils.escapeHtml(tag)}</span></div>`).join('')}
      </div>
      `;
  },

  // The reading and the speak button only make sense for a speakable side.
  actionsTemplate(card) {
    const speakable = !!card.side?.speakable;
    return `
      <div class="cardActions">
        <div class="cardAction cardRemove">✖</div>
        <div class="cardAction cardLineToggle">⇕</div>
        <div class="cardAction cardRotateBack">←</div>
        ${speakable ? '<div class="cardAction cardSpeak">▶</div>' : ''}
        ${card.info ? '<div class="cardAction cardInfoToggle">ⓘ</div>' : ''}
        ${speakable && card.reading ? `
        <div class="cardAction cardReading">${Utils.escapeHtml(card.reading)}</div>` : ''}
      </div>
      `;
  },
};

Components.push(CardUI);
