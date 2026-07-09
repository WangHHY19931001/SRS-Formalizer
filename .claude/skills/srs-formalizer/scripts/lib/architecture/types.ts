/**
 * Architecture record types used across architecture processing modules.
 */

export interface Arch1Record {
  id: string;
  type: string;
  name: string;
  parent: string | null;
  contains: string[];
  reasoning?: string;
}

export interface Arch2Record {
  id: string;
  action: string;
  name: string | null;
  parent: string | null;
  contains: string[];
  reasoning?: string;
  target: string | null;
}

export interface Arch3Record {
  id: string;
  action: string;
  target: string | null;
  detail: string;
  reasoning?: string;
}

export interface ArchMetrics {
  modules: number;
  actors: number;
  constraints: number;
  contains_edges: number;
}
