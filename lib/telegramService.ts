/**
 * Telegram Bot Service
 * Sends notifications to Telegram chat rooms
 */

interface TelegramMessage {
  chat_id: string;
  text: string;
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  disable_web_page_preview?: boolean;
}

export class TelegramService {
  private static botToken = process.env.TELEGRAM_BOT_TOKEN;
  private static chatId = process.env.TELEGRAM_TERMINAL_CHAT_ID;

  /**
   * Send a message to the configured Telegram chat
   */
  static async sendMessage(text: string, parseMode: 'HTML' | 'Markdown' = 'HTML'): Promise<boolean> {
    if (!this.botToken || !this.chatId) {
      console.warn('Telegram bot token or chat ID not configured. Skipping notification.');
      return false;
    }

    try {
      const message: TelegramMessage = {
        chat_id: this.chatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: true,
      };

      const response = await fetch(
        `https://api.telegram.org/bot${this.botToken}/sendMessage`,
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
        console.error('Telegram API error:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error sending Telegram message:', error);
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

    const message = `${formName} Form has been submitted.\n<a href="${formUrl}">${formUrl}</a>`;

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
}
