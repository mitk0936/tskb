export class NotificationService {
  async sendEmail(to: string, subject: string, body: string): Promise<void> {
    throw new Error("Not implemented");
  }

  async sendPush(userId: string, message: string): Promise<void> {
    throw new Error("Not implemented");
  }
}
