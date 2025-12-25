import { Migration } from '@mikro-orm/migrations';

export class Migration20251225AddIgnoreUntil extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "tracking_links" add column "ignore_until" timestamptz null;');
  }

  async down(): Promise<void> {
    this.addSql('alter table "tracking_links" drop column "ignore_until";');
  }
}
