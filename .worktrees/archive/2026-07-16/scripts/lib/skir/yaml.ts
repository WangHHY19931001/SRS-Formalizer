/**
 * Simple YAML parser for flat and shallow-nested structures.
 *
 * Avoids external YAML library dependency per project constraint #1.
 */

export function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split('\n');
  let currentKey: string | null = null;
  let currentNestedKey: string | null = null;
  let currentArray: unknown[] = [];
  let currentObj: Record<string, unknown> = {};
  let inArray = false;
  let inObj = false;

  // Write a collected array to the appropriate path
  function flushArray() {
    if (!inArray || !currentKey) return;
    // Flush any pending object-in-array before finalizing the array
    if (inObj && Object.keys(currentObj).length > 0) {
      currentArray.push({...currentObj});
      currentObj = {};
      inObj = false;
    }
    const arr = [...currentArray];
    currentArray = [];
    inArray = false;
    if (currentNestedKey) {
      const parent = result[currentKey] as Record<string, unknown>;
      parent[currentNestedKey] = arr;
    } else {
      result[currentKey] = arr;
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    // Top-level key: value (must start at column 0)
    const kvMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/);
    if (kvMatch) {
      // Flush previous array of objects before starting new key
      if (inObj && inArray && currentKey && Object.keys(currentObj).length > 0) {
        currentArray.push({...currentObj});
        currentObj = {};
        inObj = false;
      }
      // Flush previous flat array (if any) before starting new key
      flushArray();
      currentNestedKey = null;

      const key = kvMatch[1]!;
      const val = kvMatch[2]!.trim();

      if (val === '') {
        currentKey = key;
        result[key] = {};
        currentNestedKey = null;
        inArray = false;
        inObj = false;
        currentArray = [];
        currentObj = {};
      } else {
        currentKey = null;
        currentNestedKey = null;
        result[key] = parseYamlValue(val);
      }
      continue;
    }

    // Array item: - value or - key: value
    const arrMatch = trimmed.match(/^-\s+(.*)$/);
    if (arrMatch && currentKey) {
      // Flush previous object in array before starting a new item
      if (inObj && Object.keys(currentObj).length > 0) {
        currentArray.push({...currentObj});
        currentObj = {};
      }
      inArray = true;
      const itemVal = arrMatch[1]!.trim();

      // Check for inline key: value
      const inlineKv = itemVal.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/);
      if (inlineKv) {
        inObj = true;
        currentObj[inlineKv[1]!] = parseYamlValue(inlineKv[2]!.trim());
      } else {
        currentArray.push(parseYamlValue(itemVal));
        inObj = false;  // flat array item — no longer inside an object
      }
      continue;
    }

    // Nested key: value inside object (indented, not at column 0)
    const nestedKv = line.match(/^\s+([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/);
    if (nestedKv && currentKey) {
      const nKey = nestedKv[1]!;
      const nVal = nestedKv[2]!.trim();

      if (nVal === '') {
        // deeper nested object key — starting a new sub-section
        // flush any prior array into its nested key before switching
        flushArray();
        currentNestedKey = nKey;
        inObj = true;
      } else if (inObj && inArray) {
        // Inside an object in an array — add to current object
        currentObj[nKey] = parseYamlValue(nVal);
      } else {
        // If we're inside a previous nested key context, flush and reset before
        // writing a sibling key (e.g. pipeline_stages after file_globs)
        if (currentNestedKey && inArray) {
          flushArray();
          currentNestedKey = null;
        }
        // Direct nested key under a top-level key (or under nested key)
        const effective = currentNestedKey
          ? ((result[currentKey] as Record<string,unknown>)[currentNestedKey] ??= {} as Record<string,unknown>) as Record<string,unknown>
          : (result[currentKey] as Record<string,unknown>);
        // Check for inline object {}
        const objMatch = nVal.match(/^\{(.*)\}$/);
        if (objMatch) {
          const innerPairs = objMatch[1]!.split(',').map(s => s.trim());
          const innerObj: Record<string, unknown> = {};
          for (const pair of innerPairs) {
            const [ik, iv] = pair.split(':').map(s => s.trim().replace(/"/g, ''));
            if (ik && iv) innerObj[ik] = parseYamlValue(iv);
          }
          effective[nKey] = innerObj;
        } else {
          effective[nKey] = parseYamlValue(nVal);
        }
      }
    }
  }

  // Final flush
  if (inObj && inArray && currentKey && Object.keys(currentObj).length > 0) {
    currentArray.push({...currentObj});
    currentObj = {};
    inObj = false;
  }
  flushArray();

  return result;
}

export function parseYamlValue(val: string): unknown {
  const trimmed = val.trim();
  // Remove surrounding quotes
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  // Boolean
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  // Null
  if (trimmed === 'null' || trimmed === '~') return null;
  // Number
  const num = Number(trimmed);
  if (!isNaN(num) && trimmed !== '') return num;
  // Array shorthand [a, b, c]
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed.slice(1, -1).split(',').map(s => parseYamlValue(s.trim()));
  }
  return trimmed;
}
