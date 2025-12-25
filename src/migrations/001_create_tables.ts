import { Migration } from '@mikro-orm/migrations';

export class Migration20251225 extends Migration {
  async up(): Promise<void> {
    this.addSql(`CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL
);

CREATE TABLE tracking_links (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    link VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`);
  }

  async down(): Promise<void> {
    this.addSql('DROP TABLE IF EXISTS tracking_links;');
    this.addSql('DROP TABLE IF EXISTS users;');
  }
}
