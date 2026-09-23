type ServerRead = () => PromiseLike<unknown>;

type ServerReadResults<Reads extends readonly ServerRead[]> = {
  [Index in keyof Reads]: Awaited<ReturnType<Reads[Index]>>;
};

export async function runParallelServerReads<const Reads extends readonly ServerRead[]>(
  reads: Reads,
): Promise<ServerReadResults<Reads>> {
  return Promise.all(reads.map((read) => read())) as Promise<ServerReadResults<Reads>>;
}

export async function runSequentialServerReads<const Reads extends readonly ServerRead[]>(
  reads: Reads,
): Promise<ServerReadResults<Reads>> {
  const results: unknown[] = [];
  for (const read of reads) results.push(await read());
  return results as ServerReadResults<Reads>;
}
