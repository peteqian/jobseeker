import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Link,
  Font,
  type Styles as PdfStyles,
} from "@react-pdf/renderer";
import type { Root, Content, PhrasingContent, Heading, List, ListItem, Paragraph } from "mdast";
import { unified } from "unified";
import remarkParse from "remark-parse";

export type PdfVariant = "resume" | "cover-letter";

export interface FontSources {
  regular: string;
  bold: string;
  italic: string;
}

// Carlito (OFL, Calibri-metric-compatible) is bundled so the PDF renders
// identically everywhere, independent of the viewer's fonts. Registration is
// left to each consumer: the web app passes bundler URLs, the server passes
// filesystem paths — react-pdf accepts either as `src`.
export function registerFonts(src: FontSources): void {
  Font.register({ family: "Carlito", src: src.regular });
  Font.register({ family: "Carlito-Bold", src: src.bold });
  Font.register({ family: "Carlito-Italic", src: src.italic });
  // Don't hyphenate words at line breaks (react-pdf default splits them).
  Font.registerHyphenationCallback((word) => [word]);
}

// Palette ported from the reference repo's resume.css / cover-letter.css.
const INK = "#172033";
const MUTED = "#4e5b6e";
const RULE = "#cfd8e4";
const SOFT_RULE = "#edf1f6";
const ACCENT = "#234b70";

const LETTER_INK = "#1a1a1a";
const LETTER_MUTED = "#5a5a5a";
const LETTER_RULE = "#d6d6d6";

const BODY = "Carlito";
const BODY_BOLD = "Carlito-Bold";
const BODY_ITALIC = "Carlito-Italic";

// Sizes/spacing follow resume.css proportions, scaled to an 11pt body. Page
// padding is physical (inches) so it stays fixed regardless of font size.
const resumeStyles: PdfStyles = StyleSheet.create({
  page: {
    paddingVertical: 34.6, // 0.48in
    paddingHorizontal: 37.4, // 0.52in
    fontSize: 11,
    fontFamily: BODY,
    color: INK,
    lineHeight: 1.28,
  },
  h1: {
    fontSize: 24,
    fontFamily: BODY_BOLD,
    lineHeight: 1.05,
    marginBottom: 2.2,
    paddingBottom: 2,
    borderBottomWidth: 1.5,
    borderBottomColor: RULE,
  },
  h2: {
    fontSize: 11.6,
    fontFamily: BODY_BOLD,
    color: ACCENT,
    letterSpacing: 0.93, // 0.08em
    textTransform: "uppercase",
    marginTop: 7.5,
    marginBottom: 2.85,
    paddingBottom: 1.1,
    borderBottomWidth: 1,
    borderBottomColor: RULE,
  },
  h3: {
    fontSize: 12.4,
    fontFamily: BODY_BOLD,
    marginTop: 5.3,
    marginBottom: 0.44,
  },
  // fontSize must live on the same style as lineHeight; otherwise react-pdf
  // ignores the multiplier on wrapped lines and uses the font's (large) default.
  p: { fontSize: 11, marginVertical: 1.55, lineHeight: 1.28 },
  // Contact line right under the name.
  contact: { color: MUTED, fontSize: 10.6, lineHeight: 1.18, marginBottom: 4.84 },
  // First paragraph after an h3 — the dates/role meta line.
  metaPrimary: {
    color: MUTED,
    fontFamily: BODY_BOLD,
    fontSize: 10.8,
    marginTop: 0.44,
    marginBottom: 0,
  },
  // Second paragraph after an h3 — secondary meta.
  metaSecondary: { color: MUTED, fontSize: 10.6, marginTop: 0.88, marginBottom: 0 },
  listItem: {
    fontSize: 11,
    marginVertical: 1.1,
    paddingLeft: 12,
    textIndent: -12,
    lineHeight: 1.28,
  },
  // Soft separator under each role's bullets in Experience.
  expList: {
    borderBottomWidth: 1,
    borderBottomColor: SOFT_RULE,
    paddingBottom: 1.3,
    marginBottom: 3.1,
  },
});

const letterStyles: PdfStyles = StyleSheet.create({
  page: {
    paddingVertical: 72, // 1in
    paddingHorizontal: 79, // 1.1in
    fontSize: 11,
    fontFamily: BODY,
    color: LETTER_INK,
    lineHeight: 1.5,
  },
  h1: { fontSize: 18, fontFamily: BODY_BOLD, lineHeight: 1.15, marginBottom: 2 },
  h2: { fontSize: 12, fontFamily: BODY_BOLD, marginTop: 10, marginBottom: 4 },
  h3: { fontSize: 11, fontFamily: BODY_BOLD, marginTop: 8, marginBottom: 2 },
  p: { fontSize: 11, marginBottom: 9, lineHeight: 1.5 },
  // Date/address block under the name.
  contact: { color: LETTER_MUTED, fontSize: 9.5, marginBottom: 12 },
  metaPrimary: { fontSize: 11, marginBottom: 9, lineHeight: 1.5 },
  metaSecondary: { fontSize: 11, marginBottom: 9, lineHeight: 1.5 },
  listItem: { fontSize: 11, marginVertical: 2, paddingLeft: 12, textIndent: -12, lineHeight: 1.5 },
  expList: {},
});

const sharedStyles = StyleSheet.create({
  bold: { fontFamily: BODY_BOLD },
  italic: { fontFamily: BODY_ITALIC },
  link: { textDecoration: "none" },
});

type Styles = PdfStyles;

