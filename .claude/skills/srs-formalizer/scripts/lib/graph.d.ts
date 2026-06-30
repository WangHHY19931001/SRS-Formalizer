/**
 * Graph data structure for SRS formalizer.
 *
 * Provides O(1) node lookup via Map<string, GraphNode>,
 * O(1) neighbor queries via adjacency list, and
 * O(1) incoming-edge queries via reverse adjacency list.
 */
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
export declare class Graph {
    private nodes;
    private edges;
    private adjacency;
    private reverseAdjacency;
    /** Add or overwrite a node by id. O(1). */
    addNode(node: GraphNode): void;
    /** Add an edge and update adjacency indices. O(1). */
    addEdge(edge: GraphEdge): void;
    /** Look up a node by id. O(1). Returns undefined when not found. */
    getNode(id: string): GraphNode | undefined;
    /** All direct successors of `id`. Returns empty array for unknown nodes. */
    getNeighbors(id: string): string[];
    /** All direct predecessors of `id`. Returns empty array for unknown nodes. */
    getIncoming(id: string): string[];
    /** Whether a node with the given id exists. O(1). */
    hasNode(id: string): boolean;
    /** Total number of nodes in the graph. */
    get nodeCount(): number;
    /** Total number of edges in the graph. */
    get edgeCount(): number;
    /** Return a snapshot of all nodes. */
    getAllNodes(): GraphNode[];
    /** Return a snapshot of all edges. */
    getAllEdges(): GraphEdge[];
    /** Serialise the graph to a plain JSON-compatible structure. */
    toJSON(): GraphData;
    /** Deserialise from a GraphData object and return a new Graph instance. */
    static fromJSON(data: GraphData): Graph;
}
