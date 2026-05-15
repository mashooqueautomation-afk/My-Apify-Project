export interface WebhookPayload {
  event: string;
  actorId?: string;
  runId?: string;
  data?: any;
}

export class WebhookDelivery {

  /**
   * Send webhook
   */
  static async send(
    webhookUrl: string,
    payload: WebhookPayload
  ): Promise<void> {

    const response = await fetch(
      webhookUrl,
      {
        method: 'POST',

        headers: {
          'content-type':
            'application/json',
        },

        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {

      throw new Error(
        `Webhook failed: ${response.status}`
      );
    }
  }
}