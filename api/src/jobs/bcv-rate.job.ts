import { getConfigValues } from '../lib/config-values';
import { BCV_JOB_INTERVAL_MINUTES, sincronizar } from '../modules/tasas-bcv/tasas-bcv.service';

export { BCV_JOB_INTERVAL_MINUTES };

const INTERVAL_MS = BCV_JOB_INTERVAL_MINUTES * 60_000;
const INITIAL_TICK_DELAY_MS = 5_000;

let interval: NodeJS.Timeout | null = null;
let initialTimer: NodeJS.Timeout | null = null;
let running = false;

/**
 * Runs a single polling tick. Never rejects: a failed sync is logged and
 * swallowed so the process can never crash because of the polling job.
 * The enable/disable flag is resolved on EVERY tick, so toggling it from the
 * UI stops the polling without a restart.
 */
export async function runBcvTickOnce(): Promise<void> {
  if (running) {
    // eslint-disable-next-line no-console
    console.log('[bcv-job] Previous tick still running; skipping this tick');
    return;
  }

  running = true;
  try {
    const config = await getConfigValues();
    if (!config.bcvJobHabilitado) {
      // eslint-disable-next-line no-console
      console.log('[bcv-job] Disabled (bcv.job_habilitado=0); skipping HTTP call');
      return;
    }

    const result = await sincronizar();
    if (result.insertada) {
      // eslint-disable-next-line no-console
      console.log(`[bcv-job] Stored BCV rate usd=${result.tasa?.usd ?? '?'}`);
    } else if (result.motivo === 'duplicado') {
      // eslint-disable-next-line no-console
      console.log('[bcv-job] No new BCV rate (apiId already stored)');
    } else {
      // eslint-disable-next-line no-console
      console.warn(`[bcv-job] Sync failed: ${result.error ?? 'unknown error'}`);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[bcv-job] Unexpected tick error:', err);
  } finally {
    running = false;
  }
}

/** Starts the hourly job with one tick shortly after startup. */
export function startBcvJob(): void {
  if (interval) return;

  // eslint-disable-next-line no-console
  console.log(`[bcv-job] Started BCV hourly job (every ${BCV_JOB_INTERVAL_MINUTES} min)`);
  initialTimer = setTimeout(() => {
    void runBcvTickOnce();
  }, INITIAL_TICK_DELAY_MS);
  interval = setInterval(() => {
    void runBcvTickOnce();
  }, INTERVAL_MS);
}

/** Clears the timers; called from the graceful shutdown path. */
export function stopBcvJob(): void {
  if (initialTimer) {
    clearTimeout(initialTimer);
    initialTimer = null;
  }
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}
