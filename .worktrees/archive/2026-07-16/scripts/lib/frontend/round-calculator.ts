export function calculateArchRounds(totalShards: number, crossRefCount: number): number {
  let rounds = 3;
  if (totalShards >= 100) rounds = 5;
  else if (totalShards >= 50) rounds = 4;
  if (crossRefCount > 50) rounds = Math.min(rounds + 1, 5);
  return rounds;
}
