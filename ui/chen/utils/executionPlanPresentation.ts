import type { ChenNormalizedNodeType, ChenPlanNode } from "~/chen/types/plan";

export interface ChenPlanFact {
  key: string;
  value: string;
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
  const title = chenPlanNodeTitle(node);
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

export function chenPlanNodeDetail(node: ChenPlanNode): string | null {
  const detail = node.detail?.trim();
  if (!detail) return null;
  if (detail === node.relation || detail === node.table) return null;
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
  if (JOIN_TYPES.includes(nodeType)) return ["Join Type"];
  if (nodeType === "SORT") return ["Sort Key"];
  if (nodeType === "AGGREGATE") return ["Strategy", "Group Key"];
  if (INDEX_TYPES.includes(nodeType)) return ["Index Name"];
  if (nodeType === "SUBQUERY") return ["CTE Name", "Subplan Name", "Parent Relationship"];
  if (nodeType === "UNION") return ["CTE Name"];
  if (nodeType === "SCAN") return ["CTE Name"];
  return [];
}

function primaryPredicateKeys(nodeType: ChenNormalizedNodeType): string[] {
  if (nodeType === "HASH_JOIN") return ["Hash Cond", "Join Filter"];
  if (nodeType === "MERGE_JOIN") return ["Merge Cond", "Join Filter"];
  if (nodeType === "NESTED_LOOP" || nodeType === "JOIN") return ["Join Filter", "Hash Cond", "Merge Cond"];
  if (INDEX_TYPES.includes(nodeType)) return ["Index Cond"];
  if (nodeType === "SCAN") return ["Filter"];
  if (nodeType === "SUBQUERY") return ["Filter"];
  return [];
}

function addFact(facts: ChenPlanFact[], key: string, value: string | null | undefined, title = "") {
  if (!value) return;
  if (title && title.toLowerCase().includes(value.toLowerCase()) && key === "Join Type") return;
  if (facts.some((fact) => fact.key === key || fact.value === value)) return;
  facts.push({ key, value });
}
