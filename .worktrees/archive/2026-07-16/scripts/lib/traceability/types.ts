interface MatrixRow {
  reqId: string;
  module: string;
  cypher: string;
  bdd: string;
  tla: string;
  lean: string;
  fixture: string;
}

interface CoverageCounts {
  cypher: number;
  bdd: number;
  tla: number;
  lean: number;
  fixture: number;
}

export type { MatrixRow, CoverageCounts };
