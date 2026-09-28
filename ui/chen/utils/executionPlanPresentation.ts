import type { ChenNormalizedNodeType, ChenPlanNode, PlanRawFormat } from "~/chen/types/plan";

export interface ChenPlanFact {
  key: string;
  value: string;
}

export interface ChenPlanStep {
  node: ChenPlanNode;
  depth: number;
  step: string;
  ancestors: string[];
}

const JOIN_TYPES: ChenNormalizedNodeType[] = ["JOIN", "HASH_JOIN", "MERGE_JOIN", "NESTED_LOOP"];
const INDEX_TYPES: ChenNormalizedNodeType[] = ["INDEX_SCAN", "INDEX_ONLY_SCAN"];

export function chenPlanNodeTitle(node: ChenPlanNode): string {
  const native = node.nativeOperator || node.nodeType;
  const joinType = node.logicalOperator || node.attributes?.["Join Type"] || "";
  if (joinType && !native.toLowerCase().includes(joinType.toLowerCase())) {
    return `${native} ${joinType}`;
  }
  return native;
}

export function chenPlanNodePrimaryFacts(node: ChenPlanNode): ChenPlanFact[] {
  const facts: ChenPlanFact[] = [];
  const title = node.nativeOperator || node.nodeType;
  addFact(facts, "Join Type", node.logicalOperator || node.attributes?.["Join Type"], title);
  for (const key of primaryAttributeKeys(node.nodeType)) {
    if (key === "Join Type") continue;
    addFact(facts, key, node.attributes?.[key], title);
  }
  for (const key of primaryPredicateKeys(node.nodeType)) {
    addFact(facts, key, node.predicates?.[key], title);
  }
  return facts;
}

export function chenPlanNodeSecondaryFacts(node: ChenPlanNode): ChenPlanFact[] {
  const used = new Set(chenPlanNodePrimaryFacts(node).map((fact) => fact.key));
  if (node.logicalOperator || node.attributes?.["Join Type"]) used.add("Join Type");
  const facts: ChenPlanFact[] = [];
  for (const [key, value] of Object.entries(node.predicates || {})) {
    if (!used.has(key)) addFact(facts, key, value);
  }
  for (const [key, value] of Object.entries(node.attributes || {})) {
    if (!used.has(key) && key !== "Output") addFact(facts, key, value);
  }
  addFact(facts, "Output", node.attributes?.Output);
  return facts;
}

export function chenPlanNodeFacts(node: ChenPlanNode): ChenPlanFact[] {
  const facts = [...chenPlanNodePrimaryFacts(node), ...chenPlanNodeSecondaryFacts(node)];
  const startup = chenPlanFormatEstimated(node.startupCost);
  if (startup != null && !facts.some((fact) => fact.key === "Startup Cost")) {
    facts.push({ key: "Startup Cost", value: startup });
  }
  if (
    node.logicalOperator &&
    node.logicalOperator !== node.nativeOperator &&
    !facts.some((fact) => fact.key === "Join Type" && fact.value === node.logicalOperator)
  ) {
    addFact(facts, "Logical Operator", node.logicalOperator);
  }
  if (node.physicalOperator && node.physicalOperator !== node.nativeOperator) {
    addFact(facts, "Physical Operator", node.physicalOperator);
  }
  return facts;
}

export function chenPlanNodeKeyFacts(node: ChenPlanNode): ChenPlanFact[] {
  const primary = chenPlanNodePrimaryFacts(node);
  if (primary.length) return primary.slice(0, 2);
  const db2Predicate = Object.entries(node.predicates || {}).find(
    ([key, value]) => key.startsWith("Predicate[") && value
  );
  if (db2Predicate) return [{ key: db2Predicate[0], value: db2Predicate[1] }];
  const detail = chenPlanNodeDetail(node);
  return detail ? [{ key: "Detail", value: detail }] : [];
}

export function chenPlanNodeIcon(nodeType: ChenNormalizedNodeType): string {
  switch (nodeType) {
    case "SCAN":
      return "i-lucide-scan-search";
    case "INDEX_SCAN":
    case "INDEX_ONLY_SCAN":
      return "i-lucide-list-filter";
    case "JOIN":
    case "HASH_JOIN":
    case "MERGE_JOIN":
    case "NESTED_LOOP":
      return "i-lucide-git-merge";
    case "SORT":
      return "i-lucide-arrow-down-wide-narrow";
    case "AGGREGATE":
      return "i-lucide-sigma";
    case "FILTER":
      return "i-lucide-filter";
    case "LIMIT":
      return "i-lucide-list-end";
    case "SUBQUERY":
      return "i-lucide-boxes";
    case "HASH":
      return "i-lucide-hash";
    case "PARALLEL":
      return "i-lucide-git-fork";
    case "UNION":
      return "i-lucide-combine";
    case "VALUES":
      return "i-lucide-list";
    case "MATERIALIZE":
      return "i-lucide-database";
    case "PROJECTION":
      return "i-lucide-columns-3";
    default:
      return "i-lucide-circle-dot";
  }
}

