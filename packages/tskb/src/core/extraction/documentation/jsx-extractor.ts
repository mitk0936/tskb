import ts from "typescript";
import type { DocPriority } from "../../../runtime/jsx.js";
import type { ExtractedRegistry } from "../registry.js";
import {
  type ConstantRefMap,
  type DocRefs,
  type DocMeta,
  REF_CATEGORY_MAP,
  buildRefLink,
  resolveNodeMeta,
  parseTypeAssertion,
  getStringAttribute,
  getCodeAttribute,
  getAdrAttributes,
  extractStepNode,
  escapeHtml,
  escapeAttr,
} from "./doc-utils.js";

/**
 * Stateful JSX tree walker. Created once per file by extractFromTsxFile.
 * Accumulates HTML, references, relations, and flows as it visits nodes.
 * Call extract() once with the default-export node.
 */
export class JsxExtractor {
  private html = "";
  private readonly refs: DocRefs = {
    modules: [],
    terms: [],
    folders: [],
    exports: [],
    files: [],
    externals: [],
  };
  private readonly docMeta: DocMeta = { explains: "", priority: "supplementary" };
  private readonly relations: { from: string; to: string; label?: string }[] = [];
  private readonly flows: {
    name: string;
    desc: string;
    priority: DocPriority;
    steps: { nodeId: string; label?: string }[];
  }[] = [];

  constructor(
    private readonly constantRefs: ConstantRefMap,
    private readonly registry?: ExtractedRegistry
  ) {}

  extract(node: ts.Node): {
    html: string;
    refs: DocRefs;
    docMeta: DocMeta;
    relations: { from: string; to: string; label?: string }[];
    flows: {
      name: string;
      desc: string;
      priority: DocPriority;
      steps: { nodeId: string; label?: string }[];
    }[];
  } {
    this.visit(node);
    return {
      html: this.html.trim(),
      refs: this.refs,
      docMeta: this.docMeta,
      relations: this.relations,
      flows: this.flows,
    };
  }

  // ── Visitor ────────────────────────────────────────────────────────────────

