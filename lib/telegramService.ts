/**
 * Telegram Bot Service
 * Sends notifications to Telegram chat rooms
 */

interface TelegramMessage {
  chat_id: string;
  text: string;
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  disable_web_page_preview?: boolean;
  message_thread_id?: number;
}

export class TelegramService {
  // Read env vars at runtime via getters to avoid serverless caching issues
  private static get botToken() {
    return process.env.TELEGRAM_BOT_TOKEN;
  }

  private static get chatId() {
    return process.env.TELEGRAM_TERMINAL_CHAT_ID;
  }

  private static get threadId() {
    return process.env.TELEGRAM_TERMINAL_THREAD_ID;
  }

  /**
   * Send a message to the configured Telegram chat
   */
  static async sendMessage(text: string, parseMode: 'HTML' | 'Markdown' = 'HTML'): Promise<boolean> {
    const botToken = this.botToken;
    const chatId = this.chatId;
    const threadId = this.threadId;

    if (!botToken || !chatId) {
      console.error('[Telegram] Configuration missing:', {
        hasToken: !!botToken,
        hasChatId: !!chatId,
        tokenPrefix: botToken ? botToken.substring(0, 10) + '...' : 'missing',
        chatId: chatId || 'missing'
      });
      return false;
    }

    try {
      const message: TelegramMessage = {
        chat_id: chatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: false,
      };

      // Add thread ID if configured (for sending to specific topics in groups)
      if (threadId) {
        message.message_thread_id = parseInt(threadId);
      }

      console.log('[Telegram] Sending message:', {
        chatId: chatId,
        threadId: threadId,
        messageLength: text.length,
        parseMode
      });

      const response = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(message),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        console.error('[Telegram] API error:', {
          status: response.status,
          error
        });
        return false;
      }

      const result = await response.json();
      console.log('[Telegram] Message sent successfully:', {
        messageId: result.result?.message_id,
        chatId: result.result?.chat?.id
      });

      return true;
    } catch (error) {
      console.error('[Telegram] Error sending message:', error);
      return false;
    }
  }

  /**
   * Format and send form submission notification
   */
  static async sendFormSubmissionNotification(
    formName: string,
    formId: string,
    submittedBy?: { name?: string; email?: string },
    responseData?: Record<string, any>
  ): Promise<boolean> {
    // Construct the base URL
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
      ? (process.env.NEXT_PUBLIC_BASE_URL.startsWith('http')
          ? process.env.NEXT_PUBLIC_BASE_URL
          : `https://${process.env.NEXT_PUBLIC_BASE_URL}`)
      : (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    const formUrl = `${baseUrl}/forms/${formId}`;

    const message = `${formName} Form has been submitted.\n<a href="${formUrl}">View Form</a>`;

    return this.sendMessage(message);
  }

  /**
   * Send a test message to verify configuration
   */
  static async sendTestMessage(): Promise<boolean> {
    return this.sendMessage(
      '<b>✅ Telegram Bot Connected!</b>\n\nYour Holo Hive form submission notifications are now active.'
    );
  }

  // ============================================
  // WEBHOOK MANAGEMENT
  // ============================================

  /**
   * Register the webhook URL with Telegram
   * Call this once after deploying to set up message tracking
   */
  static async registerWebhook(webhookUrl: string): Promise<{ success: boolean; error?: string }> {
    if (!this.botToken) {
      return { success: false, error: 'TELEGRAM_BOT_TOKEN not configured' };
    }

    try {
      const params: any = {
        url: webhookUrl,
        allowed_updates: ['message', 'edited_message'],
        drop_pending_updates: true // Don't process old messages
      };

      // Add secret token for webhook verification if configured
      const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
      if (webhookSecret) {
        params.secret_token = webhookSecret;
      }

      const response = await fetch(
        `https://api.telegram.org/bot${this.botToken}/setWebhook`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params)
        }
      );

      const result = await response.json();

      if (!result.ok) {
        console.error('[Telegram] Webhook registration failed:', result);
        return { success: false, error: result.description };
      }

      console.log('[Telegram] Webhook registered successfully:', webhookUrl);
      return { success: true };
    } catch (error) {
      console.error('[Telegram] Error registering webhook:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Remove the webhook (stop receiving updates)
   */
  static async deleteWebhook(): Promise<{ success: boolean; error?: string }> {
    if (!this.botToken) {
      return { success: false, error: 'TELEGRAM_BOT_TOKEN not configured' };
    }

    try {
      const response = await fetch(
        `https://api.telegram.org/bot${this.botToken}/deleteWebhook`,
        { method: 'POST' }
      );

      const result = await response.json();

      if (!result.ok) {
        return { success: false, error: result.description };
      }

      console.log('[Telegram] Webhook deleted successfully');
      return { success: true };
    } catch (error) {
      console.error('[Telegram] Error deleting webhook:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Get current webhook info
   */
  static async getWebhookInfo(): Promise<any> {
    if (!this.botToken) {
      return { error: 'TELEGRAM_BOT_TOKEN not configured' };
    }

    try {
      const response = await fetch(
        `https://api.telegram.org/bot${this.botToken}/getWebhookInfo`
      );

      return await response.json();
    } catch (error) {
      console.error('[Telegram] Error getting webhook info:', error);
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Send a message to a specific chat (for CRM integration)
   */
  static async sendToChat(
    chatId: string,
    text: string,
    parseMode: 'HTML' | 'Markdown' = 'HTML'
  ): Promise<boolean> {
    if (!this.botToken) {
      console.error('[Telegram] Bot token not configured');
      return false;
    }

    try {
      const response = await fetch(
        `https://api.telegram.org/bot${this.botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: parseMode
          })
        }
      );

      if (!response.ok) {
        const error = await response.json();
        console.error('[Telegram] Send to chat error:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('[Telegram] Error sending to chat:', error);
      return false;
    }
  }
}
