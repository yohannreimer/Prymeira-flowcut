export type ProgressReporter = {
  info(message: string): void;
  warn(message: string): void;
  poll(message: string): void;
};

export function createProgressReporter(
  input: {
    write?: (line: string) => void;
    now?: () => Date;
    nowMs?: () => number;
    minIntervalMs?: number;
  } = {}
): ProgressReporter {
  const write = input.write ?? ((line) => console.log(line));
  const now = input.now ?? (() => new Date());
  const nowMs = input.nowMs ?? (() => Date.now());
  const minIntervalMs = input.minIntervalMs ?? 10000;
  let lastPollAt = -Infinity;

  const stamp = () => now().toISOString().slice(11, 19);
  const emit = (level: string, message: string) => write(`[${stamp()}] ${level} ${message}`);

  return {
    info: (message) => emit("INFO", message),
    warn: (message) => emit("AVISO", message),
    poll: (message) => {
      const current = nowMs();
      if (current - lastPollAt >= minIntervalMs) {
        lastPollAt = current;
        emit("INFO", message);
      }
    }
  };
}

export const silentProgressReporter: ProgressReporter = {
  info() {},
  warn() {},
  poll() {}
};
