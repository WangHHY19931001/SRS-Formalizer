/**
 * Graph data structure for SRS formalizer.
 *
 * Provides O(1) node lookup via Map<string, GraphNode>,
 * O(1) neighbor queries via adjacency list, and
 * O(1) incoming-edge queries via reverse adjacency list.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GraphNode {
  id: string;
  labels: string[];
  properties: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  properties?: Record<string, unknown>;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ---------------------------------------------------------------------------
// Graph
// ---------------------------------------------------------------------------

export class Graph {
  private nodes: Map<string, GraphNode> = new Map();
  private edges: GraphEdge[] = [];
  private adjacency: Map<string, Set<string>> = new Map();
  private reverseAdjacency: Map<string, Set<string>> = new Map();

  // -----------------------------------------------------------------------
  // Mutators
  // -----------------------------------------------------------------------

  /** Add or overwrite a node by id. O(1). */
  addNode(node: GraphNode): void {
    this.nodes.set(node.id, node);

    // Ensure adjacency entries exist so getNeighbors() works for isolated nodes
    if (!this.adjacency.has(node.id)) {
      this.adjacency.set(node.id, new Set());
    }
    if (!this.reverseAdjacency.has(node.id)) {
      this.reverseAdjacency.set(node.id, new Set());
    }
  }

  /** Add an edge and update adjacency indices. O(1). */
  addEdge(edge: GraphEdge): void {
    this.edges.push(edge);

    // Forward adjacency
    let neighbors = this.adjacency.get(edge.source);
    if (!neighbors) {
      neighbors = new Set();
      this.adjacency.set(edge.source, neighbors);
    }
    neighbors.add(edge.target);

    // Reverse adjacency
    let incoming = this.reverseAdjacency.get(edge.target);
    if (!incoming) {
      incoming = new Set();
      this.reverseAdjacency.set(edge.target, incoming);
    }
    incoming.add(edge.source);

    // Ensure the other end also has adjacency entries
    if (!this.adjacency.has(edge.target)) {
      this.adjacency.set(edge.target, new Set());
    }
    if (!this.reverseAdjacency.has(edge.source)) {
      this.reverseAdjacency.set(edge.source, new Set());
    }
  }

  // -----------------------------------------------------------------------
  // Accessors
  // -----------------------------------------------------------------------

  /** Look up a node by id. O(1). Returns undefined when not found. */
  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  /** All direct successors of `id`. Returns empty array for unknown nodes. */
  getNeighbors(id: string): string[] {
    const neighbors = this.adjacency.get(id);
    return neighbors ? [...neighbors] : [];
  }

  /** All direct predecessors of `id`. Returns empty array for unknown nodes. */
  getIncoming(id: string): string[] {
    const incoming = this.reverseAdjacency.get(id);
    return incoming ? [...incoming] : [];
  }

  /** Whether a node with the given id exists. O(1). */
  hasNode(id: string): boolean {
    return this.nodes.has(id);
  }

  /** Total number of nodes in the graph. */
  get nodeCount(): number {
    return this.nodes.size;
  }

  /** Total number of edges in the graph. */
  get edgeCount(): number {
    return this.edges.length;
  }

  /** Return a snapshot of all nodes. */
  getAllNodes(): GraphNode[] {
    return [...this.nodes.values()];
  }

  /** Return a snapshot of all edges. */
  getAllEdges(): GraphEdge[] {
    return [...this.edges];
  }

  // -----------------------------------------------------------------------
  // Serialization
  // -----------------------------------------------------------------------

  /** Serialise the graph to a plain JSON-compatible structure. */
  toJSON(): GraphData {
    return { nodes: this.getAllNodes(), edges: this.getAllEdges() };
  }

  /** Deserialise from a GraphData object and return a new Graph instance. */
  static fromJSON(data: GraphData): Graph {
    const g = new Graph();
    for (const n of data.nodes) {
      g.addNode(n);
    }
    for (const e of data.edges) {
      g.addEdge(e);
    }
    return g;
  }
}
