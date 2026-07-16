const VALID_CATEGORIES = ["explicit", "implicit", "relational"];
export const VALID_NFR_CATEGORIES = ["performance", "security", "availability", "compatibility", "maintainability", "compliance"];

export function validateR3CrossLine(line: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const trimmed = line.trim();
  if (!trimmed) return { valid: false, errors: ["空行"] };
  let record: Record<string, unknown>;
  try {
    record = JSON.parse(trimmed);
  } catch {
    return { valid: false, errors: [`JSON 解析失败: ${trimmed.slice(0, 80)}`] };
  }
  if (typeof record !== "object" || record === null || Array.isArray(record))
    return { valid: false, errors: ["不是 JSON 对象"] };
  const id = String(record.id ?? "");
  if (!id || !/^R3C-[A-Za-z0-9_.]+-\d{4}$/.test(id))
    errors.push(`id 格式: ${id || "缺失"}（须为 R3C-<TOPIC>-NNNN）`);
  if (!VALID_CATEGORIES.includes(String(record.category ?? "")))
    errors.push(`category: ${String(record.category ?? "缺失")}`);
  if (!record.statement || String(record.statement).trim() === "")
    errors.push("statement 缺失");
  if (!record.source_file) errors.push("source_file 缺失");
  if (!["high", "medium", "low"].includes(String(record.confidence ?? "")))
    errors.push("confidence 非法");
  const meta = record.metadata;
  if (!meta || typeof meta !== "object" || Array.isArray(meta) || meta === null) {
    errors.push("metadata 缺失（r3-cross 必须含 cross_shard_refs）");
  } else {
    const refs = (meta as Record<string, unknown>)['cross_shard_refs'];
    if (!Array.isArray(refs) || refs.length === 0)
      errors.push("metadata.cross_shard_refs 必须为非空数组");
  }
  return { valid: errors.length === 0, errors };
}

export function validateR4NFRLine(line: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const trimmed = line.trim();
  if (!trimmed) return { valid: false, errors: ["空行"] };
  let record: Record<string, unknown>;
  try {
    record = JSON.parse(trimmed);
  } catch {
    return { valid: false, errors: [`JSON 解析失败: ${trimmed.slice(0, 80)}`] };
  }
  if (typeof record !== "object" || record === null || Array.isArray(record))
    return { valid: false, errors: ["不是 JSON 对象"] };
  const id = String(record.id ?? "");
  if (!id || !/^R4N-[A-Za-z0-9_.]+-\d{4}$/.test(id))
    errors.push(`id 格式: ${id || "缺失"}（须为 R4N-<CAT>-NNNN）`);
  if (!VALID_CATEGORIES.includes(String(record.category ?? "")))
    errors.push(`category: ${String(record.category ?? "缺失")}`);
  if (!record.statement || String(record.statement).trim() === "")
    errors.push("statement 缺失");
  if (!record.source_file) errors.push("source_file 缺失");
  if (!["high", "medium", "low"].includes(String(record.confidence ?? "")))
    errors.push("confidence 非法");
  const meta = record.metadata;
  if (!meta || typeof meta !== "object" || Array.isArray(meta) || meta === null) {
    errors.push("metadata 缺失（r4-nfr 必须含 nfrCategory）");
  } else {
    const nfrCat = (meta as Record<string, unknown>)['nfrCategory'];
    if (typeof nfrCat !== "string" || nfrCat.trim() === "")
      errors.push("metadata.nfrCategory 缺失");
    else if (!VALID_NFR_CATEGORIES.includes(nfrCat.toLowerCase()))
      errors.push(`metadata.nfrCategory "${nfrCat}" 非法（须为 ${VALID_NFR_CATEGORIES.join("|")}）`);
  }
  return { valid: errors.length === 0, errors };
}