  private visit(node: ts.Node): void {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      this.visitElement(node);
    } else if (ts.isJsxText(node)) {
      const text = node.text.trim();
      if (text) this.html += text + " ";
    } else if (ts.isJsxExpression(node) && node.expression) {
      this.visitExpression(node.expression);
    } else {
      ts.forEachChild(node, (child) => this.visit(child));
    }
  }

  private visitChildren(node: ts.JsxElement): void {
    node.children.forEach((child) => this.visit(child));
  }

  private visitElement(node: ts.JsxElement | ts.JsxSelfClosingElement): void {
    const tagName = ts.isJsxElement(node) ? node.openingElement.tagName : node.tagName;
    if (!ts.isIdentifier(tagName)) {
      if (ts.isJsxElement(node)) this.visitChildren(node);
      return;
    }

    const name = tagName.text;
    const attrs = ts.isJsxElement(node) ? node.openingElement.attributes : node.attributes;

    if (name === "Doc") return this.handleDoc(attrs, node);
    if (name === "H1" || name === "H2" || name === "H3")
      return this.handleWrapped(name.toLowerCase() as "h1" | "h2" | "h3", node);
    if (name === "P") return this.handleWrapped("p", node);
    if (name === "List") return this.handleWrapped("ul", node);
    if (name === "Li") return this.handleWrapped("li", node);
    if (name === "Snippet") return this.handleSnippet(attrs);
    if (name === "Relation") return this.handleRelation(attrs);
    if (name === "Flow" && ts.isJsxElement(node)) return this.handleFlow(node, attrs);
    if (name === "Adr") return this.handleAdr(node, attrs);
    if (name in REF_CATEGORY_MAP) return this.handleRefTag(name, attrs);

    if (ts.isJsxElement(node)) this.visitChildren(node);
  }

  private visitExpression(expr: ts.Expression): void {
    if (ts.isStringLiteral(expr)) {
      this.html += expr.text + " ";
    } else if (ts.isNoSubstitutionTemplateLiteral(expr)) {
      this.html += `<em>${escapeHtml(expr.text)}</em> `;
    } else if (ts.isTemplateExpression(expr)) {
      let text = expr.head.text;
      for (const span of expr.templateSpans) {
        text += span.expression.getText();
        text += span.literal.text;
      }
      this.html += `<em>${escapeHtml(text)}</em> `;
    } else if (ts.isIdentifier(expr)) {
      const meta = this.constantRefs.get(expr.text);
      if (meta) {
        const link = buildRefLink(meta.category, meta.name, this.refs, this.registry);
        if (link) this.html += link;
      } else {
        this.html += `{${expr.text}} `;
      }
    } else if (ts.isAsExpression(expr)) {
      const meta = parseTypeAssertion(expr);
      if (meta) {
        const link = buildRefLink(meta.category, meta.name, this.refs, this.registry);
        if (link) this.html += link;
      }
    }
  }

  // ── Component handlers ─────────────────────────────────────────────────────

  private handleDoc(attrs: ts.JsxAttributes, node: ts.JsxElement | ts.JsxSelfClosingElement): void {
    const explains = getStringAttribute(attrs, "explains");
    if (explains) this.docMeta.explains = explains;
    const priority = getStringAttribute(attrs, "priority");
    if (priority === "essential" || priority === "constraint" || priority === "supplementary") {
      this.docMeta.priority = priority;
    }
    if (ts.isJsxElement(node)) this.visitChildren(node);
  }

  private handleWrapped(
    tag: "h1" | "h2" | "h3" | "p" | "ul" | "li",
    node: ts.JsxElement | ts.JsxSelfClosingElement
  ): void {
    this.html += `<${tag}>`;
    if (ts.isJsxElement(node)) this.visitChildren(node);
    this.html += `</${tag}>`;
  }

  private handleSnippet(attrs: ts.JsxAttributes): void {
    const code = getCodeAttribute(attrs);
    if (code !== undefined) {
      this.html += `<pre class="tskb-snippet"><code>${escapeHtml(code)}</code></pre>`;
    }
  }

  private handleRelation(attrs: ts.JsxAttributes): void {
    let fromVal: string | undefined;
    let toVal: string | undefined;
    let labelVal: string | undefined;

    for (const prop of attrs.properties) {
      if (!ts.isJsxAttribute(prop) || !ts.isIdentifier(prop.name) || !prop.initializer) continue;
      const key = prop.name.text;
      const val = ts.isStringLiteral(prop.initializer)
        ? prop.initializer.text
        : ts.isJsxExpression(prop.initializer) && prop.initializer.expression
          ? this.resolveExprToString(prop.initializer.expression)
          : undefined;
      if (key === "from") fromVal = val;
      else if (key === "to") toVal = val;
      else if (key === "label") labelVal = val;
    }

    if (typeof fromVal === "string") fromVal = fromVal.replace(/^['"]|['"]$/g, "").trim();
    if (typeof toVal === "string") toVal = toVal.replace(/^['"]|['"]$/g, "").trim();
    if (typeof labelVal === "string") labelVal = labelVal.trim();

    if (fromVal && toVal) {
      this.relations.push(
        labelVal ? { from: fromVal, to: toVal, label: labelVal } : { from: fromVal, to: toVal }
      );
    }

    const labelAttr = labelVal ? ` data-label="${escapeAttr(labelVal)}"` : "";
    this.html += `<span class="tskb-relation" data-from="${escapeAttr(fromVal ?? "")}" data-to="${escapeAttr(toVal ?? "")}"${labelAttr}></span>`;
  }

  private handleFlow(node: ts.JsxElement, attrs: ts.JsxAttributes): void {
    const flowName = getStringAttribute(attrs, "name");
    const flowDesc = getStringAttribute(attrs, "desc");
    const rawPriority = getStringAttribute(attrs, "priority");
    const priority: DocPriority =
      rawPriority === "essential" || rawPriority === "constraint" ? rawPriority : "supplementary";

    if (!flowName || !flowDesc) return;

    const steps: { nodeId: string; label?: string }[] = [];
    for (const child of node.children) {
      if (ts.isJsxText(child)) {
        if (child.text.trim()) {
          throw new Error(
            `<Flow name="${flowName}"> contains text content. Flows may only contain <Step> elements.`
          );
        }
        continue;
      }

      const isStepElement =
        (ts.isJsxSelfClosingElement(child) &&
          ts.isIdentifier(child.tagName) &&
          child.tagName.text === "Step") ||
        (ts.isJsxElement(child) &&
          ts.isIdentifier(child.openingElement.tagName) &&
          child.openingElement.tagName.text === "Step");

      if (isStepElement) {
        const stepAttrs = ts.isJsxSelfClosingElement(child)
          ? child.attributes
          : (child as ts.JsxElement).openingElement.attributes;
        const nodeId = extractStepNode(stepAttrs, this.constantRefs);
        const label = getStringAttribute(stepAttrs, "label");
        if (nodeId) steps.push(label ? { nodeId, label } : { nodeId });
      } else {
        const childName =
          ts.isJsxSelfClosingElement(child) && ts.isIdentifier(child.tagName)
            ? child.tagName.text
            : ts.isJsxElement(child) && ts.isIdentifier(child.openingElement.tagName)
              ? child.openingElement.tagName.text
              : "unknown";
        throw new Error(
          `<Flow name="${flowName}"> contains a non-<Step> child: <${childName}>. Flows may only contain <Step> elements.`
        );
      }
    }

    this.flows.push({ name: flowName, desc: flowDesc, priority, steps });

    const stepItems = steps
      .map((s) => {
        const labelSuffix = s.label ? ` — ${escapeHtml(s.label)}` : "";
        const { nodeType, display } = this.registry
          ? resolveNodeMeta(s.nodeId, this.registry)
          : { nodeType: "", display: s.nodeId };
        const typeAttr = nodeType ? ` data-node-type="${escapeAttr(nodeType)}"` : "";
        return `<li><a class="tskb-ref" data-node-id="${escapeAttr(s.nodeId)}"${typeAttr} data-node-display="${escapeAttr(display)}">${escapeHtml(s.nodeId)}</a>${labelSuffix}</li>`;
      })
      .join("");
    this.html += `<div class="tskb-flow"><p class="tskb-flow-desc">${escapeHtml(flowDesc)}</p><ol>${stepItems}</ol></div>`;
  }

  private handleAdr(node: ts.JsxElement | ts.JsxSelfClosingElement, attrs: ts.JsxAttributes): void {
    const adrMeta = getAdrAttributes(attrs);
    if (adrMeta) {
      this.html += `<section class="tskb-adr" ${adrMeta}>`;
      if (ts.isJsxElement(node)) this.visitChildren(node);
      this.html += `</section>`;
    }
  }

  private handleRefTag(tagName: string, attrs: ts.JsxAttributes): void {
    const name = getStringAttribute(attrs, "name");
    if (!name) return;
    const link = buildRefLink(REF_CATEGORY_MAP[tagName], name, this.refs, this.registry);
    if (link) this.html += link;
  }

  /** Resolves a JSX expression to its string value — used for Relation and Step attribute extraction. */
  private resolveExprToString(expr: ts.Expression): string | undefined {
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text;
    if (ts.isIdentifier(expr)) {
      return this.constantRefs.get(expr.text)?.name ?? expr.text;
    }
    if (ts.isAsExpression(expr)) {
      if (ts.isIdentifier(expr.expression)) {
        return this.constantRefs.get(expr.expression.text)?.name ?? expr.expression.text;
      }
      if (ts.isPropertyAccessExpression(expr.expression)) return expr.expression.name.text;
      const meta = parseTypeAssertion(expr);
      if (meta) return meta.name;
    }
    return expr.getText();
  }
}
