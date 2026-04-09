import { createHmac, randomUUID } from 'node:crypto';
import type { StorageService } from '../core/storage.js';

export type WebhookEvent = 'rule.created' | 'rule.updated' | 'manifest.generated' | 'graph.built' | 'health.degraded';

export class WebhookService {
  constructor(private storage: StorageService) {}

  register(url: string, events: string[], repoId?: string, secret?: string) {
    const webhook = {
      id: randomUUID(),
      url,
      events,
      repoId: repoId ?? null,
      secret: secret ?? null,
      active: true,
      createdAt: new Date().toISOString(),
    };
    this.storage.createWebhook(webhook);
    return webhook;
  }

  list() {
    return this.storage.listWebhooks();
  }

  remove(id: string) {
    this.storage.deleteWebhook(id);
  }

  toggle(id: string, active: boolean) {
    this.storage.updateWebhookActive(id, active);
  }

  async fire(event: WebhookEvent, payload: Record<string, unknown>): Promise<void> {
    const webhooks = this.storage.listWebhooks().filter(w => w.active && w.events.includes(event));

    for (const webhook of webhooks) {
      if (webhook.repoId && payload.repoId && webhook.repoId !== payload.repoId) continue;

      const body = JSON.stringify({ event, timestamp: new Date().toISOString(), payload });
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };

      if (webhook.secret) {
        const signature = createHmac('sha256', webhook.secret).update(body).digest('hex');
        headers['X-Cortex-Signature'] = `sha256=${signature}`;
      }

      // Fire and forget with timeout
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);
        await fetch(webhook.url, {
          method: 'POST',
          headers,
          body,
          signal: controller.signal,
        });
        clearTimeout(timeout);
      } catch {
        // Log failure but don't block
      }
    }
  }
}
