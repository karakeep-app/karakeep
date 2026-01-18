import type {
  Queue,
  QueueOptions,
  RunnerFuncs,
  RunnerOptions,
} from "@karakeep/shared/queueing";

import { buildDispatcherService } from "./dispatcher";
import { buildRunnerService } from "./runner";

export interface RestateServicePair<T, R> {
  dispatcher: ReturnType<typeof buildDispatcherService<T, R>>;
  runner: ReturnType<typeof buildRunnerService<T, R>>;
}

export function buildRestateServices<T, R>(
  queue: Queue<T>,
  funcs: RunnerFuncs<T, R>,
  opts: RunnerOptions<T>,
  queueOpts: QueueOptions,
): RestateServicePair<T, R> {
  return {
    dispatcher: buildDispatcherService<T, R>(queue, opts, queueOpts),
    runner: buildRunnerService<T, R>(queue.name(), funcs, opts),
  };
}
