import { Document, Page, Text, View, StyleSheet, pdf, Link } from "@react-pdf/renderer";
import type { Root, Content, PhrasingContent, Heading, List, ListItem, Paragraph } from "mdast";
import { unified } from "unified";
import remarkParse from "remark-parse";

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 36,
    paddingHorizontal: 40,
    fontSize: 10.5,
    fontFamily: "Helvetica",
    color: "#111",
  },
  h1: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
    textAlign: "center",
  },
  h2: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginTop: 12,
    marginBottom: 6,
    textTransform: "uppercase",
    borderBottomWidth: 1,
    borderBottomColor: "#222",
    paddingBottom: 2,
  },
  h3: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginTop: 8,
    marginBottom: 2,
  },
  p: {
    marginBottom: 6,
    lineHeight: 1.4,
  },
  listItem: {
    flexDirection: "row",
    marginBottom: 2,
    paddingLeft: 6,
  },
  bullet: {
    width: 10,
  },
  listText: {
    flex: 1,
    lineHeight: 1.4,
  },
  bold: { fontFamily: "Helvetica-Bold" },
  italic: { fontFamily: "Helvetica-Oblique" },
  link: { color: "#2563eb", textDecoration: "none" },
});

function renderPhrasing(nodes: PhrasingContent[], keyPrefix: string): React.ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    if (node.type === "text") return <Text key={key}>{node.value}</Text>;
    if (node.type === "strong") {
      return (
        <Text key={key} style={styles.bold}>
          {renderPhrasing(node.children, key)}
        </Text>
      );
    }
    if (node.type === "emphasis") {
      return (
        <Text key={key} style={styles.italic}>
          {renderPhrasing(node.children, key)}
        </Text>
      );
    }
    if (node.type === "inlineCode") {
      return <Text key={key}>{node.value}</Text>;
    }
    if (node.type === "link") {
      return (
        <Link key={key} src={node.url} style={styles.link}>
          {renderPhrasing(node.children, key)}
        </Link>
      );
    }
    if (node.type === "break") return <Text key={key}>{"\n"}</Text>;
    return null;
  });
}

function renderHeading(node: Heading, key: string) {
  const content = renderPhrasing(node.children, key);
  const style = node.depth === 1 ? styles.h1 : node.depth === 2 ? styles.h2 : styles.h3;
  return (
    <Text key={key} style={style}>
      {content}
    </Text>
  );
}

function renderParagraph(node: Paragraph, key: string) {
  return (
    <Text key={key} style={styles.p}>
      {renderPhrasing(node.children, key)}
    </Text>
  );
}

function renderListItem(node: ListItem, key: string) {
  const children = node.children
    .map((child, index) => {
      const childKey = `${key}-${index}`;
      if (child.type === "paragraph") return renderPhrasing(child.children, childKey);
      return null;
    })
    .flat();
  return (
    <View key={key} style={styles.listItem} wrap={false}>
      <Text style={styles.bullet}>•</Text>
      <Text style={styles.listText}>{children}</Text>
    </View>
  );
}

function renderList(node: List, key: string) {
  return (
    <View key={key}>
      {node.children.map((item, index) => renderListItem(item, `${key}-${index}`))}
    </View>
  );
}

function renderBlock(node: Content, index: number): React.ReactNode {
  const key = `n-${index}`;
  if (node.type === "heading") return renderHeading(node, key);
  if (node.type === "paragraph") return renderParagraph(node, key);
  if (node.type === "list") return renderList(node, key);
  if (node.type === "thematicBreak") {
    return (
      <View
        key={key}
        style={{
          borderBottomWidth: 1,
          borderBottomColor: "#ccc",
          marginVertical: 6,
        }}
      />
    );
  }
  if (node.type === "blockquote") {
    return (
      <View key={key} style={{ marginLeft: 10, marginBottom: 6 }}>
        {node.children.map((child, i) => renderBlock(child, i))}
      </View>
    );
  }
  if (node.type === "code") {
    return (
      <Text key={key} style={{ fontFamily: "Courier", marginBottom: 6 }}>
        {node.value}
      </Text>
    );
  }
  return null;
}

function MarkdownDocument({ markdown }: { markdown: string }) {
  const tree = unified().use(remarkParse).parse(markdown) as Root;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {tree.children.map((node, index) => renderBlock(node, index))}
      </Page>
    </Document>
  );
}

export async function downloadMarkdownPdf(markdown: string, filename: string): Promise<void> {
  const blob = await pdf(<MarkdownDocument markdown={markdown} />).toBlob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
