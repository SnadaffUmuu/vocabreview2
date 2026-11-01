/*
   Utils: shared helpers. No DOM-specific app logic here; only small pure
   utilities used across core, domain, and components.
*/
const Utils = {

  // Cache a component's selector map into component.dom once at startup.
  // Keys ending in 'sss' are cached with querySelectorAll, others with
  // querySelector. Renderers use this.dom, never querySelector directly.
  cacheComponentDom(component) {
    component.dom = {};
    Object.keys(component.selectors).forEach(alias => {
      const selector = component.selectors[alias];
      if(alias.endsWith('sss')) {
        component.dom[alias] = document.querySelectorAll(selector);
      } else {
        component.dom[alias] = document.querySelector(selector);
      }
    });
  },

  // Escape user-provided text before inserting into HTML strings.
  escapeHtml(text) {
    if(text == null) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  // Makes a text safe to be a literal part of a RegExp.
  escapeRegExp(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  },

  // Stable 53-bit string hash (cyrb53). Used only for duplicate detection
  // when adding an entry to a custom collection, not for IDs.
  hash(str) {
    let h1 = 0xdeadbeef ^ 0, h2 = 0x41c6ce57 ^ 0;
    for(let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  },

  countCharOccurrencesInString(str, ch) {
    let count = 0;
    for(const c of str) {
      if(c === ch) count++;
    }
    return count;
  },

  isAndroid() {
    return navigator.userAgent.toLowerCase().indexOf('android') > -1;
  },

  isTouchDevice() {
    return window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  },

  speak(text) {
    if(!text || typeof speechSynthesis === 'undefined'
      || typeof SpeechSynthesisUtterance === 'undefined') return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = this.isAndroid() ? 'ja_JP' : 'ja-JP';
    speechSynthesis.speak(utterance);
  },

  // Stops current and queued speech (a stuck queue is a known Android quirk).
  cancelSpeech() {
    if(typeof speechSynthesis === 'undefined') return;
    speechSynthesis.cancel();
  },

  // YYYY-MM-DD-HHMMSS in local time; used in file names.
  timestamp(date) {
    const pad = n => String(n).padStart(2, '0');
    const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
    return `${day}-${time}`;
  },

  setSelectOption(select, value) {
    const options = Array.from(select.querySelectorAll('option'));
    options.forEach(o => o.removeAttribute('selected'));
    const matched = options.find(o => o.value == value);
    if(matched) {
      matched.setAttribute('selected', true);
    }
  },

  shuffle(array) {
    const copy = array.slice();
    for(let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = copy[i];
      copy[i] = copy[j];
      copy[j] = temp;
    }
    return copy;
  },
};
