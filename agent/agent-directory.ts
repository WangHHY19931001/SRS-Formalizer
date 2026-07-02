/**
 * agent-directory.ts — A2A Agent Directory for inter-agent communication
 *
 * Manages agent registration, message passing, and status tracking.
 * Used by the A2A tools (a2a_send, a2a_broadcast) in tools.ts.
 */

export interface AgentHandle {
  id: string;
  role: string;
  receive(message: string, fromId: string): Promise<string>;
}

export interface AgentInfo {
  id: string;
  role: string;
  status: "running" | "completed" | "error";
}

export class AgentDirectory {
  private agents = new Map<string, { handle: AgentHandle; info: AgentInfo }>();

  register(handle: AgentHandle, role: string): void {
    this.agents.set(handle.id, { handle, info: { id: handle.id, role, status: "running" } });
  }

  unregister(id: string): void {
    const entry = this.agents.get(id);
    if (entry) entry.info.status = "completed";
  }

  markError(id: string): void {
    const entry = this.agents.get(id);
    if (entry) entry.info.status = "error";
  }

  async send(fromId: string, toId: string, message: string): Promise<string> {
    const target = this.agents.get(toId);
    if (!target) return `ERROR: agent ${toId} not found`;
    return target.handle.receive(message, fromId);
  }

  async broadcast(fromId: string, message: string, filter?: { role?: string }): Promise<string> {
    const results: string[] = [];
    for (const [id, entry] of this.agents) {
      if (id === fromId) continue;
      if (filter?.role && entry.info.role !== filter.role) continue;
      const resp = await entry.handle.receive(message, fromId);
      results.push(`${id}: ${resp.slice(0, 200)}`);
    }
    return results.join("\n") || "No recipients";
  }

  list(filter?: { role?: string; status?: string }): AgentInfo[] {
    let infos = [...this.agents.values()].map(e => e.info);
    if (filter?.role) infos = infos.filter(i => i.role === filter.role);
    if (filter?.status) infos = infos.filter(i => i.status === filter.status);
    return infos;
  }

  get size(): number { return this.agents.size; }
}
