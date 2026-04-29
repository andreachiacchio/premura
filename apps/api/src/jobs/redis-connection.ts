import IORedis, { type Redis } from 'ioredis';

/**
 * Singleton connection ioredis condivisa da Queue e Worker BullMQ.
 *
 * Scelte di design:
 *  - Singleton: BullMQ accetta sia un'istanza Redis sia opzioni di connessione.
 *    Riusare la stessa istanza evita di aprire connessioni duplicate per ogni
 *    Queue/Worker e tiene basso il count dei socket aperti.
 *  - maxRetriesPerRequest: null e' obbligatorio per i Worker BullMQ. I Worker
 *    usano blocking commands (BRPOPLPUSH) e con il default ioredis (20 retry)
 *    falliscono dopo poco. La policy null e' compatibile anche con le Queue.
 *  - Nessun connect() esplicito: ioredis apre la connessione lazy alla prima
 *    query e BullMQ ne gestisce internamente il ciclo di vita.
 *  - URL da env REDIS_URL con fallback a localhost (allineato a .env.example).
 */
let connection: Redis | null = null;

export function getRedisConnection(): Redis {
  if (!connection) {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    connection = new IORedis(url, {
      maxRetriesPerRequest: null,
    });
  }
  return connection;
}
