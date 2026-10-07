// Ein kleiner Baum mit genau der Schnittstelle, die readProcess() braucht:
// documentElement, localName, nodeName, getAttribute(), children,
// parentElement, textContent, getElementsByTagName(). Die Adapter für
// Parser ohne DOM (saxen, txml, fast-xml-parser) bauen ihn aus deren Bäumen.

export class Element {
  constructor(name, attrs = {}, parent = null){
    this.nodeName = name;
    this.localName = name.replace(/^.*:/, '');
    this.prefix = name.includes(':') ? name.slice(0, name.indexOf(':')) : null;
    this.attrs = attrs;
    this.children = [];
    this.texts = []; // Textstücke in Reihenfolge, mit Platzhaltern für Kinder: { text } oder { el }
    this.parentElement = parent;
    if (parent) parent.children.push(parent.texts.push({ el: this }) && this);
  }
  getAttribute(name){ return Object.hasOwn(this.attrs, name) ? this.attrs[name] : null; }
  hasAttribute(name){ return Object.hasOwn(this.attrs, name); }
  addText(t){ if (t) this.texts.push({ text: t }); }
  get textContent(){ return this.texts.map(p => p.text !== undefined ? p.text : p.el.textContent).join(''); }
  get childNodes(){ return this.texts.map(p => p.el || { nodeType: 3, textContent: p.text }); }
}

export class Document {
  constructor(){ this.documentElement = null; this.nodeName = '#document'; }
  getElementsByTagName(name){
    const out = [];
    const walk = el => { if (!el) return; if (el.nodeName === name || el.localName === name) out.push(el); for (const k of el.children) walk(k); };
    walk(this.documentElement);
    return out;
  }
}