// A nested <Text> without its own fontSize+lineHeight falls back to the font's
// default leading (~1.6 for Carlito), which blows out the line height of any
// line containing that run. So plain text is returned as a raw string (it
// inherits the parent's metrics) and every styled run is given the parent's
// fontSize AND lineHeight explicitly — react-pdf only honours the lineHeight
// multiplier when fontSize sits on the same element.
function renderPhrasing(
  nodes: PhrasingContent[],
  keyPrefix: string,
  lh: number,
  fs: number,
): React.ReactNode[] {
  const m = { fontSize: fs, lineHeight: lh };
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    if (node.type === "text") return node.value;
    if (node.type === "strong") {
      return (
        <Text key={key} style={[sharedStyles.bold, m]}>
          {renderPhrasing(node.children, key, lh, fs)}
        </Text>
      );
    }
    if (node.type === "emphasis") {
      return (
        <Text key={key} style={[sharedStyles.italic, m]}>
          {renderPhrasing(node.children, key, lh, fs)}
        </Text>
      );
    }
    if (node.type === "inlineCode") {
      return (
        <Text key={key} style={m}>
          {node.value}
        </Text>
      );
    }
    if (node.type === "link") {
      return (
        <Link key={key} src={node.url} style={[sharedStyles.link, m]}>
          {renderPhrasing(node.children, key, lh, fs)}
        </Link>
      );
    }
    if (node.type === "break") return "\n";
    return null;
  });
}

function bodyLineHeight(styles: Styles): number {
  return styles.p.lineHeight as number;
}

function bodyFontSize(styles: Styles): number {
  return styles.p.fontSize as number;
}

function renderHeading(node: Heading, key: string, styles: Styles) {
  const style = node.depth === 1 ? styles.h1 : node.depth === 2 ? styles.h2 : styles.h3;
  const lh = (style.lineHeight ?? bodyLineHeight(styles)) as number;
  const fs = (style.fontSize ?? bodyFontSize(styles)) as number;
  return (
    <Text key={key} style={style}>
      {renderPhrasing(node.children, key, lh, fs)}
    </Text>
  );
}

function renderListItem(node: ListItem, key: string, styles: Styles) {
  const lh = styles.listItem.lineHeight as number;
  const fs = styles.listItem.fontSize as number;
  const children = node.children.flatMap((child, index) =>
    child.type === "paragraph" ? renderPhrasing(child.children, `${key}-${index}`, lh, fs) : [],
  );
  // Single Text with a hanging indent (negative textIndent + matching
  // paddingLeft). A flex row with a flex:1 Text inflates the wrapped-line height
  // in react-pdf; this keeps the reference's tight leading.
  return (
    <Text key={key} style={styles.listItem}>
      {"•  "}
      {children}
    </Text>
  );
}

function renderList(node: List, key: string, styles: Styles, separator: boolean) {
  return (
    <View key={key} style={separator ? styles.expList : undefined}>
      {node.children.map((item, index) => renderListItem(item, `${key}-${index}`, styles))}
    </View>
  );
}

function headingText(node: Heading): string {
  return node.children
    .map((c) => ("value" in c ? c.value : ""))
    .join("")
    .trim()
    .toLowerCase();
}

/**
 * Walks the markdown tree tracking the current section and how many paragraphs
 * have appeared since the last h3, so we can reproduce the reference CSS sibling
 * selectors (contact line, role meta lines, per-role separators) that react-pdf
 * cannot express as styles.
 */
function renderTree(tree: Root, styles: Styles): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let section = "";
  let parsSinceH3 = Infinity; // large => not directly after an h3
  let seenFirstParagraph = false;

  tree.children.forEach((node: Content, index) => {
    const key = `n-${index}`;

    if (node.type === "heading") {
      if (node.depth === 2) section = headingText(node);
      if (node.depth === 3) parsSinceH3 = 0;
      else parsSinceH3 = Infinity;
      out.push(renderHeading(node, key, styles));
      return;
    }

    if (node.type === "paragraph") {
      const p = node as Paragraph;
      let style = styles.p;
      if (!seenFirstParagraph) style = styles.contact;
      else if (parsSinceH3 === 0) style = styles.metaPrimary;
      else if (parsSinceH3 === 1) style = styles.metaSecondary;
      seenFirstParagraph = true;
      if (parsSinceH3 !== Infinity) parsSinceH3 += 1;
      const lh = (style.lineHeight ?? bodyLineHeight(styles)) as number;
      const fs = (style.fontSize ?? bodyFontSize(styles)) as number;
      out.push(
        <Text key={key} style={style}>
          {renderPhrasing(p.children, key, lh, fs)}
        </Text>,
      );
      return;
    }

    if (node.type === "list") {
      out.push(renderList(node, key, styles, section === "experience"));
      return;
    }

    if (node.type === "thematicBreak") {
      out.push(
        <View
          key={key}
          style={{ borderBottomWidth: 1, borderBottomColor: LETTER_RULE, marginVertical: 10 }}
        />,
      );
      return;
    }

    if (node.type === "blockquote") {
      out.push(
        <Text key={key} style={[styles.p, { marginLeft: 10 }]}>
          {renderPhrasing(
            node.children.flatMap((c) => (c.type === "paragraph" ? c.children : [])),
            key,
            bodyLineHeight(styles),
            bodyFontSize(styles),
          )}
        </Text>,
      );
      return;
    }
  });

  return out;
}

export function MarkdownDocument({ markdown, variant }: { markdown: string; variant: PdfVariant }) {
  const tree = unified().use(remarkParse).parse(markdown) as Root;
  const styles = variant === "cover-letter" ? letterStyles : resumeStyles;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {renderTree(tree, styles)}
      </Page>
    </Document>
  );
}
