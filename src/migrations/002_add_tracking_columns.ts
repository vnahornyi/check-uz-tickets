import { Migration } from '@mikro-orm/migrations';

export class Migration20251225AddTrackingColumns extends Migration {
  async up(): Promise<void> {
    this.addSql(`ALTER TABLE tracking_links ADD COLUMN IF NOT EXISTS notified boolean DEFAULT false;`);
    this.addSql(`ALTER TABLE tracking_links ADD COLUMN IF NOT EXISTS last_status boolean;`);
    this.addSql(`ALTER TABLE tracking_links ADD COLUMN IF NOT EXISTS last_checked_at timestamp;`);
  }

  async down(): Promise<void> {
    this.addSql(`ALTER TABLE tracking_links DROP COLUMN IF EXISTS notified;`);
    this.addSql(`ALTER TABLE tracking_links DROP COLUMN IF EXISTS last_status;`);
    this.addSql(`ALTER TABLE tracking_links DROP COLUMN IF EXISTS last_checked_at;`);
  }
}