export function chenPlanSteps(roots: ChenPlanNode[]): ChenPlanStep[] {
  const steps: ChenPlanStep[] = [];
  const visit = (nodes: ChenPlanNode[], depth: number, prefix: string, ancestors: string[]) => {
    nodes.forEach((node, index) => {
      const step = prefix ? `${prefix}.${index + 1}` : String(index + 1);
      steps.push({ node, depth, step, ancestors });
      visit(node.children, depth + 1, step, [...ancestors, node.id]);
    });
  };
  visit(roots, 0, "", []);
  return steps;
}

export function chenPlanFormatRaw(rawText: string, rawFormat: PlanRawFormat | null): string {
  if (rawFormat === "TEXT") return rawText;
  try {
    return JSON.stringify(JSON.parse(rawText), null, 2);
  } catch {
    return rawFormat === "XML" ? formatXml(rawText) : rawText;
  }
}

export function chenPlanNodeDetail(node: ChenPlanNode): string | null {
  const detail = node.detail?.trim();
  if (!detail) return null;
  if (detail === node.relation || detail === node.table) return null;
  if (node.relation && detail === `Object: ${node.relation}`) return null;
  const facts = [...chenPlanNodePrimaryFacts(node), ...chenPlanNodeSecondaryFacts(node)];
  if (facts.some((fact) => fact.value === detail)) return null;
  return detail;
}

export function chenPlanFormatEstimated(value: number | null | undefined): string | null {
  if (value == null || Number.isNaN(value)) return null;
  if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) return "raw";
  return String(value);
}

function primaryAttributeKeys(nodeType: ChenNormalizedNodeType): string[] {
  if (JOIN_TYPES.includes(nodeType)) return ["Join Type", "join_type", "join_algorithm"];
  if (nodeType === "SORT") return ["Sort Key", "sort_fields"];
  if (nodeType === "AGGREGATE") return ["Strategy", "Group Key"];
  if (INDEX_TYPES.includes(nodeType)) return ["Index Name", "index_name", "key"];
  if (nodeType === "SUBQUERY") return ["CTE Name", "Subplan Name", "Parent Relationship"];
  if (nodeType === "UNION") return ["CTE Name"];
  if (nodeType === "SCAN") return ["CTE Name", "key", "index_name"];
  return [];
}

function primaryPredicateKeys(nodeType: ChenNormalizedNodeType): string[] {
  if (nodeType === "HASH_JOIN")
    return [
      "Hash Cond",
      "hash_condition",
      "Join Filter",
      "Access Predicates",
      "ProbeResidual",
      "Predicate",
      "condition"
    ];
  if (nodeType === "MERGE_JOIN")
    return ["Merge Cond", "Join Filter", "Access Predicates", "ProbeResidual", "Predicate", "condition"];
  if (nodeType === "NESTED_LOOP" || nodeType === "JOIN")
    return [
      "Join Filter",
      "Hash Cond",
      "Merge Cond",
      "Access Predicates",
      "ProbeResidual",
      "Predicate",
      "condition",
      "lookup_condition"
    ];
  if (INDEX_TYPES.includes(nodeType))
    return [
      "Index Cond",
      "Access Predicates",
      "SeekPredicates",
      "Predicate",
      "condition",
      "lookup_condition",
      "attached_condition"
    ];
  if (nodeType === "SCAN")
    return ["Filter", "Filter Predicates", "Access Predicates", "Predicate", "attached_condition", "condition"];
  if (nodeType === "SUBQUERY") return ["Filter", "condition"];
  return [];
}

function formatXml(rawText: string): string {
  // SQL Server Showplan is element-only XML. Preserve mixed content and uncommon
  // XML constructs verbatim rather than inserting whitespace into their content.
  if (!rawText.trim().startsWith("<") || /<!\[CDATA\[|<!--|<!DOCTYPE/i.test(rawText)) return rawText;
  const tags: string[] = [];
  let offset = 0;
  while (offset < rawText.length) {
    if (rawText[offset] !== "<") {
      const nextTag = rawText.indexOf("<", offset);
      const end = nextTag < 0 ? rawText.length : nextTag;
      if (rawText.slice(offset, end).trim()) return rawText;
      offset = end;
      continue;
    }
    let quote: string | null = null;
    let end = offset + 1;
    for (; end < rawText.length; end++) {
      const character = rawText[end];
      if (quote) {
        if (character === quote) quote = null;
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === ">") {
        break;
      }
    }
    if (end === rawText.length) return rawText;
    tags.push(rawText.slice(offset, end + 1).trim());
    offset = end + 1;
  }
  let depth = 0;
  return tags
    .map((tag) => {
      if (tag.startsWith("</")) depth = Math.max(0, depth - 1);
      const formatted = `${"  ".repeat(depth)}${tag}`;
      if (!tag.startsWith("</") && !tag.startsWith("<?") && !tag.startsWith("<!") && !tag.endsWith("/>")) depth++;
      return formatted;
    })
    .join("\n");
}

function addFact(facts: ChenPlanFact[], key: string, value: string | null | undefined, title = "") {
  if (!value) return;
  if (title && title.toLowerCase().includes(value.toLowerCase()) && key === "Join Type") return;
  if (facts.some((fact) => fact.key === key)) return;
  facts.push({ key, value });
}
