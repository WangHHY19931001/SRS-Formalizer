import { StructuredTool } from "@langchain/core/tools";

export class ToolRegistry {
  private active = new Map<string, StructuredTool>();
  private lazy = new Map<string, () => Promise<StructuredTool>>();

  /** Add a lazy-loadable tool definition */
  addLazy(name: string, loader: () => Promise<StructuredTool>): void {
    this.lazy.set(name, loader);
  }

  /** Load and activate tools by name */
  async register(names: string[]): Promise<string[]> {
    const registered: string[] = [];
    for (const name of names) {
      if (this.active.has(name)) { registered.push(name); continue; }
      const loader = this.lazy.get(name);
      if (!loader) continue;
      const tool = await loader();
      this.active.set(name, tool);
      registered.push(name);
    }
    return registered;
  }

  /** Directly add an already-instantiated tool */
  addActive(tool: StructuredTool): void {
    this.active.set(tool.name, tool);
  }

  /** Remove tools from active registry */
  unregister(names: string[]): string[] {
    const removed: string[] = [];
    for (const name of names) {
      if (this.active.delete(name)) removed.push(name);
    }
    return removed;
  }

  /** Get all currently active tools (for LLM binding) */
  getActiveTools(): StructuredTool[] {
    return [...this.active.values()];
  }

  getActiveToolNames(): string[] {
    return [...this.active.keys()];
  }

  has(name: string): boolean {
    return this.active.has(name);
  }

  /** Take a snapshot of current active tool names */
  snapshot(): string[] {
    return [...this.active.keys()];
  }
}
